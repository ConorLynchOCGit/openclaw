import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  cloneJsonLike,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  type JsonLike,
} from "../derived-artifact.ts";
import type { RuntimeGraphMemoryInput } from "../runtime-graph.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeCompatibleMemoryRecord,
} from "../runtime-read-models.ts";
import { buildRetrievalPackArtifact } from "../runtime/context/retrieval-packs.ts";
import {
  buildPhase2ControlledRetrievalPack,
  type Phase2ControlledRetrievalPackResult,
} from "../runtime/retrieval/phase2-controlled-retrieval-packs.ts";
import { validatePhase2ProductionGatePrerequisites } from "../runtime/retrieval/phase2-production-gates.ts";
import type { Phase2ProductionGatePrerequisiteReport } from "../runtime/retrieval/phase2-production-gates.ts";
import {
  resolvePhase2RolloutOptions,
  type Phase2RolloutResolvedOptions,
} from "../runtime/retrieval/phase2-rollout-config.ts";
import type { RetrievalPlan } from "../runtime/retrieval/types.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import { buildPhase2EvalProof } from "./phase2-eval-proof.ts";
import { buildPhase2UiRuntimeProofCoverage } from "./phase2-ui-runtime-proof-coverage.ts";

export const PHASE2_CONTROLLED_CONFIG_UI_PROOF_SCHEMA_VERSION =
  "phase2_controlled_config_ui_proof.v1" as const;

export type Phase2ControlledConfigUiProofCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledConfigUiProofEvidence = {
  sessionKey?: string;
  proofMarker?: string;
  runId?: string | null;
  terminalEvidence?: boolean;
  assistantTextSha256?: string;
  artifactPath?: string;
};

export type Phase2ControlledConfigUiProofTelemetry = {
  rolloutConfigId: string;
  rolloutConfigHash: string;
  effectiveCapabilityModes: Record<string, string>;
  proofPrerequisiteReportId: string;
  proofPrerequisiteStatus: "pass" | "fail";
  gateIds: string[];
  gateDecisions: string[];
  gateReasonCodes: string[];
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ControlledConfigUiProofReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_CONFIG_UI_PROOF_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  proofRunId: string;
  projectId: string;
  markers: string[];
  uiEvidence?: Phase2ControlledConfigUiProofEvidence;
  rollout: {
    configId: string;
    configHash: string;
    source: string;
    enabled: boolean;
    effectiveCapabilityModes: Record<string, string>;
    proofStatus: "pass" | "fail" | "missing";
    noDarkDataStatus: "pass" | "fail";
  };
  proofPrerequisites: {
    reportId: string;
    status: "pass" | "fail";
    selectedLanes: string[];
    proofReportIds: string[];
    proofHashes: string[];
  };
  controlledRetrieval: {
    resultId: string;
    mode: string;
    gateIds: string[];
    gateDecisions: string[];
    gateReasonCodes: string[];
    selectedArtifactIds: string[];
    excludedArtifactIds: string[];
    runtimeGraphReadOnly: boolean;
    runtimeGraphSemanticTruth: false;
    graphNodeIds: string[];
    graphEdgeIds: string[];
    capsulePackIds: string[];
    capsuleCandidateIds: string[];
    capsuleContextBlockIds: string[];
    capsuleContextInjected: boolean;
    lowerAuthorityVisible: boolean;
    inspectionOnlyExcluded: boolean;
  };
  defaultOff: {
    rolloutEnabled: boolean;
    controlledPackMode: string;
    selectedArtifactIds: string[];
    defaultRetrievalChanged: false;
    defaultContextInjectionChanged: false;
    retrievalPackHasControlledPayload: boolean;
  };
  blockedCases: {
    staleBlocked: boolean;
    conflictBlocked: boolean;
    conflictAwareAllowed: boolean;
  };
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  checks: Phase2ControlledConfigUiProofCheck[];
  telemetry: Phase2ControlledConfigUiProofTelemetry;
};

export type Phase2ControlledConfigUiProofInput = {
  projectId?: string;
  proofRunId?: string;
  markers?: string[];
  now?: Date;
  uiEvidence?: Phase2ControlledConfigUiProofEvidence;
};

export type Phase2ControlledConfigUiProofArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
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

function assertNoProhibitedKeys(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 controlled config proof contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...pathParts, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 controlled config proof contains prohibited marker content");
    }
  }
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
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
  projectId: string;
  memoryId: string;
  authorityTier: SourceAuthorityTier;
  sourceProfileId: SourceProfileId;
  status?: RuntimeGraphMemoryInput["status"];
  canonicalText: string;
  lineage?: RuntimeGraphMemoryInput["lineage"];
  invalidAt?: string | null;
  claimType?: string;
  now: Date;
}): RuntimeGraphMemoryInput {
  return {
    memoryId: input.memoryId,
    status: input.status ?? "active",
    unitType: "atomic",
    kind: "fact",
    artifactType: null,
    canonicalText: input.canonicalText,
    searchText: input.canonicalText,
    scope: { projectId: input.projectId, project_id: input.projectId },
    payload: {
      payload_type: "claim",
      claim_type: input.claimType ?? "current_state",
    },
    validity: {
      valid_at: input.now.toISOString(),
      invalid_at: input.invalidAt ?? null,
      temporal_status: input.status === "stale" ? "stale" : "current",
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

function proofMemories(projectId: string, marker: string, now: Date): RuntimeGraphMemoryInput[] {
  return [
    graphMemory({
      projectId,
      memoryId: "controlled-config-authoritative",
      authorityTier: "user_authoritative",
      sourceProfileId: "explicit_user_turn",
      canonicalText: `Controlled config proof current state is ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "controlled-config-soft",
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      canonicalText: `Controlled config proof lower-authority tool evidence is ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "controlled-config-inspection",
      authorityTier: "inspection_only",
      sourceProfileId: "raw_transcript",
      canonicalText: "Inspection-only material for exclusion proof.",
      now,
    }),
  ];
}

function retrievalPlan(projectId: string): RetrievalPlan {
  return {
    planId: "phase2-controlled-config-ui-proof-plan",
    schemaVersion: "retrieval_plan.v1",
    intent: "phase2_controlled_config_ui_proof",
    corpora: ["project", "projections"],
    packTypes: ["project_state_pack", "projection_digest_pack"],
    queries: [
      {
        queryHash: "phase2-controlled-config-ui-proof-query",
        redactedLabel: "sha256:phase2-controlled-config-ui-proof-query",
        indexes: ["fielded", "graph", "projection_digest"],
        filters: { projectId },
      },
    ],
    budget: {
      maxTokensTotal: 1_200,
      hardDirectives: 0,
      userProfile: 0,
      projectState: 700,
      procedures: 100,
      sourceRefs: 100,
      episodes: 0,
      conflicts: 100,
      projections: 200,
    },
  };
}

function proofPrerequisites(projectId: string, now: Date): Phase2ProductionGatePrerequisiteReport {
  const evalProof = buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId,
    now,
  });
  if (!evalProof.retrievalIntegrationProof) {
    throw new Error("expected eval proof to include retrieval integration proof");
  }
  return validatePhase2ProductionGatePrerequisites({
    retrievalIntegrationProof: evalProof.retrievalIntegrationProof,
    evalProof,
    uiRuntimeProof: buildPhase2UiRuntimeProofCoverage({
      mode: "explicit_operator_proof",
      projectId,
      now,
    }),
  });
}

function retrievalRequest(projectId: string, now: Date): RetrievalRequestRecord {
  return {
    id: "controlled-config-proof-request",
    sessionId: "controlled-config-proof-session",
    queryText: "sha256:controlled-config-proof-query",
    requestPurpose: "context_injection",
    scope: { projectId, retrievalRuntimeQueryHash: "controlled-config-proof-query" },
    desiredResultCount: 1,
    contractName: "retrieval_request_interpretation",
    contractVersion: "v1",
    modelId: "retrieval-model",
    createdAt: now,
  };
}

function retrievalResultSet(now: Date): RetrievalResultSetRecord {
  return {
    id: "controlled-config-proof-set",
    retrievalRequestId: "controlled-config-proof-request",
    contentHash: "hash-controlled-config-proof",
    resultCount: 1,
    createdAt: now,
  };
}

function retrievalResultItems(now: Date): RetrievalResultItemRecord[] {
  return [
    {
      id: "controlled-config-proof-item",
      retrievalResultSetId: "controlled-config-proof-set",
      memoryObjectId: "controlled-config-proof-object",
      rankIndex: 0,
      rankBand: "primary",
      retrievalReasonCodes: ["scope_match", "rerank_selected"],
      selectedForContext: true,
      createdAt: now,
    },
  ];
}

function memoryObjects(
  projectId: string,
  marker: string,
  now: Date,
): RuntimeCompatibleMemoryRecord[] {
  return [
    {
      id: "controlled-config-proof-object",
      canonicalClass: "project",
      kind: "fact",
      payload: { subject: "phase2 controlled config proof", value: marker },
      normalizedSearchText: `phase2 controlled config proof ${marker}`,
      scope: { projectId },
      provenance: [{ sourceId: "source-controlled-config-proof-object" }],
      confidence: "strong",
      durability: "durable",
      suggestedReviewMode: "auto_accept",
      executedReviewMode: "auto_accept",
      rationaleCodes: [],
      identityKey: "controlled-config-proof-object",
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-memory",
      createdAt: now,
    },
  ];
}

function addCheck(
  checks: Phase2ControlledConfigUiProofCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({
    checkId,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function gateReasonCodes(result: Phase2ControlledRetrievalPackResult): string[] {
  return uniqueSortedStrings(result.telemetry.gateResults.flatMap((gate) => gate.reasonCodes));
}

function gateDecisions(result: Phase2ControlledRetrievalPackResult): string[] {
  return uniqueSortedStrings(result.telemetry.gateResults.map((gate) => gate.decision));
}

function gateIds(result: Phase2ControlledRetrievalPackResult): string[] {
  return uniqueSortedStrings(result.telemetry.gateResults.map((gate) => gate.gateId));
}

function buildControlledResult(input: {
  projectId: string;
  now: Date;
  marker: string;
  prerequisites: Phase2ProductionGatePrerequisiteReport;
  conflictAware?: boolean;
  memories?: RuntimeGraphMemoryInput[];
}): {
  resolved: Phase2RolloutResolvedOptions;
  result: Phase2ControlledRetrievalPackResult;
} {
  const resolved = resolvePhase2RolloutOptions({
    projectId: input.projectId,
    requestScope: { projectId: input.projectId },
    sourceProfileIds: ["explicit_user_turn", "tool_result_capture"],
    authorityTiers: ["user_authoritative", "tool_grounded"],
    proofPrerequisites: input.prerequisites,
    config: {
      source: "explicit_config",
      enabled: true,
      allowConflictAware: input.conflictAware ?? false,
      capabilityModes: {
        runtime_graph_reads: "controlled_production",
        project_state_capsule_retrieval: "controlled_production",
        project_state_capsule_context: "controlled_production",
      },
    },
  });
  const result = buildPhase2ControlledRetrievalPack({
    ...resolved.controlledRetrievalInput,
    projectId: input.projectId,
    requestScope: { projectId: input.projectId },
    retrievalPlan: retrievalPlan(input.projectId),
    graphMemories: input.memories ?? proofMemories(input.projectId, input.marker, input.now),
    projectPageProjectionAvailable: true,
    now: input.now,
  });
  return { resolved, result };
}

export function buildPhase2ControlledConfigUiProof(
  input: Phase2ControlledConfigUiProofInput = {},
): Phase2ControlledConfigUiProofReport {
  assertNoDarkData(input);
  const now = input.now ?? new Date(0);
  const projectId = input.projectId ?? "phase2-controlled-config-proof-project";
  const marker = input.markers?.[0] ?? "PHASE2-CONTROLLED-CONFIG-PROOF";
  const markers = input.markers ?? [marker];
  const proofRunId =
    input.proofRunId ??
    buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_controlled_config_ui_proof_run",
      targetId: projectId,
      seed: { markers, generatedAt: now.toISOString() },
    });
  const prerequisites = proofPrerequisites(projectId, now);
  const { resolved, result } = buildControlledResult({
    projectId,
    now,
    marker,
    prerequisites,
  });
  const defaultResolved = resolvePhase2RolloutOptions({ projectId });
  const defaultResult = buildPhase2ControlledRetrievalPack({
    ...defaultResolved.controlledRetrievalInput,
    projectId,
    requestScope: { projectId },
    retrievalPlan: retrievalPlan(projectId),
    graphMemories: proofMemories(projectId, marker, now),
    now,
  });
  const defaultArtifact = buildRetrievalPackArtifact({
    retrievalRequest: retrievalRequest(projectId, now),
    retrievalResultSet: retrievalResultSet(now),
    retrievalResultItems: retrievalResultItems(now),
    memoryObjects: memoryObjects(projectId, marker, now),
    buildPolicyVersion: "phase2-controlled-config-ui-proof",
  });
  const stale = buildControlledResult({
    projectId,
    now,
    marker,
    prerequisites,
    memories: [
      ...proofMemories(projectId, marker, now),
      graphMemory({
        projectId,
        memoryId: "controlled-config-stale",
        authorityTier: "curated_authoritative",
        sourceProfileId: "curated_repo_doc",
        status: "stale",
        canonicalText: "Stale controlled config proof material.",
        invalidAt: new Date(now.getTime() - 1_000).toISOString(),
        now,
      }),
    ],
  }).result;
  const conflictedMemories = [
    ...proofMemories(projectId, marker, now),
    graphMemory({
      projectId,
      memoryId: "controlled-config-conflicted",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      status: "conflicted",
      canonicalText: "Conflicted controlled config proof material.",
      lineage: { conflictsWithMemoryIds: ["controlled-config-authoritative"] },
      now,
    }),
  ];
  const conflictBlocked = buildControlledResult({
    projectId,
    now,
    marker,
    prerequisites,
    memories: conflictedMemories,
  }).result;
  const conflictAware = buildControlledResult({
    projectId,
    now,
    marker,
    prerequisites,
    conflictAware: true,
    memories: conflictedMemories,
  }).result;
  const gateIdsValue = gateIds(result);
  const gateDecisionsValue = gateDecisions(result);
  const gateReasonCodesValue = gateReasonCodes(result);
  const capsulePackIds = result.capsuleRetrievalShadow?.packs.map((pack) => pack.packId) ?? [];
  const capsuleCandidateIds =
    result.capsuleRetrievalShadow?.candidates.map((candidate) => candidate.candidateId) ?? [];
  const capsuleContextBlockIds =
    result.capsuleContext?.blocks.map((block) => block.contextBlockId) ?? [];
  const capsuleContextText = result.capsuleContext?.renderedText ?? "";
  const lowerAuthorityVisible = capsuleContextText.includes("label:lower_authority");
  const inspectionOnlyExcluded =
    !(result.runtimeGraph?.sourceMemoryIds.includes("controlled-config-inspection") ?? false) &&
    !(
      result.capsuleRetrievalShadow?.packs.some((pack) =>
        pack.sourceMemoryIds.includes("controlled-config-inspection"),
      ) ?? false
    ) &&
    !capsuleContextText.includes("controlled-config-inspection");
  const checks: Phase2ControlledConfigUiProofCheck[] = [];
  addCheck(
    checks,
    "proof_prerequisites_pass",
    prerequisites.status === "pass",
    "proof_prerequisites_required",
  );
  addCheck(
    checks,
    "rollout_enabled_only_explicit",
    resolved.enabled && !defaultResolved.enabled,
    "explicit_rollout_required",
  );
  addCheck(
    checks,
    "controlled_modes_resolved",
    resolved.phase2CapabilityModes.project_state_capsule_context === "controlled_production",
    "controlled_modes_required",
  );
  addCheck(
    checks,
    "graph_read_allowed",
    Boolean(result.runtimeGraph?.readOnly),
    "graph_read_required",
  );
  addCheck(
    checks,
    "graph_not_truth",
    result.runtimeGraph?.semanticTruth === false,
    "graph_read_only",
  );
  addCheck(
    checks,
    "capsule_retrieval_allowed",
    capsulePackIds.length > 0 && capsuleCandidateIds.length > 0,
    "capsule_pack_required",
  );
  addCheck(
    checks,
    "capsule_context_gated",
    capsuleContextBlockIds.length > 0,
    "capsule_context_required",
  );
  addCheck(
    checks,
    "lower_authority_visible",
    lowerAuthorityVisible,
    "lower_authority_label_required",
  );
  addCheck(checks, "inspection_only_excluded", inspectionOnlyExcluded, "inspection_only_excluded");
  addCheck(
    checks,
    "stale_blocks_context",
    gateDecisions(stale).includes("blocked_stale"),
    "stale_block_required",
  );
  addCheck(
    checks,
    "conflict_blocks_context",
    gateDecisions(conflictBlocked).includes("blocked_conflict"),
    "conflict_block_required",
  );
  addCheck(
    checks,
    "conflict_aware_allows_context",
    (conflictAware.capsuleContext?.blocks.length ?? 0) > 0,
    "conflict_aware_required",
  );
  addCheck(checks, "default_rollout_off", !defaultResolved.enabled, "default_rollout_off");
  addCheck(
    checks,
    "default_pack_no_controlled_payload",
    !defaultArtifact.structuredPayload?.phase2ControlledRetrieval,
    "default_pack_unchanged",
  );
  addCheck(
    checks,
    "no_dark_data_pass",
    resolved.telemetry.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );

  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_controlled_config_ui_proof",
    targetId: projectId,
    seed: {
      proofRunId,
      markerHashes: markers.map((value) => hashDerivedArtifactValue(value)),
      rolloutConfigId: resolved.configId,
      controlledResultId: result.resultId,
      checks: checks.map((check) => [check.checkId, check.status]),
    },
  });
  const report: Phase2ControlledConfigUiProofReport = {
    schemaVersion: PHASE2_CONTROLLED_CONFIG_UI_PROOF_SCHEMA_VERSION,
    reportId,
    generatedAt: now.toISOString(),
    proofRunId,
    projectId,
    markers,
    uiEvidence: input.uiEvidence,
    rollout: {
      configId: resolved.configId,
      configHash: resolved.configHash,
      source: resolved.source,
      enabled: resolved.enabled,
      effectiveCapabilityModes: resolved.phase2CapabilityModes,
      proofStatus: resolved.telemetry.proofStatus,
      noDarkDataStatus: resolved.telemetry.noDarkDataStatus,
    },
    proofPrerequisites: {
      reportId: prerequisites.reportId,
      status: prerequisites.status,
      selectedLanes: [...prerequisites.selectedLanes],
      proofReportIds: [...prerequisites.proofReportIds],
      proofHashes: [...prerequisites.proofHashes],
    },
    controlledRetrieval: {
      resultId: result.resultId,
      mode: result.mode,
      gateIds: gateIdsValue,
      gateDecisions: gateDecisionsValue,
      gateReasonCodes: gateReasonCodesValue,
      selectedArtifactIds: [...result.telemetry.selectedArtifactIds],
      excludedArtifactIds: [...result.telemetry.excludedArtifactIds],
      runtimeGraphReadOnly: result.runtimeGraph?.readOnly ?? false,
      runtimeGraphSemanticTruth: false,
      graphNodeIds: result.runtimeGraph?.nodeIds ?? [],
      graphEdgeIds: result.runtimeGraph?.edgeIds ?? [],
      capsulePackIds,
      capsuleCandidateIds,
      capsuleContextBlockIds,
      capsuleContextInjected: capsuleContextBlockIds.length > 0,
      lowerAuthorityVisible,
      inspectionOnlyExcluded,
    },
    defaultOff: {
      rolloutEnabled: defaultResolved.enabled,
      controlledPackMode: defaultResult.mode,
      selectedArtifactIds: [...defaultResult.telemetry.selectedArtifactIds],
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
      retrievalPackHasControlledPayload: Boolean(
        defaultArtifact.structuredPayload?.phase2ControlledRetrieval,
      ),
    },
    blockedCases: {
      staleBlocked: gateDecisions(stale).includes("blocked_stale"),
      conflictBlocked: gateDecisions(conflictBlocked).includes("blocked_conflict"),
      conflictAwareAllowed: (conflictAware.capsuleContext?.blocks.length ?? 0) > 0,
    },
    sourceMemoryIds: [...result.telemetry.sourceMemoryIds],
    sourceProfileIds: result.telemetry.sourceProfileIds as SourceProfileId[],
    authorityTiers: result.telemetry.authorityTiers as SourceAuthorityTier[],
    contentHashes: [...result.telemetry.contentHashes],
    proofHashes: [...result.telemetry.proofHashes],
    noDarkDataValidationStatus: resolved.telemetry.noDarkDataStatus,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    checks,
    telemetry: {
      rolloutConfigId: resolved.configId,
      rolloutConfigHash: resolved.configHash,
      effectiveCapabilityModes: resolved.phase2CapabilityModes,
      proofPrerequisiteReportId: prerequisites.reportId,
      proofPrerequisiteStatus: prerequisites.status,
      gateIds: gateIdsValue,
      gateDecisions: gateDecisionsValue,
      gateReasonCodes: gateReasonCodesValue,
      selectedArtifactIds: [...result.telemetry.selectedArtifactIds],
      excludedArtifactIds: [...result.telemetry.excludedArtifactIds],
      sourceMemoryIds: [...result.telemetry.sourceMemoryIds],
      sourceProfileIds: result.telemetry.sourceProfileIds as SourceProfileId[],
      authorityTiers: result.telemetry.authorityTiers as SourceAuthorityTier[],
      contentHashes: [...result.telemetry.contentHashes],
      proofHashes: [...result.telemetry.proofHashes],
      noDarkDataValidationStatus: resolved.telemetry.noDarkDataStatus,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    },
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ControlledConfigUiProofReport;
}

export function assertPhase2ControlledConfigUiProofPassed(
  report: Phase2ControlledConfigUiProofReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (failed.length > 0) {
    throw new Error(
      `phase2 controlled config UI proof failed: ${failed
        .map((check) => `${check.checkId}:${check.reasonCode}`)
        .join(", ")}`,
    );
  }
}

function markdownReport(report: Phase2ControlledConfigUiProofReport, jsonPath: string): string {
  return [
    "# Phase 2 Controlled Config UI Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- proof_run_id: ${report.proofRunId}`,
    `- project_id: ${report.projectId}`,
    `- rollout_config_id: ${report.rollout.configId}`,
    `- rollout_config_hash: ${report.rollout.configHash}`,
    `- proof_prerequisite_report_id: ${report.proofPrerequisites.reportId}`,
    `- proof_prerequisite_status: ${report.proofPrerequisites.status}`,
    `- no_dark_data: ${report.noDarkDataValidationStatus}`,
    `- default_retrieval_changed: ${report.defaultRetrievalChanged}`,
    `- default_context_injection_changed: ${report.defaultContextInjectionChanged}`,
    `- checks: ${report.checks.length}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
    "",
    "## Controlled Capabilities",
    "",
    `- runtime_graph_reads: ${report.rollout.effectiveCapabilityModes.runtime_graph_reads}`,
    `- project_state_capsule_retrieval: ${report.rollout.effectiveCapabilityModes.project_state_capsule_retrieval}`,
    `- project_state_capsule_context: ${report.rollout.effectiveCapabilityModes.project_state_capsule_context}`,
    `- graph_nodes: ${report.controlledRetrieval.graphNodeIds.length}`,
    `- graph_edges: ${report.controlledRetrieval.graphEdgeIds.length}`,
    `- capsule_packs: ${report.controlledRetrieval.capsulePackIds.length}`,
    `- capsule_context_blocks: ${report.controlledRetrieval.capsuleContextBlockIds.length}`,
    "",
    "## Default-Off",
    "",
    `- default_rollout_enabled: ${report.defaultOff.rolloutEnabled}`,
    `- default_pack_has_controlled_payload: ${report.defaultOff.retrievalPackHasControlledPayload}`,
  ].join("\n");
}

export async function writePhase2ControlledConfigUiProofArtifact(input: {
  report: Phase2ControlledConfigUiProofReport;
  artifactDir: string;
}): Promise<Phase2ControlledConfigUiProofArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const jsonPath = path.join(input.artifactDir, "report.json");
  const markdownPath = path.join(input.artifactDir, "report.md");
  const json = `${JSON.stringify(input.report, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > 256 * 1024) {
    throw new Error("phase2 controlled config UI proof report exceeds byte limit");
  }
  const markdown = `${markdownReport(input.report, jsonPath)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 64 * 1024) {
    throw new Error("phase2 controlled config UI proof markdown exceeds byte limit");
  }
  await fs.writeFile(jsonPath, json, "utf8");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ json, markdown }),
    byteLength: Buffer.byteLength(json, "utf8") + Buffer.byteLength(markdown, "utf8"),
  };
}
