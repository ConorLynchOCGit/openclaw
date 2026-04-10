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
    await fs.mkdir(path.join(tmpDir, "agent-workspaces", "builder"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "agent-workspaces", "x-manager", "AGENTS.md"),
      "# X Manager Workspace\n",
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

  it("projects only into specialized agent workspaces", async () => {
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

    expect(result.results).toHaveLength(2);
    expect(result.results.every((entry) => entry.agentKey === "x-manager")).toBe(true);
    expect(
      await fs.readFile(path.join(tmpDir, "agent-workspaces", "x-manager", "USER.md"), "utf-8"),
    ).toContain("Keep Conor Lynch and American Atomics voices separate");
    expect(
      await fs.readFile(path.join(tmpDir, "agent-workspaces", "x-manager", "TOOLS.md"), "utf-8"),
    ).toContain("do_not_engage");
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
});
