import {
  buildDerivedArtifactId,
  cloneJsonLike,
  hashDerivedArtifactValue,
  uniqueSortedDefined,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";

export const PHASE2_PRODUCTION_GATE_SCHEMA_VERSION = "phase2_production_gate.v1" as const;
export const PHASE2_PRODUCTION_GATE_PREREQUISITE_SCHEMA_VERSION =
  "phase2_production_gate_prerequisites.v1" as const;
export const PHASE2_PRODUCTION_GATE_REPORT_SCHEMA_VERSION =
  "phase2_production_gate_report.v1" as const;

export const PHASE2_PRODUCTION_CAPABILITIES = [
  "runtime_graph_reads",
  "project_state_capsule_retrieval",
  "project_state_capsule_context",
  "hierarchical_retrieval",
  "maintenance_candidate_surfacing",
  "soft_source_runtime_ingestion",
  "non_user_prompt_ingestion",
] as const;

export type Phase2ProductionCapability = (typeof PHASE2_PRODUCTION_CAPABILITIES)[number];

export type Phase2ProductionGateMode =
  | "disabled"
  | "shadow_report_only"
  | "explicit_eval"
  | "operator_enabled"
  | "controlled_production";

export type Phase2ProductionGateDecision =
  | "allowed"
  | "denied"
  | "shadow_only"
  | "explicit_operator_required"
  | "proof_required"
  | "blocked_no_dark_data"
  | "blocked_inspection_only"
  | "blocked_conflict"
  | "blocked_stale"
  | "blocked_budget"
  | "blocked_missing_scope"
  | "blocked_missing_authority_metadata";

export type Phase2ProductionGateReasonCode =
  | "disabled_by_policy"
  | "default_shadow_only"
  | "explicit_eval_not_enabled"
  | "explicit_eval_allowed"
  | "operator_override_missing"
  | "operator_enabled_allowed"
  | "controlled_production_allowed"
  | "proof_prerequisites_missing"
  | "proof_prerequisites_failed"
  | "no_dark_data_failed"
  | "inspection_only_not_allowed"
  | "conflict_not_allowed"
  | "stale_not_allowed"
  | "budget_exceeded"
  | "project_scope_required"
  | "source_profile_required"
  | "authority_tier_required"
  | "graph_reads_read_only"
  | "context_injection_not_default"
  | "hierarchical_fanout_not_default"
  | "maintenance_surfacing_operator_report_only"
  | "source_authority_metadata_required"
  | "lower_authority_preserved"
  | "default_retrieval_unchanged"
  | "default_context_injection_unchanged";

export type Phase2ProductionGateRetrievalLane =
  | "object_retrieval"
  | "projection_digest"
  | "runtime_graph"
  | "project_state_capsule"
  | "capsule_retrieval_shadow"
  | "gated_capsule_context"
  | "hierarchical_retrieval_shadow"
  | "retrieval_pack_artifact";

export type Phase2ProductionGateRetrievalIntegrationProofReport = {
  reportId: string;
  traceId: string;
  selectedLanes: Phase2ProductionGateRetrievalLane[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ProductionGateEvalProofReport = {
  reportId: string;
  scenarioIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  retrievalLaneCoverage: Phase2ProductionGateRetrievalLane[];
  proofContentHashes: string[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ProductionGateUiProofReport = {
  reportId: string;
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  checks: Array<{ status: "pass" | "fail" }>;
  coverage: {
    maintenanceLoop?: unknown;
    runtimeGraph?: {
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
    };
    projectStateCapsule?: unknown;
    capsuleRetrievalShadow?: unknown;
    gatedCapsuleContext?: unknown;
    hierarchicalRetrievalShadow?: unknown;
    slice8IntegrationProof: {
      selectedLanes: string[];
    };
    slice9EvalProof: {
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
    };
    nonUserPromptIngestion?: unknown;
  };
};

export type Phase2ProductionGateProofReports = {
  retrievalIntegrationProof?: Phase2ProductionGateRetrievalIntegrationProofReport;
  evalProof?: Phase2ProductionGateEvalProofReport;
  uiRuntimeProof?: Phase2ProductionGateUiProofReport;
};

export type Phase2ProductionGatePrerequisiteReport = {
  schemaVersion: typeof PHASE2_PRODUCTION_GATE_PREREQUISITE_SCHEMA_VERSION;
  reportId: string;
  status: "pass" | "fail";
  missingReports: Array<keyof Phase2ProductionGateProofReports>;
  failedChecks: string[];
  selectedLanes: Phase2ProductionGateRetrievalLane[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  proofReportIds: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ProductionGatePolicy = {
  schemaVersion: typeof PHASE2_PRODUCTION_GATE_SCHEMA_VERSION;
  policyId: string;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  controlledProductionRequiresProof: true;
  operatorEnabledRequiresProof: true;
  requireProjectScope: Phase2ProductionCapability[];
  requireAuthorityMetadata: Phase2ProductionCapability[];
  maxContextTokens: number;
  maxHierarchicalSubqueries: number;
};

export type Phase2ProductionGateBudget = {
  estimatedTokens?: number;
  maxTokens?: number;
  estimatedResults?: number;
  maxResults?: number;
  subqueryCount?: number;
  maxSubqueries?: number;
};

export type Phase2ProductionGateInput = {
  capability: Phase2ProductionCapability;
  requestedMode?: Phase2ProductionGateMode;
  policy?: Phase2ProductionGatePolicy;
  requestPurpose?: string;
  sessionScope?: string;
  projectScope?: string;
  sourceProfileIds?: SourceProfileId[];
  authorityTiers?: SourceAuthorityTier[];
  noDarkDataStatus?: "pass" | "fail";
  freshnessStatus?: "fresh" | "stale";
  staleMarkers?: string[];
  conflictMarkers?: string[];
  inspectionOnlyMarkers?: string[];
  budget?: Phase2ProductionGateBudget;
  explicitEvalEnabled?: boolean;
  explicitOperatorEnabled?: boolean;
  allowConflictAware?: boolean;
  allowInspectionOnly?: boolean;
  contentHashes?: string[];
  proofHashes?: string[];
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  proofReports?: Phase2ProductionGateProofReports;
  now?: Date;
};

export type Phase2ProductionGateTelemetry = {
  gateId: string;
  capability: Phase2ProductionCapability;
  requestedMode: Phase2ProductionGateMode;
  effectiveMode: Phase2ProductionGateMode;
  decision: Phase2ProductionGateDecision;
  reasonCodes: Phase2ProductionGateReasonCode[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  readOnly: boolean;
};

export type Phase2ProductionGateResult = {
  schemaVersion: typeof PHASE2_PRODUCTION_GATE_SCHEMA_VERSION;
  gateId: string;
  capability: Phase2ProductionCapability;
  requestedMode: Phase2ProductionGateMode;
  effectiveMode: Phase2ProductionGateMode;
  decision: Phase2ProductionGateDecision;
  allowed: boolean;
  reasonCodes: Phase2ProductionGateReasonCode[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  prerequisiteReport?: Phase2ProductionGatePrerequisiteReport;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  telemetry: Phase2ProductionGateTelemetry;
};

export type Phase2ProductionGatePolicyReport = {
  schemaVersion: typeof PHASE2_PRODUCTION_GATE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  resultIds: string[];
  capabilities: Phase2ProductionCapability[];
  decisions: Phase2ProductionGateDecision[];
  reasonCodes: Phase2ProductionGateReasonCode[];
  allowedCount: number;
  shadowOnlyCount: number;
  deniedCount: number;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  proofHashes: string[];
  prerequisiteReport?: Phase2ProductionGatePrerequisiteReport;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

const EXPECTED_RETRIEVAL_PROOF_LANES: Phase2ProductionGateRetrievalLane[] = [
  "object_retrieval",
  "projection_digest",
  "runtime_graph",
  "project_state_capsule",
  "capsule_retrieval_shadow",
  "gated_capsule_context",
  "hierarchical_retrieval_shadow",
  "retrieval_pack_artifact",
];

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
        `phase2 production gate contains prohibited field: ${[...path, key].join(".")}`,
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
      throw new Error("phase2 production gate contains prohibited marker content");
    }
  }
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
}

function defaultCapabilityMode(capability: Phase2ProductionCapability): Phase2ProductionGateMode {
  switch (capability) {
    case "runtime_graph_reads":
    case "project_state_capsule_retrieval":
    case "maintenance_candidate_surfacing":
    case "soft_source_runtime_ingestion":
    case "non_user_prompt_ingestion":
      return "shadow_report_only";
    case "project_state_capsule_context":
    case "hierarchical_retrieval":
      return "disabled";
  }
  throw new Error("unknown Phase 2 production capability");
}

export function createDefaultPhase2ProductionGatePolicy(): Phase2ProductionGatePolicy {
  const capabilityModes = Object.fromEntries(
    PHASE2_PRODUCTION_CAPABILITIES.map((capability) => [
      capability,
      defaultCapabilityMode(capability),
    ]),
  ) as Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  return {
    schemaVersion: PHASE2_PRODUCTION_GATE_SCHEMA_VERSION,
    policyId: "phase2-production-gate-default",
    capabilityModes,
    controlledProductionRequiresProof: true,
    operatorEnabledRequiresProof: true,
    requireProjectScope: [
      "runtime_graph_reads",
      "project_state_capsule_retrieval",
      "project_state_capsule_context",
      "hierarchical_retrieval",
    ],
    requireAuthorityMetadata: ["soft_source_runtime_ingestion", "non_user_prompt_ingestion"],
    maxContextTokens: 1_500,
    maxHierarchicalSubqueries: 5,
  };
}

function hasEveryLane(lanes: string[] | undefined): boolean {
  return EXPECTED_RETRIEVAL_PROOF_LANES.every((lane) => lanes?.includes(lane));
}

function checkRetrievalProof(
  report: Phase2ProductionGateRetrievalIntegrationProofReport | undefined,
  failedChecks: string[],
  missingReports: Array<keyof Phase2ProductionGateProofReports>,
): void {
  if (!report) {
    missingReports.push("retrievalIntegrationProof");
    return;
  }
  if (report.defaultRetrievalChanged || report.defaultContextInjectionChanged) {
    failedChecks.push("slice8_default_behavior_changed");
  }
  if (!hasEveryLane(report.selectedLanes)) {
    failedChecks.push("slice8_missing_expected_lanes");
  }
  if (report.sourceProfileIds.length === 0 || report.authorityTiers.length === 0) {
    failedChecks.push("slice8_missing_authority_metadata");
  }
}

function checkEvalProof(
  report: Phase2ProductionGateEvalProofReport | undefined,
  failedChecks: string[],
  missingReports: Array<keyof Phase2ProductionGateProofReports>,
): void {
  if (!report) {
    missingReports.push("evalProof");
    return;
  }
  if (report.noDarkDataValidationStatus !== "pass") {
    failedChecks.push("slice9_no_dark_data_failed");
  }
  if (report.defaultRetrievalChanged || report.defaultContextInjectionChanged) {
    failedChecks.push("slice9_default_behavior_changed");
  }
  if (!hasEveryLane(report.retrievalLaneCoverage)) {
    failedChecks.push("slice9_missing_expected_lanes");
  }
  if (
    !report.sourceProfileIds.includes("tool_result_capture") ||
    !report.sourceProfileIds.includes("daily_continuity")
  ) {
    failedChecks.push("slice9_missing_non_user_prompt_coverage");
  }
}

function checkUiProof(
  report: Phase2ProductionGateUiProofReport | undefined,
  failedChecks: string[],
  missingReports: Array<keyof Phase2ProductionGateProofReports>,
): void {
  if (!report) {
    missingReports.push("uiRuntimeProof");
    return;
  }
  if (report.noDarkDataValidationStatus !== "pass") {
    failedChecks.push("ui_runtime_no_dark_data_failed");
  }
  if (report.defaultRetrievalChanged || report.defaultContextInjectionChanged) {
    failedChecks.push("ui_runtime_default_behavior_changed");
  }
  if (report.checks.some((check) => check.status !== "pass")) {
    failedChecks.push("ui_runtime_checks_failed");
  }
  const coverage = report.coverage;
  if (
    !coverage.maintenanceLoop ||
    !coverage.runtimeGraph ||
    !coverage.projectStateCapsule ||
    !coverage.capsuleRetrievalShadow ||
    !coverage.gatedCapsuleContext ||
    !coverage.hierarchicalRetrievalShadow ||
    !coverage.slice8IntegrationProof ||
    !coverage.slice9EvalProof ||
    !coverage.nonUserPromptIngestion
  ) {
    failedChecks.push("ui_runtime_missing_expected_coverage");
  }
}

export function validatePhase2ProductionGatePrerequisites(
  reports: Phase2ProductionGateProofReports,
): Phase2ProductionGatePrerequisiteReport {
  assertNoDarkData(reports);
  const missingReports: Array<keyof Phase2ProductionGateProofReports> = [];
  const failedChecks: string[] = [];
  checkRetrievalProof(reports.retrievalIntegrationProof, failedChecks, missingReports);
  checkEvalProof(reports.evalProof, failedChecks, missingReports);
  checkUiProof(reports.uiRuntimeProof, failedChecks, missingReports);

  const proofReportIds = uniqueSortedStrings([
    reports.retrievalIntegrationProof?.reportId,
    reports.evalProof?.reportId,
    reports.uiRuntimeProof?.reportId,
  ]);
  const proofHashes = uniqueSortedStrings([
    reports.retrievalIntegrationProof
      ? hashDerivedArtifactValue({
          reportId: reports.retrievalIntegrationProof.reportId,
          traceId: reports.retrievalIntegrationProof.traceId,
          contentHashes: reports.retrievalIntegrationProof.contentHashes,
        })
      : undefined,
    reports.evalProof
      ? hashDerivedArtifactValue({
          reportId: reports.evalProof.reportId,
          proofContentHashes: reports.evalProof.proofContentHashes,
          scenarioIds: reports.evalProof.scenarioIds,
        })
      : undefined,
    reports.uiRuntimeProof
      ? hashDerivedArtifactValue({
          reportId: reports.uiRuntimeProof.reportId,
          checks: reports.uiRuntimeProof.checks,
          noDarkDataValidationStatus: reports.uiRuntimeProof.noDarkDataValidationStatus,
        })
      : undefined,
  ]);
  const selectedLanes = uniqueSortedDefined([
    ...(reports.retrievalIntegrationProof?.selectedLanes ?? []),
    ...(reports.evalProof?.retrievalLaneCoverage ?? []),
    ...((reports.uiRuntimeProof?.coverage.slice8IntegrationProof.selectedLanes as
      | Phase2ProductionGateRetrievalLane[]
      | undefined) ?? []),
  ]);
  const sourceProfileIds = uniqueSortedDefined<SourceProfileId>([
    ...(reports.retrievalIntegrationProof?.sourceProfileIds ?? []),
    ...(reports.evalProof?.sourceProfileIds ?? []),
    ...(reports.uiRuntimeProof?.coverage.slice9EvalProof.sourceProfileIds ?? []),
    ...(reports.uiRuntimeProof?.coverage.runtimeGraph?.sourceProfileIds ?? []),
  ]);
  const authorityTiers = uniqueSortedDefined<SourceAuthorityTier>([
    ...(reports.retrievalIntegrationProof?.authorityTiers ?? []),
    ...(reports.evalProof?.authorityTiers ?? []),
    ...(reports.uiRuntimeProof?.coverage.slice9EvalProof.authorityTiers ?? []),
    ...(reports.uiRuntimeProof?.coverage.runtimeGraph?.authorityTiers ?? []),
  ]);
  const noDarkDataStatus =
    reports.evalProof?.noDarkDataValidationStatus === "pass" &&
    reports.uiRuntimeProof?.noDarkDataValidationStatus === "pass"
      ? "pass"
      : "fail";
  const status =
    missingReports.length === 0 && failedChecks.length === 0 && noDarkDataStatus === "pass"
      ? "pass"
      : "fail";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_production_gate_prerequisites",
    seed: {
      proofReportIds,
      proofHashes,
      missingReports,
      failedChecks,
      status,
    },
  });
  const report: Phase2ProductionGatePrerequisiteReport = {
    schemaVersion: PHASE2_PRODUCTION_GATE_PREREQUISITE_SCHEMA_VERSION,
    reportId,
    status,
    missingReports: [...missingReports].toSorted(),
    failedChecks: uniqueSortedStrings(failedChecks),
    selectedLanes,
    sourceProfileIds,
    authorityTiers,
    proofReportIds,
    proofHashes,
    noDarkDataStatus,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ProductionGatePrerequisiteReport;
}

function requiredProofReport(
  input: Phase2ProductionGateInput,
): Phase2ProductionGatePrerequisiteReport | undefined {
  if (input.proofPrerequisites) {
    assertNoDarkData(input.proofPrerequisites);
    return clone(
      input.proofPrerequisites as unknown as JsonLike,
    ) as unknown as Phase2ProductionGatePrerequisiteReport;
  }
  if (input.proofReports) {
    return validatePhase2ProductionGatePrerequisites(input.proofReports);
  }
  return undefined;
}

function isMissingScope(
  policy: Phase2ProductionGatePolicy,
  input: Phase2ProductionGateInput,
): boolean {
  return policy.requireProjectScope.includes(input.capability) && !input.projectScope;
}

function isMissingAuthorityMetadata(
  policy: Phase2ProductionGatePolicy,
  input: Phase2ProductionGateInput,
): Phase2ProductionGateReasonCode | undefined {
  if (!policy.requireAuthorityMetadata.includes(input.capability)) {
    return undefined;
  }
  if ((input.sourceProfileIds ?? []).length === 0) {
    return "source_profile_required";
  }
  if ((input.authorityTiers ?? []).length === 0) {
    return "authority_tier_required";
  }
  return undefined;
}

function budgetExceeded(
  policy: Phase2ProductionGatePolicy,
  input: Phase2ProductionGateInput,
): boolean {
  const budget = input.budget;
  if (!budget) {
    return false;
  }
  if (
    typeof budget.estimatedTokens === "number" &&
    budget.estimatedTokens > (budget.maxTokens ?? policy.maxContextTokens)
  ) {
    return true;
  }
  if (
    typeof budget.estimatedResults === "number" &&
    typeof budget.maxResults === "number" &&
    budget.estimatedResults > budget.maxResults
  ) {
    return true;
  }
  return (
    typeof budget.subqueryCount === "number" &&
    budget.subqueryCount > (budget.maxSubqueries ?? policy.maxHierarchicalSubqueries)
  );
}

function initialReasonCodes(input: Phase2ProductionGateInput): Phase2ProductionGateReasonCode[] {
  const reasonCodes: Phase2ProductionGateReasonCode[] = [
    "default_retrieval_unchanged",
    "default_context_injection_unchanged",
  ];
  if (input.capability === "runtime_graph_reads") {
    reasonCodes.push("graph_reads_read_only");
  }
  if (input.capability === "project_state_capsule_context") {
    reasonCodes.push("context_injection_not_default");
  }
  if (input.capability === "hierarchical_retrieval") {
    reasonCodes.push("hierarchical_fanout_not_default");
  }
  if (input.capability === "maintenance_candidate_surfacing") {
    reasonCodes.push("maintenance_surfacing_operator_report_only");
  }
  if (
    input.authorityTiers?.some((tier) => tier === "tool_grounded" || tier === "cited_soft") ||
    input.sourceProfileIds?.some((profile) =>
      ["tool_result_capture", "researcher_report_artifact", "cited_assistant_answer"].includes(
        profile,
      ),
    )
  ) {
    reasonCodes.push("lower_authority_preserved");
  }
  if (
    input.capability === "soft_source_runtime_ingestion" ||
    input.capability === "non_user_prompt_ingestion"
  ) {
    reasonCodes.push("source_authority_metadata_required");
  }
  return reasonCodes;
}

function blockedDecision(
  policy: Phase2ProductionGatePolicy,
  input: Phase2ProductionGateInput,
):
  | { decision: Phase2ProductionGateDecision; reasonCode: Phase2ProductionGateReasonCode }
  | undefined {
  if (isMissingScope(policy, input)) {
    return { decision: "blocked_missing_scope", reasonCode: "project_scope_required" };
  }
  const missingAuthority = isMissingAuthorityMetadata(policy, input);
  if (missingAuthority) {
    return { decision: "blocked_missing_authority_metadata", reasonCode: missingAuthority };
  }
  if (input.noDarkDataStatus === "fail") {
    return { decision: "blocked_no_dark_data", reasonCode: "no_dark_data_failed" };
  }
  if (
    !input.allowInspectionOnly &&
    ((input.inspectionOnlyMarkers ?? []).length > 0 ||
      input.authorityTiers?.includes("inspection_only") ||
      input.sourceProfileIds?.some((profile) =>
        ["raw_transcript", "raw_prompt", "raw_tool_log", "secret_or_private_phrase"].includes(
          profile,
        ),
      ))
  ) {
    return { decision: "blocked_inspection_only", reasonCode: "inspection_only_not_allowed" };
  }
  if (!input.allowConflictAware && (input.conflictMarkers ?? []).length > 0) {
    return { decision: "blocked_conflict", reasonCode: "conflict_not_allowed" };
  }
  if (input.freshnessStatus === "stale" || (input.staleMarkers ?? []).length > 0) {
    return { decision: "blocked_stale", reasonCode: "stale_not_allowed" };
  }
  if (budgetExceeded(policy, input)) {
    return { decision: "blocked_budget", reasonCode: "budget_exceeded" };
  }
  return undefined;
}

function decisionForMode(input: {
  mode: Phase2ProductionGateMode;
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  explicitEvalEnabled?: boolean;
  explicitOperatorEnabled?: boolean;
}): { decision: Phase2ProductionGateDecision; reasonCode: Phase2ProductionGateReasonCode } {
  switch (input.mode) {
    case "disabled":
      return { decision: "denied", reasonCode: "disabled_by_policy" };
    case "shadow_report_only":
      return { decision: "shadow_only", reasonCode: "default_shadow_only" };
    case "explicit_eval":
      if (!input.explicitEvalEnabled) {
        return { decision: "denied", reasonCode: "explicit_eval_not_enabled" };
      }
      return { decision: "allowed", reasonCode: "explicit_eval_allowed" };
    case "operator_enabled":
      if (!input.explicitOperatorEnabled) {
        return { decision: "explicit_operator_required", reasonCode: "operator_override_missing" };
      }
      if (!input.proofPrerequisites) {
        return { decision: "proof_required", reasonCode: "proof_prerequisites_missing" };
      }
      if (input.proofPrerequisites.status !== "pass") {
        return { decision: "proof_required", reasonCode: "proof_prerequisites_failed" };
      }
      return { decision: "allowed", reasonCode: "operator_enabled_allowed" };
    case "controlled_production":
      if (!input.proofPrerequisites) {
        return { decision: "proof_required", reasonCode: "proof_prerequisites_missing" };
      }
      if (input.proofPrerequisites.status !== "pass") {
        return { decision: "proof_required", reasonCode: "proof_prerequisites_failed" };
      }
      return { decision: "allowed", reasonCode: "controlled_production_allowed" };
  }
  throw new Error("unknown Phase 2 production gate mode");
}

export function evaluatePhase2ProductionGate(
  input: Phase2ProductionGateInput,
): Phase2ProductionGateResult {
  assertNoDarkData(input);
  const policy = input.policy ?? createDefaultPhase2ProductionGatePolicy();
  const requestedMode = input.requestedMode ?? policy.capabilityModes[input.capability];
  const effectiveMode = requestedMode;
  const sourceProfileIds = uniqueSortedDefined<SourceProfileId>(input.sourceProfileIds ?? []);
  const authorityTiers = uniqueSortedDefined<SourceAuthorityTier>(input.authorityTiers ?? []);
  const proofPrerequisites = requiredProofReport(input);
  const contentHashes = uniqueSortedStrings(input.contentHashes ?? []);
  const proofHashes = uniqueSortedStrings([
    ...(input.proofHashes ?? []),
    ...(proofPrerequisites?.proofHashes ?? []),
  ]);
  const reasonCodes = initialReasonCodes(input);
  const blocked = blockedDecision(policy, input);
  const decisionResult =
    blocked ??
    decisionForMode({
      mode: effectiveMode,
      proofPrerequisites,
      explicitEvalEnabled: input.explicitEvalEnabled,
      explicitOperatorEnabled: input.explicitOperatorEnabled,
    });
  reasonCodes.push(decisionResult.reasonCode);
  const gateId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_production_gate",
    targetId: input.capability,
    scopeKey: input.projectScope,
    seed: {
      requestedMode,
      effectiveMode,
      decision: decisionResult.decision,
      reasonCodes: uniqueSortedStrings(reasonCodes),
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
    },
  });
  const telemetry: Phase2ProductionGateTelemetry = {
    gateId,
    capability: input.capability,
    requestedMode,
    effectiveMode,
    decision: decisionResult.decision,
    reasonCodes: uniqueSortedDefined(reasonCodes),
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    readOnly:
      input.capability === "runtime_graph_reads" ||
      input.capability === "maintenance_candidate_surfacing",
  };
  const result: Phase2ProductionGateResult = {
    schemaVersion: PHASE2_PRODUCTION_GATE_SCHEMA_VERSION,
    gateId,
    capability: input.capability,
    requestedMode,
    effectiveMode,
    decision: decisionResult.decision,
    allowed: decisionResult.decision === "allowed",
    reasonCodes: telemetry.reasonCodes,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    prerequisiteReport: proofPrerequisites,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    telemetry,
  };
  assertNoDarkData(result);
  return clone(result as unknown as JsonLike) as unknown as Phase2ProductionGateResult;
}

export function buildPhase2ProductionGatePolicyReport(input: {
  results: Phase2ProductionGateResult[];
  prerequisiteReport?: Phase2ProductionGatePrerequisiteReport;
  now?: Date;
}): Phase2ProductionGatePolicyReport {
  assertNoDarkData(input);
  const generatedAt = (input.now ?? new Date(0)).toISOString();
  const resultIds = uniqueSortedStrings(input.results.map((result) => result.gateId));
  const decisions = uniqueSortedDefined<Phase2ProductionGateDecision>(
    input.results.map((result) => result.decision),
  );
  const reasonCodes = uniqueSortedDefined<Phase2ProductionGateReasonCode>(
    input.results.flatMap((result) => result.reasonCodes),
  );
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_production_gate_report",
    seed: {
      generatedAt,
      resultIds,
      decisions,
      reasonCodes,
      prerequisiteReportId: input.prerequisiteReport?.reportId,
    },
  });
  const report: Phase2ProductionGatePolicyReport = {
    schemaVersion: PHASE2_PRODUCTION_GATE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    resultIds,
    capabilities: uniqueSortedDefined(input.results.map((result) => result.capability)),
    decisions,
    reasonCodes,
    allowedCount: input.results.filter((result) => result.allowed).length,
    shadowOnlyCount: input.results.filter((result) => result.decision === "shadow_only").length,
    deniedCount: input.results.filter((result) => !result.allowed).length,
    sourceProfileIds: uniqueSortedDefined(
      input.results.flatMap((result) => result.sourceProfileIds),
    ),
    authorityTiers: uniqueSortedDefined(input.results.flatMap((result) => result.authorityTiers)),
    proofHashes: uniqueSortedStrings(input.results.flatMap((result) => result.proofHashes)),
    prerequisiteReport: input.prerequisiteReport,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ProductionGatePolicyReport;
}

export async function writePhase2ProductionGatePolicyReportArtifact(input: {
  report: Phase2ProductionGatePolicyReport;
  artifactDir: string;
}): Promise<{ path: string; contentHash: string; byteLength: number }> {
  assertNoDarkData(input.report);
  return writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: ".phase2-production-gate-report.json",
    value: input.report,
    maxBytes: 128 * 1024,
    fallbackFileId: "phase2-production-gate-report",
  });
}
