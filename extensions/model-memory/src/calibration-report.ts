import type { RuntimeComparisonResult } from "./runtime-comparison.ts";
import type {
  ContextRunRecord,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
} from "./runtime-read-models.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemoryWriteEventRecord,
} from "./storage-database-contract.ts";

function countByKey(values: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

export type CalibrationReport = {
  captureRate: number;
  ignoreRate: number;
  duplicateRate: number;
  supersessionRate: number;
  retrievalRequestVolume: number;
  averageRetrievalCandidateSetSize: number;
  averageRetrievalPackingSize: number;
  canonicalClassDistribution: Record<string, number>;
  kindDistribution: Record<string, number>;
  confidenceDistribution: Record<string, number>;
  reviewModeDistribution: Record<string, number>;
  contractNameDistribution: Record<string, number>;
  contractVersionDistribution: Record<string, number>;
  modelIdDistribution: Record<string, number>;
  shadowComparisonCount: number;
  omissionDivergenceCount: number;
  contextRunCount: number;
};

export function buildCalibrationReport(input: {
  memoryObjects: ModelMemoryObjectRecord[];
  writeEvents: ModelMemoryWriteEventRecord[];
  retrievalRequests: RetrievalRequestRecord[];
  retrievalResultSets: RetrievalResultSetRecord[];
  retrievalResultItems: RetrievalResultItemRecord[];
  contextRuns: ContextRunRecord[];
  shadowComparisons?: RuntimeComparisonResult[];
}): CalibrationReport {
  const totalWriteEvents = input.writeEvents.length || 1;
  const writeCount = input.writeEvents.filter((event) => event.decision === "write").length;
  const ignoreCount = input.writeEvents.filter((event) => event.decision === "ignore").length;
  const dedupeCount = input.writeEvents.filter(
    (event) => event.decision === "attach_support",
  ).length;
  const supersedeCount = input.writeEvents.filter((event) => event.decision === "supersede").length;
  const selectedRetrievalItems = input.retrievalResultItems.filter(
    (item) => item.selectedForContext,
  );
  const shadowComparisons = input.shadowComparisons ?? [];

  return {
    captureRate: writeCount / totalWriteEvents,
    ignoreRate: ignoreCount / totalWriteEvents,
    duplicateRate: dedupeCount / totalWriteEvents,
    supersessionRate: supersedeCount / totalWriteEvents,
    retrievalRequestVolume: input.retrievalRequests.length,
    averageRetrievalCandidateSetSize:
      input.retrievalResultSets.length > 0
        ? input.retrievalResultSets.reduce((sum, entry) => sum + entry.resultCount, 0) /
          input.retrievalResultSets.length
        : 0,
    averageRetrievalPackingSize:
      input.retrievalResultSets.length > 0
        ? selectedRetrievalItems.length / input.retrievalResultSets.length
        : 0,
    canonicalClassDistribution: countByKey(
      input.memoryObjects.map((record) => record.canonicalClass),
    ),
    kindDistribution: countByKey(input.memoryObjects.map((record) => record.kind)),
    confidenceDistribution: countByKey(input.memoryObjects.map((record) => record.confidence)),
    reviewModeDistribution: countByKey(
      input.memoryObjects.map((record) => record.executedReviewMode),
    ),
    contractNameDistribution: countByKey(input.memoryObjects.map((record) => record.contractName)),
    contractVersionDistribution: countByKey(
      input.memoryObjects.map((record) => record.contractVersion),
    ),
    modelIdDistribution: countByKey(input.memoryObjects.map((record) => record.modelId)),
    shadowComparisonCount: shadowComparisons.length,
    omissionDivergenceCount: shadowComparisons.filter((entry) => entry.omissionDivergence).length,
    contextRunCount: input.contextRuns.length,
  };
}
