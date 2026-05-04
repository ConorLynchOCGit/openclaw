import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SqlClient } from "./sql-client.ts";

export type SqlMigrationFile = {
  name: string;
  sql: string;
};

const MIGRATION_TRACKER_TABLE = "execution_platform.schema_migrations";

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
    `execution-platform migrations directory not found; tried ${urls.map((url) => fileURLToPath(url)).join(", ")}`,
  );
}

export async function resolveExecutionPlatformMigrationsDir(
  baseUrl: string = import.meta.url,
  cwd: string = process.cwd(),
): Promise<URL> {
  return existingDirectory([
    new URL("../../migrations/", baseUrl),
    new URL("../extensions/execution-platform/migrations/", baseUrl),
    pathToFileURL(join(cwd, "extensions/execution-platform/migrations/")),
  ]);
}

export async function listExecutionPlatformMigrationFiles(): Promise<SqlMigrationFile[]> {
  const migrationsDir = await resolveExecutionPlatformMigrationsDir();
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
    CREATE SCHEMA IF NOT EXISTS execution_platform;
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TRACKER_TABLE} (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL
    );
  `);
}

async function readAppliedMigrations(client: SqlClient): Promise<Set<string>> {
  const result = await client.query<{ migration_name: string }>(
    `SELECT migration_name FROM ${MIGRATION_TRACKER_TABLE}`,
  );
  return new Set(result.rows.map((row) => row.migration_name));
}

async function recordAppliedMigration(client: SqlClient, migrationName: string): Promise<void> {
  await client.query(
    `
      INSERT INTO ${MIGRATION_TRACKER_TABLE} (migration_name, applied_at)
      VALUES ($1, $2::timestamptz)
      ON CONFLICT (migration_name) DO NOTHING
    `,
    [migrationName, new Date()],
  );
}

export async function applyExecutionPlatformMigrations(client: SqlClient): Promise<string[]> {
  await ensureMigrationTracker(client);
  const applied: string[] = [];
  const alreadyApplied = await readAppliedMigrations(client);

  for (const migration of await listExecutionPlatformMigrationFiles()) {
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
