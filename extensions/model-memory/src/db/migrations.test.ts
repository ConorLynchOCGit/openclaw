import { describe, expect, it } from "vitest";
import { RUNTIME_CONTEXT_TABLE_CONTRACTS } from "../runtime-read-models.ts";
import { CANONICAL_TABLE_CONTRACTS } from "../storage-database-contract.ts";
import { applyModelMemoryMigrations, listModelMemoryMigrationFiles } from "./migrations.ts";
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

describe("model-memory migrations", () => {
  it("loads ordered package-local sql migrations", async () => {
    const migrations = await listModelMemoryMigrationFiles();
    expect(migrations.map((entry) => entry.name)).toEqual(["0001_model_memory_init.sql"]);
    expect(migrations[0]?.sql).toContain("CREATE SCHEMA IF NOT EXISTS model_memory");
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
});
