import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_WORKSPACE_PROJECTION_TARGETS,
  ExecutorBackedRetrievalRequestInterpreter,
  ExecutorBackedSemanticCollisionAdjudicator,
  ExecutorBackedSemanticInterpreter,
  buildRetrievalPackArtifact,
  buildToolResultProofLiveCapture,
  captureOrdinaryTurnLive,
  classifyMemoryIngestionFailure,
  compileProjection,
  executeRetrieval,
  listRuntimeMemoryRecords,
  materializeProjectionArtifacts,
  rebuildDerivedRuntimeState,
  type ContextArtifactRecord,
  type RuntimeMemoryRecord,
  type SemanticInterpreter,
  type SemanticInterpreterInput,
  type MemoryIngestionFailureClass,
  type WorkspaceProjectionTargetRecord,
} from "../plugin-sdk/model-memory.js";
import { emitModelMemoryActivityFeedEvent } from "./model-memory.activity-feed.js";
import {
  resolveModelMemoryCaptureSeamSettings,
  type ModelMemoryCaptureSeamName,
} from "./model-memory.capture-seams.js";
import {
  createModelMemoryDatabaseRuntime,
  resolveModelMemoryDatabaseResolution,
} from "./model-memory.database.js";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.js";

const log = createSubsystemLogger("model-memory/live-runtime");

const MODEL_MEMORY_PLUGIN_ID = "model-memory";
const LIVE_MODEL_MEMORY_ENABLED_ENV = "MODEL_MEMORY_LIVE_ENABLED";
const MODEL_MEMORY_PROJECTION_ARTIFACTS_ENABLED_ENV = "MODEL_MEMORY_PROJECTION_ARTIFACTS_ENABLED";
const MODEL_MEMORY_TOOL_RESULT_PROOF_CAPTURE_ENABLED_ENV =
  "MODEL_MEMORY_TOOL_RESULT_PROOF_CAPTURE_ENABLED";
const DEFAULT_LIVE_MODEL_REF = "openrouter/openai/gpt-5.4-nano";
const MODEL_MEMORY_CONTEXT_PATH_PREFIX = ".openclaw/model-memory/context";
const MODEL_MEMORY_RETRIEVAL_CONTEXT_PATH = `${MODEL_MEMORY_CONTEXT_PATH_PREFIX}/retrieval-pack.md`;
const BOOTSTRAP_PROJECTION_TARGET_IDS = new Set(["memory-md", "user-md"]);

type JsonRecord = Record<string, unknown>;
type MmV2LiveRepositoryCapabilities = {
  listExistingMemorySummaries?: unknown;
  listExistingMemorySummariesForCapture?: unknown;
  persistLiveMemoryBatch?: (batch: unknown) => Promise<unknown>;
  withTransaction?: (
    work: (repository: MmV2LiveRepositoryCapabilities) => Promise<unknown>,
  ) => Promise<unknown>;
  persistSource?: (source: unknown) => Promise<unknown>;
  persistSourceWindows?: (windows: unknown[]) => Promise<unknown>;
};

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
  mmv2SemanticInterpreter: ExecutorBackedMmV2SemanticInterpreter;
  retrievalInterpreter: InstanceType<typeof ExecutorBackedRetrievalRequestInterpreter>;
  collisionAdjudicator: InstanceType<typeof ExecutorBackedSemanticCollisionAdjudicator>;
};

type LiveRuntimeReadModels = {
  memoryObjects: RuntimeMemoryRecord[];
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

function isActiveProjectionSource(memory: RuntimeMemoryRecord): boolean {
  return (
    memory.lifecycleState !== "superseded" &&
    memory.lifecycleState !== "expired" &&
    memory.lifecycleState !== "provisional" &&
    memory.lifecycleState !== "conflict_hold" &&
    !memory.supersededAt &&
    !memory.expiredAt
  );
}

function buildActiveProjectionSourceIds(memoryObjects: RuntimeMemoryRecord[]): Set<string> {
  return new Set(memoryObjects.filter(isActiveProjectionSource).map((memory) => memory.id));
}

type ProjectionVersionRecord = ReturnType<typeof compileProjection>["version"];

export type LiveRetrievalContextInput = {
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText?: string;
  workspaceDir?: string;
  maxResults?: number;
};

export type ModelMemoryToolResultProofCaptureResult =
  | {
      captured: true;
      sourceId: string;
      segmentIds: string[];
      memoryIds: string[];
      eventIds: string[];
      boundedFact: Record<string, unknown>;
    }
  | {
      captured: false;
      reason: "disabled" | "no_bounded_fact" | "model_memory_unavailable" | "write_unavailable";
    };

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

function readNestedRecord(
  value: unknown,
  pathParts: string[],
): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

function stripOuterJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractStructuredJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return text.trim();
}

export function parseMmV2RawJsonOutput(outputText: string): unknown {
  return JSON.parse(extractStructuredJsonCandidate(stripOuterJsonCodeFence(outputText)));
}

class ExecutorBackedMmV2SemanticInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: OpenAICompatibleLiveJsonExecutor) {}

  async interpret(input: SemanticInterpreterInput) {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    return {
      action: "capture" as const,
      objects: [parseMmV2RawJsonOutput(response.outputText)],
    };
  }
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

function resolveProjectionArtifactMaterializationEnabled(
  config?: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envEnabled = resolveBooleanEnv(env[MODEL_MEMORY_PROJECTION_ARTIFACTS_ENABLED_ENV]);
  if (envEnabled !== undefined) {
    return envEnabled;
  }
  const liveConfig = readLiveConfig(config);
  const projections = isRecord(liveConfig.projections) ? liveConfig.projections : {};
  const materializeArtifacts = isRecord(projections.materializeArtifacts)
    ? projections.materializeArtifacts
    : {};
  return readBoolean(materializeArtifacts.enabled) ?? true;
}

function resolveToolResultProofCaptureEnabled(
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
  const toolResultProof = isRecord(captureSeams.toolResultProofCapture)
    ? captureSeams.toolResultProofCapture
    : {};
  return readBoolean(toolResultProof.enabled) ?? false;
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

function resolveRetrievalModelRef(config?: OpenClawConfig): string {
  const liveConfig = readLiveConfig(config);
  return readTrimmedString(liveConfig.retrievalModelId) ?? resolveLiveModelRef(config);
}

function resolveLiveRetrievalMaxResults(config?: OpenClawConfig): number {
  const liveConfig = readLiveConfig(config);
  const configured = liveConfig.maxRetrievalResults;
  if (typeof configured === "number" && Number.isFinite(configured)) {
    return Math.min(20, Math.max(1, Math.trunc(configured)));
  }
  return 8;
}

function normalizeRetrievalTurnText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

export function shouldAttemptLiveRetrievalContext(params: {
  status: ModelMemoryLiveRuntimeStatus;
  currentTurnText?: string;
}): boolean {
  return (
    params.status.enabled &&
    params.status.databaseConfigured &&
    params.status.includeRetrievalPacks &&
    normalizeRetrievalTurnText(params.currentTurnText).length > 0
  );
}

export function buildLiveRetrievalEnvelope(params: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText: string;
  maxResults?: number;
}) {
  const scope: Record<string, unknown> = {
    liveContextPath: "bootstrap_context",
    retrievalScope: "live_ordinary_turn",
  };
  if (params.sessionKey) {
    scope.sessionKey = params.sessionKey;
  }
  if (params.agentId) {
    scope.agentId = params.agentId;
  }

  return {
    queryText: normalizeRetrievalTurnText(params.currentTurnText),
    requestPurpose: "live_context_injection",
    scope,
    sessionId: params.sessionId,
    agentId: params.agentId,
    maxResults: params.maxResults ?? 8,
  };
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
          mmv2SemanticInterpreter: new ExecutorBackedMmV2SemanticInterpreter(executor),
          retrievalInterpreter: new ExecutorBackedRetrievalRequestInterpreter(executor),
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

  let memoryObjects = await listRuntimeMemoryRecords(canonicalRepository);
  let slots = await runtimeRepository.listActiveMemorySlots();
  let sets = await runtimeRepository.listActiveMemorySets();
  let artifacts = await runtimeRepository.listContextArtifacts();
  let projectionTargets = await runtimeRepository.listProjectionTargets();

  if (
    memoryObjects.length > 0 &&
    (slots.length === 0 || sets.length === 0 || projectionTargets.length === 0)
  ) {
    const rebuild = await rebuildDerivedRuntimeState({
      canonicalRepository: canonicalRepository as never,
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
  const projectionBuiltAt = new Date();
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
        builtAt: projectionBuiltAt,
      });
    });
  const compiledResults = await Promise.all(compiled);
  try {
    await Promise.all(
      compiledResults.map((entry) => runtimeRepository.persistProjectionVersion(entry.version)),
    );
    projectionTargets = await runtimeRepository.listProjectionTargets();
  } catch (error) {
    log.warn(`model-memory projection version persistence unavailable: ${String(error)}`);
  }
  if (params.workspaceDir && resolveProjectionArtifactMaterializationEnabled(params.config)) {
    try {
      await materializeProjectionArtifacts({
        workspaceRoot: params.workspaceDir,
        entries: compiledResults.map((entry) => ({
          targetId: entry.target.targetId,
          renderedText: entry.renderedText,
          version: entry.version,
          digest: entry.digest,
        })),
        activeMemoryIds: buildActiveProjectionSourceIds(memoryObjects),
        generatedAt: projectionBuiltAt,
      });
    } catch (error) {
      log.warn(`model-memory projection artifact materialization unavailable: ${String(error)}`);
    }
  }

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

function retrievalContextFileFromArtifact(
  artifact: ContextArtifactRecord | undefined,
): Array<{ path: string; content: string }> {
  const content = artifact?.renderedText?.trim();
  if (!content) {
    return [];
  }
  return [
    {
      path: MODEL_MEMORY_RETRIEVAL_CONTEXT_PATH,
      content,
    },
  ];
}

async function buildLiveRetrievalContextArtifact(params: {
  runtime: LiveRuntimeDeps;
  readModels: LiveRuntimeReadModels;
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText: string;
  maxResults?: number;
}): Promise<ContextArtifactRecord | undefined> {
  const envelope = buildLiveRetrievalEnvelope({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    currentTurnText: params.currentTurnText,
    maxResults: params.maxResults ?? resolveLiveRetrievalMaxResults(params.config),
  });
  if (!envelope.queryText) {
    return undefined;
  }

  const retrieval = await executeRetrieval({
    envelope,
    interpreter: params.runtime.retrievalInterpreter,
    memoryObjects: params.readModels.memoryObjects,
    modelId: resolveRetrievalModelRef(params.config),
    store: params.runtime.retrievalStore,
    createdAt: new Date(),
    projectionVersions: params.readModels.projectionVersions,
  });
  if (!retrieval) {
    return undefined;
  }

  const artifact = buildRetrievalPackArtifact({
    retrievalRequest: retrieval.retrievalRequest,
    retrievalResultSet: retrieval.retrievalResultSet,
    retrievalResultItems: retrieval.retrievalResultItems,
    memoryObjects: params.readModels.memoryObjects,
    buildPolicyVersion: "memory-retrieval-runtime.live.v1",
    retrievalPlan: retrieval.retrievalPlan,
    retrievalCandidates: retrieval.retrievalCandidates,
    retrievalExclusions: retrieval.retrievalExclusions,
    selectedProjectionDigests: retrieval.selectedProjectionDigests,
    projectionVersions: params.readModels.projectionVersions,
  });
  const persisted = await params.runtime.runtimeRepository.persistContextArtifact(artifact);
  await params.runtime.retrievalStore.updatePackedArtifactId?.(
    retrieval.retrievalResultSet.id,
    persisted.id,
  );
  void emitModelMemoryActivityFeedEvent({
    kind: "retrieval",
    status: "completed",
    config: params.config,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    stableId: retrieval.retrievalResultSet.id,
    safeLabels: {
      purpose: retrieval.retrievalRequest.requestPurpose,
      artifact: "retrieval_pack",
    },
    ids: {
      retrievalRequestId: retrieval.retrievalRequest.id,
      retrievalResultSetId: retrieval.retrievalResultSet.id,
      retrievalPackArtifactId: persisted.id,
      selectedMemoryIds: retrieval.retrievalResultItems
        .filter((item) => item.selectedForContext)
        .map((item) => item.memoryObjectId),
      projectionIds: retrieval.selectedProjectionDigests.map((digest) => digest.projectionId),
    },
    metrics: {
      candidates: retrieval.retrievalCandidates.length,
      selected: retrieval.retrievalResultItems.filter((item) => item.selectedForContext).length,
      excluded: retrieval.retrievalExclusions.length,
      projections: retrieval.selectedProjectionDigests.length,
    },
  }).catch(() => undefined);
  return persisted;
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
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  currentTurnText?: string;
}): Promise<ModelMemoryBootstrapOverlay | null> {
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.databaseConfigured) {
    return null;
  }

  try {
    const runtime = await getLiveRuntime(params.config);
    const readModels = await loadRuntimeReadModels({
      config: params.config,
      sessionId: params.sessionId,
      workspaceDir: params.workspaceDir,
    });
    let retrievalArtifact: ContextArtifactRecord | undefined;
    if (
      shouldAttemptLiveRetrievalContext({
        status,
        currentTurnText: params.currentTurnText,
      })
    ) {
      try {
        retrievalArtifact = await buildLiveRetrievalContextArtifact({
          runtime,
          readModels,
          config: params.config,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          currentTurnText: params.currentTurnText!,
        });
      } catch (error) {
        log.warn(`model-memory live retrieval context unavailable: ${String(error)}`);
      }
    }

    return {
      contextFiles: [
        ...buildProjectionBootstrapContextFiles({
          projectionVersions: readModels.projectionVersions,
          projectionOutputs: readModels.projectionOutputs,
        }),
        ...retrievalContextFileFromArtifact(retrievalArtifact),
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
    listRuntimeMemoryRecords(runtime.canonicalRepository),
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

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export type ModelMemoryRuntimeDirtySnapshot = {
  dirty: boolean;
  reason?: string;
  affectedMemoryIds: string[];
  writeCountSinceLastRebuild: number;
  markedAt?: string;
  lastRebuildAt?: string;
};

const runtimeDirtyState: {
  dirty: boolean;
  reason?: string;
  affectedMemoryIds: Set<string>;
  writeCountSinceLastRebuild: number;
  markedAt?: Date;
  lastRebuildAt?: Date;
} = {
  dirty: false,
  affectedMemoryIds: new Set(),
  writeCountSinceLastRebuild: 0,
};

function snapshotRuntimeDirtyState(): ModelMemoryRuntimeDirtySnapshot {
  return {
    dirty: runtimeDirtyState.dirty,
    reason: runtimeDirtyState.reason,
    affectedMemoryIds: [...runtimeDirtyState.affectedMemoryIds].toSorted(),
    writeCountSinceLastRebuild: runtimeDirtyState.writeCountSinceLastRebuild,
    markedAt: runtimeDirtyState.markedAt?.toISOString(),
    lastRebuildAt: runtimeDirtyState.lastRebuildAt?.toISOString(),
  };
}

export function markModelMemoryRuntimeDirty(input: {
  reason: string;
  memoryIds?: string[];
  markedAt?: Date;
}): ModelMemoryRuntimeDirtySnapshot {
  runtimeDirtyState.dirty = true;
  runtimeDirtyState.reason = input.reason;
  runtimeDirtyState.markedAt = input.markedAt ?? new Date();
  runtimeDirtyState.writeCountSinceLastRebuild += 1;
  for (const memoryId of input.memoryIds ?? []) {
    if (memoryId.trim()) {
      runtimeDirtyState.affectedMemoryIds.add(memoryId);
    }
  }
  return snapshotRuntimeDirtyState();
}

export function getModelMemoryRuntimeDirtySnapshot(): ModelMemoryRuntimeDirtySnapshot {
  return snapshotRuntimeDirtyState();
}

export function resetModelMemoryRuntimeDirtyStateForTests(): void {
  runtimeDirtyState.dirty = false;
  runtimeDirtyState.reason = undefined;
  runtimeDirtyState.affectedMemoryIds.clear();
  runtimeDirtyState.writeCountSinceLastRebuild = 0;
  runtimeDirtyState.markedAt = undefined;
  runtimeDirtyState.lastRebuildAt = undefined;
}

function buildCaptureJobId(params: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  userText: string;
  assistantText: string;
}): string {
  const digest = sha256Text(
    JSON.stringify({
      sessionId: params.sessionId ?? null,
      sessionKey: params.sessionKey ?? null,
      agentId: params.agentId ?? null,
      userSha256: sha256Text(params.userText),
      assistantSha256: sha256Text(params.assistantText),
    }),
  ).slice(0, 24);
  return `capture_job_${digest}`;
}

function classifyCaptureFailure(error: unknown): MemoryIngestionFailureClass {
  return classifyMemoryIngestionFailure(error instanceof Error ? error.message : String(error));
}

function safeStringLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function shouldSkipOrdinaryTurnCaptureForExplicitOptOut(userText: string): boolean {
  const normalized = userText.toLowerCase();
  return (
    /\bdo\s+not\s+(?:remember|store|retain|save)\b/.test(normalized) ||
    /\bdon't\s+(?:remember|store|retain|save)\b/.test(normalized) ||
    /\bdo\s+not\s+change\s+(?:durable\s+)?memory\b/.test(normalized) ||
    /\bdon't\s+change\s+(?:durable\s+)?memory\b/.test(normalized) ||
    /\bfor\s+this\s+one\s+(?:answer|reply|turn)\s+only\b/.test(normalized)
  );
}

function hasToolCallEvidence(sourceMetadata: Record<string, unknown> | undefined): boolean {
  const toolCallCount = sourceMetadata?.toolCallCount;
  return typeof toolCallCount === "number" && toolCallCount > 0;
}

export function hasExplicitDurableCaptureSignal(userText: string): boolean {
  const normalized = userText.toLowerCase();
  return (
    /\bplease\s+remember\b/.test(normalized) ||
    /\bremember\s+this\b/.test(normalized) ||
    /\bstore\s+this\b/.test(normalized) ||
    /\bdurable\s+(?:workspace\s+)?(?:project\s+)?fact\b/.test(normalized) ||
    /\bdurable\s+correction\b/.test(normalized) ||
    /\bstanding\s+(?:instruction|preference|directive)\b/.test(normalized) ||
    /\bthis\s+is\s+a\s+standing\s+(?:instruction|preference|directive)\b/.test(normalized)
  );
}

export function shouldSkipOrdinaryTurnCaptureForToolDedupe(params: {
  userText: string;
  sourceMetadata?: Record<string, unknown>;
}): boolean {
  return (
    hasToolCallEvidence(params.sourceMetadata) && !hasExplicitDurableCaptureSignal(params.userText)
  );
}

export function buildCompletedAssistantTurnCaptureInput(params: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  userText: string;
  assistantText: string;
  sourceMetadata?: Record<string, unknown>;
}): {
  turn: {
    sessionId?: string;
    sourceMetadata: Record<string, unknown>;
    currentTurnText: string;
    currentTurnSpeaker: "user";
  };
} | null {
  const assistantText = normalizeCaptureText(params.assistantText);
  const userText = normalizeCaptureText(params.userText);
  if (!assistantText || !userText) {
    return null;
  }
  if (shouldSkipOrdinaryTurnCaptureForExplicitOptOut(userText)) {
    return null;
  }
  if (
    shouldSkipOrdinaryTurnCaptureForToolDedupe({
      userText,
      sourceMetadata: params.sourceMetadata,
    })
  ) {
    return null;
  }

  return {
    turn: {
      sessionId: params.sessionId,
      sourceMetadata: {
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        liveRuntime: true,
        assistantResponseSha256: sha256Text(assistantText),
        assistantResponseLength: assistantText.length,
        ...params.sourceMetadata,
      },
      currentTurnText: userText,
      currentTurnSpeaker: "user",
    },
  };
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
  const captureJobId = buildCaptureJobId(params);
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.captureWritesEnabled || !status.databaseConfigured) {
    void emitModelMemoryActivityFeedEvent({
      kind: "ordinary_turn_capture",
      status: "skipped",
      eventType: "capture_skipped",
      config: params.config,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      stableId: captureJobId,
      safeLabels: { reason: "disabled" },
      ids: { captureJobId },
    }).catch(() => undefined);
    return;
  }

  const captureInput = buildCompletedAssistantTurnCaptureInput(params);
  if (!captureInput) {
    void emitModelMemoryActivityFeedEvent({
      kind: "ordinary_turn_capture",
      status: "skipped",
      eventType: "capture_skipped",
      config: params.config,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      stableId: captureJobId,
      safeLabels: { reason: "no_durable_candidate" },
      ids: { captureJobId },
    }).catch(() => undefined);
    return;
  }

  const captureStartedAt = Date.now();
  const modelId = resolveLiveModelRef(params.config);
  const candidateModelId = resolveCandidateModelRef(params.config);
  const emitCaptureEvent = (
    event: Omit<
      Parameters<typeof emitModelMemoryActivityFeedEvent>[0],
      "kind" | "config" | "sessionId" | "sessionKey" | "agentId" | "stableId"
    >,
  ) =>
    emitModelMemoryActivityFeedEvent({
      kind: "ordinary_turn_capture",
      config: params.config,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      stableId: captureJobId,
      ...event,
      ids: {
        captureJobId,
        ...event.ids,
      },
    });

  void emitCaptureEvent({
    status: "queued",
    eventType: "capture_queued",
    safeLabels: {
      provider: safeStringLabel(params.sourceMetadata?.provider, "unknown"),
      model: safeStringLabel(params.sourceMetadata?.model, modelId),
    },
  }).catch(() => undefined);

  try {
    await emitCaptureEvent({
      status: "started",
      eventType: "capture_started",
      safeLabels: {
        provider: safeStringLabel(params.sourceMetadata?.provider, "unknown"),
        model: safeStringLabel(params.sourceMetadata?.model, modelId),
      },
    }).catch(() => undefined);

    const runtime = await getLiveRuntime(params.config);
    const canonicalRepository = runtime.canonicalRepository as typeof runtime.canonicalRepository &
      MmV2LiveRepositoryCapabilities;
    const canUseMmV2LivePath =
      typeof canonicalRepository.listExistingMemorySummaries === "function" &&
      typeof canonicalRepository.persistLiveMemoryBatch === "function";
    const result = await captureOrdinaryTurnLive({
      canonicalRepository: runtime.canonicalRepository as never,
      runtimeRepository: runtime.runtimeRepository,
      memoryStore: runtime.memoryStore as never,
      collisionAdjudicator: runtime.collisionAdjudicator,
      capture: {
        turn: captureInput.turn,
        modelId,
        candidateModelId,
        interpreter: canUseMmV2LivePath
          ? runtime.mmv2SemanticInterpreter
          : runtime.semanticInterpreter,
      },
      rebuildRuntime: false,
    });
    const memoryIds = result.writeResults.flatMap((entry) =>
      entry.memoryId ? [entry.memoryId] : [],
    );
    const dirtyState = markModelMemoryRuntimeDirty({
      reason: "ordinary_turn_capture_written",
      memoryIds,
    });
    await emitCaptureEvent({
      status: "completed",
      eventType: "capture_written",
      ids: {
        sourceId: result.source.id,
        segmentIds: result.windows.map((window) => window.id),
        memoryIds,
      },
      metrics: {
        latencyMs: Date.now() - captureStartedAt,
        retryCount: 0,
        segments: result.windows.length,
        writeResults: result.writeResults.length,
        memories: memoryIds.length,
      },
    }).catch(() => undefined);
    await emitCaptureEvent({
      status: "deferred",
      eventType: "runtime_rebuild_deferred",
      safeLabels: { reason: dirtyState.reason ?? "ordinary_turn_capture_written" },
      ids: {
        memoryIds: dirtyState.affectedMemoryIds,
      },
      metrics: {
        writeCountSinceLastRebuild: dirtyState.writeCountSinceLastRebuild,
      },
    }).catch(() => undefined);
  } catch (error) {
    const failureClass = classifyCaptureFailure(error);
    await emitCaptureEvent({
      status: "failed",
      eventType: "capture_failed",
      safeLabels: {
        failureClass,
        stage:
          failureClass === "db_persistence" || failureClass === "timeout"
            ? "persistence_boundary"
            : "execution",
      },
      metrics: {
        latencyMs: Date.now() - captureStartedAt,
        retryCount: 0,
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function captureModelMemoryToolResultProof(params: {
  config?: OpenClawConfig;
  hookName: Extract<ModelMemoryCaptureSeamName, "tool_result_persist" | "after_tool_call">;
  toolName: string;
  toolCallId?: string;
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  result: unknown;
  isError?: boolean;
  observedAt?: Date;
}): Promise<ModelMemoryToolResultProofCaptureResult> {
  const emitToolCaptureActivity = (
    result: ModelMemoryToolResultProofCaptureResult,
  ): ModelMemoryToolResultProofCaptureResult => {
    void emitModelMemoryActivityFeedEvent({
      kind: "tool_result_capture",
      status: result.captured ? "completed" : "skipped",
      config: params.config,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      runId: params.runId,
      agentId: params.agentId,
      stableId: params.toolCallId ?? `${params.hookName}:${params.toolName}`,
      safeLabels: {
        hook: params.hookName,
        tool: params.toolName,
        ...(result.captured ? {} : { reason: result.reason }),
      },
      ids: result.captured
        ? {
            sourceId: result.sourceId,
            segmentIds: result.segmentIds,
            memoryIds: result.memoryIds,
            eventIds: result.eventIds,
          }
        : undefined,
      metrics: result.captured
        ? {
            segments: result.segmentIds.length,
            memories: result.memoryIds.length,
            events: result.eventIds.length,
          }
        : undefined,
    }).catch(() => undefined);
    return result;
  };
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  const seamSettings = resolveModelMemoryCaptureSeamSettings({
    seamName: params.hookName,
    config: params.config,
  });
  if (
    !status.enabled ||
    !status.captureWritesEnabled ||
    !status.databaseConfigured ||
    !seamSettings.enabled ||
    !seamSettings.seamEnabled ||
    !resolveToolResultProofCaptureEnabled(params.config)
  ) {
    return emitToolCaptureActivity({ captured: false, reason: "disabled" });
  }

  const built = buildToolResultProofLiveCapture({
    toolName: params.toolName,
    toolCallId: params.toolCallId,
    runId: params.runId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    result: params.result,
    isError: params.isError,
    observedAt: params.observedAt,
  });
  if (!built) {
    return emitToolCaptureActivity({ captured: false, reason: "no_bounded_fact" });
  }

  const runtime = await getLiveRuntime(params.config).catch(() => undefined);
  if (!runtime) {
    return emitToolCaptureActivity({ captured: false, reason: "model_memory_unavailable" });
  }
  const canonicalRepository = runtime.canonicalRepository as typeof runtime.canonicalRepository &
    MmV2LiveRepositoryCapabilities;
  const persistLiveMemoryBatch = canonicalRepository.persistLiveMemoryBatch;
  if (typeof persistLiveMemoryBatch !== "function") {
    return emitToolCaptureActivity({ captured: false, reason: "write_unavailable" });
  }

  if (typeof canonicalRepository.withTransaction === "function") {
    await canonicalRepository.withTransaction(async (transactionRepository) => {
      if (
        typeof transactionRepository.persistSource !== "function" ||
        typeof transactionRepository.persistSourceWindows !== "function" ||
        typeof transactionRepository.persistLiveMemoryBatch !== "function"
      ) {
        throw new Error(
          "MMV2 tool-result proof capture transaction repository is missing write capabilities.",
        );
      }
      await transactionRepository.persistSource(built.source);
      await transactionRepository.persistSourceWindows(built.windows);
      await transactionRepository.persistLiveMemoryBatch(built.liveMemoryBatch);
    });
  } else {
    await runtime.canonicalRepository.persistSource(built.source);
    await runtime.canonicalRepository.persistSourceWindows(built.windows);
    await persistLiveMemoryBatch(built.liveMemoryBatch);
  }
  await rebuildDerivedRuntimeState({
    canonicalRepository: runtime.canonicalRepository as never,
    runtimeRepository: runtime.runtimeRepository,
  });

  return emitToolCaptureActivity({
    captured: true,
    sourceId: built.source.id,
    segmentIds: built.windows.map((window) => window.id),
    memoryIds: built.liveMemoryBatch.durableMemories.map((memory) => memory.memory_id),
    eventIds: built.liveMemoryBatch.memoryEvents.map((event) => event.memory_event_id),
    boundedFact: built.boundedFact as Record<string, unknown>,
  });
}

export function __resetModelMemoryLiveRuntimeForTest() {
  runtimeCache = undefined;
}
