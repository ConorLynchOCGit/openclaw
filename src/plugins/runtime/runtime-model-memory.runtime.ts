type OpenClawConfig = import("../../config/types.openclaw.js").OpenClawConfig;
type DatabaseMemoryObjectStore =
  import("@openclaw/model-memory/legacy-admin-api.js").DatabaseMemoryObjectStore;
type ModelMemoryCanonicalRepository =
  import("@openclaw/model-memory/runtime-api.js").ModelMemoryCanonicalRepository;
type RuntimeContextRepository =
  import("@openclaw/model-memory/runtime-api.js").RuntimeContextRepository;
type DatabaseRetrievalStore =
  import("@openclaw/model-memory/runtime-api.js").DatabaseRetrievalStore;
type JsonModelExecutor = import("@openclaw/model-memory/runtime-api.js").JsonModelExecutor;
type SqlClient = import("@openclaw/model-memory/runtime-api.js").SqlClient;

export type RuntimeModelMemoryDatabaseMode = "full_corpus_proof_db" | "targeted_trace_scratch_db";

export type RuntimeModelMemoryDatabaseResolution = {
  connectionString: string;
  databaseName: string;
  databaseMode?: RuntimeModelMemoryDatabaseMode;
  source:
    | "env:MODEL_MEMORY_DATABASE_URL"
    | "config:plugins.entries.model-memory.config.database.url";
};

export type RuntimeModelMemoryDatabaseRuntime = Awaited<{
  resolution: RuntimeModelMemoryDatabaseResolution;
  pool: {
    end: () => Promise<void>;
  };
  sqlClient: SqlClient;
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository: RuntimeContextRepository;
  memoryStore: DatabaseMemoryObjectStore;
  retrievalStore: DatabaseRetrievalStore;
  migrationNames: string[];
}>;

export type RuntimeModelMemoryLiveJsonExecutor = JsonModelExecutor & {
  getRequestTimeoutMs: () => number;
  getRequestSeed: () => number | undefined;
};

export type RuntimeModelMemoryLiveJsonExecutorOptions = {
  config?: OpenClawConfig;
  requestTimeoutMs?: number;
  requestSeed?: number;
};

const DATABASE_RUNTIME_MODULE_ID = ["..", "..", "agents", "model-memory.database.js"].join("/");
const LIVE_EXECUTOR_MODULE_ID = ["..", "..", "agents", "model-memory.live-json-executor.js"].join(
  "/",
);
const BUNDLED_RUNTIME_BRIDGE_MODULE_ID = "./extensionAPI.js";
const SOURCE_RUNTIME_BRIDGE_MODULE_ID = "../../extensionAPI.ts";

async function importRuntimeBridgeCandidate(specifier: string) {
  const previousSuppressWarning = process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING;
  process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING = "1";
  try {
    return await import(specifier);
  } finally {
    if (previousSuppressWarning === undefined) {
      delete process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING;
    } else {
      process.env.OPENCLAW_SUPPRESS_EXTENSION_API_WARNING = previousSuppressWarning;
    }
  }
}

function isMissingCandidateModule(error: unknown, candidate: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  const normalizedCandidate = candidate.replace(/^(?:\.\.?\/)+/u, "");
  return (
    (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
    (error.message.includes(candidate) || error.message.includes(normalizedCandidate))
  );
}

async function importRuntimeBridgeModule(): Promise<{
  createModelMemoryDatabaseRuntime: (input?: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
    applyMigrations?: boolean;
  }) => Promise<RuntimeModelMemoryDatabaseRuntime>;
  resolveModelMemoryDatabaseResolution: (input?: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
  }) => RuntimeModelMemoryDatabaseResolution;
  OpenAICompatibleLiveJsonExecutor: new (
    options?: RuntimeModelMemoryLiveJsonExecutorOptions,
  ) => RuntimeModelMemoryLiveJsonExecutor;
}> {
  try {
    // Built runtime chunks live at dist/*.js, so source-relative late imports
    // cannot resolve there. Prefer the stable bundled bridge first.
    return await importRuntimeBridgeCandidate(BUNDLED_RUNTIME_BRIDGE_MODULE_ID);
  } catch (error) {
    if (!isMissingCandidateModule(error, BUNDLED_RUNTIME_BRIDGE_MODULE_ID)) {
      throw error;
    }
  }

  try {
    return await importRuntimeBridgeCandidate(SOURCE_RUNTIME_BRIDGE_MODULE_ID);
  } catch (error) {
    if (!isMissingCandidateModule(error, SOURCE_RUNTIME_BRIDGE_MODULE_ID)) {
      throw error;
    }
  }

  // Legacy fallback for non-bundled runtime layouts.
  return import(DATABASE_RUNTIME_MODULE_ID).then(async (databaseModule) => ({
    ...databaseModule,
    ...(await import(LIVE_EXECUTOR_MODULE_ID)),
  }));
}

async function loadDatabaseRuntimeModule(): Promise<{
  createModelMemoryDatabaseRuntime: (input?: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
    applyMigrations?: boolean;
  }) => Promise<RuntimeModelMemoryDatabaseRuntime>;
  resolveModelMemoryDatabaseResolution: (input?: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
  }) => RuntimeModelMemoryDatabaseResolution;
}> {
  // Runtime-only late binding keeps plugin runtime helpers out of the static
  // topology cycle while preserving the real model-memory implementation.
  return importRuntimeBridgeModule();
}

async function loadLiveExecutorModule(): Promise<{
  OpenAICompatibleLiveJsonExecutor: new (
    options?: RuntimeModelMemoryLiveJsonExecutorOptions,
  ) => RuntimeModelMemoryLiveJsonExecutor;
}> {
  // Runtime-only late binding keeps the plugin runtime leaf from depending on
  // the model-memory executor module at static graph time.
  return importRuntimeBridgeModule();
}

export async function createDatabaseRuntime(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
    applyMigrations?: boolean;
  } = {},
): Promise<RuntimeModelMemoryDatabaseRuntime> {
  const { createModelMemoryDatabaseRuntime } = await loadDatabaseRuntimeModule();
  return createModelMemoryDatabaseRuntime(input);
}

export async function resolveDatabaseResolution(
  input: {
    config?: OpenClawConfig;
    env?: NodeJS.ProcessEnv;
    defaultDatabaseName?: string;
    databaseMode?: RuntimeModelMemoryDatabaseMode;
  } = {},
): Promise<RuntimeModelMemoryDatabaseResolution> {
  const { resolveModelMemoryDatabaseResolution } = await loadDatabaseRuntimeModule();
  return resolveModelMemoryDatabaseResolution(input);
}

export async function createLiveJsonExecutor(
  options: RuntimeModelMemoryLiveJsonExecutorOptions = {},
) {
  const { OpenAICompatibleLiveJsonExecutor } = await loadLiveExecutorModule();
  return new OpenAICompatibleLiveJsonExecutor(options);
}
