import type { Pool } from "pg";
import { DataType, newDb } from "pg-mem";
import type { ModelMemoryDbLane } from "./pool-lanes.ts";
import { PgSqlClient } from "./sql-client.ts";
import type { SqlClient } from "./sql-client.ts";

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

  withLane(lane: ModelMemoryDbLane): SqlClient {
    const nextInner = this.inner.withLane?.(lane) ?? this.inner;
    return new PgMemSqlClient(this.db, nextInner, this.inTransaction);
  }

  getPoolPressureSnapshot = this.inner.getPoolPressureSnapshot?.bind(this.inner);

  shouldDeferLane = this.inner.shouldDeferLane?.bind(this.inner);
}

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
  db.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.integer, DataType.integer],
    returns: DataType.bool,
    implementation: () => true,
  });
  db.public.registerFunction({
    name: "pg_try_advisory_xact_lock",
    args: [DataType.integer, DataType.integer],
    returns: DataType.bool,
    implementation: () => true,
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
