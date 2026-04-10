import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemoryMiddlewareDb,
  MemoryObjectListResult,
  MemoryObjectRecord,
} from "./db/runtime.js";
import { syncAgentBootstrapProjections } from "./native-memory-projection-agents.js";

function createRecord(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Use current-session retrieval evidence.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("agent native memory projections", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-agents-"));
    await fs.mkdir(path.join(tmpDir, "workspace"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "agent-workspaces", "x-manager"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "agent-workspaces", "web-researcher"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "agent-workspaces", "builder"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "agent-workspaces", "x-manager", "AGENTS.md"),
      "# X Manager Workspace\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tmpDir, "agent-workspaces", "web-researcher", "AGENTS.md"),
      "# Web Researcher Workspace\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tmpDir, "agent-workspaces", "builder", "AGENTS.md"),
      "# AGENTS.md - Your Workspace\n",
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("projects only into the allowlisted specialized agent workspaces", async () => {
    const listMemoryObjects = vi.fn(async (input: unknown): Promise<MemoryObjectListResult> => {
      const kind = (input as { kind?: string }).kind;
      if (kind === "user") {
        return {
          accepted: true,
          status: "ok",
          scope: "approved_only",
          records: [
            createRecord({
              id: "x-user-1",
              memoryKind: "user",
              metadata: {
                candidateMetadata: {
                  autoCapture: {
                    agentExternalKey: "x-manager",
                  },
                },
                canonicalIngestionCandidate: {
                  record: {
                    statement: "Keep Conor Lynch and American Atomics voices separate",
                    tags: ["user", "preference"],
                  },
                },
              },
            }),
            createRecord({
              id: "web-user-1",
              memoryKind: "user",
              metadata: {
                candidateMetadata: {
                  autoCapture: {
                    agentExternalKey: "web-researcher",
                  },
                },
                canonicalIngestionCandidate: {
                  record: {
                    statement: "Prefer evidence packages with direct citations",
                    tags: ["user", "preference"],
                  },
                },
              },
            }),
          ],
        };
      }
      return {
        accepted: true,
        status: "ok",
        scope: "approved_only",
        records: [
          createRecord({
            id: "x-feedback-1",
            metadata: {
              candidateMetadata: {
                autoCapture: {
                  agentExternalKey: "x-manager",
                },
              },
              canonicalIngestionCandidate: {
                record: {
                  statement: "Default to do_not_engage unless the opening is clearly high-signal",
                  tags: ["workflow_guidance", "feedback"],
                },
              },
            },
          }),
          createRecord({
            id: "builder-feedback-1",
            metadata: {
              candidateMetadata: {
                autoCapture: {
                  agentExternalKey: "builder",
                },
              },
              canonicalIngestionCandidate: {
                record: {
                  statement: "This should not land in a generic workspace",
                  tags: ["workflow_guidance", "feedback"],
                },
              },
            },
          }),
          createRecord({
            id: "web-feedback-1",
            metadata: {
              candidateMetadata: {
                autoCapture: {
                  agentExternalKey: "web-researcher",
                },
              },
              canonicalIngestionCandidate: {
                record: {
                  statement: "Treat visible requested facts as strict required fields",
                  tags: ["workflow_guidance", "feedback"],
                },
              },
            },
          }),
        ],
      };
    });

    const db = {
      driver: "postgres",
      config: { driver: "postgres" as const },
      queries: {
        listMemoryObjects,
      },
    } as unknown as MemoryMiddlewareDb;

    const result = await syncAgentBootstrapProjections({
      db,
      sharedWorkspaceDir: path.join(tmpDir, "workspace"),
      write: true,
    });

    expect(result.results).toHaveLength(4);
    expect(result.results.map((entry) => entry.agentKey)).toEqual([
      "web-researcher",
      "web-researcher",
      "x-manager",
      "x-manager",
    ]);
    expect(
      await fs.readFile(path.join(tmpDir, "agent-workspaces", "x-manager", "USER.md"), "utf-8"),
    ).toContain("Keep Conor Lynch and American Atomics voices separate");
    expect(
      await fs.readFile(path.join(tmpDir, "agent-workspaces", "x-manager", "TOOLS.md"), "utf-8"),
    ).toContain("do_not_engage");
    expect(
      await fs.readFile(
        path.join(tmpDir, "agent-workspaces", "web-researcher", "USER.md"),
        "utf-8",
      ),
    ).toContain("Prefer evidence packages with direct citations");
    expect(
      await fs.readFile(
        path.join(tmpDir, "agent-workspaces", "web-researcher", "TOOLS.md"),
        "utf-8",
      ),
    ).toContain("strict required fields");
    await expect(
      fs.readFile(path.join(tmpDir, "agent-workspaces", "builder", "TOOLS.md"), "utf-8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.skipped).toContainEqual({
      sourceId: "builder-feedback-1",
      reason: "no_specialized_agent_workspace_target",
      scopeKind: "agent",
      agentKey: "builder",
    });
  });

  it("prepares empty generated blocks for allowlisted specialized agents even without records", async () => {
    const db = {
      driver: "postgres",
      config: { driver: "postgres" as const },
      queries: {
        listMemoryObjects: vi.fn(
          async (): Promise<MemoryObjectListResult> => ({
            accepted: true,
            status: "ok",
            scope: "approved_only",
            records: [],
          }),
        ),
      },
    } as unknown as MemoryMiddlewareDb;

    const result = await syncAgentBootstrapProjections({
      db,
      sharedWorkspaceDir: path.join(tmpDir, "workspace"),
      write: true,
    });

    expect(result.results).toHaveLength(4);
    expect(
      await fs.readFile(
        path.join(tmpDir, "agent-workspaces", "web-researcher", "USER.md"),
        "utf-8",
      ),
    ).toContain("No eligible approved memory is currently projected.");
  });
});
