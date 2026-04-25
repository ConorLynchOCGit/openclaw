import {
  buildDerivedArtifactId,
  cloneJsonLike,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  advanceMemoryMaintenanceCandidateLifecycle,
  createMemoryMaintenanceCandidate,
  onMemoryMaintenanceEvent,
  runDailyMemoryMaintenance,
  runHeartbeatMemoryMaintenance,
} from "../memory-maintenance-loop.ts";
import { buildToolResultProofLiveCapture } from "../mmv2/tool-result-proof-capture.ts";
import { compileProjectStateCapsule, type ProjectStateCapsule } from "../project-state-capsule.ts";
import {
  buildRuntimeGraph,
  type RuntimeGraphBuildResult,
  type RuntimeGraphMemoryInput,
} from "../runtime-graph.ts";
import { buildProjectStateCapsuleContext } from "../runtime/context/project-state-capsule-context.ts";
import type { Phase2RetrievalIntegrationProofReport } from "../runtime/retrieval/phase2-integration-proof.ts";
import {
  buildProjectStateCapsuleRetrievalShadow,
  type ProjectStateCapsuleRetrievalShadowResult,
} from "../runtime/retrieval/project-state-capsules.ts";
import type { RetrievalPlan } from "../runtime/retrieval/types.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import { buildPhase2EvalProof, type Phase2EvalProofReport } from "./phase2-eval-proof.ts";

export const PHASE2_UI_RUNTIME_PROOF_COVERAGE_SCHEMA_VERSION =
  "phase2_ui_runtime_proof_coverage.v1" as const;

export type Phase2UiRuntimeProofCoverageMode = "explicit_operator_proof";

export type Phase2UiRuntimeProofCoverageArea =
  | "maintenance_loop"
  | "runtime_graph"
  | "project_state_capsule"
  | "capsule_retrieval_shadow"
  | "gated_capsule_context"
  | "hierarchical_retrieval_shadow"
  | "slice8_integration_proof"
  | "slice9_eval_proof"
  | "non_user_prompt_ingestion";

export type Phase2UiRuntimeProofCoverageCheck = {
  checkId: string;
  area: Phase2UiRuntimeProofCoverageArea;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2UiRuntimeProofCoverageUiEvidence = {
  sessionKey: string;
  promptMarker: string;
  runId?: string | null;
  terminalEvidence: boolean;
  assistantTextSha256?: string;
  artifactPath?: string;
};

export type Phase2UiRuntimeProofCoverageReport = {
  schemaVersion: typeof PHASE2_UI_RUNTIME_PROOF_COVERAGE_SCHEMA_VERSION;
  reportId: string;
  mode: Phase2UiRuntimeProofCoverageMode;
  generatedAt: string;
  projectId: string;
  uiEvidence?: Phase2UiRuntimeProofCoverageUiEvidence;
  coverage: {
    maintenanceLoop: {
      eventCandidateIds: string[];
      heartbeatCounts: Record<string, number>;
      dailySweepCounts: Record<string, number>;
      retention: {
        activeDays: 30;
        archivedDays: 90;
      };
      lifecycleStatuses: Record<string, string>;
      pinnedCandidateId: string;
    };
    runtimeGraph: {
      available: boolean;
      nodeIds: string[];
      edgeIds: string[];
      sourceMemoryIds: string[];
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
      excludedMemoryIds: string[];
      outputHash: string;
    };
    projectStateCapsule: {
      capsuleId: string;
      contentHash: string;
      sectionIds: string[];
      sourceMemoryIds: string[];
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
      freshnessStatus: string;
      conflictMarkers: string[];
      lowerAuthorityItemIds: string[];
      conflictSectionItemIds: string[];
    };
    capsuleRetrievalShadow: {
      wouldSelectCapsuleIds: string[];
      packIds: string[];
      exclusionReasons: Record<string, number>;
      sourceMemoryIds: string[];
      contentHashes: string[];
      defaultContextInjectionChanged: false;
    };
    gatedCapsuleContext: {
      disabledInjected: false;
      explicitInjected: boolean;
      blockIds: string[];
      packIds: string[];
      sourceMemoryIds: string[];
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
      contentHashes: string[];
      estimatedTokens: number;
      defaultContextInjectionChanged: false;
    };
    hierarchicalRetrievalShadow: {
      planId?: string;
      subqueryIds: string[];
      subqueryCount: number;
      mergedCandidateIds: string[];
      exclusionReasons: Record<string, number>;
      authorityTiers: SourceAuthorityTier[];
      sourceProfileIds: SourceProfileId[];
      graphLaneUsed: boolean;
      projectionLaneUsed: boolean;
      capsuleLaneUsed: boolean;
      defaultRetrievalChanged: false;
    };
    slice8IntegrationProof: {
      reportId: string;
      traceId: string;
      selectedLanes: string[];
      contentHashes: string[];
      defaultRetrievalChanged: false;
      defaultContextInjectionChanged: false;
    };
    slice9EvalProof: {
      reportId: string;
      scenarioCount: number;
      scenarioTypes: string[];
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
      noDarkDataValidationStatus: "pass" | "fail";
      retrievalLaneCoverage: string[];
      defaultRetrievalChanged: false;
      defaultContextInjectionChanged: false;
    };
    nonUserPromptIngestion: {
      toolGrounded: {
        admittedCount: number;
        sourceProfileId: "tool_result_capture";
        authorityTier: "tool_grounded";
        sourceIds: string[];
        memoryIds: string[];
        boundedFactHash: string;
      };
      dailyContinuity: {
        represented: boolean;
        sourceProfileId: "daily_continuity";
        authorityTier: "cited_soft";
        scenarioIds: string[];
      };
      inspectionOnlyExcluded: boolean;
      prohibitedContentRejected: boolean;
    };
  };
  checks: Phase2UiRuntimeProofCoverageCheck[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2UiRuntimeProofCoverageInput = {
  mode?: Phase2UiRuntimeProofCoverageMode;
  projectId?: string;
  now?: Date;
  uiEvidence?: Phase2UiRuntimeProofCoverageUiEvidence;
};

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function check(
  checks: Phase2UiRuntimeProofCoverageCheck[],
  area: Phase2UiRuntimeProofCoverageArea,
  checkId: string,
  condition: boolean,
  passReasonCode: string,
  failReasonCode = "proof_invariant_failed",
): void {
  checks.push({
    area,
    checkId,
    status: condition ? "pass" : "fail",
    reasonCode: condition ? passReasonCode : failReasonCode,
  });
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
        `phase2 UI runtime proof contains prohibited field: ${[...path, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value);
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 UI runtime proof contains prohibited marker content");
    }
  }
}

function sourceRef(memoryId: string, sourceProfileId: SourceProfileId) {
  return {
    sourceId: `source-${memoryId}`,
    segmentId: `segment-${memoryId}`,
    sourceType: sourceProfileId,
    contentHash: hashDerivedArtifactValue({ memoryId, sourceProfileId }),
  };
}

function graphMemory(input: {
  memoryId: string;
  projectId: string;
  kind: string;
  canonicalText: string;
  authorityTier: SourceAuthorityTier;
  sourceProfileId: SourceProfileId;
  now: Date;
  status?: RuntimeGraphMemoryInput["status"];
  payload?: Record<string, unknown>;
  lineage?: RuntimeGraphMemoryInput["lineage"];
}): RuntimeGraphMemoryInput {
  return {
    memoryId: input.memoryId,
    status: input.status ?? "active",
    unitType: "atomic",
    kind: input.kind,
    artifactType: input.kind === "procedure" ? "procedure" : null,
    canonicalText: input.canonicalText,
    searchText: input.canonicalText.toLowerCase(),
    scope: {
      project_id: input.projectId,
      workspace_id: "phase2-ui-runtime-proof-workspace",
      subject_type: "project",
      subject_id: input.projectId,
    },
    payload: input.payload ?? { payload_type: "claim", claim_type: "project_fact" },
    validity: {
      valid_at: input.now.toISOString(),
      invalid_at: null,
      temporal_status: input.status === "active" || !input.status ? "current" : input.status,
    },
    sourceRefs: [sourceRef(input.memoryId, input.sourceProfileId)],
    lineage: input.lineage,
    sourceAuthorityTier: input.authorityTier,
    sourceProfileId: input.sourceProfileId,
    sourceEventIds: [`event-${input.memoryId}`],
    sourceEdgeIds: [`edge-${input.memoryId}`],
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
}

function buildLiveShapedMemories(projectId: string, now: Date): RuntimeGraphMemoryInput[] {
  return [
    graphMemory({
      memoryId: "mem-ui-authoritative-current",
      projectId,
      kind: "fact",
      canonicalText: "Phase 2 UI runtime proof has an authoritative current-state fact.",
      authorityTier: "user_authoritative",
      sourceProfileId: "explicit_user_turn",
      now,
    }),
    graphMemory({
      memoryId: "mem-ui-tool-grounded",
      projectId,
      kind: "fact",
      canonicalText: "Phase 2 UI runtime proof has bounded tool-grounded evidence.",
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      now,
    }),
    graphMemory({
      memoryId: "mem-ui-daily-continuity",
      projectId,
      kind: "procedure",
      canonicalText: "Phase 2 UI runtime proof has a daily continuity derived procedure.",
      authorityTier: "cited_soft",
      sourceProfileId: "daily_continuity",
      now,
      payload: { payload_type: "procedure", title: "continuity proof", steps: ["resume proof"] },
    }),
    graphMemory({
      memoryId: "mem-ui-conflicted",
      projectId,
      kind: "fact",
      canonicalText: "Phase 2 UI runtime proof has separated conflict-only evidence.",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      now,
      status: "conflicted",
      lineage: { conflictsWithMemoryIds: ["mem-ui-authoritative-current"] },
    }),
    graphMemory({
      memoryId: "mem-ui-inspection-only",
      projectId,
      kind: "fact",
      canonicalText: "Phase 2 UI runtime proof has inspection-only excluded evidence.",
      authorityTier: "inspection_only",
      sourceProfileId: "raw_transcript",
      now,
    }),
  ];
}

function retrievalPlan(projectId: string): RetrievalPlan {
  return {
    planId: "phase2-ui-runtime-proof-plan",
    schemaVersion: "retrieval_plan.v1",
    intent: "phase2_ui_runtime_proof",
    corpora: ["project", "projections"],
    packTypes: ["project_state_pack", "projection_digest_pack"],
    queries: [
      {
        queryHash: "phase2-ui-runtime-proof-query",
        redactedLabel: "sha256:phase2-ui-runtime-proof-query",
        indexes: ["fielded", "projection_digest", "graph"],
        filters: { projectId },
      },
    ],
    budget: {
      maxTokensTotal: 1200,
      hardDirectives: 0,
      userProfile: 0,
      projectState: 500,
      procedures: 200,
      sourceRefs: 100,
      episodes: 0,
      conflicts: 100,
      projections: 300,
    },
  };
}

function summarizeGraph(graph: RuntimeGraphBuildResult) {
  return {
    available: true,
    nodeIds: graph.nodes.map((node) => node.nodeId).toSorted(),
    edgeIds: graph.edges.map((edge) => edge.edgeId).toSorted(),
    sourceMemoryIds: uniqueSortedStrings(graph.nodes.flatMap((node) => node.sourceMemoryIds)),
    sourceProfileIds: uniqueSortedStrings(
      graph.nodes.map((node) => node.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      graph.nodes.map((node) => node.authorityTier),
    ) as SourceAuthorityTier[],
    excludedMemoryIds: graph.excludedMemoryIds.map((entry) => entry.memoryId).toSorted(),
    outputHash: graph.outputHash,
  };
}

function lowerAuthorityItemIds(capsule: ProjectStateCapsule): string[] {
  return capsule.sections
    .flatMap((section) => section.items)
    .filter((item) => item.authorityLabel === "lower_authority")
    .map((item) => item.itemId)
    .toSorted();
}

function conflictSectionItemIds(capsule: ProjectStateCapsule): string[] {
  return (
    capsule.sections
      .find((section) => section.sectionType === "conflicts")
      ?.items.map((item) => item.itemId)
      .toSorted() ?? []
  );
}

function summarizeCapsule(capsule: ProjectStateCapsule) {
  return {
    capsuleId: capsule.capsuleId,
    contentHash: capsule.contentHash,
    sectionIds: capsule.sections.map((section) => section.sectionId).toSorted(),
    sourceMemoryIds: [...capsule.digest.sourceMemoryIds],
    sourceProfileIds: [...capsule.digest.sourceProfileIds],
    authorityTiers: [...capsule.digest.authorityTiers],
    freshnessStatus: capsule.digest.freshness.status,
    conflictMarkers: [...capsule.digest.conflictMarkers],
    lowerAuthorityItemIds: lowerAuthorityItemIds(capsule),
    conflictSectionItemIds: conflictSectionItemIds(capsule),
  };
}

function summarizeShadow(shadow: ProjectStateCapsuleRetrievalShadowResult) {
  return {
    wouldSelectCapsuleIds: shadow.telemetry.wouldSelectCapsuleIds,
    packIds: shadow.packs.map((pack) => pack.packId).toSorted(),
    exclusionReasons: shadow.telemetry.exclusionReasons,
    sourceMemoryIds: shadow.telemetry.capsuleSourceMemoryIds,
    contentHashes: shadow.telemetry.capsuleContentHashes,
    defaultContextInjectionChanged: false as const,
  };
}

function buildNonUserPromptIngestionSummary(evalProof: Phase2EvalProofReport, now: Date) {
  const toolCapture = buildToolResultProofLiveCapture({
    toolName: "phase2_ui_runtime_proof_tool",
    toolCallId: "tool-call-phase2-ui-runtime-proof",
    sessionKey: "phase2-ui-runtime-proof",
    observedAt: now,
    result: {
      status: "success",
      artifactPath: "docs/projects/model-memory/phase2-ui-runtime-proof.md",
      url: "https://example.invalid/openclaw/phase2-ui-runtime-proof",
      fileCount: 2,
    },
  });
  if (!toolCapture) {
    throw new Error("expected bounded tool-result proof capture to be admitted");
  }
  const dailyScenarioIds = evalProof.scenarioResults
    .filter((result) => result.sourceProfileId === "daily_continuity")
    .map((result) => result.scenarioId)
    .toSorted();
  const inspectionOnlyExcluded =
    evalProof.noDarkDataFindings.find(
      (finding) => finding.findingId === "phase2-eval-inspection-exclusion",
    )?.status === "pass";
  const prohibitedContentRejected = evalProof.scenarioResults
    .filter((result) =>
      ["raw_prompt_reject", "raw_tool_log_reject", "secret_private_phrase_reject"].includes(
        result.scenarioType,
      ),
    )
    .every((result) => result.rejected);
  return {
    toolGrounded: {
      admittedCount: toolCapture.liveMemoryBatch.durableMemories.length,
      sourceProfileId: "tool_result_capture" as const,
      authorityTier: "tool_grounded" as const,
      sourceIds: [toolCapture.source.id],
      memoryIds: toolCapture.liveMemoryBatch.durableMemories
        .map((memory) => memory.memory_id)
        .toSorted(),
      boundedFactHash: hashDerivedArtifactValue(toolCapture.boundedFact),
    },
    dailyContinuity: {
      represented: dailyScenarioIds.length > 0,
      sourceProfileId: "daily_continuity" as const,
      authorityTier: "cited_soft" as const,
      scenarioIds: dailyScenarioIds,
    },
    inspectionOnlyExcluded,
    prohibitedContentRejected,
  };
}

function failCount(checks: Phase2UiRuntimeProofCoverageCheck[]): number {
  return checks.filter((entry) => entry.status === "fail").length;
}

export function buildPhase2UiRuntimeProofCoverage(
  input: Phase2UiRuntimeProofCoverageInput = {},
): Phase2UiRuntimeProofCoverageReport {
  assertNoProhibitedKeys(input);
  const mode = input.mode ?? "explicit_operator_proof";
  const now = input.now ?? new Date(0);
  const projectId = input.projectId ?? "phase2-ui-runtime-proof-project";
  const checks: Phase2UiRuntimeProofCoverageCheck[] = [];

  const eventMaintenance = onMemoryMaintenanceEvent({
    eventId: "event-phase2-ui-runtime-proof",
    occurredAt: now,
    sourceRefs: [
      {
        memoryId: "mem-ui-authoritative-current",
        sourceId: "source-mem-ui-authoritative-current",
        contentHash: hashDerivedArtifactValue("mem-ui-authoritative-current"),
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
      },
    ],
    affectedTargets: [
      {
        targetType: "capsule",
        targetId: "project_state",
        reasonCodes: ["memory_event_dirty_target"],
        dirty: true,
        sourceRefs: [{ memoryId: "mem-ui-authoritative-current" }],
      },
    ],
  });
  const activeCandidate = createMemoryMaintenanceCandidate({
    candidateType: "retrieval_quality",
    reasonCodes: ["retrieval_exclusion"],
    createdAt: now,
  });
  const archivedCandidate = createMemoryMaintenanceCandidate({
    candidateType: "stale_artifact",
    reasonCodes: ["stale_projection_or_capsule"],
    createdAt: addDays(now, -45),
  });
  const expiredCandidate = createMemoryMaintenanceCandidate({
    candidateType: "cache_projection",
    reasonCodes: ["cache_or_projection_churn"],
    createdAt: addDays(now, -130),
  });
  const pinnedCandidate = createMemoryMaintenanceCandidate({
    candidateType: "source_authority_review",
    reasonCodes: ["authority_conflict"],
    createdAt: addDays(now, -130),
    pinned: true,
  });
  const lifecycleCandidates = [
    activeCandidate,
    archivedCandidate,
    expiredCandidate,
    pinnedCandidate,
  ].map((candidate) => advanceMemoryMaintenanceCandidateLifecycle(candidate, now));
  const heartbeatReport = runHeartbeatMemoryMaintenance({
    candidates: lifecycleCandidates,
    derivedRefreshRecords: eventMaintenance.derivedRefreshRecords,
    now,
  });
  const dailyReport = runDailyMemoryMaintenance({
    candidates: lifecycleCandidates,
    derivedRefreshRecords: eventMaintenance.derivedRefreshRecords,
    now,
  });
  const maintenanceSummary = {
    eventCandidateIds: eventMaintenance.candidates.map((candidate) => candidate.candidateId),
    heartbeatCounts: heartbeatReport.counts,
    dailySweepCounts: dailyReport.counts,
    retention: {
      activeDays: heartbeatReport.retention.active_days,
      archivedDays: heartbeatReport.retention.archived_days,
    },
    lifecycleStatuses: Object.fromEntries(
      lifecycleCandidates.map((candidate) => [candidate.candidateId, candidate.status]),
    ),
    pinnedCandidateId: pinnedCandidate.candidateId,
  };
  check(
    checks,
    "maintenance_loop",
    "maintenance_reports_are_shadow_safe",
    eventMaintenance.report.mode === "shadow_report_only" &&
      heartbeatReport.no_dark_data_scan.passed &&
      dailyReport.no_dark_data_scan.passed,
    "shadow_safe_reports_built",
  );
  check(
    checks,
    "maintenance_loop",
    "maintenance_lifecycle_represented",
    lifecycleCandidates.some((candidate) => candidate.status === "active") &&
      lifecycleCandidates.some((candidate) => candidate.status === "archived") &&
      lifecycleCandidates.some((candidate) => candidate.status === "expired") &&
      lifecycleCandidates.find((candidate) => candidate.candidateId === pinnedCandidate.candidateId)
        ?.status === "active",
    "active_archived_expired_and_pinned_represented",
  );

  const memories = buildLiveShapedMemories(projectId, now);
  const graph = buildRuntimeGraph(memories, { now });
  const graphSummary = summarizeGraph(graph);
  check(
    checks,
    "runtime_graph",
    "runtime_graph_operator_artifact_ready",
    graph.nodes.length > 0 && graph.edges.length > 0 && graph.outputHash.length > 0,
    "graph_ids_and_hashes_present",
  );
  check(
    checks,
    "runtime_graph",
    "runtime_graph_excludes_inspection_only",
    graph.excludedMemoryIds.some((entry) => entry.memoryId === "mem-ui-inspection-only"),
    "inspection_only_excluded",
  );

  const capsuleResult = compileProjectStateCapsule({
    projectId,
    memories,
    graph,
    now,
  });
  const capsuleSummary = summarizeCapsule(capsuleResult.capsule);
  check(
    checks,
    "project_state_capsule",
    "project_state_capsule_compiled",
    capsuleSummary.capsuleId.length > 0 &&
      capsuleSummary.contentHash.length > 0 &&
      capsuleSummary.sectionIds.length > 0,
    "capsule_ids_hashes_sections_present",
  );
  check(
    checks,
    "project_state_capsule",
    "project_state_capsule_labels_soft_and_conflict_material",
    capsuleSummary.lowerAuthorityItemIds.length > 0 &&
      capsuleSummary.conflictSectionItemIds.length > 0,
    "soft_source_and_conflict_sections_represented",
  );

  const selectableCapsule = compileProjectStateCapsule({
    projectId,
    memories: memories.filter((memory) => memory.status !== "conflicted"),
    graph,
    now,
  }).capsule;
  const shadow = buildProjectStateCapsuleRetrievalShadow({
    capsules: [selectableCapsule],
    retrievalPlan: retrievalPlan(projectId),
    projectId,
    shadowModeEnabled: true,
    projectPageProjectionAvailable: true,
  });
  const shadowSummary = summarizeShadow(shadow);
  check(
    checks,
    "capsule_retrieval_shadow",
    "capsule_shadow_would_select_without_default_context_change",
    shadow.telemetry.wouldSelectCapsuleIds.length === 1 &&
      !shadow.telemetry.defaultContextInjectionChanged,
    "capsule_shadow_selected_read_only",
  );

  const disabledContext = buildProjectStateCapsuleContext({
    capsuleRetrievalShadow: shadow,
    mode: "disabled",
    projectPageProjectionAvailable: true,
  });
  const explicitContext = buildProjectStateCapsuleContext({
    capsuleRetrievalShadow: shadow,
    mode: "explicit_injection",
    projectPageProjectionAvailable: true,
  });
  const gatedContextSummary = {
    disabledInjected: false as const,
    explicitInjected: explicitContext.telemetry.injected,
    blockIds: explicitContext.blocks.map((block) => block.contextBlockId).toSorted(),
    packIds: explicitContext.telemetry.injectedPackIds,
    sourceMemoryIds: explicitContext.telemetry.sourceMemoryIds,
    sourceProfileIds: uniqueSortedStrings(
      explicitContext.blocks.flatMap((block) => block.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      explicitContext.blocks.flatMap((block) => block.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: explicitContext.telemetry.contentHashes,
    estimatedTokens: explicitContext.telemetry.estimatedTokens,
    defaultContextInjectionChanged: false as const,
  };
  check(
    checks,
    "gated_capsule_context",
    "capsule_context_requires_explicit_gate",
    !disabledContext.telemetry.injected && explicitContext.telemetry.injected,
    "explicit_gate_required",
  );
  check(
    checks,
    "gated_capsule_context",
    "capsule_context_preserves_provenance",
    gatedContextSummary.sourceMemoryIds.length > 0 &&
      gatedContextSummary.sourceProfileIds.length > 0 &&
      gatedContextSummary.authorityTiers.length > 0 &&
      gatedContextSummary.estimatedTokens > 0,
    "context_provenance_and_budget_present",
  );

  const evalProof = buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId,
    now,
  });
  const integrationProof = evalProof.retrievalIntegrationProof;
  if (!integrationProof) {
    throw new Error("expected Slice 8 retrieval integration proof to be present");
  }
  const hierarchical = integrationProof.trace.lanes.hierarchicalRetrievalShadow;
  const hierarchicalSummary = {
    planId: hierarchical.planId,
    subqueryIds: hierarchical.subqueryIds,
    subqueryCount: hierarchical.telemetry.subqueryCount,
    mergedCandidateIds: hierarchical.mergedCandidateIds,
    exclusionReasons: hierarchical.telemetry.exclusionReasons,
    authorityTiers: hierarchical.telemetry.authorityTiers,
    sourceProfileIds: hierarchical.telemetry.sourceProfileIds,
    graphLaneUsed: hierarchical.telemetry.graphLaneUsed,
    projectionLaneUsed: hierarchical.telemetry.projectionLaneUsed,
    capsuleLaneUsed: hierarchical.telemetry.capsuleLaneUsed,
    defaultRetrievalChanged: false as const,
  };
  check(
    checks,
    "hierarchical_retrieval_shadow",
    "hierarchical_shadow_telemetry_present",
    !hierarchical.telemetry.defaultRetrievalChanged &&
      hierarchical.telemetry.subqueryCount > 0 &&
      hierarchical.telemetry.subqueryCount <= 3 &&
      hierarchical.telemetry.graphLaneUsed &&
      hierarchical.telemetry.projectionLaneUsed &&
      hierarchical.telemetry.capsuleLaneUsed,
    "bounded_shadow_telemetry_present",
  );
  check(
    checks,
    "slice8_integration_proof",
    "slice8_integration_lanes_visible",
    integrationProof.selectedLanes.length === 8 &&
      !integrationProof.defaultRetrievalChanged &&
      !integrationProof.defaultContextInjectionChanged,
    "all_integration_lanes_visible",
  );
  check(
    checks,
    "slice9_eval_proof",
    "slice9_eval_categories_visible",
    evalProof.scenarioResults.length >= 12 &&
      evalProof.noDarkDataValidationStatus === "pass" &&
      !evalProof.defaultRetrievalChanged &&
      !evalProof.defaultContextInjectionChanged,
    "eval_proof_no_dark_data_passed",
  );

  const nonUserPromptIngestion = buildNonUserPromptIngestionSummary(evalProof, now);
  check(
    checks,
    "non_user_prompt_ingestion",
    "tool_grounded_capture_represented",
    nonUserPromptIngestion.toolGrounded.admittedCount > 0 &&
      nonUserPromptIngestion.toolGrounded.sourceProfileId === "tool_result_capture" &&
      nonUserPromptIngestion.toolGrounded.authorityTier === "tool_grounded",
    "tool_grounded_capture_represented",
  );
  check(
    checks,
    "non_user_prompt_ingestion",
    "daily_continuity_and_prohibited_content_policy_represented",
    nonUserPromptIngestion.dailyContinuity.represented &&
      nonUserPromptIngestion.inspectionOnlyExcluded &&
      nonUserPromptIngestion.prohibitedContentRejected,
    "continuity_and_rejection_policy_represented",
  );

  const partialReport = {
    schemaVersion: PHASE2_UI_RUNTIME_PROOF_COVERAGE_SCHEMA_VERSION,
    mode,
    generatedAt: now.toISOString(),
    projectId,
    ...(input.uiEvidence ? { uiEvidence: input.uiEvidence } : {}),
    coverage: {
      maintenanceLoop: maintenanceSummary,
      runtimeGraph: graphSummary,
      projectStateCapsule: capsuleSummary,
      capsuleRetrievalShadow: shadowSummary,
      gatedCapsuleContext: gatedContextSummary,
      hierarchicalRetrievalShadow: hierarchicalSummary,
      slice8IntegrationProof: summarizeIntegrationProof(integrationProof),
      slice9EvalProof: summarizeEvalProof(evalProof),
      nonUserPromptIngestion,
    },
    checks,
    noDarkDataValidationStatus: "pass" as const,
    defaultRetrievalChanged: false as const,
    defaultContextInjectionChanged: false as const,
  };
  const report: Phase2UiRuntimeProofCoverageReport = {
    ...partialReport,
    reportId: buildDerivedArtifactId({
      family: "maintenance_report",
      artifactType: "phase2_ui_runtime_proof_coverage",
      targetId: projectId,
      seed: {
        generatedAt: partialReport.generatedAt,
        checkIds: checks.map((entry) => entry.checkId).toSorted(),
        integrationProofReportId: integrationProof.reportId,
        evalProofReportId: evalProof.reportId,
      },
    }),
    noDarkDataValidationStatus: failCount(checks) === 0 ? "pass" : "fail",
  };
  assertNoDarkData(report);
  return cloneJsonLike(
    report as unknown as JsonLike,
  ) as unknown as Phase2UiRuntimeProofCoverageReport;
}

function summarizeIntegrationProof(proof: Phase2RetrievalIntegrationProofReport) {
  return {
    reportId: proof.reportId,
    traceId: proof.traceId,
    selectedLanes: [...proof.selectedLanes],
    contentHashes: [...proof.contentHashes],
    defaultRetrievalChanged: false as const,
    defaultContextInjectionChanged: false as const,
  };
}

function summarizeEvalProof(proof: Phase2EvalProofReport) {
  return {
    reportId: proof.reportId,
    scenarioCount: proof.scenarioResults.length,
    scenarioTypes: [...proof.scenarioTypes],
    sourceProfileIds: [...proof.sourceProfileIds],
    authorityTiers: [...proof.authorityTiers],
    noDarkDataValidationStatus: proof.noDarkDataValidationStatus,
    retrievalLaneCoverage: [...proof.retrievalLaneCoverage],
    defaultRetrievalChanged: false as const,
    defaultContextInjectionChanged: false as const,
  };
}

export function assertPhase2UiRuntimeProofCoveragePassed(
  report: Phase2UiRuntimeProofCoverageReport,
): void {
  assertNoDarkData(report);
  const failures = report.checks.filter((entry) => entry.status !== "pass");
  if (failures.length > 0 || report.noDarkDataValidationStatus !== "pass") {
    throw new Error(
      `phase2 UI runtime proof coverage failed: ${failures
        .map((failure) => failure.checkId)
        .join(",")}`,
    );
  }
}

export async function writePhase2UiRuntimeProofCoverageArtifact(input: {
  report: Phase2UiRuntimeProofCoverageReport;
  artifactDir: string;
  artifactId?: string;
}): Promise<{ path: string; contentHash: string }> {
  assertPhase2UiRuntimeProofCoveragePassed(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.artifactId ?? input.report.reportId,
    suffix: "phase2-ui-runtime-proof-coverage",
    value: input.report,
    fallbackFileId: "phase2-ui-runtime-proof-coverage",
  });
  return { path: written.path, contentHash: written.contentHash };
}
