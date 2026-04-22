import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SqlClient } from "./sql-client.ts";

export type SqlMigrationFile = {
  name: string;
  sql: string;
};

const MIGRATION_TRACKER_TABLE = "model_memory.schema_migrations";
const LEGACY_MIGRATION_BASELINE = {
  "0001_model_memory_init.sql": {
    tables: [
      "model_memory.sources",
      "model_memory.source_windows",
      "model_memory.memory_objects",
      "runtime_context.active_memory_slots",
      "runtime_context.active_memory_sets",
    ],
  },
  "0002_model_memory_support_items.sql": {
    tables: ["model_memory.memory_support_items"],
  },
  "0003_model_memory_mmv2_native_storage.sql": {
    tables: [
      "model_memory.ingest_sources",
      "model_memory.ingest_segments",
      "model_memory.durable_memories",
      "model_memory.memory_events",
      "model_memory.memory_edges",
    ],
  },
} as const;

async function existingDirectory(urls: URL[]): Promise<URL> {
  for (const url of urls) {
    try {
      await access(url);
      return url;
    } catch {
      continue;
    }
  }
  throw new Error(
    `model-memory migrations directory not found; tried ${urls.map((url) => fileURLToPath(url)).join(", ")}`,
  );
}

export async function resolveModelMemoryMigrationsDir(
  baseUrl: string = import.meta.url,
  cwd: string = process.cwd(),
): Promise<URL> {
  return existingDirectory([
    new URL("../../migrations/", baseUrl),
    new URL("../extensions/model-memory/migrations/", baseUrl),
    pathToFileURL(join(cwd, "extensions/model-memory/migrations/")),
  ]);
}

export async function listModelMemoryMigrationFiles(): Promise<SqlMigrationFile[]> {
  const migrationsDir = await resolveModelMemoryMigrationsDir();
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(new URL(name, migrationsDir), "utf8"),
    })),
  );
}

async function ensureMigrationTracker(client: SqlClient): Promise<void> {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS model_memory;
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TRACKER_TABLE} (
      migration_name text,
      applied_at timestamptz
    );
  `);
}

async function readAppliedMigrations(client: SqlClient): Promise<Set<string>> {
  const result = await client.query<{ migration_name: string }>(
    `SELECT migration_name FROM ${MIGRATION_TRACKER_TABLE}`,
  );
  return new Set(result.rows.map((row) => row.migration_name));
}

async function collectExistingTableNames(client: SqlClient): Promise<Set<string>> {
  const result = await client.query<{ table_schema: string; table_name: string }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('model_memory', 'runtime_context')
  `);
  return new Set(result.rows.map((row) => `${row.table_schema}.${row.table_name}`));
}

async function collectColumnTypeByName(
  client: SqlClient,
): Promise<Map<string, { dataType: string; udtName: string }>> {
  const result = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(`
    SELECT table_schema, table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema IN ('model_memory', 'runtime_context')
  `);
  const entries = result.rows.map(
    (row) =>
      [
        `${row.table_schema}.${row.table_name}.${row.column_name}`,
        {
          dataType: row.data_type,
          udtName: row.udt_name,
        },
      ] as const,
  );
  return new Map(entries);
}

async function detectPreTrackerAppliedMigrations(client: SqlClient): Promise<Set<string>> {
  const applied = new Set<string>();
  const tableNames = await collectExistingTableNames(client);

  for (const [migrationName, baseline] of Object.entries(LEGACY_MIGRATION_BASELINE)) {
    if (baseline.tables.every((tableName) => tableNames.has(tableName))) {
      applied.add(migrationName);
    }
  }

  const columnTypes = await collectColumnTypeByName(client);
  const runtimeIdsAreText =
    columnTypes.get("runtime_context.active_memory_slots.current_object_id")?.dataType === "text" &&
    columnTypes.get("runtime_context.active_memory_sets.memory_object_id")?.dataType === "text" &&
    columnTypes.get("runtime_context.retrieval_result_items.memory_object_id")?.dataType ===
      "text" &&
    columnTypes.get("runtime_context.context_artifacts.source_object_ids")?.udtName === "_text" &&
    columnTypes.get("runtime_context.workspace_projection_versions.source_object_ids")?.udtName ===
      "_text";
  if (runtimeIdsAreText) {
    applied.add("0004_model_memory_runtime_context_text_ids.sql");
  }

  return applied;
}

async function recordAppliedMigration(client: SqlClient, migrationName: string): Promise<void> {
  await client.query(
    `
      INSERT INTO ${MIGRATION_TRACKER_TABLE} (migration_name, applied_at)
      SELECT $1, $2::timestamptz
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${MIGRATION_TRACKER_TABLE}
        WHERE migration_name = $1
      )
    `,
    [migrationName, new Date()],
  );
}

export async function applyModelMemoryMigrations(client: SqlClient): Promise<string[]> {
  await ensureMigrationTracker(client);
  const applied: string[] = [];
  const alreadyApplied = await readAppliedMigrations(client);
  if (alreadyApplied.size === 0) {
    for (const migrationName of await detectPreTrackerAppliedMigrations(client)) {
      await recordAppliedMigration(client, migrationName);
      alreadyApplied.add(migrationName);
    }
  }

  for (const migration of await listModelMemoryMigrationFiles()) {
    if (alreadyApplied.has(migration.name)) {
      applied.push(migration.name);
      continue;
    }
    await client.query(migration.sql);
    await recordAppliedMigration(client, migration.name);
    alreadyApplied.add(migration.name);
    applied.push(migration.name);
  }
  return applied;
}
