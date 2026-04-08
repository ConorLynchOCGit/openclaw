import { Pool, type PoolClient } from "pg";
import type { MemoryMiddlewareConfig } from "../config.js";

const poolsByConnectionString = new Map<string, Pool>();

function getConnectionString(config: MemoryMiddlewareConfig): string | null {
  const connectionString = config.database.url?.trim();
  return connectionString && connectionString.length > 0 ? connectionString : null;
}

export function getMemoryMiddlewarePgPool(config: MemoryMiddlewareConfig): Pool | null {
  const connectionString = getConnectionString(config);
  if (!connectionString) {
    return null;
  }

  const existing = poolsByConnectionString.get(connectionString);
  if (existing) {
    return existing;
  }

  const pool = new Pool({ connectionString });
  poolsByConnectionString.set(connectionString, pool);
  return pool;
}

export async function withMemoryMiddlewarePgClient<T>(params: {
  config: MemoryMiddlewareConfig;
  run: (client: PoolClient) => Promise<T>;
}): Promise<T> {
  const pool = getMemoryMiddlewarePgPool(params.config);
  if (!pool) {
    throw new Error("memory middleware database URL is not configured");
  }

  const client = await pool.connect();
  try {
    return await params.run(client);
  } finally {
    client.release();
  }
}
