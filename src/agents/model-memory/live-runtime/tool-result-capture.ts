import type { OpenClawConfig } from "../../../config/config.js";
import {
  buildToolResultMemoryTraceId,
  buildToolResultProofLiveCapture,
  createMemoryIngestionTelemetryEvent,
  emitMemoryIngestionCloseoutIfConfigured,
  rebuildDerivedRuntimeState,
  type LiveMemoryPersistenceResult,
} from "../../../plugin-sdk/model-memory.js";
import { emitModelMemoryActivityFeedEvent } from "../../model-memory.activity-feed.js";
import {
  resolveModelMemoryCaptureSeamSettings,
  type ModelMemoryCaptureSeamName,
} from "../../model-memory.capture-seams.js";
import {
  buildPoolPressureError,
  mapRuntimeDirtyResultToCloseoutState,
  markModelMemoryRuntimeDirty,
} from "./dirty-state.js";
import { resolveLiveModelRef, resolveModelMemoryLiveRuntimeStatus, resolveToolResultProofCaptureEnabled } from "./config.js";
import {
  getLiveRuntime,
  type MmV2LiveRepositoryCapabilities,
  type RuntimeRepositoryWithLane,
} from "./runtime-deps.js";

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
      reason:
        | "disabled"
        | "no_bounded_fact"
        | "model_memory_unavailable"
        | "write_unavailable"
        | "pool_pressure";
    };

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
  traceId?: string;
}): Promise<ModelMemoryToolResultProofCaptureResult> {
  const memoryTraceId =
    params.traceId ??
    buildToolResultMemoryTraceId({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      runId: params.runId,
      toolCallId: params.toolCallId,
      hookName: params.hookName,
      toolName: params.toolName,
    });
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
      ids: {
        memoryTraceId,
        ...(result.captured
          ? {
              sourceId: result.sourceId,
              segmentIds: result.segmentIds,
              memoryIds: result.memoryIds,
              eventIds: result.eventIds,
            }
          : {}),
      },
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
  if (runtime.dbLaneController.shouldDeferLane("capture")) {
    return emitToolCaptureActivity({
      captured: false,
      reason: "pool_pressure",
    });
  }
  const canonicalRepositoryBase =
    runtime.canonicalRepository as typeof runtime.canonicalRepository &
      MmV2LiveRepositoryCapabilities;
  const canonicalRepository =
    canonicalRepositoryBase.withDbLane?.("capture") ?? canonicalRepositoryBase;
  const persistLiveMemoryBatch = canonicalRepository.persistLiveMemoryBatch;
  if (typeof persistLiveMemoryBatch !== "function") {
    return emitToolCaptureActivity({ captured: false, reason: "write_unavailable" });
  }

  let persistenceResult: LiveMemoryPersistenceResult;
  if (typeof canonicalRepository.withTransaction === "function") {
    persistenceResult = (await canonicalRepository.withTransaction(
      async (transactionRepository) => {
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
        return await transactionRepository.persistLiveMemoryBatch(built.liveMemoryBatch);
      },
    )) as LiveMemoryPersistenceResult;
  } else {
    await runtime.canonicalRepository.persistSource(built.source);
    await runtime.canonicalRepository.persistSourceWindows(built.windows);
    persistenceResult = (await persistLiveMemoryBatch(
      built.liveMemoryBatch,
    )) as LiveMemoryPersistenceResult;
  }
  const memoryIds =
    persistenceResult.durableMemoriesWritten.length > 0
      ? persistenceResult.durableMemoriesWritten
      : built.liveMemoryBatch.durableMemories.map((memory) => memory.memory_id);
  const eventIds =
    persistenceResult.memoryEventsWritten.length > 0
      ? persistenceResult.memoryEventsWritten
      : built.liveMemoryBatch.memoryEvents.map((event) => event.memory_event_id);
  const dirtyResult = await markModelMemoryRuntimeDirty({
    config: params.config,
    env: process.env,
    kind: "tool_result_capture",
    reason: "tool_result_capture_written",
    traceIds: [memoryTraceId],
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    memoryIds,
    sourceIds: [built.source.id],
    eventIds,
    rebuild: async () => {
      const rebuildPressureSnapshot = runtime.dbLaneController.snapshot();
      if (runtime.dbLaneController.shouldDeferLane("rebuild")) {
        throw buildPoolPressureError("rebuild", rebuildPressureSnapshot.reasons);
      }
      const rebuildCanonicalRepository =
        (
          runtime.canonicalRepository as typeof runtime.canonicalRepository &
            MmV2LiveRepositoryCapabilities
        ).withDbLane?.("rebuild") ?? runtime.canonicalRepository;
      await rebuildDerivedRuntimeState({
        canonicalRepository: rebuildCanonicalRepository as never,
        runtimeRepository:
          (
            runtime.runtimeRepository as RuntimeRepositoryWithLane<typeof runtime.runtimeRepository>
          ).withDbLane?.("rebuild") ?? runtime.runtimeRepository,
      });
    },
  });

  const telemetryEvents = [
    createMemoryIngestionTelemetryEvent({
      path: "tool_result_capture",
      stage: "semantic_contract_boundary",
      status: "completed",
      candidate_counts: {
        extracted: built.liveMemoryBatch.durableMemories.length,
        valid: built.liveMemoryBatch.durableMemories.length,
      },
      ids: {
        memory_trace_ids: [memoryTraceId],
      },
    }),
    createMemoryIngestionTelemetryEvent({
      path: "tool_result_capture",
      stage: "persistence_boundary",
      status: "completed",
      candidate_counts: {
        admitted: persistenceResult.durableMemoriesWritten.length,
        rejected: persistenceResult.deferredCandidates.length,
      },
      ids: {
        memory_trace_ids: [memoryTraceId],
        memory_ids: memoryIds,
        event_ids: eventIds,
      },
    }),
  ];
  await emitMemoryIngestionCloseoutIfConfigured({
    env: process.env,
    path: "tool_result_capture",
    traceId: memoryTraceId,
    runId: params.runId,
    sourceId: built.source.id,
    sourceHash: built.source.sourceFingerprint,
    telemetryEvents,
    persistenceResult,
    dirtyState: mapRuntimeDirtyResultToCloseoutState(dirtyResult),
    provider: "strict_capture_default",
    model: resolveLiveModelRef(params.config, process.env),
  });

  return emitToolCaptureActivity({
    captured: true,
    sourceId: built.source.id,
    segmentIds: built.windows.map((window) => window.id),
    memoryIds,
    eventIds,
    boundedFact: built.boundedFact as Record<string, unknown>,
  });
}
