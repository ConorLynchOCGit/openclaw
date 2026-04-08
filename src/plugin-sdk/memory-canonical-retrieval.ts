import type {
  CanonicalMemoryFacetMap,
  CanonicalMemoryFacetValue,
  CanonicalMemoryKind,
  CanonicalMemoryScope,
  CanonicalMemoryValidationStatus,
} from "./memory-canonical-core.js";

export const CANONICAL_MEMORY_RETRIEVAL_OPERATORS = ["equals", "contains", "present"] as const;

export type CanonicalMemoryRetrievalOperator =
  (typeof CANONICAL_MEMORY_RETRIEVAL_OPERATORS)[number];

export const CANONICAL_MEMORY_SEMANTIC_FALLBACK_STRATEGIES = [
  "procedure",
  "environment_constraint",
  "workflow_tool_gotcha",
  "api_workaround",
] as const;

export type CanonicalMemorySemanticFallbackStrategy =
  (typeof CANONICAL_MEMORY_SEMANTIC_FALLBACK_STRATEGIES)[number];

export type CanonicalMemoryRetrievalFacetFilter = {
  key: string;
  operator: CanonicalMemoryRetrievalOperator;
  value?: CanonicalMemoryFacetValue;
};

export type CanonicalMemoryRetrievalCompatibility = {
  legacyKind?: string;
  legacyScope?: string;
  metadata?: CanonicalMemoryFacetMap;
};

export type CanonicalMemoryRetrievalQuery = {
  rawQuery: string;
  normalizedQuery: string;
  requestedKinds: readonly CanonicalMemoryKind[];
  scope: CanonicalMemoryScope;
  derivedViews: readonly string[];
  facetFilters: readonly CanonicalMemoryRetrievalFacetFilter[];
  compatibility?: CanonicalMemoryRetrievalCompatibility;
};

export type CanonicalMemoryRankingHint = {
  preferValidationStatuses: readonly CanonicalMemoryValidationStatus[];
  boostFacetFilters: readonly CanonicalMemoryRetrievalFacetFilter[];
  preferApprovedWithinSubjectClusters: boolean;
  semanticFallbackStrategies: readonly CanonicalMemorySemanticFallbackStrategy[];
};

export type CanonicalMemoryRetrievalPlan = {
  query: CanonicalMemoryRetrievalQuery;
  ranking: CanonicalMemoryRankingHint;
};

function normalizeKinds(kinds: readonly CanonicalMemoryKind[]): readonly CanonicalMemoryKind[] {
  return [...new Set(kinds)];
}

function normalizeDerivedViews(views: readonly string[]): readonly string[] {
  return [...new Set(views.map((view) => view.trim()).filter((view) => view.length > 0))];
}

function normalizeFacetFilters(
  filters: readonly CanonicalMemoryRetrievalFacetFilter[],
): readonly CanonicalMemoryRetrievalFacetFilter[] {
  return filters
    .filter((filter) => filter.key.trim().length > 0)
    .map((filter) => ({
      key: filter.key.trim(),
      operator: filter.operator,
      ...(filter.value !== undefined ? { value: filter.value } : {}),
    }));
}

export function createCanonicalMemoryRetrievalQuery(
  input: CanonicalMemoryRetrievalQuery,
): CanonicalMemoryRetrievalQuery {
  return {
    ...input,
    rawQuery: input.rawQuery.trim(),
    normalizedQuery: input.normalizedQuery.trim(),
    requestedKinds: normalizeKinds(input.requestedKinds),
    derivedViews: normalizeDerivedViews(input.derivedViews),
    facetFilters: normalizeFacetFilters(input.facetFilters),
    ...(input.compatibility ? { compatibility: input.compatibility } : {}),
  };
}

export function createCanonicalMemoryRankingHint(
  input: CanonicalMemoryRankingHint,
): CanonicalMemoryRankingHint {
  return {
    preferValidationStatuses: [...new Set(input.preferValidationStatuses)],
    boostFacetFilters: normalizeFacetFilters(input.boostFacetFilters),
    preferApprovedWithinSubjectClusters: input.preferApprovedWithinSubjectClusters,
    semanticFallbackStrategies: [
      ...new Set(input.semanticFallbackStrategies),
    ] as readonly CanonicalMemorySemanticFallbackStrategy[],
  };
}

export function createCanonicalMemoryRetrievalPlan(
  input: CanonicalMemoryRetrievalPlan,
): CanonicalMemoryRetrievalPlan {
  return {
    query: createCanonicalMemoryRetrievalQuery(input.query),
    ranking: createCanonicalMemoryRankingHint(input.ranking),
  };
}
