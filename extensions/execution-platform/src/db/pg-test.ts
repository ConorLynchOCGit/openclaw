import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { PgSqlClient, type SqlClient } from "./sql-client.ts";

class PgMemSqlClient implements SqlClient {
  constructor(
    private readonly db: ReturnType<typeof newDb>,
    private readonly inner: SqlClient,
    private readonly inTransaction = false,
  ) {}

  query = this.inner.query.bind(this.inner);

  async withTransaction<T>(work: (tx: SqlClient) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return work(this);
    }

    const backup = this.db.backup();
    try {
      return await work(new PgMemSqlClient(this.db, this.inner, true));
    } catch (error) {
      backup.restore();
      throw error;
    }
  }
}

export async function createExecutionPlatformPgMemTestDatabase() {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as Pool;
  const sql = new PgMemSqlClient(db, new PgSqlClient(pool));

  return {
    db,
    pool,
    sql,
    async close() {
      await pool.end();
    },
  };
}
