import { assertMemoryIngestionReportRecordHasNoDarkData } from "./dark-data.ts";
import type {
  CandidateQuarantineRecord,
  CandidateValidationError,
  DeferredMemoryEdge,
  MemoryIngestionCandidate,
  MemoryIngestionCandidateRef,
  MemoryIngestionQuarantineReportRecord,
} from "./types.ts";

const VALID_SCOPES = new Set<MemoryIngestionCandidate["scope"]>([
  "global",
  "workspace",
  "project",
  "session",
  "unknown",
]);

const VALID_STATUSES = new Set<NonNullable<MemoryIngestionCandidate["status"]>>([
  "active",
  "inactive",
  "conflicted",
  "quarantined",
]);

export function validateMemoryIngestionCandidate(
  candidate: MemoryIngestionCandidate,
): CandidateValidationError[] {
  const errors: CandidateValidationError[] = [];
  if (candidate.canonicalText.trim().length === 0) {
    errors.push({
      code: "missing_canonical_text",
      message: "canonical text is required",
    });
  }
  if (!VALID_SCOPES.has(candidate.scope)) {
    errors.push({
      code: "invalid_scope",
      message: `scope ${candidate.scope} is not supported`,
    });
  }
  if (candidate.status !== undefined && !VALID_STATUSES.has(candidate.status)) {
    errors.push({
      code: "invalid_status",
      message: `status ${candidate.status} is not supported`,
    });
  }
  if (candidate.sourceRefs.length === 0) {
    errors.push({
      code: "invalid_source_ref",
      message: "at least one source ref is required",
    });
  }
  for (const ref of candidate.sourceRefs) {
    if (!ref.sourceId || !ref.segmentId) {
      errors.push({
        code: "invalid_source_ref",
        message: "source refs require sourceId and segmentId",
      });
    }
    if (ref.evidenceQuote !== undefined && ref.evidenceQuote.trim().length === 0) {
      errors.push({
        code: "invalid_evidence",
        message: "evidence quote cannot be blank when provided",
      });
    }
  }
  return errors;
}

export function partitionMemoryIngestionCandidates(candidates: MemoryIngestionCandidate[]): {
  validCandidates: MemoryIngestionCandidate[];
  quarantinedCandidates: CandidateQuarantineRecord[];
} {
  const validCandidates: MemoryIngestionCandidate[] = [];
  const quarantinedCandidates: CandidateQuarantineRecord[] = [];
  for (const candidate of candidates) {
    const errors = validateMemoryIngestionCandidate(candidate);
    if (errors.length === 0) {
      validCandidates.push(candidate);
    } else {
      quarantinedCandidates.push({
        candidateId: candidate.candidateId,
        candidateType: candidate.candidateType,
        failureClass: errors.some((error) => error.code === "missing_canonical_text")
          ? "canonicalization"
          : "extraction_repair",
        errors,
        sourceRefs: candidate.sourceRefs,
      });
    }
  }
  return { validCandidates, quarantinedCandidates };
}

export function buildCandidateRepairPayload(input: {
  candidate: MemoryIngestionCandidate;
  validationErrors: CandidateValidationError[];
}): {
  candidate_id: string;
  candidate_type: MemoryIngestionCandidate["candidateType"];
  canonical_text: string;
  source_refs: MemoryIngestionCandidateRef[];
  validation_errors: CandidateValidationError[];
} {
  return {
    candidate_id: input.candidate.candidateId,
    candidate_type: input.candidate.candidateType,
    canonical_text: input.candidate.canonicalText,
    source_refs: input.candidate.sourceRefs,
    validation_errors: input.validationErrors,
  };
}

export function partitionMemoryEdgesByKnownEndpoints<
  T extends { from_memory_id: string; to_memory_id: string },
>(input: {
  edges: T[];
  knownMemoryIds: ReadonlySet<string>;
}): {
  validEdges: T[];
  deferredEdges: Array<DeferredMemoryEdge<T>>;
} {
  const validEdges: T[] = [];
  const deferredEdges: Array<DeferredMemoryEdge<T>> = [];
  for (const edge of input.edges) {
    const missingEndpointIds = [edge.from_memory_id, edge.to_memory_id].filter(
      (endpointId) => !input.knownMemoryIds.has(endpointId),
    );
    if (missingEndpointIds.length > 0) {
      deferredEdges.push({
        edge,
        reason: `missing endpoint memory id(s): ${missingEndpointIds.join(", ")}`,
      });
    } else {
      validEdges.push(edge);
    }
  }
  return { validEdges, deferredEdges };
}

function redactSourceRefsForReport(
  refs: MemoryIngestionCandidateRef[],
): MemoryIngestionQuarantineReportRecord["source_refs"] {
  return refs.map((ref) => ({
    source_id: ref.sourceId,
    segment_id: ref.segmentId,
    ...(typeof ref.startChar === "number" ? { start_char: ref.startChar } : {}),
    ...(typeof ref.endChar === "number" ? { end_char: ref.endChar } : {}),
  }));
}

function summarizeCandidateErrors(errors: CandidateValidationError[]): string {
  return errors.map((error) => error.code).join(",") || "candidate_validation_failed";
}

export function buildCandidateQuarantineReportRecords(input: {
  sourceId?: string;
  sourceHash?: string;
  provider?: string;
  model?: string;
  schema?: string;
  quarantinedCandidates?: CandidateQuarantineRecord[];
  deferredCandidates?: Array<{
    memoryId?: string;
    reason: string;
  }>;
  deferredEdges?: Array<{
    edgeId?: string;
    fromMemoryId?: string;
    toMemoryId?: string;
    reason: string;
  }>;
}): MemoryIngestionQuarantineReportRecord[] {
  const candidateRecords = (input.quarantinedCandidates ?? []).map((candidate) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    candidate_id: candidate.candidateId,
    candidate_type: candidate.candidateType,
    failure_class: candidate.failureClass,
    failure_stage: "candidate_quarantine" as const,
    validation_reason: summarizeCandidateErrors(candidate.errors),
    provider: input.provider,
    model: input.model,
    schema: input.schema,
    source_refs: redactSourceRefsForReport(candidate.sourceRefs),
  }));
  const deferredCandidateRecords = (input.deferredCandidates ?? []).map((candidate) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    memory_id: candidate.memoryId,
    failure_class: "db_persistence" as const,
    failure_stage: "persistence_boundary" as const,
    validation_reason: candidate.reason,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
  }));
  const edgeRecords = (input.deferredEdges ?? []).map((edge) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    edge_id: edge.edgeId,
    memory_id: [edge.fromMemoryId, edge.toMemoryId].filter(Boolean).join("->") || undefined,
    failure_class: "db_persistence" as const,
    failure_stage: "edge_endpoint_validation" as const,
    validation_reason: edge.reason,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
  }));
  return [...candidateRecords, ...deferredCandidateRecords, ...edgeRecords].map((record) =>
    assertMemoryIngestionReportRecordHasNoDarkData(record),
  );
}
