import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemoryMiddlewareDb,
  MemoryObjectListResult,
  MemoryObjectRecord,
} from "./db/runtime.js";
import { syncProjectLocalProjections } from "./native-memory-projection-projects.js";
import { syncSharedBootstrapProjections } from "./native-memory-projection-shared.js";

function createRecord(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "project-1",
    memoryKind: "project",
    reviewState: "approved",
    content: "Project fact [maintenance]: run the daily audit first.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("project local native memory projections", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-native-projects-"));
    await fs.mkdir(path.join(tmpDir, "projects", "maintenance"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "projects", "maintenance", "INDEX.md"),
      "# INDEX.md\n",
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes project-local INDEX projections and surfaces pointers in top-level digest", async () => {
    const listMemoryObjects = vi.fn(async (input: unknown): Promise<MemoryObjectListResult> => {
      const kind = (input as { kind?: string }).kind;
      if (kind === "project") {
        return {
          accepted: true,
          status: "ok",
          scope: "approved_only",
          records: [
            createRecord({
              metadata: {
                canonicalIngestionCandidate: {
                  record: {
                    statement: "Run the daily audit first",
                    subject: "maintenance / audit order",
                    facets: {
                      projectScope: "maintenance",
                    },
                    tags: ["project_fact", "project"],
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
          records: [],
        };
      }
      return {
        accepted: true,
        status: "ok",
        scope: "approved_only",
        records: [],
      };
    });

    const db = {
      driver: "postgres",
      config: { driver: "postgres" as const },
      queries: {
        listMemoryObjects,
      },
    } as unknown as MemoryMiddlewareDb;

    const projects = await syncProjectLocalProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
    });
    const shared = await syncSharedBootstrapProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
      excludeSourceIds: projects.projectedSourceIds,
      extraMemoryDigestItems: projects.pointerItems,
    });

    expect(projects.results).toHaveLength(1);
    expect(
      await fs.readFile(path.join(tmpDir, "projects", "maintenance", "INDEX.md"), "utf-8"),
    ).toContain("Run the daily audit first");
    expect(shared.results.find((entry) => entry.target === "memory-digest")?.selectedCount).toBe(1);
    expect(await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8")).toContain(
      "projects/maintenance/INDEX.md",
    );
  });

  it("reports real but non-allowlisted project folders as intentionally unmatched", async () => {
    await fs.mkdir(path.join(tmpDir, "projects", "experimental_lab"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "projects", "experimental_lab", "INDEX.md"),
      "# INDEX.md\n",
      "utf-8",
    );

    const db = {
      driver: "postgres",
      config: { driver: "postgres" as const },
      queries: {
        listMemoryObjects: vi.fn(
          async (): Promise<MemoryObjectListResult> => ({
            accepted: true,
            status: "ok",
            scope: "approved_only",
            records: [
              createRecord({
                id: "project-x",
                content: "Project fact [experimental_lab]: do not ship this yet.",
                metadata: {
                  canonicalIngestionCandidate: {
                    record: {
                      statement: "Do not ship this yet",
                      subject: "experimental_lab / launch",
                      facets: {
                        projectScope: "experimental_lab",
                      },
                      tags: ["project_fact", "project"],
                    },
                  },
                },
              }),
            ],
          }),
        ),
      },
    } as unknown as MemoryMiddlewareDb;

    const result = await syncProjectLocalProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      projectSlug: "maintenance",
      selectedCount: 0,
      sourceCount: 0,
      relPath: "projects/maintenance/INDEX.md",
    });
    expect(result.unmatched).toEqual([
      { sourceId: "project-x", reason: "project_target_not_allowlisted" },
    ]);
  });

  it("projects agent-scoped project memory into the project-local index", async () => {
    const db = {
      driver: "postgres",
      config: { driver: "postgres" as const },
      queries: {
        listMemoryObjects: vi.fn(
          async (): Promise<MemoryObjectListResult> => ({
            accepted: true,
            status: "ok",
            scope: "approved_only",
            records: [
              createRecord({
                id: "project-agent-1",
                metadata: {
                  candidateMetadata: {
                    autoCapture: {
                      agentExternalKey: "x-manager",
                      projectScope: "maintenance",
                    },
                  },
                  canonicalIngestionCandidate: {
                    record: {
                      statement: "Keep approvals bundled with project status",
                      subject: "maintenance / approvals",
                      facets: {
                        projectScope: "maintenance",
                      },
                      tags: ["project_fact", "project"],
                    },
                  },
                },
              }),
            ],
          }),
        ),
      },
    } as unknown as MemoryMiddlewareDb;

    const result = await syncProjectLocalProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
    });

    expect(result.results).toHaveLength(1);
    expect(
      await fs.readFile(path.join(tmpDir, "projects", "maintenance", "INDEX.md"), "utf-8"),
    ).toContain("Keep approvals bundled with project status");
  });

  it("prepares an empty project-local projection block even when no project memory is eligible", async () => {
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

    const result = await syncProjectLocalProjections({
      db,
      workspaceDir: tmpDir,
      write: true,
    });

    expect(result.results).toHaveLength(1);
    expect(result.pointerItems).toEqual([]);
    expect(
      await fs.readFile(path.join(tmpDir, "projects", "maintenance", "INDEX.md"), "utf-8"),
    ).toContain("No eligible approved memory is currently projected.");
  });
});
