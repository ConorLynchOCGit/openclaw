import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import type { DurableMemoryRecord, MemoryEvent } from "./mmv2/contracts.ts";
import type { RuntimeComparisonResult } from "./runtime-comparison.ts";
import { listRuntimeMemoryRecords } from "./runtime-read-models.ts";

type MmV2AwareInspectionRepository = ModelMemoryCanonicalRepository & {
  listDurableMemories?: () => Promise<DurableMemoryRecord[]>;
  listMemoryEvents?: () => Promise<MemoryEvent[]>;
};

export class ModelMemoryOperatorInspection {
  constructor(
    private readonly canonicalRepository: ModelMemoryCanonicalRepository,
    private readonly runtimeRepository: RuntimeContextRepository,
  ) {}

  async listRecentCaptures(limit = 20) {
    const memoryObjects = await listRuntimeMemoryRecords(this.canonicalRepository);
    return memoryObjects.slice(-limit).toReversed();
  }

  async listWriteDecisions(limit = 20) {
    const canonicalRepository = this.canonicalRepository as MmV2AwareInspectionRepository;
    const writeEvents =
      typeof canonicalRepository.listMemoryEvents === "function"
        ? await canonicalRepository.listMemoryEvents()
        : await this.canonicalRepository.listWriteEvents();
    return writeEvents.slice(-limit).toReversed();
  }

  async listProjectionVersions(limit = 20) {
    const projectionVersions = await this.runtimeRepository.listProjectionVersions();
    return projectionVersions.slice(-limit).toReversed();
  }

  async listRetrievalInspections(limit = 20) {
    const [requests, resultSets, resultItems] = await Promise.all([
      this.runtimeRepository.listRetrievalRequests(),
      this.runtimeRepository.listRetrievalResultSets(),
      this.runtimeRepository.listRetrievalResultItems(),
    ]);

    return {
      requests: requests.slice(-limit).toReversed(),
      resultSets: resultSets.slice(-limit).toReversed(),
      resultItems: resultItems.slice(-limit).toReversed(),
    };
  }

  async listUsageObservations(limit = 20) {
    const [runs, segments] = await Promise.all([
      this.runtimeRepository.listContextRuns(),
      this.runtimeRepository.listContextRunSegments(),
    ]);
    return {
      runs: runs.slice(-limit).toReversed(),
      segments: segments.slice(-limit).toReversed(),
    };
  }

  summarizeDivergences(comparisons: RuntimeComparisonResult[]) {
    return {
      totalComparisons: comparisons.length,
      omissionDivergences: comparisons.filter((entry) => entry.omissionDivergence).length,
      modelOnlyIdentityCount: comparisons.reduce(
        (sum, entry) => sum + entry.modelOnlyIdentityKeys.length,
        0,
      ),
      legacyOnlyIdentityCount: comparisons.reduce(
        (sum, entry) => sum + entry.legacyOnlyIdentityKeys.length,
        0,
      ),
    };
  }
}
