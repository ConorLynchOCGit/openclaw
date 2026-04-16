import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SqlClient } from "./sql-client.ts";

export type SqlMigrationFile = {
  name: string;
  sql: string;
};

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
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(new URL(name, migrationsDir), "utf8"),
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
