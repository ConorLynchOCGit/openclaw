import {
  recoverDailyContinuityCandidates,
  type DailyContinuityRecoveryInput,
} from "./daily-continuity-recovery.ts";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import {
  assertLegacyCapturedObjectWriteFallbackEnabled,
  createLegacyCapturedObjectWriteFallbackStore,
  type CapturedObjectWriteStore,
} from "./db/captured-object-write-compatibility.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import type { ExistingMemorySummary } from "./mmv2/contracts.ts";
import { recoverDailyContinuityV2ForLiveStorage } from "./mmv2/live-document-ingestion.ts";
import type { LiveMemoryBatch, LiveMemoryWriteResult } from "./mmv2/recording.ts";
import { summarizeLiveMemoryWriteResults } from "./mmv2/recording.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "./semantic-collision-adjudication.ts";

type MmV2AwareCanonicalRepository = ModelMemoryCanonicalRepository & {
  listExistingMemorySummaries?: () => Promise<ExistingMemorySummary[]>;
  persistLiveMemoryBatch?: (batch: LiveMemoryBatch) => Promise<void>;
};

export type LiveDailyContinuityRecoveryResult = Awaited<
  ReturnType<typeof recoverDailyContinuityCandidates>
> & {
  writeResults: LiveMemoryWriteResult[];
  rebuild?: Awaited<ReturnType<typeof rebuildDerivedRuntimeState>>;
};

export async function recoverDailyContinuityCandidatesLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: CapturedObjectWriteStore;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  recovery: DailyContinuityRecoveryInput;
  rebuildRuntime?: boolean;
  allowLegacyCapturedObjectWriteFallback?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<LiveDailyContinuityRecoveryResult> {
  const canonicalRepository = input.canonicalRepository as MmV2AwareCanonicalRepository;
  const canUseMmV2LivePath =
    typeof canonicalRepository.listExistingMemorySummaries === "function" &&
    typeof canonicalRepository.persistLiveMemoryBatch === "function";
  const result = canUseMmV2LivePath
    ? await recoverDailyContinuityV2ForLiveStorage({
        dailyRecord: input.recovery.dailyRecord,
        modelId: input.recovery.modelId,
        interpreter: input.recovery.interpreter,
        reconciliationNeighbors: await canonicalRepository.listExistingMemorySummaries!(),
      })
    : await recoverDailyContinuityCandidates(input.recovery);
  const source = await canonicalRepository.persistSource(result.source);
  await canonicalRepository.persistSourceWindows(result.windows);
  const mmv2Recording = canUseMmV2LivePath
    ? (result as unknown as { mmv2LiveRecording: LiveMemoryBatch }).mmv2LiveRecording
    : undefined;
  const writeResults = canUseMmV2LivePath
    ? (await canonicalRepository.persistLiveMemoryBatch!(mmv2Recording!),
      summarizeLiveMemoryWriteResults(mmv2Recording!))
    : await Promise.resolve(
        (input.memoryStore
          ? (assertLegacyCapturedObjectWriteFallbackEnabled({
              caller: "recoverDailyContinuityCandidatesLive",
              env: input.env,
              explicit: input.allowLegacyCapturedObjectWriteFallback,
            }),
            input.memoryStore)
          : await createLegacyCapturedObjectWriteFallbackStore({
              canonicalRepository: input.canonicalRepository,
              collisionAdjudicator: input.collisionAdjudicator,
              caller: "recoverDailyContinuityCandidatesLive",
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
    input.runtimeRepository && (input.rebuildRuntime ?? true)
      ? await rebuildDerivedRuntimeState({
          canonicalRepository,
          runtimeRepository: input.runtimeRepository,
        })
      : undefined;

  return {
    ...result,
    source,
    writeResults,
    rebuild,
  };
}
