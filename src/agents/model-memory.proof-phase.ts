import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.ts";
import {
  DatabaseMemoryObjectStore,
  ExecutorBackedSemanticCollisionAdjudicator,
  runLiveDocumentShadow,
} from "../plugin-sdk/model-memory-legacy.js";
import {
  buildCalibrationReport,
  buildRetrievalPackArtifact,
  executeRetrieval,
  ExecutorBackedRetrievalFinalInclusionReviewer,
  ExecutorBackedRetrievalRequestInterpreter,
  ExecutorBackedSemanticInterpreter,
  ModelMemoryCanonicalRepository,
  ModelMemoryOperatorInspection,
  RuntimeContextRepository,
  rebuildDerivedRuntimeState,
  evaluateModelMemoryReadiness,
  runModelMemoryContextEngine,
  type ContextArtifactRecord,
  type ModelMemoryLifecycleState,
  type ModelMemoryObject,
  type ModelMemoryObjectRecord,
  type ModelMemorySourceKind,
  type ModelMemorySupportItemRecord,
  type ModelMemoryWriteEventRecord,
  type RetrievalResultItemRecord,
  type RuntimeRebuildResult,
  type WorkspaceProjectionVersionRecord,
  ingestDocumentLive,
  recoverDailyContinuityCandidatesLive,
  buildDeterministicUuid,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS,
  TIER_ONE_LARGE_DOCUMENT_CASES,
  resetModelMemoryEvidenceDatabase,
  type LargeDocumentClassification,
  type LargeDocumentEvaluationPurpose,
} from "./model-memory.large-document-evidence.ts";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.ts";
import { summarizeModelMemoryPayload } from "./model-memory.payload-summary.ts";

const DEFAULT_WORKSPACE_ROOT = "/root/.openclaw/workspace";
const DEFAULT_DAILY_FILE_LIMIT = 4;
const DEFAULT_SATURATION_RUNS = 3;
const DEFAULT_CONTEXT_MAX_TOKENS = 1400;
const LOW_SUPPORT_ACTIVE_THRESHOLD = 1;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.75;

const EXTRA_REPO_DOCUMENTS: Array<{
  relativePath: string;
  purposes: LargeDocumentEvaluationPurpose[];
  classification: LargeDocumentClassification;
}> = [
  {
    relativePath: "docs/projects/model-memory/specs/architecture-overview.md",
    purposes: ["architecture_fact_extraction", "reference_extraction"],
    classification: "primary_large_source_proof_input",
  },
  {
    relativePath: "docs/projects/model-memory/specs/identity-dedupe-supersession.md",
    purposes: ["architecture_fact_extraction", "reference_extraction"],
    classification: "primary_large_source_proof_input",
  },
  {
    relativePath: "docs/projects/model-memory/specs/runtime-read-models-and-artifacts.md",
    purposes: ["architecture_fact_extraction", "reference_extraction"],
    classification: "primary_large_source_proof_input",
  },
  {
    relativePath: "docs/projects/model-memory/specs/storage-database.md",
    purposes: ["architecture_fact_extraction", "reference_extraction"],
    classification: "primary_large_source_proof_input",
  },
  {
    relativePath: "docs/gateway/doctor.md",
    purposes: ["procedure_extraction", "reference_extraction"],
    classification: "primary_large_source_proof_input",
  },
];

export type ProofPhaseSource = {
  id: string;
  sourceKind: ModelMemorySourceKind;
  relativePath?: string;
  absolutePath: string;
  displayPath: string;
  purposes: LargeDocumentEvaluationPurpose[];
  classification: LargeDocumentClassification | "daily_continuity_recovery_input";
};

export type SourceWindowSummary = {
  sourceWindowId: string;
  action: "ignore" | "capture" | "reject";
  headingPath: string[];
  lineStart?: number;
  lineEnd?: number;
  capturedObjectCount: number;
  rejectReasons: string[];
};

export type DuplicateClusterCandidate = {
  leftObjectId: string;
  rightObjectId: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  similarity: number;
};

export type AdjudicationReviewFlag =
  | "provisional"
  | "conflict_hold"
  | "low_support_active"
  | "high_similarity_distinct"
  | "daily_recovery_candidate";

export type IngestionAdjudicationRow = {
  source: string;
  sourceKind: ModelMemorySourceKind;
  sourceWindowId: string;
  lifecycleState?: ModelMemoryLifecycleState;
  supportCount: number;
  firstPayloadRender: string;
  matchedPriorObjectId?: string;
  adjudicationPath: "write" | "attach_support" | "supersede" | "conflict_hold" | "ignore";
  reviewFlags: AdjudicationReviewFlag[];
  memoryObjectId?: string;
  supportItemId?: string;
  decisionCodes: string[];
};

export type IngestionSourceSummary = {
  source: string;
  sourceKind: ModelMemorySourceKind;
  classification: LargeDocumentClassification | "daily_continuity_recovery_input";
  lineCount: number;
  windowCount: number;
  capturedClaimCount: number;
  persistedObjectCount: number;
  persistedSupportItemCount: number;
  activeObjectCount: number;
  provisionalObjectCount: number;
  conflictHoldObjectCount: number;
  writeDecisionCounts: Record<string, number>;
  supportAttachmentRate: number;
  supersessionRate: number;
  duplicateClusterCandidates: DuplicateClusterCandidate[];
  sourceLevelSummary: string[];
  windowSummaries: SourceWindowSummary[];
  adjudicationRows: IngestionAdjudicationRow[];
  projectionContentHashes: Record<string, string>;
  contextArtifactHashes: Record<string, string>;
};

export type SaturationRunSummary = {
  runIndex: number;
  sources: string[];
  objectDelta: number;
  supportItemDelta: number;
  activeObjectDelta: number;
  provisionalObjectDelta: number;
  attachSupportCount: number;
  distinctWriteCount: number;
  supersedeCount: number;
  supportAttachmentRate: number;
  nearDuplicateEscapeCount: number;
  duplicateClusterCandidateCount: number;
};

export type RetrievalContextProbeResult = {
  id: string;
  queryText: string;
  selectedCount: number;
  matchingKindCount: number;
  matchingClassCount: number;
  bounded: boolean;
  activeOnly: boolean;
  retrievalPackIncluded: boolean;
  orderedSegmentCount: number;
  estimatedInputTokens: number;
  pruningUsed: boolean;
  stableLayerHash: string;
  semiStableLayerHash: string;
  volatileLayerHash: string;
  topResults: Array<{
    objectId: string;
    canonicalClass: string;
    kind: string;
    rankBand: string;
    reasonCodes: string[];
  }>;
  layerSegments: Array<{
    order: number;
    layer: "stable" | "semi_stable" | "volatile";
    segmentType: string;
    includeReason: string;
    projectionTargetId?: string;
    sourceArtifactType?: string;
    sourceArtifactScopeKey?: string;
    textHash: string;
    textPreview: string;
  }>;
  error?: string;
};

export type SupportProbeClass =
  | "pure_attach_support"
  | "same_source_rerun_mixed"
  | "whole_source_reingest"
  | "transient_retrieval_artifact_growth"
  | "support_only_probe_blocked_no_true_support_only_source";

export type StableSurfaceDiffCause =
  | "source_object_membership"
  | "support_or_provenance_summary"
  | "ordering_instability"
  | "timestamp_or_run_id_pollution"
  | "retrieval_pack_bleed_through"
  | "other";

export type StableSurfaceDiffEntry = {
  surfaceType: "projection" | "stable_artifact" | "stable_cache_segment";
  key: string;
  cause: StableSurfaceDiffCause;
  before?: string;
  after?: string;
  details: string[];
};

export type SupportProbeTarget = {
  sourceType: "natural_source_rerun" | "synthetic_existing_object_replay";
  source?: string;
  targetObjectId?: string;
  targetSummary?: string;
  existingSupportCount?: number;
};

export type RebuildProjectionProof = {
  baselineProjectionHashes: Record<string, string>;
  rerunProjectionHashes: Record<string, string>;
  baselineArtifactHashes: Record<string, string>;
  rerunArtifactHashes: Record<string, string>;
  baselineStableArtifactHashes?: Record<string, string>;
  rerunStableArtifactHashes?: Record<string, string>;
  baselineTransientArtifactHashes?: Record<string, string>;
  rerunTransientArtifactHashes?: Record<string, string>;
  projectionHashesStable: boolean;
  artifactHashesStable: boolean;
  transientArtifactGrowthKeys?: string[];
  unchangedRebuildClass:
    | "stable_canonical_runtime"
    | "transient_retrieval_artifact_growth"
    | "unexpected_stable_surface_churn";
  supportOnlySource?: string;
  supportOnlyTarget?: SupportProbeTarget;
  supportOnlyProbeClass: SupportProbeClass;
  supportOnlyProjectionChurn: boolean | null;
  supportOnlyArtifactChurn: boolean | null;
  supportOnlyTransientArtifactGrowthKeys?: string[];
  supportOnlyStableSurfaceDiffs: StableSurfaceDiffEntry[];
};

export type CacheUsageProof = {
  unchangedStableLayerStable: boolean;
  unchangedSemiStableLayerStable: boolean;
  unchangedVolatileLayerStable: boolean;
  supportOnlyStableLayerStable: boolean | null;
  supportOnlySemiStableLayerStable: boolean | null;
  supportOnlyVolatileLayerStable: boolean | null;
  baselineHashes: {
    stable: string;
    semiStable: string;
    volatile: string;
  };
  repeatedHashes: {
    stable: string;
    semiStable: string;
    volatile: string;
  };
  supportOnlyHashes: {
    stable: string;
    semiStable: string;
    volatile: string;
  };
  supportOnlyStableSegmentDiffs: StableSurfaceDiffEntry[];
};

export type LongHorizonCorpusSummary = {
  startingActiveObjects: number;
  endingActiveObjects: number;
  startingSupportItems: number;
  endingSupportItems: number;
  conflictHoldCount: number;
  provisionalCount: number;
  expiredCount: number;
  duplicateActiveObjectCount: number;
  supportOutgrewObjectsOnReruns: boolean;
};

export type RuntimeReadModelProof = {
  activeMemorySlotCount: number;
  activeMemorySetCount: number;
  contextArtifactCount: number;
  projectionVersionCount: number;
  slotLeakObjectIds: string[];
  setLeakObjectIds: string[];
  activeOnlyDefaultReadsHold: boolean;
};

export type OperatorInspectionProof = {
  recentCaptureCount: number;
  writeDecisionCount: number;
  projectionVersionCount: number;
  retrievalRequestCount: number;
  retrievalResultSetCount: number;
  retrievalResultItemCount: number;
  contextRunCount: number;
  contextRunSegmentCount: number;
  surfacesOperational: boolean;
};

export type ShadowSurfaceProof = {
  attempted: boolean;
  source?: string;
  surfaceOperational: boolean;
  comparisonMeaningful: boolean;
  matchedIdentityCount: number;
  modelOnlyIdentityCount: number;
  legacyOnlyIdentityCount: number;
  omissionDivergence: boolean;
  notes: string[];
};

export type ProofGapStatus =
  | "already_partially_covered"
  | "missing_runner"
  | "missing_evidence"
  | "missing_implementation"
  | "failing_or_unstable"
  | "proven";

export type ProofGapRecord = {
  id:
    | "storage_lifecycle"
    | "retrieval"
    | "context_assembly"
    | "runtime_read_models"
    | "projections_rebuild"
    | "cache_usage"
    | "operator_inspection"
    | "shadow_runtime_integration"
    | "long_horizon_behavior";
  status: ProofGapStatus;
  owningSeams: string[];
  notes: string[];
};

export type CutoverReadinessJudgment = {
  ready: boolean;
  decision: "not_ready" | "ready_for_cutover_planning";
  reasons: string[];
  blockers: string[];
};

export type ModelMemoryProofPhaseReport = {
  generatedAt: string;
  corpusMode: "fresh_ingestion_tranche" | "current_corpus";
  sourcePlanPath?: string;
  workspaceRoot: string;
  modelRef: string;
  candidateModelRef: string;
  requestSeed?: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  ingestionSources: ProofPhaseSource[];
  ingestionSummaries: IngestionSourceSummary[];
  adjudicationRows: IngestionAdjudicationRow[];
  saturationRuns: SaturationRunSummary[];
  retrievalContextProbes: RetrievalContextProbeResult[];
  runtimeReadModelProof: RuntimeReadModelProof;
  rebuildProjectionProof: RebuildProjectionProof;
  cacheUsageProof: CacheUsageProof;
  operatorInspectionProof: OperatorInspectionProof;
  shadowSurfaceProof: ShadowSurfaceProof;
  longHorizonSummary: LongHorizonCorpusSummary;
  proofGaps: ProofGapRecord[];
  readiness: CutoverReadinessJudgment;
  corpusTotals: {
    canonicalObjectsPersisted: number;
    supportItemsPersisted: number;
    provisionalObjectsCreated: number;
    activeObjects: number;
    provisionalObjects: number;
    conflictHoldObjects: number;
    supersededObjects: number;
    expiredObjects: number;
    writeDecisionCounts: Record<string, number>;
    duplicateClusterCandidates: DuplicateClusterCandidate[];
  };
  calibration: ReturnType<typeof buildCalibrationReport>;
};

export type ModelMemoryProofPhaseProgressEvent =
  | {
      type: "phase";
      phase:
        | "reset_database"
        | "start_ingestion"
        | "start_saturation"
        | "start_retrieval_context"
        | "start_rebuild_projection"
        | "start_cache_usage"
        | "start_long_horizon"
        | "complete";
      message: string;
    }
  | {
      type: "source_start";
      index: number;
      total: number;
      source: ProofPhaseSource;
      message: string;
    }
  | {
      type: "source_complete";
      index: number;
      total: number;
      source: ProofPhaseSource;
      summary: IngestionSourceSummary;
      message: string;
    }
  | {
      type: "saturation_run_complete";
      runIndex: number;
      totalRuns: number;
      summary: SaturationRunSummary;
      message: string;
    };

type SnapshotState = Awaited<
  ReturnType<ModelMemoryDatabaseRuntime["canonicalRepository"]["snapshot"]>
>;

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}

function renderBooleanOrBlocked(value: boolean | null): string {
  return value === null ? "blocked_or_not_pure_support_only" : String(value);
}

function tokenize(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9:_-]+/g, ""))
      .filter((token) => token.length > 0),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function formatPayload(record: Pick<ModelMemoryObjectRecord, "kind" | "payload">): string {
  return summarizeModelMemoryPayload(record);
}

function countLifecycle(
  records: ModelMemoryObjectRecord[],
): Record<ModelMemoryLifecycleState, number> {
  return {
    provisional: records.filter((record) => record.lifecycleState === "provisional").length,
    active: records.filter((record) => (record.lifecycleState ?? "active") === "active").length,
    superseded: records.filter((record) => record.lifecycleState === "superseded").length,
    expired: records.filter((record) => record.lifecycleState === "expired").length,
    conflict_hold: records.filter((record) => record.lifecycleState === "conflict_hold").length,
  };
}

function buildProjectionHashMap(
  projectionVersions: WorkspaceProjectionVersionRecord[],
): Record<string, string> {
  return Object.fromEntries(
    projectionVersions.map((entry) => [entry.targetId, entry.contentHash] as const),
  );
}

function buildProjectionDetailMap(projectionVersions: WorkspaceProjectionVersionRecord[]): Record<
  string,
  {
    contentHash: string;
    sourceObjectIds: string[];
    sourceSlotKeys: string[];
    sourceSetKeys: string[];
  }
> {
  return Object.fromEntries(
    projectionVersions.map((entry) => [
      entry.targetId,
      {
        contentHash: entry.contentHash,
        sourceObjectIds: entry.sourceObjectIds,
        sourceSlotKeys: entry.sourceSlotKeys,
        sourceSetKeys: entry.sourceSetKeys,
      },
    ]),
  );
}

function isTransientContextArtifact(artifact: ContextArtifactRecord): boolean {
  return artifact.artifactType === "retrieval_pack";
}

function buildArtifactHashMap(
  artifacts: ContextArtifactRecord[],
  mode: "all" | "stable_only" | "transient_only" = "all",
): Record<string, string> {
  return Object.fromEntries(
    artifacts
      .filter((entry) => {
        if (mode === "stable_only") {
          return !isTransientContextArtifact(entry);
        }
        if (mode === "transient_only") {
          return isTransientContextArtifact(entry);
        }
        return true;
      })
      .map(
        (entry) =>
          [`${entry.artifactType}:${entry.scopeKey ?? "global"}`, entry.contentHash] as const,
      ),
  );
}

function buildArtifactDetailMap(
  artifacts: ContextArtifactRecord[],
  mode: "all" | "stable_only" | "transient_only" = "all",
): Record<
  string,
  {
    contentHash: string;
    sourceObjectIds: string[];
    sourceSlotKeys: string[];
    artifactType: string;
    scopeKey?: string;
  }
> {
  return Object.fromEntries(
    artifacts
      .filter((entry) => {
        if (mode === "stable_only") {
          return !isTransientContextArtifact(entry);
        }
        if (mode === "transient_only") {
          return isTransientContextArtifact(entry);
        }
        return true;
      })
      .map((entry) => [
        `${entry.artifactType}:${entry.scopeKey ?? "global"}`,
        {
          contentHash: entry.contentHash,
          sourceObjectIds: entry.sourceObjectIds,
          sourceSlotKeys: entry.sourceSlotKeys,
          artifactType: entry.artifactType,
          scopeKey: entry.scopeKey,
        },
      ]),
  );
}

function diffArtifactKeys(
  baseline: Record<string, string>,
  rerun: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(rerun)]);
  return [...keys]
    .filter((key) => baseline[key] !== rerun[key])
    .toSorted((left, right) => left.localeCompare(right));
}

function classifySupportProbeClass(input: {
  objectDelta: number;
  attachSupportCount: number;
  distinctWriteCount: number;
  supersedeCount: number;
}): Exclude<
  SupportProbeClass,
  "transient_retrieval_artifact_growth" | "support_only_probe_blocked_no_true_support_only_source"
> {
  if (
    input.objectDelta === 0 &&
    input.attachSupportCount > 0 &&
    input.distinctWriteCount === 0 &&
    input.supersedeCount === 0
  ) {
    return "pure_attach_support";
  }
  if (input.attachSupportCount > 0) {
    return "same_source_rerun_mixed";
  }
  return "whole_source_reingest";
}

function buildSupportProbeSourceIds(targetObjectId: string): {
  sourceId: string;
  sourceWindowId: string;
  sourceFingerprint: string;
  sourcePath: string;
} {
  const fingerprint = `proof-support-only:${targetObjectId}`;
  return {
    sourceId: buildDeterministicUuid("proof-support-source", targetObjectId),
    sourceWindowId: buildDeterministicUuid("proof-support-window", targetObjectId),
    sourceFingerprint: fingerprint,
    sourcePath: `synthetic/support-only-proof/${targetObjectId}.md`,
  };
}

function toSyntheticSupportProbeObject(
  record: ModelMemoryObjectRecord,
  sourceWindowId: string,
): ModelMemoryObject {
  return {
    canonicalClass: record.canonicalClass as ModelMemoryObject["canonicalClass"],
    kind: record.kind as ModelMemoryObject["kind"],
    payload: record.payload as ModelMemoryObject["payload"],
    scope: record.scope,
    provenance: [{ sourceId: sourceWindowId, segmentIndex: 0, headingPath: [] }],
    confidence: record.confidence as ModelMemoryObject["confidence"],
    durability: record.durability as ModelMemoryObject["durability"],
    reviewMode: "auto_accept",
    rationaleCodes: record.rationaleCodes,
  } as ModelMemoryObject;
}

async function runSyntheticSupportOnlyProbe(input: {
  runtime: ModelMemoryDatabaseRuntime;
  memoryStore: InstanceType<typeof DatabaseMemoryObjectStore>;
  snapshot: SnapshotState;
}): Promise<
  | {
      target: SupportProbeTarget;
      writeDecisionCounts: Record<string, number>;
    }
  | undefined
> {
  const supportCountByObjectId = new Map<string, number>();
  for (const item of input.snapshot.supportItems) {
    supportCountByObjectId.set(
      item.memoryObjectId,
      (supportCountByObjectId.get(item.memoryObjectId) ?? 0) + 1,
    );
  }

  const target = input.snapshot.memoryObjects.find(
    (record) =>
      !record.supersededAt &&
      (record.lifecycleState ?? "active") === "active" &&
      (supportCountByObjectId.get(record.id) ?? 0) > 0,
  );
  if (!target) {
    return undefined;
  }

  const ids = buildSupportProbeSourceIds(target.id);
  const createdAt = new Date();
  await input.runtime.canonicalRepository.persistSource({
    id: ids.sourceId,
    sourceKind: "document",
    externalSourceId: ids.sourcePath,
    sourceFingerprint: ids.sourceFingerprint,
    sourceMetadata: {
      synthetic: true,
      purpose: "proof-phase-pure-attach-support",
      targetObjectId: target.id,
    },
    createdAt,
  });
  await input.runtime.canonicalRepository.persistSourceWindows([
    {
      id: ids.sourceWindowId,
      sourceId: ids.sourceId,
      windowIndex: 0,
      normalizedText: target.normalizedSearchText,
      normalizedFingerprint: ids.sourceWindowId,
      tokenEstimate: target.normalizedSearchText.split(/\s+/).filter(Boolean).length,
      headingPath: [],
      blockDescriptors: [],
      createdAt,
    },
  ]);

  const writeResult = await input.memoryStore.writeCapturedObject({
    sourceWindowId: ids.sourceWindowId,
    sourceKind: "document",
    contractName: target.contractName,
    contractVersion: target.contractVersion,
    modelId: target.modelId,
    object: toSyntheticSupportProbeObject(target, ids.sourceWindowId),
  });

  return {
    target: {
      sourceType: "synthetic_existing_object_replay",
      source: ids.sourcePath,
      targetObjectId: target.id,
      targetSummary: formatPayload(target),
      existingSupportCount: supportCountByObjectId.get(target.id) ?? 0,
    },
    writeDecisionCounts: {
      [writeResult.decision]: 1,
    },
  };
}

function buildProbeSegmentIncludeReason(input: {
  segmentType: string;
  projection?: WorkspaceProjectionVersionRecord;
  artifact?: ContextArtifactRecord;
}): string {
  if (input.projection) {
    return `projection:${input.projection.targetId}`;
  }
  if (input.artifact) {
    return `artifact:${input.artifact.artifactType}${input.artifact.scopeKey ? `:${input.artifact.scopeKey}` : ""}`;
  }
  return input.segmentType;
}

function buildStableSurfaceDiffs(input: {
  beforeProjections: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      sourceSetKeys: string[];
    }
  >;
  afterProjections: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      sourceSetKeys: string[];
    }
  >;
  beforeArtifacts: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      artifactType: string;
      scopeKey?: string;
    }
  >;
  afterArtifacts: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      artifactType: string;
      scopeKey?: string;
    }
  >;
}): StableSurfaceDiffEntry[] {
  const diffs: StableSurfaceDiffEntry[] = [];
  const projectionKeys = new Set([
    ...Object.keys(input.beforeProjections),
    ...Object.keys(input.afterProjections),
  ]);
  for (const key of projectionKeys) {
    const before = input.beforeProjections[key];
    const after = input.afterProjections[key];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }
    const membershipChanged =
      JSON.stringify({
        sourceObjectIds: before?.sourceObjectIds ?? [],
        sourceSlotKeys: before?.sourceSlotKeys ?? [],
        sourceSetKeys: before?.sourceSetKeys ?? [],
      }) !==
      JSON.stringify({
        sourceObjectIds: after?.sourceObjectIds ?? [],
        sourceSlotKeys: after?.sourceSlotKeys ?? [],
        sourceSetKeys: after?.sourceSetKeys ?? [],
      });
    diffs.push({
      surfaceType: "projection",
      key,
      cause: membershipChanged ? "source_object_membership" : "support_or_provenance_summary",
      before: before?.contentHash,
      after: after?.contentHash,
      details: [
        `before_objects=${(before?.sourceObjectIds ?? []).length}`,
        `after_objects=${(after?.sourceObjectIds ?? []).length}`,
      ],
    });
  }

  const artifactKeys = new Set([
    ...Object.keys(input.beforeArtifacts),
    ...Object.keys(input.afterArtifacts),
  ]);
  for (const key of artifactKeys) {
    const before = input.beforeArtifacts[key];
    const after = input.afterArtifacts[key];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }
    const membershipChanged =
      JSON.stringify({
        sourceObjectIds: before?.sourceObjectIds ?? [],
        sourceSlotKeys: before?.sourceSlotKeys ?? [],
      }) !==
      JSON.stringify({
        sourceObjectIds: after?.sourceObjectIds ?? [],
        sourceSlotKeys: after?.sourceSlotKeys ?? [],
      });
    diffs.push({
      surfaceType: "stable_artifact",
      key,
      cause: membershipChanged ? "source_object_membership" : "support_or_provenance_summary",
      before: before?.contentHash,
      after: after?.contentHash,
      details: [
        `artifact_type=${after?.artifactType ?? before?.artifactType ?? "unknown"}`,
        `scope=${after?.scopeKey ?? before?.scopeKey ?? "global"}`,
      ],
    });
  }

  return diffs.toSorted((left, right) =>
    `${left.surfaceType}:${left.key}`.localeCompare(`${right.surfaceType}:${right.key}`),
  );
}

function buildStableCacheSegmentDiffs(input: {
  before: RetrievalContextProbeResult["layerSegments"];
  after: RetrievalContextProbeResult["layerSegments"];
}): StableSurfaceDiffEntry[] {
  const before = input.before.filter((segment) => segment.layer === "stable");
  const after = input.after.filter((segment) => segment.layer === "stable");
  const signature = (segment: RetrievalContextProbeResult["layerSegments"][number] | undefined) =>
    segment
      ? JSON.stringify({
          segmentType: segment.segmentType,
          includeReason: segment.includeReason,
          projectionTargetId: segment.projectionTargetId,
          sourceArtifactType: segment.sourceArtifactType,
          sourceArtifactScopeKey: segment.sourceArtifactScopeKey,
          textHash: segment.textHash,
        })
      : undefined;
  const afterSignatures = new Set(after.map((segment) => signature(segment)));
  const beforeSignatures = new Set(before.map((segment) => signature(segment)));
  const diffs: StableSurfaceDiffEntry[] = [];

  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const left = before[index];
    const right = after[index];
    if (signature(left) === signature(right)) {
      continue;
    }
    let cause: StableSurfaceDiffCause = "other";
    if (
      left?.sourceArtifactType === "retrieval_pack" ||
      right?.sourceArtifactType === "retrieval_pack"
    ) {
      cause = "retrieval_pack_bleed_through";
    } else if (
      (left && afterSignatures.has(signature(left))) ||
      (right && beforeSignatures.has(signature(right)))
    ) {
      cause = "ordering_instability";
    } else if (
      left &&
      right &&
      left.segmentType === right.segmentType &&
      left.includeReason === right.includeReason &&
      left.projectionTargetId === right.projectionTargetId &&
      left.sourceArtifactType === right.sourceArtifactType &&
      left.textHash !== right.textHash
    ) {
      cause = "support_or_provenance_summary";
    }

    diffs.push({
      surfaceType: "stable_cache_segment",
      key: `${index}:${right?.includeReason ?? left?.includeReason ?? "unknown"}`,
      cause,
      before: left?.textHash,
      after: right?.textHash,
      details: [
        `before=${left?.textPreview ?? "missing"}`,
        `after=${right?.textPreview ?? "missing"}`,
      ],
    });
  }

  return diffs;
}

function buildRuntimeReadModelProof(input: {
  memoryObjects: ModelMemoryObjectRecord[];
  activeMemorySlots: RuntimeRebuildResult["activeMemorySlots"];
  activeMemorySets: RuntimeRebuildResult["activeMemorySets"];
  contextArtifacts: RuntimeRebuildResult["contextArtifacts"];
  projectionVersions: RuntimeRebuildResult["projectionVersions"];
}): RuntimeReadModelProof {
  const objectById = new Map(input.memoryObjects.map((record) => [record.id, record] as const));
  const slotLeakObjectIds = input.activeMemorySlots
    .map((slot) => slot.currentObjectId)
    .filter((objectId, index, values) => values.indexOf(objectId) === index)
    .filter((objectId) => {
      const record = objectById.get(objectId);
      return (
        !record || (record.lifecycleState ?? "active") !== "active" || Boolean(record.supersededAt)
      );
    });
  const setLeakObjectIds = input.activeMemorySets
    .map((set) => set.memoryObjectId)
    .filter((objectId, index, values) => values.indexOf(objectId) === index)
    .filter((objectId) => {
      const record = objectById.get(objectId);
      return (
        !record || (record.lifecycleState ?? "active") !== "active" || Boolean(record.supersededAt)
      );
    });
  return {
    activeMemorySlotCount: input.activeMemorySlots.length,
    activeMemorySetCount: input.activeMemorySets.length,
    contextArtifactCount: input.contextArtifacts.length,
    projectionVersionCount: input.projectionVersions.length,
    slotLeakObjectIds,
    setLeakObjectIds,
    activeOnlyDefaultReadsHold: slotLeakObjectIds.length === 0 && setLeakObjectIds.length === 0,
  };
}

async function buildOperatorInspectionProof(input: {
  canonicalRepository: InstanceType<typeof ModelMemoryCanonicalRepository>;
  runtimeRepository: InstanceType<typeof RuntimeContextRepository>;
}): Promise<OperatorInspectionProof> {
  const inspection = new ModelMemoryOperatorInspection(
    input.canonicalRepository,
    input.runtimeRepository,
  );
  const [recentCaptures, writeDecisions, projectionVersions, retrieval, usage] = await Promise.all([
    inspection.listRecentCaptures(),
    inspection.listWriteDecisions(),
    inspection.listProjectionVersions(),
    inspection.listRetrievalInspections(),
    inspection.listUsageObservations(),
  ]);

  return {
    recentCaptureCount: recentCaptures.length,
    writeDecisionCount: writeDecisions.length,
    projectionVersionCount: projectionVersions.length,
    retrievalRequestCount: retrieval.requests.length,
    retrievalResultSetCount: retrieval.resultSets.length,
    retrievalResultItemCount: retrieval.resultItems.length,
    contextRunCount: usage.runs.length,
    contextRunSegmentCount: usage.segments.length,
    surfacesOperational:
      recentCaptures.length > 0 &&
      writeDecisions.length > 0 &&
      projectionVersions.length > 0 &&
      retrieval.requests.length > 0 &&
      usage.runs.length > 0,
  };
}

async function buildShadowSurfaceProof(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config?: OpenClawConfig;
  source?: ProofPhaseSource;
  modelRef: string;
  candidateModelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  maxWordsPerWindow: number;
}): Promise<ShadowSurfaceProof> {
  if (!input.source) {
    return {
      attempted: false,
      source: undefined,
      surfaceOperational: false,
      comparisonMeaningful: false,
      matchedIdentityCount: 0,
      modelOnlyIdentityCount: 0,
      legacyOnlyIdentityCount: 0,
      omissionDivergence: false,
      notes: ["no_shadow_source_available"],
    };
  }

  const text = await readFile(input.source.absolutePath, "utf8");
  const executor = new OpenAICompatibleLiveJsonExecutor({
    config: input.config,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
  });
  const semanticInterpreter = new ExecutorBackedSemanticInterpreter(executor);
  const sentinel = new Error("shadow-proof-rollback");
  let result: Awaited<ReturnType<typeof runLiveDocumentShadow>> | undefined;

  try {
    await input.runtime.sqlClient.withTransaction(async (tx) => {
      result = await runLiveDocumentShadow({
        enabled: true,
        document: {
          externalSourceId: input.source!.displayPath,
          text,
          maxWordsPerWindow: input.maxWordsPerWindow,
          sourceMetadata: {
            relativePath: input.source!.displayPath,
            proofLane: "shadow_surface",
            candidateModelId: input.candidateModelRef,
          },
        },
        modelId: input.modelRef,
        interpreter: semanticInterpreter,
        canonicalRepository: new ModelMemoryCanonicalRepository(tx),
        runtimeRepository: new RuntimeContextRepository(tx),
        legacy: {
          async observe() {
            return {
              capturedObjects: [],
              writeObservations: [],
            };
          },
        },
      });
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) {
      throw error;
    }
  }

  if (!result || result.skipped) {
    return {
      attempted: true,
      source: input.source.displayPath,
      surfaceOperational: false,
      comparisonMeaningful: false,
      matchedIdentityCount: 0,
      modelOnlyIdentityCount: 0,
      legacyOnlyIdentityCount: 0,
      omissionDivergence: false,
      notes: [result?.skipped ? result.reason : "shadow_result_missing"],
    };
  }

  return {
    attempted: true,
    source: input.source.displayPath,
    surfaceOperational: true,
    comparisonMeaningful: false,
    matchedIdentityCount: result.comparison.matchedIdentityKeys.length,
    modelOnlyIdentityCount: result.comparison.modelOnlyIdentityKeys.length,
    legacyOnlyIdentityCount: result.comparison.legacyOnlyIdentityKeys.length,
    omissionDivergence: result.comparison.omissionDivergence,
    notes: [
      "shadow_surface_executed_with_stub_legacy_observer",
      "legacy_parity_not_proven_in_this_phase",
    ],
  };
}

export function buildProofGapMap(input: {
  runtimeReadModelProof: RuntimeReadModelProof;
  retrievalContextProbes: RetrievalContextProbeResult[];
  rebuildProjectionProof: RebuildProjectionProof;
  cacheUsageProof: CacheUsageProof;
  operatorInspectionProof: OperatorInspectionProof;
  shadowSurfaceProof: ShadowSurfaceProof;
  longHorizonSummary: LongHorizonCorpusSummary;
  corpusTotals: ModelMemoryProofPhaseReport["corpusTotals"];
}): ProofGapRecord[] {
  const retrievalHealthy =
    input.retrievalContextProbes.length > 0 &&
    input.retrievalContextProbes.every(
      (probe) =>
        probeSucceeded(probe) &&
        probe.selectedCount > 0 &&
        (probe.matchingKindCount > 0 || probe.matchingClassCount > 0) &&
        probe.bounded &&
        probe.activeOnly,
    );
  const contextHealthy =
    input.retrievalContextProbes.length > 0 &&
    input.retrievalContextProbes.every(
      (probe) =>
        probeSucceeded(probe) &&
        probe.orderedSegmentCount > 0 &&
        probe.estimatedInputTokens <= DEFAULT_CONTEXT_MAX_TOKENS &&
        probe.activeOnly,
    );
  const rebuildHealthy =
    input.rebuildProjectionProof.projectionHashesStable &&
    input.rebuildProjectionProof.artifactHashesStable &&
    (input.rebuildProjectionProof.supportOnlyProbeClass !== "pure_attach_support" ||
      (input.rebuildProjectionProof.supportOnlyProjectionChurn === false &&
        input.rebuildProjectionProof.supportOnlyArtifactChurn === false));
  const cacheHealthy =
    input.cacheUsageProof.unchangedStableLayerStable &&
    input.cacheUsageProof.unchangedSemiStableLayerStable &&
    input.cacheUsageProof.unchangedVolatileLayerStable &&
    (input.rebuildProjectionProof.supportOnlyProbeClass !== "pure_attach_support" ||
      (input.cacheUsageProof.supportOnlyStableLayerStable === true &&
        input.cacheUsageProof.supportOnlySemiStableLayerStable === true));
  const longHorizonHealthy =
    input.longHorizonSummary.supportOutgrewObjectsOnReruns &&
    input.longHorizonSummary.duplicateActiveObjectCount <= 10;

  return [
    {
      id: "storage_lifecycle",
      status:
        input.corpusTotals.canonicalObjectsPersisted > 0 &&
        input.runtimeReadModelProof.activeOnlyDefaultReadsHold
          ? "proven"
          : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.database.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `active_objects=${input.corpusTotals.activeObjects}`,
        `provisional_objects=${input.corpusTotals.provisionalObjects}`,
        `conflict_hold_objects=${input.corpusTotals.conflictHoldObjects}`,
      ],
    },
    {
      id: "retrieval",
      status: retrievalHealthy ? "proven" : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.retrieval-trace.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: input.retrievalContextProbes.map(
        (probe) =>
          `${probe.id}:selected=${probe.selectedCount}:matchingKinds=${probe.matchingKindCount}:matchingClasses=${probe.matchingClassCount}:activeOnly=${probe.activeOnly}${probe.error ? `:error=${probe.error}` : ""}`,
      ),
    },
    {
      id: "context_assembly",
      status: contextHealthy ? "proven" : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.context-trace.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: input.retrievalContextProbes.map(
        (probe) =>
          `${probe.id}:segments=${probe.orderedSegmentCount}:estimatedTokens=${probe.estimatedInputTokens}:pruning=${probe.pruningUsed}${probe.error ? `:error=${probe.error}` : ""}`,
      ),
    },
    {
      id: "runtime_read_models",
      status: input.runtimeReadModelProof.activeOnlyDefaultReadsHold
        ? "proven"
        : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.live-runtime.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `slots=${input.runtimeReadModelProof.activeMemorySlotCount}`,
        `sets=${input.runtimeReadModelProof.activeMemorySetCount}`,
        `slot_leaks=${input.runtimeReadModelProof.slotLeakObjectIds.length}`,
        `set_leaks=${input.runtimeReadModelProof.setLeakObjectIds.length}`,
      ],
    },
    {
      id: "projections_rebuild",
      status: rebuildHealthy ? "proven" : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.rebuild-diff.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `projection_hashes_stable=${input.rebuildProjectionProof.projectionHashesStable}`,
        `artifact_hashes_stable=${input.rebuildProjectionProof.artifactHashesStable}`,
        `unchanged_rebuild_class=${input.rebuildProjectionProof.unchangedRebuildClass}`,
        `transient_artifact_growth=${input.rebuildProjectionProof.transientArtifactGrowthKeys?.length ?? 0}`,
        `support_probe_class=${input.rebuildProjectionProof.supportOnlyProbeClass}`,
        `support_only_projection_churn=${renderBooleanOrBlocked(input.rebuildProjectionProof.supportOnlyProjectionChurn)}`,
        `support_only_artifact_churn=${renderBooleanOrBlocked(input.rebuildProjectionProof.supportOnlyArtifactChurn)}`,
      ],
    },
    {
      id: "cache_usage",
      status: cacheHealthy ? "proven" : "failing_or_unstable",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.proof-phase.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `unchanged_stable=${input.cacheUsageProof.unchangedStableLayerStable}`,
        `unchanged_semi=${input.cacheUsageProof.unchangedSemiStableLayerStable}`,
        `unchanged_volatile=${input.cacheUsageProof.unchangedVolatileLayerStable}`,
        `support_only_stable=${renderBooleanOrBlocked(input.cacheUsageProof.supportOnlyStableLayerStable)}`,
        `support_only_semi=${renderBooleanOrBlocked(input.cacheUsageProof.supportOnlySemiStableLayerStable)}`,
        `support_only_volatile=${renderBooleanOrBlocked(input.cacheUsageProof.supportOnlyVolatileLayerStable)}`,
        `support_probe_class=${input.rebuildProjectionProof.supportOnlyProbeClass}`,
      ],
    },
    {
      id: "operator_inspection",
      status: input.operatorInspectionProof.surfacesOperational
        ? "proven"
        : "already_partially_covered",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.live-runtime.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `recent_captures=${input.operatorInspectionProof.recentCaptureCount}`,
        `write_decisions=${input.operatorInspectionProof.writeDecisionCount}`,
        `projection_versions=${input.operatorInspectionProof.projectionVersionCount}`,
        `retrieval_requests=${input.operatorInspectionProof.retrievalRequestCount}`,
        `context_runs=${input.operatorInspectionProof.contextRunCount}`,
      ],
    },
    {
      id: "shadow_runtime_integration",
      status: input.shadowSurfaceProof.surfaceOperational
        ? input.shadowSurfaceProof.comparisonMeaningful
          ? "proven"
          : "already_partially_covered"
        : "missing_evidence",
      owningSeams: [
        "src/plugin-sdk/model-memory.ts",
        "src/agents/model-memory.integration.ts",
        "extensions/model-memory/index.ts",
      ],
      notes: [
        `surface_operational=${input.shadowSurfaceProof.surfaceOperational}`,
        `comparison_meaningful=${input.shadowSurfaceProof.comparisonMeaningful}`,
        ...input.shadowSurfaceProof.notes,
      ],
    },
    {
      id: "long_horizon_behavior",
      status: longHorizonHealthy ? "proven" : "failing_or_unstable",
      owningSeams: [
        "src/agents/model-memory.proof-phase.ts",
        "src/plugin-sdk/model-memory.ts",
        "extensions/model-memory/runtime-api.ts",
      ],
      notes: [
        `starting_active=${input.longHorizonSummary.startingActiveObjects}`,
        `ending_active=${input.longHorizonSummary.endingActiveObjects}`,
        `starting_supports=${input.longHorizonSummary.startingSupportItems}`,
        `ending_supports=${input.longHorizonSummary.endingSupportItems}`,
        `duplicate_active_object_count=${input.longHorizonSummary.duplicateActiveObjectCount}`,
        `support_outgrew_objects=${input.longHorizonSummary.supportOutgrewObjectsOnReruns}`,
      ],
    },
  ];
}

export function evaluateCutoverReadiness(input: {
  proofGaps: ProofGapRecord[];
  calibration: ReturnType<typeof buildCalibrationReport>;
}): CutoverReadinessJudgment {
  const readinessGate = evaluateModelMemoryReadiness({
    report: input.calibration,
  });
  const blockers = [
    ...input.proofGaps
      .filter((gap) =>
        [
          "missing_runner",
          "missing_evidence",
          "missing_implementation",
          "failing_or_unstable",
        ].includes(gap.status),
      )
      .map((gap) => gap.id),
    ...(readinessGate.ready ? [] : readinessGate.reasons),
  ];
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ready: uniqueBlockers.length === 0,
    decision: uniqueBlockers.length === 0 ? "ready_for_cutover_planning" : "not_ready",
    reasons:
      uniqueBlockers.length === 0
        ? ["all_major_clean_room_proof_gaps_cleared_on_current_bar"]
        : uniqueBlockers.map((blocker) => `blocked_by:${blocker}`),
    blockers: uniqueBlockers,
  };
}

async function resolveProofPhaseSourcesFromPlanFile(input: {
  repoRoot: string;
  planPath: string;
}): Promise<ProofPhaseSource[]> {
  const absolutePlanPath = path.isAbsolute(input.planPath)
    ? input.planPath
    : path.join(input.repoRoot, input.planPath);
  const payload = JSON.parse(await readFile(absolutePlanPath, "utf8")) as {
    sources?: Array<{
      id: string;
      sourceKind: ModelMemorySourceKind;
      relativePath?: string;
      absolutePath?: string;
      displayPath: string;
      purposes: LargeDocumentEvaluationPurpose[];
      classification: LargeDocumentClassification | "daily_continuity_recovery_input";
    }>;
  };
  return (payload.sources ?? []).map((source) => ({
    id: source.id,
    sourceKind: source.sourceKind,
    relativePath: source.relativePath,
    absolutePath:
      source.absolutePath ??
      (source.relativePath
        ? path.join(input.repoRoot, source.relativePath)
        : path.join(input.repoRoot, source.displayPath)),
    displayPath: source.displayPath,
    purposes: source.purposes,
    classification: source.classification,
  }));
}

export function buildDuplicateClusterCandidates(
  memoryObjects: ModelMemoryObjectRecord[],
): DuplicateClusterCandidate[] {
  const candidates: DuplicateClusterCandidate[] = [];
  const eligible = memoryObjects.filter(
    (record) => !record.supersededAt && record.lifecycleState !== "expired" && record.identityKey,
  );
  for (let index = 0; index < eligible.length; index += 1) {
    const left = eligible[index];
    for (let inner = index + 1; inner < eligible.length; inner += 1) {
      const right = eligible[inner];
      if (left.identityKey === right.identityKey) {
        continue;
      }
      if (
        left.canonicalClass !== right.canonicalClass ||
        left.kind !== right.kind ||
        left.scopeKey !== right.scopeKey
      ) {
        continue;
      }
      const similarity = jaccard(
        tokenize(left.normalizedSearchText),
        tokenize(right.normalizedSearchText),
      );
      if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) {
        continue;
      }
      candidates.push({
        leftObjectId: left.id,
        rightObjectId: right.id,
        canonicalClass: left.canonicalClass,
        kind: left.kind,
        scopeKey: left.scopeKey,
        similarity: Number(similarity.toFixed(4)),
      });
    }
  }
  return candidates.toSorted((left, right) => {
    if (right.similarity !== left.similarity) {
      return right.similarity - left.similarity;
    }
    return `${left.leftObjectId}:${left.rightObjectId}`.localeCompare(
      `${right.leftObjectId}:${right.rightObjectId}`,
    );
  });
}

function findDuplicateMatch(
  objectId: string,
  duplicateClusters: DuplicateClusterCandidate[],
): DuplicateClusterCandidate | undefined {
  return duplicateClusters.find(
    (candidate) => candidate.leftObjectId === objectId || candidate.rightObjectId === objectId,
  );
}

function buildReviewFlags(input: {
  sourceKind: ModelMemorySourceKind;
  record?: ModelMemoryObjectRecord;
  supportCount: number;
  adjudicationPath: IngestionAdjudicationRow["adjudicationPath"];
  duplicateMatch?: DuplicateClusterCandidate;
}): AdjudicationReviewFlag[] {
  const flags: AdjudicationReviewFlag[] = [];
  if (input.record?.lifecycleState === "provisional") {
    flags.push("provisional");
  }
  if (
    input.record?.lifecycleState === "conflict_hold" ||
    input.adjudicationPath === "conflict_hold"
  ) {
    flags.push("conflict_hold");
  }
  if (
    (input.record?.lifecycleState ?? "active") === "active" &&
    input.supportCount <= LOW_SUPPORT_ACTIVE_THRESHOLD
  ) {
    flags.push("low_support_active");
  }
  if (input.adjudicationPath === "write" && input.duplicateMatch) {
    flags.push("high_similarity_distinct");
  }
  if (
    input.sourceKind === "daily_continuity" ||
    input.record?.activationBasis === "daily_recovery_candidate"
  ) {
    flags.push("daily_recovery_candidate");
  }
  return [...new Set(flags)];
}

function buildWindowSummaries(input: {
  windows: Array<{
    id: string;
    headingPath: string[];
    lineStart?: number;
    lineEnd?: number;
  }>;
  windowResults: Array<
    | { sourceWindowId: string; action: "ignore" }
    | { sourceWindowId: string; action: "capture"; objects: Array<unknown> }
    | { sourceWindowId: string; action: "reject"; errors: Array<{ message: string }> }
  >;
}): SourceWindowSummary[] {
  const resultById = new Map(
    input.windowResults.map((entry) => [entry.sourceWindowId, entry] as const),
  );
  return input.windows.map((window) => {
    const result = resultById.get(window.id);
    return {
      sourceWindowId: window.id,
      action: result?.action ?? "ignore",
      headingPath: window.headingPath,
      lineStart: window.lineStart,
      lineEnd: window.lineEnd,
      capturedObjectCount: result?.action === "capture" ? result.objects.length : 0,
      rejectReasons: result?.action === "reject" ? result.errors.map((error) => error.message) : [],
    };
  });
}

function buildTouchedObjectIds(
  supportItems: ModelMemorySupportItemRecord[],
  windowIds: Set<string>,
): Set<string> {
  return new Set(
    supportItems
      .filter((item) => windowIds.has(item.sourceWindowId))
      .map((item) => item.memoryObjectId),
  );
}

function buildAdjudicationRows(input: {
  source: ProofPhaseSource;
  writeResults: Array<{
    decision: string;
    memoryObject?: ModelMemoryObjectRecord;
    supportItem?: ModelMemorySupportItemRecord;
    writeEvent: ModelMemoryWriteEventRecord;
    supersessionLink?: { priorObjectId: string };
  }>;
  memoryObjects: ModelMemoryObjectRecord[];
  supportItems: ModelMemorySupportItemRecord[];
  duplicateClusters: DuplicateClusterCandidate[];
}): IngestionAdjudicationRow[] {
  const objectById = new Map(input.memoryObjects.map((record) => [record.id, record] as const));
  const supportCountByObjectId = input.supportItems.reduce((acc, item) => {
    acc.set(item.memoryObjectId, (acc.get(item.memoryObjectId) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return input.writeResults.map((result) => {
    const record =
      result.memoryObject ??
      (result.writeEvent.memoryObjectId
        ? objectById.get(result.writeEvent.memoryObjectId)
        : undefined);
    const supportCount = record ? (supportCountByObjectId.get(record.id) ?? 0) : 0;
    const adjudicationPath =
      result.decision === "attach_support"
        ? "attach_support"
        : result.decision === "supersede"
          ? "supersede"
          : result.decision === "ignore"
            ? "ignore"
            : record?.lifecycleState === "conflict_hold"
              ? "conflict_hold"
              : "write";
    const duplicateMatch = record
      ? findDuplicateMatch(record.id, input.duplicateClusters)
      : undefined;
    const matchedPriorObjectId =
      adjudicationPath === "attach_support"
        ? result.writeEvent.memoryObjectId
        : adjudicationPath === "supersede"
          ? result.supersessionLink?.priorObjectId
          : duplicateMatch
            ? duplicateMatch.leftObjectId === record?.id
              ? duplicateMatch.rightObjectId
              : duplicateMatch.leftObjectId
            : undefined;

    return {
      source: input.source.displayPath,
      sourceKind: input.source.sourceKind,
      sourceWindowId: result.writeEvent.sourceWindowId,
      lifecycleState: record?.lifecycleState,
      supportCount,
      firstPayloadRender: record ? formatPayload(record) : "no persisted object",
      matchedPriorObjectId,
      adjudicationPath,
      reviewFlags: buildReviewFlags({
        sourceKind: input.source.sourceKind,
        record,
        supportCount,
        adjudicationPath,
        duplicateMatch,
      }),
      memoryObjectId: record?.id ?? result.writeEvent.memoryObjectId,
      supportItemId: result.supportItem?.id ?? result.writeEvent.supportItemId,
      decisionCodes: result.writeEvent.decisionCodes,
    };
  });
}

async function resolveStrictDateDailyFiles(input: {
  workspaceRoot: string;
  limit: number;
}): Promise<ProofPhaseSource[]> {
  const memoryDir = path.join(input.workspaceRoot, "memory");
  let entries: string[] = [];
  try {
    entries = await readdir(memoryDir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => /^\d{4}-\d{2}-\d{2}\.md$/.test(entry))
    .toSorted((left, right) => right.localeCompare(left))
    .slice(0, input.limit)
    .map((entry) => ({
      id: `daily-${entry.replace(/\.md$/, "")}`,
      sourceKind: "daily_continuity" as const,
      absolutePath: path.join(memoryDir, entry),
      displayPath: `memory/${entry}`,
      purposes: ["omission_discipline", "rule_extraction"],
      classification: "daily_continuity_recovery_input" as const,
    }));
}

export async function resolveDefaultProofPhaseSources(input: {
  repoRoot: string;
  workspaceRoot?: string;
  dailyFileLimit?: number;
}): Promise<ProofPhaseSource[]> {
  const tierOne = TIER_ONE_LARGE_DOCUMENT_CASES.map((entry) => ({
    id: entry.id,
    sourceKind: entry.sourceKind,
    relativePath: entry.relativePath,
    absolutePath: path.join(input.repoRoot, entry.relativePath),
    displayPath: entry.relativePath,
    purposes: entry.purposes,
    classification: entry.classification,
  }));

  const extras = EXTRA_REPO_DOCUMENTS.filter((entry) => entry.relativePath)
    .map((entry) => ({
      id: `extra-${entry.relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      sourceKind: "document" as const,
      relativePath: entry.relativePath,
      absolutePath: path.join(input.repoRoot, entry.relativePath),
      displayPath: entry.relativePath,
      purposes: entry.purposes,
      classification: entry.classification,
    }))
    .filter((entry) => entry.absolutePath);

  const daily = await resolveStrictDateDailyFiles({
    workspaceRoot: input.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT,
    limit: input.dailyFileLimit ?? DEFAULT_DAILY_FILE_LIMIT,
  });

  return [...tierOne, ...extras, ...daily];
}

export type RetrievalProbeSpec = {
  id: string;
  queryText: string;
  requestPurpose: string;
  acceptedCanonicalClasses: string[];
  acceptedKinds: string[];
  currentTurn: string;
};

export const RETRIEVAL_PROBES: RetrievalProbeSpec[] = [
  {
    id: "probe-live-tests",
    queryText: "How do I run live tests in OpenClaw?",
    requestPurpose: "operator_help",
    acceptedCanonicalClasses: ["feedback", "reference"],
    acceptedKinds: ["procedure", "rule", "reference"],
    currentTurn: "How do I run live tests in OpenClaw?",
  },
  {
    id: "probe-gateway-protocol",
    queryText: "What should I consult for gateway protocol contracts?",
    requestPurpose: "reference_lookup",
    acceptedCanonicalClasses: ["reference", "project", "feedback"],
    acceptedKinds: ["reference", "fact", "rule"],
    currentTurn: "What should I consult for gateway protocol contracts?",
  },
  {
    id: "probe-planning-guidance",
    queryText: "What should I read before planning or roadmap work?",
    requestPurpose: "workflow_guidance",
    acceptedCanonicalClasses: ["feedback", "reference", "user"],
    acceptedKinds: ["rule", "reference", "preference"],
    currentTurn: "What should I read before planning or roadmap work?",
  },
  {
    id: "probe-schema-reference",
    queryText: "Where is the model-memory schema and storage design documented?",
    requestPurpose: "architecture_lookup",
    acceptedCanonicalClasses: ["reference", "project", "feedback"],
    acceptedKinds: ["reference", "fact", "rule"],
    currentTurn: "Where is the model-memory schema and storage design documented?",
  },
  {
    id: "probe-mixed-work-prompt",
    queryText:
      "I need to update docs, run the right gates, preserve unrelated changes, and check what the repo policy says before landing a change. What should I remember?",
    requestPurpose: "workflow_guidance",
    acceptedCanonicalClasses: ["feedback", "reference", "project", "user"],
    acceptedKinds: ["rule", "procedure", "reference", "preference"],
    currentTurn:
      "I need to update docs, run the right gates, preserve unrelated changes, and check what the repo policy says before landing a change. What should I remember?",
  },
  {
    id: "probe-rule-heavy-instruction",
    queryText:
      "What are the repo rules around targeted tests, no destructive git commands, and preserving unrelated worktree changes?",
    requestPurpose: "workflow_guidance",
    acceptedCanonicalClasses: ["feedback", "project", "user"],
    acceptedKinds: ["rule", "preference", "procedure"],
    currentTurn:
      "What are the repo rules around targeted tests, no destructive git commands, and preserving unrelated worktree changes?",
  },
  {
    id: "probe-fact-heavy-configuration",
    queryText:
      "Where are the OpenClaw live test credential and config paths, and what are the config file location facts I should rely on?",
    requestPurpose: "reference_lookup",
    acceptedCanonicalClasses: ["reference", "project", "feedback"],
    acceptedKinds: ["fact", "reference", "rule"],
    currentTurn:
      "Where are the OpenClaw live test credential and config paths, and what are the config file location facts I should rely on?",
  },
];

function collectCorpusTotals(snapshot: SnapshotState): ModelMemoryProofPhaseReport["corpusTotals"] {
  const lifecycle = countLifecycle(snapshot.memoryObjects);
  return {
    canonicalObjectsPersisted: snapshot.memoryObjects.length,
    supportItemsPersisted: snapshot.supportItems.length,
    provisionalObjectsCreated: lifecycle.provisional,
    activeObjects: lifecycle.active,
    provisionalObjects: lifecycle.provisional,
    conflictHoldObjects: lifecycle.conflict_hold,
    supersededObjects: lifecycle.superseded,
    expiredObjects: lifecycle.expired,
    writeDecisionCounts: countBy(snapshot.writeEvents.map((entry) => entry.decision)),
    duplicateClusterCandidates: buildDuplicateClusterCandidates(snapshot.memoryObjects),
  };
}

function collectSourceLevelSummary(input: {
  source: ProofPhaseSource;
  writeDecisionCounts: Record<string, number>;
  objectCount: number;
  supportCount: number;
  lifecycle: Record<ModelMemoryLifecycleState, number>;
}): string[] {
  return [
    `source_kind=${input.source.sourceKind}`,
    `classification=${input.source.classification}`,
    `write_decisions=${JSON.stringify(input.writeDecisionCounts)}`,
    `objects=${input.objectCount}`,
    `supports=${input.supportCount}`,
    `lifecycle=${JSON.stringify(input.lifecycle)}`,
  ];
}

function countMatchingItems(
  items: RetrievalResultItemRecord[],
  objectById: Map<string, ModelMemoryObjectRecord>,
  acceptedCanonicalClasses: string[],
  acceptedKinds: string[],
): { matchingClassCount: number; matchingKindCount: number; activeOnly: boolean } {
  let matchingClassCount = 0;
  let matchingKindCount = 0;
  let activeOnly = true;
  for (const item of items.filter((entry) => entry.selectedForContext)) {
    const object = objectById.get(item.memoryObjectId);
    if (!object) {
      activeOnly = false;
      continue;
    }
    if (acceptedCanonicalClasses.includes(object.canonicalClass)) {
      matchingClassCount += 1;
    }
    if (acceptedKinds.includes(object.kind)) {
      matchingKindCount += 1;
    }
    if ((object.lifecycleState ?? "active") !== "active" || object.supersededAt) {
      activeOnly = false;
    }
  }
  return {
    matchingClassCount,
    matchingKindCount,
    activeOnly,
  };
}

async function runRetrievalContextProbe(input: {
  probe: RetrievalProbeSpec;
  runtime: ModelMemoryDatabaseRuntime;
  retrievalInterpreter: InstanceType<typeof ExecutorBackedRetrievalRequestInterpreter>;
  retrievalFinalInclusionReviewer: InstanceType<
    typeof ExecutorBackedRetrievalFinalInclusionReviewer
  >;
  memoryObjects: ModelMemoryObjectRecord[];
  modelRef: string;
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
  sessionSuffix: string;
}): Promise<RetrievalContextProbeResult> {
  try {
    const retrieval = await executeRetrieval({
      envelope: {
        queryText: input.probe.queryText,
        requestPurpose: input.probe.requestPurpose,
        sessionId: `proof-${input.probe.id}-${input.sessionSuffix}`,
        agentId: "model-memory-proof",
        maxResults: 5,
      },
      interpreter: input.retrievalInterpreter,
      memoryObjects: input.memoryObjects,
      modelId: input.modelRef,
      finalInclusionReviewer: input.retrievalFinalInclusionReviewer,
      finalInclusionModelId: input.modelRef,
      store: input.runtime.retrievalStore,
      createdAt: new Date(),
      projectionVersions: input.projectionVersions,
    });

    if (!retrieval) {
      return {
        id: `${input.probe.id}-${input.sessionSuffix}`,
        queryText: input.probe.queryText,
        selectedCount: 0,
        matchingKindCount: 0,
        matchingClassCount: 0,
        bounded: true,
        activeOnly: true,
        retrievalPackIncluded: false,
        orderedSegmentCount: 0,
        estimatedInputTokens: 0,
        pruningUsed: false,
        stableLayerHash: "",
        semiStableLayerHash: "",
        volatileLayerHash: "",
        topResults: [],
        layerSegments: [],
      };
    }

    const retrievalPack = buildRetrievalPackArtifact({
      retrievalRequest: retrieval.retrievalRequest,
      retrievalResultSet: retrieval.retrievalResultSet,
      retrievalResultItems: retrieval.retrievalResultItems,
      memoryObjects: input.memoryObjects,
      retrievalPlan: retrieval.retrievalPlan,
      retrievalCandidates: retrieval.retrievalCandidates,
      retrievalExclusions: retrieval.retrievalExclusions,
      selectedProjectionDigests: retrieval.selectedProjectionDigests,
      buildPolicyVersion: "v1",
    });
    const persistedPack =
      await input.runtime.runtimeRepository.persistContextArtifact(retrievalPack);
    await input.runtime.retrievalStore.updatePackedArtifactId?.(
      retrieval.retrievalResultSet.id,
      persistedPack.id,
    );

    const artifacts = await input.runtime.runtimeRepository.listContextArtifacts();
    const sessionState = await input.runtime.runtimeRepository.getSessionContextState(
      `proof-${input.probe.id}-${input.sessionSuffix}`,
    );
    const engine = runModelMemoryContextEngine({
      sessionId: `proof-${input.probe.id}-${input.sessionSuffix}`,
      agentId: "model-memory-proof",
      sessionState,
      projectionVersions: input.projectionVersions,
      projectionTexts: input.projectionOutputs,
      artifacts,
      recentTurns: [],
      toolResults: [],
      currentTurn: input.probe.currentTurn,
      maxTokens: DEFAULT_CONTEXT_MAX_TOKENS,
      provider: "openrouter",
      model: input.modelRef,
      includeRetrievalPacks: true,
    });
    await input.runtime.runtimeRepository.persistContextRun(
      engine.ledger.run,
      engine.ledger.segments,
    );

    const objectById = new Map(input.memoryObjects.map((record) => [record.id, record] as const));
    const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact] as const));
    const projectionByVersionId = new Map(
      input.projectionVersions.map((version) => [version.id, version] as const),
    );
    const matching = countMatchingItems(
      retrieval.retrievalResultItems,
      objectById,
      input.probe.acceptedCanonicalClasses,
      input.probe.acceptedKinds,
    );
    const layerSegments = engine.assembled.orderedSegments.map((segment, index) => {
      const artifact = segment.sourceArtifactId
        ? artifactById.get(segment.sourceArtifactId)
        : undefined;
      const projection = segment.projectionVersionId
        ? projectionByVersionId.get(segment.projectionVersionId)
        : undefined;
      return {
        order: index,
        layer: segment.priority,
        segmentType: segment.segmentType,
        includeReason: buildProbeSegmentIncludeReason({
          segmentType: segment.segmentType,
          projection,
          artifact,
        }),
        projectionTargetId: projection?.targetId,
        sourceArtifactType: artifact?.artifactType,
        sourceArtifactScopeKey: artifact?.scopeKey,
        textHash: hashText(segment.text),
        textPreview: previewText(segment.text),
      };
    });

    return {
      id: `${input.probe.id}-${input.sessionSuffix}`,
      queryText: input.probe.queryText,
      selectedCount: retrieval.retrievalResultItems.filter((entry) => entry.selectedForContext)
        .length,
      matchingKindCount: matching.matchingKindCount,
      matchingClassCount: matching.matchingClassCount,
      bounded:
        retrieval.retrievalResultItems.filter((entry) => entry.selectedForContext).length <= 5,
      activeOnly: matching.activeOnly,
      retrievalPackIncluded: engine.assembled.orderedSegments.some(
        (segment) => segment.segmentType === "retrieval_pack" && !segment.dropped,
      ),
      orderedSegmentCount: engine.assembled.orderedSegments.length,
      estimatedInputTokens: engine.ledger.run.estimatedInputTokens,
      pruningUsed: engine.assembled.pruningUsed,
      stableLayerHash: engine.ledger.run.stableLayerHash,
      semiStableLayerHash: engine.ledger.run.semiStableLayerHash,
      volatileLayerHash: engine.ledger.run.volatileLayerHash,
      topResults: retrieval.retrievalResultItems
        .filter((entry) => entry.selectedForContext)
        .map((entry) => {
          const object = objectById.get(entry.memoryObjectId);
          return {
            objectId: entry.memoryObjectId,
            canonicalClass: object?.canonicalClass ?? "unknown",
            kind: object?.kind ?? "unknown",
            rankBand: entry.rankBand,
            reasonCodes: entry.retrievalReasonCodes,
          };
        }),
      layerSegments,
    };
  } catch (error) {
    return {
      id: `${input.probe.id}-${input.sessionSuffix}`,
      queryText: input.probe.queryText,
      selectedCount: 0,
      matchingKindCount: 0,
      matchingClassCount: 0,
      bounded: false,
      activeOnly: false,
      retrievalPackIncluded: false,
      orderedSegmentCount: 0,
      estimatedInputTokens: 0,
      pruningUsed: false,
      stableLayerHash: "",
      semiStableLayerHash: "",
      volatileLayerHash: "",
      topResults: [],
      layerSegments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function probeSucceeded(probe: RetrievalContextProbeResult): boolean {
  return !probe.error;
}

export async function executeModelMemoryProofPhase(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config?: OpenClawConfig;
  repoRoot: string;
  workspaceRoot?: string;
  sourcePlanPath?: string;
  modelRef: string;
  candidateModelRef: string;
  requestTimeoutMs?: number;
  requestSeed?: number;
  maxWordsPerWindow?: number;
  dailyFileLimit?: number;
  saturationRuns?: number;
  skipReset?: boolean;
  skipIngestion?: boolean;
  onProgress?: (event: ModelMemoryProofPhaseProgressEvent) => void | Promise<void>;
}): Promise<ModelMemoryProofPhaseReport> {
  const proofRunNonce = `${Date.now()}`;
  const workspaceRoot = input.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
  const requestTimeoutMs = input.requestTimeoutMs ?? LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
  const requestSeed = input.requestSeed ?? LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;
  const maxWordsPerWindow = input.maxWordsPerWindow ?? LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
  const saturationRuns = input.saturationRuns ?? DEFAULT_SATURATION_RUNS;
  const ingestionSources = input.sourcePlanPath
    ? await resolveProofPhaseSourcesFromPlanFile({
        repoRoot: input.repoRoot,
        planPath: input.sourcePlanPath,
      })
    : await resolveDefaultProofPhaseSources({
        repoRoot: input.repoRoot,
        workspaceRoot,
        dailyFileLimit: input.dailyFileLimit,
      });
  const corpusMode =
    input.skipReset || input.skipIngestion ? "current_corpus" : "fresh_ingestion_tranche";

  if (!input.skipReset) {
    await input.onProgress?.({
      type: "phase",
      phase: "reset_database",
      message: "resetting proof-phase database state",
    });
    await resetModelMemoryEvidenceDatabase(input.runtime);
  }
  await input.onProgress?.({
    type: "phase",
    phase: "start_ingestion",
    message: input.skipIngestion
      ? `using current populated corpus with ${ingestionSources.length} planned sources for downstream proof`
      : `starting ingestion tranche for ${ingestionSources.length} sources`,
  });

  const executor = new OpenAICompatibleLiveJsonExecutor({
    config: input.config,
    requestTimeoutMs,
    requestSeed,
  });
  const semanticInterpreter = new ExecutorBackedSemanticInterpreter(executor);
  const collisionAdjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
  const retrievalInterpreter = new ExecutorBackedRetrievalRequestInterpreter(executor);
  const retrievalFinalInclusionReviewer = new ExecutorBackedRetrievalFinalInclusionReviewer(
    executor,
    {
      modelId: input.modelRef,
      reasoningEffort: "low",
    },
  );
  const memoryStore = new DatabaseMemoryObjectStore(
    input.runtime.canonicalRepository,
    collisionAdjudicator,
  );

  const ingestionSummaries: IngestionSourceSummary[] = [];
  const adjudicationRows: IngestionAdjudicationRow[] = [];
  let supportOnlySource: string | undefined;

  if (!input.skipIngestion) {
    for (const [sourceIndex, source] of ingestionSources.entries()) {
      await input.onProgress?.({
        type: "source_start",
        index: sourceIndex + 1,
        total: ingestionSources.length,
        source,
        message: `ingesting source ${sourceIndex + 1}/${ingestionSources.length}: ${source.displayPath}`,
      });
      const text = await readFile(source.absolutePath, "utf8");
      const beforeSnapshot = await input.runtime.canonicalRepository.snapshot();

      const result =
        source.sourceKind === "daily_continuity"
          ? await recoverDailyContinuityCandidatesLive({
              canonicalRepository: input.runtime.canonicalRepository,
              runtimeRepository: input.runtime.runtimeRepository,
              memoryStore,
              collisionAdjudicator,
              recovery: {
                dailyRecord: {
                  externalSourceId: source.displayPath,
                  text,
                  maxWordsPerWindow,
                  sourceMetadata: {
                    dailyRecordPath: source.displayPath,
                  },
                },
                modelId: input.modelRef,
                candidateModelId: input.candidateModelRef,
                interpreter: semanticInterpreter,
              },
              rebuildRuntime: false,
            })
          : await ingestDocumentLive({
              canonicalRepository: input.runtime.canonicalRepository,
              runtimeRepository: input.runtime.runtimeRepository,
              memoryStore,
              collisionAdjudicator,
              ingestion: {
                document: {
                  externalSourceId: source.displayPath,
                  text,
                  maxWordsPerWindow,
                  sourceMetadata: {
                    relativePath: source.displayPath,
                  },
                },
                modelId: input.modelRef,
                candidateModelId: input.candidateModelRef,
                interpreter: semanticInterpreter,
              },
              rebuildRuntime: false,
            });

      const afterSnapshot = await input.runtime.canonicalRepository.snapshot();
      const windowIds = new Set(result.windows.map((window) => window.id));
      const supportItemsForSource = afterSnapshot.supportItems.filter((item) =>
        windowIds.has(item.sourceWindowId),
      );
      const touchedObjectIds = buildTouchedObjectIds(afterSnapshot.supportItems, windowIds);
      const objectsForSource = afterSnapshot.memoryObjects.filter((record) =>
        touchedObjectIds.has(record.id),
      );
      const lifecycle = countLifecycle(objectsForSource);
      const writeDecisionCounts = countBy(result.writeResults.map((entry) => entry.decision));
      const duplicateClusters = buildDuplicateClusterCandidates(objectsForSource);
      const sourceAdjudicationRows = buildAdjudicationRows({
        source,
        writeResults: result.writeResults,
        memoryObjects: afterSnapshot.memoryObjects,
        supportItems: afterSnapshot.supportItems,
        duplicateClusters: buildDuplicateClusterCandidates(afterSnapshot.memoryObjects),
      });
      adjudicationRows.push(...sourceAdjudicationRows);

      const objectDelta = afterSnapshot.memoryObjects.length - beforeSnapshot.memoryObjects.length;
      if (
        !supportOnlySource &&
        objectDelta === 0 &&
        (writeDecisionCounts.attach_support ?? 0) > 0
      ) {
        supportOnlySource = source.displayPath;
      }

      const summary: IngestionSourceSummary = {
        source: source.displayPath,
        sourceKind: source.sourceKind,
        classification: source.classification,
        lineCount: countLines(text),
        windowCount: result.windows.length,
        capturedClaimCount: result.capturedObjects.length,
        persistedObjectCount: objectsForSource.length,
        persistedSupportItemCount: supportItemsForSource.length,
        activeObjectCount: lifecycle.active,
        provisionalObjectCount: lifecycle.provisional,
        conflictHoldObjectCount: lifecycle.conflict_hold,
        writeDecisionCounts,
        supportAttachmentRate: roundRate(
          writeDecisionCounts.attach_support ?? 0,
          result.writeResults.length,
        ),
        supersessionRate: roundRate(writeDecisionCounts.supersede ?? 0, result.writeResults.length),
        duplicateClusterCandidates: duplicateClusters,
        sourceLevelSummary: collectSourceLevelSummary({
          source,
          writeDecisionCounts,
          objectCount: objectsForSource.length,
          supportCount: supportItemsForSource.length,
          lifecycle,
        }),
        windowSummaries: buildWindowSummaries({
          windows: result.windows,
          windowResults: result.windowResults,
        }),
        adjudicationRows: sourceAdjudicationRows,
        projectionContentHashes: {},
        contextArtifactHashes: {},
      };
      ingestionSummaries.push(summary);
      await input.onProgress?.({
        type: "source_complete",
        index: sourceIndex + 1,
        total: ingestionSources.length,
        source,
        summary,
        message: `completed source ${sourceIndex + 1}/${ingestionSources.length}: ${source.displayPath} windows=${summary.windowCount} captured=${summary.capturedClaimCount} objects=${summary.persistedObjectCount} supports=${summary.persistedSupportItemCount} decisions=${JSON.stringify(summary.writeDecisionCounts)}`,
      });
    }
  }

  const baselineSnapshot = await input.runtime.canonicalRepository.snapshot();
  const saturationSources = ingestionSources.slice(0, Math.min(3, ingestionSources.length));
  const saturationRunsSummary: SaturationRunSummary[] = [];
  await input.onProgress?.({
    type: "phase",
    phase: "start_saturation",
    message: `starting saturation reruns for ${saturationSources.length} sources across ${saturationRuns} runs`,
  });

  for (let runIndex = 1; runIndex <= saturationRuns; runIndex += 1) {
    const beforeSnapshot = await input.runtime.canonicalRepository.snapshot();
    const beforeDuplicateClusters = buildDuplicateClusterCandidates(beforeSnapshot.memoryObjects);
    let attachSupportCount = 0;
    let distinctWriteCount = 0;
    let supersedeCount = 0;
    for (const source of saturationSources) {
      const text = await readFile(source.absolutePath, "utf8");
      const result =
        source.sourceKind === "daily_continuity"
          ? await recoverDailyContinuityCandidatesLive({
              canonicalRepository: input.runtime.canonicalRepository,
              runtimeRepository: input.runtime.runtimeRepository,
              memoryStore,
              collisionAdjudicator,
              recovery: {
                dailyRecord: {
                  externalSourceId: source.displayPath,
                  text,
                  maxWordsPerWindow,
                  sourceMetadata: {
                    dailyRecordPath: source.displayPath,
                  },
                },
                modelId: input.modelRef,
                candidateModelId: input.candidateModelRef,
                interpreter: semanticInterpreter,
              },
              rebuildRuntime: false,
            })
          : await ingestDocumentLive({
              canonicalRepository: input.runtime.canonicalRepository,
              runtimeRepository: input.runtime.runtimeRepository,
              memoryStore,
              collisionAdjudicator,
              ingestion: {
                document: {
                  externalSourceId: source.displayPath,
                  text,
                  maxWordsPerWindow,
                  sourceMetadata: {
                    relativePath: source.displayPath,
                  },
                },
                modelId: input.modelRef,
                candidateModelId: input.candidateModelRef,
                interpreter: semanticInterpreter,
              },
              rebuildRuntime: false,
            });
      attachSupportCount += result.writeResults.filter(
        (entry) => entry.decision === "attach_support",
      ).length;
      distinctWriteCount += result.writeResults.filter(
        (entry) => entry.decision === "write",
      ).length;
      supersedeCount += result.writeResults.filter(
        (entry) => entry.decision === "supersede",
      ).length;
    }
    const afterSnapshot = await input.runtime.canonicalRepository.snapshot();
    const beforeLifecycle = countLifecycle(beforeSnapshot.memoryObjects);
    const afterLifecycle = countLifecycle(afterSnapshot.memoryObjects);
    const afterDuplicateClusters = buildDuplicateClusterCandidates(afterSnapshot.memoryObjects);
    const objectDelta = afterSnapshot.memoryObjects.length - beforeSnapshot.memoryObjects.length;
    const supportItemDelta = afterSnapshot.supportItems.length - beforeSnapshot.supportItems.length;
    const saturationSummary: SaturationRunSummary = {
      runIndex,
      sources: saturationSources.map((source) => source.displayPath),
      objectDelta,
      supportItemDelta,
      activeObjectDelta: afterLifecycle.active - beforeLifecycle.active,
      provisionalObjectDelta: afterLifecycle.provisional - beforeLifecycle.provisional,
      attachSupportCount,
      distinctWriteCount,
      supersedeCount,
      supportAttachmentRate: roundRate(
        attachSupportCount,
        attachSupportCount + distinctWriteCount + supersedeCount,
      ),
      nearDuplicateEscapeCount: Math.max(objectDelta, 0),
      duplicateClusterCandidateCount:
        afterDuplicateClusters.length - beforeDuplicateClusters.length,
    };
    saturationRunsSummary.push(saturationSummary);
    await input.onProgress?.({
      type: "saturation_run_complete",
      runIndex,
      totalRuns: saturationRuns,
      summary: saturationSummary,
      message: `completed saturation run ${runIndex}/${saturationRuns}: objectDelta=${saturationSummary.objectDelta} supportDelta=${saturationSummary.supportItemDelta} attach_support=${saturationSummary.attachSupportCount} distinct_write=${saturationSummary.distinctWriteCount}`,
    });
  }

  const postSaturationSnapshot = await input.runtime.canonicalRepository.snapshot();
  const finalRebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  const runtimeReadModelProof = buildRuntimeReadModelProof({
    memoryObjects: postSaturationSnapshot.memoryObjects,
    activeMemorySlots: finalRebuild.activeMemorySlots,
    activeMemorySets: finalRebuild.activeMemorySets,
    contextArtifacts: finalRebuild.contextArtifacts,
    projectionVersions: finalRebuild.projectionVersions,
  });
  const retrievalContextProbes: RetrievalContextProbeResult[] = [];
  await input.onProgress?.({
    type: "phase",
    phase: "start_retrieval_context",
    message: `starting retrieval/context probes (${RETRIEVAL_PROBES.length})`,
  });
  for (const probe of RETRIEVAL_PROBES) {
    retrievalContextProbes.push(
      await runRetrievalContextProbe({
        probe,
        runtime: input.runtime,
        retrievalInterpreter,
        retrievalFinalInclusionReviewer,
        memoryObjects: postSaturationSnapshot.memoryObjects,
        modelRef: input.modelRef,
        projectionVersions: finalRebuild.projectionVersions,
        projectionOutputs: finalRebuild.projectionOutputs,
        sessionSuffix: `primary-${proofRunNonce}`,
      }),
    );
  }

  const rebuildRerun = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  await input.onProgress?.({
    type: "phase",
    phase: "start_rebuild_projection",
    message: "evaluating rebuild and projection stability",
  });

  const rebuildProjectionProof: RebuildProjectionProof = {
    baselineProjectionHashes: buildProjectionHashMap(finalRebuild.projectionVersions),
    rerunProjectionHashes: buildProjectionHashMap(rebuildRerun.projectionVersions),
    baselineArtifactHashes: buildArtifactHashMap(finalRebuild.contextArtifacts),
    rerunArtifactHashes: buildArtifactHashMap(rebuildRerun.contextArtifacts),
    baselineStableArtifactHashes: buildArtifactHashMap(
      finalRebuild.contextArtifacts,
      "stable_only",
    ),
    rerunStableArtifactHashes: buildArtifactHashMap(rebuildRerun.contextArtifacts, "stable_only"),
    baselineTransientArtifactHashes: buildArtifactHashMap(
      finalRebuild.contextArtifacts,
      "transient_only",
    ),
    rerunTransientArtifactHashes: buildArtifactHashMap(
      rebuildRerun.contextArtifacts,
      "transient_only",
    ),
    projectionHashesStable:
      JSON.stringify(buildProjectionHashMap(finalRebuild.projectionVersions)) ===
      JSON.stringify(buildProjectionHashMap(rebuildRerun.projectionVersions)),
    artifactHashesStable:
      JSON.stringify(buildArtifactHashMap(finalRebuild.contextArtifacts, "stable_only")) ===
      JSON.stringify(buildArtifactHashMap(rebuildRerun.contextArtifacts, "stable_only")),
    unchangedRebuildClass:
      JSON.stringify(buildProjectionHashMap(finalRebuild.projectionVersions)) ===
        JSON.stringify(buildProjectionHashMap(rebuildRerun.projectionVersions)) &&
      JSON.stringify(buildArtifactHashMap(finalRebuild.contextArtifacts, "stable_only")) ===
        JSON.stringify(buildArtifactHashMap(rebuildRerun.contextArtifacts, "stable_only"))
        ? diffArtifactKeys(
            buildArtifactHashMap(finalRebuild.contextArtifacts, "transient_only"),
            buildArtifactHashMap(rebuildRerun.contextArtifacts, "transient_only"),
          ).length > 0
          ? "transient_retrieval_artifact_growth"
          : "stable_canonical_runtime"
        : "unexpected_stable_surface_churn",
    transientArtifactGrowthKeys: diffArtifactKeys(
      buildArtifactHashMap(finalRebuild.contextArtifacts, "transient_only"),
      buildArtifactHashMap(rebuildRerun.contextArtifacts, "transient_only"),
    ),
    supportOnlySource,
    supportOnlyTarget: supportOnlySource
      ? {
          sourceType: "natural_source_rerun",
          source: supportOnlySource,
        }
      : undefined,
    supportOnlyProbeClass: "support_only_probe_blocked_no_true_support_only_source",
    supportOnlyProjectionChurn: null,
    supportOnlyArtifactChurn: null,
    supportOnlyTransientArtifactGrowthKeys: [],
    supportOnlyStableSurfaceDiffs: [],
  };

  const cacheProbe = await runRetrievalContextProbe({
    probe: RETRIEVAL_PROBES[0],
    runtime: input.runtime,
    retrievalInterpreter,
    retrievalFinalInclusionReviewer,
    memoryObjects: postSaturationSnapshot.memoryObjects,
    modelRef: input.modelRef,
    projectionVersions: rebuildRerun.projectionVersions,
    projectionOutputs: rebuildRerun.projectionOutputs,
    sessionSuffix: `cache-baseline-${proofRunNonce}`,
  });
  const repeatedProbe = await runRetrievalContextProbe({
    probe: RETRIEVAL_PROBES[0],
    runtime: input.runtime,
    retrievalInterpreter,
    retrievalFinalInclusionReviewer,
    memoryObjects: postSaturationSnapshot.memoryObjects,
    modelRef: input.modelRef,
    projectionVersions: rebuildRerun.projectionVersions,
    projectionOutputs: rebuildRerun.projectionOutputs,
    sessionSuffix: `cache-repeat-${proofRunNonce}`,
  });

  const supportProbeSource = supportOnlySource
    ? ingestionSources.find((entry) => entry.displayPath === supportOnlySource)
    : undefined;
  await input.onProgress?.({
    type: "phase",
    phase: "start_cache_usage",
    message: `evaluating cache/usage behavior${supportProbeSource ? ` using ${supportProbeSource.displayPath}` : ""}`,
  });
  const beforeSupportSnapshot = await input.runtime.canonicalRepository.snapshot();
  let supportProbeWriteCounts: Record<string, number> = {};
  if (supportProbeSource) {
    const text = await readFile(supportProbeSource.absolutePath, "utf8");
    const supportProbeResult =
      supportProbeSource.sourceKind === "daily_continuity"
        ? await recoverDailyContinuityCandidatesLive({
            canonicalRepository: input.runtime.canonicalRepository,
            runtimeRepository: input.runtime.runtimeRepository,
            memoryStore,
            collisionAdjudicator,
            recovery: {
              dailyRecord: {
                externalSourceId: supportProbeSource.displayPath,
                text,
                maxWordsPerWindow,
                sourceMetadata: {
                  dailyRecordPath: supportProbeSource.displayPath,
                },
              },
              modelId: input.modelRef,
              candidateModelId: input.candidateModelRef,
              interpreter: semanticInterpreter,
            },
            rebuildRuntime: false,
          })
        : await ingestDocumentLive({
            canonicalRepository: input.runtime.canonicalRepository,
            runtimeRepository: input.runtime.runtimeRepository,
            memoryStore,
            collisionAdjudicator,
            ingestion: {
              document: {
                externalSourceId: supportProbeSource.displayPath,
                text,
                maxWordsPerWindow,
                sourceMetadata: {
                  relativePath: supportProbeSource.displayPath,
                },
              },
              modelId: input.modelRef,
              candidateModelId: input.candidateModelRef,
              interpreter: semanticInterpreter,
            },
            rebuildRuntime: false,
          });
    supportProbeWriteCounts = countBy(
      supportProbeResult.writeResults.map((entry) => entry.decision),
    );
  } else {
    const syntheticSupportProbe = await runSyntheticSupportOnlyProbe({
      runtime: input.runtime,
      memoryStore,
      snapshot: beforeSupportSnapshot,
    });
    if (syntheticSupportProbe) {
      rebuildProjectionProof.supportOnlySource = syntheticSupportProbe.target.source;
      rebuildProjectionProof.supportOnlyTarget = syntheticSupportProbe.target;
      supportProbeWriteCounts = syntheticSupportProbe.writeDecisionCounts;
    }
  }

  const postSupportSnapshot = await input.runtime.canonicalRepository.snapshot();
  const postSupportRebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  if (
    supportProbeSource ||
    rebuildProjectionProof.supportOnlyTarget?.sourceType === "synthetic_existing_object_replay"
  ) {
    rebuildProjectionProof.supportOnlyProbeClass = classifySupportProbeClass({
      objectDelta:
        postSupportSnapshot.memoryObjects.length - beforeSupportSnapshot.memoryObjects.length,
      attachSupportCount: supportProbeWriteCounts.attach_support ?? 0,
      distinctWriteCount: supportProbeWriteCounts.write ?? 0,
      supersedeCount: supportProbeWriteCounts.supersede ?? 0,
    });
  }
  if (rebuildProjectionProof.supportOnlyProbeClass === "pure_attach_support") {
    rebuildProjectionProof.supportOnlyProjectionChurn =
      JSON.stringify(buildProjectionHashMap(rebuildRerun.projectionVersions)) !==
      JSON.stringify(buildProjectionHashMap(postSupportRebuild.projectionVersions));
    rebuildProjectionProof.supportOnlyArtifactChurn =
      JSON.stringify(buildArtifactHashMap(rebuildRerun.contextArtifacts, "stable_only")) !==
      JSON.stringify(buildArtifactHashMap(postSupportRebuild.contextArtifacts, "stable_only"));
  }
  rebuildProjectionProof.supportOnlyTransientArtifactGrowthKeys =
    supportProbeSource !== undefined ||
    rebuildProjectionProof.supportOnlyTarget?.sourceType === "synthetic_existing_object_replay"
      ? diffArtifactKeys(
          buildArtifactHashMap(rebuildRerun.contextArtifacts, "transient_only"),
          buildArtifactHashMap(postSupportRebuild.contextArtifacts, "transient_only"),
        )
      : [];
  rebuildProjectionProof.supportOnlyStableSurfaceDiffs =
    supportProbeSource !== undefined ||
    rebuildProjectionProof.supportOnlyTarget?.sourceType === "synthetic_existing_object_replay"
      ? buildStableSurfaceDiffs({
          beforeProjections: buildProjectionDetailMap(rebuildRerun.projectionVersions),
          afterProjections: buildProjectionDetailMap(postSupportRebuild.projectionVersions),
          beforeArtifacts: buildArtifactDetailMap(rebuildRerun.contextArtifacts, "stable_only"),
          afterArtifacts: buildArtifactDetailMap(
            postSupportRebuild.contextArtifacts,
            "stable_only",
          ),
        })
      : [];
  const supportProbe = await runRetrievalContextProbe({
    probe: RETRIEVAL_PROBES[0],
    runtime: input.runtime,
    retrievalInterpreter,
    retrievalFinalInclusionReviewer,
    memoryObjects: postSupportSnapshot.memoryObjects,
    modelRef: input.modelRef,
    projectionVersions: postSupportRebuild.projectionVersions,
    projectionOutputs: postSupportRebuild.projectionOutputs,
    sessionSuffix: `cache-support-${proofRunNonce}`,
  });
  const cacheUsageProof: CacheUsageProof = {
    unchangedStableLayerStable:
      probeSucceeded(cacheProbe) &&
      probeSucceeded(repeatedProbe) &&
      cacheProbe.stableLayerHash === repeatedProbe.stableLayerHash,
    unchangedSemiStableLayerStable:
      probeSucceeded(cacheProbe) &&
      probeSucceeded(repeatedProbe) &&
      cacheProbe.semiStableLayerHash === repeatedProbe.semiStableLayerHash,
    unchangedVolatileLayerStable:
      probeSucceeded(cacheProbe) &&
      probeSucceeded(repeatedProbe) &&
      cacheProbe.volatileLayerHash === repeatedProbe.volatileLayerHash,
    supportOnlyStableLayerStable:
      rebuildProjectionProof.supportOnlyProbeClass === "pure_attach_support" &&
      probeSucceeded(cacheProbe) &&
      probeSucceeded(supportProbe)
        ? cacheProbe.stableLayerHash === supportProbe.stableLayerHash
        : null,
    supportOnlySemiStableLayerStable:
      rebuildProjectionProof.supportOnlyProbeClass === "pure_attach_support" &&
      probeSucceeded(cacheProbe) &&
      probeSucceeded(supportProbe)
        ? cacheProbe.semiStableLayerHash === supportProbe.semiStableLayerHash
        : null,
    supportOnlyVolatileLayerStable:
      rebuildProjectionProof.supportOnlyProbeClass === "pure_attach_support" &&
      probeSucceeded(cacheProbe) &&
      probeSucceeded(supportProbe)
        ? cacheProbe.volatileLayerHash === supportProbe.volatileLayerHash
        : null,
    baselineHashes: {
      stable: cacheProbe.stableLayerHash,
      semiStable: cacheProbe.semiStableLayerHash,
      volatile: cacheProbe.volatileLayerHash,
    },
    repeatedHashes: {
      stable: repeatedProbe.stableLayerHash,
      semiStable: repeatedProbe.semiStableLayerHash,
      volatile: repeatedProbe.volatileLayerHash,
    },
    supportOnlyHashes: {
      stable: supportProbe.stableLayerHash,
      semiStable: supportProbe.semiStableLayerHash,
      volatile: supportProbe.volatileLayerHash,
    },
    supportOnlyStableSegmentDiffs:
      (supportProbeSource !== undefined ||
        rebuildProjectionProof.supportOnlyTarget?.sourceType ===
          "synthetic_existing_object_replay") &&
      probeSucceeded(cacheProbe) &&
      probeSucceeded(supportProbe)
        ? buildStableCacheSegmentDiffs({
            before: cacheProbe.layerSegments,
            after: supportProbe.layerSegments,
          })
        : [],
  };

  const finalSnapshot = await input.runtime.canonicalRepository.snapshot();
  const finalRuntimeSnapshot = await input.runtime.runtimeRepository.snapshot();
  const finalDuplicateClusters = buildDuplicateClusterCandidates(finalSnapshot.memoryObjects);
  const operatorInspectionProof = await buildOperatorInspectionProof({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  const shadowSurfaceProof = await buildShadowSurfaceProof({
    runtime: input.runtime,
    config: input.config,
    source:
      ingestionSources.find((entry) => entry.displayPath === "docs/help/testing.md") ??
      ingestionSources.find((entry) => entry.sourceKind === "document"),
    modelRef: input.modelRef,
    candidateModelRef: input.candidateModelRef,
    requestTimeoutMs,
    requestSeed,
    maxWordsPerWindow,
  });
  await input.onProgress?.({
    type: "phase",
    phase: "start_long_horizon",
    message: "evaluating long-horizon corpus behavior",
  });
  const longHorizonSummary: LongHorizonCorpusSummary = {
    startingActiveObjects: countLifecycle(baselineSnapshot.memoryObjects).active,
    endingActiveObjects: countLifecycle(finalSnapshot.memoryObjects).active,
    startingSupportItems: baselineSnapshot.supportItems.length,
    endingSupportItems: finalSnapshot.supportItems.length,
    conflictHoldCount: countLifecycle(finalSnapshot.memoryObjects).conflict_hold,
    provisionalCount: countLifecycle(finalSnapshot.memoryObjects).provisional,
    expiredCount: countLifecycle(finalSnapshot.memoryObjects).expired,
    duplicateActiveObjectCount: finalDuplicateClusters.length,
    supportOutgrewObjectsOnReruns:
      saturationRunsSummary.reduce((sum, entry) => sum + entry.supportItemDelta, 0) >=
      saturationRunsSummary.reduce((sum, entry) => sum + Math.max(entry.objectDelta, 0), 0),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    corpusMode,
    sourcePlanPath: input.sourcePlanPath,
    workspaceRoot,
    modelRef: input.modelRef,
    candidateModelRef: input.candidateModelRef,
    requestSeed,
    requestTimeoutMs,
    maxWordsPerWindow,
    ingestionSources,
    ingestionSummaries,
    adjudicationRows,
    saturationRuns: saturationRunsSummary,
    retrievalContextProbes,
    runtimeReadModelProof,
    rebuildProjectionProof,
    cacheUsageProof,
    operatorInspectionProof,
    shadowSurfaceProof,
    longHorizonSummary,
    corpusTotals: collectCorpusTotals(finalSnapshot),
    calibration: buildCalibrationReport({
      memoryObjects: finalSnapshot.memoryObjects,
      writeEvents: finalSnapshot.writeEvents,
      retrievalRequests: finalRuntimeSnapshot.retrievalRequests,
      retrievalResultSets: finalRuntimeSnapshot.retrievalResultSets,
      retrievalResultItems: finalRuntimeSnapshot.retrievalResultItems,
      contextRuns: finalRuntimeSnapshot.contextRuns,
    }),
  } satisfies Omit<ModelMemoryProofPhaseReport, "proofGaps" | "readiness">;
  const proofGaps = buildProofGapMap({
    runtimeReadModelProof,
    retrievalContextProbes,
    rebuildProjectionProof,
    cacheUsageProof,
    operatorInspectionProof,
    shadowSurfaceProof,
    longHorizonSummary,
    corpusTotals: report.corpusTotals,
  });
  const readiness = evaluateCutoverReadiness({
    proofGaps,
    calibration: report.calibration,
  });
  const finalReport: ModelMemoryProofPhaseReport = {
    ...report,
    proofGaps,
    readiness,
  };
  await input.onProgress?.({
    type: "phase",
    phase: "complete",
    message: `proof phase complete: objects=${finalReport.corpusTotals.canonicalObjectsPersisted} supports=${finalReport.corpusTotals.supportItemsPersisted} active=${finalReport.corpusTotals.activeObjects} readiness=${finalReport.readiness.decision}`,
  });
  return finalReport;
}

export function renderProofPhaseMarkdown(report: ModelMemoryProofPhaseReport): string {
  const lines: string[] = [];
  lines.push("# Model Memory Proof Phase");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Corpus mode: ${report.corpusMode}`);
  lines.push(`- Source plan: ${report.sourcePlanPath ?? "default proof sources"}`);
  lines.push(`- Model: ${report.modelRef}`);
  lines.push(`- Candidate model: ${report.candidateModelRef}`);
  lines.push(`- Request seed: ${report.requestSeed ?? "none"}`);
  lines.push(`- Request timeout ms: ${report.requestTimeoutMs}`);
  lines.push(`- Max words per window: ${report.maxWordsPerWindow}`);
  lines.push(`- Workspace root: ${report.workspaceRoot}`);
  lines.push(`- Sources ingested: ${report.ingestionSources.length}`);
  lines.push(
    `- Corpus totals: objects=${report.corpusTotals.canonicalObjectsPersisted} supports=${report.corpusTotals.supportItemsPersisted} active=${report.corpusTotals.activeObjects} provisional=${report.corpusTotals.provisionalObjects} conflict_hold=${report.corpusTotals.conflictHoldObjects}`,
  );
  lines.push("");

  lines.push("## Ingestion tranche");
  lines.push("");
  for (const summary of report.ingestionSummaries) {
    lines.push(`### ${summary.source}`);
    lines.push(`- Source kind: ${summary.sourceKind}`);
    lines.push(`- Classification: ${summary.classification}`);
    lines.push(`- Windows: ${summary.windowCount}`);
    lines.push(`- Captured claims: ${summary.capturedClaimCount}`);
    lines.push(`- Persisted objects: ${summary.persistedObjectCount}`);
    lines.push(`- Persisted support items: ${summary.persistedSupportItemCount}`);
    lines.push(`- Write decisions: ${JSON.stringify(summary.writeDecisionCounts)}`);
    lines.push(`- Support attachment rate: ${summary.supportAttachmentRate}`);
    lines.push(`- Supersession rate: ${summary.supersessionRate}`);
    lines.push(`- Duplicate cluster candidates: ${summary.duplicateClusterCandidates.length}`);
    lines.push("");
  }

  lines.push("## Saturation");
  lines.push("");
  for (const run of report.saturationRuns) {
    lines.push(
      `- Run ${run.runIndex}: objectDelta=${run.objectDelta} supportItemDelta=${run.supportItemDelta} attach_support=${run.attachSupportCount} distinct_write=${run.distinctWriteCount} near_duplicate_escape=${run.nearDuplicateEscapeCount}`,
    );
  }
  lines.push("");

  lines.push("## Retrieval and context");
  lines.push("");
  for (const probe of report.retrievalContextProbes) {
    lines.push(
      `- ${probe.id}: selected=${probe.selectedCount} matchingKinds=${probe.matchingKindCount} matchingClasses=${probe.matchingClassCount} activeOnly=${probe.activeOnly} retrievalPackIncluded=${probe.retrievalPackIncluded} pruningUsed=${probe.pruningUsed} estimatedTokens=${probe.estimatedInputTokens}${probe.error ? ` error=${probe.error}` : ""}`,
    );
  }
  lines.push("");

  lines.push("## Runtime read models");
  lines.push("");
  lines.push(`- Active memory slots: ${report.runtimeReadModelProof.activeMemorySlotCount}`);
  lines.push(`- Active memory sets: ${report.runtimeReadModelProof.activeMemorySetCount}`);
  lines.push(`- Context artifacts: ${report.runtimeReadModelProof.contextArtifactCount}`);
  lines.push(`- Projection versions: ${report.runtimeReadModelProof.projectionVersionCount}`);
  lines.push(
    `- Active-only default reads hold: ${report.runtimeReadModelProof.activeOnlyDefaultReadsHold}`,
  );
  lines.push(
    `- Slot leaks: ${report.runtimeReadModelProof.slotLeakObjectIds.length} | Set leaks: ${report.runtimeReadModelProof.setLeakObjectIds.length}`,
  );
  lines.push("");

  lines.push("## Rebuild and cache");
  lines.push("");
  lines.push(
    `- Projection hashes stable on unchanged rebuild: ${report.rebuildProjectionProof.projectionHashesStable}`,
  );
  lines.push(
    `- Stable artifact hashes stable on unchanged rebuild: ${report.rebuildProjectionProof.artifactHashesStable}`,
  );
  lines.push(`- Unchanged rebuild class: ${report.rebuildProjectionProof.unchangedRebuildClass}`);
  lines.push(
    `- Transient retrieval-pack artifact growth keys on unchanged rebuild: ${(report.rebuildProjectionProof.transientArtifactGrowthKeys ?? []).length}`,
  );
  lines.push(
    `- Support-only source: ${report.rebuildProjectionProof.supportOnlySource ?? "none observed"}`,
  );
  lines.push(
    `- Support-only target: ${report.rebuildProjectionProof.supportOnlyTarget?.targetObjectId ?? "n/a"}${report.rebuildProjectionProof.supportOnlyTarget?.targetSummary ? ` | ${report.rebuildProjectionProof.supportOnlyTarget.targetSummary}` : ""}`,
  );
  lines.push(
    `- Support-only target source type: ${report.rebuildProjectionProof.supportOnlyTarget?.sourceType ?? "blocked"}`,
  );
  lines.push(`- Support probe class: ${report.rebuildProjectionProof.supportOnlyProbeClass}`);
  lines.push(
    `- Support-only projection churn: ${renderBooleanOrBlocked(report.rebuildProjectionProof.supportOnlyProjectionChurn)}`,
  );
  lines.push(
    `- Support-only stable artifact churn: ${renderBooleanOrBlocked(report.rebuildProjectionProof.supportOnlyArtifactChurn)}`,
  );
  lines.push(
    `- Support-only transient retrieval-pack growth keys: ${(report.rebuildProjectionProof.supportOnlyTransientArtifactGrowthKeys ?? []).length}`,
  );
  lines.push(
    `- Support-only stable-surface diffs: ${report.rebuildProjectionProof.supportOnlyStableSurfaceDiffs.length}`,
  );
  lines.push(
    `- Stable layer stable on unchanged rerun: ${report.cacheUsageProof.unchangedStableLayerStable}`,
  );
  lines.push(
    `- Semi-stable layer stable on unchanged rerun: ${report.cacheUsageProof.unchangedSemiStableLayerStable}`,
  );
  lines.push(
    `- Volatile layer stable on unchanged rerun: ${report.cacheUsageProof.unchangedVolatileLayerStable}`,
  );
  lines.push(
    `- Stable layer stable after support-only write: ${renderBooleanOrBlocked(report.cacheUsageProof.supportOnlyStableLayerStable)}`,
  );
  lines.push(
    `- Semi-stable layer stable after support-only write: ${renderBooleanOrBlocked(report.cacheUsageProof.supportOnlySemiStableLayerStable)}`,
  );
  lines.push(
    `- Volatile layer stable after support-only write: ${renderBooleanOrBlocked(report.cacheUsageProof.supportOnlyVolatileLayerStable)}`,
  );
  lines.push(
    `- Stable cache-segment diffs after support probe: ${report.cacheUsageProof.supportOnlyStableSegmentDiffs.length}`,
  );
  lines.push("");

  lines.push("## Operator and shadow");
  lines.push("");
  lines.push(
    `- Operator surfaces operational: ${report.operatorInspectionProof.surfacesOperational}`,
  );
  lines.push(
    `- Recent captures=${report.operatorInspectionProof.recentCaptureCount} writeDecisions=${report.operatorInspectionProof.writeDecisionCount} projectionVersions=${report.operatorInspectionProof.projectionVersionCount}`,
  );
  lines.push(
    `- Retrieval requests=${report.operatorInspectionProof.retrievalRequestCount} resultSets=${report.operatorInspectionProof.retrievalResultSetCount} resultItems=${report.operatorInspectionProof.retrievalResultItemCount}`,
  );
  lines.push(
    `- Context runs=${report.operatorInspectionProof.contextRunCount} segments=${report.operatorInspectionProof.contextRunSegmentCount}`,
  );
  lines.push(
    `- Shadow surface operational: ${report.shadowSurfaceProof.surfaceOperational} (comparisonMeaningful=${report.shadowSurfaceProof.comparisonMeaningful})`,
  );
  lines.push(
    `- Shadow source: ${report.shadowSurfaceProof.source ?? "none"} | matched=${report.shadowSurfaceProof.matchedIdentityCount} modelOnly=${report.shadowSurfaceProof.modelOnlyIdentityCount} legacyOnly=${report.shadowSurfaceProof.legacyOnlyIdentityCount}`,
  );
  lines.push("");

  lines.push("## Long horizon");
  lines.push("");
  lines.push(
    `- Active objects: ${report.longHorizonSummary.startingActiveObjects} -> ${report.longHorizonSummary.endingActiveObjects}`,
  );
  lines.push(
    `- Support items: ${report.longHorizonSummary.startingSupportItems} -> ${report.longHorizonSummary.endingSupportItems}`,
  );
  lines.push(
    `- Duplicate active-object candidates: ${report.longHorizonSummary.duplicateActiveObjectCount}`,
  );
  lines.push(
    `- Support outgrew objects on reruns: ${report.longHorizonSummary.supportOutgrewObjectsOnReruns}`,
  );
  lines.push("");

  lines.push("## Proof gaps");
  lines.push("");
  for (const gap of report.proofGaps) {
    lines.push(`- ${gap.id}: ${gap.status}`);
    lines.push(`  - seams: ${gap.owningSeams.join(", ")}`);
    lines.push(`  - notes: ${gap.notes.join("; ")}`);
  }
  lines.push("");

  lines.push("## Readiness");
  lines.push("");
  lines.push(`- Decision: ${report.readiness.decision}`);
  lines.push(`- Ready: ${report.readiness.ready}`);
  lines.push(`- Blockers: ${report.readiness.blockers.join(", ") || "none"}`);
  lines.push(`- Reasons: ${report.readiness.reasons.join(", ") || "none"}`);
  lines.push("");

  return lines.join("\n");
}

export function renderAdjudicationMarkdown(rows: IngestionAdjudicationRow[]): string {
  const lines: string[] = [];
  lines.push("# Model Memory Adjudication Export");
  lines.push("");
  lines.push("| Source | Window | Path | Lifecycle | Supports | Prior | Flags | Payload |");
  lines.push("| --- | --- | --- | --- | ---: | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.source} | ${row.sourceWindowId} | ${row.adjudicationPath} | ${row.lifecycleState ?? "n/a"} | ${row.supportCount} | ${row.matchedPriorObjectId ?? ""} | ${row.reviewFlags.join(", ")} | ${row.firstPayloadRender.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
