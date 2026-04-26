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
  buildPhase2ControlledUserFacingProactivityExpansionReport,
  type Phase2ControlledUserFacingProactivityExpansionAdapter,
  type Phase2ControlledUserFacingProactivityExpansionReport,
} from "./phase2-controlled-user-facing-proactivity-expansion.ts";
import {
  buildPhase2ProactiveMessageOperatorDefaultReport,
  type Phase2ProactiveMessageOperatorDefaultReport,
} from "./phase2-proactive-message-operator-default.ts";

export const PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_SCHEMA_VERSION =
  "phase2_proactive_message_expanded_operator_default.v1" as const;
export const PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION =
  "phase2_proactive_message_expanded_operator_default_report.v1" as const;

export type Phase2ExpandedOperatorDefaultMessageClass =
  | "operator_approved_suggestion_available"
  | "operator_approved_follow_up_available";

export type Phase2ProactiveMessageExpandedOperatorDefaultDecision =
  | "approved_for_default_operator_visible_expanded_send_workflow"
  | "partial_approval"
  | "blocked";

export type Phase2ProactiveMessageExpandedCapabilityDecision = {
  capability: "operator_visible_expanded_proactive_message_send_workflow";
  decision: Phase2ProactiveMessageExpandedOperatorDefaultDecision;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  explicitSendApprovalRequired: true;
  autonomousSendingAllowed: false;
  broadDefaultProactivityAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  reasonCodes: string[];
};

export type Phase2ProactiveMessageExpandedOperatorDefaultConfig = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_SCHEMA_VERSION;
  configId: string;
  mode: "default_operator_visible_expanded_send_workflow";
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireExplicitSendApproval: true;
  requireNoDarkDataPass: true;
  requireProvenance: true;
  exposeWorkflowToOrdinaryOperatorSurfaces: true;
  automaticSendAllowed: false;
  autonomousSendingAllowed: false;
  broadDefaultProactivityAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  blockedMessageClasses: [
    "unapproved_suggestion",
    "external_instruction_message",
    "private_or_secret_content",
    "raw_prompt_or_transcript_content",
    "autonomous_action_request",
    "unknown_message_class",
  ];
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ProactiveMessageExpandedRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_DISABLED";
  targetMode: "single_message_operator_default_workflow";
  disablesExpandedDefaultVisibleSendWorkflow: true;
};

export type Phase2ProactiveMessageExpandedTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ProactiveMessageExpandedOperatorDefaultDecision;
  configId: string;
  slice30OperatorDefaultReportId?: string;
  slice31ControlledExpansionReportId?: string;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitSendApprovalRequired: true;
  defaultVisibleExpandedOperatorSendWorkflowObserved: boolean;
  autonomousSendingAllowed: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProactiveMessageExpandedCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ProactiveMessageExpandedOperatorDefaultReport = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactiveMessageExpandedOperatorDefaultDecision;
  config: Phase2ProactiveMessageExpandedOperatorDefaultConfig;
  capabilityDecision: Phase2ProactiveMessageExpandedCapabilityDecision;
  slice30OperatorDefaultReportId?: string;
  slice31ControlledExpansionReportId?: string;
  checks: Phase2ProactiveMessageExpandedCheck[];
  rollbackPlan: Phase2ProactiveMessageExpandedRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ProactiveMessageExpandedTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    firstClassDeliveryId?: string | null;
    secondClassDeliveryId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    observedDeliveryTextSha256?: string;
  };
};

export type Phase2ProactiveMessageExpandedOperatorDefaultInput = {
  now?: Date;
  proofMarker?: string;
  operatorDefaultReport?: Phase2ProactiveMessageOperatorDefaultReport | null;
  controlledExpansionReport?: Phase2ControlledUserFacingProactivityExpansionReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactiveMessageExpandedOperatorDefaultReport["uiEvidence"];
};

export type Phase2ProactiveMessageExpandedOperatorDefaultArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_CLASSES = [
  "operator_approved_suggestion_available",
  "operator_approved_follow_up_available",
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
        `phase2 proactive expanded operator default contains prohibited field: ${[
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
        "phase2 proactive expanded operator default contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ProactiveMessageExpandedCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function buildConfig(generatedAt: string): Phase2ProactiveMessageExpandedOperatorDefaultConfig {
  return {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_message_expanded_operator_default_config",
      targetId: "operator",
      seed: generatedAt,
    }),
    mode: "default_operator_visible_expanded_send_workflow",
    allowedMessageClasses: [...ALLOWED_CLASSES],
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireExplicitSendApproval: true,
    requireNoDarkDataPass: true,
    requireProvenance: true,
    exposeWorkflowToOrdinaryOperatorSurfaces: true,
    automaticSendAllowed: false,
    autonomousSendingAllowed: false,
    broadDefaultProactivityAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    blockedMessageClasses: [
      "unapproved_suggestion",
      "external_instruction_message",
      "private_or_secret_content",
      "raw_prompt_or_transcript_content",
      "autonomous_action_request",
      "unknown_message_class",
    ],
    externalTextHandling: "evidence_not_instruction",
  };
}

function syntheticExpansionAdapter(): Phase2ControlledUserFacingProactivityExpansionAdapter {
  return {
    kind: "gateway_chat_inject",
    deliver(input) {
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `expanded-default-${input.message.messageId}`,
        observableInOperatorUi: true,
        resultHash: sha256JsonValue({
          messageId: input.message.messageId,
          idempotencyKey: input.idempotencyKey,
        }),
        reasonCodes: ["gateway_chat_inject_delivered"],
      };
    },
  };
}

function hasSlice30OperatorDefaultProof(
  report: Phase2ProactiveMessageOperatorDefaultReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "approved_for_default_operator_visible_send_workflow" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.defaultVisibleOperatorSendWorkflowObserved &&
    report.telemetry.explicitSendApprovalRequired &&
    !report.telemetry.autonomousSendingAllowed &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved &&
    report.config.allowedMessageClasses.length === 1 &&
    report.config.allowedMessageClasses[0] === "operator_approved_suggestion_available",
  );
}

function hasSlice31ControlledExpansionProof(
  report: Phase2ControlledUserFacingProactivityExpansionReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "expanded_proactive_message_delivered" &&
    report.messageClass === "operator_approved_follow_up_available" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.explicitSendApproval &&
    report.telemetry.controlledOnlySecondClass &&
    report.telemetry.liveUserMessageSent &&
    report.telemetry.observableInOperatorUi &&
    !report.telemetry.autonomousSendingEnabled &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function hasProvenance(input: {
  operatorDefaultReport: Phase2ProactiveMessageOperatorDefaultReport | undefined;
  controlledExpansionReport: Phase2ControlledUserFacingProactivityExpansionReport | undefined;
}): boolean {
  return (
    input.operatorDefaultReport !== undefined &&
    input.controlledExpansionReport !== undefined &&
    input.operatorDefaultReport.telemetry.sourceRefIds.length > 0 &&
    input.operatorDefaultReport.telemetry.sourceProfileIds.length > 0 &&
    input.operatorDefaultReport.telemetry.authorityTiers.length > 0 &&
    input.controlledExpansionReport.telemetry.sourceRefIds.length > 0 &&
    input.controlledExpansionReport.telemetry.sourceProfileIds.length > 0 &&
    input.controlledExpansionReport.telemetry.authorityTiers.length > 0 &&
    (input.operatorDefaultReport.telemetry.contentHashes.length > 0 ||
      input.operatorDefaultReport.telemetry.proofHashes.length > 0) &&
    (input.controlledExpansionReport.telemetry.contentHashes.length > 0 ||
      input.controlledExpansionReport.telemetry.proofHashes.length > 0)
  );
}

function collectProofValues(input: {
  operatorDefaultReport: Phase2ProactiveMessageOperatorDefaultReport | undefined;
  controlledExpansionReport: Phase2ControlledUserFacingProactivityExpansionReport | undefined;
}): {
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
} {
  return {
    sourceProfileIds: uniqueSortedStrings([
      ...(input.operatorDefaultReport?.telemetry.sourceProfileIds ?? []),
      ...(input.controlledExpansionReport?.telemetry.sourceProfileIds ?? []),
    ]) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings([
      ...(input.operatorDefaultReport?.telemetry.authorityTiers ?? []),
      ...(input.controlledExpansionReport?.telemetry.authorityTiers ?? []),
    ]) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings([
      ...(input.operatorDefaultReport?.telemetry.sourceRefIds ?? []),
      ...(input.controlledExpansionReport?.telemetry.sourceRefIds ?? []),
    ]),
    contentHashes: uniqueSortedStrings([
      ...(input.operatorDefaultReport?.telemetry.contentHashes ?? []),
      ...(input.controlledExpansionReport?.telemetry.contentHashes ?? []),
    ]),
    proofHashes: uniqueSortedStrings([
      ...(input.operatorDefaultReport?.telemetry.proofHashes ?? []),
      ...(input.controlledExpansionReport?.telemetry.proofHashes ?? []),
      ...(input.operatorDefaultReport
        ? [sha256JsonValue(input.operatorDefaultReport as unknown as JsonLike)]
        : []),
      ...(input.controlledExpansionReport
        ? [sha256JsonValue(input.controlledExpansionReport as unknown as JsonLike)]
        : []),
    ]),
  };
}

function decide(input: {
  killed: boolean;
  slice30Ok: boolean;
  slice31Ok: boolean;
  noDarkDataOk: boolean;
  explicitSendApprovalRequired: boolean;
  autonomousOff: boolean;
  allowedClassesOk: boolean;
  provenanceOk: boolean;
}): Phase2ProactiveMessageExpandedOperatorDefaultDecision {
  if (input.killed || !input.noDarkDataOk || !input.explicitSendApprovalRequired) {
    return "blocked";
  }
  if (
    input.slice30Ok &&
    input.slice31Ok &&
    input.autonomousOff &&
    input.allowedClassesOk &&
    input.provenanceOk
  ) {
    return "approved_for_default_operator_visible_expanded_send_workflow";
  }
  if (input.slice30Ok || input.slice31Ok) {
    return "partial_approval";
  }
  return "blocked";
}

export async function buildPhase2ProactiveMessageExpandedOperatorDefaultReport(
  input: Phase2ProactiveMessageExpandedOperatorDefaultInput = {},
): Promise<Phase2ProactiveMessageExpandedOperatorDefaultReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const operatorDefaultReport =
    input.operatorDefaultReport === null
      ? undefined
      : (input.operatorDefaultReport ??
        (await buildPhase2ProactiveMessageOperatorDefaultReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const controlledExpansionReport =
    input.controlledExpansionReport === null
      ? undefined
      : (input.controlledExpansionReport ??
        (await buildPhase2ControlledUserFacingProactivityExpansionReport({
          now: input.now,
          proofMarker: input.proofMarker,
          operatorDefaultReport,
          explicitSendApproval: true,
          messageClass: "operator_approved_follow_up_available",
          adapter: syntheticExpansionAdapter(),
        })));
  const config = buildConfig(generatedAt);
  const slice30Ok = hasSlice30OperatorDefaultProof(operatorDefaultReport);
  const slice31Ok = hasSlice31ControlledExpansionProof(controlledExpansionReport);
  const noDarkDataOk =
    operatorDefaultReport?.noDarkDataStatus === "pass" &&
    controlledExpansionReport?.noDarkDataStatus === "pass";
  const explicitSendApprovalRequired =
    config.requireExplicitSendApproval &&
    (operatorDefaultReport?.telemetry.explicitSendApprovalRequired ?? false) &&
    (controlledExpansionReport?.telemetry.explicitSendApproval ?? false);
  const autonomousOff =
    !config.automaticSendAllowed &&
    !config.autonomousSendingAllowed &&
    !config.broadDefaultProactivityAllowed &&
    !(operatorDefaultReport?.telemetry.autonomousSendingAllowed ?? true) &&
    !(operatorDefaultReport?.telemetry.broadDefaultProactivityEnabled ?? true) &&
    !(operatorDefaultReport?.telemetry.actionExecutionObserved ?? true) &&
    !(controlledExpansionReport?.telemetry.autonomousSendingEnabled ?? true) &&
    !(controlledExpansionReport?.telemetry.broadDefaultProactivityEnabled ?? true) &&
    !(controlledExpansionReport?.telemetry.actionExecutionObserved ?? true);
  const allowedClassesOk =
    config.allowedMessageClasses.length === 2 &&
    config.allowedMessageClasses[0] === "operator_approved_suggestion_available" &&
    config.allowedMessageClasses[1] === "operator_approved_follow_up_available" &&
    operatorDefaultReport?.config.allowedMessageClasses[0] ===
      "operator_approved_suggestion_available" &&
    controlledExpansionReport?.messageClass === "operator_approved_follow_up_available";
  const provenanceOk = hasProvenance({ operatorDefaultReport, controlledExpansionReport });
  const checks: Phase2ProactiveMessageExpandedCheck[] = [];
  addCheck(checks, "proof:slice30_present", slice30Ok, "slice30_operator_default_proof_required");
  addCheck(
    checks,
    "proof:slice31_present",
    slice31Ok,
    "slice31_controlled_expansion_proof_required",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(
    checks,
    "send_approval:explicit_required",
    explicitSendApprovalRequired,
    "explicit_send_approval_required",
  );
  addCheck(checks, "autonomous_sending:off", autonomousOff, "autonomous_sending_must_remain_off");
  addCheck(
    checks,
    "message_classes:expanded_allowed_only",
    allowedClassesOk,
    "exact_two_low_risk_message_classes_required",
  );
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  const decision = decide({
    killed,
    slice30Ok,
    slice31Ok,
    noDarkDataOk,
    explicitSendApprovalRequired,
    autonomousOff,
    allowedClassesOk,
    provenanceOk,
  });
  const proofValues = collectProofValues({ operatorDefaultReport, controlledExpansionReport });
  const reasonCodes = uniqueSortedStrings(
    checks
      .filter((check) => check.status === "fail" || decision !== "blocked")
      .map((check) => check.reasonCode)
      .concat(decision),
  );
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactive_message_expanded_operator_default_report",
    targetId: "operator",
    seed: {
      generatedAt,
      proofMarker: input.proofMarker ?? null,
      operatorDefaultReportId: operatorDefaultReport?.reportId ?? null,
      controlledExpansionReportId: controlledExpansionReport?.reportId ?? null,
      decision,
    },
  });
  const capabilityDecision: Phase2ProactiveMessageExpandedCapabilityDecision = {
    capability: "operator_visible_expanded_proactive_message_send_workflow",
    decision,
    allowedMessageClasses: [...ALLOWED_CLASSES],
    explicitSendApprovalRequired: true,
    autonomousSendingAllowed: false,
    broadDefaultProactivityAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    reasonCodes,
  };
  const noDarkDataStatus = noDarkDataOk ? "pass" : "fail";
  const rollbackPlan: Phase2ProactiveMessageExpandedRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_message_expanded_operator_default_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_DISABLED",
    targetMode: "single_message_operator_default_workflow",
    disablesExpandedDefaultVisibleSendWorkflow: true,
  };
  const telemetry: Phase2ProactiveMessageExpandedTelemetry = {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    slice30OperatorDefaultReportId: operatorDefaultReport?.reportId,
    slice31ControlledExpansionReportId: controlledExpansionReport?.reportId,
    allowedMessageClasses: [...ALLOWED_CLASSES],
    sourceProfileIds: proofValues.sourceProfileIds,
    authorityTiers: proofValues.authorityTiers,
    sourceRefIds: proofValues.sourceRefIds,
    contentHashes: proofValues.contentHashes,
    proofHashes: proofValues.proofHashes,
    reasonCodes,
    noDarkDataStatus,
    rollbackObserved: killed,
    explicitSendApprovalRequired: true,
    defaultVisibleExpandedOperatorSendWorkflowObserved:
      decision === "approved_for_default_operator_visible_expanded_send_workflow",
    autonomousSendingAllowed: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ProactiveMessageExpandedOperatorDefaultReport = {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    capabilityDecision,
    slice30OperatorDefaultReportId: operatorDefaultReport?.reportId,
    slice31ControlledExpansionReportId: controlledExpansionReport?.reportId,
    checks,
    rollbackPlan,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ProactiveMessageExpandedOperatorDefaultReport;
}

export function assertPhase2ProactiveMessageExpandedOperatorDefaultApproved(
  report: Phase2ProactiveMessageExpandedOperatorDefaultReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_default_operator_visible_expanded_send_workflow") {
    throw new Error(`phase2 proactive expanded operator default not approved: ${report.decision}`);
  }
  if (!report.config.requireExplicitSendApproval) {
    throw new Error("phase2 proactive expanded operator default does not require send approval");
  }
  if (
    report.config.allowedMessageClasses.length !== 2 ||
    report.config.allowedMessageClasses[0] !== "operator_approved_suggestion_available" ||
    report.config.allowedMessageClasses[1] !== "operator_approved_follow_up_available"
  ) {
    throw new Error("phase2 proactive expanded operator default has unsafe message classes");
  }
  if (
    report.config.automaticSendAllowed ||
    report.config.autonomousSendingAllowed ||
    report.config.broadDefaultProactivityAllowed ||
    report.telemetry.autonomousSendingAllowed ||
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 proactive expanded operator default escaped approval boundary");
  }
}

export async function writePhase2ProactiveMessageExpandedOperatorDefaultArtifact(input: {
  report: Phase2ProactiveMessageExpandedOperatorDefaultReport;
  artifactDir: string;
}): Promise<Phase2ProactiveMessageExpandedOperatorDefaultArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactive-message-expanded-operator-default",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Expanded Proactive Message Operator Default Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- configId: ${input.report.config.configId}`,
    `- slice30OperatorDefaultReportId: ${input.report.slice30OperatorDefaultReportId ?? "none"}`,
    `- slice31ControlledExpansionReportId: ${
      input.report.slice31ControlledExpansionReportId ?? "none"
    }`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- explicitSendApprovalRequired: ${input.report.telemetry.explicitSendApprovalRequired}`,
    `- defaultVisibleExpandedOperatorSendWorkflowObserved: ${input.report.telemetry.defaultVisibleExpandedOperatorSendWorkflowObserved}`,
    `- autonomousSendingAllowed: ${input.report.telemetry.autonomousSendingAllowed}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    "",
    "## Allowed Message Classes",
    "",
    ...input.report.config.allowedMessageClasses.map((messageClass) => `- ${messageClass}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 proactive expanded operator default markdown exceeds byte limit");
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
