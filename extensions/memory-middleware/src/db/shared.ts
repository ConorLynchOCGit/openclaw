import { Client, type ClientConfig } from "pg";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import type { ProcedureStatus } from "./runtime.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function toClientConfig(config: MemoryMiddlewareDbConfig): ClientConfig {
  if (!config.url) {
    throw new Error("memory middleware database URL is not configured");
  }
  return {
    connectionString: config.url,
  };
}

export function assertSafeIdentifier(identifier: string, label: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`${label} must be a simple SQL identifier`);
  }
  return identifier;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

export function quoteQualifiedTable(params: { schema: string; table: string }): string {
  const schema = assertSafeIdentifier(params.schema, "schema");
  const table = assertSafeIdentifier(params.table, "table");
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

export function parseProcedureStatus(value: string): ProcedureStatus {
  if (
    value === "draft" ||
    value === "validated" ||
    value === "superseded" ||
    value === "rejected" ||
    value === "archived"
  ) {
    return value;
  }
  throw new Error(`procedure row contains unsupported status: ${value}`);
}

export async function withConfiguredClient<T>(params: {
  config: MemoryMiddlewareDbConfig;
  run: (client: Client) => Promise<T>;
}): Promise<T> {
  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    return await params.run(client);
  } finally {
    await client.end().catch(() => {});
  }
}
