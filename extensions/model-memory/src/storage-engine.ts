export const MODEL_MEMORY_STORAGE_ENGINE_ENV = "MODEL_MEMORY_STORAGE_ENGINE";

export type ModelMemoryStorageEngine = "legacy" | "mmv2";

type JsonRecord = Record<string, unknown>;
type OpenClawConfigLike = {
  plugins?: {
    entries?: Record<string, unknown>;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPluginConfig(config?: OpenClawConfigLike): JsonRecord {
  const entry = config?.plugins?.entries?.["model-memory"];
  if (!entry || !isRecord(entry) || !isRecord(entry.config)) {
    return {};
  }
  return entry.config;
}

export function resolveModelMemoryStorageEngine(
  config?: OpenClawConfigLike,
  env: NodeJS.ProcessEnv = process.env,
): ModelMemoryStorageEngine {
  const envValue = readTrimmedString(env[MODEL_MEMORY_STORAGE_ENGINE_ENV])?.toLowerCase();
  if (envValue === "legacy" || envValue === "v1") {
    return "legacy";
  }
  if (envValue === "mmv2") {
    return "mmv2";
  }

  const pluginConfig = readPluginConfig(config);
  const storage = pluginConfig.storage;
  if (isRecord(storage)) {
    const engine = readTrimmedString(storage.engine)?.toLowerCase();
    if (engine === "legacy" || engine === "v1") {
      return "legacy";
    }
    if (engine === "mmv2") {
      return "mmv2";
    }
  }

  return "mmv2";
}
