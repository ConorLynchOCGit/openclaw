import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemoryMiddlewareDb,
  MemoryObjectListResult,
  MemoryObjectRecord,
} from "./db/runtime.js";
import { syncSharedBootstrapProjections } from "./native-memory-projection-shared.js";

function createRecord(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Use concise answers.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    ...overrides,
  };
}

describe("shared native memory projections", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-shared-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes shared USER/TOOLS/MEMORY projection blocks", async () => {
    const listMemoryObjects = vi.fn(async (input: unknown): Promise<MemoryObjectListResult> => {
      const kind = (input as { kind?: string }).kind;
      if (kind === "user") {
        return {
          accepted: true,
          status: "ok",
          scope: "approved_only",
          records: [
            createRecord({
              id: "user-1",
              memoryKind: "user",
              metadata: {
                canonicalIngestionCandidate: {
                  record: {
                    statement: "Prefer concise answers",
                    tags: ["user", "preference"],
                  },
                },
              },
            }),
          ],
        };
      }
      if (kind === "feedback") {
        return {
          accepted: true,
          status: "ok",
          scope: "approved_only",
          records: [
            createRecord({
              id: "feedback-1",
              memoryKind: "feedback",
              metadata: {
                canonicalIngestionCandidate: {
                  record: {
                    statement: "Run pnpm check:fast before landing docs-only changes",
                    tags: ["workflow_guidance", "feedback"],
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
            id: "project-1",
            memoryKind: "project",
            metadata: {
              canonicalIngestionCandidate: {
                record: {
                  statement: "docs/zh-CN stays generated",
                  tags: ["project_fact", "project"],
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

    const results = await syncSharedBootstrapProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
    });

    expect(results).toHaveLength(3);
    expect(await fs.readFile(path.join(tmpDir, "USER.md"), "utf-8")).toContain(
      "Prefer concise answers",
    );
    expect(await fs.readFile(path.join(tmpDir, "TOOLS.md"), "utf-8")).toContain("pnpm check:fast");
    expect(await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8")).toContain(
      "docs/zh-CN stays generated",
    );
  });
});
