#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const execFile = promisify(execFileCallback);

const LEGACY_TABLES = [
  "model_memory.memory_support_items",
  "model_memory.supersession_links",
  "model_memory.write_events",
  "model_memory.memory_objects",
  "model_memory.source_windows",
  "model_memory.sources",
];

const MMV2_TABLES = [
  "model_memory.ingest_segments",
  "model_memory.ingest_sources",
  "model_memory.memory_edges",
  "model_memory.memory_events",
  "model_memory.durable_memories",
];

const RUNTIME_CONTEXT_TABLES = [
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
];

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseArgs(argv) {
  return {
    execute: argv.includes("--execute"),
    yes: argv.includes("--yes"),
    archiveRoot: readArgValue(argv, "--archive-root") ?? "/root/backups/model-memory-mmv2-cutover",
    fullBackupPath: readArgValue(argv, "--full-backup-path"),
    repoRoot: readArgValue(argv, "--repo-root") ?? getRepoRoot(),
    composeService: readArgValue(argv, "--compose-service") ?? "openclaw-gateway",
    containerName: readArgValue(argv, "--container-name") ?? "openclaw-runtime",
  };
}

async function latestFullBackupPath(root) {
  try {
    const entries = await readdir(root);
    const resolved = await Promise.all(
      entries.map(async (entry) => {
        const absolute = path.join(root, entry, "runtime-postgres.dump");
        try {
          const details = await stat(absolute);
          return { absolute, mtimeMs: details.mtimeMs };
        } catch {
          return null;
        }
      }),
    );
    return resolved.filter(Boolean).toSorted((left, right) => right.mtimeMs - left.mtimeMs)[0]
      ?.absolute;
  } catch {
    return undefined;
  }
}

async function readGitHead(repoRoot, deps) {
  try {
    const { stdout } = await deps.execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function readGitStatus(repoRoot, deps) {
  try {
    const { stdout } = await deps.execFile("git", ["status", "--short", "--branch"], {
      cwd: repoRoot,
    });
    return stdout;
  } catch {
    return "";
  }
}

async function readServiceState(containerName, deps) {
  try {
    const { stdout } = await deps.execFile(
      "docker",
      ["inspect", "-f", "{{json .State}}", containerName],
      {},
    );
    const parsed = JSON.parse(stdout.trim());
    return {
      exists: true,
      running: parsed?.Running === true,
      raw: parsed,
    };
  } catch {
    return {
      exists: false,
      running: false,
      raw: null,
    };
  }
}

function toPgToolConnectionString(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

async function schemaOnlyDump({ connectionString, outputPath }, deps) {
  const pgToolConnectionString = toPgToolConnectionString(connectionString);
  try {
    await deps.execFile(
      "pg_dump",
      [
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        pgToolConnectionString,
        "--schema",
        "model_memory",
        "--schema",
        "runtime_context",
        "--file",
        outputPath,
      ],
      {},
    );
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const clientImage = process.env.OPENCLAW_POSTGRES_CLIENT_IMAGE ?? "postgres:17-alpine";
  const outputDir = path.dirname(outputPath);
  const outputFile = path.basename(outputPath);
  await deps.execFile(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      `DATABASE_URL=${pgToolConnectionString}`,
      "-v",
      `${outputDir}:/backup`,
      clientImage,
      "sh",
      "-lc",
      [
        "pg_dump",
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        '--dbname="$DATABASE_URL"',
        "--schema=model_memory",
        "--schema=runtime_context",
        `--file=/backup/${outputFile}`,
      ].join(" "),
    ],
    {},
  );
}

async function collectTableCounts(sqlClient, tables) {
  const counts = {};
  for (const tableName of tables) {
    try {
      const result = await sqlClient.query(`SELECT COUNT(*)::bigint AS count FROM ${tableName}`);
      counts[tableName] = Number(result.rows[0]?.count ?? 0);
    } catch (error) {
      counts[tableName] = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return counts;
}

async function collectTableInventory(sqlClient) {
  const result = await sqlClient.query(
    `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('model_memory', 'runtime_context')
      ORDER BY table_schema, table_name
    `,
  );
  return result.rows.map((row) => `${row.table_schema}.${row.table_name}`);
}

export function buildResetSql() {
  return [
    `TRUNCATE ${RUNTIME_CONTEXT_TABLES.join(", ")} RESTART IDENTITY CASCADE;`,
    `DROP TABLE IF EXISTS ${LEGACY_TABLES.join(", ")} CASCADE;`,
    `TRUNCATE ${MMV2_TABLES.join(", ")} RESTART IDENTITY CASCADE;`,
  ].join("\n");
}

export async function runCutover(args, depsInput = {}) {
  const deps = {
    execFile,
    now: () => new Date(),
    ...depsInput,
  };

  const modules = deps.modules ?? {
    ...(await tsImport(path.join(args.repoRoot, "src/config/config.ts"), import.meta.url)),
    ...(await tsImport(
      path.join(args.repoRoot, "src/agents/model-memory.database.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/db/pg-runtime.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/db/migrations.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/db/mmv2-native-repository.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/db/runtime-context-repository.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/runtime-rebuild-orchestrator.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(args.repoRoot, "extensions/model-memory/src/storage-engine.ts"),
      import.meta.url,
    )),
  };
  const {
    resolveModelMemoryDatabaseResolution,
    loadConfig,
    createModelMemorySqlClientFromConnectionString,
    applyModelMemoryMigrations,
    MmV2NativeRepository,
    RuntimeContextRepository,
    rebuildDerivedRuntimeState,
    resolveModelMemoryStorageEngine,
  } = modules;

  const config = typeof loadConfig === "function" ? loadConfig() : undefined;
  const resolution = resolveModelMemoryDatabaseResolution({ config });
  const storageEngine = resolveModelMemoryStorageEngine(config, process.env);
  const backupPath =
    args.fullBackupPath ?? (await latestFullBackupPath("/root/backups/postgres-runtime"));
  const startedAt = deps.now();
  const timestamp = startedAt.toISOString().replaceAll(":", "").replaceAll(".", "-");
  const archiveDir = path.join(args.archiveRoot, timestamp);
  await mkdir(archiveDir, { recursive: true });

  const composeText = await readFile(path.join(args.repoRoot, "docker-compose.yml"), "utf8");
  const composeChecks = {
    hasService: composeText.includes(`${args.composeService}:`),
    hasContainerName: composeText.includes(`container_name: ${args.containerName}`),
  };
  if (!composeChecks.hasService || !composeChecks.hasContainerName) {
    throw new Error(
      `compose boundary validation failed for service=${args.composeService} container=${args.containerName}`,
    );
  }

  const serviceState = await readServiceState(args.containerName, deps);
  const { pool, sqlClient } = createModelMemorySqlClientFromConnectionString(
    resolution.connectionString,
  );

  try {
    const migrationNames = await applyModelMemoryMigrations(sqlClient);
    const legacyInventory = await collectTableCounts(sqlClient, LEGACY_TABLES);
    const mmv2Inventory = await collectTableCounts(sqlClient, MMV2_TABLES);
    const runtimeInventory = await collectTableCounts(sqlClient, RUNTIME_CONTEXT_TABLES);
    const tableInventory = await collectTableInventory(sqlClient);
    const gitHead = await readGitHead(args.repoRoot, deps);
    const gitStatus = await readGitStatus(args.repoRoot, deps);
    const schemaPath = path.join(archiveDir, "schema.sql");
    await schemaOnlyDump(
      { connectionString: resolution.connectionString, outputPath: schemaPath },
      deps,
    );

    const manifest = {
      mode: args.execute ? "execute" : "dry_run",
      startedAt: startedAt.toISOString(),
      repoRoot: args.repoRoot,
      gitHead,
      gitStatus,
      storageEngine,
      database: {
        source: resolution.source,
        databaseName: resolution.databaseName,
      },
      compose: {
        service: args.composeService,
        containerName: args.containerName,
        ...composeChecks,
        serviceState,
      },
      migrations: {
        applied: migrationNames,
        requiresMmV2Migration: migrationNames.includes("0003_model_memory_mmv2_native_storage.sql"),
      },
      legacyTableCounts: legacyInventory,
      mmv2TableCounts: mmv2Inventory,
      runtimeContextCounts: runtimeInventory,
      tableInventory,
      schemaSnapshotPath: schemaPath,
      canonicalFullBackupPath: backupPath ?? null,
    };

    await writeFile(
      path.join(archiveDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(path.join(archiveDir, "git-status.txt"), gitStatus, "utf8");

    if (!args.execute) {
      return {
        archiveDir,
        manifest,
        resetSql: buildResetSql(),
      };
    }

    if (!args.yes) {
      throw new Error("Destructive execution requires --yes.");
    }
    if (serviceState.running) {
      throw new Error(`Refusing destructive cutover while ${args.containerName} is still running.`);
    }
    if (storageEngine !== "mmv2") {
      throw new Error(
        `Refusing destructive cutover while MODEL_MEMORY_STORAGE_ENGINE resolves to ${storageEngine}.`,
      );
    }
    if (!manifest.migrations.requiresMmV2Migration) {
      throw new Error("MMV2 native migration 0003 is not present/applied.");
    }

    await sqlClient.withTransaction(async (tx) => {
      await tx.query(buildResetSql());
    });

    const mmv2Repository = new MmV2NativeRepository(sqlClient);
    const runtimeRepository = new RuntimeContextRepository(sqlClient);
    await rebuildDerivedRuntimeState({
      canonicalRepository: mmv2Repository,
      runtimeRepository,
    });

    const postState = {
      legacyTableCounts: await collectTableCounts(sqlClient, LEGACY_TABLES),
      mmv2TableCounts: await collectTableCounts(sqlClient, MMV2_TABLES),
      runtimeContextCounts: await collectTableCounts(sqlClient, RUNTIME_CONTEXT_TABLES),
    };
    await writeFile(
      path.join(archiveDir, "post-cutover-state.json"),
      `${JSON.stringify(postState, null, 2)}\n`,
      "utf8",
    );

    return {
      archiveDir,
      manifest,
      postState,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runCutover(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
