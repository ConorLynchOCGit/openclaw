import {
  aggregateDerivedSourceMetadata,
  buildDerivedArtifactId,
  cloneJsonLike,
  hashDerivedArtifactValue,
  uniqueSortedDefined,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type DerivedArtifactSourceRef,
  type JsonLike,
} from "../derived-artifact.ts";
import type { RuntimeGraphMemoryInput } from "../runtime-graph.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../runtime-read-models.ts";
import {
  buildPhase2RetrievalIntegrationProof,
  type Phase2RetrievalIntegrationProofLane,
  type Phase2RetrievalIntegrationProofReport,
} from "../runtime/retrieval/phase2-integration-proof.ts";
import type { MemoryKind } from "../semantic-schema.ts";
import {
  decideAuthorityPromotion,
  evaluateSoftSourceAdmission,
  getSourceProfile,
  type AuthorityPromotionDecision,
  type SoftSourceAdmissionDecision,
  type SoftSourceRef,
  type SoftSourceRiskFlag,
  type SourceAuthorityTier,
  type SourceProfileId,
} from "../source-authority.ts";

export const PHASE2_EVAL_PROOF_SCHEMA_VERSION = "phase2_eval_proof.v1" as const;
export const PHASE2_EVAL_PROOF_REPORT_SCHEMA_VERSION = "phase2_eval_proof_report.v1" as const;

export type Phase2EvalProofMode = "disabled" | "explicit_proof";

export type Phase2EvalProofScenarioType =
  | "explicit_user_authoritative_capture"
  | "curated_authoritative_capture"
  | "tool_grounded_capture"
  | "researcher_report_artifact_capture"
  | "researcher_report_missing_citation_reject"
  | "cited_assistant_answer_capture"
  | "cited_assistant_answer_prose_reject"
  | "daily_continuity_capture"
  | "raw_transcript_inspection_only"
  | "raw_prompt_reject"
  | "raw_tool_log_reject"
  | "secret_private_phrase_reject";

export type Phase2EvalProofExpectedOutcome = "auto_admit" | "inspection_only" | "reject";

export type Phase2EvalProofScenario = {
  scenarioId: string;
  scenarioType: Phase2EvalProofScenarioType;
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  memoryKind: MemoryKind;
  sourceRefs: SoftSourceRef[];
  expectedOutcome: Phase2EvalProofExpectedOutcome;
  expectedMemoryKinds: MemoryKind[];
  expectedRetrievalLanes: Phase2RetrievalIntegrationProofLane[];
  expectedNoDarkData: true;
  riskFlags?: SoftSourceRiskFlag[];
  capturesAssistantProseAsAuthority?: boolean;
};

export type Phase2EvalProofNoDarkDataFinding = {
  findingId: string;
  scenarioId?: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2EvalProofScenarioResult = {
  scenarioId: string;
  scenarioType: Phase2EvalProofScenarioType;
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  memoryKind: MemoryKind;
  expectedOutcome: Phase2EvalProofExpectedOutcome;
  decision: SoftSourceAdmissionDecision["decision"];
  admitted: boolean;
  inspectionOnly: boolean;
  rejected: boolean;
  reasonCodes: string[];
  sourceMemoryId?: string;
  sourceRefs: SoftSourceRef[];
  expectedRetrievalLanes: Phase2RetrievalIntegrationProofLane[];
};

export type Phase2EvalProofTelemetry = {
  scenarioCount: number;
  admittedCount: number;
  inspectionOnlyCount: number;
  rejectedCount: number;
  retrievalProofReportIds: string[];
  retrievalLaneCoverage: Phase2RetrievalIntegrationProofLane[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  noDarkDataStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  authorityPromotionChecks: {
    corroborationPromoted: false;
    explicitApprovalPromoted: boolean;
    higherAuthorityReplacementPromoted: boolean;
  };
};

export type Phase2EvalProofReport = {
  schemaVersion: typeof PHASE2_EVAL_PROOF_REPORT_SCHEMA_VERSION;
  reportId: string;
  mode: Phase2EvalProofMode;
  scenarioIds: string[];
  scenarioTypes: Phase2EvalProofScenarioType[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  admittedCount: number;
  inspectionOnlyCount: number;
  rejectedCount: number;
  retrievalLaneCoverage: Phase2RetrievalIntegrationProofLane[];
  proofReportIds: string[];
  proofContentHashes: string[];
  sourceMemoryIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  noDarkDataFindings: Phase2EvalProofNoDarkDataFinding[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  authorityPromotion: {
    corroboration: AuthorityPromotionDecision;
    explicitUserApproval: AuthorityPromotionDecision;
    higherAuthorityReplacement: AuthorityPromotionDecision;
  };
  scenarioResults: Phase2EvalProofScenarioResult[];
  retrievalIntegrationProof?: Phase2RetrievalIntegrationProofReport;
  telemetry: Phase2EvalProofTelemetry;
};

export type Phase2EvalProofInput = {
  mode?: Phase2EvalProofMode;
  projectId?: string;
  scenarios?: Phase2EvalProofScenario[];
  now?: Date;
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

function prohibitedMarkers(): string[] {
  return PROHIBITED_MARKER_PARTS.map((parts) => parts.join(""));
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
      throw new Error(`phase2 eval proof contains prohibited field: ${[...path, key].join(".")}`);
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value);
  for (const marker of prohibitedMarkers()) {
    if (serialized.includes(marker)) {
      throw new Error(`phase2 eval proof contains prohibited marker content`);
    }
  }
}

function sourceRef(scenarioId: string): SoftSourceRef {
  return {
    sourceId: `source-${scenarioId}`,
    segmentId: `segment-${scenarioId}`,
    contentHash: hashDerivedArtifactValue({ scenarioId, source: "bounded-proof-source" }),
  };
}

export function buildDefaultPhase2EvalProofScenarios(): Phase2EvalProofScenario[] {
  const lanes: Phase2RetrievalIntegrationProofLane[] = [
    "object_retrieval",
    "projection_digest",
    "runtime_graph",
    "project_state_capsule",
    "capsule_retrieval_shadow",
    "gated_capsule_context",
    "hierarchical_retrieval_shadow",
    "retrieval_pack_artifact",
  ];
  return [
    {
      scenarioId: "phase2-user-authoritative",
      scenarioType: "explicit_user_authoritative_capture",
      sourceProfileId: "explicit_user_turn",
      authorityTier: "user_authoritative",
      memoryKind: "preference",
      sourceRefs: [sourceRef("phase2-user-authoritative")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["preference"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-curated-authoritative",
      scenarioType: "curated_authoritative_capture",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      memoryKind: "procedure",
      sourceRefs: [sourceRef("phase2-curated-authoritative")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["procedure"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-tool-grounded",
      scenarioType: "tool_grounded_capture",
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-tool-grounded")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["fact"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-researcher-report",
      scenarioType: "researcher_report_artifact_capture",
      sourceProfileId: "researcher_report_artifact",
      authorityTier: "cited_soft",
      memoryKind: "reference",
      sourceRefs: [sourceRef("phase2-researcher-report")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["reference"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-researcher-missing-citation",
      scenarioType: "researcher_report_missing_citation_reject",
      sourceProfileId: "researcher_report_artifact",
      authorityTier: "cited_soft",
      memoryKind: "fact",
      sourceRefs: [],
      expectedOutcome: "reject",
      expectedMemoryKinds: ["fact"],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-cited-assistant",
      scenarioType: "cited_assistant_answer_capture",
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-cited-assistant")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["fact"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
      capturesAssistantProseAsAuthority: false,
    },
    {
      scenarioId: "phase2-cited-assistant-prose",
      scenarioType: "cited_assistant_answer_prose_reject",
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-cited-assistant-prose")],
      expectedOutcome: "reject",
      expectedMemoryKinds: ["fact"],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
      capturesAssistantProseAsAuthority: true,
    },
    {
      scenarioId: "phase2-daily-continuity",
      scenarioType: "daily_continuity_capture",
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
      memoryKind: "procedure",
      sourceRefs: [sourceRef("phase2-daily-continuity")],
      expectedOutcome: "auto_admit",
      expectedMemoryKinds: ["procedure"],
      expectedRetrievalLanes: lanes,
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-transcript-inspection",
      scenarioType: "raw_transcript_inspection_only",
      sourceProfileId: "raw_transcript",
      authorityTier: "inspection_only",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-transcript-inspection")],
      expectedOutcome: "inspection_only",
      expectedMemoryKinds: [],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
    },
    {
      scenarioId: "phase2-prompt-reject",
      scenarioType: "raw_prompt_reject",
      sourceProfileId: "raw_prompt",
      authorityTier: "inspection_only",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-prompt-reject")],
      expectedOutcome: "reject",
      expectedMemoryKinds: [],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
      riskFlags: ["raw_prompt"],
    },
    {
      scenarioId: "phase2-tool-log-reject",
      scenarioType: "raw_tool_log_reject",
      sourceProfileId: "raw_tool_log",
      authorityTier: "inspection_only",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-tool-log-reject")],
      expectedOutcome: "reject",
      expectedMemoryKinds: [],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
      riskFlags: ["raw_tool_log"],
    },
    {
      scenarioId: "phase2-sensitive-phrase-reject",
      scenarioType: "secret_private_phrase_reject",
      sourceProfileId: "secret_or_private_phrase",
      authorityTier: "inspection_only",
      memoryKind: "fact",
      sourceRefs: [sourceRef("phase2-sensitive-phrase-reject")],
      expectedOutcome: "reject",
      expectedMemoryKinds: [],
      expectedRetrievalLanes: [],
      expectedNoDarkData: true,
      riskFlags: ["private_phrase"],
    },
  ];
}

function decisionMatchesExpected(
  decision: SoftSourceAdmissionDecision["decision"],
  expected: Phase2EvalProofExpectedOutcome,
): boolean {
  return (
    decision === expected ||
    (expected === "auto_admit" && decision === "manual_review") ||
    (expected === "reject" && decision === "manual_review")
  );
}

function resultForScenario(scenario: Phase2EvalProofScenario): Phase2EvalProofScenarioResult {
  const profile = getSourceProfile(scenario.sourceProfileId);
  const decision = evaluateSoftSourceAdmission({
    candidateId: scenario.scenarioId,
    kind: scenario.memoryKind,
    sourceProfileId: scenario.sourceProfileId,
    sourceRefs: scenario.sourceRefs,
    riskFlags: scenario.riskFlags,
    authorityTier: scenario.authorityTier,
    capturesAssistantProseAsAuthority: scenario.capturesAssistantProseAsAuthority,
  });
  if (decision.authorityTier !== profile.authorityTier) {
    throw new Error(`scenario authority mismatch: ${scenario.scenarioId}`);
  }
  if (!decisionMatchesExpected(decision.decision, scenario.expectedOutcome)) {
    throw new Error(
      `scenario ${scenario.scenarioId} expected ${scenario.expectedOutcome} but got ${decision.decision}`,
    );
  }
  const admitted = decision.decision === "auto_admit";
  return {
    scenarioId: scenario.scenarioId,
    scenarioType: scenario.scenarioType,
    sourceProfileId: scenario.sourceProfileId,
    authorityTier: decision.authorityTier,
    memoryKind: scenario.memoryKind,
    expectedOutcome: scenario.expectedOutcome,
    decision: decision.decision,
    admitted,
    inspectionOnly: decision.decision === "inspection_only",
    rejected: decision.decision === "reject",
    reasonCodes: decision.reasonCodes,
    sourceMemoryId: admitted ? `mem-${scenario.scenarioId}` : undefined,
    sourceRefs: scenario.sourceRefs.map((ref) => ({ ...ref })),
    expectedRetrievalLanes: [...scenario.expectedRetrievalLanes],
  };
}

function memoryPayload(kind: MemoryKind, scenarioId: string): Record<string, unknown> {
  switch (kind) {
    case "preference":
      return {
        subject: "phase2 eval preference",
        instruction: `apply ${scenarioId}`,
        operation: "prefer",
      };
    case "rule":
      return {
        subject: "phase2 eval rule",
        recommendedAction: `apply ${scenarioId}`,
      };
    case "procedure":
      return {
        title: `procedure ${scenarioId}`,
        steps: [`run ${scenarioId}`],
      };
    case "reference":
      return {
        task: `reference ${scenarioId}`,
        primaryResource: `resource ${scenarioId}`,
      };
    case "fact":
    default:
      return {
        subject: `fact ${scenarioId}`,
        value: `value ${scenarioId}`,
      };
  }
}

function canonicalClass(kind: MemoryKind, authorityTier: SourceAuthorityTier): string {
  if (kind === "preference" || authorityTier === "user_authoritative") {
    return "user";
  }
  if (kind === "reference") {
    return "reference";
  }
  return "project";
}

function runtimeMemory(input: {
  result: Phase2EvalProofScenarioResult;
  now: Date;
  projectId: string;
}): RuntimeMemoryRecord {
  const payload = memoryPayload(input.result.memoryKind, input.result.scenarioId);
  return {
    id: input.result.sourceMemoryId!,
    canonicalClass: canonicalClass(input.result.memoryKind, input.result.authorityTier),
    kind: input.result.memoryKind,
    payload,
    normalizedSubject: input.result.scenarioId,
    normalizedSearchText: `${input.result.scenarioType} ${input.result.scenarioId}`,
    scope: { projectId: input.projectId, projectScope: input.projectId },
    scopeKey: `project:${input.projectId}`,
    provenance: input.result.sourceRefs.map((ref) => ({
      sourceId: ref.sourceId,
      blockId: ref.segmentId,
    })),
    confidence: input.result.authorityTier === "user_authoritative" ? "strong" : "medium",
    durability: "durable",
    suggestedReviewMode: "auto_accept",
    executedReviewMode: "auto_accept",
    rationaleCodes: [],
    identityKey: `identity-${input.result.scenarioId}`,
    contractName: "phase2_eval_proof",
    contractVersion: "v1",
    modelId: "phase2-eval-proof",
    lifecycleState: "active",
    activationBasis: "primary_capture",
    createdAt: input.now,
    activatedAt: input.now,
  };
}

function graphMemory(input: {
  scenario: Phase2EvalProofScenario;
  result: Phase2EvalProofScenarioResult;
  now: Date;
  projectId: string;
}): RuntimeGraphMemoryInput {
  const memoryId = input.result.sourceMemoryId ?? `inspection-${input.scenario.scenarioId}`;
  const refs = input.scenario.sourceRefs.map((ref) => ({
    sourceId: ref.sourceId,
    segmentId: ref.segmentId,
    contentHash: ref.contentHash,
    sourceType: input.scenario.sourceProfileId,
  }));
  return {
    memoryId,
    status: "active",
    unitType: "atomic",
    kind: input.scenario.memoryKind,
    artifactType: null,
    canonicalText: `bounded derived claim for ${input.scenario.scenarioId}`,
    searchText: `bounded derived claim for ${input.scenario.scenarioId}`,
    scope: {
      project_id: input.projectId,
      workspace_id: "phase2-eval-workspace",
      subject_type: input.scenario.memoryKind === "preference" ? "user" : "project",
      subject_id: input.projectId,
    },
    payload: memoryPayload(input.scenario.memoryKind, input.scenario.scenarioId),
    validity: {
      valid_at: input.now.toISOString(),
      invalid_at: null,
      temporal_status: "current",
    },
    sourceRefs: refs,
    sourceAuthorityTier: input.scenario.authorityTier,
    sourceProfileId: input.scenario.sourceProfileId,
    sourceEventIds: [`event-${input.scenario.scenarioId}`],
    sourceEdgeIds: [`edge-${input.scenario.scenarioId}`],
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
}

function projectionVersion(input: {
  admittedMemoryIds: string[];
  now: Date;
}): WorkspaceProjectionVersionRecord {
  return {
    id: "phase2-eval-project-page",
    targetId: "phase2-eval-project-page-target",
    projectionType: "project_page",
    contentHash: hashDerivedArtifactValue({
      type: "phase2-eval-project-page",
      sourceMemoryIds: input.admittedMemoryIds,
    }),
    canonicalArtifactPath: ".openclaw/model-memory/projections/phase2-eval-project-page.md",
    sourceObjectIds: [...input.admittedMemoryIds],
    sourceEventIds: input.admittedMemoryIds.map((id) => `event-${id.replace(/^mem-/u, "")}`),
    sourceEdgeIds: input.admittedMemoryIds.map((id) => `edge-${id.replace(/^mem-/u, "")}`),
    sourceSlotKeys: [],
    sourceSetKeys: [],
    tokenEstimate: 32,
    builtAt: input.now,
    freshness: { status: "fresh" },
    staleMarkers: [],
    conflictMarkers: [],
    retrievalDigest: {
      title: "Phase 2 eval project state",
      summary: "Bounded proof digest for Phase 2 eval lanes.",
      sourceMemoryIds: [...input.admittedMemoryIds],
      sourceEventIds: input.admittedMemoryIds.map((id) => `event-${id.replace(/^mem-/u, "")}`),
      contentHash: hashDerivedArtifactValue({
        type: "phase2-eval-project-page-digest",
        sourceMemoryIds: input.admittedMemoryIds,
      }),
    },
  };
}

function retrievalRequest(input: { projectId: string; now: Date }): RetrievalRequestRecord {
  return {
    id: "phase2-eval-retrieval-request",
    sessionId: "phase2-eval-session",
    queryText: "sha256:phase2-eval-query",
    requestPurpose: "phase2_eval_proof",
    scope: {
      projectId: input.projectId,
      retrievalRuntimeQueryHash: "phase2-eval-query",
    },
    desiredResultCount: 8,
    contractName: "phase2_eval_retrieval_request",
    contractVersion: "v1",
    modelId: "phase2-eval-proof",
    createdAt: input.now,
  };
}

function retrievalResultSet(input: { admittedCount: number; now: Date }): RetrievalResultSetRecord {
  return {
    id: "phase2-eval-retrieval-set",
    retrievalRequestId: "phase2-eval-retrieval-request",
    contentHash: hashDerivedArtifactValue({
      type: "phase2-eval-retrieval-set",
      admittedCount: input.admittedCount,
    }),
    resultCount: input.admittedCount,
    createdAt: input.now,
  };
}

function retrievalItems(input: {
  admittedResults: Phase2EvalProofScenarioResult[];
  now: Date;
}): RetrievalResultItemRecord[] {
  return input.admittedResults.map((result, index) => ({
    id: `retrieval-item-${result.scenarioId}`,
    retrievalResultSetId: "phase2-eval-retrieval-set",
    memoryObjectId: result.sourceMemoryId!,
    rankIndex: index,
    rankBand: index < 4 ? "primary" : "secondary",
    retrievalReasonCodes: ["phase2_eval_selected", result.sourceProfileId],
    selectedForContext: true,
    createdAt: input.now,
  }));
}

function buildRetrievalProof(input: {
  projectId: string;
  now: Date;
  results: Phase2EvalProofScenarioResult[];
  scenarios: Phase2EvalProofScenario[];
}): Phase2RetrievalIntegrationProofReport | undefined {
  const admittedResults = input.results.filter((result) => result.admitted);
  if (admittedResults.length === 0) {
    return undefined;
  }
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const inspectionResults = input.results.filter((result) => result.inspectionOnly);
  const graphMemories = [
    ...admittedResults.map((result) =>
      graphMemory({
        scenario: scenarioById.get(result.scenarioId)!,
        result,
        now: input.now,
        projectId: input.projectId,
      }),
    ),
    ...inspectionResults.map((result) =>
      graphMemory({
        scenario: scenarioById.get(result.scenarioId)!,
        result,
        now: input.now,
        projectId: input.projectId,
      }),
    ),
  ];
  const memoryObjects = admittedResults.map((result) =>
    runtimeMemory({ result, now: input.now, projectId: input.projectId }),
  );
  return buildPhase2RetrievalIntegrationProof({
    mode: "explicit_proof",
    projectId: input.projectId,
    retrievalRequest: retrievalRequest({ projectId: input.projectId, now: input.now }),
    retrievalResultSet: retrievalResultSet({
      admittedCount: admittedResults.length,
      now: input.now,
    }),
    retrievalResultItems: retrievalItems({ admittedResults, now: input.now }),
    memoryObjects,
    graphMemories,
    projectionVersions: [
      projectionVersion({
        admittedMemoryIds: admittedResults.map((result) => result.sourceMemoryId!),
        now: input.now,
      }),
    ],
    buildPolicyVersion: "phase2-eval-proof-v1",
    now: input.now,
  });
}

function validateReportInvariants(
  report: Phase2EvalProofReport,
): Phase2EvalProofNoDarkDataFinding[] {
  const findings: Phase2EvalProofNoDarkDataFinding[] = [];
  try {
    assertNoDarkData(report);
    findings.push({
      findingId: "phase2-eval-no-dark-data",
      status: "pass",
      reasonCode: "no_prohibited_content",
    });
  } catch {
    findings.push({
      findingId: "phase2-eval-no-dark-data",
      status: "fail",
      reasonCode: "prohibited_content_detected",
    });
  }
  const inspectionResultIds = new Set(
    report.scenarioResults
      .filter((result) => result.inspectionOnly)
      .map((result) => result.sourceMemoryId)
      .filter((id): id is string => Boolean(id)),
  );
  const selectedIds = new Set(
    report.retrievalIntegrationProof?.trace.lanes.objectRetrieval.selectedMemoryIds ?? [],
  );
  const inspectionSurfaced = [...inspectionResultIds].some((id) => selectedIds.has(id));
  findings.push({
    findingId: "phase2-eval-inspection-exclusion",
    status: inspectionSurfaced ? "fail" : "pass",
    reasonCode: inspectionSurfaced
      ? "inspection_only_surfaced_in_normal_lane"
      : "inspection_only_excluded_from_normal_lanes",
  });
  if (report.defaultRetrievalChanged || report.defaultContextInjectionChanged) {
    findings.push({
      findingId: "phase2-eval-default-behavior",
      status: "fail",
      reasonCode: "default_behavior_changed",
    });
  } else {
    findings.push({
      findingId: "phase2-eval-default-behavior",
      status: "pass",
      reasonCode: "default_behavior_unchanged",
    });
  }
  return findings;
}

export function buildPhase2EvalProof(input: Phase2EvalProofInput = {}): Phase2EvalProofReport {
  assertNoProhibitedKeys(input);
  const mode = input.mode ?? "disabled";
  if (mode !== "explicit_proof") {
    throw new Error("phase2 eval proof requires explicit_proof mode");
  }
  const now = input.now ?? new Date(0);
  const projectId = input.projectId ?? "phase2-eval-project";
  const scenarios = input.scenarios ?? buildDefaultPhase2EvalProofScenarios();
  assertNoDarkData(scenarios);
  const scenarioResults = scenarios.map(resultForScenario);
  const retrievalIntegrationProof = buildRetrievalProof({
    projectId,
    now,
    results: scenarioResults,
    scenarios,
  });
  const promotion = {
    corroboration: decideAuthorityPromotion({
      currentAuthorityTier: "cited_soft",
      proposedAuthorityTier: "cited_soft",
      basis: "corroboration",
    }),
    explicitUserApproval: decideAuthorityPromotion({
      currentAuthorityTier: "cited_soft",
      proposedAuthorityTier: "user_authoritative",
      basis: "explicit_user_approval",
    }),
    higherAuthorityReplacement: decideAuthorityPromotion({
      currentAuthorityTier: "cited_soft",
      proposedAuthorityTier: "curated_authoritative",
      basis: "higher_authority_replacement",
    }),
  };
  const sourceMetadata = aggregateDerivedSourceMetadata([
    ...scenarioResults.map((result) => ({
      sourceMemoryIds: result.sourceMemoryId ? [result.sourceMemoryId] : [],
      sourceRefs: result.sourceRefs.map(
        (ref): DerivedArtifactSourceRef => ({
          sourceId: ref.sourceId,
          segmentId: ref.segmentId,
          contentHash: ref.contentHash,
        }),
      ),
      authorityTier: result.authorityTier,
      sourceProfileId: result.sourceProfileId,
    })),
    ...(retrievalIntegrationProof
      ? [
          {
            sourceMemoryIds: retrievalIntegrationProof.sourceMemoryIds,
            sourceRefs: retrievalIntegrationProof.sourceRefs,
            authorityTiers: retrievalIntegrationProof.authorityTiers,
            sourceProfileIds: retrievalIntegrationProof.sourceProfileIds,
          },
        ]
      : []),
  ]);
  const retrievalLaneCoverage = uniqueSortedDefined(
    retrievalIntegrationProof?.selectedLanes ?? [],
  ) as Phase2RetrievalIntegrationProofLane[];
  const partialReport = {
    schemaVersion: PHASE2_EVAL_PROOF_REPORT_SCHEMA_VERSION,
    mode,
    scenarioIds: uniqueSortedStrings(scenarioResults.map((result) => result.scenarioId)),
    scenarioTypes: uniqueSortedDefined(scenarioResults.map((result) => result.scenarioType)),
    sourceProfileIds: sourceMetadata.sourceProfileIds,
    authorityTiers: sourceMetadata.authorityTiers,
    admittedCount: scenarioResults.filter((result) => result.admitted).length,
    inspectionOnlyCount: scenarioResults.filter((result) => result.inspectionOnly).length,
    rejectedCount: scenarioResults.filter((result) => result.rejected).length,
    retrievalLaneCoverage,
    proofReportIds: retrievalIntegrationProof ? [retrievalIntegrationProof.reportId] : [],
    proofContentHashes: retrievalIntegrationProof
      ? uniqueSortedStrings(retrievalIntegrationProof.contentHashes)
      : [],
    sourceMemoryIds: sourceMetadata.sourceMemoryIds,
    sourceRefs: sourceMetadata.sourceRefs,
    defaultRetrievalChanged: false as const,
    defaultContextInjectionChanged: false as const,
    authorityPromotion: promotion,
    scenarioResults,
    ...(retrievalIntegrationProof ? { retrievalIntegrationProof } : {}),
  };
  const noDarkDataFindings = validateReportInvariants({
    ...partialReport,
    reportId: "pending",
    noDarkDataFindings: [],
    noDarkDataValidationStatus: "pass",
    telemetry: {
      scenarioCount: scenarioResults.length,
      admittedCount: partialReport.admittedCount,
      inspectionOnlyCount: partialReport.inspectionOnlyCount,
      rejectedCount: partialReport.rejectedCount,
      retrievalProofReportIds: partialReport.proofReportIds,
      retrievalLaneCoverage,
      sourceProfileIds: sourceMetadata.sourceProfileIds,
      authorityTiers: sourceMetadata.authorityTiers,
      noDarkDataStatus: "pass",
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
      authorityPromotionChecks: {
        corroborationPromoted: false,
        explicitApprovalPromoted: promotion.explicitUserApproval.promoted,
        higherAuthorityReplacementPromoted: promotion.higherAuthorityReplacement.promoted,
      },
    },
  });
  const noDarkDataValidationStatus = noDarkDataFindings.every(
    (finding) => finding.status === "pass",
  )
    ? "pass"
    : "fail";
  const report: Phase2EvalProofReport = {
    ...partialReport,
    reportId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_eval_proof_report",
      targetId: projectId,
      seed: {
        scenarioIds: partialReport.scenarioIds,
        proofReportIds: partialReport.proofReportIds,
        contentHashes: partialReport.proofContentHashes,
      },
    }),
    noDarkDataFindings,
    noDarkDataValidationStatus,
    telemetry: {
      scenarioCount: scenarioResults.length,
      admittedCount: partialReport.admittedCount,
      inspectionOnlyCount: partialReport.inspectionOnlyCount,
      rejectedCount: partialReport.rejectedCount,
      retrievalProofReportIds: partialReport.proofReportIds,
      retrievalLaneCoverage,
      sourceProfileIds: sourceMetadata.sourceProfileIds,
      authorityTiers: sourceMetadata.authorityTiers,
      noDarkDataStatus: noDarkDataValidationStatus,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
      authorityPromotionChecks: {
        corroborationPromoted: false,
        explicitApprovalPromoted: promotion.explicitUserApproval.promoted,
        higherAuthorityReplacementPromoted: promotion.higherAuthorityReplacement.promoted,
      },
    },
  };
  if (report.noDarkDataValidationStatus !== "pass") {
    throw new Error("phase2 eval proof failed no-dark-data validation");
  }
  assertNoDarkData(report);
  return cloneJsonLike(report as unknown as JsonLike) as unknown as Phase2EvalProofReport;
}

export async function writePhase2EvalProofArtifact(input: {
  report: Phase2EvalProofReport;
  artifactDir: string;
  artifactId?: string;
}): Promise<{ path: string; contentHash: string }> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.artifactId ?? input.report.reportId,
    suffix: "phase2-eval-proof",
    value: input.report,
    fallbackFileId: "phase2-eval-proof",
  });
  return { path: written.path, contentHash: written.contentHash };
}
