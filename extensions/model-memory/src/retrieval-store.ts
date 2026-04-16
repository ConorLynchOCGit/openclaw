import {
  buildRuntimeId,
  hashRuntimeValue,
  type RetrievalRequestRecord,
  type RetrievalResultItemRecord,
  type RetrievalResultSetRecord,
} from "./runtime-read-models.ts";

export class InMemoryRetrievalStore {
  private retrievalRequests: RetrievalRequestRecord[] = [];
  private retrievalResultSets: RetrievalResultSetRecord[] = [];
  private retrievalResultItems: RetrievalResultItemRecord[] = [];

  persistRetrievalRequest(record: RetrievalRequestRecord): RetrievalRequestRecord {
    this.retrievalRequests.push(record);
    return record;
  }

  createResultSet(input: {
    retrievalRequestId: string;
    memoryObjectIds: string[];
    createdAt: Date;
  }): RetrievalResultSetRecord {
    const record: RetrievalResultSetRecord = {
      id: buildRuntimeId(
        "retrieval_set",
        `${input.retrievalRequestId}:${input.memoryObjectIds.join("|")}`,
      ),
      retrievalRequestId: input.retrievalRequestId,
      contentHash: hashRuntimeValue(input.memoryObjectIds.join("|")),
      resultCount: input.memoryObjectIds.length,
      createdAt: input.createdAt,
    };
    this.retrievalResultSets.push(record);
    return record;
  }

  persistResultItems(items: RetrievalResultItemRecord[]): RetrievalResultItemRecord[] {
    this.retrievalResultItems.push(...items);
    return items;
  }

  updatePackedArtifactId(retrievalResultSetId: string, packedArtifactId: string): void {
    this.retrievalResultItems = this.retrievalResultItems.map((item) =>
      item.retrievalResultSetId === retrievalResultSetId && item.selectedForContext
        ? { ...item, packedArtifactId }
        : item,
    );
  }

  snapshot() {
    return {
      retrievalRequests: this.retrievalRequests.map((record) => ({ ...record })),
      retrievalResultSets: this.retrievalResultSets.map((record) => ({ ...record })),
      retrievalResultItems: this.retrievalResultItems.map((record) => ({ ...record })),
    };
  }
}
