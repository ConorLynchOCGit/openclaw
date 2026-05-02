import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { ExecutorBackedSemanticCollisionAdjudicator } from "../../../plugin-sdk/model-memory-legacy.js";
import {
  DEFAULT_WORKSPACE_PROJECTION_TARGETS,
  ExecutorBackedRetrievalFinalInclusionReviewer,
  ExecutorBackedRetrievalRequestInterpreter,
  ExecutorBackedSemanticInterpreter,
  compileProjection,
  listRuntimeMemoryRecords,
  materializeProjectionArtifacts,
  rebuildDerivedRuntimeState,
  type RuntimeMemoryRecord,
  type WorkspaceProjectionTargetRecord,
} from "../../../plugin-sdk/model-memory.js";
import {
  createModelMemoryDatabaseRuntime,
  resolveModelMemoryDatabaseResolution,
} from "../../model-memory.database.js";
import {
  resolveModelMemoryLiveRuntimeStatus,
  resolveProjectionArtifactMaterializationEnabled,
  type ModelMemoryLiveRuntimeStatus,
} from "./config.js";
import { CompositeModelMemoryJsonExecutor, ExecutorBackedMmV2SemanticInterpreter } from "./json.js";

const log = createSubsystemLogger("model-memory/live-runtime");

export type ModelMemoryLiveRuntimeWarmResult = {
  status: ModelMemoryLiveRuntimeStatus;
  memoryObjectCount: number;
  projectionTargetCount: number;
};

export type MmV2LiveRepositoryCapabilities = {
  listExistingMemorySummaries?: unknown;
  listExistingMemorySummariesForCapture?: unknown;
  persistLiveMemoryBatch?: (batch: unknown) => Promise<unknown>;
  withDbLane?: (
    lane: "retrieval" | "capture" | "rebuild" | "admin" | "default",
  ) => MmV2LiveRepositoryCapabilities;
  withTransaction?: (
    work: (repository: MmV2LiveRepositoryCapabilities) => Promise<unknown>,
  ) => Promise<unknown>;
  persistSource?: (source: unknown) => Promise<unknown>;
  persistSourceWindows?: (windows: unknown[]) => Promise<unknown>;
};

export type RuntimeRepositoryWithLane<T> = T & {
  withDbLane?: (lane: "retrieval" | "capture" | "rebuild" | "admin" | "default") => T;
};

export type LiveRuntimeDeps = Awaited<ReturnType<typeof createModelMemoryDatabaseRuntime>> & {
  semanticInterpreter: InstanceType<typeof ExecutorBackedSemanticInterpreter>;
  mmv2SemanticInterpreter: ExecutorBackedMmV2SemanticInterpreter;
  retrievalInterpreter: InstanceType<typeof ExecutorBackedRetrievalRequestInterpreter>;
  retrievalFinalInclusionReviewer: InstanceType<
    typeof ExecutorBackedRetrievalFinalInclusionReviewer
  >;
  collisionAdjudicator: InstanceType<typeof ExecutorBackedSemanticCollisionAdjudicator>;
};

export type ProjectionVersionRecord = ReturnType<typeof compileProjection>["version"];

export type LiveRuntimeReadModels = {
  memoryObjects: RuntimeMemoryRecord[];
  projectionTargets: WorkspaceProjectionTargetRecord[];
  projectionOutputs: Record<string, string>;
  projectionVersions: ProjectionVersionRecord[];
  contextArtifacts: Awaited<
    ReturnType<LiveRuntimeDeps["runtimeRepository"]["listContextArtifacts"]>
  >;
  sessionState?: Awaited<
    ReturnType<LiveRuntimeDeps["runtimeRepository"]["getSessionContextState"]>
  >;
};

let runtimeCache:
  | {
      key: string;
      promise: Promise<LiveRuntimeDeps>;
    }
  | undefined;

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

export async function getLiveRuntime(config?: OpenClawConfig): Promise<LiveRuntimeDeps> {
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
        const executor = new CompositeModelMemoryJsonExecutor(config);
        return {
          ...db,
          semanticInterpreter: new ExecutorBackedSemanticInterpreter(executor),
          mmv2SemanticInterpreter: new ExecutorBackedMmV2SemanticInterpreter(executor),
          retrievalInterpreter: new ExecutorBackedRetrievalRequestInterpreter(executor),
          retrievalFinalInclusionReviewer: new ExecutorBackedRetrievalFinalInclusionReviewer(
            executor,
            {
              modelId:
                process.env.MODEL_MEMORY_RETRIEVAL_FINAL_INCLUSION_MODEL_ID ??
                process.env.MODEL_MEMORY_RETRIEVAL_MODEL_ID ??
                "openai-codex/gpt-5.4-mini",
              reasoningEffort: "low",
            },
          ),
          collisionAdjudicator: new ExecutorBackedSemanticCollisionAdjudicator(executor),
        };
      })(),
    };
  }
  return runtimeCache.promise;
}

export async function loadRuntimeReadModels(params: {
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

export async function closeLiveRuntimeCacheForTests(): Promise<void> {
  const cached = runtimeCache;
  runtimeCache = undefined;
  if (!cached) {
    return;
  }
  try {
    const runtime = await cached.promise;
    await runtime.pool.end?.();
  } catch {
    // Best-effort cleanup for test/proof harnesses.
  }
}

export function resetLiveRuntimeCacheForTests() {
  void closeLiveRuntimeCacheForTests();
}
