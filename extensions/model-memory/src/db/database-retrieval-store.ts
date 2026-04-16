import {
  buildRuntimeId,
  hashRuntimeValue,
  type RetrievalRequestRecord,
  type RetrievalResultItemRecord,
  type RetrievalResultSetRecord,
} from "../runtime-read-models.ts";
import { RuntimeContextRepository } from "./runtime-context-repository.ts";

export class DatabaseRetrievalStore {
  constructor(private readonly repository: RuntimeContextRepository) {}

  persistRetrievalRequest(record: RetrievalRequestRecord): Promise<RetrievalRequestRecord> {
    return this.repository.persistRetrievalRequest(record);
  }

  persistResultItems(items: RetrievalResultItemRecord[]): Promise<RetrievalResultItemRecord[]> {
    if (items.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository.replaceRetrievalResultItems(items[0].retrievalResultSetId, items);
  }

  async createResultSet(input: {
    retrievalRequestId: string;
    memoryObjectIds: string[];
    createdAt: Date;
  }): Promise<RetrievalResultSetRecord> {
    return this.repository.persistRetrievalResultSet({
      id: buildRuntimeId(
        "retrieval_set",
        `${input.retrievalRequestId}:${input.memoryObjectIds.join("|")}`,
      ),
      retrievalRequestId: input.retrievalRequestId,
      contentHash: hashRuntimeValue(input.memoryObjectIds.join("|")),
      resultCount: input.memoryObjectIds.length,
      createdAt: input.createdAt,
    });
  }

  updatePackedArtifactId(retrievalResultSetId: string, packedArtifactId: string): Promise<void> {
    return this.repository.updatePackedArtifactId(retrievalResultSetId, packedArtifactId);
  }

  snapshot() {
    return this.repository.snapshot();
  }
}
