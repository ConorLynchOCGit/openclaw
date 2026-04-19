import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_WORKSPACE_PROJECTION_TARGETS,
  ExecutorBackedSemanticCollisionAdjudicator,
  ExecutorBackedSemanticInterpreter,
  captureOrdinaryTurnLive,
  compileProjection,
  rebuildDerivedRuntimeState,
  type WorkspaceProjectionTargetRecord,
} from "../plugin-sdk/model-memory.js";
import {
  createModelMemoryDatabaseRuntime,
  resolveModelMemoryDatabaseResolution,
} from "./model-memory.database.js";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.js";

const log = createSubsystemLogger("model-memory/live-runtime");

const MODEL_MEMORY_PLUGIN_ID = "model-memory";
const LIVE_MODEL_MEMORY_ENABLED_ENV = "MODEL_MEMORY_LIVE_ENABLED";
const DEFAULT_LIVE_MODEL_REF = "openrouter/openai/gpt-5.4-nano";
const MODEL_MEMORY_CONTEXT_PATH_PREFIX = ".openclaw/model-memory/context";
const BOOTSTRAP_PROJECTION_TARGET_IDS = new Set(["memory-md"]);

type JsonRecord = Record<string, unknown>;

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

export type ModelMemoryBootstrapOverlay = {
  contextFiles: Array<{ path: string; content: string }>;
  projectionOutputs: Record<string, string>;
  projectionVersions: ReturnType<typeof compileProjection>["version"][];
  status: ModelMemoryLiveRuntimeStatus;
};

export type ModelMemoryLiveRuntimeWarmResult = {
  status: ModelMemoryLiveRuntimeStatus;
  memoryObjectCount: number;
  projectionTargetCount: number;
};

type LiveRuntimeDeps = Awaited<ReturnType<typeof createModelMemoryDatabaseRuntime>> & {
  semanticInterpreter: InstanceType<typeof ExecutorBackedSemanticInterpreter>;
  collisionAdjudicator: InstanceType<typeof ExecutorBackedSemanticCollisionAdjudicator>;
};

type LiveRuntimeReadModels = {
  memoryObjects: Awaited<ReturnType<LiveRuntimeDeps["canonicalRepository"]["listMemoryObjects"]>>;
  projectionTargets: WorkspaceProjectionTargetRecord[];
  projectionOutputs: Record<string, string>;
  projectionVersions: ReturnType<typeof compileProjection>["version"][];
  contextArtifacts: Awaited<
    ReturnType<LiveRuntimeDeps["runtimeRepository"]["listContextArtifacts"]>
  >;
  sessionState?: Awaited<
    ReturnType<LiveRuntimeDeps["runtimeRepository"]["getSessionContextState"]>
  >;
};

type ProjectionVersionRecord = ReturnType<typeof compileProjection>["version"];

let runtimeCache:
  | {
      key: string;
      promise: Promise<LiveRuntimeDeps>;
    }
  | undefined;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readModelMemoryPluginConfig(config?: OpenClawConfig): JsonRecord {
  const entry = config?.plugins?.entries?.[MODEL_MEMORY_PLUGIN_ID];
  if (!entry || !isRecord(entry) || !isRecord(entry.config)) {
    return {};
  }
  return entry.config;
}

function readLiveConfig(config?: OpenClawConfig): JsonRecord {
  const pluginConfig = readModelMemoryPluginConfig(config);
  const live = pluginConfig.live;
  return isRecord(live) ? live : {};
}

function resolveBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
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

export function resolveModelMemoryLiveRuntimeStatus(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): ModelMemoryLiveRuntimeStatus {
  const envEnabled = resolveBooleanEnv(env[LIVE_MODEL_MEMORY_ENABLED_ENV]);
  const liveConfig = readLiveConfig(config);
  const configEnabled = readBoolean(liveConfig.enabled);
  const includeRetrievalPacks = readBoolean(liveConfig.includeRetrievalPacks) === true;

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

function resolveLiveModelRef(config?: OpenClawConfig): string {
  const liveConfig = readLiveConfig(config);
  return readTrimmedString(liveConfig.modelId) ?? DEFAULT_LIVE_MODEL_REF;
}

function resolveCandidateModelRef(config?: OpenClawConfig): string {
  const liveConfig = readLiveConfig(config);
  return readTrimmedString(liveConfig.candidateModelId) ?? resolveLiveModelRef(config);
}

async function getLiveRuntime(config?: OpenClawConfig): Promise<LiveRuntimeDeps> {
  const status = resolveModelMemoryLiveRuntimeStatus(config);
  if (!status.enabled) {
    throw new Error(status.reason ?? "model-memory live runtime disabled");
  }
  if (!status.databaseConfigured) {
    throw new Error(status.databaseError ?? "model-memory database is not configured");
  }

  const resolution = resolveModelMemoryDatabaseResolution({ config });
  const cacheKey = resolution.connectionString;
  if (!runtimeCache || runtimeCache.key !== cacheKey) {
    runtimeCache = {
      key: cacheKey,
      promise: (async () => {
        const db = await createModelMemoryDatabaseRuntime({ config });
        const executor = new OpenAICompatibleLiveJsonExecutor({ config });
        return {
          ...db,
          semanticInterpreter: new ExecutorBackedSemanticInterpreter(executor),
          collisionAdjudicator: new ExecutorBackedSemanticCollisionAdjudicator(executor),
        };
      })(),
    };
  }
  return runtimeCache.promise;
}

async function loadRuntimeReadModels(params: {
  config?: OpenClawConfig;
  sessionId?: string;
  workspaceDir?: string;
}): Promise<LiveRuntimeReadModels> {
  const runtime = await getLiveRuntime(params.config);
  const canonicalRepository = runtime.canonicalRepository;
  const runtimeRepository = runtime.runtimeRepository;

  let memoryObjects = await canonicalRepository.listMemoryObjects();
  let slots = await runtimeRepository.listActiveMemorySlots();
  let sets = await runtimeRepository.listActiveMemorySets();
  let artifacts = await runtimeRepository.listContextArtifacts();
  let projectionTargets = await runtimeRepository.listProjectionTargets();

  if (
    memoryObjects.length > 0 &&
    (slots.length === 0 || sets.length === 0 || projectionTargets.length === 0)
  ) {
    const rebuild = await rebuildDerivedRuntimeState({
      canonicalRepository,
      runtimeRepository,
    });
    memoryObjects = rebuild.memoryObjects;
    slots = rebuild.activeMemorySlots;
    sets = rebuild.activeMemorySets;
    artifacts = rebuild.contextArtifacts;
    projectionTargets = rebuild.projectionTargets;
  }

  const effectiveTargets =
    projectionTargets.length > 0 ? projectionTargets : DEFAULT_WORKSPACE_PROJECTION_TARGETS;
  const knownTargetIds = new Set(
    DEFAULT_WORKSPACE_PROJECTION_TARGETS.map((target) => target.targetId),
  );
  const compiled = effectiveTargets
    .filter((target) => target.enabled && knownTargetIds.has(target.targetId))
    .map(async (target) => {
      const existingFileContent = params.workspaceDir
        ? await fs
            .readFile(path.join(params.workspaceDir, target.relativePath), "utf8")
            .catch(() => undefined)
        : undefined;
      return compileProjection({
        targetId: target.targetId,
        memoryObjects,
        slots,
        sets,
        existingFileContent,
      });
    });
  const compiledResults = await Promise.all(compiled);

  return {
    memoryObjects,
    projectionTargets: effectiveTargets,
    projectionOutputs: Object.fromEntries(
      compiledResults.map((entry) => [entry.target.targetId, entry.renderedText]),
    ),
    projectionVersions: compiledResults.map((entry) => entry.version),
    contextArtifacts: artifacts,
    sessionState: params.sessionId
      ? await runtimeRepository.getSessionContextState(params.sessionId)
      : undefined,
  };
}

function buildExtraContextFiles(params: {
  artifacts: LiveRuntimeReadModels["contextArtifacts"];
  sessionSummaryArtifactId?: string;
}): Array<{ path: string; content: string }> {
  const latestArtifactByKey = new Map<string, LiveRuntimeReadModels["contextArtifacts"][number]>();
  for (const artifact of [...params.artifacts].toSorted((left, right) => {
    const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
    if (byBuiltAt !== 0) {
      return byBuiltAt;
    }
    return right.contentHash.localeCompare(left.contentHash);
  })) {
    if (
      artifact.artifactType !== "user_memory_pack" &&
      artifact.artifactType !== "project_memory_pack" &&
      artifact.artifactType !== "procedure_memory_pack" &&
      artifact.artifactType !== "session_summary_pack"
    ) {
      continue;
    }
    if (!artifact.renderedText?.trim()) {
      continue;
    }
    const key =
      artifact.artifactType === "session_summary_pack"
        ? params.sessionSummaryArtifactId && artifact.id === params.sessionSummaryArtifactId
          ? "session_summary_pack:current"
          : artifact.id
        : `${artifact.artifactType}:${artifact.scopeKey ?? "global"}`;
    if (!latestArtifactByKey.has(key)) {
      latestArtifactByKey.set(key, artifact);
    }
  }

  return [...latestArtifactByKey.values()].map((artifact, index) => ({
    path: `${MODEL_MEMORY_CONTEXT_PATH_PREFIX}/${index + 1}-${artifact.artifactType}.md`,
    content: artifact.renderedText ?? "",
  }));
}

export function buildProjectionBootstrapContextFiles(params: {
  projectionVersions: ProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
}): Array<{ path: string; content: string }> {
  const latestProjectionByTarget = new Map<string, ProjectionVersionRecord>();
  for (const version of [...params.projectionVersions].toSorted((left, right) => {
    const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
    if (byBuiltAt !== 0) {
      return byBuiltAt;
    }
    return right.id.localeCompare(left.id);
  })) {
    if (!BOOTSTRAP_PROJECTION_TARGET_IDS.has(version.targetId)) {
      continue;
    }
    if (!latestProjectionByTarget.has(version.targetId)) {
      latestProjectionByTarget.set(version.targetId, version);
    }
  }

  return [...latestProjectionByTarget.values()]
    .toSorted((left, right) => left.targetId.localeCompare(right.targetId))
    .flatMap((version) => {
      const content = params.projectionOutputs[version.targetId]?.trim();
      if (!content) {
        return [];
      }
      return [
        {
          path: version.canonicalArtifactPath,
          content,
        },
      ];
    });
}

export async function resolveModelMemoryBootstrapOverlay(params: {
  config?: OpenClawConfig;
  sessionId?: string;
  agentId?: string;
  workspaceDir?: string;
}): Promise<ModelMemoryBootstrapOverlay | null> {
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.databaseConfigured) {
    return null;
  }

  try {
    const readModels = await loadRuntimeReadModels({
      config: params.config,
      sessionId: params.sessionId,
      workspaceDir: params.workspaceDir,
    });

    return {
      contextFiles: [
        ...buildProjectionBootstrapContextFiles({
          projectionVersions: readModels.projectionVersions,
          projectionOutputs: readModels.projectionOutputs,
        }),
        ...buildExtraContextFiles({
          artifacts: readModels.contextArtifacts,
          sessionSummaryArtifactId: readModels.sessionState?.sessionSummaryArtifactId,
        }),
      ],
      projectionOutputs: readModels.projectionOutputs,
      projectionVersions: readModels.projectionVersions,
      status,
    };
  } catch (error) {
    log.warn(`model-memory bootstrap overlay unavailable: ${String(error)}`);
    return null;
  }
}

export async function warmModelMemoryLiveRuntime(params: {
  config?: OpenClawConfig;
}): Promise<ModelMemoryLiveRuntimeWarmResult> {
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled) {
    throw new Error(status.reason ?? "model-memory live runtime disabled");
  }
  if (!status.databaseConfigured) {
    throw new Error(status.databaseError ?? "model-memory database is not configured");
  }

  const runtime = await getLiveRuntime(params.config);
  const [memoryObjects, projectionTargets] = await Promise.all([
    runtime.canonicalRepository.listMemoryObjects(),
    runtime.runtimeRepository.listProjectionTargets(),
  ]);

  return {
    status,
    memoryObjectCount: memoryObjects.length,
    projectionTargetCount: projectionTargets.length,
  };
}

function normalizeCaptureText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

export async function captureModelMemoryAssistantTurn(params: {
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  userText: string;
  assistantText: string;
  sourceMetadata?: Record<string, unknown>;
}): Promise<void> {
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.captureWritesEnabled || !status.databaseConfigured) {
    return;
  }

  const assistantText = normalizeCaptureText(params.assistantText);
  const userText = normalizeCaptureText(params.userText);
  if (!assistantText || !userText) {
    return;
  }

  const runtime = await getLiveRuntime(params.config);
  await captureOrdinaryTurnLive({
    canonicalRepository: runtime.canonicalRepository,
    runtimeRepository: runtime.runtimeRepository,
    memoryStore: runtime.memoryStore,
    collisionAdjudicator: runtime.collisionAdjudicator,
    capture: {
      turn: {
        sessionId: params.sessionId,
        sourceMetadata: {
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          liveRuntime: true,
          ...params.sourceMetadata,
        },
        recentContext: [{ speaker: "user", text: userText }],
        currentTurnText: assistantText,
        currentTurnSpeaker: "assistant",
      },
      modelId: resolveLiveModelRef(params.config),
      candidateModelId: resolveCandidateModelRef(params.config),
      interpreter: runtime.semanticInterpreter,
    },
    rebuildRuntime: true,
  });
}

export function __resetModelMemoryLiveRuntimeForTest() {
  runtimeCache = undefined;
}
