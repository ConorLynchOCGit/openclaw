import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import {
  assertLegacyCapturedObjectWriteFallbackEnabled,
  createLegacyCapturedObjectWriteFallbackStore,
  type CapturedObjectWriteStore,
} from "./db/captured-object-write-compatibility.ts";
import type { LiveMemoryPersistenceResult } from "./db/mmv2-native-repository.ts";
import type { ListExistingMemorySummariesForCaptureInput } from "./db/mmv2-native-repository/types.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  emitMemoryIngestionCloseoutIfConfigured,
  type MemoryIngestionCloseoutArtifact,
} from "./ingestion/closeout-artifacts.ts";
import {
  createMemoryIngestionTelemetryEvent,
  type MemoryIngestionTelemetryEvent,
} from "./ingestion/shared-pipeline.ts";
import type { ExistingMemorySummary } from "./mmv2/contracts.ts";
import { captureOrdinaryTurnV2ForLiveStorage } from "./mmv2/live-document-ingestion.ts";
import { createReconciliationNeighborRecallProvider } from "./mmv2/reconciliation-neighbor-recall.ts";
import type { LiveMemoryBatch, LiveMemoryWriteResult } from "./mmv2/recording.ts";
import { summarizePersistedLiveMemoryWriteResults } from "./mmv2/recording.ts";
import {
  captureOrdinaryTurn,
  type OrdinaryTurnCaptureInput,
  type OrdinaryTurnCaptureResult,
} from "./ordinary-turn-capture.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "./semantic-collision-adjudication.ts";
import { redactOrdinaryTurnSourceEnvelopeForPersistence } from "./source-adapters/ordinary-turn-source-adapter.ts";

type MmV2AwareCanonicalRepository = ModelMemoryCanonicalRepository & {
  listExistingMemorySummaries?: () => Promise<ExistingMemorySummary[]>;
  listExistingMemorySummariesForCapture?: (
    input: ListExistingMemorySummariesForCaptureInput,
  ) => Promise<ExistingMemorySummary[]>;
  persistLiveMemoryBatch?: (batch: LiveMemoryBatch) => Promise<LiveMemoryPersistenceResult>;
};

export type LiveOrdinaryTurnCaptureResult = OrdinaryTurnCaptureResult & {
  writeResults: LiveMemoryWriteResult[];
  ingestionTelemetry: MemoryIngestionTelemetryEvent[];
  persistenceResult?: LiveMemoryPersistenceResult;
  closeoutArtifact?: MemoryIngestionCloseoutArtifact;
  rebuild?: Awaited<ReturnType<typeof rebuildDerivedRuntimeState>>;
};

export async function captureOrdinaryTurnLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: CapturedObjectWriteStore;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  capture: OrdinaryTurnCaptureInput;
  rebuildRuntime?: boolean;
  allowLegacyCapturedObjectWriteFallback?: boolean;
  traceId?: string;
  closeoutJobId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<LiveOrdinaryTurnCaptureResult> {
  const canonicalRepository = input.canonicalRepository as MmV2AwareCanonicalRepository;
  const canUseMmV2LivePath =
    typeof canonicalRepository.listExistingMemorySummaries === "function" &&
    typeof canonicalRepository.persistLiveMemoryBatch === "function";

  const result = canUseMmV2LivePath
    ? await captureOrdinaryTurnV2ForLiveStorage({
        capture: input.capture.turn,
        modelId: input.capture.modelId,
        interpreter: input.capture.interpreter,
        reconciliationNeighborProvider: createReconciliationNeighborRecallProvider({
          canonicalRepository,
          projectId: input.capture.turn.projectId ?? null,
          sessionId: input.capture.turn.sessionId ?? null,
        }),
      })
    : await captureOrdinaryTurn(input.capture);
  const persistenceEnvelope =
    result.source.sourceKind === "ordinary_turn"
      ? redactOrdinaryTurnSourceEnvelopeForPersistence({
          source: result.source,
          normalizedText: result.windows.map((window) => window.normalizedText).join("\n"),
          windows: result.windows,
        })
      : {
          source: result.source,
          normalizedText: result.windows.map((window) => window.normalizedText).join("\n"),
          windows: result.windows,
        };
  const source = await canonicalRepository.persistSource(persistenceEnvelope.source);
  await canonicalRepository.persistSourceWindows(persistenceEnvelope.windows);
  const mmv2Recording = canUseMmV2LivePath
    ? (result as unknown as { mmv2LiveRecording: LiveMemoryBatch }).mmv2LiveRecording
    : undefined;
  const persistenceResult = canUseMmV2LivePath
    ? await canonicalRepository.persistLiveMemoryBatch!(mmv2Recording!)
    : undefined;
  const writeResults = canUseMmV2LivePath
    ? summarizePersistedLiveMemoryWriteResults(mmv2Recording!, persistenceResult!)
    : await Promise.resolve(
        (input.memoryStore
          ? (assertLegacyCapturedObjectWriteFallbackEnabled({
              caller: "captureOrdinaryTurnLive",
              env: input.env,
              explicit: input.allowLegacyCapturedObjectWriteFallback,
            }),
            input.memoryStore)
          : await createLegacyCapturedObjectWriteFallbackStore({
              canonicalRepository: input.canonicalRepository,
              collisionAdjudicator: input.collisionAdjudicator,
              caller: "captureOrdinaryTurnLive",
              env: input.env,
              explicit: input.allowLegacyCapturedObjectWriteFallback,
            })
        ).writeCapturedObjects(result.capturedObjects),
      ).then((legacyResults) =>
        legacyResults.map(
          (entry): LiveMemoryWriteResult => ({
            decision:
              entry.decision === "attach_support" || entry.decision === "supersede"
                ? entry.decision
                : entry.decision === "ignore"
                  ? "reject"
                  : "write",
            eventType:
              entry.decision === "attach_support"
                ? "memory_merged"
                : entry.decision === "ignore"
                  ? "candidate_rejected"
                  : "memory_inserted",
            memoryId: entry.memoryObject?.id,
            targetMemoryIds: entry.supersessionLink?.priorObjectId
              ? [entry.supersessionLink.priorObjectId]
              : [],
            memoryObject: entry.memoryObject,
            supportItem: entry.supportItem,
            writeEvent: entry.writeEvent,
          }),
        ),
      );
  const rebuild =
    input.runtimeRepository && (input.rebuildRuntime ?? false)
      ? await rebuildDerivedRuntimeState({
          canonicalRepository,
          runtimeRepository: input.runtimeRepository,
        })
      : undefined;
  const ingestionTelemetry = [
    createMemoryIngestionTelemetryEvent({
      path: "ordinary_turn_capture",
      stage: "semantic_contract_boundary",
      status: "completed",
      candidate_counts: {
        extracted: result.capturedObjects.length,
        valid: result.capturedObjects.length,
      },
      ids: input.traceId ? { memory_trace_ids: [input.traceId] } : undefined,
    }),
    createMemoryIngestionTelemetryEvent({
      path: "ordinary_turn_capture",
      stage: "persistence_boundary",
      status: "completed",
      candidate_counts: {
        admitted:
          persistenceResult?.durableMemoriesWritten.length ??
          writeResults.filter(
            (entry) => entry.decision === "write" || entry.decision === "supersede",
          ).length,
        rejected:
          (persistenceResult?.deferredCandidates.length ?? 0) +
          writeResults.filter(
            (entry) => entry.decision === "reject" || entry.decision === "quarantine",
          ).length,
      },
      ids: {
        ...(input.traceId ? { memory_trace_ids: [input.traceId] } : {}),
        memory_ids: writeResults
          .map((entry) => entry.memoryId)
          .filter((entry): entry is string => Boolean(entry)),
      },
    }),
  ];
  const closeoutArtifact = await emitMemoryIngestionCloseoutIfConfigured({
    env: input.env,
    path: "ordinary_turn_capture",
    traceId: input.traceId,
    sourceId: source.id,
    sourceHash: source.sourceFingerprint,
    jobId: input.closeoutJobId,
    telemetryEvents: ingestionTelemetry,
    persistenceResult,
    dirtyState: { status: "not_required", reason: "caller_managed" },
  });

  return {
    ...result,
    source,
    writeResults,
    ingestionTelemetry,
    persistenceResult,
    closeoutArtifact,
    rebuild,
  };
}
