import { loadConfig, type OpenClawConfig } from "../config/config.js";
import {
  DatabaseMemoryObjectStore,
  DatabaseRetrievalStore,
  ModelMemoryCanonicalRepository,
  RuntimeContextRepository,
  applyModelMemoryMigrations,
  createModelMemoryPgPool,
  type ModelMemoryPgPool,
  type ModelMemoryPgPoolConfig,
  type SqlClient,
} from "../plugin-sdk/model-memory.js";

const DEFAULT_MODEL_MEMORY_DATABASE_NAME = "model_memory";
const MODEL_MEMORY_APPLICATION_NAME = "model-memory";

type JsonRecord = Record<string, unknown>;

export type ModelMemoryDatabaseMode = "full_corpus_proof_db" | "targeted_trace_scratch_db";

export type ModelMemoryDatabaseResolution = {
  connectionString: string;
  databaseName: string;
  databaseMode?: ModelMemoryDatabaseMode;
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
  canonicalRepository: InstanceType<typeof ModelMemoryCanonicalRepository>;
  runtimeRepository: InstanceType<typeof RuntimeContextRepository>;
  memoryStore: InstanceType<typeof DatabaseMemoryObjectStore>;
  retrievalStore: InstanceType<typeof DatabaseRetrievalStore>;
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

export function resolveModelMemoryDatabaseNameForMode(input: {
  databaseMode: ModelMemoryDatabaseMode;
  env?: NodeJS.ProcessEnv;
  defaultDatabaseName?: string;
}): string {
  const env = input.env ?? process.env;
  const sharedDefaultDatabaseName =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_NAME) ??
    input.defaultDatabaseName ??
    DEFAULT_MODEL_MEMORY_DATABASE_NAME;

  if (input.databaseMode === "full_corpus_proof_db") {
    return (
      readTrimmedString(env.MODEL_MEMORY_FULL_CORPUS_PROOF_DATABASE_NAME) ??
      sharedDefaultDatabaseName
    );
  }

  return (
    readTrimmedString(env.MODEL_MEMORY_TARGETED_TRACE_SCRATCH_DATABASE_NAME) ??
    `${sharedDefaultDatabaseName}_trace_scratch`
  );
}

export function resolveModelMemoryDatabaseResolution(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: ModelMemoryDatabaseMode;
  } = {},
): ModelMemoryDatabaseResolution {
  const env = input.env ?? process.env;
  const config = input.config ?? loadConfig();
  const modelMemoryConfig = readPluginDatabaseConfig(config, "model-memory");
  const sharedMemoryConfig = readPluginDatabaseConfig(config, "memory-middleware");
  const modeDatabaseName = input.databaseMode
    ? resolveModelMemoryDatabaseNameForMode({
        databaseMode: input.databaseMode,
        env,
        defaultDatabaseName:
          modelMemoryConfig.databaseName ??
          input.defaultDatabaseName ??
          DEFAULT_MODEL_MEMORY_DATABASE_NAME,
      })
    : undefined;

  const explicitConnectionString =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_URL) ?? modelMemoryConfig.url;
  if (explicitConnectionString) {
    const databaseName =
      modeDatabaseName ?? readDatabaseNameFromConnectionString(explicitConnectionString);
    return {
      connectionString: modeDatabaseName
        ? retargetDatabase(explicitConnectionString, databaseName)
        : withApplicationName(explicitConnectionString),
      databaseName,
      databaseMode: input.databaseMode,
      source: readTrimmedString(env.MODEL_MEMORY_DATABASE_URL)
        ? "env:MODEL_MEMORY_DATABASE_URL"
        : "config:plugins.entries.model-memory.config.database.url",
      derivedFromSharedServer: false,
    };
  }

  const targetDatabaseName =
    modeDatabaseName ??
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
    databaseMode: input.databaseMode,
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
    databaseMode?: ModelMemoryDatabaseMode;
    applyMigrations?: boolean;
    createPool?: (config: ModelMemoryPgPoolConfig) => ModelMemoryPgPool;
    migrationRunner?: (client: SqlClient) => Promise<string[]>;
  } = {},
): Promise<ModelMemoryDatabaseRuntime> {
  const resolution = resolveModelMemoryDatabaseResolution({
    config: input.config,
    env: input.env,
    defaultDatabaseName: input.defaultDatabaseName,
    databaseMode: input.databaseMode,
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
  const canonicalRepository = new ModelMemoryCanonicalRepository(sqlClient);
  const runtimeRepository = new RuntimeContextRepository(sqlClient);

  return {
    resolution,
    pool,
    sqlClient,
    canonicalRepository,
    runtimeRepository,
    memoryStore: new DatabaseMemoryObjectStore(canonicalRepository),
    retrievalStore: new DatabaseRetrievalStore(runtimeRepository),
    migrationNames,
  };
}
