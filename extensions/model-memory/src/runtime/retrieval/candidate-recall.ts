import type { InterpretedRetrievalRequest } from "../../retrieval-request-interpreter.ts";
import {
  buildRuntimeId,
  hashRuntimeValue,
  projectLegacyRecordToRuntimeMemoryRecord,
  type RuntimeCompatibleMemoryRecord,
  type RuntimeMemoryRecord,
  type WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import { normalizeRetrievalText } from "./text-normalization.ts";
import type {
  MemoryPackType,
  ProjectionDigest,
  RetrievalCandidate,
  RetrievalCandidateStatus,
  RetrievalCorpus,
  RetrievalExclusion,
  RetrievalIndexName,
  RetrievalPlan,
} from "./types.ts";

const DEFAULT_BUDGET = {
  maxTokensTotal: 1800,
  hardDirectives: 250,
  userProfile: 150,
  projectState: 350,
  procedures: 550,
  sourceRefs: 250,
  episodes: 150,
  conflicts: 100,
  projections: 150,
} as const;

export function hashRetrievalQuery(queryText: string): string {
  return hashRuntimeValue(queryText);
}

export function redactRetrievalQueryForStorage(queryText: string): string {
  return `sha256:${hashRetrievalQuery(queryText)}`;
}

function normalizeScopeConstraints(
  scopeConstraints: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scopeConstraints ?? {}).map(([key, value]) => [
      key,
      normalizeRetrievalText(value),
    ]),
  );
}

function normalizeObjectScope(object: RuntimeMemoryRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(object.scope ?? {}).flatMap(([key, value]) => {
      if (typeof value !== "string") {
        return [];
      }
      const normalized = normalizeRetrievalText(value);
      return normalized.length > 0 ? [[key, normalized] as const] : [];
    }),
  );
}

function classifyScopeMatch(
  object: RuntimeMemoryRecord,
  request: InterpretedRetrievalRequest,
): "exact" | "partial" | "broad" | "mismatch" {
  const constraints = normalizeScopeConstraints(request.scopeConstraints);
  const constraintEntries = Object.entries(constraints);
  if (constraintEntries.length === 0) {
    return "broad";
  }

  const objectScope = normalizeObjectScope(object);
  let exactMatches = 0;
  let objectHadScopedKey = false;
  for (const [key, value] of constraintEntries) {
    const objectValue = objectScope[key];
    if (objectValue === undefined) {
      continue;
    }
    objectHadScopedKey = true;
    if (objectValue !== value) {
      return "mismatch";
    }
    exactMatches += 1;
  }

  if (exactMatches === constraintEntries.length) {
    return "exact";
  }
  if (exactMatches > 0) {
    return "partial";
  }
  return objectHadScopedKey ? "mismatch" : "broad";
}

export function deriveRuntimeMemoryStatus(object: RuntimeMemoryRecord): RetrievalCandidateStatus {
  if (object.supersededAt || object.lifecycleState === "superseded") {
    return "superseded";
  }
  if (object.expiredAt || object.lifecycleState === "expired") {
    return "deleted";
  }
  if (object.lifecycleState === "conflict_hold") {
    return "conflicted";
  }
  if (object.lifecycleState === "provisional") {
    return "inactive";
  }
  return "active";
}

function statusToExclusion(
  status: RetrievalCandidateStatus,
): RetrievalExclusion["reason"] | undefined {
  switch (status) {
    case "superseded":
      return "superseded";
    case "deleted":
      return "deleted";
    case "conflicted":
      return "conflicted";
    case "quarantined":
      return "quarantined";
    case "inactive":
      return "inactive";
    case "active":
      return undefined;
  }
  return undefined;
}

function matchesRequestType(
  object: RuntimeMemoryRecord,
  request: InterpretedRetrievalRequest,
): boolean {
  if (isToolResultProofRequest(request) && isToolResultProofMemory(object)) {
    return true;
  }
  if (
    request.canonicalClasses.length > 0 &&
    !request.canonicalClasses.includes(
      object.canonicalClass as (typeof request.canonicalClasses)[number],
    )
  ) {
    return false;
  }
  if (
    request.kinds?.length &&
    !request.kinds.includes(object.kind as NonNullable<typeof request.kinds>[number])
  ) {
    return false;
  }
  return true;
}

function requestHints(request: InterpretedRetrievalRequest): string[] {
  return [
    ...new Set(
      [...(request.subjectHints ?? []), ...(request.contentHints ?? [])]
        .map((hint) => normalizeRetrievalText(hint))
        .filter((hint) => hint.length > 0),
    ),
  ];
}

function tokenSurface(value: string): string {
  return normalizeRetrievalText(value).replace(/[-_]+/gu, " ");
}

function requestSurface(request: InterpretedRetrievalRequest): string {
  return tokenSurface(
    [request.goal, ...(request.subjectHints ?? []), ...(request.contentHints ?? [])].join(" "),
  );
}

function memorySurface(object: RuntimeMemoryRecord): string {
  return tokenSurface(
    [
      object.normalizedSubject,
      object.normalizedTitle,
      object.normalizedSearchText,
      object.sourceEvidenceSearchText,
      typeof object.payload?.task === "string" ? object.payload.task : undefined,
      typeof object.payload?.primaryResource === "string"
        ? object.payload.primaryResource
        : undefined,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isToolResultProofRequest(request: InterpretedRetrievalRequest): boolean {
  const surface = requestSurface(request);
  return (
    surface.includes("tool result") ||
    surface.includes("tool proof") ||
    (surface.includes("bounded") && surface.includes("tool") && surface.includes("evidence")) ||
    (surface.includes("captured") && surface.includes("tool") && surface.includes("evidence"))
  );
}

function isToolResultProofMemory(object: RuntimeMemoryRecord): boolean {
  if (object.canonicalClass !== "reference" && object.kind !== "reference") {
    return false;
  }
  const surface = memorySurface(object);
  return surface.includes("tool result proof") || surface.includes("tool result artifact");
}

function matchHints(surface: string | undefined, hints: string[]): string[] {
  if (!surface || hints.length === 0) {
    return [];
  }
  const normalizedSurface = normalizeRetrievalText(surface);
  return hints.filter((hint) => normalizedSurface.includes(hint));
}

function recentMemoryScore(createdAt: Date): number {
  const ageMs = Date.now() - createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0;
  }
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (ageMs <= oneDayMs) {
    return 8;
  }
  if (ageMs <= 7 * oneDayMs) {
    return 4;
  }
  return 0;
}

function hasCurrentRecencyIntent(request: InterpretedRetrievalRequest): boolean {
  const surface = requestSurface(request);
  return /\b(?:latest|current|newest|recent|most recent|last|just|fresh|newly captured)\b/u.test(
    surface,
  );
}

function recencyIntentScore(createdAt: Date): number {
  const ageMs = Date.now() - createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0;
  }
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (ageMs <= 30 * minuteMs) {
    return 260;
  }
  if (ageMs <= 2 * hourMs) {
    return 220;
  }
  if (ageMs <= dayMs) {
    return 130;
  }
  if (ageMs <= 7 * dayMs) {
    return 40;
  }
  return 0;
}

function authorityTierScore(authorityTier: RuntimeMemoryRecord["sourceAuthorityTier"]): number {
  switch (authorityTier) {
    case "user_authoritative":
      return 60;
    case "curated_authoritative":
      return 42;
    case "tool_grounded":
      return 22;
    case "cited_soft":
      return 10;
    case "inspection_only":
    case undefined:
      return 0;
  }
  return 0;
}

export function scoreRuntimeMemoryCandidate(
  object: RuntimeMemoryRecord,
  request: InterpretedRetrievalRequest,
):
  | Omit<RetrievalCandidate, "candidateId" | "status" | "source" | "memory" | "memoryId">
  | undefined {
  if (!matchesRequestType(object, request)) {
    return undefined;
  }

  const scopeMatch = classifyScopeMatch(object, request);
  if (scopeMatch === "mismatch") {
    return {
      rawScore: 0,
      score: 0,
      scopeMatch,
      kind: object.kind,
      canonicalClass: object.canonicalClass,
      confidence: object.confidence,
      reasonCodes: ["scope_mismatch"],
    };
  }

  let score = 0;
  const reasonCodes = new Set<string>();

  if (scopeMatch === "exact") {
    score += 50;
    reasonCodes.add("scope_exact_match");
  } else if (scopeMatch === "partial") {
    score += 35;
    reasonCodes.add("scope_partial_match");
  } else {
    score += 5;
    reasonCodes.add("scope_broad_match");
  }
  if (request.canonicalClasses.length > 0) {
    score += 20;
    reasonCodes.add("class_match");
  }
  if (request.kinds?.length) {
    score += 15;
    reasonCodes.add("kind_match");
  }

  const hints = requestHints(request);
  const subjectMatches = hints.filter(
    (hint) => object.normalizedSubject?.includes(hint) || object.normalizedTitle?.includes(hint),
  );
  if (subjectMatches.length > 0) {
    score += subjectMatches.length * 10;
    reasonCodes.add("subject_match");
  }

  const contentMatches = matchHints(object.normalizedSearchText, hints);
  if (contentMatches.length > 0) {
    score += contentMatches.length * 5;
    reasonCodes.add("text_match");
  }

  const sourceEvidenceMatches = matchHints(object.sourceEvidenceSearchText, hints);
  if (sourceEvidenceMatches.length > 0) {
    score += sourceEvidenceMatches.length * 18;
    reasonCodes.add("source_lineage_match");
  }

  const authorityScore = authorityTierScore(object.sourceAuthorityTier);
  if (authorityScore > 0) {
    score += authorityScore;
    reasonCodes.add(`authority_tier:${object.sourceAuthorityTier}`);
  }

  if (isToolResultProofRequest(request) && isToolResultProofMemory(object)) {
    score += 90;
    reasonCodes.add("tool_result_proof_match");
    if (object.sourceEvidenceSearchText) {
      reasonCodes.add("source_lineage_match");
    }
  }

  const freshness =
    subjectMatches.length > 0 ||
    contentMatches.length > 0 ||
    sourceEvidenceMatches.length > 0 ||
    reasonCodes.has("tool_result_proof_match")
      ? recentMemoryScore(object.createdAt)
      : 0;
  if (freshness > 0) {
    score += freshness;
    reasonCodes.add("recent_memory");
  }

  const matchedRequestEvidence =
    scopeMatch === "exact" ||
    scopeMatch === "partial" ||
    subjectMatches.length > 0 ||
    contentMatches.length > 0 ||
    sourceEvidenceMatches.length > 0 ||
    reasonCodes.has("tool_result_proof_match");
  const currentIntentFreshness =
    hasCurrentRecencyIntent(request) && matchedRequestEvidence
      ? recencyIntentScore(object.createdAt)
      : 0;
  if (currentIntentFreshness > 0) {
    score += currentIntentFreshness;
    reasonCodes.add("recency_intent_boost");
  }

  if (score === 0 && request.canonicalClasses.length === 0 && !request.kinds?.length) {
    score = 1;
    reasonCodes.add("lexical_baseline");
  }

  return {
    rawScore: score,
    score,
    scopeMatch,
    kind: object.kind,
    canonicalClass: object.canonicalClass,
    confidence: object.confidence,
    reasonCodes: [...reasonCodes],
  };
}

function deriveCorpora(request: InterpretedRetrievalRequest): RetrievalCorpus[] {
  const corpora = new Set<RetrievalCorpus>();
  for (const canonicalClass of request.canonicalClasses) {
    if (canonicalClass === "user") {
      corpora.add("operational");
      corpora.add("user_profile");
    }
    if (canonicalClass === "project") {
      corpora.add("project");
    }
    if (canonicalClass === "reference") {
      corpora.add("sources");
    }
    if (canonicalClass === "feedback") {
      corpora.add("operational");
    }
  }
  for (const kind of request.kinds ?? []) {
    if (kind === "rule") {
      corpora.add("operational");
    }
    if (kind === "preference") {
      corpora.add("user_profile");
    }
    if (kind === "procedure") {
      corpora.add("procedures");
    }
    if (kind === "reference") {
      corpora.add("sources");
    }
  }
  if (corpora.size === 0) {
    corpora.add("operational");
    corpora.add("project");
    corpora.add("sources");
  }
  corpora.add("projections");
  return [...corpora];
}

function derivePackTypes(request: InterpretedRetrievalRequest): MemoryPackType[] {
  const packTypes = new Set<MemoryPackType>(["operating_pack", "conflict_pack"]);
  for (const canonicalClass of request.canonicalClasses) {
    if (canonicalClass === "user") {
      packTypes.add("user_profile_pack");
    }
    if (canonicalClass === "project") {
      packTypes.add("project_state_pack");
    }
    if (canonicalClass === "reference") {
      packTypes.add("source_reference_pack");
    }
  }
  for (const kind of request.kinds ?? []) {
    if (kind === "preference") {
      packTypes.add("user_profile_pack");
    }
    if (kind === "procedure") {
      packTypes.add("procedure_pack");
    }
    if (kind === "reference") {
      packTypes.add("source_reference_pack");
    }
  }
  packTypes.add("projection_digest_pack");
  packTypes.add("episode_continuity_pack");
  return [...packTypes];
}

export function buildRetrievalPlan(input: {
  request: InterpretedRetrievalRequest;
  queryTextHash: string;
  requestPurpose: string;
  sessionId?: string;
  maxTokensTotal?: number;
}): RetrievalPlan {
  const indexes: RetrievalIndexName[] = ["fielded", "lexical", "projection_digest"];
  return {
    planId: buildRuntimeId(
      "retrieval_plan",
      `${input.sessionId ?? "none"}:${input.requestPurpose}:${input.queryTextHash}`,
    ),
    schemaVersion: "retrieval_plan.v1",
    intent: input.requestPurpose,
    corpora: deriveCorpora(input.request),
    packTypes: derivePackTypes(input.request),
    queries: [
      {
        queryHash: input.queryTextHash,
        redactedLabel: `sha256:${input.queryTextHash}`,
        indexes,
        filters: input.request.scopeConstraints ?? {},
      },
    ],
    budget: {
      ...DEFAULT_BUDGET,
      maxTokensTotal: input.maxTokensTotal ?? DEFAULT_BUDGET.maxTokensTotal,
    },
  };
}

export function buildProjectionDigests(input: {
  projectionVersions?: WorkspaceProjectionVersionRecord[];
  activeMemoryIds: Set<string>;
}): ProjectionDigest[] {
  return (input.projectionVersions ?? [])
    .map((version) => {
      const sourceMemoryIds = version.sourceObjectIds.filter((id) => input.activeMemoryIds.has(id));
      return {
        projectionId: version.id,
        projectionType: version.projectionType ?? "projection_digest",
        title: version.targetId,
        summary: version.retrievalDigest?.summary ?? `${version.targetId} projection digest`,
        sourceMemoryIds,
        sourceEventIds: version.sourceEventIds ?? [],
        sourceEdgeIds: version.sourceEdgeIds ?? [],
        sourceProjectionIds: [],
        digestPath: version.canonicalArtifactPath,
        contentHash: version.contentHash,
        compiledAt: version.builtAt.toISOString(),
        freshness: version.freshness ?? {
          status: sourceMemoryIds.length === 0 ? "stale" : "fresh",
        },
        staleMarkers:
          version.staleMarkers ??
          (sourceMemoryIds.length === 0 ? ["no_active_source_memory_ids"] : []),
        conflictMarkers: version.conflictMarkers ?? [],
        stale:
          (version.freshness?.status ?? (sourceMemoryIds.length === 0 ? "stale" : "fresh")) ===
            "stale" ||
          (version.staleMarkers?.length ?? 0) > 0 ||
          (version.conflictMarkers?.length ?? 0) > 0,
        sourceWeight: sourceMemoryIds.length,
      };
    })
    .filter((digest) => !digest.stale && digest.sourceMemoryIds.length > 0);
}

function buildProjectionDigestExclusions(input: {
  projectionVersions?: WorkspaceProjectionVersionRecord[];
  activeMemoryIds: Set<string>;
}): RetrievalExclusion[] {
  return (input.projectionVersions ?? []).flatMap((version): RetrievalExclusion[] => {
    const sourceMemoryIds = version.sourceObjectIds.filter((id) => input.activeMemoryIds.has(id));
    if (sourceMemoryIds.length === 0) {
      return [
        {
          id: version.id,
          idType: "projection" as const,
          reason: "inactive" as const,
          detail: "projection_digest_has_no_active_source_memory_ids",
          sourceLane: "projection_digest" as const,
          status: "inactive" as const,
        },
      ];
    }
    if ((version.conflictMarkers ?? []).length > 0) {
      return [
        {
          id: version.id,
          idType: "projection" as const,
          reason: "conflicted" as const,
          detail: version.conflictMarkers?.join(",") || "conflicted_projection_digest",
          sourceLane: "projection_digest" as const,
          status: "conflicted" as const,
        },
      ];
    }
    const hashInvalidMarkers = [...(version.staleMarkers ?? []), version.freshness?.reason ?? ""]
      .map((marker) => marker.toLowerCase())
      .filter(
        (marker) =>
          marker.includes("hash_invalid") ||
          marker.includes("invalid_hash") ||
          marker.includes("content_hash_invalid") ||
          marker.includes("source_hash_invalid") ||
          marker.includes("hash validation failed") ||
          marker.includes("hash_validation_failed"),
      );
    if (hashInvalidMarkers.length > 0) {
      return [
        {
          id: version.id,
          idType: "projection" as const,
          reason: "hash_invalid" as const,
          detail: hashInvalidMarkers.join(",") || "hash_invalid_projection_digest",
          sourceLane: "projection_digest" as const,
          status: "inactive" as const,
        },
      ];
    }
    const stale = version.freshness?.status === "stale" || (version.staleMarkers?.length ?? 0) > 0;
    if (stale) {
      return [
        {
          id: version.id,
          idType: "projection" as const,
          reason: "stale" as const,
          detail: (version.staleMarkers ?? []).join(",") || version.freshness?.reason || "stale",
          sourceLane: "projection_digest" as const,
        },
      ];
    }
    return [];
  });
}

function scoreProjectionDigest(
  digest: ProjectionDigest,
  request: InterpretedRetrievalRequest,
): RetrievalCandidate {
  const normalizedSurface = normalizeRetrievalText(
    [digest.title, digest.summary, digest.digestPath].filter(Boolean).join(" "),
  );
  const lexicalMatches = [...(request.subjectHints ?? []), ...(request.contentHints ?? [])].filter(
    (hint) => normalizedSurface.includes(normalizeRetrievalText(hint)),
  );
  const freshnessBoost = digest.freshness?.status === "fresh" ? 12 : 0;
  const score = digest.sourceWeight * 8 + lexicalMatches.length * 12 + freshnessBoost;
  return {
    candidateId: buildRuntimeId("retrieval_candidate", `projection:${digest.projectionId}`),
    projectionId: digest.projectionId,
    projectionDigest: digest,
    source: "projection_digest",
    rawScore: score,
    score,
    scopeMatch: "broad",
    status: "active",
    reasonCodes: [
      "projection_digest",
      "active_source_memory_ids",
      `projection_type:${digest.projectionType}`,
      ...(freshnessBoost > 0 ? ["fresh_projection_digest"] : []),
      ...(lexicalMatches.length > 0 ? ["projection_lexical_match"] : []),
    ],
    packOnly: "projection_digest_pack",
  };
}

export function recallCanonicalCandidates(input: {
  memoryObjects: RuntimeCompatibleMemoryRecord[];
  request: InterpretedRetrievalRequest;
  projectionVersions?: WorkspaceProjectionVersionRecord[];
}): {
  retrievalCandidates: RetrievalCandidate[];
  selectedMemoryCandidates: RetrievalCandidate[];
  conflictCandidates: RetrievalCandidate[];
  selectedProjectionDigests: ProjectionDigest[];
  exclusions: RetrievalExclusion[];
} {
  const runtimeObjects = input.memoryObjects.map(projectLegacyRecordToRuntimeMemoryRecord);
  const candidates: RetrievalCandidate[] = [];
  const conflictCandidates: RetrievalCandidate[] = [];
  const exclusions: RetrievalExclusion[] = [];

  for (const object of runtimeObjects) {
    const scored = scoreRuntimeMemoryCandidate(object, input.request);
    if (!scored) {
      continue;
    }
    const status = deriveRuntimeMemoryStatus(object);
    const exclusionReason =
      scored.scopeMatch === "mismatch" ? "scope_mismatch" : statusToExclusion(status);
    const candidate: RetrievalCandidate = {
      ...scored,
      candidateId: buildRuntimeId("retrieval_candidate", `memory:${object.id}`),
      memoryId: object.id,
      memory: object,
      source: scored.reasonCodes.includes("source_lineage_match")
        ? "source_lineage"
        : scored.reasonCodes.includes("text_match")
          ? "lexical"
          : "fielded",
      status,
      authority: object.sourceAuthorityTier,
    };

    const effectiveExclusionReason =
      object.sourceAuthorityTier === "inspection_only" ? "sensitive" : exclusionReason;

    if (effectiveExclusionReason) {
      exclusions.push({
        id: object.id,
        idType: "memory",
        reason: effectiveExclusionReason,
        sourceLane: candidate.source,
        status,
        scopeMatch: scored.scopeMatch,
        detail:
          object.sourceAuthorityTier === "inspection_only"
            ? "inspection_only_source_excluded_from_normal_retrieval"
            : undefined,
      });
      if (status === "conflicted" && scored.scopeMatch !== "mismatch") {
        conflictCandidates.push({
          ...candidate,
          source: "conflict_lane",
          packOnly: "conflict_pack",
          reasonCodes: [...candidate.reasonCodes, "conflict_pack_only"],
        });
      }
      continue;
    }

    candidates.push(candidate);
  }

  const selectedMemoryCandidates = candidates
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftCreatedAt = left.memory?.createdAt.getTime() ?? 0;
      const rightCreatedAt = right.memory?.createdAt.getTime() ?? 0;
      if (rightCreatedAt !== leftCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }
      return (left.memoryId ?? left.candidateId).localeCompare(right.memoryId ?? right.candidateId);
    })
    .map((candidate, index) => ({ ...candidate, rank: index }));

  const activeMemoryIds = new Set(
    runtimeObjects
      .filter((object) => deriveRuntimeMemoryStatus(object) === "active")
      .map((object) => object.id),
  );
  const selectedProjectionCandidates = buildProjectionDigests({
    projectionVersions: input.projectionVersions,
    activeMemoryIds,
  })
    .map((digest) => scoreProjectionDigest(digest, input.request))
    .filter((candidate) => candidate.score > 0)
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return (left.projectionId ?? left.candidateId).localeCompare(
        right.projectionId ?? right.candidateId,
      );
    });
  exclusions.push(
    ...buildProjectionDigestExclusions({
      projectionVersions: input.projectionVersions,
      activeMemoryIds,
    }),
  );

  return {
    retrievalCandidates: [...selectedMemoryCandidates, ...selectedProjectionCandidates],
    selectedMemoryCandidates,
    conflictCandidates,
    selectedProjectionDigests: selectedProjectionCandidates
      .map((candidate) => candidate.projectionDigest)
      .filter((digest): digest is ProjectionDigest => !!digest),
    exclusions,
  };
}
