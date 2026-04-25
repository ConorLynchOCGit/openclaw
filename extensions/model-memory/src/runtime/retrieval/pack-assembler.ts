import { summarizeModelMemoryPayload, summarizeModelMemoryValue } from "../../payload-summary.ts";
import {
  buildRuntimeId,
  countRuntimeTokens,
  type RetrievalRequestRecord,
  type RetrievalResultItemRecord,
  type RuntimeMemoryRecord,
} from "../../runtime-read-models.ts";
import { hashRetrievalQuery } from "./candidate-recall.ts";
import type {
  MemoryPack,
  MemoryPackInjectionTarget,
  MemoryPackItem,
  MemoryPackSection,
  MemoryPackType,
  ProjectionDigest,
  RetrievalCandidate,
  RetrievalEmptyReason,
  RetrievalExclusion,
  RetrievalMetrics,
  RetrievalPackAssemblyInput,
  RetrievalRun,
} from "./types.ts";

function boundedText(value: string, maxLength = 320): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function scopeLabel(object: RuntimeMemoryRecord): string {
  const entries = Object.entries(object.scope ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim().length > 0,
  );
  if (entries.length === 0) {
    return "global";
  }
  return entries
    .map(([key, value]) => `${key}:${typeof value === "string" ? value : JSON.stringify(value)}`)
    .toSorted((left, right) => left.localeCompare(right))
    .join(",");
}

function provenanceLabel(object: RuntimeMemoryRecord): string {
  const first = object.provenance?.[0];
  if (!first) {
    return "source unavailable";
  }
  const sourceId = typeof first.sourceId === "string" ? first.sourceId : undefined;
  const blockId = typeof first.blockId === "string" ? first.blockId : undefined;
  return [sourceId, blockId].filter(Boolean).join("#") || "source unavailable";
}

function itemFromMemory(object: RuntimeMemoryRecord): MemoryPackItem {
  return {
    itemId: buildRuntimeId("memory_pack_item", object.id),
    memoryId: object.id,
    kind: object.kind,
    text: boundedText(
      summarizeModelMemoryPayload({
        kind: object.kind,
        payload: object.payload,
      }),
    ),
    scopeLabel: scopeLabel(object),
    confidence: object.confidence,
    authority: object.sourceAuthorityTier ?? object.activationBasis ?? object.contractName,
    sourceLabel: provenanceLabel(object),
    evidenceIds: object.provenance
      ?.map((span) => {
        const sourceId = typeof span.sourceId === "string" ? span.sourceId : undefined;
        const blockId = typeof span.blockId === "string" ? span.blockId : undefined;
        return [sourceId, blockId].filter(Boolean).join("#");
      })
      .filter((value) => value.length > 0),
  };
}

function itemFromProjection(digest: ProjectionDigest): MemoryPackItem {
  return {
    itemId: buildRuntimeId("memory_pack_item", digest.projectionId),
    projectionId: digest.projectionId,
    kind: "projection_digest",
    text: boundedText(
      [
        digest.title,
        digest.summary,
        digest.digestPath ? `path:${digest.digestPath}` : undefined,
        `source_memory_count:${digest.sourceMemoryIds.length}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    scopeLabel: "projection",
    confidence: "derived",
    authority: "mmv2_projection_digest",
    sourceLabel: digest.digestPath ?? digest.projectionId,
    evidenceIds: digest.sourceMemoryIds,
  };
}

function packTypeForMemory(object: RuntimeMemoryRecord): MemoryPackType {
  if (object.kind === "rule") {
    return "operating_pack";
  }
  if (object.kind === "preference") {
    return "user_profile_pack";
  }
  if (object.kind === "procedure") {
    return "procedure_pack";
  }
  if (object.kind === "reference") {
    return "source_reference_pack";
  }
  if (
    object.activationBasis === "daily_recovery_candidate" ||
    object.rationaleCodes.includes("episode") ||
    object.normalizedSearchText.includes("episode")
  ) {
    return "episode_continuity_pack";
  }
  if (object.canonicalClass === "user") {
    return "user_profile_pack";
  }
  return "project_state_pack";
}

function sectionForPack(packType: MemoryPackType): {
  sectionType: MemoryPackSection["sectionType"];
  priority: number;
  injectionTarget: MemoryPackInjectionTarget;
  tokenBudget: number;
} {
  switch (packType) {
    case "operating_pack":
      return {
        sectionType: "hard_directives",
        priority: 100,
        injectionTarget: "systemPromptAddition",
        tokenBudget: 250,
      };
    case "user_profile_pack":
      return {
        sectionType: "soft_preferences",
        priority: 85,
        injectionTarget: "message",
        tokenBudget: 150,
      };
    case "procedure_pack":
      return {
        sectionType: "procedure",
        priority: 75,
        injectionTarget: "message",
        tokenBudget: 550,
      };
    case "source_reference_pack":
      return {
        sectionType: "source_refs",
        priority: 70,
        injectionTarget: "tool_hint",
        tokenBudget: 250,
      };
    case "episode_continuity_pack":
      return {
        sectionType: "recent_episodes",
        priority: 60,
        injectionTarget: "message",
        tokenBudget: 150,
      };
    case "projection_digest_pack":
      return {
        sectionType: "projection_digest",
        priority: 65,
        injectionTarget: "message",
        tokenBudget: 150,
      };
    case "conflict_pack":
      return {
        sectionType: "conflicts",
        priority: 90,
        injectionTarget: "message",
        tokenBudget: 100,
      };
    case "entity_world_pack":
      return {
        sectionType: "entity_digest",
        priority: 55,
        injectionTarget: "message",
        tokenBudget: 250,
      };
    case "project_state_pack":
    default:
      return {
        sectionType: "project_state",
        priority: 80,
        injectionTarget: "message",
        tokenBudget: 350,
      };
  }
}

function buildPack(input: {
  packType: MemoryPackType;
  items: MemoryPackItem[];
  request: RetrievalRequestRecord;
  retrievalPlanId: string;
  candidateCount: number;
  exclusions: RetrievalExclusion[];
  metrics: RetrievalMetrics;
  generatedAt: Date;
}): MemoryPack {
  const section = sectionForPack(input.packType);
  const packId = buildRuntimeId(
    "memory_pack",
    `${input.request.id}:${input.packType}:${input.items.map((item) => item.memoryId ?? item.projectionId ?? item.itemId).join("|")}`,
  );
  const sources = input.items.reduce<MemoryPack["sources"]>((acc, item) => {
    if (item.memoryId) {
      acc.push({ memoryId: item.memoryId, sourceLabel: item.sourceLabel ?? "memory" });
      return acc;
    }
    if (item.projectionId) {
      acc.push({
        projectionId: item.projectionId,
        sourceLabel: item.sourceLabel ?? "projection_digest",
      });
    }
    return acc;
  }, []);
  return {
    packId,
    schemaVersion: "memory_pack.v1",
    packType: input.packType,
    runId: input.request.id,
    sessionId: input.request.sessionId ?? null,
    userId: typeof input.request.scope.userId === "string" ? input.request.scope.userId : null,
    projectId:
      typeof input.request.scope.projectId === "string" ? input.request.scope.projectId : null,
    intent: input.request.requestPurpose,
    generatedAt: input.generatedAt.toISOString(),
    tokenBudget: section.tokenBudget,
    estimatedTokens: countRuntimeTokens(input.items.map((item) => item.text).join("\n")),
    sections: [
      {
        sectionId: buildRuntimeId("memory_pack_section", `${packId}:${section.sectionType}`),
        sectionType: section.sectionType,
        priority: section.priority,
        renderMode: section.injectionTarget === "tool_hint" ? "compact_json" : "markdown",
        items: input.items,
      },
    ],
    sources,
    exclusions: input.exclusions,
    telemetry: {
      retrievalPlanId: input.retrievalPlanId,
      candidateCount: input.candidateCount,
      selectedCount: input.items.length,
      injected: input.items.length > 0,
      injectionTarget: section.injectionTarget,
      metrics: input.metrics,
    },
  };
}

function buildConflictItems(conflictCandidates: RetrievalCandidate[]): MemoryPackItem[] {
  return conflictCandidates.flatMap((candidate) => {
    if (!candidate.memory) {
      return [];
    }
    const item = itemFromMemory(candidate.memory);
    return [
      {
        ...item,
        text: boundedText(`Unresolved conflict: ${item.text}`),
      },
    ];
  });
}

function countExclusionReasons(exclusions: RetrievalExclusion[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const exclusion of exclusions) {
    counts[exclusion.reason] = (counts[exclusion.reason] ?? 0) + 1;
  }
  return counts;
}

function buildRankingFeatureSummary(input: {
  retrievalResultItems: RetrievalResultItemRecord[];
  exclusions: RetrievalExclusion[];
  projectionDigests?: ProjectionDigest[];
}): RetrievalMetrics["rankingFeatures"] {
  const reasonCodes = input.retrievalResultItems.flatMap((item) => item.retrievalReasonCodes);
  const countReason = (reason: string) => reasonCodes.filter((code) => code === reason).length;
  const countLane = (lane: string) =>
    input.exclusions.filter((exclusion) => exclusion.sourceLane === lane).length;
  return {
    fielded:
      countReason("class_match") +
      countReason("kind_match") +
      countReason("scope_exact_match") +
      countReason("scope_partial_match") +
      countReason("scope_broad_match") +
      countLane("fielded"),
    lexical:
      countReason("subject_match") +
      countReason("text_match") +
      countReason("lexical_baseline") +
      countLane("lexical"),
    sourceLineage: countReason("source_lineage_match") + countLane("source_lineage"),
    projectionDigest: (input.projectionDigests ?? []).length + countLane("projection_digest"),
    conflictLane: countLane("conflict_lane"),
    vector: 0,
    temporal: countReason("recent_memory"),
    scopeExact: countReason("scope_exact_match"),
    scopePartial: countReason("scope_partial_match"),
    scopeBroad: countReason("scope_broad_match"),
    staleSuppression: input.exclusions.filter((exclusion) => exclusion.reason === "stale").length,
    conflictSuppression: input.exclusions.filter((exclusion) => exclusion.reason === "conflicted")
      .length,
    inactiveSuppression: input.exclusions.filter((exclusion) => exclusion.reason === "inactive")
      .length,
  };
}

function resolveEmptyRetrievalReason(input: {
  selectedCount: number;
  candidateCount: number;
  exclusions: RetrievalExclusion[];
}): RetrievalEmptyReason {
  if (input.selectedCount > 0) {
    return "none";
  }
  if (input.exclusions.length > 0) {
    const reasons = [...new Set(input.exclusions.map((exclusion) => exclusion.reason))];
    if (reasons.length === 1) {
      switch (reasons[0]) {
        case "stale":
          return "suppressed_stale";
        case "superseded":
          return "suppressed_superseded";
        case "conflicted":
          return "suppressed_conflicted";
        case "inactive":
          return "suppressed_inactive";
        case "hash_invalid":
          return "suppressed_hash_invalid";
        case "deleted":
          return "suppressed_deleted";
        case "scope_mismatch":
          return "scope_mismatch_only";
        case "budget":
          return "pack_budget_trimmed";
        case "sensitive":
          return "privacy_no_store_exclusion";
        case "low_score":
          return "ranking_below_cutoff";
        default:
          return "memory_existed_but_excluded";
      }
    }
    const allSuppressed = reasons.every((reason) =>
      ["stale", "superseded", "conflicted", "inactive", "hash_invalid", "deleted"].includes(reason),
    );
    return allSuppressed ? "suppressed_mixed_state" : "memory_existed_but_excluded";
  }
  if (input.candidateCount > 0) {
    return "ranking_below_cutoff";
  }
  return "no_candidates_found";
}

export function buildRetrievalMetrics(input: {
  retrievalResultItems: RetrievalResultItemRecord[];
  exclusions: RetrievalExclusion[];
  projectionDigests?: ProjectionDigest[];
  memoryPacks?: MemoryPack[];
  candidateCount: number;
}): RetrievalMetrics {
  const selectedIds = input.retrievalResultItems
    .filter((item) => item.selectedForContext)
    .map((item) => item.memoryObjectId);
  const selectedProjectionIds = (input.projectionDigests ?? []).map(
    (digest) => digest.projectionId,
  );
  const selectedSourceMemoryIds = [
    ...new Set((input.projectionDigests ?? []).flatMap((digest) => digest.sourceMemoryIds)),
  ];
  const selectedCount = selectedIds.length + selectedProjectionIds.length;
  const injectedCount =
    input.memoryPacks?.reduce(
      (count, pack) => count + pack.sections.flatMap((section) => section.items).length,
      0,
    ) ?? selectedCount;
  const estimatedTokens =
    input.memoryPacks?.reduce((sum, pack) => sum + pack.estimatedTokens, 0) ?? 0;
  const exclusionReasons = countExclusionReasons(input.exclusions);
  const emptyRetrievalReason = resolveEmptyRetrievalReason({
    selectedCount,
    candidateCount: input.candidateCount,
    exclusions: input.exclusions,
  });
  return {
    selectedIds,
    excludedIds: input.exclusions.map((exclusion) => exclusion.id),
    exclusionReasons,
    staleFilteredCount: exclusionReasons.stale ?? 0,
    supersededFilteredCount: exclusionReasons.superseded ?? 0,
    deletedFilteredCount: exclusionReasons.deleted ?? 0,
    conflictedFilteredCount: exclusionReasons.conflicted ?? 0,
    inactiveFilteredCount: exclusionReasons.inactive ?? 0,
    hashInvalidProjectionFilteredCount: exclusionReasons.hash_invalid ?? 0,
    candidateCount: input.candidateCount,
    selectedCount,
    injectedCount,
    selectedProjectionIds,
    selectedSourceMemoryIds,
    missDiagnostics: input.exclusions.map((exclusion) => ({
      diagnosticType: "memory_existed_but_excluded",
      id: exclusion.id,
      idType: exclusion.idType,
      reason: exclusion.reason,
      sourceLane: exclusion.sourceLane,
      status: exclusion.status,
      scopeMatch: exclusion.scopeMatch,
      detail: exclusion.detail,
    })),
    emptyRetrieval: selectedCount === 0,
    emptyRetrievalReason,
    rankingFeatures: buildRankingFeatureSummary({
      retrievalResultItems: input.retrievalResultItems,
      exclusions: input.exclusions,
      projectionDigests: input.projectionDigests,
    }),
    estimatedTokens,
  };
}

export function buildMemoryPacks(input: RetrievalPackAssemblyInput): MemoryPack[] {
  const selectedMemoryIds = new Set(
    input.retrievalResultItems
      .filter((item) => item.selectedForContext)
      .map((item) => item.memoryObjectId),
  );
  const memoryById = new Map(input.memoryObjects.map((object) => [object.id, object] as const));
  const itemsByPackType = new Map<MemoryPackType, MemoryPackItem[]>();
  for (const id of selectedMemoryIds) {
    const object = memoryById.get(id);
    if (!object) {
      continue;
    }
    const packType = packTypeForMemory(object);
    itemsByPackType.set(packType, [
      ...(itemsByPackType.get(packType) ?? []),
      itemFromMemory(object),
    ]);
  }

  const projectionItems = (input.projectionDigests ?? []).map(itemFromProjection);
  if (projectionItems.length > 0) {
    itemsByPackType.set("projection_digest_pack", projectionItems);
  }

  const conflictItems = buildConflictItems(
    (input.candidates ?? []).filter((candidate) => candidate.packOnly === "conflict_pack"),
  );
  if (conflictItems.length > 0) {
    itemsByPackType.set("conflict_pack", conflictItems);
  }

  const baseMetrics = buildRetrievalMetrics({
    retrievalResultItems: input.retrievalResultItems,
    exclusions: input.exclusions ?? [],
    projectionDigests: input.projectionDigests,
    candidateCount: input.candidates?.length ?? selectedMemoryIds.size,
  });

  return [...itemsByPackType.entries()]
    .filter(([, items]) => items.length > 0)
    .toSorted(([left], [right]) => sectionForPack(right).priority - sectionForPack(left).priority)
    .map(([packType, items]) =>
      buildPack({
        packType,
        items,
        request: input.retrievalRequest,
        retrievalPlanId: input.retrievalPlan.planId,
        candidateCount: input.candidates?.length ?? selectedMemoryIds.size,
        exclusions: input.exclusions ?? [],
        metrics: baseMetrics,
        generatedAt: input.generatedAt ?? input.retrievalRequest.createdAt,
      }),
    );
}

export function renderMemoryPacks(input: {
  request: RetrievalRequestRecord;
  queryTextHash: string;
  memoryPacks: MemoryPack[];
}): string {
  const lines = [`Retrieval for ${input.request.requestPurpose}: sha256:${input.queryTextHash}`];
  for (const pack of input.memoryPacks) {
    lines.push(`[${pack.packType}]`);
    for (const section of pack.sections) {
      for (const item of section.items) {
        const source = item.memoryId ?? item.projectionId ?? item.sourceLabel ?? "source";
        lines.push(`- ${item.text} [${source}]`);
      }
    }
  }
  return lines.join("\n");
}

export function buildRetrievalRun(input: {
  retrievalRequest: RetrievalRequestRecord;
  queryTextHash?: string;
  retrievalPlanId: string;
  corpora: RetrievalRun["corpora"];
  indexesUsed: RetrievalRun["indexesUsed"];
  candidateCount: number;
  retrievalResultItems: RetrievalResultItemRecord[];
  selectedProjectionIds: string[];
  selectedProjectionDigests?: ProjectionDigest[];
  exclusions: RetrievalExclusion[];
  memoryPacks: MemoryPack[];
}): RetrievalRun {
  const selectedMemoryIds = input.retrievalResultItems
    .filter((item) => item.selectedForContext)
    .map((item) => item.memoryObjectId);
  const packIds = input.memoryPacks.map((pack) => pack.packId);
  const injectionTarget = input.memoryPacks.some(
    (pack) => pack.telemetry.injectionTarget === "systemPromptAddition",
  )
    ? "systemPromptAddition"
    : "message";
  const scopedHash =
    typeof input.retrievalRequest.scope.retrievalRuntimeQueryHash === "string"
      ? input.retrievalRequest.scope.retrievalRuntimeQueryHash
      : "";
  const metrics = buildRetrievalMetrics({
    retrievalResultItems: input.retrievalResultItems,
    exclusions: input.exclusions,
    projectionDigests: input.selectedProjectionDigests,
    memoryPacks: input.memoryPacks,
    candidateCount: input.candidateCount,
  });

  return {
    retrievalRunId: buildRuntimeId(
      "retrieval_run",
      `${input.retrievalRequest.id}:${packIds.join("|")}`,
    ),
    schemaVersion: "retrieval_run.v1",
    runId: input.retrievalRequest.id,
    sessionId: input.retrievalRequest.sessionId ?? null,
    createdAt: input.retrievalRequest.createdAt.toISOString(),
    intent: input.retrievalRequest.requestPurpose,
    queryTextHash:
      input.queryTextHash ?? (scopedHash || hashRetrievalQuery(input.retrievalRequest.queryText)),
    rawQueryPersisted: false,
    corpora: input.corpora,
    indexesUsed: input.indexesUsed,
    candidateCount: input.candidateCount,
    selectedMemoryIds,
    injectedMemoryIds: selectedMemoryIds,
    selectedProjectionIds: input.selectedProjectionIds,
    excluded: input.exclusions,
    packIds,
    injectionTarget,
    emptyRetrieval: metrics.emptyRetrieval,
    metrics,
  };
}

export function summarizeProjectionDigest(digest: ProjectionDigest): string {
  return boundedText(
    summarizeModelMemoryValue({
      title: digest.title,
      summary: digest.summary,
      sourceMemoryIds: digest.sourceMemoryIds,
      digestPath: digest.digestPath,
    }),
  );
}
