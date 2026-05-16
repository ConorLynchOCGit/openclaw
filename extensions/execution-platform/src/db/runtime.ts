import { Pool, type PoolConfig } from "pg";
import type { OpenClawConfig } from "../../../../src/config/types.openclaw.js";
import { applyExecutionPlatformMigrations } from "./migrations.ts";
import { PgSqlClient, type SqlClient } from "./sql-client.ts";

const DEFAULT_APPLICATION_NAME = "execution-platform";
const DEFAULT_MODEL_MEMORY_DATABASE_NAME = "model_memory";
const DEFAULT_POOL_MAX = 5;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

export type ExecutionPlatformDatabaseSource =
  | "env:EXECUTION_PLATFORM_DATABASE_URL"
  | "config:env.vars.EXECUTION_PLATFORM_DATABASE_URL"
  | "config:plugins.entries.execution-platform.config.database.url"
  | "env:MODEL_MEMORY_DATABASE_URL"
  | "config:plugins.entries.model-memory.config.database.url";

export type ExecutionPlatformDatabaseResolution = {
  connectionString: string;
  databaseName: string;
  source: ExecutionPlatformDatabaseSource;
  reusedModelMemoryDatabase: boolean;
  explicitlyApprovedSharedRuntimeDatabase?: boolean;
};

export type ExecutionPlatformPgPool = Pool;
export type ExecutionPlatformPgPoolConfig = PoolConfig;

export type ExecutionPlatformDatabaseRuntime = {
  resolution: ExecutionPlatformDatabaseResolution;
  pool: ExecutionPlatformPgPool;
  sqlClient: SqlClient;
  migrationNames: string[];
};

type DatabasePluginConfig = {
  url?: string;
  databaseName?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveIntegerEnv(name: string, env: NodeJS.ProcessEnv): number | undefined {
  const value = env[name]?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readConfigEnvString(config: OpenClawConfig | undefined, name: string): string | undefined {
  const envConfig = config?.env;
  if (!envConfig) {
    return undefined;
  }
  const varsValue = envConfig.vars?.[name];
  if (typeof varsValue === "string" && varsValue.trim().length > 0) {
    return varsValue.trim();
  }
  const directValue = envConfig[name];
  if (typeof directValue === "string" && directValue.trim().length > 0) {
    return directValue.trim();
  }
  return undefined;
}

function flagEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on", "enabled"].includes(value?.trim().toLowerCase() ?? "");
}

function readPluginDatabaseConfig(
  config: OpenClawConfig | undefined,
  pluginId: string,
): DatabasePluginConfig {
  const entry = config?.plugins?.entries?.[pluginId];
  if (!entry || !isRecord(entry) || !isRecord(entry.config)) {
    return {};
  }
  const database = entry.config.database;
  if (!isRecord(database)) {
    return {};
  }
  return {
    url: readTrimmedString(database.url),
    databaseName:
      readTrimmedString(database.databaseName) ??
      readTrimmedString(database.name) ??
      readTrimmedString(database.dbName),
  };
}

function databaseNameFromConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const path = url.pathname.replace(/^\/+/, "").trim();
  return path.length > 0 ? path : "postgres";
}

function withApplicationName(connectionString: string): string {
  const url = new URL(connectionString);
  if (!url.searchParams.has("application_name")) {
    url.searchParams.set("application_name", DEFAULT_APPLICATION_NAME);
  }
  return url.toString();
}

function retargetDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  if (!url.searchParams.has("application_name")) {
    url.searchParams.set("application_name", DEFAULT_APPLICATION_NAME);
  }
  return url.toString();
}

export function redactExecutionPlatformConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.username) {
    url.username = "redacted";
  }
  if (url.password) {
    url.password = "redacted";
  }
  return url.toString();
}

async function loadOpenClawConfig(): Promise<OpenClawConfig> {
  const { loadConfig } = await import("../../../../src/config/config.js");
  return loadConfig();
}

export async function resolveExecutionPlatformDatabaseResolution(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    loadConfig?: () => Promise<OpenClawConfig> | OpenClawConfig;
  } = {},
): Promise<ExecutionPlatformDatabaseResolution> {
  const env = input.env ?? process.env;
  const config = input.config ?? (await (input.loadConfig ?? loadOpenClawConfig)());
  const explicitlyApprovedSharedRuntimeDatabase = flagEnabled(
    readTrimmedString(env.OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED) ??
      readConfigEnvString(config, "OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED"),
  );
  const executionPlatformConfig = readPluginDatabaseConfig(config, "execution-platform");
  const modelMemoryConfig = readPluginDatabaseConfig(config, "model-memory");
  const explicitDatabaseName =
    readTrimmedString(env.EXECUTION_PLATFORM_DATABASE_NAME) ??
    executionPlatformConfig.databaseName ??
    input.defaultDatabaseName;
  const modelMemoryDatabaseName =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_NAME) ??
    modelMemoryConfig.databaseName ??
    DEFAULT_MODEL_MEMORY_DATABASE_NAME;

  const candidates: Array<{
    connectionString?: string;
    source: ExecutionPlatformDatabaseSource;
    reusedModelMemoryDatabase: boolean;
    configDatabaseName?: string;
  }> = [
    {
      connectionString: readTrimmedString(env.EXECUTION_PLATFORM_DATABASE_URL),
      source: "env:EXECUTION_PLATFORM_DATABASE_URL",
      reusedModelMemoryDatabase: false,
    },
    {
      connectionString: readConfigEnvString(config, "EXECUTION_PLATFORM_DATABASE_URL"),
      source: "config:env.vars.EXECUTION_PLATFORM_DATABASE_URL",
      reusedModelMemoryDatabase: false,
    },
    {
      connectionString: executionPlatformConfig.url,
      source: "config:plugins.entries.execution-platform.config.database.url",
      reusedModelMemoryDatabase: false,
      configDatabaseName: executionPlatformConfig.databaseName,
    },
    {
      connectionString: readTrimmedString(env.MODEL_MEMORY_DATABASE_URL),
      source: "env:MODEL_MEMORY_DATABASE_URL",
      reusedModelMemoryDatabase: true,
    },
    {
      connectionString: modelMemoryConfig.url,
      source: "config:plugins.entries.model-memory.config.database.url",
      reusedModelMemoryDatabase: true,
      configDatabaseName: modelMemoryConfig.databaseName,
    },
  ];

  const selected = candidates.find((candidate) => candidate.connectionString);
  if (!selected?.connectionString) {
    throw new Error(
      [
        "execution-platform database URL is not configured.",
        "Set EXECUTION_PLATFORM_DATABASE_URL, plugins.entries.execution-platform.config.database.url,",
        "MODEL_MEMORY_DATABASE_URL, or plugins.entries.model-memory.config.database.url.",
      ].join(" "),
    );
  }

  const currentDatabaseName = databaseNameFromConnectionString(selected.connectionString);
  const databaseName =
    explicitDatabaseName ??
    selected.configDatabaseName ??
    (selected.reusedModelMemoryDatabase && currentDatabaseName === "postgres"
      ? modelMemoryDatabaseName
      : currentDatabaseName);
  return {
    connectionString:
      databaseName !== currentDatabaseName
        ? retargetDatabase(selected.connectionString, databaseName)
        : withApplicationName(selected.connectionString),
    databaseName,
    source: selected.source,
    reusedModelMemoryDatabase: selected.reusedModelMemoryDatabase,
    explicitlyApprovedSharedRuntimeDatabase:
      selected.reusedModelMemoryDatabase && explicitlyApprovedSharedRuntimeDatabase,
  };
}

export function resolveExecutionPlatformPgPoolConfig(
  config: PoolConfig,
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  return {
    max: readPositiveIntegerEnv("EXECUTION_PLATFORM_DB_POOL_MAX", env) ?? DEFAULT_POOL_MAX,
    idleTimeoutMillis:
      readPositiveIntegerEnv("EXECUTION_PLATFORM_DB_POOL_IDLE_TIMEOUT_MS", env) ??
      DEFAULT_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis:
      readPositiveIntegerEnv("EXECUTION_PLATFORM_DB_POOL_CONNECTION_TIMEOUT_MS", env) ??
      DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
    ...config,
  };
}

export function createExecutionPlatformPgPool(config: PoolConfig): ExecutionPlatformPgPool {
  return new Pool(resolveExecutionPlatformPgPoolConfig(config));
}

export async function createExecutionPlatformDatabaseRuntime(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    applyMigrations?: boolean;
    createPool?: (config: PoolConfig) => ExecutionPlatformPgPool;
    migrationRunner?: (client: SqlClient) => Promise<string[]>;
    loadConfig?: () => Promise<OpenClawConfig> | OpenClawConfig;
  } = {},
): Promise<ExecutionPlatformDatabaseRuntime> {
  const resolution = await resolveExecutionPlatformDatabaseResolution(input);
  const poolFactory = input.createPool ?? createExecutionPlatformPgPool;
  const pool = poolFactory({ connectionString: resolution.connectionString });
  const sqlClient = new PgSqlClient(pool);
  const migrationRunner = input.migrationRunner ?? applyExecutionPlatformMigrations;
  const migrationNames = input.applyMigrations === false ? [] : await migrationRunner(sqlClient);
  return {
    resolution,
    pool,
    sqlClient,
    migrationNames,
  };
}
