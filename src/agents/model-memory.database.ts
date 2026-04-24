import {
  DisabledCapturedObjectWriteStore,
  isLegacyCapturedObjectWriteFallbackEnabled,
  type CapturedObjectWriteStore,
} from "../../extensions/model-memory/legacy-admin-api.ts";
import {
  createModelMemoryDbLaneController,
  type ModelMemoryDbLaneController,
  MmV2NativeRepository,
  PgSqlClient,
  resolveModelMemoryStorageEngine,
} from "../../extensions/model-memory/runtime-api.ts";
import { loadConfig, type OpenClawConfig } from "../config/config.js";
import {
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
    | "config:plugins.entries.model-memory.config.database.url";
};

export type ModelMemoryDatabaseRuntime = {
  resolution: ModelMemoryDatabaseResolution;
  storageEngine: "legacy" | "mmv2";
  pool: ModelMemoryPgPool;
  sqlClient: SqlClient;
  dbLaneController: ModelMemoryDbLaneController;
  canonicalRepository: InstanceType<typeof ModelMemoryCanonicalRepository> | MmV2NativeRepository;
  runtimeRepository: InstanceType<typeof RuntimeContextRepository>;
  memoryStore: CapturedObjectWriteStore;
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
  const explicitLiveDatabaseName =
    readTrimmedString(env.MODEL_MEMORY_DATABASE_NAME) ??
    modelMemoryConfig.databaseName ??
    input.defaultDatabaseName;
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
    const pathDatabaseName = readDatabaseNameFromConnectionString(explicitConnectionString);
    const implicitDefaultDatabaseName =
      pathDatabaseName === "postgres" ? DEFAULT_MODEL_MEMORY_DATABASE_NAME : pathDatabaseName;
    const databaseName =
      modeDatabaseName ?? explicitLiveDatabaseName ?? implicitDefaultDatabaseName;
    return {
      connectionString:
        modeDatabaseName || databaseName !== pathDatabaseName
          ? retargetDatabase(explicitConnectionString, databaseName)
          : withApplicationName(explicitConnectionString),
      databaseName,
      databaseMode: input.databaseMode,
      source: readTrimmedString(env.MODEL_MEMORY_DATABASE_URL)
        ? "env:MODEL_MEMORY_DATABASE_URL"
        : "config:plugins.entries.model-memory.config.database.url",
    };
  }
  throw new Error(
    [
      "model-memory database URL is not configured.",
      "Set MODEL_MEMORY_DATABASE_URL or set plugins.entries.model-memory.config.database.url.",
    ].join(" "),
  );
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
  const env = input.env ?? process.env;
  const config = input.config ?? loadConfig();
  const resolution = resolveModelMemoryDatabaseResolution({
    config,
    env,
    defaultDatabaseName: input.defaultDatabaseName,
    databaseMode: input.databaseMode,
  });

  const poolFactory = input.createPool ?? createModelMemoryPgPool;
  const pool = poolFactory({ connectionString: resolution.connectionString });
  const dbLaneController = createModelMemoryDbLaneController({ pool, env });
  const sqlClient: SqlClient = new PgSqlClient(pool, { laneController: dbLaneController });
  const migrationRunner = input.migrationRunner ?? applyModelMemoryMigrations;
  const migrationNames = input.applyMigrations === false ? [] : await migrationRunner(sqlClient);
  const storageEngine = resolveModelMemoryStorageEngine(config, env);
  const legacyCanonicalRepository = new ModelMemoryCanonicalRepository(sqlClient);
  const mmv2CanonicalRepository = new MmV2NativeRepository(sqlClient);
  const canonicalRepository =
    storageEngine === "mmv2" ? mmv2CanonicalRepository : legacyCanonicalRepository;
  const runtimeRepository = new RuntimeContextRepository(sqlClient);
  let memoryStore: CapturedObjectWriteStore;
  if (storageEngine === "mmv2") {
    if (isLegacyCapturedObjectWriteFallbackEnabled({ env })) {
      const { MmV2DatabaseMemoryObjectStore } =
        await import("../../extensions/model-memory/legacy-admin-api.ts");
      memoryStore = new MmV2DatabaseMemoryObjectStore(mmv2CanonicalRepository);
    } else {
      memoryStore = new DisabledCapturedObjectWriteStore(
        "MMV2 runtime uses native recording; legacy captured-object compatibility is fallback-only",
      );
    }
  } else {
    const { DatabaseMemoryObjectStore } = await import("../plugin-sdk/model-memory.js");
    memoryStore = new DatabaseMemoryObjectStore(legacyCanonicalRepository);
  }

  return {
    resolution,
    storageEngine,
    pool,
    sqlClient,
    dbLaneController,
    canonicalRepository,
    runtimeRepository,
    memoryStore,
    retrievalStore: new DatabaseRetrievalStore(runtimeRepository),
    migrationNames,
  };
}
