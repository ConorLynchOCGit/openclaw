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
  buildPhase2ControlledProactivitySuggestionReport,
  type Phase2ControlledProactivitySuggestionReport,
} from "./phase2-controlled-proactivity-suggestions.ts";
import {
  buildPhase2StagedActionApprovalReport,
  type Phase2StagedActionApprovalReport,
  type Phase2StagedActionProposal,
} from "./phase2-staged-action-approval-workflow.ts";

export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity.v1" as const;
export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_REPORT_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity_report.v1" as const;

export type Phase2ControlledProactiveMessageClass =
  | "operator_approved_suggestion_available"
  | "unapproved_suggestion"
  | "external_instruction_message"
  | "private_or_secret_content"
  | "raw_prompt_or_transcript_content"
  | "autonomous_action_request";

export type Phase2ControlledProactiveMessageDecision =
  | "controlled_proactive_message_proof_delivered"
  | "blocked_scope"
  | "blocked_missing_approval"
  | "blocked_missing_send_approval"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_message_class";

export type Phase2ControlledUserFacingProactivityScope = {
  sessionKey: string;
  operatorId: string;
  projectId: string;
  purpose: "operator_eval" | "operator_proof";
};

export type Phase2ControlledUserFacingProactivityPolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCHEMA_VERSION;
  policyId: string;
  allowedMessageClasses: ["operator_approved_suggestion_available"];
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireExplicitSendApproval: true;
  requireApprovedOperatorEvalScope: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  deliveryMode: "proof_delivery_artifact";
  actualLiveDeliveryEnabled: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledProactiveMessage = {
  messageId: string;
  messageClass: "operator_approved_suggestion_available";
  approvedSuggestionReportId: string;
  approvedProposalId: string;
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
  boundedDisplayText: "An approved operator suggestion is available.";
  rawContentIncluded: false;
  privateOrSecretContentIncluded: false;
  actionExecution: false;
};

export type Phase2ControlledProactiveMessageDeliveryResult = {
  deliveryId: string;
  messageId?: string;
  deliveryMode: "proof_delivery_artifact";
  delivered: boolean;
  liveUserMessageSent: false;
  resultHash: string;
  reasonCodes: string[];
};

export type Phase2ControlledProactiveMessageAuditEntry = {
  auditId: string;
  generatedAt: string;
  messageId?: string;
  proposalId?: string;
  approvalReportId?: string;
  operatorId: string;
  messageClass: Phase2ControlledProactiveMessageClass;
  decision: Phase2ControlledProactiveMessageDecision;
  explicitSendApproval: boolean;
  evidenceHashes: string[];
  reasonCodes: string[];
  actionExecution: false;
  liveUserMessageSent: false;
};

export type Phase2ControlledUserFacingProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED";
  targetMode: "operator_reports_only";
  disablesControlledMessageDelivery: true;
};

export type Phase2ControlledUserFacingProactivityTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledProactiveMessageDecision;
  messageClass: Phase2ControlledProactiveMessageClass;
  messageId?: string;
  deliveryId: string;
  approvalReportId?: string;
  suggestionReportId?: string;
  proposalId?: string;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitSendApproval: boolean;
  proofDeliveryArtifactWritten: boolean;
  liveUserMessageSent: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ControlledUserFacingProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledUserFacingProactivityReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledProactiveMessageDecision;
  policy: Phase2ControlledUserFacingProactivityPolicy;
  approvedScope: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
  requestScope: Phase2ControlledUserFacingProactivityScope;
  messageClass: Phase2ControlledProactiveMessageClass;
  message?: Phase2ControlledProactiveMessage;
  deliveryResult: Phase2ControlledProactiveMessageDeliveryResult;
  auditTrail: Phase2ControlledProactiveMessageAuditEntry[];
  checks: Phase2ControlledUserFacingProactivityCheck[];
  rollbackPlan: Phase2ControlledUserFacingProactivityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledUserFacingProactivityTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    blockedRunId?: string | null;
    approvalRunId?: string | null;
    deliveryRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ControlledUserFacingProactivityInput = {
  now?: Date;
  proofMarker?: string;
  suggestionReport?: Phase2ControlledProactivitySuggestionReport | null;
  approvalReport?: Phase2StagedActionApprovalReport | null;
  approvedScope?: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
  requestScope?: Phase2ControlledUserFacingProactivityScope;
  messageClass?: Phase2ControlledProactiveMessageClass;
  explicitSendApproval?: boolean;
  operatorId?: string;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ControlledUserFacingProactivityReport["uiEvidence"];
};

export type Phase2ControlledUserFacingProactivityArtifact = {
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
        `phase2 controlled user-facing proactivity contains prohibited field: ${[
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
        "phase2 controlled user-facing proactivity contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ControlledUserFacingProactivityCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function scopeMatches(input: {
  approvedScope: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
  requestScope: Phase2ControlledUserFacingProactivityScope;
}): boolean {
  return (
    input.approvedScope.sessionKey === input.requestScope.sessionKey &&
    input.approvedScope.operatorId === input.requestScope.operatorId &&
    input.approvedScope.projectId === input.requestScope.projectId &&
    (input.requestScope.purpose === "operator_eval" ||
      input.requestScope.purpose === "operator_proof")
  );
}

function hasProvenance(
  proposal: Phase2StagedActionProposal | undefined,
): proposal is Phase2StagedActionProposal {
  return Boolean(
    proposal &&
    proposal.sourceRefIds.length > 0 &&
    proposal.sourceProfileIds.length > 0 &&
    proposal.authorityTiers.length > 0 &&
    (proposal.contentHashes.length > 0 || proposal.proofHashes.length > 0),
  );
}

function isAllowedMessageClass(messageClass: Phase2ControlledProactiveMessageClass): boolean {
  return messageClass === "operator_approved_suggestion_available";
}

function buildPolicy(generatedAt: string): Phase2ControlledUserFacingProactivityPolicy {
  return {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_policy",
      targetId: "planner",
      seed: generatedAt,
    }),
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireExplicitSendApproval: true,
    requireApprovedOperatorEvalScope: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    deliveryMode: "proof_delivery_artifact",
    actualLiveDeliveryEnabled: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
}

function decisionFromChecks(input: {
  killed: boolean;
  scopeOk: boolean;
  messageClass: Phase2ControlledProactiveMessageClass;
  suggestionReport: Phase2ControlledProactivitySuggestionReport | undefined;
  approvalReport: Phase2StagedActionApprovalReport | undefined;
  proposal: Phase2StagedActionProposal | undefined;
  explicitSendApproval: boolean;
  provenanceOk: boolean;
}): Phase2ControlledProactiveMessageDecision {
  if (input.killed) {
    return "blocked_rollback";
  }
  if (!input.scopeOk) {
    return "blocked_scope";
  }
  if (!isAllowedMessageClass(input.messageClass)) {
    return "blocked_message_class";
  }
  if (
    input.suggestionReport?.noDarkDataStatus === "fail" ||
    input.approvalReport?.noDarkDataStatus === "fail"
  ) {
    return "blocked_no_dark_data";
  }
  if (
    input.suggestionReport?.decision !== "controlled_suggestions_observed" ||
    input.approvalReport?.decision !== "approval_workflow_observed" ||
    !input.proposal?.approved
  ) {
    return "blocked_missing_approval";
  }
  if (!input.explicitSendApproval) {
    return "blocked_missing_send_approval";
  }
  if (!input.provenanceOk) {
    return "blocked_provenance";
  }
  return "controlled_proactive_message_proof_delivered";
}

function buildMessage(input: {
  generatedAt: string;
  suggestionReport: Phase2ControlledProactivitySuggestionReport;
  approvalReport: Phase2StagedActionApprovalReport;
  proposal: Phase2StagedActionProposal;
}): Phase2ControlledProactiveMessage {
  const proofHashes = uniqueSortedStrings([
    ...input.proposal.proofHashes,
    sha256JsonValue(input.suggestionReport as unknown as JsonLike),
    sha256JsonValue(input.approvalReport as unknown as JsonLike),
  ]);
  return {
    messageId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactive_message",
      targetId: input.proposal.proposalId,
      seed: input.generatedAt,
    }),
    messageClass: "operator_approved_suggestion_available",
    approvedSuggestionReportId: input.suggestionReport.reportId,
    approvedProposalId: input.proposal.proposalId,
    sourceRefIds: [...input.proposal.sourceRefIds],
    sourceProfileIds: [...input.proposal.sourceProfileIds],
    authorityTiers: [...input.proposal.authorityTiers],
    contentHashes: [...input.proposal.contentHashes],
    proofHashes,
    noDarkDataStatus: "pass",
    boundedDisplayText: "An approved operator suggestion is available.",
    rawContentIncluded: false,
    privateOrSecretContentIncluded: false,
    actionExecution: false,
  };
}

function buildDeliveryResult(input: {
  generatedAt: string;
  decision: Phase2ControlledProactiveMessageDecision;
  message: Phase2ControlledProactiveMessage | undefined;
}): Phase2ControlledProactiveMessageDeliveryResult {
  const delivered = input.decision === "controlled_proactive_message_proof_delivered";
  return {
    deliveryId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactive_message_delivery",
      targetId: input.message?.messageId ?? "blocked",
      seed: { generatedAt: input.generatedAt, decision: input.decision },
    }),
    messageId: input.message?.messageId,
    deliveryMode: "proof_delivery_artifact",
    delivered,
    liveUserMessageSent: false,
    resultHash: sha256JsonValue({
      messageId: input.message?.messageId ?? null,
      decision: input.decision,
      deliveryMode: "proof_delivery_artifact",
    }),
    reasonCodes: delivered
      ? ["controlled_user_facing_proactivity_proof_delivered"]
      : [input.decision],
  };
}

export async function buildPhase2ControlledUserFacingProactivityReport(
  input: Phase2ControlledUserFacingProactivityInput = {},
): Promise<Phase2ControlledUserFacingProactivityReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const approvedScope = input.approvedScope ?? {
    sessionKey: "main",
    operatorId: input.operatorId ?? "phase2-operator",
    projectId: "openclaw",
  };
  const requestScope = input.requestScope ?? { ...approvedScope, purpose: "operator_eval" };
  const prerequisiteRequestScope = {
    ...requestScope,
    purpose: "operator_eval" as const,
  };
  const messageClass = input.messageClass ?? "operator_approved_suggestion_available";
  const explicitSendApproval = input.explicitSendApproval === true;
  const killed = readKillSwitch(input.env);
  const suggestionReport =
    input.suggestionReport === null
      ? undefined
      : (input.suggestionReport ??
        (await buildPhase2ControlledProactivitySuggestionReport({
          now: input.now,
          proofMarker: input.proofMarker,
          approvedScope,
          requestScope: prerequisiteRequestScope,
          env: input.env,
        })));
  const approvalReport =
    input.approvalReport === null
      ? undefined
      : (input.approvalReport ??
        (await buildPhase2StagedActionApprovalReport({
          now: input.now,
          proofMarker: input.proofMarker,
          approvedScope,
          requestScope: prerequisiteRequestScope,
          controlledSuggestionReport: suggestionReport,
          operatorDecision: "approve",
          operatorId: approvedScope.operatorId,
          env: input.env,
        })));
  const proposal = approvalReport?.proposals.find((candidate) => candidate.approved);
  const scopeOk = scopeMatches({ approvedScope, requestScope });
  const provenanceOk = hasProvenance(proposal);
  const policy = buildPolicy(generatedAt);
  const checks: Phase2ControlledUserFacingProactivityCheck[] = [];
  addCheck(checks, "scope:approved", scopeOk, "approved_operator_eval_scope_required");
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(
    checks,
    "message_class:allowed",
    isAllowedMessageClass(messageClass),
    "allowed_low_risk_message_class_required",
  );
  addCheck(
    checks,
    "suggestion:approved",
    suggestionReport?.decision === "controlled_suggestions_observed",
    "approved_controlled_suggestion_required",
  );
  addCheck(
    checks,
    "approval:staged",
    approvalReport?.decision === "approval_workflow_observed" && proposal?.approved === true,
    "staged_approval_required",
  );
  addCheck(
    checks,
    "send_approval:explicit",
    explicitSendApproval,
    "explicit_send_approval_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    suggestionReport?.noDarkDataStatus === "pass" && approvalReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  const decision = decisionFromChecks({
    killed,
    scopeOk,
    messageClass,
    suggestionReport,
    approvalReport,
    proposal,
    explicitSendApproval,
    provenanceOk,
  });
  const message =
    decision === "controlled_proactive_message_proof_delivered" &&
    suggestionReport &&
    approvalReport &&
    proposal
      ? buildMessage({ generatedAt, suggestionReport, approvalReport, proposal })
      : undefined;
  const deliveryResult = buildDeliveryResult({ generatedAt, decision, message });
  const auditEntry: Phase2ControlledProactiveMessageAuditEntry = {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_audit_entry",
      targetId: proposal?.proposalId ?? "missing-proposal",
      seed: { generatedAt, decision, messageClass },
    }),
    generatedAt,
    messageId: message?.messageId,
    proposalId: proposal?.proposalId,
    approvalReportId: approvalReport?.reportId,
    operatorId: proposal?.operatorId ?? approvedScope.operatorId,
    messageClass,
    decision,
    explicitSendApproval,
    evidenceHashes: uniqueSortedStrings(
      (proposal?.contentHashes ?? []).concat(proposal?.proofHashes ?? []),
    ),
    reasonCodes: deliveryResult.reasonCodes,
    actionExecution: false,
    liveUserMessageSent: false,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_proactivity_report",
    targetId: approvedScope.operatorId,
    seed: {
      generatedAt,
      messageClass,
      decision,
      suggestionReportId: suggestionReport?.reportId ?? null,
      approvalReportId: approvalReport?.reportId ?? null,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2ControlledUserFacingProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED",
    targetMode: "operator_reports_only",
    disablesControlledMessageDelivery: true,
  };
  const noDarkDataStatus =
    suggestionReport?.noDarkDataStatus === "pass" && approvalReport?.noDarkDataStatus === "pass"
      ? "pass"
      : "fail";
  const telemetry: Phase2ControlledUserFacingProactivityTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCHEMA_VERSION,
    reportId,
    decision,
    messageClass,
    messageId: message?.messageId,
    deliveryId: deliveryResult.deliveryId,
    approvalReportId: approvalReport?.reportId,
    suggestionReportId: suggestionReport?.reportId,
    proposalId: proposal?.proposalId,
    sourceProfileIds: uniqueSortedStrings(message?.sourceProfileIds ?? []) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(message?.authorityTiers ?? []) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(message?.sourceRefIds ?? []),
    contentHashes: uniqueSortedStrings(message?.contentHashes ?? []),
    proofHashes: uniqueSortedStrings(message?.proofHashes ?? []),
    reasonCodes: uniqueSortedStrings(
      checks.map((check) => check.reasonCode).concat(deliveryResult.reasonCodes),
    ),
    noDarkDataStatus,
    rollbackObserved: killed || decision === "blocked_rollback",
    explicitSendApproval,
    proofDeliveryArtifactWritten: decision === "controlled_proactive_message_proof_delivered",
    liveUserMessageSent: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ControlledUserFacingProactivityReport = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    approvedScope,
    requestScope,
    messageClass,
    message,
    deliveryResult,
    auditTrail: [auditEntry],
    checks,
    rollbackPlan,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ControlledUserFacingProactivityReport;
}

export function assertPhase2ControlledUserFacingProactivityProven(
  report: Phase2ControlledUserFacingProactivityReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "controlled_proactive_message_proof_delivered") {
    throw new Error(`phase2 controlled user-facing proactivity not proven: ${report.decision}`);
  }
  if (!report.message || !report.deliveryResult.delivered) {
    throw new Error("phase2 controlled user-facing proactivity emitted no proof delivery");
  }
  if (
    report.policy.actualLiveDeliveryEnabled ||
    report.policy.broadDefaultProactivityEnabled ||
    report.telemetry.liveUserMessageSent ||
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 controlled user-facing proactivity escaped controlled boundary");
  }
}

export async function writePhase2ControlledUserFacingProactivityArtifact(input: {
  report: Phase2ControlledUserFacingProactivityReport;
  artifactDir: string;
}): Promise<Phase2ControlledUserFacingProactivityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-user-facing-proactivity",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Controlled User-Facing Proactivity Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- messageClass: ${input.report.messageClass}`,
    `- messageId: ${input.report.message?.messageId ?? "none"}`,
    `- deliveryMode: ${input.report.deliveryResult.deliveryMode}`,
    `- liveUserMessageSent: ${input.report.telemetry.liveUserMessageSent}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    "",
    "## Audit IDs",
    "",
    ...input.report.auditTrail.map((entry) => `- ${entry.auditId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 controlled user-facing proactivity markdown exceeds byte limit");
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
