import {
  ingestDocument,
  type DocumentIngestionInput,
  type DocumentIngestionResult,
} from "./document-ingestion.ts";
import type { DocumentSourceInput } from "./source-adapters/document-source-adapter.ts";

export type DailyContinuityRecoverySourceInput = Omit<DocumentSourceInput, "sourceKind">;

export type DailyContinuityRecoveryInput = Omit<DocumentIngestionInput, "document"> & {
  dailyRecord: DailyContinuityRecoverySourceInput;
};

export async function recoverDailyContinuityCandidates(
  input: DailyContinuityRecoveryInput,
): Promise<DocumentIngestionResult> {
  return ingestDocument({
    ...input,
    document: {
      ...input.dailyRecord,
      sourceKind: "daily_continuity",
    },
  });
}
