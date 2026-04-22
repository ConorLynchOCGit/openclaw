import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUNTIME_CONTEXT_TABLE_CONTRACTS } from "../runtime-read-models.ts";
import { CANONICAL_TABLE_CONTRACTS } from "../storage-database-contract.ts";
import {
  applyModelMemoryMigrations,
  listModelMemoryMigrationFiles,
  resolveModelMemoryMigrationsDir,
} from "./migrations.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";

async function readColumnNames(
  database: Awaited<ReturnType<typeof createPgMemTestDatabase>>,
  schemaName: string,
  tableName: string,
) {
  return Array.from(
    database.db.getSchema(schemaName).getTable(tableName).getColumns(),
    (column) => column.name,
  );
}

function rerunnableSupportTail(sql: string) {
  const anchor =
    "ALTER TABLE model_memory.memory_objects\n  ADD COLUMN IF NOT EXISTS source_window_id";
  const tail = sql.slice(sql.indexOf(anchor));
  if (tail.length === 0) {
    throw new Error("expected support-item migration tail to be present");
  }
  return tail;
}

describe("model-memory migrations", () => {
  it("loads ordered package-local sql migrations", async () => {
    const migrations = await listModelMemoryMigrationFiles();
    expect(migrations.map((entry) => entry.name)).toEqual([
      "0001_model_memory_init.sql",
      "0002_model_memory_support_items.sql",
      "0003_model_memory_mmv2_native_storage.sql",
      "0004_model_memory_runtime_context_text_ids.sql",
      "0005_model_memory_schema_migrations.sql",
    ]);
    expect(migrations[0]?.sql).toContain("CREATE SCHEMA IF NOT EXISTS model_memory");
  });

  it("resolves package-local migrations from bundled dist entrypoints", async () => {
    const resolved = await resolveModelMemoryMigrationsDir(
      "file:///app/dist/reply-example.js",
      fileURLToPath(new URL("../../../../", import.meta.url)),
    );
    expect(fileURLToPath(resolved)).toMatch(/extensions\/model-memory\/migrations\/?$/);
  });

  it("applies the accepted canonical and runtime schemas", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);

      for (const contract of Object.values(CANONICAL_TABLE_CONTRACTS)) {
        await expect(
          readColumnNames(database, contract.schemaName, contract.tableName),
        ).resolves.toEqual(contract.columns);
      }

      for (const contract of Object.values(RUNTIME_CONTEXT_TABLE_CONTRACTS)) {
        await expect(
          readColumnNames(database, contract.schemaName, contract.tableName),
        ).resolves.toEqual(contract.columns);
      }
    } finally {
      await database.close();
    }
  });

  it("reapplies package-local migrations after legacy memory object columns are already absent", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const migrations = await listModelMemoryMigrationFiles();
      const supportItemMigration = migrations.find(
        (migration) => migration.name === "0002_model_memory_support_items.sql",
      );

      expect(supportItemMigration).toBeDefined();
      // pg-mem does not faithfully support replaying CREATE TABLE IF NOT EXISTS for an
      // existing table, so this regression targets the rerunnable tail that failed on the
      // shared Postgres database: support-item backfill plus legacy-column cleanup.
      await expect(
        database.sql.query(rerunnableSupportTail(supportItemMigration!.sql)),
      ).resolves.toBeDefined();

      await expect(
        readColumnNames(database, "model_memory", "memory_objects"),
      ).resolves.not.toContain("source_window_id");
      await expect(
        readColumnNames(database, "model_memory", "memory_objects"),
      ).resolves.not.toContain("provenance");
    } finally {
      await database.close();
    }
  });

  it("does not recreate retired legacy tables once migrations are tracked", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      await database.sql.query(`
        DROP TABLE IF EXISTS
          model_memory.memory_support_items,
          model_memory.supersession_links,
          model_memory.write_events,
          model_memory.memory_objects,
          model_memory.source_windows,
          model_memory.sources
        CASCADE
      `);

      await applyModelMemoryMigrations(database.sql);

      await expect(
        readColumnNames(database, "model_memory", "durable_memories"),
      ).resolves.toContain("memory_id");
      expect(() => database.db.getSchema("model_memory").getTable("memory_objects")).toThrow();
      expect(() => database.db.getSchema("model_memory").getTable("sources")).toThrow();
    } finally {
      await database.close();
    }
  });
});
