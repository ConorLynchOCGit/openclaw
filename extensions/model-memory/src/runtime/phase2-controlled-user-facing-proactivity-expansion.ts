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
  buildPhase2ProactiveMessageOperatorDefaultReport,
  type Phase2ProactiveMessageOperatorDefaultReport,
} from "./phase2-proactive-message-operator-default.ts";

export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity_expansion.v1" as const;
export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_REPORT_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity_expansion_report.v1" as const;

export type Phase2ExpandedProactiveMessageClass =
  | "operator_approved_suggestion_available"
  | "operator_approved_follow_up_available"
  | "unapproved_suggestion"
  | "external_instruction_message"
  | "private_or_secret_content"
  | "raw_prompt_or_transcript_content"
  | "autonomous_action_request"
  | "unknown_message_class";

export type Phase2ControlledUserFacingProactivityExpansionDecision =
  | "expanded_proactive_message_delivered"
  | "blocked_scope"
  | "blocked_missing_operator_default_proof"
  | "blocked_missing_send_approval"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_message_class"
  | "blocked_delivery_adapter";

export type Phase2ControlledUserFacingProactivityExpansionScope = {
  sessionKey: string;
  operatorId: string;
  projectId: string;
  purpose: "operator_eval" | "operator_proof";
};

export type Phase2ControlledUserFacingProactivityExpansionPolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_SCHEMA_VERSION;
  policyId: string;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  defaultVisibleMessageClasses: ["operator_approved_suggestion_available"];
  controlledOnlyMessageClasses: ["operator_approved_follow_up_available"];
  requireOperatorDefaultProof: true;
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireExplicitSendApproval: true;
  requireApprovedOperatorEvalScope: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  deliveryAdapterKind: "gateway_chat_inject";
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledUserFacingProactivityExpansionConfig = {
  configId: string;
  mode: "controlled_operator_eval_expansion";
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  defaultVisibleMessageClasses: ["operator_approved_suggestion_available"];
  controlledOnlyMessageClasses: ["operator_approved_follow_up_available"];
  enabled: boolean;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
};

export type Phase2ControlledUserFacingProactivityExpansionMessage = {
  messageId: string;
  messageClass: "operator_approved_suggestion_available" | "operator_approved_follow_up_available";
  operatorDefaultReportId: string;
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
  boundedDisplayText:
    | "An approved operator suggestion is available."
    | "An approved follow-up suggestion is available.";
  rawContentIncluded: false;
  privateOrSecretContentIncluded: false;
  actionExecution: false;
};

export type Phase2ControlledUserFacingProactivityExpansionAdapterInput = {
  sessionKey: string;
  message: Phase2ControlledUserFacingProactivityExpansionMessage;
  boundedDisplayText: Phase2ControlledUserFacingProactivityExpansionMessage["boundedDisplayText"];
  label: "Model Memory";
  idempotencyKey: string;
};

export type Phase2ControlledUserFacingProactivityExpansionAdapterResult = {
  ok: boolean;
  adapterKind: "gateway_chat_inject";
  delivered: boolean;
  messageId?: string;
  observableInOperatorUi: boolean;
  resultHash: string;
  reasonCodes: string[];
};

export type Phase2ControlledUserFacingProactivityExpansionAdapter = {
  kind: "gateway_chat_inject";
  deliver: (
    input: Phase2ControlledUserFacingProactivityExpansionAdapterInput,
  ) =>
    | Phase2ControlledUserFacingProactivityExpansionAdapterResult
    | Promise<Phase2ControlledUserFacingProactivityExpansionAdapterResult>;
};

export type Phase2ControlledUserFacingProactivityExpansionDeliveryResult = {
  deliveryId: string;
  messageId?: string;
  adapterMessageId?: string;
  deliveryMode: "gateway_chat_inject";
  delivered: boolean;
  observableInOperatorUi: boolean;
  liveUserMessageSent: boolean;
  resultHash: string;
  reasonCodes: string[];
};

export type Phase2ControlledUserFacingProactivityExpansionAuditEntry = {
  auditId: string;
  generatedAt: string;
  messageId?: string;
  operatorDefaultReportId?: string;
  sendApprovalId: string;
  deliveryId: string;
  operatorId: string;
  messageClass: Phase2ExpandedProactiveMessageClass;
  decision: Phase2ControlledUserFacingProactivityExpansionDecision;
  evidenceHashes: string[];
  reasonCodes: string[];
  actionExecution: false;
  autonomousSending: false;
};

export type Phase2ControlledUserFacingProactivityExpansionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED";
  targetMode: "single_operator_default_message_class_only";
  disablesExpandedControlledDelivery: true;
};

export type Phase2ControlledUserFacingProactivityExpansionTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledUserFacingProactivityExpansionDecision;
  configId: string;
  operatorDefaultReportId?: string;
  messageClass: Phase2ExpandedProactiveMessageClass;
  messageId?: string;
  deliveryId: string;
  adapterMessageId?: string;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitSendApproval: boolean;
  controlledOnlySecondClass: boolean;
  liveUserMessageSent: boolean;
  observableInOperatorUi: boolean;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ControlledUserFacingProactivityExpansionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledUserFacingProactivityExpansionReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledUserFacingProactivityExpansionDecision;
  policy: Phase2ControlledUserFacingProactivityExpansionPolicy;
  config: Phase2ControlledUserFacingProactivityExpansionConfig;
  approvedScope: Omit<Phase2ControlledUserFacingProactivityExpansionScope, "purpose">;
  requestScope: Phase2ControlledUserFacingProactivityExpansionScope;
  operatorDefaultReport?: Phase2ProactiveMessageOperatorDefaultReport;
  messageClass: Phase2ExpandedProactiveMessageClass;
  message?: Phase2ControlledUserFacingProactivityExpansionMessage;
  deliveryResult: Phase2ControlledUserFacingProactivityExpansionDeliveryResult;
  auditTrail: Phase2ControlledUserFacingProactivityExpansionAuditEntry[];
  checks: Phase2ControlledUserFacingProactivityExpansionCheck[];
  rollbackPlan: Phase2ControlledUserFacingProactivityExpansionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledUserFacingProactivityExpansionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    firstClassDeliveryId?: string | null;
    secondClassDeliveryId?: string | null;
    observedDeliveryTextSha256?: string;
    terminalEvidence: boolean;
  };
};

export type Phase2ControlledUserFacingProactivityExpansionInput = {
  now?: Date;
  proofMarker?: string;
  operatorDefaultReport?: Phase2ProactiveMessageOperatorDefaultReport | null;
  approvedScope?: Omit<Phase2ControlledUserFacingProactivityExpansionScope, "purpose">;
  requestScope?: Phase2ControlledUserFacingProactivityExpansionScope;
  explicitSendApproval?: boolean;
  messageClass?: Phase2ExpandedProactiveMessageClass;
  operatorId?: string;
  env?: Record<string, string | undefined>;
  adapter?: Phase2ControlledUserFacingProactivityExpansionAdapter;
  uiEvidence?: Phase2ControlledUserFacingProactivityExpansionReport["uiEvidence"];
};

export type Phase2ControlledUserFacingProactivityExpansionArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_MESSAGE_CLASSES = [
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
        `phase2 controlled proactivity expansion contains prohibited field: ${[
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
      throw new Error("phase2 controlled proactivity expansion contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ControlledUserFacingProactivityExpansionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function isAllowedMessageClass(
  messageClass: Phase2ExpandedProactiveMessageClass,
): messageClass is (typeof ALLOWED_MESSAGE_CLASSES)[number] {
  return (ALLOWED_MESSAGE_CLASSES as readonly string[]).includes(messageClass);
}

function boundedDisplayText(
  messageClass: (typeof ALLOWED_MESSAGE_CLASSES)[number],
): Phase2ControlledUserFacingProactivityExpansionMessage["boundedDisplayText"] {
  if (messageClass === "operator_approved_follow_up_available") {
    return "An approved follow-up suggestion is available.";
  }
  return "An approved operator suggestion is available.";
}

function hasScopeMatch(
  approvedScope: Omit<Phase2ControlledUserFacingProactivityExpansionScope, "purpose">,
  requestScope: Phase2ControlledUserFacingProactivityExpansionScope,
): boolean {
  return (
    approvedScope.sessionKey === requestScope.sessionKey &&
    approvedScope.operatorId === requestScope.operatorId &&
    approvedScope.projectId === requestScope.projectId &&
    (requestScope.purpose === "operator_eval" || requestScope.purpose === "operator_proof")
  );
}

function hasOperatorDefaultProof(
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
    !report.telemetry.actionExecutionObserved,
  );
}

function hasProvenance(report: Phase2ProactiveMessageOperatorDefaultReport | undefined): boolean {
  return Boolean(
    report &&
    report.telemetry.sourceRefIds.length > 0 &&
    report.telemetry.sourceProfileIds.length > 0 &&
    report.telemetry.authorityTiers.length > 0 &&
    (report.telemetry.contentHashes.length > 0 || report.telemetry.proofHashes.length > 0),
  );
}

function buildPolicy(generatedAt: string): Phase2ControlledUserFacingProactivityExpansionPolicy {
  return {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_expansion_policy",
      targetId: "operator",
      seed: generatedAt,
    }),
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
    defaultVisibleMessageClasses: ["operator_approved_suggestion_available"],
    controlledOnlyMessageClasses: ["operator_approved_follow_up_available"],
    requireOperatorDefaultProof: true,
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireExplicitSendApproval: true,
    requireApprovedOperatorEvalScope: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    deliveryAdapterKind: "gateway_chat_inject",
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
}

function buildConfig(generatedAt: string): Phase2ControlledUserFacingProactivityExpansionConfig {
  return {
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_expansion_config",
      targetId: "operator",
      seed: generatedAt,
    }),
    mode: "controlled_operator_eval_expansion",
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
    defaultVisibleMessageClasses: ["operator_approved_suggestion_available"],
    controlledOnlyMessageClasses: ["operator_approved_follow_up_available"],
    enabled: true,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
  };
}

export async function buildPhase2ControlledUserFacingProactivityExpansionReport(
  input: Phase2ControlledUserFacingProactivityExpansionInput = {},
): Promise<Phase2ControlledUserFacingProactivityExpansionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const approvedScope = input.approvedScope ?? {
    sessionKey: "main",
    operatorId: input.operatorId ?? "phase2-operator",
    projectId: "openclaw",
  };
  const requestScope = input.requestScope ?? { ...approvedScope, purpose: "operator_eval" };
  const messageClass = input.messageClass ?? "operator_approved_follow_up_available";
  const killed = readKillSwitch(input.env);
  const operatorDefaultReport =
    input.operatorDefaultReport === null
      ? undefined
      : (input.operatorDefaultReport ??
        (await buildPhase2ProactiveMessageOperatorDefaultReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const policy = buildPolicy(generatedAt);
  const config = buildConfig(generatedAt);
  const scopeOk = hasScopeMatch(approvedScope, requestScope);
  const allowedClass = isAllowedMessageClass(messageClass);
  const operatorDefaultOk = hasOperatorDefaultProof(operatorDefaultReport);
  const noDarkDataOk = operatorDefaultReport?.noDarkDataStatus === "pass";
  const provenanceOk = hasProvenance(operatorDefaultReport);
  const explicitSendApproval = input.explicitSendApproval ?? true;
  const checks: Phase2ControlledUserFacingProactivityExpansionCheck[] = [];
  addCheck(checks, "scope:approved", scopeOk, "approved_operator_eval_scope_required");
  addCheck(
    checks,
    "message_class:allowed",
    allowedClass,
    "approved_low_risk_message_class_required",
  );
  addCheck(
    checks,
    "proof:slice30_present",
    operatorDefaultOk,
    "slice30_operator_default_send_workflow_proof_required",
  );
  addCheck(
    checks,
    "send_approval:explicit",
    explicitSendApproval,
    "explicit_send_approval_required",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "adapter:present", Boolean(input.adapter), "live_delivery_adapter_required");

  let decision: Phase2ControlledUserFacingProactivityExpansionDecision;
  if (killed) {
    decision = "blocked_rollback";
  } else if (!scopeOk) {
    decision = "blocked_scope";
  } else if (!allowedClass) {
    decision = "blocked_message_class";
  } else if (!operatorDefaultOk) {
    decision = "blocked_missing_operator_default_proof";
  } else if (!explicitSendApproval) {
    decision = "blocked_missing_send_approval";
  } else if (!noDarkDataOk) {
    decision = "blocked_no_dark_data";
  } else if (!provenanceOk) {
    decision = "blocked_provenance";
  } else if (!input.adapter) {
    decision = "blocked_delivery_adapter";
  } else {
    decision = "blocked_delivery_adapter";
  }

  let message: Phase2ControlledUserFacingProactivityExpansionMessage | undefined;
  let adapterResult: Phase2ControlledUserFacingProactivityExpansionAdapterResult | undefined;
  if (
    decision === "blocked_delivery_adapter" &&
    input.adapter &&
    allowedClass &&
    operatorDefaultOk
  ) {
    message = {
      messageId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_controlled_user_facing_proactivity_expansion_message",
        targetId: messageClass,
        seed: {
          generatedAt,
          operatorDefaultReportId: operatorDefaultReport?.reportId,
          proofMarker: input.proofMarker ?? null,
        },
      }),
      messageClass,
      operatorDefaultReportId: operatorDefaultReport?.reportId ?? "missing-operator-default",
      sourceRefIds: uniqueSortedStrings(operatorDefaultReport?.telemetry.sourceRefIds ?? []),
      sourceProfileIds: uniqueSortedStrings(
        operatorDefaultReport?.telemetry.sourceProfileIds ?? [],
      ) as SourceProfileId[],
      authorityTiers: uniqueSortedStrings(
        operatorDefaultReport?.telemetry.authorityTiers ?? [],
      ) as SourceAuthorityTier[],
      contentHashes: uniqueSortedStrings(operatorDefaultReport?.telemetry.contentHashes ?? []),
      proofHashes: uniqueSortedStrings(operatorDefaultReport?.telemetry.proofHashes ?? []),
      noDarkDataStatus: "pass",
      boundedDisplayText: boundedDisplayText(messageClass),
      rawContentIncluded: false,
      privateOrSecretContentIncluded: false,
      actionExecution: false,
    };
    adapterResult = await input.adapter.deliver({
      sessionKey: approvedScope.sessionKey,
      message,
      boundedDisplayText: message.boundedDisplayText,
      label: "Model Memory",
      idempotencyKey: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_controlled_user_facing_proactivity_expansion_idempotency",
        targetId: message.messageId,
        seed: generatedAt,
      }),
    });
    decision =
      adapterResult.ok && adapterResult.delivered
        ? "expanded_proactive_message_delivered"
        : "blocked_delivery_adapter";
  }

  const deliveryId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_proactivity_expansion_delivery",
    targetId: message?.messageId ?? "blocked",
    seed: {
      generatedAt,
      decision,
      messageClass,
      adapterMessageId: adapterResult?.messageId ?? null,
    },
  });
  const deliveryResult: Phase2ControlledUserFacingProactivityExpansionDeliveryResult = {
    deliveryId,
    messageId: message?.messageId,
    adapterMessageId: adapterResult?.messageId,
    deliveryMode: "gateway_chat_inject",
    delivered: decision === "expanded_proactive_message_delivered",
    observableInOperatorUi: adapterResult?.observableInOperatorUi === true,
    liveUserMessageSent: decision === "expanded_proactive_message_delivered",
    resultHash: sha256JsonValue({
      deliveryId,
      messageId: message?.messageId ?? null,
      adapterMessageId: adapterResult?.messageId ?? null,
      decision,
    }),
    reasonCodes:
      decision === "expanded_proactive_message_delivered"
        ? ["expanded_proactive_message_delivered"]
        : uniqueSortedStrings([decision, ...(adapterResult?.reasonCodes ?? [])]),
  };
  const sendApprovalId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_proactivity_expansion_send_approval",
    targetId: operatorDefaultReport?.reportId ?? "missing-operator-default",
    seed: { explicitSendApproval, messageClass },
  });
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_proactivity_expansion_report",
    targetId: approvedScope.operatorId,
    seed: {
      generatedAt,
      decision,
      messageClass,
      operatorDefaultReportId: operatorDefaultReport?.reportId ?? null,
      marker: input.proofMarker ?? null,
    },
  });
  const auditEntry: Phase2ControlledUserFacingProactivityExpansionAuditEntry = {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_expansion_audit_entry",
      targetId: deliveryId,
      seed: { generatedAt, decision },
    }),
    generatedAt,
    messageId: message?.messageId,
    operatorDefaultReportId: operatorDefaultReport?.reportId,
    sendApprovalId,
    deliveryId,
    operatorId: approvedScope.operatorId,
    messageClass,
    decision,
    evidenceHashes: uniqueSortedStrings(
      (message?.contentHashes ?? []).concat(message?.proofHashes ?? []),
    ),
    reasonCodes: deliveryResult.reasonCodes,
    actionExecution: false,
    autonomousSending: false,
  };
  const rollbackPlan: Phase2ControlledUserFacingProactivityExpansionRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_proactivity_expansion_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED",
    targetMode: "single_operator_default_message_class_only",
    disablesExpandedControlledDelivery: true,
  };
  const telemetry: Phase2ControlledUserFacingProactivityExpansionTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    operatorDefaultReportId: operatorDefaultReport?.reportId,
    messageClass,
    messageId: message?.messageId,
    deliveryId,
    adapterMessageId: adapterResult?.messageId,
    sourceProfileIds: uniqueSortedStrings(message?.sourceProfileIds ?? []) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(message?.authorityTiers ?? []) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(message?.sourceRefIds ?? []),
    contentHashes: uniqueSortedStrings(message?.contentHashes ?? []),
    proofHashes: uniqueSortedStrings(message?.proofHashes ?? []),
    reasonCodes: uniqueSortedStrings(
      checks.map((check) => check.reasonCode).concat(deliveryResult.reasonCodes),
    ),
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackObserved: killed,
    explicitSendApproval,
    controlledOnlySecondClass: messageClass === "operator_approved_follow_up_available",
    liveUserMessageSent: deliveryResult.liveUserMessageSent,
    observableInOperatorUi: deliveryResult.observableInOperatorUi,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ControlledUserFacingProactivityExpansionReport = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    approvedScope,
    requestScope,
    operatorDefaultReport,
    messageClass,
    message,
    deliveryResult,
    auditTrail: [auditEntry],
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ControlledUserFacingProactivityExpansionReport;
}

export function assertPhase2ControlledUserFacingProactivityExpansionProven(
  report: Phase2ControlledUserFacingProactivityExpansionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "expanded_proactive_message_delivered") {
    throw new Error(`phase2 controlled proactivity expansion not proven: ${report.decision}`);
  }
  if (!report.deliveryResult.delivered || !report.deliveryResult.liveUserMessageSent) {
    throw new Error("phase2 controlled proactivity expansion did not deliver through live seam");
  }
  if (
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 controlled proactivity expansion escaped approval boundary");
  }
}

export async function writePhase2ControlledUserFacingProactivityExpansionArtifact(input: {
  report: Phase2ControlledUserFacingProactivityExpansionReport;
  artifactDir: string;
}): Promise<Phase2ControlledUserFacingProactivityExpansionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-user-facing-proactivity-expansion",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Controlled User-Facing Proactivity Expansion Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- messageClass: ${input.report.messageClass}`,
    `- operatorDefaultReportId: ${input.report.operatorDefaultReport?.reportId ?? "none"}`,
    `- deliveryId: ${input.report.deliveryResult.deliveryId}`,
    `- adapterMessageId: ${input.report.deliveryResult.adapterMessageId ?? "none"}`,
    `- liveUserMessageSent: ${input.report.telemetry.liveUserMessageSent}`,
    `- controlledOnlySecondClass: ${input.report.telemetry.controlledOnlySecondClass}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    "",
    "## Allowed Message Classes",
    "",
    ...input.report.config.allowedMessageClasses.map((messageClass) => `- ${messageClass}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 controlled proactivity expansion markdown exceeds byte limit");
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
