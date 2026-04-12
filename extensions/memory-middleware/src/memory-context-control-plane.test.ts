import { describe, expect, it, vi } from "vitest";
import type {
  MemoryObjectListAcceptedResult,
  MemoryObjectRecord,
  MemoryMiddlewareDb,
} from "./db/runtime.js";
import { createMemoryContextControlPlanePort } from "./memory-context-control-plane.js";

function createApprovedMemoryObject(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Use concise answers.",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function buildAcceptedResult(records: MemoryObjectRecord[]): MemoryObjectListAcceptedResult {
  return {
    accepted: true,
    status: "ok",
    scope: "approved_only",
    records,
  };
}

describe("memory context control plane", () => {
  it("compiles deterministic user and project memory packs", async () => {
    const listMemoryObjects = vi.fn(async ({ kind }: { kind?: string }) => {
      if (kind === "user") {
        return buildAcceptedResult([]);
      }
      if (kind === "feedback") {
        return buildAcceptedResult([
          createApprovedMemoryObject({
            id: "feedback-1",
            content: "Use plain English.",
            metadata: {
              canonicalIngestionCandidate: {
                record: {
                  subject: "response style",
                  statement: "Use plain English.",
                  tags: ["response_style"],
                  facets: {},
                },
                identity: {
                  dedupeKey: "user.response.plain_english",
                },
              },
            },
          }),
        ]);
      }
      if (kind === "project") {
        return buildAcceptedResult([
          createApprovedMemoryObject({
            id: "project-1",
            memoryKind: "project",
            content: "Default branch is main.",
            projectId: "maintenance",
            metadata: {
              canonicalIngestionCandidate: {
                record: {
                  subject: "default branch",
                  statement: "main",
                  tags: ["project_rule"],
                  facets: {
                    projectScope: "maintenance",
                    fieldKey: "default_branch",
                  },
                },
                identity: {
                  dedupeKey: "project.maintenance.default_branch",
                },
              },
            },
          }),
        ]);
      }
      return buildAcceptedResult([]);
    });

    const telemetry = {
      record: vi.fn(async () => {}),
      rootDir: ".local/memory-soak",
    };
    const port = createMemoryContextControlPlanePort({
      db: {
        queries: {
          listMemoryObjects,
        },
      } as unknown as MemoryMiddlewareDb,
      telemetry,
    });

    const result = await port.compilePromptContext({
      prompt:
        "For the maintenance project, check the default branch and explain it in plain English.",
      agentId: "main",
    });

    expect(result).not.toBeNull();
    expect(result?.packs.map((pack) => pack.kind)).toEqual(["user", "project"]);
    expect(result?.text).toContain("## User Memory Pack");
    expect(result?.text).toContain("## Project Memory Pack");
    expect(result?.text).toContain("Use plain English.");
    expect(result?.text).toContain("Default branch is main.");
    expect(result?.packs[0]?.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(result?.packs[1]?.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(telemetry.record).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "orchestration",
        action: "memory_context_pack",
        source: "memory_context_control_plane",
        packCount: 2,
        attachedSlotCount: 2,
      }),
    );
  });

  it("deduplicates overlapping workflow guidance by selection key and keeps the strongest phrasing", async () => {
    const listMemoryObjects = vi.fn(async ({ kind }: { kind?: string }) => {
      if (kind === "feedback") {
        return buildAcceptedResult([
          createApprovedMemoryObject({
            id: "workflow-older",
            content:
              "for commit flow, use scripts/committer instead of manual git add / git commit",
            updatedAt: "2026-04-09T00:00:00.000Z",
            metadata: {
              canonicalIngestionCandidate: {
                record: {
                  kind: "feedback",
                  subject: "commit flow",
                  statement:
                    "for commit flow, use scripts/committer instead of manual git add / git commit",
                  tags: ["feedback", "workflow_guidance", "workflow_improvement"],
                  facets: {
                    subjectKey: "commit_flow",
                    guidancePattern: "use_instead_of",
                    recommendedAction: "scripts/committer",
                    avoidAction: "manual git add / git commit",
                  },
                },
                identity: {
                  subjectKey: "commit_flow",
                },
              },
            },
          }),
          createApprovedMemoryObject({
            id: "workflow-newer",
            content:
              'for commit flow, use scripts/committer "<msg>" <file...>" instead of manual git add / git commit',
            updatedAt: "2026-04-11T00:00:00.000Z",
            metadata: {
              canonicalIngestionCandidate: {
                record: {
                  kind: "feedback",
                  subject: "commit flow",
                  statement:
                    'for commit flow, use scripts/committer "<msg>" <file...>" instead of manual git add / git commit',
                  tags: ["feedback", "workflow_guidance", "workflow_improvement"],
                  facets: {
                    subjectKey: "commit_flow",
                    guidancePattern: "use_instead_of",
                    recommendedAction: 'scripts/committer "<msg>" <file...>',
                    avoidAction: "manual git add / git commit",
                  },
                },
                identity: {
                  subjectKey: "commit_flow",
                },
              },
            },
          }),
        ]);
      }
      return buildAcceptedResult([]);
    });

    const port = createMemoryContextControlPlanePort({
      db: {
        queries: {
          listMemoryObjects,
        },
      } as unknown as MemoryMiddlewareDb,
    });

    const result = await port.compilePromptContext({
      prompt: "Please land this work without manual git add steps.",
      agentId: "main",
    });

    expect(result).not.toBeNull();
    expect(result?.packs).toHaveLength(1);
    expect(result?.packs[0]?.kind).toBe("project");
    expect(result?.text).toContain(
      'For commit flow, use scripts/committer "<msg>" <file...> instead of manual git add / git commit.',
    );
    expect(result?.text).not.toContain(
      "For commit flow, use scripts/committer instead of manual git add / git commit.",
    );
  });
});
