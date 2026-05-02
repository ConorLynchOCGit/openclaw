import { z } from "zod";
import {
  parseJsonModelOutput,
  type JsonModelExecutionResponse,
  type JsonModelExecutor,
} from "./model-execution.ts";
import { createModelContractMetadata } from "./prompt-contracts.ts";
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
  finalInclusionReport: RetrievalFinalInclusionReport;
  retrievalPlan: RetrievalPlan;
  retrievalCandidates: RetrievalCandidate[];
  retrievalExclusions: RetrievalExclusion[];
  selectedProjectionDigests: ProjectionDigest[];
};

export type RetrievalFinalInclusionCandidate = {
  memoryObjectId: string;
  rankIndex: number;
  structuralScore: number;
  structuralReasonCodes: string[];
  canonicalClass: string;
  kind: string;
  sourceAuthorityTier?: string;
  sourceProfileId?: string;
  scopeKey?: string;
  boundedText: string;
};

export type RetrievalFinalInclusionReviewerInput = {
  schemaVersion: "retrieval_final_inclusion_input.v1";
  request: {
    retrievalRequestId: string;
    requestPurpose: string;
    queryHash: string;
    queryText: string;
    goal: string;
    desiredResultCount: number;
  };
  candidates: RetrievalFinalInclusionCandidate[];
  policy: {
    modelOwnsFinalSemanticInclusion: true;
    deterministicRecallOnly: true;
    maxSelected: number;
    noRawTranscriptOrToolLogPersistence: true;
  };
};

export type RetrievalFinalInclusionDecision = {
  schemaVersion: "retrieval_final_inclusion_decision.v1";
  decision: "select" | "block" | "pending";
  selectedMemoryObjectIds: string[];
  reasonsByMemoryObjectId?: Record<string, string[]>;
  why: string;
};

export interface RetrievalFinalInclusionReviewer {
  review(input: RetrievalFinalInclusionReviewerInput): Promise<RetrievalFinalInclusionDecision>;
}

export type RetrievalFinalInclusionReport = {
  schemaVersion: "retrieval_final_inclusion_report.v1";
  status:
    | "model_selected"
    | "pending_model_final_inclusion"
    | "model_blocked"
    | "invalid_model_final_inclusion";
  selectedMemoryObjectIds: string[];
  rejectedMemoryObjectIds: string[];
  reasonCodes: string[];
  modelId?: string;
  rawPromptPersisted: false;
  rawModelResponsePersisted: false;
};

const RetrievalFinalInclusionDecisionSchema = z
  .object({
    schemaVersion: z.literal("retrieval_final_inclusion_decision.v1"),
    decision: z.enum(["select", "block", "pending"]),
    selectedMemoryObjectIds: z.array(z.string().trim().min(1)).max(20),
    reasonsByMemoryObjectId: z.record(z.string(), z.array(z.string().trim().min(1))).optional(),
    why: z.string().trim().min(1).max(2000),
  })
  .strict();

const RETRIEVAL_FINAL_INCLUSION_DECISION_TRANSPORT_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: {
      type: "string",
      const: "retrieval_final_inclusion_decision.v1",
    },
    decision: {
      type: "string",
      enum: ["select", "block", "pending"],
    },
    selectedMemoryObjectIds: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      maxItems: 20,
    },
    reasonsByMemoryObjectId: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
        },
      },
    },
    why: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
    },
  },
  required: ["schemaVersion", "decision", "selectedMemoryObjectIds", "why"],
  additionalProperties: false,
} as const;

function normalizeRetrievalFinalInclusionDecision(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const source = raw as Record<string, unknown>;
  const selectedMemoryObjectIds = Array.isArray(source.selectedMemoryObjectIds)
    ? source.selectedMemoryObjectIds
    : Array.isArray(source.selected_memory_object_ids)
      ? source.selected_memory_object_ids
      : Array.isArray(source.selectedIds)
        ? source.selectedIds
        : Array.isArray(source.selected_ids)
          ? source.selected_ids
          : Array.isArray(source.selectedMemoryIds)
            ? source.selectedMemoryIds
            : Array.isArray(source.memoryObjectIds)
              ? source.memoryObjectIds
              : Array.isArray(source.includedMemoryObjectIds)
                ? source.includedMemoryObjectIds
                : [];
  const decision =
    source.decision === "select" || source.decision === "block" || source.decision === "pending"
      ? source.decision
      : selectedMemoryObjectIds.length > 0
        ? "select"
        : "pending";
  return {
    schemaVersion:
      source.schemaVersion ?? source.schema_version ?? "retrieval_final_inclusion_decision.v1",
    decision,
    selectedMemoryObjectIds,
    reasonsByMemoryObjectId:
      source.reasonsByMemoryObjectId ?? source.reasons_by_memory_object_id ?? undefined,
    why:
      typeof source.why === "string"
        ? source.why
        : typeof source.rationale === "string"
          ? source.rationale
          : typeof source.reason === "string"
            ? source.reason
            : typeof source.explanation === "string"
              ? source.explanation
              : "Model returned a retrieval final inclusion decision.",
  };
}

export class ExecutorBackedRetrievalFinalInclusionReviewer implements RetrievalFinalInclusionReviewer {
  constructor(
    private readonly executor: JsonModelExecutor,
    private readonly options: {
      modelId: string;
      contractVersion?: string;
      maxOutputTokens?: number;
      reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    },
  ) {}

  async review(
    input: RetrievalFinalInclusionReviewerInput,
  ): Promise<RetrievalFinalInclusionDecision> {
    const contract = createModelContractMetadata({
      contractName: "retrieval_final_inclusion",
      contractVersion: this.options.contractVersion ?? "v1",
      modelId: this.options.modelId,
    });
    const response: JsonModelExecutionResponse = await this.executor.execute({
      contract,
      systemPrompt: [
        "You decide final model-memory context inclusion after deterministic recall.",
        "Deterministic recall has only gathered candidates by lexical/vector/graph/recency/structural signals.",
        "Select only candidates that should be included in this context pack for the stated request.",
        "Use both request.queryText and request.goal; queryText may contain exact literal markers or identifiers that the interpreted goal omits.",
        "If request.queryText asks for an exact marker, source id, run id, or literal identifier and a candidate boundedText contains that exact literal, include that candidate when it answers the request.",
        "If a candidate directly answers the request goal and is supported by its boundedText, choose decision select and include that memoryObjectId.",
        "Prefer pending/block over unsupported inclusion.",
        "Return strict JSON only.",
      ].join("\n"),
      userPrompt: JSON.stringify(input, null, 2),
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "retrieval_final_inclusion_decision",
          strict: true,
          schema: RETRIEVAL_FINAL_INCLUSION_DECISION_TRANSPORT_SCHEMA,
        },
        provider: {
          requireParameters: true,
        },
        maxOutputTokens: this.options.maxOutputTokens ?? 1200,
        reasoningEffort: this.options.reasoningEffort ?? "low",
      },
    });
    const parsed = parseJsonModelOutput(response, contract, z.unknown());
    return RetrievalFinalInclusionDecisionSchema.parse(
      normalizeRetrievalFinalInclusionDecision(parsed),
    );
  }
}

function buildRetrievalRequestRecord(input: {
  envelope: RetrievalEnvelope;
  interpretedRequest: InterpretedRetrievalRequest;
  modelId: string;
  contractVersion: string;
  createdAt: Date;
  queryTextHash: string;
}): RetrievalRequestRecord {
  const redactedQueryText = redactRetrievalQueryForStorage(input.envelope.queryText);
  const rawScope = {
    ...input.envelope.scope,
    ...input.interpretedRequest.scopeConstraints,
  };
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
      ...sanitizeRetrievalScopeForStorage(rawScope),
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

function shouldHashRetrievalScopeField(key: string): boolean {
  return /(?:sessionkey|prompt|query|text|message|transcript|toollog|raw)/iu.test(key);
}

function sanitizeRetrievalScopeForStorage(
  scope: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(scope ?? {})) {
    if (typeof value === "string" && shouldHashRetrievalScopeField(key)) {
      sanitized[`${key}Hash`] = `sha256:${hashRuntimeValue(value)}`;
      sanitized[`${key}RawPersisted`] = false;
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
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

function boundedMemoryText(object: RuntimeMemoryRecord): string {
  const pieces = [
    object.normalizedSubject,
    object.normalizedTitle,
    object.normalizedSearchText,
    object.sourceEvidenceSearchText,
    JSON.stringify(object.payload ?? {}),
  ].filter((piece): piece is string => typeof piece === "string" && piece.trim().length > 0);
  return pieces.join("\n").slice(0, 2000);
}

function buildFinalInclusionInput(input: {
  requestRecord: RetrievalRequestRecord;
  interpretedRequest: InterpretedRetrievalRequest;
  queryTextHash: string;
  queryText: string;
  ranked: RankedCandidate[];
}): RetrievalFinalInclusionReviewerInput {
  return {
    schemaVersion: "retrieval_final_inclusion_input.v1",
    request: {
      retrievalRequestId: input.requestRecord.id,
      requestPurpose: input.requestRecord.requestPurpose,
      queryHash: input.queryTextHash,
      queryText: input.queryText.slice(0, 1200),
      goal: input.interpretedRequest.goal,
      desiredResultCount: input.interpretedRequest.desiredResultCount,
    },
    candidates: input.ranked.map((entry, index) => ({
      memoryObjectId: entry.object.id,
      rankIndex: index,
      structuralScore: entry.score,
      structuralReasonCodes: entry.reasonCodes,
      canonicalClass: entry.object.canonicalClass,
      kind: entry.object.kind,
      sourceAuthorityTier: entry.object.sourceAuthorityTier,
      sourceProfileId: entry.object.sourceProfileId,
      scopeKey: entry.object.scopeKey,
      boundedText: boundedMemoryText(entry.object),
    })),
    policy: {
      modelOwnsFinalSemanticInclusion: true,
      deterministicRecallOnly: true,
      maxSelected: input.interpretedRequest.desiredResultCount,
      noRawTranscriptOrToolLogPersistence: true,
    },
  };
}

async function resolveFinalInclusion(input: {
  reviewer?: RetrievalFinalInclusionReviewer;
  reviewerModelId?: string;
  requestRecord: RetrievalRequestRecord;
  interpretedRequest: InterpretedRetrievalRequest;
  queryTextHash: string;
  queryText: string;
  ranked: RankedCandidate[];
}): Promise<RetrievalFinalInclusionReport> {
  const allowedIds = new Set(input.ranked.map((entry) => entry.object.id));
  if (!input.reviewer) {
    return {
      schemaVersion: "retrieval_final_inclusion_report.v1",
      status: "pending_model_final_inclusion",
      selectedMemoryObjectIds: [],
      rejectedMemoryObjectIds: input.ranked.map((entry) => entry.object.id),
      reasonCodes: ["model_final_inclusion_required"],
      modelId: input.reviewerModelId,
      rawPromptPersisted: false,
      rawModelResponsePersisted: false,
    };
  }

  try {
    const decision = await input.reviewer.review(
      buildFinalInclusionInput({
        requestRecord: input.requestRecord,
        interpretedRequest: input.interpretedRequest,
        queryTextHash: input.queryTextHash,
        queryText: input.queryText,
        ranked: input.ranked,
      }),
    );
    const selectedIds = [
      ...new Set(
        decision.selectedMemoryObjectIds
          .filter((id) => allowedIds.has(id))
          .slice(0, input.interpretedRequest.desiredResultCount),
      ),
    ];
    const invalidIds = decision.selectedMemoryObjectIds.filter((id) => !allowedIds.has(id));
    if (invalidIds.length > 0) {
      return {
        schemaVersion: "retrieval_final_inclusion_report.v1",
        status: "invalid_model_final_inclusion",
        selectedMemoryObjectIds: [],
        rejectedMemoryObjectIds: input.ranked.map((entry) => entry.object.id),
        reasonCodes: ["model_selected_unknown_memory_id"],
        modelId: input.reviewerModelId,
        rawPromptPersisted: false,
        rawModelResponsePersisted: false,
      };
    }
    if (decision.decision !== "select") {
      return {
        schemaVersion: "retrieval_final_inclusion_report.v1",
        status: decision.decision === "pending" ? "pending_model_final_inclusion" : "model_blocked",
        selectedMemoryObjectIds: [],
        rejectedMemoryObjectIds: input.ranked.map((entry) => entry.object.id),
        reasonCodes: [`model_final_inclusion_${decision.decision}`],
        modelId: input.reviewerModelId,
        rawPromptPersisted: false,
        rawModelResponsePersisted: false,
      };
    }
    return {
      schemaVersion: "retrieval_final_inclusion_report.v1",
      status: "model_selected",
      selectedMemoryObjectIds: selectedIds,
      rejectedMemoryObjectIds: input.ranked
        .map((entry) => entry.object.id)
        .filter((id) => !selectedIds.includes(id)),
      reasonCodes: ["model_final_inclusion_selected"],
      modelId: input.reviewerModelId,
      rawPromptPersisted: false,
      rawModelResponsePersisted: false,
    };
  } catch {
    return {
      schemaVersion: "retrieval_final_inclusion_report.v1",
      status: "invalid_model_final_inclusion",
      selectedMemoryObjectIds: [],
      rejectedMemoryObjectIds: input.ranked.map((entry) => entry.object.id),
      reasonCodes: ["model_final_inclusion_invalid_output"],
      modelId: input.reviewerModelId,
      rawPromptPersisted: false,
      rawModelResponsePersisted: false,
    };
  }
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
  finalInclusionReviewer?: RetrievalFinalInclusionReviewer;
  finalInclusionModelId?: string;
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
    .slice(
      0,
      Math.max(interpreted.request.desiredResultCount * 3, interpreted.request.desiredResultCount),
    )
    .map((candidate) => ({
      object: candidate.memory!,
      score: candidate.score,
      reasonCodes: candidate.reasonCodes,
      candidate,
    }));
  const finalInclusionReport = await resolveFinalInclusion({
    reviewer: input.finalInclusionReviewer,
    reviewerModelId: input.finalInclusionModelId,
    requestRecord,
    interpretedRequest: interpreted.request,
    queryTextHash,
    queryText: input.envelope.queryText,
    ranked,
  });
  const selectedIds = new Set(finalInclusionReport.selectedMemoryObjectIds);

  const resultSet = input.store
    ? await input.store.createResultSet({
        retrievalRequestId: requestRecord.id,
        memoryObjectIds: finalInclusionReport.selectedMemoryObjectIds,
        createdAt,
      })
    : {
        id: buildRuntimeId(
          "retrieval_set",
          `${requestRecord.id}:${finalInclusionReport.selectedMemoryObjectIds.join("|")}`,
        ),
        retrievalRequestId: requestRecord.id,
        contentHash: finalInclusionReport.selectedMemoryObjectIds.join("|"),
        resultCount: finalInclusionReport.selectedMemoryObjectIds.length,
        createdAt,
      };

  const resultItems = ranked.map((entry, index) => ({
    id: buildRuntimeId("retrieval_item", `${resultSet.id}:${entry.object.id}:${index}`),
    retrievalResultSetId: resultSet.id,
    memoryObjectId: entry.object.id,
    rankIndex: index,
    rankBand: rankBandForIndex(index),
    retrievalReasonCodes: selectedIds.has(entry.object.id)
      ? [...entry.reasonCodes, "model_final_inclusion_selected"]
      : [...entry.reasonCodes, ...finalInclusionReport.reasonCodes],
    selectedForContext: selectedIds.has(entry.object.id),
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
    finalInclusionReport,
    retrievalPlan,
    retrievalCandidates: recalled.retrievalCandidates,
    retrievalExclusions: recalled.exclusions,
    selectedProjectionDigests: recalled.selectedProjectionDigests,
  };
}
