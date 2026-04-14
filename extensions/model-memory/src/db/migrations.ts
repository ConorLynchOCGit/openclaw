import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SqlClient } from "./sql-client.ts";

export type SqlMigrationFile = {
  name: string;
  sql: string;
};

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function listModelMemoryMigrationFiles(): Promise<SqlMigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8"),
    })),
  );
}

export async function applyModelMemoryMigrations(client: SqlClient): Promise<string[]> {
  const applied: string[] = [];
  for (const migration of await listModelMemoryMigrationFiles()) {
    await client.query(migration.sql);
    applied.push(migration.name);
  }
  return applied;
}
