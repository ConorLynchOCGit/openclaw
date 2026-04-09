export const CANONICAL_MEMORY_KINDS = ["user", "feedback", "project", "reference"] as const;

export type CanonicalMemoryKind = (typeof CANONICAL_MEMORY_KINDS)[number];

export const CANONICAL_MEMORY_SCOPE_KINDS = ["global", "project", "mixed"] as const;

export type CanonicalMemoryScopeKind = (typeof CANONICAL_MEMORY_SCOPE_KINDS)[number];

export type CanonicalMemoryScope =
  | { kind: "global" }
  | { kind: "project"; projectId?: string }
  | { kind: "mixed"; projectId?: string };

export const CANONICAL_MEMORY_VALIDATION_STATUSES = [
  "observed",
  "pending_confirmation",
  "hold_for_more_evidence",
  "review_required",
  "approved",
  "validated",
  "rejected",
  "superseded",
] as const;

export type CanonicalMemoryValidationStatus = (typeof CANONICAL_MEMORY_VALIDATION_STATUSES)[number];

export const CANONICAL_MEMORY_STABILITY_LEVELS = [
  "ephemeral",
  "bounded",
  "stable",
  "durable",
] as const;

export type CanonicalMemoryStability = (typeof CANONICAL_MEMORY_STABILITY_LEVELS)[number];

export const CANONICAL_MEMORY_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type CanonicalMemoryConfidenceLevel = (typeof CANONICAL_MEMORY_CONFIDENCE_LEVELS)[number];

// Deprecated v1 compatibility surface for legacy plugin/API consumers.
export const CANONICAL_MEMORY_RECOMMENDED_FACET_KEYS = [
  "interactionSurface",
  "behaviorMode",
  "workflowMode",
  "resourceType",
  "correctionMode",
  "procedureShape",
  "guidancePattern",
  "toolKey",
  "lessonKey",
  "subjectKey",
  "clusterKey",
  "rankingHints",
] as const;

export type CanonicalMemoryRecommendedFacetKey =
  (typeof CANONICAL_MEMORY_RECOMMENDED_FACET_KEYS)[number];

export type CanonicalMemoryFacetValue = string | number | boolean | readonly string[];

export type CanonicalMemoryFacetMap = Readonly<Record<string, CanonicalMemoryFacetValue>>;

export type CanonicalMemoryConfidence = {
  level: CanonicalMemoryConfidenceLevel;
  score?: number;
  rationale?: string;
};

export type CanonicalMemoryRecency = {
  observedAt?: string;
  confirmedAt?: string;
  lastAppliedAt?: string;
  expiresAt?: string;
};

export type CanonicalMemoryProvenance = {
  captureSeam?: string;
  captureProfile?: string;
  sourceAgent?: string;
  sourceSession?: string;
  sourceEvent?: string;
  reviewState?: string;
  reviewHistory?: readonly string[];
};

export type CanonicalMemoryApplicability = {
  promptSections?: readonly string[];
  directIntentClasses?: readonly string[];
  queryClasses?: readonly string[];
  toolKeys?: readonly string[];
  surfaces?: readonly string[];
};

export type CanonicalMemoryCompatibility = {
  transitionalFamilyId?: string;
  storageKinds?: readonly string[];
  captureClasses?: readonly string[];
  captureCategory?: string;
  captureSource?: string;
  phrasePatternProofFamilyId?: string;
};

export type CanonicalMemoryRecord = {
  kind: CanonicalMemoryKind;
  subject: string;
  statement: string;
  scope: CanonicalMemoryScope;
  confidence: CanonicalMemoryConfidence;
  validationStatus: CanonicalMemoryValidationStatus;
  stability: CanonicalMemoryStability;
  recency: CanonicalMemoryRecency;
  provenance: CanonicalMemoryProvenance;
  tags: readonly string[];
  facets: CanonicalMemoryFacetMap;
  applicability: CanonicalMemoryApplicability;
  compatibility?: CanonicalMemoryCompatibility;
};

export type CanonicalMemoryRecordInput = {
  kind: CanonicalMemoryKind;
  subject: string;
  statement: string;
  scope: CanonicalMemoryScope;
  confidence?: CanonicalMemoryConfidence;
  validationStatus?: CanonicalMemoryValidationStatus;
  stability?: CanonicalMemoryStability;
  recency?: CanonicalMemoryRecency;
  provenance?: CanonicalMemoryProvenance;
  tags?: readonly string[];
  facets?: CanonicalMemoryFacetMap;
  applicability?: CanonicalMemoryApplicability;
  compatibility?: CanonicalMemoryCompatibility;
};

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  if (!tags || tags.length === 0) {
    return [];
  }
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].toSorted();
}

export function mergeCanonicalMemoryFacets(
  ...facetSets: Array<CanonicalMemoryFacetMap | undefined>
): CanonicalMemoryFacetMap {
  const merged: Record<string, CanonicalMemoryFacetValue> = {};
  for (const facetSet of facetSets) {
    if (!facetSet) {
      continue;
    }
    for (const [key, value] of Object.entries(facetSet)) {
      if (Array.isArray(value)) {
        merged[key] = [...value];
        continue;
      }
      merged[key] = value;
    }
  }
  return merged;
}

export function createCanonicalMemoryRecord(
  input: CanonicalMemoryRecordInput,
): CanonicalMemoryRecord {
  return {
    kind: input.kind,
    subject: input.subject.trim(),
    statement: input.statement.trim(),
    scope: input.scope,
    confidence: input.confidence ?? { level: "medium" },
    validationStatus: input.validationStatus ?? "observed",
    stability: input.stability ?? "bounded",
    recency: input.recency ?? {},
    provenance: input.provenance ?? {},
    tags: normalizeTags(input.tags),
    facets: mergeCanonicalMemoryFacets(input.facets),
    applicability: input.applicability ?? {},
    ...(input.compatibility ? { compatibility: input.compatibility } : {}),
  };
}
