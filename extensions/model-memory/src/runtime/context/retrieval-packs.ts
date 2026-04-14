import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
} from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";
import { buildContextArtifact } from "../context-artifacts.ts";

function summarizeProvenance(object: ModelMemoryObjectRecord): string {
  const firstSpan = object.provenance[0];
  if (!firstSpan || typeof firstSpan !== "object" || !("sourceId" in firstSpan)) {
    return "source unavailable";
  }
  return String(firstSpan.sourceId);
}

export function buildRetrievalPackArtifact(input: {
  retrievalRequest: RetrievalRequestRecord;
  retrievalResultSet: RetrievalResultSetRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
  memoryObjects: ModelMemoryObjectRecord[];
  buildPolicyVersion: string;
}) {
  const objectById = new Map(input.memoryObjects.map((object) => [object.id, object] as const));
  const selectedItems = input.retrievalResultItems
    .filter((item) => item.selectedForContext)
    .toSorted((left, right) => left.rankIndex - right.rankIndex);
  const results = selectedItems
    .map((item) => {
      const object = objectById.get(item.memoryObjectId);
      if (!object) {
        return undefined;
      }
      return {
        objectId: object.id,
        canonicalClass: object.canonicalClass,
        kind: object.kind,
        payload: object.payload,
        scope: object.scope,
        provenanceSummary: summarizeProvenance(object),
        retrievalReasonCodes: item.retrievalReasonCodes,
        rankBand: item.rankBand,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);

  const renderedText = [
    `Retrieval for ${input.retrievalRequest.requestPurpose}: ${input.retrievalRequest.queryText}`,
    ...results.map(
      (result, index) =>
        `${index + 1}. ${result.canonicalClass}/${result.kind} ${JSON.stringify(result.payload)} [${result.rankBand}]`,
    ),
  ].join("\n");

  return buildContextArtifact({
    artifactType: "retrieval_pack",
    scopeKey: input.retrievalRequest.sessionId ?? input.retrievalRequest.agentId,
    sourceObjectIds: results.map((result) => result.objectId),
    renderedText,
    structuredPayload: {
      retrievalRequestId: input.retrievalRequest.id,
      retrievalResultSetId: input.retrievalResultSet.id,
      results,
    },
    buildPolicyVersion: input.buildPolicyVersion,
  });
}
