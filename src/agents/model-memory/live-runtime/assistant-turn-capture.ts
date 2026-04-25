import { createHash } from "node:crypto";
import type { OpenClawConfig } from "../../../config/config.js";
import {
  buildOrdinaryTurnMemoryTraceId,
  captureOrdinaryTurnLive,
  classifyLiveTurnSourceAuthority,
  emitMemoryIngestionCloseoutIfConfigured,
  rebuildDerivedRuntimeState,
} from "../../../plugin-sdk/model-memory.js";
import { emitModelMemoryActivityFeedEvent } from "../../model-memory.activity-feed.js";
import {
  buildMemoryCaptureJob,
  buildOrdinaryTurnCaptureSourceHash,
  createMemoryCaptureJobStore,
  runMemoryCaptureJobTask,
  type MemoryCaptureJobEvent,
  type MemoryCaptureJobStatus,
} from "../../model-memory.capture-jobs.js";
import {
  resolveCandidateModelRef,
  resolveLiveModelRef,
  resolveModelMemoryLiveRuntimeStatus,
} from "./config.js";
import {
  buildPoolPressureError,
  classifyCaptureFailure,
  mapRuntimeDirtyResultToCloseoutState,
  markModelMemoryRuntimeDirty,
} from "./dirty-state.js";
import {
  getLiveRuntime,
  type MmV2LiveRepositoryCapabilities,
  type RuntimeRepositoryWithLane,
} from "./runtime-deps.js";

function normalizeCaptureText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

function safeStringLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function mapCaptureJobActivityStatus(status: MemoryCaptureJobStatus) {
  if (status === "written") {
    return "completed" as const;
  }
  if (status === "retry_scheduled" || status === "replay_requested") {
    return "scheduled" as const;
  }
  return status;
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
  const sourceAuthority = classifyLiveTurnSourceAuthority(userText);
  if (
    sourceAuthority &&
    (sourceAuthority.decision === "reject" || sourceAuthority.decision === "inspection_only")
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
        ...(sourceAuthority
          ? {
              sourceAuthority: sourceAuthority.metadata,
              sourceAuthorityDecision: sourceAuthority.decision,
              sourceAuthorityReasonCodes: sourceAuthority.reasonCodes,
              softSourceRefs: sourceAuthority.sourceRefs,
            }
          : {}),
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
  traceId?: string;
}): Promise<void> {
  const captureJobId = buildCaptureJobId(params);
  const memoryTraceId =
    params.traceId ??
    buildOrdinaryTurnMemoryTraceId({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      currentTurnText: params.userText,
    });
  const modelId = resolveLiveModelRef(params.config);
  const candidateModelId = resolveCandidateModelRef(params.config);
  const providerLabel = safeStringLabel(params.sourceMetadata?.provider, "unknown");
  const modelLabel = safeStringLabel(params.sourceMetadata?.model, modelId);
  const captureJobStore = createMemoryCaptureJobStore();
  const captureJob = buildMemoryCaptureJob({
    jobId: captureJobId,
    traceId: memoryTraceId,
    sourceKind: "ordinary_turn",
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    sourceHash: buildOrdinaryTurnCaptureSourceHash(params),
    provider: providerLabel,
    model: modelLabel,
  });
  const emitJobEvent = (event: MemoryCaptureJobEvent) =>
    emitModelMemoryActivityFeedEvent({
      kind: "ordinary_turn_capture",
      status: mapCaptureJobActivityStatus(event.status),
      eventType: event.eventType,
      config: params.config,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      stableId: captureJobId,
      safeLabels: {
        provider: event.provider ?? providerLabel,
        model: event.model ?? modelLabel,
        failureClass: event.failureClass,
        stage: event.stage,
      },
      ids: {
        memoryTraceId: event.traceId ?? memoryTraceId,
        captureJobId: event.jobId,
        sourceId: event.safeRelatedIds?.sourceId,
        segmentIds: event.safeRelatedIds?.segmentIds,
        memoryIds: event.safeRelatedIds?.memoryIds,
        eventIds: event.safeRelatedIds?.eventIds,
      },
      metrics: event.metrics,
    });

  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.captureWritesEnabled || !status.databaseConfigured) {
    await runMemoryCaptureJobTask({
      job: captureJob,
      store: captureJobStore,
      classifyFailure: classifyCaptureFailure,
      execute: async () => ({ status: "skipped", reason: "disabled" }),
      onEvent: async ({ event }) => {
        await emitJobEvent(event);
      },
    });
    return;
  }

  const captureInput = buildCompletedAssistantTurnCaptureInput(params);
  if (!captureInput) {
    await runMemoryCaptureJobTask({
      job: captureJob,
      store: captureJobStore,
      classifyFailure: classifyCaptureFailure,
      execute: async () => ({ status: "skipped", reason: "no_durable_candidate" }),
      onEvent: async ({ event }) => {
        await emitJobEvent(event);
      },
    });
    return;
  }

  await runMemoryCaptureJobTask({
    job: captureJob,
    store: captureJobStore,
    classifyFailure: classifyCaptureFailure,
    onEvent: async ({ event }) => {
      await emitJobEvent(event);
    },
    execute: async () => {
      const runtime = await getLiveRuntime(params.config);
      const pressureSnapshot = runtime.dbLaneController.snapshot();
      if (runtime.dbLaneController.shouldDeferLane("capture")) {
        throw buildPoolPressureError("capture", pressureSnapshot.reasons);
      }
      const canonicalRepositoryBase =
        runtime.canonicalRepository as typeof runtime.canonicalRepository &
          MmV2LiveRepositoryCapabilities;
      const canonicalRepository =
        canonicalRepositoryBase.withDbLane?.("capture") ?? canonicalRepositoryBase;
      const canUseMmV2LivePath =
        typeof canonicalRepository.listExistingMemorySummaries === "function" &&
        typeof canonicalRepository.persistLiveMemoryBatch === "function";
      const result = await captureOrdinaryTurnLive({
        canonicalRepository: runtime.canonicalRepository as never,
        runtimeRepository: runtime.runtimeRepository,
        memoryStore: runtime.memoryStore as never,
        collisionAdjudicator: runtime.collisionAdjudicator,
        traceId: memoryTraceId,
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
      const dirtyResult = await markModelMemoryRuntimeDirty({
        config: params.config,
        env: process.env,
        reason: "ordinary_turn_capture_written",
        traceIds: [memoryTraceId],
        captureJobId,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        memoryIds,
        sourceIds: [result.source.id],
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
                runtime.runtimeRepository as RuntimeRepositoryWithLane<
                  typeof runtime.runtimeRepository
                >
              ).withDbLane?.("rebuild") ?? runtime.runtimeRepository,
          });
        },
      });
      await emitMemoryIngestionCloseoutIfConfigured({
        env: process.env,
        path: "ordinary_turn_capture",
        traceId: memoryTraceId,
        sourceId: result.source.id,
        sourceHash: result.source.sourceFingerprint,
        jobId: captureJobId,
        telemetryEvents: result.ingestionTelemetry,
        persistenceResult: result.persistenceResult,
        dirtyState: mapRuntimeDirtyResultToCloseoutState(dirtyResult),
        provider: "strict_capture_default",
        model: modelId,
      });
      return {
        status: "written" as const,
        safeRelatedIds: {
          sourceId: result.source.id,
          segmentIds: result.windows.map((window) => window.id),
          memoryIds,
        },
        metrics: {
          segments: result.windows.length,
          writeResults: result.writeResults.length,
          memories: memoryIds.length,
        },
      };
    },
  });
}
