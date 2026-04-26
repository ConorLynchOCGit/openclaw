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
  buildPhase2ControlledUserFacingProactivityReport,
  type Phase2ControlledUserFacingProactivityReport,
} from "./phase2-controlled-user-facing-proactivity.ts";
import {
  buildPhase2LiveProactiveMessageDeliveryReport,
  type Phase2LiveProactiveMessageDeliveryReport,
} from "./phase2-live-proactive-message-delivery.ts";

export const PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_SCHEMA_VERSION =
  "phase2_proactive_message_operator_default.v1" as const;
export const PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION =
  "phase2_proactive_message_operator_default_report.v1" as const;

export type Phase2ProactiveMessageOperatorDefaultDecision =
  | "approved_for_default_operator_visible_send_workflow"
  | "partial_approval"
  | "blocked";

export type Phase2ProactiveMessageOperatorDefaultCapabilityDecision = {
  capability: "operator_visible_proactive_message_send_workflow";
  decision: Phase2ProactiveMessageOperatorDefaultDecision;
  allowedMessageClasses: ["operator_approved_suggestion_available"];
  explicitSendApprovalRequired: true;
  autonomousSendingAllowed: false;
  broadDefaultProactivityAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  reasonCodes: string[];
};

export type Phase2ProactiveMessageOperatorDefaultConfig = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_SCHEMA_VERSION;
  configId: string;
  mode: "default_operator_visible_send_workflow";
  allowedMessageClasses: ["operator_approved_suggestion_available"];
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
  ];
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ProactiveMessageOperatorDefaultRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_DISABLED";
  targetMode: "controlled_operator_eval_only";
  disablesDefaultVisibleSendWorkflow: true;
};

export type Phase2ProactiveMessageOperatorDefaultTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ProactiveMessageOperatorDefaultDecision;
  configId: string;
  controlledUserFacingProactivityReportId?: string;
  liveDeliveryReportId?: string;
  allowedMessageClasses: ["operator_approved_suggestion_available"];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitSendApprovalRequired: true;
  defaultVisibleOperatorSendWorkflowObserved: boolean;
  autonomousSendingAllowed: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProactiveMessageOperatorDefaultCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ProactiveMessageOperatorDefaultReport = {
  schemaVersion: typeof PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactiveMessageOperatorDefaultDecision;
  config: Phase2ProactiveMessageOperatorDefaultConfig;
  capabilityDecision: Phase2ProactiveMessageOperatorDefaultCapabilityDecision;
  controlledUserFacingProactivityReportId?: string;
  liveDeliveryReportId?: string;
  checks: Phase2ProactiveMessageOperatorDefaultCheck[];
  rollbackPlan: Phase2ProactiveMessageOperatorDefaultRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ProactiveMessageOperatorDefaultTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    reviewRunId?: string | null;
    sendApprovalRunId?: string | null;
    deliveryRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    observedDeliveryTextSha256?: string;
  };
};

export type Phase2ProactiveMessageOperatorDefaultInput = {
  now?: Date;
  proofMarker?: string;
  controlledUserFacingProactivityReport?: Phase2ControlledUserFacingProactivityReport | null;
  liveDeliveryReport?: Phase2LiveProactiveMessageDeliveryReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactiveMessageOperatorDefaultReport["uiEvidence"];
};

export type Phase2ProactiveMessageOperatorDefaultArtifact = {
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
        `phase2 proactive message operator default contains prohibited field: ${[
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
        "phase2 proactive message operator default contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ProactiveMessageOperatorDefaultCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function hasControlledProof(
  report: Phase2ControlledUserFacingProactivityReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "controlled_proactive_message_proof_delivered" &&
    report.messageClass === "operator_approved_suggestion_available" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.explicitSendApproval &&
    !report.telemetry.liveUserMessageSent &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function hasLiveDeliveryProof(
  report: Phase2LiveProactiveMessageDeliveryReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "live_proactive_message_delivered" &&
    report.controlledReport.messageClass === "operator_approved_suggestion_available" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.explicitSendApproval &&
    report.telemetry.liveUserMessageSent &&
    report.telemetry.observableInOperatorUi &&
    !report.telemetry.autonomousSendingEnabled &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function collectProofValues(input: {
  controlledReport: Phase2ControlledUserFacingProactivityReport | undefined;
  liveDeliveryReport: Phase2LiveProactiveMessageDeliveryReport | undefined;
}): {
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
} {
  return {
    sourceProfileIds: uniqueSortedStrings([
      ...(input.controlledReport?.telemetry.sourceProfileIds ?? []),
      ...(input.liveDeliveryReport?.telemetry.sourceProfileIds ?? []),
    ]) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings([
      ...(input.controlledReport?.telemetry.authorityTiers ?? []),
      ...(input.liveDeliveryReport?.telemetry.authorityTiers ?? []),
    ]) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings([
      ...(input.controlledReport?.telemetry.sourceRefIds ?? []),
      ...(input.liveDeliveryReport?.telemetry.sourceRefIds ?? []),
    ]),
    contentHashes: uniqueSortedStrings([
      ...(input.controlledReport?.telemetry.contentHashes ?? []),
      ...(input.liveDeliveryReport?.telemetry.contentHashes ?? []),
    ]),
    proofHashes: uniqueSortedStrings([
      ...(input.controlledReport?.telemetry.proofHashes ?? []),
      ...(input.liveDeliveryReport?.telemetry.proofHashes ?? []),
      ...(input.controlledReport
        ? [sha256JsonValue(input.controlledReport as unknown as JsonLike)]
        : []),
      ...(input.liveDeliveryReport
        ? [sha256JsonValue(input.liveDeliveryReport as unknown as JsonLike)]
        : []),
    ]),
  };
}

function buildConfig(generatedAt: string): Phase2ProactiveMessageOperatorDefaultConfig {
  return {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_message_operator_default_config",
      targetId: "operator",
      seed: generatedAt,
    }),
    mode: "default_operator_visible_send_workflow",
    allowedMessageClasses: ["operator_approved_suggestion_available"],
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
    ],
    externalTextHandling: "evidence_not_instruction",
  };
}

function decide(input: {
  killed: boolean;
  controlledProofOk: boolean;
  liveProofOk: boolean;
  noDarkDataOk: boolean;
  sendApprovalRequired: boolean;
  autonomousOff: boolean;
  allowedClassOnly: boolean;
}): Phase2ProactiveMessageOperatorDefaultDecision {
  if (input.killed) {
    return "blocked";
  }
  if (
    input.controlledProofOk &&
    input.liveProofOk &&
    input.noDarkDataOk &&
    input.sendApprovalRequired &&
    input.autonomousOff &&
    input.allowedClassOnly
  ) {
    return "approved_for_default_operator_visible_send_workflow";
  }
  if (input.controlledProofOk || input.liveProofOk) {
    return "partial_approval";
  }
  return "blocked";
}

export async function buildPhase2ProactiveMessageOperatorDefaultReport(
  input: Phase2ProactiveMessageOperatorDefaultInput = {},
): Promise<Phase2ProactiveMessageOperatorDefaultReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const liveDeliveryReport =
    input.liveDeliveryReport === null
      ? undefined
      : (input.liveDeliveryReport ??
        (await buildPhase2LiveProactiveMessageDeliveryReport({
          now: input.now,
          proofMarker: input.proofMarker,
          explicitSendApproval: true,
          adapter: {
            kind: "gateway_chat_inject",
            deliver(deliveryInput) {
              return {
                ok: true,
                adapterKind: "gateway_chat_inject",
                delivered: true,
                messageId: `operator-default-${deliveryInput.message.messageId}`,
                observableInOperatorUi: true,
                resultHash: sha256JsonValue({
                  messageId: deliveryInput.message.messageId,
                  idempotencyKey: deliveryInput.idempotencyKey,
                }),
                reasonCodes: ["gateway_chat_inject_delivered"],
              };
            },
          },
        })));
  const controlledReport =
    input.controlledUserFacingProactivityReport === null
      ? undefined
      : (input.controlledUserFacingProactivityReport ??
        liveDeliveryReport?.controlledReport ??
        (await buildPhase2ControlledUserFacingProactivityReport({
          now: input.now,
          proofMarker: input.proofMarker,
          explicitSendApproval: true,
        })));
  const config = buildConfig(generatedAt);
  const controlledProofOk = hasControlledProof(controlledReport);
  const liveProofOk = hasLiveDeliveryProof(liveDeliveryReport);
  const noDarkDataOk =
    controlledReport?.noDarkDataStatus === "pass" &&
    liveDeliveryReport?.noDarkDataStatus === "pass";
  const sendApprovalRequired =
    config.requireExplicitSendApproval &&
    controlledReport?.policy.requireExplicitSendApproval === true &&
    liveDeliveryReport?.policy.requireExplicitSendApproval === true &&
    (controlledReport?.telemetry.explicitSendApproval ?? false) &&
    (liveDeliveryReport?.telemetry.explicitSendApproval ?? false);
  const autonomousOff =
    !config.automaticSendAllowed &&
    !config.autonomousSendingAllowed &&
    !config.broadDefaultProactivityAllowed &&
    !(liveDeliveryReport?.telemetry.autonomousSendingEnabled ?? true) &&
    !(liveDeliveryReport?.telemetry.broadDefaultProactivityEnabled ?? true) &&
    !(controlledReport?.telemetry.broadDefaultProactivityEnabled ?? true);
  const allowedClassOnly =
    config.allowedMessageClasses.length === 1 &&
    config.allowedMessageClasses[0] === "operator_approved_suggestion_available" &&
    liveDeliveryReport?.controlledReport.messageClass ===
      "operator_approved_suggestion_available" &&
    controlledReport?.messageClass === "operator_approved_suggestion_available";
  const checks: Phase2ProactiveMessageOperatorDefaultCheck[] = [];
  addCheck(
    checks,
    "proof:slice28_present",
    controlledProofOk,
    "slice28_controlled_user_facing_proactivity_proof_required",
  );
  addCheck(checks, "proof:slice29_present", liveProofOk, "slice29_live_delivery_proof_required");
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(
    checks,
    "send_approval:explicit_required",
    sendApprovalRequired,
    "explicit_send_approval_required",
  );
  addCheck(checks, "autonomous_sending:off", autonomousOff, "autonomous_sending_must_remain_off");
  addCheck(
    checks,
    "message_class:allowed_only",
    allowedClassOnly,
    "approved_low_risk_message_class_only",
  );
  const decision = decide({
    killed,
    controlledProofOk,
    liveProofOk,
    noDarkDataOk,
    sendApprovalRequired,
    autonomousOff,
    allowedClassOnly,
  });
  const proofValues = collectProofValues({ controlledReport, liveDeliveryReport });
  const reasonCodes = uniqueSortedStrings(
    checks
      .filter((check) => check.status === "fail" || decision !== "blocked")
      .map((check) => check.reasonCode)
      .concat(decision),
  );
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactive_message_operator_default_report",
    targetId: "operator",
    seed: {
      generatedAt,
      proofMarker: input.proofMarker ?? null,
      controlledReportId: controlledReport?.reportId ?? null,
      liveDeliveryReportId: liveDeliveryReport?.reportId ?? null,
      decision,
    },
  });
  const capabilityDecision: Phase2ProactiveMessageOperatorDefaultCapabilityDecision = {
    capability: "operator_visible_proactive_message_send_workflow",
    decision,
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    explicitSendApprovalRequired: true,
    autonomousSendingAllowed: false,
    broadDefaultProactivityAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    reasonCodes,
  };
  const noDarkDataStatus = noDarkDataOk ? "pass" : "fail";
  const rollbackPlan: Phase2ProactiveMessageOperatorDefaultRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_message_operator_default_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_DISABLED",
    targetMode: "controlled_operator_eval_only",
    disablesDefaultVisibleSendWorkflow: true,
  };
  const telemetry: Phase2ProactiveMessageOperatorDefaultTelemetry = {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    controlledUserFacingProactivityReportId: controlledReport?.reportId,
    liveDeliveryReportId: liveDeliveryReport?.reportId,
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    sourceProfileIds: proofValues.sourceProfileIds,
    authorityTiers: proofValues.authorityTiers,
    sourceRefIds: proofValues.sourceRefIds,
    contentHashes: proofValues.contentHashes,
    proofHashes: proofValues.proofHashes,
    reasonCodes,
    noDarkDataStatus,
    rollbackObserved: killed,
    explicitSendApprovalRequired: true,
    defaultVisibleOperatorSendWorkflowObserved:
      decision === "approved_for_default_operator_visible_send_workflow",
    autonomousSendingAllowed: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ProactiveMessageOperatorDefaultReport = {
    schemaVersion: PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    capabilityDecision,
    controlledUserFacingProactivityReportId: controlledReport?.reportId,
    liveDeliveryReportId: liveDeliveryReport?.reportId,
    checks,
    rollbackPlan,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ProactiveMessageOperatorDefaultReport;
}

export function assertPhase2ProactiveMessageOperatorDefaultApproved(
  report: Phase2ProactiveMessageOperatorDefaultReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_default_operator_visible_send_workflow") {
    throw new Error(`phase2 proactive message operator default not approved: ${report.decision}`);
  }
  if (!report.config.requireExplicitSendApproval) {
    throw new Error("phase2 proactive message operator default does not require send approval");
  }
  if (
    report.config.automaticSendAllowed ||
    report.config.autonomousSendingAllowed ||
    report.config.broadDefaultProactivityAllowed ||
    report.telemetry.autonomousSendingAllowed ||
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 proactive message operator default escaped approval boundary");
  }
}

export async function writePhase2ProactiveMessageOperatorDefaultArtifact(input: {
  report: Phase2ProactiveMessageOperatorDefaultReport;
  artifactDir: string;
}): Promise<Phase2ProactiveMessageOperatorDefaultArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactive-message-operator-default",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Proactive Message Operator Default Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- configId: ${input.report.config.configId}`,
    `- controlledUserFacingProactivityReportId: ${
      input.report.controlledUserFacingProactivityReportId ?? "none"
    }`,
    `- liveDeliveryReportId: ${input.report.liveDeliveryReportId ?? "none"}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- explicitSendApprovalRequired: ${input.report.telemetry.explicitSendApprovalRequired}`,
    `- defaultVisibleOperatorSendWorkflowObserved: ${input.report.telemetry.defaultVisibleOperatorSendWorkflowObserved}`,
    `- autonomousSendingAllowed: ${input.report.telemetry.autonomousSendingAllowed}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    "",
    "## Allowed Message Classes",
    "",
    ...input.report.config.allowedMessageClasses.map((messageClass) => `- ${messageClass}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 proactive message operator default markdown exceeds byte limit");
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
