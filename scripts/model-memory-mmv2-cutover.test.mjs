import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs, runCutover } from "./model-memory-mmv2-cutover.mjs";

const createdDirs = [];

afterEach(async () => {
  for (const dir of createdDirs.splice(0)) {
    await import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }));
  }
});

function buildModules() {
  const rows = new Map();
  for (const table of [
    "model_memory.memory_support_items",
    "model_memory.supersession_links",
    "model_memory.write_events",
    "model_memory.memory_objects",
    "model_memory.source_windows",
    "model_memory.sources",
    "model_memory.ingest_segments",
    "model_memory.ingest_sources",
    "model_memory.memory_edges",
    "model_memory.memory_events",
    "model_memory.durable_memories",
  ]) {
    rows.set(table, 0);
  }
  for (const table of [
    "runtime_context.context_run_segments",
    "runtime_context.context_runs",
    "runtime_context.retrieval_result_items",
    "runtime_context.retrieval_result_sets",
    "runtime_context.retrieval_requests",
    "runtime_context.workspace_projection_versions",
    "runtime_context.workspace_projection_targets",
    "runtime_context.context_artifacts",
    "runtime_context.session_context_state",
    "runtime_context.active_memory_sets",
    "runtime_context.active_memory_slots",
  ]) {
    rows.set(table, 0);
  }

  const sqlClient = {
    async query(text) {
      if (text.includes("information_schema.tables")) {
        return {
          rows: Array.from(rows.keys()).map((table) => {
            const [table_schema, table_name] = table.split(".");
            return { table_schema, table_name };
          }),
        };
      }
      const match = text.match(/FROM\s+([a-z_]+\.[a-z_]+)/i);
      if (match) {
        return { rows: [{ count: rows.get(match[1]) ?? 0 }] };
      }
      return { rows: [] };
    },
    async withTransaction(work) {
      return work(sqlClient);
    },
  };

  return {
    loadConfig() {
      return {};
    },
    resolveModelMemoryDatabaseResolution() {
      return {
        connectionString: "postgres://user:pass@127.0.0.1:5432/model_memory",
        databaseName: "model_memory",
        source: "env:MODEL_MEMORY_DATABASE_URL",
      };
    },
    createModelMemorySqlClientFromConnectionString() {
      return {
        pool: {
          async end() {},
        },
        sqlClient,
      };
    },
    async applyModelMemoryMigrations() {
      return [
        "0001_model_memory_init.sql",
        "0002_model_memory_support_items.sql",
        "0003_model_memory_mmv2_native_storage.sql",
      ];
    },
    MmV2NativeRepository: function MmV2NativeRepository() {},
    RuntimeContextRepository: function RuntimeContextRepository() {},
    async rebuildDerivedRuntimeState() {
      return {};
    },
    resolveModelMemoryStorageEngine() {
      return "mmv2";
    },
  };
}

function buildExecFileStub() {
  return async (_command, args) => {
    if (args[0] === "rev-parse") {
      return { stdout: "deadbeef\n", stderr: "" };
    }
    if (args[0] === "status") {
      return { stdout: "## main...origin/main\n", stderr: "" };
    }
    if (args[0] === "inspect") {
      return { stdout: JSON.stringify({ Running: false }), stderr: "" };
    }
    if (args[0] === "--schema-only") {
      const fileIndex = args.indexOf("--file");
      await writeFile(args[fileIndex + 1], "-- schema snapshot\n", "utf8");
      return { stdout: "", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
}

describe("model-memory-mmv2-cutover", () => {
  it("parses destructive flags explicitly", () => {
    expect(parseArgs(["--execute", "--yes"]).execute).toBe(true);
    expect(parseArgs(["--execute", "--yes"]).yes).toBe(true);
  });

  it("runs in dry-run mode by default and writes an archive manifest", async () => {
    const archiveRoot = await mkdtemp(path.join(os.tmpdir(), "mmv2-cutover-"));
    createdDirs.push(archiveRoot);
    const result = await runCutover(
      {
        execute: false,
        yes: false,
        archiveRoot,
        repoRoot: path.resolve("."),
        composeService: "openclaw-gateway",
        containerName: "openclaw-runtime",
      },
      {
        execFile: buildExecFileStub(),
        modules: buildModules(),
      },
    );

    const manifest = JSON.parse(
      await readFile(path.join(result.archiveDir, "manifest.json"), "utf8"),
    );
    expect(manifest.mode).toBe("dry_run");
    expect(result.resetSql).toContain("DROP TABLE IF EXISTS model_memory.memory_support_items");
  });

  it("requires --yes for destructive execution", async () => {
    const archiveRoot = await mkdtemp(path.join(os.tmpdir(), "mmv2-cutover-"));
    createdDirs.push(archiveRoot);
    await expect(
      runCutover(
        {
          execute: true,
          yes: false,
          archiveRoot,
          repoRoot: path.resolve("."),
          composeService: "openclaw-gateway",
          containerName: "openclaw-runtime",
        },
        {
          execFile: buildExecFileStub(),
          modules: buildModules(),
        },
      ),
    ).rejects.toThrow("--yes");
  });

  it("refuses destructive execution while the runtime container is still running", async () => {
    const archiveRoot = await mkdtemp(path.join(os.tmpdir(), "mmv2-cutover-"));
    createdDirs.push(archiveRoot);
    await expect(
      runCutover(
        {
          execute: true,
          yes: true,
          archiveRoot,
          repoRoot: path.resolve("."),
          composeService: "openclaw-gateway",
          containerName: "openclaw-runtime",
        },
        {
          execFile: async (_command, args) => {
            if (args[0] === "rev-parse") {
              return { stdout: "deadbeef\n", stderr: "" };
            }
            if (args[0] === "status") {
              return { stdout: "## main...origin/main\n", stderr: "" };
            }
            if (args[0] === "inspect") {
              return { stdout: JSON.stringify({ Running: true }), stderr: "" };
            }
            if (args[0] === "--schema-only") {
              const fileIndex = args.indexOf("--file");
              await writeFile(args[fileIndex + 1], "-- schema snapshot\n", "utf8");
              return { stdout: "", stderr: "" };
            }
            return { stdout: "", stderr: "" };
          },
          modules: buildModules(),
        },
      ),
    ).rejects.toThrow("still running");
  });
});
