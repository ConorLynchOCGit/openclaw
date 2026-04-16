import {
  type InterpretedRetrievalRequest,
  interpretRetrievalRequest,
  type RetrievalEnvelope,
  type RetrievalRequestInterpreter,
} from "./retrieval-request-interpreter.ts";
import { InMemoryRetrievalStore } from "./retrieval-store.ts";
import { buildRuntimeId, getCurrentMemoryObjects } from "./runtime-read-models.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
} from "./runtime-read-models.ts";
import { normalizeIdentityText } from "./semantic-identity.ts";
import type { ModelMemoryObjectRecord } from "./storage-database-contract.ts";

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
  object: ModelMemoryObjectRecord;
  score: number;
  reasonCodes: string[];
};

export type RetrievalExecutionResult = {
  retrievalRequest: RetrievalRequestRecord;
  interpretedRequest: InterpretedRetrievalRequest;
  retrievalResultSet: RetrievalResultSetRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
};

function normalizeScopeConstraints(
  scopeConstraints: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scopeConstraints ?? {}).map(([key, value]) => [
      key,
      normalizeIdentityText(value),
    ]),
  );
}

function buildRetrievalRequestRecord(input: {
  envelope: RetrievalEnvelope;
  interpretedRequest: InterpretedRetrievalRequest;
  modelId: string;
  contractVersion: string;
  createdAt: Date;
}): RetrievalRequestRecord {
  return {
    id: buildRuntimeId(
      "retrieval_request",
      `${input.envelope.sessionId ?? "none"}:${input.envelope.queryText}:${input.contractVersion}`,
    ),
    sessionId: input.envelope.sessionId,
    agentId: input.envelope.agentId,
    queryText: input.envelope.queryText,
    requestPurpose: input.envelope.requestPurpose,
    scope: input.interpretedRequest.scopeConstraints ?? input.envelope.scope ?? {},
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
  object: ModelMemoryObjectRecord,
  request: InterpretedRetrievalRequest,
): RankedCandidate | undefined {
  if (
    request.canonicalClasses.length > 0 &&
    !request.canonicalClasses.includes(
      object.canonicalClass as (typeof request.canonicalClasses)[number],
    )
  ) {
    return undefined;
  }
  if (
    request.kinds?.length &&
    !request.kinds.includes(object.kind as NonNullable<typeof request.kinds>[number])
  ) {
    return undefined;
  }

  const normalizedScopeConstraints = normalizeScopeConstraints(request.scopeConstraints);
  const normalizedObjectScope = Object.fromEntries(
    Object.entries(object.scope).map(([key, value]) => [
      key,
      typeof value === "string" ? normalizeIdentityText(value) : value,
    ]),
  );
  for (const [key, value] of Object.entries(normalizedScopeConstraints)) {
    if (normalizedObjectScope[key] !== value) {
      return undefined;
    }
  }

  let score = 0;
  const reasonCodes = new Set<string>();

  if (Object.keys(normalizedScopeConstraints).length > 0) {
    score += 50;
    reasonCodes.add("scope_match");
  }
  if (request.canonicalClasses.length > 0) {
    score += 20;
    reasonCodes.add("class_match");
  }

  const subjectMatches = [...(request.subjectHints ?? [])].filter((hint) => {
    const normalizedHint = normalizeIdentityText(hint);
    return (
      object.normalizedSubject?.includes(normalizedHint) ||
      object.normalizedTitle?.includes(normalizedHint)
    );
  });
  if (subjectMatches.length > 0) {
    score += subjectMatches.length * 10;
    reasonCodes.add("subject_match");
  }

  const contentMatches = [...(request.contentHints ?? [])].filter((hint) =>
    object.normalizedSearchText.includes(normalizeIdentityText(hint)),
  );
  if (contentMatches.length > 0) {
    score += contentMatches.length * 5;
    reasonCodes.add("text_match");
  }

  if (score === 0 && request.canonicalClasses.length === 0 && !request.kinds?.length) {
    score = 1;
  }

  return {
    object,
    score,
    reasonCodes: [...reasonCodes],
  };
}

export function rankRetrievalCandidates(input: {
  memoryObjects: ModelMemoryObjectRecord[];
  request: InterpretedRetrievalRequest;
}): RankedCandidate[] {
  return getCurrentMemoryObjects(input.memoryObjects)
    .map((object) => scoreRetrievalCandidate(object, input.request))
    .filter((entry): entry is RankedCandidate => !!entry)
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.object.id.localeCompare(right.object.id);
    });
}

export async function executeRetrieval(input: {
  envelope: RetrievalEnvelope;
  interpreter: RetrievalRequestInterpreter;
  memoryObjects: ModelMemoryObjectRecord[];
  modelId: string;
  contractVersion?: string;
  store?: RetrievalStore | InMemoryRetrievalStore;
  createdAt?: Date;
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
  const requestRecord = buildRetrievalRequestRecord({
    envelope: input.envelope,
    interpretedRequest: interpreted.request,
    modelId: input.modelId,
    contractVersion: input.contractVersion ?? "v1",
    createdAt,
  });
  if (input.store) {
    await input.store.persistRetrievalRequest(requestRecord);
  }

  const ranked = rankRetrievalCandidates({
    memoryObjects: input.memoryObjects,
    request: interpreted.request,
  }).slice(0, interpreted.request.desiredResultCount);

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
  };
}
