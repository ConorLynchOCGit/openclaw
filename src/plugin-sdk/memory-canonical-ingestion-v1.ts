import {
  createCanonicalMemoryRecord,
  mergeCanonicalMemoryFacets,
  type CanonicalMemoryFacetMap,
  type CanonicalMemoryRecord,
  type CanonicalMemoryRecordInput,
  type CanonicalMemoryValidationStatus,
} from "./memory-canonical-core-v1.js";

export const CANONICAL_MEMORY_INGESTION_MODES = [
  "ordinary_turn",
  "candidate_learning",
  "candidate_correction",
  "candidate_procedure",
  "candidate_improvement",
  "compatibility_adapter",
] as const;

export type CanonicalMemoryIngestionMode = (typeof CANONICAL_MEMORY_INGESTION_MODES)[number];

export const CANONICAL_MEMORY_INGESTION_SOURCES = [
  "content",
  "raw",
  "transcript",
  "compatibility_adapter",
] as const;

export type CanonicalMemoryIngestionSource = (typeof CANONICAL_MEMORY_INGESTION_SOURCES)[number];

export const CANONICAL_MEMORY_CANDIDATE_KINDS = [
  "learning",
  "correction",
  "procedure",
  "improvement",
] as const;

export type CanonicalMemoryCandidateKind = (typeof CANONICAL_MEMORY_CANDIDATE_KINDS)[number];

export type CanonicalMemoryIngestionReviewMode =
  | "direct"
  | Extract<
      CanonicalMemoryValidationStatus,
      "pending_confirmation" | "hold_for_more_evidence" | "review_required"
    >;

export type CanonicalMemoryIngestionIdentity = {
  dedupeKey?: string;
  clusterKey?: string;
  subjectKey?: string;
};

export type CanonicalMemoryIngestionCapture = {
  mode: CanonicalMemoryIngestionMode;
  source: CanonicalMemoryIngestionSource;
  observedText: string;
  evidence: readonly string[];
  detectionSource?: string;
  reviewMode?: CanonicalMemoryIngestionReviewMode;
};

export type CanonicalMemoryIngestionCompatibility = {
  transitionalFamilyId?: string;
  candidateKind?: CanonicalMemoryCandidateKind;
  captureClass?: string;
  reasonCode?: string;
  template?: string;
  metadata?: CanonicalMemoryFacetMap;
};

export type CanonicalMemoryIngestionCandidate = {
  record: CanonicalMemoryRecord;
  identity: CanonicalMemoryIngestionIdentity;
  capture: CanonicalMemoryIngestionCapture;
  compatibility?: CanonicalMemoryIngestionCompatibility;
};

export type CanonicalMemoryIngestionCandidateInput = {
  record: CanonicalMemoryRecord | CanonicalMemoryRecordInput;
  identity?: CanonicalMemoryIngestionIdentity;
  capture: CanonicalMemoryIngestionCapture;
  compatibility?: CanonicalMemoryIngestionCompatibility;
};

export type CanonicalMemoryIngestionBatch = {
  sourceTurnId?: string;
  sourceSession?: string;
  sourceEvent?: string;
  candidates: readonly CanonicalMemoryIngestionCandidate[];
};

function normalizeEvidence(evidence: readonly string[]): readonly string[] {
  return [...new Set(evidence.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

function isCanonicalMemoryRecord(
  input: CanonicalMemoryRecord | CanonicalMemoryRecordInput,
): input is CanonicalMemoryRecord {
  return (
    "validationStatus" in input &&
    "confidence" in input &&
    "stability" in input &&
    "recency" in input &&
    "provenance" in input &&
    "applicability" in input
  );
}

function normalizeRecord(
  input: CanonicalMemoryRecord | CanonicalMemoryRecordInput,
): CanonicalMemoryRecord {
  return isCanonicalMemoryRecord(input) ? input : createCanonicalMemoryRecord(input);
}

export function createCanonicalMemoryIngestionCandidate(
  input: CanonicalMemoryIngestionCandidateInput,
): CanonicalMemoryIngestionCandidate {
  const record = normalizeRecord(input.record);
  const compatibility = input.compatibility
    ? {
        ...input.compatibility,
        ...(input.compatibility.metadata
          ? { metadata: mergeCanonicalMemoryFacets(input.compatibility.metadata) }
          : {}),
      }
    : undefined;

  return {
    record,
    identity: {
      ...(input.identity?.dedupeKey ? { dedupeKey: input.identity.dedupeKey } : {}),
      ...(input.identity?.clusterKey ? { clusterKey: input.identity.clusterKey } : {}),
      ...(input.identity?.subjectKey ? { subjectKey: input.identity.subjectKey } : {}),
    },
    capture: {
      ...input.capture,
      observedText: input.capture.observedText.trim(),
      evidence: normalizeEvidence(input.capture.evidence),
    },
    ...(compatibility ? { compatibility } : {}),
  };
}

export function createCanonicalMemoryIngestionBatch(params: {
  candidates: readonly CanonicalMemoryIngestionCandidate[];
  sourceTurnId?: string;
  sourceSession?: string;
  sourceEvent?: string;
}): CanonicalMemoryIngestionBatch {
  return {
    ...(params.sourceTurnId ? { sourceTurnId: params.sourceTurnId } : {}),
    ...(params.sourceSession ? { sourceSession: params.sourceSession } : {}),
    ...(params.sourceEvent ? { sourceEvent: params.sourceEvent } : {}),
    candidates: [...params.candidates],
  };
}
