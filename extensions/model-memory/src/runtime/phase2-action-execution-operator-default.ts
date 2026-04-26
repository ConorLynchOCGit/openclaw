import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2ControlledActionExecutionReport,
  type Phase2ControlledActionExecutionReport,
} from "./phase2-controlled-action-execution.ts";
import {
  buildPhase2ControlledActionExpansionReport,
  type Phase2ControlledActionExpansionReport,
  type Phase2ExpandedControlledActionKind,
} from "./phase2-controlled-action-expansion.ts";

export const PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SCHEMA_VERSION =
  "phase2_action_execution_operator_default.v1" as const;
export const PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION =
  "phase2_action_execution_operator_default_report.v1" as const;

export type Phase2ActionExecutionOperatorDefaultDecision =
  | "approved_for_default_operator_visible_execution_workflow"
  | "partial_approval"
  | "blocked";

export type Phase2ActionExecutionOperatorDefaultCapabilityDecision = {
  capability: "operator_visible_action_execution_workflow";
  decision: Phase2ActionExecutionOperatorDefaultDecision;
  allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"];
  explicitApprovalRequired: true;
  autonomousExecutionAllowed: false;
  userFacingProactivityAllowed: false;
  reasonCodes: string[];
};

export type Phase2ActionExecutionOperatorDefaultConfig = {
  schemaVersion: typeof PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SCHEMA_VERSION;
  configId: string;
  mode: "default_operator_visible";
  allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"];
  requireStagedApproval: true;
  requireExplicitExecutionApproval: true;
  requireNoDarkDataPass: true;
  requireProvenance: true;
  exposeWorkflowToOrdinaryOperatorSurfaces: true;
  autonomousExecutionAllowed: false;
  userFacingProactiveMessagesAllowed: false;
  blockedActionKinds: [
    "unsafe_external_command",
    "unsafe_network_call",
    "unsafe_db_mutation",
    "unsafe_user_message",
    "unsafe_file_mutation",
  ];
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ActionExecutionOperatorDefaultRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED";
  targetMode: "controlled_operator_eval_only";
  disablesDefaultVisibleWorkflow: true;
};

export type Phase2ActionExecutionOperatorDefaultTelemetry = {
  schemaVersion: typeof PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ActionExecutionOperatorDefaultDecision;
  configId: string;
  controlledActionExecutionReportId?: string;
  controlledActionExpansionReportId?: string;
  allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitExecutionApprovalRequired: true;
  defaultVisibleOperatorWorkflowObserved: boolean;
  autonomousExecutionAllowed: false;
  userFacingProactiveMessagesSent: false;
};

export type Phase2ActionExecutionOperatorDefaultCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ActionExecutionOperatorDefaultReport = {
  schemaVersion: typeof PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ActionExecutionOperatorDefaultDecision;
  config: Phase2ActionExecutionOperatorDefaultConfig;
  capabilityDecision: Phase2ActionExecutionOperatorDefaultCapabilityDecision;
  controlledActionExecutionReportId?: string;
  controlledActionExpansionReportId?: string;
  checks: Phase2ActionExecutionOperatorDefaultCheck[];
  rollbackPlan: Phase2ActionExecutionOperatorDefaultRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ActionExecutionOperatorDefaultTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    defaultWorkflowRunId?: string | null;
    executionApprovalRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ActionExecutionOperatorDefaultInput = {
  now?: Date;
  proofMarker?: string;
  controlledActionExecutionReport?: Phase2ControlledActionExecutionReport | null;
  controlledActionExpansionReport?: Phase2ControlledActionExpansionReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ActionExecutionOperatorDefaultReport["uiEvidence"];
};

export type Phase2ActionExecutionOperatorDefaultArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_ACTION_KINDS = [
  "write_bounded_proof_artifact",
  "create_operator_review_note",
] as const;

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
        `phase2 action execution operator default contains prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
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
      throw new Error(
        "phase2 action execution operator default contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ActionExecutionOperatorDefaultCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function hasSafeProof(report: Phase2ControlledActionExecutionReport | undefined): boolean {
  return Boolean(
    report &&
    report.decision === "executed_controlled_harmless_action" &&
    report.actionKind === "write_bounded_proof_artifact" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.explicitExecutionApproval &&
    report.telemetry.actionExecutionObserved &&
    !report.telemetry.userFacingProactiveMessagesSent &&
    !report.telemetry.externalCommandExecuted &&
    !report.telemetry.networkCallExecuted &&
    !report.telemetry.databaseMutationExecuted,
  );
}

function hasExpandedSafeProof(report: Phase2ControlledActionExpansionReport | undefined): boolean {
  return Boolean(
    report &&
    report.decision === "executed_expanded_harmless_action" &&
    report.actionKind === "create_operator_review_note" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.explicitExecutionApproval &&
    report.telemetry.actionExecutionObserved &&
    !report.telemetry.userFacingProactiveMessagesSent &&
    !report.telemetry.externalCommandExecuted &&
    !report.telemetry.networkCallExecuted &&
    !report.telemetry.databaseMutationExecuted &&
    !report.telemetry.unsafeFileMutationExecuted,
  );
}

function hasAllowedKindsOnly(actionKinds: readonly Phase2ExpandedControlledActionKind[]): boolean {
  return actionKinds.every((kind) => (ALLOWED_ACTION_KINDS as readonly string[]).includes(kind));
}

function collectProofValues(input: {
  controlledActionExecutionReport: Phase2ControlledActionExecutionReport | undefined;
  controlledActionExpansionReport: Phase2ControlledActionExpansionReport | undefined;
}): {
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
} {
  return {
    sourceProfileIds: uniqueSortedStrings([
      ...(input.controlledActionExecutionReport?.telemetry.sourceProfileIds ?? []),
      ...(input.controlledActionExpansionReport?.telemetry.sourceProfileIds ?? []),
    ]) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings([
      ...(input.controlledActionExecutionReport?.telemetry.authorityTiers ?? []),
      ...(input.controlledActionExpansionReport?.telemetry.authorityTiers ?? []),
    ]) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings([
      ...(input.controlledActionExecutionReport?.telemetry.sourceRefIds ?? []),
      ...(input.controlledActionExpansionReport?.telemetry.sourceRefIds ?? []),
    ]),
    contentHashes: uniqueSortedStrings([
      ...(input.controlledActionExecutionReport?.telemetry.contentHashes ?? []),
      ...(input.controlledActionExpansionReport?.telemetry.contentHashes ?? []),
    ]),
    proofHashes: uniqueSortedStrings([
      ...(input.controlledActionExecutionReport?.telemetry.proofHashes ?? []),
      ...(input.controlledActionExpansionReport?.telemetry.proofHashes ?? []),
      ...(input.controlledActionExecutionReport
        ? [sha256JsonValue(input.controlledActionExecutionReport as unknown as JsonLike)]
        : []),
      ...(input.controlledActionExpansionReport
        ? [sha256JsonValue(input.controlledActionExpansionReport as unknown as JsonLike)]
        : []),
    ]),
  };
}

function buildConfig(generatedAt: string): Phase2ActionExecutionOperatorDefaultConfig {
  return {
    schemaVersion: PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_action_execution_operator_default_config",
      targetId: "operator",
      seed: generatedAt,
    }),
    mode: "default_operator_visible",
    allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"],
    requireStagedApproval: true,
    requireExplicitExecutionApproval: true,
    requireNoDarkDataPass: true,
    requireProvenance: true,
    exposeWorkflowToOrdinaryOperatorSurfaces: true,
    autonomousExecutionAllowed: false,
    userFacingProactiveMessagesAllowed: false,
    blockedActionKinds: [
      "unsafe_external_command",
      "unsafe_network_call",
      "unsafe_db_mutation",
      "unsafe_user_message",
      "unsafe_file_mutation",
    ],
    externalTextHandling: "evidence_not_instruction",
  };
}

function decide(input: {
  killed: boolean;
  proofOk: boolean;
  expansionOk: boolean;
  noDarkDataOk: boolean;
  approvalRequired: boolean;
  proactivityOff: boolean;
  allowedKindsOnly: boolean;
}): Phase2ActionExecutionOperatorDefaultDecision {
  if (input.killed) {
    return "blocked";
  }
  if (
    input.proofOk &&
    input.expansionOk &&
    input.noDarkDataOk &&
    input.approvalRequired &&
    input.proactivityOff &&
    input.allowedKindsOnly
  ) {
    return "approved_for_default_operator_visible_execution_workflow";
  }
  if (input.proofOk || input.expansionOk) {
    return "partial_approval";
  }
  return "blocked";
}

export async function buildPhase2ActionExecutionOperatorDefaultReport(
  input: Phase2ActionExecutionOperatorDefaultInput = {},
): Promise<Phase2ActionExecutionOperatorDefaultReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const controlledActionExecutionReport =
    input.controlledActionExecutionReport === null
      ? undefined
      : (input.controlledActionExecutionReport ??
        (await buildPhase2ControlledActionExecutionReport({
          now: input.now,
          proofMarker: input.proofMarker,
          explicitExecutionApproval: true,
        })));
  const controlledActionExpansionReport =
    input.controlledActionExpansionReport === null
      ? undefined
      : (input.controlledActionExpansionReport ??
        (await buildPhase2ControlledActionExpansionReport({
          now: input.now,
          proofMarker: input.proofMarker,
          explicitExecutionApproval: true,
          actionKind: "create_operator_review_note",
        })));
  const config = buildConfig(generatedAt);
  const proofOk = hasSafeProof(controlledActionExecutionReport);
  const expansionOk = hasExpandedSafeProof(controlledActionExpansionReport);
  const noDarkDataOk =
    controlledActionExecutionReport?.noDarkDataStatus === "pass" &&
    controlledActionExpansionReport?.noDarkDataStatus === "pass";
  const approvalRequired =
    controlledActionExecutionReport?.policy.requireExplicitExecutionApproval === true &&
    controlledActionExpansionReport?.policy.requireExplicitExecutionApproval === true;
  const proactivityOff =
    controlledActionExecutionReport?.policy.userFacingProactiveMessagesAllowed === false &&
    controlledActionExpansionReport?.policy.userFacingProactiveMessagesAllowed === false &&
    !controlledActionExecutionReport.telemetry.userFacingProactiveMessagesSent &&
    !controlledActionExpansionReport.telemetry.userFacingProactiveMessagesSent;
  const allowedKindsOnly = hasAllowedKindsOnly(config.allowedActionKinds);
  const checks: Phase2ActionExecutionOperatorDefaultCheck[] = [];
  addCheck(checks, "proof:slice25_present", proofOk, "slice25_controlled_execution_proof_required");
  addCheck(
    checks,
    "proof:slice26_present",
    expansionOk,
    "slice26_expanded_execution_proof_required",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "approval:explicit_required", approvalRequired, "explicit_approval_required");
  addCheck(checks, "proactivity:off", proactivityOff, "user_facing_proactivity_must_remain_off");
  addCheck(
    checks,
    "action_kinds:allowed_only",
    allowedKindsOnly,
    "allowed_harmless_action_kinds_only",
  );
  const decision = decide({
    killed,
    proofOk,
    expansionOk,
    noDarkDataOk,
    approvalRequired,
    proactivityOff,
    allowedKindsOnly,
  });
  const proofValues = collectProofValues({
    controlledActionExecutionReport,
    controlledActionExpansionReport,
  });
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_action_execution_operator_default_report",
    targetId: "operator",
    seed: {
      generatedAt,
      proofMarker: input.proofMarker ?? null,
      executionReportId: controlledActionExecutionReport?.reportId ?? null,
      expansionReportId: controlledActionExpansionReport?.reportId ?? null,
      decision,
    },
  });
  const rollbackPlan: Phase2ActionExecutionOperatorDefaultRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_action_execution_operator_default_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED",
    targetMode: "controlled_operator_eval_only",
    disablesDefaultVisibleWorkflow: true,
  };
  const reasonCodes = uniqueSortedStrings(
    checks
      .filter((check) => check.status === "fail" || decision !== "blocked")
      .map((check) => check.reasonCode)
      .concat(decision),
  );
  const capabilityDecision: Phase2ActionExecutionOperatorDefaultCapabilityDecision = {
    capability: "operator_visible_action_execution_workflow",
    decision,
    allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"],
    explicitApprovalRequired: true,
    autonomousExecutionAllowed: false,
    userFacingProactivityAllowed: false,
    reasonCodes,
  };
  const noDarkDataStatus = noDarkDataOk ? "pass" : "fail";
  const telemetry: Phase2ActionExecutionOperatorDefaultTelemetry = {
    schemaVersion: PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    controlledActionExecutionReportId: controlledActionExecutionReport?.reportId,
    controlledActionExpansionReportId: controlledActionExpansionReport?.reportId,
    allowedActionKinds: ["write_bounded_proof_artifact", "create_operator_review_note"],
    sourceProfileIds: proofValues.sourceProfileIds,
    authorityTiers: proofValues.authorityTiers,
    sourceRefIds: proofValues.sourceRefIds,
    contentHashes: proofValues.contentHashes,
    proofHashes: proofValues.proofHashes,
    reasonCodes,
    noDarkDataStatus,
    rollbackObserved: killed,
    explicitExecutionApprovalRequired: true,
    defaultVisibleOperatorWorkflowObserved:
      decision === "approved_for_default_operator_visible_execution_workflow",
    autonomousExecutionAllowed: false,
    userFacingProactiveMessagesSent: false,
  };
  const report: Phase2ActionExecutionOperatorDefaultReport = {
    schemaVersion: PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    capabilityDecision,
    controlledActionExecutionReportId: controlledActionExecutionReport?.reportId,
    controlledActionExpansionReportId: controlledActionExpansionReport?.reportId,
    checks,
    rollbackPlan,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ActionExecutionOperatorDefaultReport;
}

export function assertPhase2ActionExecutionOperatorDefaultApproved(
  report: Phase2ActionExecutionOperatorDefaultReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_default_operator_visible_execution_workflow") {
    throw new Error(`phase2 action execution operator default not approved: ${report.decision}`);
  }
  if (!report.config.requireExplicitExecutionApproval) {
    throw new Error("phase2 action execution operator default does not require approval");
  }
  if (
    report.config.autonomousExecutionAllowed ||
    report.config.userFacingProactiveMessagesAllowed ||
    report.telemetry.autonomousExecutionAllowed ||
    report.telemetry.userFacingProactiveMessagesSent
  ) {
    throw new Error("phase2 action execution operator default escaped operator-only boundary");
  }
}

export async function writePhase2ActionExecutionOperatorDefaultArtifact(input: {
  report: Phase2ActionExecutionOperatorDefaultReport;
  artifactDir: string;
}): Promise<Phase2ActionExecutionOperatorDefaultArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-action-execution-operator-default",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Action Execution Operator Default Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- configId: ${input.report.config.configId}`,
    `- controlledActionExecutionReportId: ${
      input.report.controlledActionExecutionReportId ?? "none"
    }`,
    `- controlledActionExpansionReportId: ${
      input.report.controlledActionExpansionReportId ?? "none"
    }`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- explicitExecutionApprovalRequired: ${input.report.telemetry.explicitExecutionApprovalRequired}`,
    `- defaultVisibleOperatorWorkflowObserved: ${input.report.telemetry.defaultVisibleOperatorWorkflowObserved}`,
    `- userFacingProactiveMessagesSent: ${input.report.telemetry.userFacingProactiveMessagesSent}`,
    "",
    "## Allowed Action Kinds",
    "",
    ...input.report.config.allowedActionKinds.map((kind) => `- ${kind}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 action execution operator default markdown exceeds byte limit");
  }
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
