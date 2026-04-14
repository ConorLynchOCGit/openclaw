import { loadConfig, type OpenClawConfig } from "../config/config.js";
import {
  applyModelMemoryMigrations,
  createDatabaseMemoryObjectStore,
  createDatabaseRetrievalStore,
  createModelMemoryCanonicalRepository,
  createModelMemoryPgPool,
  createRuntimeContextRepository,
  type DatabaseMemoryObjectStore,
  type DatabaseRetrievalStore,
  type ModelMemoryCanonicalRepository,
  type ModelMemoryPgPool,
  type ModelMemoryPgPoolConfig,
  type RuntimeContextRepository,
  type SqlClient,
} from "../plugin-sdk/model-memory-runtime.js";

const DEFAULT_MODEL_MEMORY_DATABASE_NAME = "model_memory";
const MODEL_MEMORY_APPLICATION_NAME = "model-memory";

type JsonRecord = Record<string, unknown>;

export type ModelMemoryDatabaseResolution = {
  connectionString: string;
  databaseName: string;
  source:
    | "env:MODEL_MEMORY_DATABASE_URL"
    | "config:plugins.entries.model-memory.config.database.url"
    | "env:MEMORY_MIDDLEWARE_DATABASE_URL"
    | "config:plugins.entries.memory-middleware.config.database.url";
  derivedFromSharedServer: boolean;
};

export type ModelMemoryDatabaseRuntime = {
  resolution: ModelMemoryDatabaseResolution;
  pool: ModelMemoryPgPool;
  sqlClient: SqlClient;
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  memoryStore: DatabaseMemoryObjectStore;
  retrievalStore: DatabaseRetrievalStore;
  migrationNames: string[];
};

type ModelMemoryDatabasePluginConfig = {
  url?: string;
  databaseName?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPluginDatabaseConfig(
  config: OpenClawConfig | undefined,
  pluginId: string,
): ModelMemoryDatabasePluginConfig {
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

function withApplicationName(connectionString: string): string {
  const url = new URL(connectionString);
  if (!url.searchParams.has("application_name")) {
    url.searchParams.set("application_name", MODEL_MEMORY_APPLICATION_NAME);
  }
  return url.toString();
}

function retargetDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  if (!url.searchParams.has("application_name")) {
    url.searchParams.set("application_name", MODEL_MEMORY_APPLICATION_NAME);
  }
  return url.toString();
}

function readDatabaseNameFromConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const pathname = url.pathname.replace(/^\/+/, "").trim();
  return pathname.length > 0 ? pathname : DEFAULT_MODEL_MEMORY_DATABASE_NAME;
}

export function resolveModelMemoryDatabaseResolution(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
  } = {},
): ModelMemoryDatabaseResolution {
  const env = input.env ?? process.env;
  const config = input.config ?? loadConfig();
  const modelMemoryConfig = readPluginDatabaseConfig(config, "model-memory");
  const sharedMemoryConfig = readPluginDatabaseConfig(config, "memory-middleware");

  const explicitConnectionString =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_URL) ?? modelMemoryConfig.url;
  if (explicitConnectionString) {
    return {
      connectionString: withApplicationName(explicitConnectionString),
      databaseName: readDatabaseNameFromConnectionString(explicitConnectionString),
      source: readTrimmedString(env.MODEL_MEMORY_DATABASE_URL)
        ? "env:MODEL_MEMORY_DATABASE_URL"
        : "config:plugins.entries.model-memory.config.database.url",
      derivedFromSharedServer: false,
    };
  }

  const targetDatabaseName =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_NAME) ??
    modelMemoryConfig.databaseName ??
    input.defaultDatabaseName ??
    DEFAULT_MODEL_MEMORY_DATABASE_NAME;
  const sharedConnectionString =
    readTrimmedString(env.MEMORY_MIDDLEWARE_DATABASE_URL) ?? sharedMemoryConfig.url;

  if (!sharedConnectionString) {
    throw new Error(
      [
        "model-memory database URL is not configured.",
        "Set MODEL_MEMORY_DATABASE_URL, set plugins.entries.model-memory.config.database.url,",
        "or provide the shared memory middleware URL so model-memory can derive a same-server database connection.",
      ].join(" "),
    );
  }

  return {
    connectionString: retargetDatabase(sharedConnectionString, targetDatabaseName),
    databaseName: targetDatabaseName,
    source: readTrimmedString(env.MEMORY_MIDDLEWARE_DATABASE_URL)
      ? "env:MEMORY_MIDDLEWARE_DATABASE_URL"
      : "config:plugins.entries.memory-middleware.config.database.url",
    derivedFromSharedServer: true,
  };
}

export async function createModelMemoryDatabaseRuntime(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    applyMigrations?: boolean;
    createPool?: (config: ModelMemoryPgPoolConfig) => ModelMemoryPgPool;
    migrationRunner?: (client: SqlClient) => Promise<string[]>;
  } = {},
): Promise<ModelMemoryDatabaseRuntime> {
  const resolution = resolveModelMemoryDatabaseResolution({
    config: input.config,
    env: input.env,
    defaultDatabaseName: input.defaultDatabaseName,
  });

  const poolFactory = input.createPool ?? createModelMemoryPgPool;
  const pool = poolFactory({ connectionString: resolution.connectionString });
  const sqlClient: SqlClient = {
    query: (text, params) => pool.query(text, params),
    withTransaction: async (work) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: SqlClient = {
          query: (text, params) => client.query(text, params),
          withTransaction: (nestedWork) => nestedWork(tx),
        };
        const result = await work(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  const migrationRunner = input.migrationRunner ?? applyModelMemoryMigrations;
  const migrationNames = input.applyMigrations === false ? [] : await migrationRunner(sqlClient);
  const canonicalRepository = createModelMemoryCanonicalRepository(sqlClient);
  const runtimeRepository = createRuntimeContextRepository(sqlClient);

  return {
    resolution,
    pool,
    sqlClient,
    canonicalRepository,
    runtimeRepository,
    memoryStore: createDatabaseMemoryObjectStore(canonicalRepository),
    retrievalStore: createDatabaseRetrievalStore(runtimeRepository),
    migrationNames,
  };
}
