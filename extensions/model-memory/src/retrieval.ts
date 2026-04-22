import {
  type InterpretedRetrievalRequest,
  interpretRetrievalRequest,
  type RetrievalEnvelope,
  type RetrievalRequestInterpreter,
} from "./retrieval-request-interpreter.ts";
import { InMemoryRetrievalStore } from "./retrieval-store.ts";
import {
  buildRuntimeId,
  hashRuntimeValue,
  type RuntimeCompatibleMemoryRecord,
  type RuntimeMemoryRecord,
  type WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
} from "./runtime-read-models.ts";
import {
  buildRetrievalPlan,
  recallCanonicalCandidates,
  redactRetrievalQueryForStorage,
  scoreRuntimeMemoryCandidate,
  type ProjectionDigest,
  type RetrievalCandidate,
  type RetrievalExclusion,
  type RetrievalPlan,
} from "./runtime/retrieval/index.ts";

type Awaitable<T> = T | Promise<T>;

export interface RetrievalStore {
  persistRetrievalRequest(record: RetrievalRequestRecord): Awaitable<RetrievalRequestRecord>;
  createResultSet(input: {
    retrievalRequestId: string;
    memoryObjectIds: string[];
    createdAt: Date;
  }): Awaitable<RetrievalResultSetRecord>;
  persistResultItems(items: RetrievalResultItemRecord[]): Awaitable<RetrievalResultItemRecord[]>;
  updatePackedArtifactId?(retrievalResultSetId: string, packedArtifactId: string): Awaitable<void>;
}

export type RankedCandidate = {
  object: RuntimeMemoryRecord;
  score: number;
  reasonCodes: string[];
  candidate?: RetrievalCandidate;
};

export type RetrievalExecutionResult = {
  retrievalRequest: RetrievalRequestRecord;
  interpretedRequest: InterpretedRetrievalRequest;
  retrievalResultSet: RetrievalResultSetRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
  retrievalPlan: RetrievalPlan;
  retrievalCandidates: RetrievalCandidate[];
  retrievalExclusions: RetrievalExclusion[];
  selectedProjectionDigests: ProjectionDigest[];
};

function buildRetrievalRequestRecord(input: {
  envelope: RetrievalEnvelope;
  interpretedRequest: InterpretedRetrievalRequest;
  modelId: string;
  contractVersion: string;
  createdAt: Date;
  queryTextHash: string;
}): RetrievalRequestRecord {
  const redactedQueryText = redactRetrievalQueryForStorage(input.envelope.queryText);
  return {
    id: buildRuntimeId(
      "retrieval_request",
      `${input.envelope.sessionId ?? "none"}:${input.queryTextHash}:${input.contractVersion}`,
    ),
    sessionId: input.envelope.sessionId,
    agentId: input.envelope.agentId,
    queryText: redactedQueryText,
    requestPurpose: input.envelope.requestPurpose,
    scope: {
      ...(input.interpretedRequest.scopeConstraints ?? input.envelope.scope),
      retrievalRuntimeQueryHash: input.queryTextHash,
      rawQueryPersisted: false,
    },
    desiredResultCount: input.interpretedRequest.desiredResultCount,
    contractName: "retrieval_request_interpretation",
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt: input.createdAt,
  };
}

function rankBandForIndex(index: number): RetrievalResultItemRecord["rankBand"] {
  if (index < 3) {
    return "primary";
  }
  if (index < 6) {
    return "secondary";
  }
  return "overflow";
}

export function scoreRetrievalCandidate(
  object: RuntimeMemoryRecord,
  request: InterpretedRetrievalRequest,
): RankedCandidate | undefined {
  const scored = scoreRuntimeMemoryCandidate(object, request);
  if (!scored || scored.scopeMatch === "mismatch") {
    return undefined;
  }

  return {
    object,
    score: scored.score,
    reasonCodes: scored.reasonCodes,
  };
}

export function rankRetrievalCandidates(input: {
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  request: InterpretedRetrievalRequest;
}): RankedCandidate[] {
  return recallCanonicalCandidates({
    memoryObjects: input.memoryObjects,
    request: input.request,
  }).selectedMemoryCandidates.map((candidate) => ({
    object: candidate.memory!,
    score: candidate.score,
    reasonCodes: candidate.reasonCodes,
    candidate,
  }));
}

export async function executeRetrieval(input: {
  envelope: RetrievalEnvelope;
  interpreter: RetrievalRequestInterpreter;
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  modelId: string;
  contractVersion?: string;
  store?: RetrievalStore | InMemoryRetrievalStore;
  createdAt?: Date;
  projectionVersions?: WorkspaceProjectionVersionRecord[];
}): Promise<RetrievalExecutionResult | undefined> {
  const interpreted = await interpretRetrievalRequest({
    envelope: input.envelope,
    interpreter: input.interpreter,
    modelId: input.modelId,
    contractVersion: input.contractVersion,
  });
  if (interpreted.action === "skip") {
    return undefined;
  }

  const createdAt = input.createdAt ?? new Date(0);
  const queryTextHash = hashRuntimeValue(input.envelope.queryText);
  const retrievalPlan = buildRetrievalPlan({
    request: interpreted.request,
    queryTextHash,
    requestPurpose: input.envelope.requestPurpose,
    sessionId: input.envelope.sessionId,
  });
  const requestRecord = buildRetrievalRequestRecord({
    envelope: input.envelope,
    interpretedRequest: interpreted.request,
    modelId: input.modelId,
    contractVersion: input.contractVersion ?? "v1",
    createdAt,
    queryTextHash,
  });
  if (input.store) {
    await input.store.persistRetrievalRequest(requestRecord);
  }

  const recalled = recallCanonicalCandidates({
    memoryObjects: input.memoryObjects,
    request: interpreted.request,
    projectionVersions: input.projectionVersions,
  });
  const ranked = recalled.selectedMemoryCandidates
    .slice(0, interpreted.request.desiredResultCount)
    .map((candidate) => ({
      object: candidate.memory!,
      score: candidate.score,
      reasonCodes: candidate.reasonCodes,
      candidate,
    }));

  const resultSet = input.store
    ? await input.store.createResultSet({
        retrievalRequestId: requestRecord.id,
        memoryObjectIds: ranked.map((entry) => entry.object.id),
        createdAt,
      })
    : {
        id: buildRuntimeId(
          "retrieval_set",
          `${requestRecord.id}:${ranked.map((entry) => entry.object.id).join("|")}`,
        ),
        retrievalRequestId: requestRecord.id,
        contentHash: ranked.map((entry) => entry.object.id).join("|"),
        resultCount: ranked.length,
        createdAt,
      };

  const resultItems = ranked.map((entry, index) => ({
    id: buildRuntimeId("retrieval_item", `${resultSet.id}:${entry.object.id}:${index}`),
    retrievalResultSetId: resultSet.id,
    memoryObjectId: entry.object.id,
    rankIndex: index,
    rankBand: rankBandForIndex(index),
    retrievalReasonCodes:
      index < interpreted.request.desiredResultCount
        ? [...entry.reasonCodes, "rerank_selected"]
        : entry.reasonCodes,
    selectedForContext: index < interpreted.request.desiredResultCount,
    createdAt,
  })) satisfies RetrievalResultItemRecord[];

  if (input.store) {
    await input.store.persistResultItems(resultItems);
  }

  return {
    retrievalRequest: requestRecord,
    interpretedRequest: interpreted.request,
    retrievalResultSet: resultSet,
    retrievalResultItems: resultItems,
    retrievalPlan,
    retrievalCandidates: recalled.retrievalCandidates,
    retrievalExclusions: recalled.exclusions,
    selectedProjectionDigests: recalled.selectedProjectionDigests,
  };
}
