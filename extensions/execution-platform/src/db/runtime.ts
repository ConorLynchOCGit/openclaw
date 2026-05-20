import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSON5 from "json5";
import { Pool, type PoolConfig } from "pg";
import type { OpenClawConfig } from "../../../../src/config/types.openclaw.js";
import { applyExecutionPlatformMigrations } from "./migrations.ts";
import { PgSqlClient, type SqlClient } from "./sql-client.ts";

const DEFAULT_APPLICATION_NAME = "execution-platform";
const DEFAULT_MODEL_MEMORY_DATABASE_NAME = "model_memory";
const DEFAULT_POOL_MAX = 5;
const DEFAULT_POOL_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POOL_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_OPENCLAW_STATE_DIR = ".openclaw";
const DEFAULT_OPENCLAW_CONFIG_FILENAME = "openclaw.json";

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

function resolveLiteConfigPath(env: NodeJS.ProcessEnv): string {
  const explicit = readTrimmedString(env.OPENCLAW_CONFIG_PATH);
  if (explicit) {
    return explicit.startsWith("~")
      ? path.join(os.homedir(), explicit.slice(1))
      : path.resolve(explicit);
  }
  const stateDir = readTrimmedString(env.OPENCLAW_STATE_DIR)
    ? path.resolve(readTrimmedString(env.OPENCLAW_STATE_DIR)!)
    : path.join(os.homedir(), DEFAULT_OPENCLAW_STATE_DIR);
  return path.join(stateDir, DEFAULT_OPENCLAW_CONFIG_FILENAME);
}

function maybeSubstituteEnvRef(
  value: string | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (!value?.includes("${")) {
    return value;
  }
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gu, (match, name: string) => {
    const next = env[name];
    return typeof next === "string" && next.length > 0 ? next : match;
  });
}

function readLiteConfigEnvString(
  config: JsonRecord,
  name: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const envConfig = isRecord(config.env) ? config.env : undefined;
  const vars = isRecord(envConfig?.vars) ? envConfig.vars : undefined;
  const varsValue = readTrimmedString(vars?.[name]);
  if (varsValue) {
    return maybeSubstituteEnvRef(varsValue, env);
  }
  const directValue = readTrimmedString(envConfig?.[name]);
  return maybeSubstituteEnvRef(directValue, env);
}

function readLitePluginDatabaseConfig(
  config: JsonRecord,
  pluginId: string,
  env: NodeJS.ProcessEnv,
): DatabasePluginConfig {
  const plugins = isRecord(config.plugins) ? config.plugins : undefined;
  const entries = isRecord(plugins?.entries) ? plugins.entries : undefined;
  const entry = isRecord(entries?.[pluginId]) ? entries[pluginId] : undefined;
  const entryConfig = isRecord(entry?.config) ? entry.config : undefined;
  const database = isRecord(entryConfig?.database) ? entryConfig.database : undefined;
  if (!database) {
    return {};
  }
  return {
    url: maybeSubstituteEnvRef(readTrimmedString(database.url), env),
    databaseName:
      readTrimmedString(database.databaseName) ??
      readTrimmedString(database.name) ??
      readTrimmedString(database.dbName),
  };
}

function liteConfigHasExecutionPlatformDatabaseFields(
  config: JsonRecord,
  env: NodeJS.ProcessEnv,
): boolean {
  return Boolean(
    readLiteConfigEnvString(config, "EXECUTION_PLATFORM_DATABASE_URL", env) ??
    readLitePluginDatabaseConfig(config, "execution-platform", env).url ??
    readLiteConfigEnvString(config, "MODEL_MEMORY_DATABASE_URL", env) ??
    readLitePluginDatabaseConfig(config, "model-memory", env).url ??
    readLiteConfigEnvString(config, "OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED", env),
  );
}

export function readExecutionPlatformDatabaseConfigLite(
  env: NodeJS.ProcessEnv = process.env,
): OpenClawConfig | undefined {
  const configPath = resolveLiteConfigPath(env);
  let parsed: unknown;
  try {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    parsed = JSON5.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !liteConfigHasExecutionPlatformDatabaseFields(parsed, env)) {
    return undefined;
  }
  const executionPlatformDatabase = readLitePluginDatabaseConfig(parsed, "execution-platform", env);
  const modelMemoryDatabase = readLitePluginDatabaseConfig(parsed, "model-memory", env);
  return {
    env: {
      vars: {
        ...(readLiteConfigEnvString(parsed, "EXECUTION_PLATFORM_DATABASE_URL", env)
          ? {
              EXECUTION_PLATFORM_DATABASE_URL: readLiteConfigEnvString(
                parsed,
                "EXECUTION_PLATFORM_DATABASE_URL",
                env,
              ),
            }
          : {}),
        ...(readLiteConfigEnvString(
          parsed,
          "OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED",
          env,
        )
          ? {
              OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED: readLiteConfigEnvString(
                parsed,
                "OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED",
                env,
              ),
            }
          : {}),
        ...(readLiteConfigEnvString(parsed, "MODEL_MEMORY_DATABASE_URL", env)
          ? {
              MODEL_MEMORY_DATABASE_URL: readLiteConfigEnvString(
                parsed,
                "MODEL_MEMORY_DATABASE_URL",
                env,
              ),
            }
          : {}),
      },
    },
    plugins: {
      entries: {
        ...(executionPlatformDatabase.url
          ? {
              "execution-platform": {
                config: {
                  database: executionPlatformDatabase,
                },
              },
            }
          : {}),
        ...(modelMemoryDatabase.url
          ? {
              "model-memory": {
                config: {
                  database: modelMemoryDatabase,
                },
              },
            }
          : {}),
      },
    },
  } as OpenClawConfig;
}

async function loadDatabaseConfigForResolution(input: {
  config?: OpenClawConfig;
  env: NodeJS.ProcessEnv;
  loadConfig?: () => Promise<OpenClawConfig> | OpenClawConfig;
}): Promise<OpenClawConfig> {
  if (input.config) {
    return input.config;
  }
  const liteConfig = readExecutionPlatformDatabaseConfigLite(input.env);
  if (liteConfig) {
    return liteConfig;
  }
  return await (input.loadConfig ?? loadOpenClawConfig)();
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
  const config = await loadDatabaseConfigForResolution({
    config: input.config,
    env,
    loadConfig: input.loadConfig,
  });
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
