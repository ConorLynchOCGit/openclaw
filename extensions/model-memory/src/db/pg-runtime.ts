import { Pool, type PoolConfig } from "pg";
import { PgSqlClient } from "./sql-client.ts";

export type ModelMemoryPgPool = Pool;
export type ModelMemoryPgPoolConfig = PoolConfig;

const DEFAULT_POOL_MAX = 5;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 10_000;

function readPositiveIntegerEnv(name: string, env: NodeJS.ProcessEnv): number | undefined {
  const value = env[name]?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveModelMemoryPgPoolConfig(
  config: PoolConfig,
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  return {
    max: readPositiveIntegerEnv("MODEL_MEMORY_DB_POOL_MAX", env) ?? DEFAULT_POOL_MAX,
    idleTimeoutMillis:
      readPositiveIntegerEnv("MODEL_MEMORY_DB_POOL_IDLE_TIMEOUT_MS", env) ??
      DEFAULT_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis:
      readPositiveIntegerEnv("MODEL_MEMORY_DB_POOL_CONNECTION_TIMEOUT_MS", env) ??
      DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
    ...config,
  };
}

export type ModelMemoryPgPoolStats = {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

export function snapshotModelMemoryPgPoolStats(pool: Pool): ModelMemoryPgPoolStats {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export function createModelMemoryPgPool(config: PoolConfig): Pool {
  return new Pool({
    ...resolveModelMemoryPgPoolConfig(config),
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
