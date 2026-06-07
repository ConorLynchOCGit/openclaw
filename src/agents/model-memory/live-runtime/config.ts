import type { OpenClawConfig } from "../../../config/config.js";
import { resolveModelMemoryDatabaseResolution } from "../../model-memory.database.js";
import {
  isJsonRecord,
  readBooleanLike,
  readBooleanLiteral,
  readNestedRecord,
  readTrimmedString,
  type JsonRecord,
} from "../value-readers.js";
import {
  DEFAULT_STRICT_MMV2_MODEL_REF,
  LIVE_MODEL_MEMORY_ENABLED_ENV,
  MODEL_MEMORY_BOOTSTRAP_OVERLAY_ENABLED_ENV,
  MODEL_MEMORY_PLUGIN_ID,
  MODEL_MEMORY_PROJECTION_ARTIFACTS_ENABLED_ENV,
  MODEL_MEMORY_RETRIEVAL_MODEL_ID_ENV,
  MODEL_MEMORY_STRICT_CANDIDATE_MODEL_ID_ENV,
  MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID_ENV,
  MODEL_MEMORY_TOOL_RESULT_PROOF_CAPTURE_ENABLED_ENV,
} from "./constants.js";

export type ModelMemoryLiveRuntimeStatus = {
  enabled: boolean;
  source:
    | "env:MODEL_MEMORY_LIVE_ENABLED"
    | "config:plugins.entries.model-memory.config.live.enabled"
    | "disabled";
  reason?: string;
  includeRetrievalPacks: boolean;
  contextInjectionEnabled: boolean;
  captureWritesEnabled: boolean;
  legacyMemorySlotDisabled: boolean;
  legacyMemorySearchDisabled: boolean;
  databaseConfigured: boolean;
  databaseSource?: string;
  databaseName?: string;
  databaseError?: string;
};

function readModelMemoryPluginConfig(config?: OpenClawConfig): JsonRecord {
  const entry = config?.plugins?.entries?.[MODEL_MEMORY_PLUGIN_ID];
  if (!entry || !isJsonRecord(entry) || !isJsonRecord(entry.config)) {
    return {};
  }
  return entry.config;
}

function readLiveConfig(config?: OpenClawConfig): JsonRecord {
  const pluginConfig = readModelMemoryPluginConfig(config);
  const live = pluginConfig.live;
  return isJsonRecord(live) ? live : {};
}

function resolveBooleanEnv(value: string | undefined): boolean | undefined {
  return readBooleanLike(value);
}

function resolveLegacyMemorySlotDisabled(config?: OpenClawConfig): boolean {
  if (config?.plugins?.enabled === false) {
    return true;
  }
  const slot = config?.plugins?.slots?.memory;
  return typeof slot === "string" && slot.trim().toLowerCase() === "none";
}

function resolveLegacyMemorySearchDisabled(config?: OpenClawConfig): boolean {
  return config?.agents?.defaults?.memorySearch?.enabled === false;
}

export function resolveProjectionArtifactMaterializationEnabled(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envEnabled = resolveBooleanEnv(env[MODEL_MEMORY_PROJECTION_ARTIFACTS_ENABLED_ENV]);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  const liveConfig = readLiveConfig(config);
  const projections = isJsonRecord(liveConfig.projections) ? liveConfig.projections : {};
  const materializeArtifacts = isJsonRecord(projections.materializeArtifacts)
    ? projections.materializeArtifacts
    : {};
  return readBooleanLiteral(materializeArtifacts.enabled) ?? true;
}

export function resolveModelMemoryBootstrapOverlayEnabled(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envEnabled = resolveBooleanEnv(env[MODEL_MEMORY_BOOTSTRAP_OVERLAY_ENABLED_ENV]);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  const liveConfig = readLiveConfig(config);
  const bootstrapOverlay =
    readNestedRecord(liveConfig, ["bootstrapOverlay"]) ??
    readNestedRecord(liveConfig, ["bootstrap", "overlay"]) ??
    {};
  return readBooleanLiteral(bootstrapOverlay.enabled) ?? false;
}

export function resolveToolResultProofCaptureEnabled(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envEnabled = resolveBooleanEnv(env[MODEL_MEMORY_TOOL_RESULT_PROOF_CAPTURE_ENABLED_ENV]);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  const captureSeams =
    readNestedRecord(readModelMemoryPluginConfig(config), ["captureSeams"]) ??
    readNestedRecord(config, ["modelMemory", "captureSeams"]) ??
    {};
  const toolResultProof = isJsonRecord(captureSeams.toolResultProofCapture)
    ? captureSeams.toolResultProofCapture
    : {};
  return readBooleanLiteral(toolResultProof.enabled) ?? true;
}

export function resolveModelMemoryLiveRuntimeStatus(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): ModelMemoryLiveRuntimeStatus {
  const envEnabled = resolveBooleanEnv(env[LIVE_MODEL_MEMORY_ENABLED_ENV]);
  const liveConfig = readLiveConfig(config);
  const configEnabled = readBooleanLiteral(liveConfig.enabled);
  const includeRetrievalPacks = readBooleanLiteral(liveConfig.includeRetrievalPacks) === true;

  const enabled = envEnabled ?? configEnabled ?? false;
  const source =
    envEnabled !== undefined
      ? "env:MODEL_MEMORY_LIVE_ENABLED"
      : configEnabled !== undefined
        ? "config:plugins.entries.model-memory.config.live.enabled"
        : "disabled";
  const legacyMemorySlotDisabled = resolveLegacyMemorySlotDisabled(config);
  const legacyMemorySearchDisabled = resolveLegacyMemorySearchDisabled(config);

  if (!enabled) {
    return {
      enabled: false,
      source: "disabled",
      reason: "model-memory live runtime disabled",
      includeRetrievalPacks,
      contextInjectionEnabled: false,
      captureWritesEnabled: false,
      legacyMemorySlotDisabled,
      legacyMemorySearchDisabled,
      databaseConfigured: false,
    };
  }

  try {
    const resolution = resolveModelMemoryDatabaseResolution({ config, env });
    return {
      enabled: true,
      source,
      includeRetrievalPacks,
      contextInjectionEnabled: true,
      captureWritesEnabled: true,
      legacyMemorySlotDisabled,
      legacyMemorySearchDisabled,
      databaseConfigured: true,
      databaseSource: resolution.source,
      databaseName: resolution.databaseName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      enabled: true,
      source,
      includeRetrievalPacks,
      contextInjectionEnabled: true,
      captureWritesEnabled: true,
      legacyMemorySlotDisabled,
      legacyMemorySearchDisabled,
      databaseConfigured: false,
      databaseError: message,
    };
  }
}

export function resolveLiveModelRef(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const liveConfig = readLiveConfig(config);
  return (
    readTrimmedString(env[MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID_ENV]) ??
    readTrimmedString(liveConfig.modelId) ??
    DEFAULT_STRICT_MMV2_MODEL_REF
  );
}

export function resolveCandidateModelRef(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const liveConfig = readLiveConfig(config);
  return (
    readTrimmedString(env[MODEL_MEMORY_STRICT_CANDIDATE_MODEL_ID_ENV]) ??
    readTrimmedString(env.MODEL_MEMORY_CANDIDATE_MODEL) ??
    readTrimmedString(liveConfig.candidateModelId) ??
    resolveLiveModelRef(config, env)
  );
}

export function resolveRetrievalModelRef(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const liveConfig = readLiveConfig(config);
  return (
    readTrimmedString(env[MODEL_MEMORY_RETRIEVAL_MODEL_ID_ENV]) ??
    readTrimmedString(liveConfig.retrievalModelId) ??
    resolveLiveModelRef(config, env)
  );
}

export function resolveLiveRetrievalMaxResults(config?: OpenClawConfig): number {
  const liveConfig = readLiveConfig(config);
  const configured = liveConfig.maxRetrievalResults;
  if (typeof configured === "number" && Number.isFinite(configured)) {
    return Math.min(20, Math.max(1, Math.trunc(configured)));
  }
  return 8;
}
