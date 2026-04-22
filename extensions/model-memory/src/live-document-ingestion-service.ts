import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./db/database-memory-object-store.ts";
import { createDefaultMemoryObjectStore } from "./db/default-memory-store.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  ingestDocumentForLivePath,
  resolveLiveDocumentIngestEngine,
  type DocumentIngestionInput,
  type DocumentIngestionResult,
} from "./document-ingestion.ts";
import type { ExistingMemorySummary } from "./mmv2/contracts.ts";
import { ingestDocumentV2ForLiveStorage } from "./mmv2/live-document-ingestion.ts";
import type { LiveMemoryBatch, LiveMemoryWriteResult } from "./mmv2/recording.ts";
import { summarizeLiveMemoryWriteResults } from "./mmv2/recording.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "./semantic-collision-adjudication.ts";

type MmV2AwareCanonicalRepository = ModelMemoryCanonicalRepository & {
  listExistingMemorySummaries?: () => Promise<ExistingMemorySummary[]>;
  persistLiveMemoryBatch?: (batch: LiveMemoryBatch) => Promise<void>;
};

export type LiveDocumentIngestionResult = DocumentIngestionResult & {
  writeResults: LiveMemoryWriteResult[];
  rebuild?: Awaited<ReturnType<typeof rebuildDerivedRuntimeState>>;
};

export async function ingestDocumentLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: DatabaseMemoryObjectStore;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  ingestion: DocumentIngestionInput;
  rebuildRuntime?: boolean;
}): Promise<LiveDocumentIngestionResult> {
  const canonicalRepository = input.canonicalRepository as MmV2AwareCanonicalRepository;
  const documentEngine = resolveLiveDocumentIngestEngine({
    sourceKind: input.ingestion.document.sourceKind,
  });
  const canUseMmV2LivePath =
    documentEngine === "mmv2" &&
    typeof canonicalRepository.listExistingMemorySummaries === "function" &&
    typeof canonicalRepository.persistLiveMemoryBatch === "function";

  const result = canUseMmV2LivePath
    ? await ingestDocumentV2ForLiveStorage({
        ...input.ingestion,
        reconciliationNeighbors: await canonicalRepository.listExistingMemorySummaries!(),
      })
    : await ingestDocumentForLivePath(input.ingestion);
  const source = await canonicalRepository.persistSource(result.source);
  await canonicalRepository.persistSourceWindows(result.windows);
  const mmv2Recording = canUseMmV2LivePath
    ? (result as unknown as { mmv2LiveRecording: LiveMemoryBatch }).mmv2LiveRecording
    : undefined;
  const writeResults = canUseMmV2LivePath
    ? (await canonicalRepository.persistLiveMemoryBatch!(mmv2Recording!),
      summarizeLiveMemoryWriteResults(mmv2Recording!))
    : await (
        input.memoryStore ??
        createDefaultMemoryObjectStore({
          canonicalRepository: input.canonicalRepository,
          collisionAdjudicator: input.collisionAdjudicator,
        })
      )
        .writeCapturedObjects(result.capturedObjects)
        .then((legacyResults) =>
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
