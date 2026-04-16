import type { Pool } from "pg";
import { DataType, newDb } from "pg-mem";
import { PgSqlClient } from "./sql-client.ts";

export async function createPgMemTestDatabase() {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  db.public.registerFunction({
    name: "to_tsvector",
    args: [DataType.text, DataType.text],
    returns: DataType.text,
    implementation: (_config: string, value: string) => value,
  });

  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as Pool;
  const sql = new PgSqlClient(pool);

  return {
    db,
    pool,
    sql,
    async close() {
      await pool.end();
    },
  };
}
