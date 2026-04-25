import {
  buildDerivedArtifactId,
  cloneJsonLike,
  dedupeDerivedSourceRefs,
  type DerivedArtifactSourceRef,
  type JsonLike,
} from "../../derived-artifact.ts";
import { countRuntimeTokens } from "../../runtime-read-models.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import type {
  MemoryPackType,
  RetrievalCandidateStatus,
  RetrievalCorpus,
  RetrievalIndexName,
} from "./types.ts";

export const HIERARCHICAL_RETRIEVAL_PLAN_SCHEMA_VERSION = "hierarchical_retrieval_plan.v1" as const;
export const HIERARCHICAL_RETRIEVAL_TELEMETRY_SCHEMA_VERSION =
  "hierarchical_retrieval_telemetry.v1" as const;

export type HierarchicalRetrievalMode = "disabled" | "shadow_report_only" | "explicit_eval";
export type HierarchicalRetrievalDecompositionMode = "single_pass" | "bounded_multi_pass";
export type HierarchicalRetrievalLane =
  | "fielded"
  | "lexical"
  | "projection_digest"
  | "graph"
  | "capsule"
  | "vector"
  | "temporal";

export type HierarchicalRetrievalMergeReasonCode =
  | "singleton"
  | "memory_id_match"
  | "projection_id_match"
  | "capsule_id_match"
  | "pack_id_match"
  | "source_memory_id_match"
  | "source_event_id_match"
  | "source_ref_match"
  | "scope_key_match"
  | "higher_authority_retained"
  | "lower_authority_retained";

export type HierarchicalRetrievalExclusionReason =
  | "hierarchical_disabled"
  | "subquery_limit"
  | "budget_overflow"
  | "invalid_subquery"
  | "stale"
  | "conflicted"
  | "inspection_only";

export type HierarchicalRetrievalParentEnvelope = {
  parentPlanId: string;
  parentGoal: string;
  parentQueryHash: string;
  parentRedactedLabel: string;
  retrievalPlanId?: string;
  scopeKey?: string;
};

export type HierarchicalRetrievalSubquery = {
  subqueryId: string;
  goal: string;
  queryHash: string;
  redactedLabel: string;
  purpose: string;
  desiredResultCount: number;
  priority: number;
  corpora?: RetrievalCorpus[];
  packTypes?: MemoryPackType[];
  indexes?: RetrievalIndexName[];
  scopeConstraints?: Record<string, unknown>;
};

export type HierarchicalRetrievalPlan = {
  schemaVersion: typeof HIERARCHICAL_RETRIEVAL_PLAN_SCHEMA_VERSION;
  planId: string;
  mode: Exclude<HierarchicalRetrievalMode, "disabled">;
  parent: HierarchicalRetrievalParentEnvelope;
  decompositionMode: HierarchicalRetrievalDecompositionMode;
  maxSubqueries: number;
  maxMergedResults: number;
  maxEstimatedTokens: number;
  subqueries: HierarchicalRetrievalSubquery[];
};

export type HierarchicalRetrievalCandidate = {
  candidateId: string;
  lane: HierarchicalRetrievalLane;
  memoryId?: string;
  projectionId?: string;
  capsuleId?: string;
  packId?: string;
  graphNodeIds?: string[];
  graphEdgeIds?: string[];
  sourceMemoryIds?: string[];
  sourceEventIds?: string[];
  sourceEdgeIds?: string[];
  sourceRefs?: DerivedArtifactSourceRef[];
  scopeKey?: string;
  authorityTier?: SourceAuthorityTier;
  authorityTiers?: SourceAuthorityTier[];
  sourceProfileId?: SourceProfileId;
  sourceProfileIds?: SourceProfileId[];
  status?: RetrievalCandidateStatus | "stale";
  rankBand?: "primary" | "secondary" | "overflow";
  score?: number;
  priority?: number;
  estimatedTokens?: number;
};

export type HierarchicalRetrievalSubqueryResult = {
  subqueryId: string;
  candidates: HierarchicalRetrievalCandidate[];
  excludedCandidateIds?: string[];
};

export type HierarchicalRetrievalMergedCandidate = {
  mergedCandidateId: string;
  selected: boolean;
  matchKeys: string[];
  sourceSubqueryIds: string[];
  sourceCandidateIds: string[];
  memoryIds: string[];
  projectionIds: string[];
  capsuleIds: string[];
  packIds: string[];
  graphNodeIds: string[];
  graphEdgeIds: string[];
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  scopeKeys: string[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  statuses: Array<RetrievalCandidateStatus | "stale">;
  lanes: HierarchicalRetrievalLane[];
  score: number;
  priority: number;
  estimatedTokens: number;
  mergeReasonCodes: HierarchicalRetrievalMergeReasonCode[];
};

export type HierarchicalRetrievalExclusion = {
  id: string;
  idType: "subquery" | "candidate" | "merged_candidate";
  reason: HierarchicalRetrievalExclusionReason;
  detail?: string;
};

export type HierarchicalRetrievalTelemetry = {
  schemaVersion: typeof HIERARCHICAL_RETRIEVAL_TELEMETRY_SCHEMA_VERSION;
  mode: HierarchicalRetrievalMode;
  defaultRetrievalChanged: false;
  parentPlanId?: string;
  planId?: string;
  subqueryIds: string[];
  subqueryCount: number;
  selectedMergedCandidateIds: string[];
  duplicateCandidateIds: string[];
  duplicateMergeReasons: HierarchicalRetrievalMergeReasonCode[];
  excludedIds: string[];
  exclusionReasons: Record<HierarchicalRetrievalExclusionReason, number>;
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  lanesUsed: HierarchicalRetrievalLane[];
  graphLaneUsed: boolean;
  projectionLaneUsed: boolean;
  capsuleLaneUsed: boolean;
  estimatedTokens: number;
};

export type HierarchicalRetrievalShadowResult = {
  mode: HierarchicalRetrievalMode;
  plan?: HierarchicalRetrievalPlan;
  subqueryResults: HierarchicalRetrievalSubqueryResult[];
  mergedCandidates: HierarchicalRetrievalMergedCandidate[];
  exclusions: HierarchicalRetrievalExclusion[];
  telemetry: HierarchicalRetrievalTelemetry;
};

const MAX_SHADOW_SUBQUERIES = 3;
const MAX_EXPLICIT_EVAL_SUBQUERIES = 5;

const PROHIBITED_KEYS = new Set([
  "queryText",
  "rawQuery",
  "rawPrompt",
  "raw_prompt",
  "promptText",
  "fullTranscript",
  "full_transcript",
  "rawTranscript",
  "raw_transcript",
  "rawToolLog",
  "raw_tool_log",
  "secret",
  "secrets",
  "privatePhrase",
  "private_phrase",
]);

const AUTHORITY_ORDER: Record<SourceAuthorityTier, number> = {
  user_authoritative: 5,
  curated_authoritative: 4,
  tool_grounded: 3,
  cited_soft: 2,
  inspection_only: 1,
};

function stableId(artifactType: string, seed: unknown): string {
  return buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType,
    seed,
  });
}

function uniqueSorted<T extends string>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].toSorted();
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
}

function assertNoProhibitedKeys(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `hierarchical retrieval input contains prohibited field: ${[...path, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSubquery(subquery: HierarchicalRetrievalSubquery): void {
  if (
    !isNonEmptyString(subquery.subqueryId) ||
    !isNonEmptyString(subquery.goal) ||
    !isNonEmptyString(subquery.queryHash) ||
    !isNonEmptyString(subquery.redactedLabel) ||
    !subquery.redactedLabel.startsWith("sha256:") ||
    !isNonEmptyString(subquery.purpose) ||
    !Number.isInteger(subquery.desiredResultCount) ||
    subquery.desiredResultCount <= 0
  ) {
    throw new Error(`invalid hierarchical retrieval subquery: ${subquery.subqueryId || "unknown"}`);
  }
}

function maxSubqueriesForMode(mode: HierarchicalRetrievalMode): number {
  return mode === "explicit_eval" ? MAX_EXPLICIT_EVAL_SUBQUERIES : MAX_SHADOW_SUBQUERIES;
}

export function buildHierarchicalRetrievalPlan(input: {
  mode: Exclude<HierarchicalRetrievalMode, "disabled">;
  parent: HierarchicalRetrievalParentEnvelope;
  subqueries: HierarchicalRetrievalSubquery[];
  decompositionMode?: HierarchicalRetrievalDecompositionMode;
  maxMergedResults?: number;
  maxEstimatedTokens?: number;
}): { plan: HierarchicalRetrievalPlan; exclusions: HierarchicalRetrievalExclusion[] } {
  assertNoProhibitedKeys(input);
  if (
    !isNonEmptyString(input.parent.parentPlanId) ||
    !isNonEmptyString(input.parent.parentGoal) ||
    !isNonEmptyString(input.parent.parentQueryHash) ||
    !isNonEmptyString(input.parent.parentRedactedLabel) ||
    !input.parent.parentRedactedLabel.startsWith("sha256:")
  ) {
    throw new Error("invalid hierarchical retrieval parent envelope");
  }
  input.subqueries.forEach(validateSubquery);
  const maxSubqueries = maxSubqueriesForMode(input.mode);
  const sortedSubqueries = clone(
    input.subqueries as unknown as JsonLike,
  ) as unknown as HierarchicalRetrievalSubquery[];
  sortedSubqueries.sort(
    (left, right) =>
      right.priority - left.priority || left.subqueryId.localeCompare(right.subqueryId),
  );
  const selectedSubqueries = sortedSubqueries.slice(0, maxSubqueries);
  const overflowSubqueries = sortedSubqueries.slice(maxSubqueries);
  const planSeed = {
    parent: input.parent,
    mode: input.mode,
    subqueryIds: selectedSubqueries.map((subquery) => subquery.subqueryId),
  };
  return {
    plan: {
      schemaVersion: HIERARCHICAL_RETRIEVAL_PLAN_SCHEMA_VERSION,
      planId: stableId("hierarchical_retrieval_plan", planSeed),
      mode: input.mode,
      parent: { ...input.parent },
      decompositionMode:
        input.decompositionMode ??
        (selectedSubqueries.length > 1 ? "bounded_multi_pass" : "single_pass"),
      maxSubqueries,
      maxMergedResults: input.maxMergedResults ?? 12,
      maxEstimatedTokens: input.maxEstimatedTokens ?? 1200,
      subqueries: selectedSubqueries,
    },
    exclusions: overflowSubqueries.map((subquery) => ({
      id: subquery.subqueryId,
      idType: "subquery",
      reason: "subquery_limit",
      detail: `mode ${input.mode} allows ${maxSubqueries} subqueries`,
    })),
  };
}

function sourceRefKey(sourceRef: DerivedArtifactSourceRef): string {
  return [
    sourceRef.sourceId,
    sourceRef.segmentId ?? "",
    sourceRef.sourceType ?? "",
    sourceRef.sourceIngestEventId ?? "",
    sourceRef.contentHash ?? "",
  ].join(":");
}

function candidateMatchKeys(candidate: HierarchicalRetrievalCandidate): string[] {
  const keys = [
    candidate.memoryId ? `memory:${candidate.memoryId}` : undefined,
    candidate.projectionId ? `projection:${candidate.projectionId}` : undefined,
    candidate.capsuleId ? `capsule:${candidate.capsuleId}` : undefined,
    candidate.packId ? `pack:${candidate.packId}` : undefined,
    ...(candidate.sourceMemoryIds ?? []).map((id) => `source_memory:${id}`),
    ...(candidate.sourceEventIds ?? []).map((id) => `source_event:${id}`),
    ...(candidate.sourceRefs ?? []).map((sourceRef) => `source_ref:${sourceRefKey(sourceRef)}`),
  ];
  const strongKeys = uniqueSorted(keys);
  if (strongKeys.length > 0) {
    return strongKeys;
  }
  return candidate.scopeKey
    ? [`scope:${candidate.scopeKey}`]
    : [`candidate:${candidate.candidateId}`];
}

function mergeReasonsForKeys(
  keys: string[],
  duplicate: boolean,
): HierarchicalRetrievalMergeReasonCode[] {
  const reasons: HierarchicalRetrievalMergeReasonCode[] = [];
  if (keys.some((key) => key.startsWith("memory:"))) {
    reasons.push("memory_id_match");
  }
  if (keys.some((key) => key.startsWith("projection:"))) {
    reasons.push("projection_id_match");
  }
  if (keys.some((key) => key.startsWith("capsule:"))) {
    reasons.push("capsule_id_match");
  }
  if (keys.some((key) => key.startsWith("pack:"))) {
    reasons.push("pack_id_match");
  }
  if (keys.some((key) => key.startsWith("source_memory:"))) {
    reasons.push("source_memory_id_match");
  }
  if (keys.some((key) => key.startsWith("source_event:"))) {
    reasons.push("source_event_id_match");
  }
  if (keys.some((key) => key.startsWith("source_ref:"))) {
    reasons.push("source_ref_match");
  }
  if (keys.some((key) => key.startsWith("scope:"))) {
    reasons.push("scope_key_match");
  }
  if (!duplicate && reasons.length === 0) {
    reasons.push("singleton");
  }
  return uniqueSorted(reasons);
}

function candidateAuthorityTiers(candidate: HierarchicalRetrievalCandidate): SourceAuthorityTier[] {
  return uniqueSorted([candidate.authorityTier, ...(candidate.authorityTiers ?? [])]);
}

function candidateSourceProfileIds(candidate: HierarchicalRetrievalCandidate): SourceProfileId[] {
  return uniqueSorted([candidate.sourceProfileId, ...(candidate.sourceProfileIds ?? [])]);
}

function bestAuthorityScore(authorityTiers: SourceAuthorityTier[]): number {
  return Math.max(0, ...authorityTiers.map((tier) => AUTHORITY_ORDER[tier] ?? 0));
}

function rankBandScore(rankBand: HierarchicalRetrievalCandidate["rankBand"]): number {
  switch (rankBand) {
    case "primary":
      return 3;
    case "secondary":
      return 2;
    case "overflow":
      return 1;
    default:
      return 0;
  }
}

function candidateSortKey(candidate: HierarchicalRetrievalCandidate): string {
  return [
    String(bestAuthorityScore(candidateAuthorityTiers(candidate))).padStart(2, "0"),
    String(candidate.priority ?? 0).padStart(4, "0"),
    String(rankBandScore(candidate.rankBand)).padStart(2, "0"),
    String(candidate.score ?? 0).padStart(8, "0"),
    candidate.candidateId,
  ].join(":");
}

function candidateExclusion(
  candidate: HierarchicalRetrievalCandidate,
): HierarchicalRetrievalExclusionReason | undefined {
  if (
    candidate.authorityTier === "inspection_only" ||
    candidate.authorityTiers?.includes("inspection_only")
  ) {
    return "inspection_only";
  }
  if (candidate.status === "stale") {
    return "stale";
  }
  if (candidate.status === "conflicted") {
    return "conflicted";
  }
  return undefined;
}

function mergedFromGroup(input: {
  groupKey: string;
  candidates: Array<{ subqueryId: string; candidate: HierarchicalRetrievalCandidate }>;
}): HierarchicalRetrievalMergedCandidate {
  const candidates = input.candidates
    .map((entry) => entry.candidate)
    .toSorted((left, right) => candidateSortKey(right).localeCompare(candidateSortKey(left)));
  const authorityTiers = uniqueSorted(candidates.flatMap(candidateAuthorityTiers));
  const sourceProfileIds = uniqueSorted(candidates.flatMap(candidateSourceProfileIds));
  const sourceRefs = dedupeDerivedSourceRefs(
    candidates.flatMap((candidate) => candidate.sourceRefs ?? []),
  );
  const matchKeys = uniqueSorted(candidates.flatMap(candidateMatchKeys));
  const duplicate =
    candidates.length > 1 ||
    uniqueSorted(input.candidates.map((entry) => entry.subqueryId)).length > 1;
  const mergeReasonCodes = mergeReasonsForKeys(matchKeys, duplicate);
  if (duplicate && authorityTiers.length > 1) {
    mergeReasonCodes.push("higher_authority_retained", "lower_authority_retained");
  }
  const estimatedTokens =
    candidates.reduce((sum, candidate) => sum + (candidate.estimatedTokens ?? 0), 0) ||
    countRuntimeTokens(candidates.map((candidate) => candidate.candidateId).join(" "));
  return {
    mergedCandidateId: stableId("hierarchical_retrieval_merged_candidate", {
      groupKey: input.groupKey,
      sourceCandidateIds: candidates.map((candidate) => candidate.candidateId).toSorted(),
    }),
    selected: true,
    matchKeys,
    sourceSubqueryIds: uniqueSorted(input.candidates.map((entry) => entry.subqueryId)),
    sourceCandidateIds: uniqueSorted(candidates.map((candidate) => candidate.candidateId)),
    memoryIds: uniqueSorted(candidates.map((candidate) => candidate.memoryId)),
    projectionIds: uniqueSorted(candidates.map((candidate) => candidate.projectionId)),
    capsuleIds: uniqueSorted(candidates.map((candidate) => candidate.capsuleId)),
    packIds: uniqueSorted(candidates.map((candidate) => candidate.packId)),
    graphNodeIds: uniqueSorted(candidates.flatMap((candidate) => candidate.graphNodeIds ?? [])),
    graphEdgeIds: uniqueSorted(candidates.flatMap((candidate) => candidate.graphEdgeIds ?? [])),
    sourceMemoryIds: uniqueSorted(
      candidates.flatMap((candidate) => candidate.sourceMemoryIds ?? []),
    ),
    sourceEventIds: uniqueSorted(candidates.flatMap((candidate) => candidate.sourceEventIds ?? [])),
    sourceEdgeIds: uniqueSorted(candidates.flatMap((candidate) => candidate.sourceEdgeIds ?? [])),
    sourceRefs,
    scopeKeys: uniqueSorted(candidates.map((candidate) => candidate.scopeKey)),
    authorityTiers,
    sourceProfileIds,
    statuses: uniqueSorted(candidates.map((candidate) => candidate.status)),
    lanes: uniqueSorted(candidates.map((candidate) => candidate.lane)),
    score: Math.max(0, ...candidates.map((candidate) => candidate.score ?? 0)),
    priority: Math.max(0, ...candidates.map((candidate) => candidate.priority ?? 0)),
    estimatedTokens,
    mergeReasonCodes: uniqueSorted(mergeReasonCodes),
  };
}

function selectedCandidateSort(
  left: HierarchicalRetrievalMergedCandidate,
  right: HierarchicalRetrievalMergedCandidate,
): number {
  return (
    bestAuthorityScore(right.authorityTiers) - bestAuthorityScore(left.authorityTiers) ||
    right.priority - left.priority ||
    right.score - left.score ||
    left.mergedCandidateId.localeCompare(right.mergedCandidateId)
  );
}

export function mergeHierarchicalRetrievalResults(input: {
  plan: HierarchicalRetrievalPlan;
  subqueryResults: HierarchicalRetrievalSubqueryResult[];
}): {
  mergedCandidates: HierarchicalRetrievalMergedCandidate[];
  exclusions: HierarchicalRetrievalExclusion[];
} {
  assertNoProhibitedKeys(input);
  const groups = new Map<
    string,
    Array<{ subqueryId: string; candidate: HierarchicalRetrievalCandidate }>
  >();
  const exclusions: HierarchicalRetrievalExclusion[] = [];
  const allowedSubqueryIds = new Set(input.plan.subqueries.map((subquery) => subquery.subqueryId));
  for (const result of input.subqueryResults) {
    if (!allowedSubqueryIds.has(result.subqueryId)) {
      exclusions.push({
        id: result.subqueryId,
        idType: "subquery",
        reason: "invalid_subquery",
        detail: "result did not match the bounded hierarchical plan",
      });
      continue;
    }
    for (const candidate of result.candidates) {
      const reason = candidateExclusion(candidate);
      if (reason) {
        exclusions.push({ id: candidate.candidateId, idType: "candidate", reason });
        continue;
      }
      const primaryKey = candidateMatchKeys(candidate)[0] ?? `candidate:${candidate.candidateId}`;
      groups.set(primaryKey, [
        ...(groups.get(primaryKey) ?? []),
        {
          subqueryId: result.subqueryId,
          candidate: clone(
            candidate as unknown as JsonLike,
          ) as unknown as HierarchicalRetrievalCandidate,
        },
      ]);
    }
  }
  const merged = [...groups.entries()]
    .map(([groupKey, candidates]) => mergedFromGroup({ groupKey, candidates }))
    .toSorted(selectedCandidateSort);
  const selected: HierarchicalRetrievalMergedCandidate[] = [];
  let tokenTotal = 0;
  for (const candidate of merged) {
    if (
      selected.length >= input.plan.maxMergedResults ||
      tokenTotal + candidate.estimatedTokens > input.plan.maxEstimatedTokens
    ) {
      candidate.selected = false;
      exclusions.push({
        id: candidate.mergedCandidateId,
        idType: "merged_candidate",
        reason: "budget_overflow",
      });
      continue;
    }
    selected.push(candidate);
    tokenTotal += candidate.estimatedTokens;
  }
  return {
    mergedCandidates: [...selected, ...merged.filter((candidate) => !candidate.selected)],
    exclusions,
  };
}

function countExclusions(
  exclusions: HierarchicalRetrievalExclusion[],
): Record<HierarchicalRetrievalExclusionReason, number> {
  return {
    hierarchical_disabled: exclusions.filter((entry) => entry.reason === "hierarchical_disabled")
      .length,
    subquery_limit: exclusions.filter((entry) => entry.reason === "subquery_limit").length,
    budget_overflow: exclusions.filter((entry) => entry.reason === "budget_overflow").length,
    invalid_subquery: exclusions.filter((entry) => entry.reason === "invalid_subquery").length,
    stale: exclusions.filter((entry) => entry.reason === "stale").length,
    conflicted: exclusions.filter((entry) => entry.reason === "conflicted").length,
    inspection_only: exclusions.filter((entry) => entry.reason === "inspection_only").length,
  };
}

function telemetry(input: {
  mode: HierarchicalRetrievalMode;
  plan?: HierarchicalRetrievalPlan;
  mergedCandidates: HierarchicalRetrievalMergedCandidate[];
  exclusions: HierarchicalRetrievalExclusion[];
}): HierarchicalRetrievalTelemetry {
  const selected = input.mergedCandidates.filter((candidate) => candidate.selected);
  const duplicateCandidates = input.mergedCandidates.filter(
    (candidate) => candidate.sourceCandidateIds.length > 1,
  );
  const lanesUsed = uniqueSorted(input.mergedCandidates.flatMap((candidate) => candidate.lanes));
  return {
    schemaVersion: HIERARCHICAL_RETRIEVAL_TELEMETRY_SCHEMA_VERSION,
    mode: input.mode,
    defaultRetrievalChanged: false,
    parentPlanId: input.plan?.parent.parentPlanId,
    planId: input.plan?.planId,
    subqueryIds: input.plan?.subqueries.map((subquery) => subquery.subqueryId).toSorted() ?? [],
    subqueryCount: input.plan?.subqueries.length ?? 0,
    selectedMergedCandidateIds: selected.map((candidate) => candidate.mergedCandidateId).toSorted(),
    duplicateCandidateIds: uniqueSorted(
      duplicateCandidates.flatMap((candidate) => candidate.sourceCandidateIds),
    ),
    duplicateMergeReasons: uniqueSorted(
      duplicateCandidates.flatMap((candidate) => candidate.mergeReasonCodes),
    ),
    excludedIds: input.exclusions.map((exclusion) => exclusion.id).toSorted(),
    exclusionReasons: countExclusions(input.exclusions),
    authorityTiers: uniqueSorted(
      input.mergedCandidates.flatMap((candidate) => candidate.authorityTiers),
    ),
    sourceProfileIds: uniqueSorted(
      input.mergedCandidates.flatMap((candidate) => candidate.sourceProfileIds),
    ),
    lanesUsed,
    graphLaneUsed: lanesUsed.includes("graph"),
    projectionLaneUsed: lanesUsed.includes("projection_digest"),
    capsuleLaneUsed: lanesUsed.includes("capsule"),
    estimatedTokens: selected.reduce((sum, candidate) => sum + candidate.estimatedTokens, 0),
  };
}

export function buildHierarchicalRetrievalShadow(input: {
  mode?: HierarchicalRetrievalMode;
  parent?: HierarchicalRetrievalParentEnvelope;
  subqueries?: HierarchicalRetrievalSubquery[];
  subqueryResults?: HierarchicalRetrievalSubqueryResult[];
  decompositionMode?: HierarchicalRetrievalDecompositionMode;
  maxMergedResults?: number;
  maxEstimatedTokens?: number;
}): HierarchicalRetrievalShadowResult {
  assertNoProhibitedKeys(input);
  const mode = input.mode ?? "disabled";
  if (mode === "disabled") {
    const exclusions = (input.subqueries ?? []).map((subquery) => ({
      id: subquery.subqueryId,
      idType: "subquery" as const,
      reason: "hierarchical_disabled" as const,
    }));
    return {
      mode,
      subqueryResults: [],
      mergedCandidates: [],
      exclusions,
      telemetry: telemetry({ mode, mergedCandidates: [], exclusions }),
    };
  }
  if (!input.parent) {
    throw new Error("hierarchical retrieval requires a parent envelope when enabled");
  }
  const { plan, exclusions: planExclusions } = buildHierarchicalRetrievalPlan({
    mode,
    parent: input.parent,
    subqueries: input.subqueries ?? [],
    decompositionMode: input.decompositionMode,
    maxMergedResults: input.maxMergedResults,
    maxEstimatedTokens: input.maxEstimatedTokens,
  });
  const resultBySubqueryId = new Map(
    (input.subqueryResults ?? []).map((result) => [result.subqueryId, result]),
  );
  const subqueryResults = plan.subqueries.map((subquery) => {
    const result = resultBySubqueryId.get(subquery.subqueryId);
    return result
      ? (clone(result as unknown as JsonLike) as unknown as HierarchicalRetrievalSubqueryResult)
      : { subqueryId: subquery.subqueryId, candidates: [] };
  });
  const merged = mergeHierarchicalRetrievalResults({ plan, subqueryResults });
  const exclusions = [...planExclusions, ...merged.exclusions];
  return {
    mode,
    plan,
    subqueryResults,
    mergedCandidates: merged.mergedCandidates,
    exclusions,
    telemetry: telemetry({
      mode,
      plan,
      mergedCandidates: merged.mergedCandidates,
      exclusions,
    }),
  };
}
