import type {
  MemoryProjectionType,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RuntimeMemoryRecord,
} from "../../runtime-read-models.ts";

export type RetrievalCorpus =
  | "operational"
  | "user_profile"
  | "project"
  | "procedures"
  | "episodes"
  | "sources"
  | "world"
  | "session"
  | "projections";

export type RetrievalIndexName =
  | "fielded"
  | "lexical"
  | "projection_digest"
  | "graph"
  | "vector"
  | "temporal";

export type MemoryPackType =
  | "operating_pack"
  | "user_profile_pack"
  | "project_state_pack"
  | "procedure_pack"
  | "source_reference_pack"
  | "episode_continuity_pack"
  | "entity_world_pack"
  | "conflict_pack"
  | "projection_digest_pack";

export type MemoryPackInjectionTarget =
  | "systemPromptAddition"
  | "message"
  | "tool_hint"
  | "projection_only";

export type RetrievalPlanQuery = {
  queryHash: string;
  redactedLabel: string;
  indexes: RetrievalIndexName[];
  filters: Record<string, unknown>;
};

export type RetrievalPlan = {
  planId: string;
  schemaVersion: "retrieval_plan.v1";
  intent: string;
  corpora: RetrievalCorpus[];
  packTypes: MemoryPackType[];
  queries: RetrievalPlanQuery[];
  budget: {
    maxTokensTotal: number;
    hardDirectives: number;
    userProfile: number;
    projectState: number;
    procedures: number;
    sourceRefs: number;
    episodes: number;
    conflicts: number;
    projections: number;
  };
};

export type RetrievalCandidateStatus =
  | "active"
  | "superseded"
  | "deleted"
  | "conflicted"
  | "quarantined"
  | "inactive";

export type RetrievalCandidateSource =
  | "fielded"
  | "lexical"
  | "source_lineage"
  | "projection_digest"
  | "conflict_lane";

export type RetrievalCandidate = {
  candidateId: string;
  memoryId?: string;
  projectionId?: string;
  memory?: RuntimeMemoryRecord;
  projectionDigest?: ProjectionDigest;
  source: RetrievalCandidateSource;
  rawScore: number;
  score: number;
  rank?: number;
  kind?: string;
  canonicalClass?: string;
  scopeMatch: "exact" | "partial" | "broad" | "mismatch";
  status: RetrievalCandidateStatus;
  authority?: string;
  confidence?: string | number;
  reasonCodes: string[];
  packOnly?: Extract<MemoryPackType, "conflict_pack" | "projection_digest_pack">;
};

export type RetrievalExclusionReason =
  | "superseded"
  | "deleted"
  | "conflicted"
  | "duplicate"
  | "low_score"
  | "scope_mismatch"
  | "budget"
  | "sensitive"
  | "stale"
  | "hash_invalid"
  | "inactive"
  | "quarantined";

export type RetrievalExclusion = {
  id: string;
  idType: "memory" | "candidate" | "projection";
  reason: RetrievalExclusionReason;
  detail?: string;
  sourceLane?: RetrievalCandidateSource;
  status?: RetrievalCandidateStatus;
  scopeMatch?: RetrievalCandidate["scopeMatch"];
};

export type RetrievalMissDiagnostic = {
  diagnosticType: "memory_existed_but_excluded";
  id: string;
  idType: RetrievalExclusion["idType"];
  reason: RetrievalExclusionReason;
  sourceLane?: RetrievalCandidateSource;
  status?: RetrievalCandidateStatus;
  scopeMatch?: RetrievalCandidate["scopeMatch"];
  detail?: string;
};

export type RetrievalEmptyReason =
  | "none"
  | "no_candidates_found"
  | "candidates_found_but_excluded"
  | "ranking_threshold_too_strict"
  | "provider_schema_failure"
  | "timeout_or_pool_pressure"
  | "stale_conflict_suppression";

export type RetrievalRankingFeatureSummary = {
  fielded: number;
  lexical: number;
  sourceLineage: number;
  projectionDigest: number;
  conflictLane: number;
  vector: number;
  temporal: number;
  scopeExact: number;
  scopePartial: number;
  scopeBroad: number;
  staleSuppression: number;
  conflictSuppression: number;
  inactiveSuppression: number;
};

export type ProjectionDigest = {
  projectionId: string;
  projectionType: MemoryProjectionType;
  title: string;
  summary: string;
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds?: string[];
  sourceProjectionIds: string[];
  digestPath?: string;
  contentHash: string;
  compiledAt: string;
  freshness?: {
    status: "fresh" | "stale";
    reason?: string | null;
  };
  staleMarkers?: string[];
  conflictMarkers?: string[];
  stale: boolean;
  sourceWeight: number;
};

export type RetrievalMetrics = {
  selectedIds: string[];
  excludedIds: string[];
  exclusionReasons: Record<string, number>;
  staleFilteredCount: number;
  supersededFilteredCount: number;
  deletedFilteredCount: number;
  conflictedFilteredCount: number;
  inactiveFilteredCount: number;
  hashInvalidProjectionFilteredCount: number;
  candidateCount: number;
  selectedCount: number;
  injectedCount: number;
  selectedProjectionIds: string[];
  selectedSourceMemoryIds: string[];
  missDiagnostics: RetrievalMissDiagnostic[];
  emptyRetrieval: boolean;
  emptyRetrievalReason: RetrievalEmptyReason;
  rankingFeatures: RetrievalRankingFeatureSummary;
  estimatedTokens: number;
};

export type MemoryPackItem = {
  itemId: string;
  memoryId?: string;
  projectionId?: string;
  kind?: string;
  text: string;
  scopeLabel: string;
  confidence?: string | number;
  authority?: string;
  sourceLabel?: string;
  evidenceIds?: string[];
};

export type MemoryPackSection = {
  sectionId: string;
  sectionType:
    | "hard_directives"
    | "soft_preferences"
    | "project_state"
    | "procedure"
    | "source_refs"
    | "recent_episodes"
    | "entity_digest"
    | "conflicts"
    | "open_questions"
    | "projection_digest";
  priority: number;
  renderMode: "bullets" | "compact_json" | "markdown" | "table";
  items: MemoryPackItem[];
};

export type MemoryPack = {
  packId: string;
  schemaVersion: "memory_pack.v1";
  packType: MemoryPackType;
  runId: string;
  sessionId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  intent: string;
  generatedAt: string;
  tokenBudget: number;
  estimatedTokens: number;
  sections: MemoryPackSection[];
  sources: Array<{
    memoryId?: string;
    projectionId?: string;
    evidenceId?: string;
    sourceLabel: string;
  }>;
  exclusions: RetrievalExclusion[];
  telemetry: {
    retrievalPlanId: string;
    candidateCount: number;
    selectedCount: number;
    injected: boolean;
    injectionTarget: MemoryPackInjectionTarget;
    metrics: RetrievalMetrics;
  };
};

export type RetrievalRun = {
  retrievalRunId: string;
  schemaVersion: "retrieval_run.v1";
  runId: string;
  sessionId?: string | null;
  createdAt: string;
  intent: string;
  queryTextHash: string;
  rawQueryPersisted: false;
  corpora: RetrievalCorpus[];
  indexesUsed: RetrievalIndexName[];
  candidateCount: number;
  selectedMemoryIds: string[];
  injectedMemoryIds: string[];
  selectedProjectionIds: string[];
  excluded: RetrievalExclusion[];
  packIds: string[];
  injectionTarget: MemoryPackInjectionTarget;
  emptyRetrieval: boolean;
  metrics: RetrievalMetrics;
};

export type RetrievalRuntimeArtifacts = {
  retrievalPlan: RetrievalPlan;
  retrievalRun: RetrievalRun;
  candidates: RetrievalCandidate[];
  selectedMemoryCandidates: RetrievalCandidate[];
  selectedProjectionDigests: ProjectionDigest[];
  exclusions: RetrievalExclusion[];
  memoryPacks: MemoryPack[];
};

export type RetrievalPackAssemblyInput = {
  retrievalRequest: RetrievalRequestRecord;
  retrievalResultItems: RetrievalResultItemRecord[];
  memoryObjects: RuntimeMemoryRecord[];
  retrievalPlan: RetrievalPlan;
  candidates?: RetrievalCandidate[];
  exclusions?: RetrievalExclusion[];
  projectionDigests?: ProjectionDigest[];
  generatedAt?: Date;
};
