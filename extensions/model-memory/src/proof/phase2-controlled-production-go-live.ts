import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import type { Phase2RetrievalIntegrationProofReport } from "../runtime/retrieval/phase2-integration-proof.ts";
import {
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
} from "../runtime/retrieval/phase2-production-gates.ts";
import {
  buildPhase2RolloutReport,
  resolvePhase2RolloutOptions,
  type Phase2RolloutReport,
  type Phase2RolloutResolvedOptions,
} from "../runtime/retrieval/phase2-rollout-config.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  PHASE2_CONTROLLED_CONFIG_UI_PROOF_SCHEMA_VERSION,
  assertPhase2ControlledConfigUiProofPassed,
  type Phase2ControlledConfigUiProofReport,
} from "./phase2-controlled-config-ui-proof.ts";
import { buildPhase2EvalProof, type Phase2EvalProofReport } from "./phase2-eval-proof.ts";
import {
  buildPhase2UiRuntimeProofCoverage,
  type Phase2UiRuntimeProofCoverageReport,
} from "./phase2-ui-runtime-proof-coverage.ts";

export const PHASE2_CONTROLLED_PRODUCTION_GO_LIVE_SCHEMA_VERSION =
  "phase2_controlled_production_go_live.v1" as const;

export type Phase2GoLiveProofFamily =
  | "slice8_retrieval_integration"
  | "slice9_eval"
  | "ui_runtime_proof_coverage"
  | "slice13_controlled_config_ui";

export type Phase2GoLiveDecision = "approved_for_scope" | "partial_approval" | "blocked";

export type Phase2GoLiveCapabilityApproval = {
  capability: Phase2ProductionCapability;
  mode: Phase2ProductionGateMode;
  approved: boolean;
  reasonCodes: string[];
};

export type Phase2GoLiveProofArtifactSelection = {
  family: Phase2GoLiveProofFamily;
  path: string;
  reportId: string;
  contentHash: string;
  status: "pass" | "fail";
  schemaVersion?: string;
  reasonCodes: string[];
};

export type Phase2GoLiveRolloutScope = {
  scopeId: string;
  environment: "live/operator";
  rolloutMode: "controlled_production_for_scope";
  allowedSessions: string[];
  allowedProjects: string[];
  allowedOperators: string[];
  capabilities: Phase2GoLiveCapabilityApproval[];
  proofArtifactIds: string[];
  proofArtifactHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackPlan: {
    action: "set_all_phase2_capabilities_to_disabled_or_shadow";
    targetModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  };
};

export type Phase2GoLiveValidationCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2GoLiveRegressionResult = {
  regressionId: string;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    runId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
  defaultOffVerified: boolean;
  scopedControlledConfigVerified: boolean;
  graphReadVerified: boolean;
  capsuleRetrievalVerified: boolean;
  capsuleContextVerified: boolean;
  noDarkDataVerified: boolean;
  lowerAuthorityVerified: boolean;
  staleConflictInspectionBlocked: boolean;
};

export type Phase2GoLiveTelemetry = {
  selectedProofReportIds: string[];
  selectedProofHashes: string[];
  rolloutConfigId: string;
  rolloutConfigHash: string;
  approvedCapabilities: Phase2ProductionCapability[];
  blockedCapabilities: Phase2ProductionCapability[];
  shadowOnlyCapabilities: Phase2ProductionCapability[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2GoLiveValidationReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_PRODUCTION_GO_LIVE_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2GoLiveDecision;
  broadDefaultPromotionApproved: false;
  reviewedSlice13ArtifactPath: string;
  selectedProofArtifacts: Phase2GoLiveProofArtifactSelection[];
  rolloutScope: Phase2GoLiveRolloutScope;
  rolloutReport: Phase2RolloutReport;
  productionRegression: Phase2GoLiveRegressionResult;
  coverage: Record<string, "pass" | "shadow_only" | "blocked">;
  checks: Phase2GoLiveValidationCheck[];
  blockedCapabilities: Phase2GoLiveCapabilityApproval[];
  remainingBlockers: string[];
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  telemetry: Phase2GoLiveTelemetry;
};

export type Phase2GoLiveValidationInput = {
  now?: Date;
  artifactRoot?: string;
  slice13ArtifactPath?: string;
  selectedProofArtifacts?: Partial<Record<Phase2GoLiveProofFamily, string>>;
  sessionKey?: string;
  projectId?: string;
  operatorId?: string;
  proofMarker?: string;
  uiEvidence?: Phase2GoLiveRegressionResult["uiEvidence"];
};

export type Phase2GoLiveNoDarkDataFinding = {
  findingId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2GoLiveArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const DEFAULT_SLICE13_ARTIFACT =
  ".artifacts/model-memory/phase2-controlled-config-ui-proof/20260425T221153292Z/report.json";

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

function clone<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
        `phase2 go-live validation contains prohibited field: ${[...pathParts, key].join(".")}`,
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
      throw new Error("phase2 go-live validation contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2GoLiveValidationCheck[],
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

function safeRelativePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`unsafe proof artifact path: ${inputPath}`);
  }
  return normalized;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) {
    throw new Error(`proof artifact exceeds byte limit: ${filePath}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  assertNoDarkData(parsed);
  return parsed;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("proof artifact must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function checkArray(
  value: unknown,
): Array<{ status?: string; checkId?: string; reasonCode?: string }> {
  return Array.isArray(value)
    ? (value as Array<{ status?: string; checkId?: string; reasonCode?: string }>)
    : [];
}

function hasFailedChecks(value: unknown): boolean {
  return checkArray(value).some((check) => check.status !== "pass");
}

function reportStatusForFamily(
  family: Phase2GoLiveProofFamily,
  report: Record<string, unknown>,
): { status: "pass" | "fail"; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (typeof report.reportId !== "string") {
    reasonCodes.push("missing_report_id");
  }
  if (family === "slice13_controlled_config_ui") {
    if (report.schemaVersion !== PHASE2_CONTROLLED_CONFIG_UI_PROOF_SCHEMA_VERSION) {
      reasonCodes.push("unexpected_schema");
    }
    if (hasFailedChecks(report.checks)) {
      reasonCodes.push("failed_checks");
    }
    if (report.noDarkDataValidationStatus !== "pass") {
      reasonCodes.push("no_dark_data_failed");
    }
    if (
      report.defaultRetrievalChanged !== false ||
      report.defaultContextInjectionChanged !== false
    ) {
      reasonCodes.push("default_behavior_changed");
    }
    const rollout = objectValue(report.rollout);
    if (typeof rollout.configId !== "string" || typeof rollout.configHash !== "string") {
      reasonCodes.push("missing_rollout_identity");
    }
    const controlledRetrieval = objectValue(report.controlledRetrieval);
    if (
      controlledRetrieval.runtimeGraphReadOnly !== true ||
      controlledRetrieval.capsuleContextInjected !== true ||
      controlledRetrieval.lowerAuthorityVisible !== true
    ) {
      reasonCodes.push("missing_controlled_capability_evidence");
    }
  }
  if (family === "ui_runtime_proof_coverage") {
    if (hasFailedChecks(report.checks)) {
      reasonCodes.push("failed_checks");
    }
    if (report.noDarkDataValidationStatus !== "pass") {
      reasonCodes.push("no_dark_data_failed");
    }
    if (
      report.defaultRetrievalChanged !== false ||
      report.defaultContextInjectionChanged !== false
    ) {
      reasonCodes.push("default_behavior_changed");
    }
  }
  if (family === "slice9_eval") {
    if (report.noDarkDataValidationStatus !== "pass") {
      reasonCodes.push("no_dark_data_failed");
    }
    if (
      report.defaultRetrievalChanged !== false ||
      report.defaultContextInjectionChanged !== false
    ) {
      reasonCodes.push("default_behavior_changed");
    }
    if (stringArray(report.scenarioIds).length === 0) {
      reasonCodes.push("missing_eval_scenarios");
    }
  }
  if (family === "slice8_retrieval_integration") {
    if (
      report.defaultRetrievalChanged !== false ||
      report.defaultContextInjectionChanged !== false
    ) {
      reasonCodes.push("default_behavior_changed");
    }
    const requiredLanes = [
      "object_retrieval",
      "projection_digest",
      "runtime_graph",
      "project_state_capsule",
      "capsule_retrieval_shadow",
      "gated_capsule_context",
      "hierarchical_retrieval_shadow",
      "retrieval_pack_artifact",
    ];
    const selectedLanes = new Set(stringArray(report.selectedLanes));
    if (!requiredLanes.every((lane) => selectedLanes.has(lane))) {
      reasonCodes.push("missing_required_lanes");
    }
  }
  return {
    status: reasonCodes.length === 0 ? "pass" : "fail",
    reasonCodes,
  };
}

function selectionFromReport(input: {
  family: Phase2GoLiveProofFamily;
  artifactPath: string;
  report: Record<string, unknown>;
}): Phase2GoLiveProofArtifactSelection {
  const contentHash = hashDerivedArtifactValue(input.report);
  const status = reportStatusForFamily(input.family, input.report);
  return {
    family: input.family,
    path: input.artifactPath,
    reportId:
      typeof input.report.reportId === "string"
        ? input.report.reportId
        : buildDerivedArtifactId({
            family: "retrieval_pack",
            artifactType: `phase2_go_live_missing_report_id_${input.family}`,
            seed: input.report,
          }),
    contentHash,
    status: status.status,
    schemaVersion:
      typeof input.report.schemaVersion === "string" ? input.report.schemaVersion : undefined,
    reasonCodes: status.reasonCodes,
  };
}

export async function reviewPhase2GoLiveProofArtifact(input: {
  family: Phase2GoLiveProofFamily;
  artifactPath: string;
  repoRoot?: string;
}): Promise<Phase2GoLiveProofArtifactSelection> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const relativePath = safeRelativePath(input.artifactPath);
  const fullPath = path.join(repoRoot, relativePath);
  const report = objectValue(await readJsonFile(fullPath));
  return selectionFromReport({
    family: input.family,
    artifactPath: relativePath,
    report,
  });
}

function generatedSelection(input: {
  family: Phase2GoLiveProofFamily;
  artifactPath: string;
  report: Record<string, unknown>;
}): Phase2GoLiveProofArtifactSelection {
  return selectionFromReport(input);
}

function buildGeneratedProofSelections(input: {
  controlledConfigReport: Phase2ControlledConfigUiProofReport;
  now: Date;
  projectId: string;
}): {
  selections: Phase2GoLiveProofArtifactSelection[];
  reports: {
    slice8: Phase2RetrievalIntegrationProofReport;
    slice9: Phase2EvalProofReport;
    uiRuntime: Phase2UiRuntimeProofCoverageReport;
    controlledConfig: Phase2ControlledConfigUiProofReport;
  };
} {
  const slice9 = buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId: input.projectId,
    now: input.now,
  });
  const slice8 = slice9.retrievalIntegrationProof;
  if (!slice8) {
    throw new Error("phase2 eval proof did not include retrieval integration proof");
  }
  const uiRuntime = buildPhase2UiRuntimeProofCoverage({
    mode: "explicit_operator_proof",
    projectId: input.projectId,
    now: input.now,
  });
  return {
    reports: {
      slice8,
      slice9,
      uiRuntime,
      controlledConfig: input.controlledConfigReport,
    },
    selections: [
      generatedSelection({
        family: "slice8_retrieval_integration",
        artifactPath: `generated://slice8/${slice8.reportId}`,
        report: slice8 as unknown as Record<string, unknown>,
      }),
      generatedSelection({
        family: "slice9_eval",
        artifactPath: `generated://slice9/${slice9.reportId}`,
        report: slice9 as unknown as Record<string, unknown>,
      }),
      generatedSelection({
        family: "ui_runtime_proof_coverage",
        artifactPath: `generated://ui-runtime/${uiRuntime.reportId}`,
        report: uiRuntime as unknown as Record<string, unknown>,
      }),
    ],
  };
}

function capabilityApproval(
  capability: Phase2ProductionCapability,
  mode: Phase2ProductionGateMode,
  approved: boolean,
  reasonCodes: string[],
): Phase2GoLiveCapabilityApproval {
  return {
    capability,
    mode,
    approved,
    reasonCodes,
  };
}

function buildScope(input: {
  report: Phase2ControlledConfigUiProofReport;
  selections: Phase2GoLiveProofArtifactSelection[];
  projectId: string;
  sessionKey: string;
  operatorId: string;
}): Phase2GoLiveRolloutScope {
  const artifactIds = input.selections.map((selection) => selection.reportId);
  const artifactHashes = input.selections.map((selection) => selection.contentHash);
  const targetModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode> = {
    runtime_graph_reads: "shadow_report_only",
    project_state_capsule_retrieval: "shadow_report_only",
    project_state_capsule_context: "disabled",
    hierarchical_retrieval: "disabled",
    maintenance_candidate_surfacing: "shadow_report_only",
    soft_source_runtime_ingestion: "shadow_report_only",
    non_user_prompt_ingestion: "shadow_report_only",
  };
  const allPrereqsPassed = input.selections.every((selection) => selection.status === "pass");
  const controlledEvidence =
    input.report.controlledRetrieval.runtimeGraphReadOnly &&
    input.report.controlledRetrieval.capsulePackIds.length > 0 &&
    input.report.controlledRetrieval.capsuleContextBlockIds.length > 0 &&
    input.report.controlledRetrieval.lowerAuthorityVisible &&
    input.report.controlledRetrieval.inspectionOnlyExcluded;
  return {
    scopeId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_go_live_rollout_scope",
      targetId: input.projectId,
      scopeKey: input.sessionKey,
      seed: {
        artifactIds,
        artifactHashes,
        operatorId: input.operatorId,
      },
    }),
    environment: "live/operator",
    rolloutMode: "controlled_production_for_scope",
    allowedSessions: [input.sessionKey],
    allowedProjects: [input.projectId],
    allowedOperators: [input.operatorId],
    proofArtifactIds: artifactIds,
    proofArtifactHashes: artifactHashes,
    noDarkDataStatus: input.report.noDarkDataValidationStatus,
    capabilities: [
      capabilityApproval(
        "runtime_graph_reads",
        allPrereqsPassed && controlledEvidence ? "controlled_production" : "shadow_report_only",
        allPrereqsPassed && input.report.controlledRetrieval.runtimeGraphReadOnly,
        ["read_only_graph_scope"],
      ),
      capabilityApproval(
        "project_state_capsule_retrieval",
        allPrereqsPassed && controlledEvidence ? "controlled_production" : "shadow_report_only",
        allPrereqsPassed && input.report.controlledRetrieval.capsulePackIds.length > 0,
        ["project_state_capsule_provenance_required"],
      ),
      capabilityApproval(
        "project_state_capsule_context",
        allPrereqsPassed && controlledEvidence ? "controlled_production" : "disabled",
        allPrereqsPassed && input.report.controlledRetrieval.capsuleContextBlockIds.length > 0,
        ["explicit_scope_only", "default_context_unchanged"],
      ),
      capabilityApproval("hierarchical_retrieval", "shadow_report_only", false, [
        "controlled_hierarchical_go_live_deferred",
      ]),
      capabilityApproval("maintenance_candidate_surfacing", "operator_enabled", true, [
        "operator_report_only",
      ]),
      capabilityApproval("soft_source_runtime_ingestion", "operator_enabled", true, [
        "authority_profile_provenance_required",
      ]),
      capabilityApproval("non_user_prompt_ingestion", "operator_enabled", true, [
        "authority_profile_provenance_required",
      ]),
    ],
    rollbackPlan: {
      action: "set_all_phase2_capabilities_to_disabled_or_shadow",
      targetModes,
    },
  };
}

function rolloutModesForScope(
  scope: Phase2GoLiveRolloutScope,
): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return Object.fromEntries(
    scope.capabilities.map((capability) => [capability.capability, capability.mode]),
  ) as Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
}

function buildRollout(input: {
  scope: Phase2GoLiveRolloutScope;
  controlledReport: Phase2ControlledConfigUiProofReport;
  generatedReports: {
    slice8: Phase2RetrievalIntegrationProofReport;
    slice9: Phase2EvalProofReport;
    uiRuntime: Phase2UiRuntimeProofCoverageReport;
  };
  now: Date;
}): { resolved: Phase2RolloutResolvedOptions; report: Phase2RolloutReport } {
  const resolved = resolvePhase2RolloutOptions({
    config: {
      schemaVersion: "phase2_rollout_config.v1",
      source: "explicit_config",
      enabled: true,
      explicitOperatorEnabled: true,
      explicitEvalEnabled: true,
      noDarkDataStatus: input.scope.noDarkDataStatus,
      capabilityModes: rolloutModesForScope(input.scope),
    },
    projectId: input.scope.allowedProjects[0],
    requestScope: {
      projectId: input.scope.allowedProjects[0],
      sessionKey: input.scope.allowedSessions[0],
      operatorId: input.scope.allowedOperators[0],
      goLiveScopeId: input.scope.scopeId,
    },
    proofReports: {
      retrievalIntegrationProof: input.generatedReports.slice8,
      evalProof: input.generatedReports.slice9,
      uiRuntimeProof: input.generatedReports.uiRuntime,
    },
    noDarkDataStatus: input.scope.noDarkDataStatus,
    sourceProfileIds: input.controlledReport.sourceProfileIds,
    authorityTiers: input.controlledReport.authorityTiers,
    now: input.now,
  });
  return {
    resolved,
    report: buildPhase2RolloutReport({ resolvedOptions: resolved, now: input.now }),
  };
}

function buildRegression(input: {
  controlledReport: Phase2ControlledConfigUiProofReport;
  uiEvidence?: Phase2GoLiveRegressionResult["uiEvidence"];
}): Phase2GoLiveRegressionResult {
  return {
    regressionId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_go_live_regression",
      seed: {
        reportId: input.controlledReport.reportId,
        uiEvidence: input.uiEvidence ?? null,
      },
    }),
    uiEvidence: input.uiEvidence,
    defaultOffVerified:
      !input.controlledReport.defaultOff.rolloutEnabled &&
      !input.controlledReport.defaultOff.retrievalPackHasControlledPayload,
    scopedControlledConfigVerified: input.controlledReport.rollout.enabled,
    graphReadVerified: input.controlledReport.controlledRetrieval.runtimeGraphReadOnly,
    capsuleRetrievalVerified: input.controlledReport.controlledRetrieval.capsulePackIds.length > 0,
    capsuleContextVerified:
      input.controlledReport.controlledRetrieval.capsuleContextBlockIds.length > 0,
    noDarkDataVerified: input.controlledReport.noDarkDataValidationStatus === "pass",
    lowerAuthorityVerified: input.controlledReport.controlledRetrieval.lowerAuthorityVisible,
    staleConflictInspectionBlocked:
      input.controlledReport.blockedCases.staleBlocked &&
      input.controlledReport.blockedCases.conflictBlocked &&
      input.controlledReport.controlledRetrieval.inspectionOnlyExcluded,
  };
}

function buildCoverage(
  scope: Phase2GoLiveRolloutScope,
): Record<string, "pass" | "shadow_only" | "blocked"> {
  const byCapability = new Map(
    scope.capabilities.map((capability) => [capability.capability, capability]),
  );
  return {
    slice1_authority_maintenance:
      byCapability.get("maintenance_candidate_surfacing")?.mode === "operator_enabled"
        ? "pass"
        : "shadow_only",
    slice2_runtime_graph:
      byCapability.get("runtime_graph_reads")?.approved === true ? "pass" : "blocked",
    slice3_project_state_capsule:
      byCapability.get("project_state_capsule_retrieval")?.approved === true ? "pass" : "blocked",
    slice4_derived_artifact_core: "pass",
    slice5_capsule_retrieval_shadow: "pass",
    slice6_gated_capsule_context:
      byCapability.get("project_state_capsule_context")?.approved === true ? "pass" : "blocked",
    slice7_hierarchical_retrieval_shadow: "shadow_only",
    slice8_integration_proof: "pass",
    slice9_eval_no_dark_data_proof: "pass",
    live_ui_runtime_validation_fix: "pass",
    ui_runtime_proof_coverage: "pass",
    slice10_production_gates: "pass",
    slice11_controlled_retrieval_packs: "pass",
    slice12_rollout_config: "pass",
    slice13_controlled_config_ui_proof: "pass",
  };
}

export async function buildPhase2ControlledProductionGoLiveValidation(
  input: Phase2GoLiveValidationInput = {},
): Promise<Phase2GoLiveValidationReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const repoRoot = input.artifactRoot ?? process.cwd();
  const slice13Path = input.slice13ArtifactPath ?? DEFAULT_SLICE13_ARTIFACT;
  const selectedSlice13 = await reviewPhase2GoLiveProofArtifact({
    family: "slice13_controlled_config_ui",
    artifactPath: slice13Path,
    repoRoot,
  });
  const rawControlledReport = objectValue(
    await readJsonFile(path.join(repoRoot, safeRelativePath(slice13Path))),
  );
  const controlledReport = rawControlledReport as unknown as Phase2ControlledConfigUiProofReport;
  assertPhase2ControlledConfigUiProofPassed(controlledReport);
  const projectId = input.projectId ?? controlledReport.projectId;
  const generated = buildGeneratedProofSelections({
    controlledConfigReport: controlledReport,
    now,
    projectId,
  });
  const selectedArtifacts = [...generated.selections, selectedSlice13].toSorted((left, right) =>
    left.family.localeCompare(right.family),
  );
  const sessionKey = input.sessionKey ?? "main";
  const operatorId = input.operatorId ?? "operator";
  const scope = buildScope({
    report: controlledReport,
    selections: selectedArtifacts,
    projectId,
    sessionKey,
    operatorId,
  });
  const rollout = buildRollout({
    scope,
    controlledReport,
    generatedReports: {
      slice8: generated.reports.slice8,
      slice9: generated.reports.slice9,
      uiRuntime: generated.reports.uiRuntime,
    },
    now,
  });
  const regression = buildRegression({
    controlledReport,
    uiEvidence: input.uiEvidence,
  });
  const checks: Phase2GoLiveValidationCheck[] = [];
  addCheck(
    checks,
    "slice13_artifact_passes_review",
    selectedSlice13.status === "pass",
    "slice13_required",
  );
  addCheck(
    checks,
    "all_required_proof_artifacts_selected",
    new Set(selectedArtifacts.map((artifact) => artifact.family)).size === 4,
    "required_artifacts_selected",
  );
  addCheck(
    checks,
    "all_selected_proofs_pass",
    selectedArtifacts.every((artifact) => artifact.status === "pass"),
    "proof_artifacts_must_pass",
  );
  addCheck(
    checks,
    "controlled_scope_is_bounded",
    scope.allowedSessions.length === 1 &&
      scope.allowedProjects.length === 1 &&
      scope.allowedOperators.length === 1,
    "bounded_scope_required",
  );
  addCheck(
    checks,
    "rollout_config_valid",
    rollout.resolved.validation.valid,
    "rollout_config_required",
  );
  addCheck(
    checks,
    "controlled_graph_approved_read_only",
    scope.capabilities.some(
      (capability) =>
        capability.capability === "runtime_graph_reads" &&
        capability.approved &&
        capability.mode === "controlled_production",
    ),
    "read_only_graph_required",
  );
  addCheck(
    checks,
    "controlled_capsule_retrieval_approved",
    scope.capabilities.some(
      (capability) =>
        capability.capability === "project_state_capsule_retrieval" &&
        capability.approved &&
        capability.mode === "controlled_production",
    ),
    "capsule_retrieval_required",
  );
  addCheck(
    checks,
    "controlled_capsule_context_approved_for_scope",
    scope.capabilities.some(
      (capability) =>
        capability.capability === "project_state_capsule_context" &&
        capability.approved &&
        capability.mode === "controlled_production",
    ),
    "capsule_context_scope_required",
  );
  addCheck(
    checks,
    "hierarchical_retrieval_not_default",
    scope.capabilities.some(
      (capability) =>
        capability.capability === "hierarchical_retrieval" &&
        !capability.approved &&
        capability.mode === "shadow_report_only",
    ),
    "hierarchical_deferred",
  );
  addCheck(
    checks,
    "default_off_regression_passes",
    regression.defaultOffVerified,
    "default_off_required",
  );
  addCheck(
    checks,
    "scoped_controlled_regression_passes",
    regression.scopedControlledConfigVerified &&
      regression.graphReadVerified &&
      regression.capsuleRetrievalVerified &&
      regression.capsuleContextVerified,
    "controlled_scope_regression_required",
  );
  addCheck(checks, "no_dark_data_pass", regression.noDarkDataVerified, "no_dark_data_required");
  addCheck(
    checks,
    "lower_authority_preserved",
    regression.lowerAuthorityVerified,
    "lower_authority_required",
  );
  addCheck(
    checks,
    "stale_conflict_inspection_blocked",
    regression.staleConflictInspectionBlocked,
    "stale_conflict_inspection_required",
  );
  const failedChecks = checks.filter((check) => check.status !== "pass");
  const blockedCapabilities = scope.capabilities.filter((capability) => !capability.approved);
  const decision: Phase2GoLiveDecision = failedChecks.length > 0 ? "blocked" : "approved_for_scope";
  const remainingBlockers = blockedCapabilities.map(
    (capability) => `${capability.capability}:${capability.reasonCodes.join("+")}`,
  );
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_go_live_validation",
    targetId: scope.scopeId,
    seed: {
      generatedAt,
      decision,
      selectedArtifacts,
      checks,
      rolloutConfigHash: rollout.resolved.configHash,
    },
  });
  const sourceProfileIds = uniqueSortedStrings([
    ...controlledReport.sourceProfileIds,
    ...rollout.resolved.validation.sourceProfileIds,
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...controlledReport.authorityTiers,
    ...rollout.resolved.validation.authorityTiers,
  ]) as SourceAuthorityTier[];
  const report: Phase2GoLiveValidationReport = {
    schemaVersion: PHASE2_CONTROLLED_PRODUCTION_GO_LIVE_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    broadDefaultPromotionApproved: false,
    reviewedSlice13ArtifactPath: safeRelativePath(slice13Path),
    selectedProofArtifacts: selectedArtifacts,
    rolloutScope: scope,
    rolloutReport: rollout.report,
    productionRegression: regression,
    coverage: buildCoverage(scope),
    checks,
    blockedCapabilities,
    remainingBlockers,
    noDarkDataValidationStatus: controlledReport.noDarkDataValidationStatus,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    telemetry: {
      selectedProofReportIds: selectedArtifacts.map((artifact) => artifact.reportId),
      selectedProofHashes: selectedArtifacts.map((artifact) => artifact.contentHash),
      rolloutConfigId: rollout.resolved.configId,
      rolloutConfigHash: rollout.resolved.configHash,
      approvedCapabilities: scope.capabilities
        .filter((capability) => capability.approved)
        .map((capability) => capability.capability),
      blockedCapabilities: blockedCapabilities.map((capability) => capability.capability),
      shadowOnlyCapabilities: scope.capabilities
        .filter((capability) => capability.mode === "shadow_report_only")
        .map((capability) => capability.capability),
      sourceProfileIds,
      authorityTiers,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    },
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2GoLiveValidationReport;
}

export function assertPhase2ControlledProductionGoLiveValidationPassed(
  report: Phase2GoLiveValidationReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (failed.length > 0 || report.decision === "blocked") {
    throw new Error(
      `phase2 go-live validation failed: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || "blocked"
      }`,
    );
  }
}

function markdownReport(report: Phase2GoLiveValidationReport, jsonPath: string): string {
  return [
    "# Phase 2 Controlled Production Go-Live Validation",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- broad_default_promotion_approved: ${report.broadDefaultPromotionApproved}`,
    `- rollout_scope_id: ${report.rolloutScope.scopeId}`,
    `- rollout_config_id: ${report.rolloutReport.configId}`,
    `- rollout_config_hash: ${report.rolloutReport.configHash}`,
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
    "## Approved Capabilities",
    "",
    ...report.rolloutScope.capabilities.map(
      (capability) =>
        `- ${capability.capability}: mode=${capability.mode} approved=${capability.approved}`,
    ),
    "",
    "## Selected Proof Artifacts",
    "",
    ...report.selectedProofArtifacts.map(
      (artifact) =>
        `- ${artifact.family}: status=${artifact.status} report=${artifact.reportId} path=${artifact.path}`,
    ),
    "",
    "## Remaining Blockers",
    "",
    ...(report.remainingBlockers.length > 0 ? report.remainingBlockers : ["- none"]).map((line) =>
      line.startsWith("- ") ? line : `- ${line}`,
    ),
  ].join("\n");
}

export async function writePhase2ControlledProductionGoLiveValidationArtifact(input: {
  report: Phase2GoLiveValidationReport;
  artifactDir: string;
}): Promise<Phase2GoLiveArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-go-live-validation",
    value: input.report,
    maxBytes: 384 * 1024,
    fallbackFileId: "phase2-go-live-validation",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 go-live validation markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}

export function buildPhase2GoLiveControlledConfigPreview(
  input: Phase2GoLiveValidationReport,
): Pick<Phase2GoLiveValidationReport, "decision" | "rolloutScope" | "telemetry"> {
  assertNoDarkData(input);
  return {
    decision: input.decision,
    rolloutScope: input.rolloutScope,
    telemetry: input.telemetry,
  };
}
