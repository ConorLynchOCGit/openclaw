import { Pool, type PoolConfig } from "pg";
import { PgSqlClient } from "./sql-client.ts";

export type ModelMemoryPgPool = Pool;
export type ModelMemoryPgPoolConfig = PoolConfig;

export function createModelMemoryPgPool(config: PoolConfig): Pool {
  return new Pool({
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...config,
  });
}

export function createModelMemorySqlClientFromConnectionString(connectionString: string): {
  pool: Pool;
  sqlClient: PgSqlClient;
} {
  const pool = createModelMemoryPgPool({ connectionString });
  return {
    pool,
    sqlClient: new PgSqlClient(pool),
  };
}
