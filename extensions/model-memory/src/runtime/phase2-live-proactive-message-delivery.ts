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
  type Phase2ControlledProactiveMessage,
  type Phase2ControlledProactiveMessageClass,
  type Phase2ControlledUserFacingProactivityReport,
  type Phase2ControlledUserFacingProactivityScope,
} from "./phase2-controlled-user-facing-proactivity.ts";

export const PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_SCHEMA_VERSION =
  "phase2_live_proactive_message_delivery.v1" as const;
export const PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_REPORT_SCHEMA_VERSION =
  "phase2_live_proactive_message_delivery_report.v1" as const;

export type Phase2LiveProactiveMessageDeliveryDecision =
  | "live_proactive_message_delivered"
  | "blocked_scope"
  | "blocked_missing_approval"
  | "blocked_missing_send_approval"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_message_class"
  | "blocked_delivery_adapter";

export type Phase2LiveProactiveMessageDeliveryPolicy = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_SCHEMA_VERSION;
  policyId: string;
  allowedMessageClasses: ["operator_approved_suggestion_available"];
  deliveryAdapterKind: "gateway_chat_inject";
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireExplicitSendApproval: true;
  requireApprovedOperatorEvalScope: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  actualLiveDeliveryEnabled: true;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2LiveProactiveMessageDeliveryConfig = {
  configId: string;
  configHash: string;
  mode: "explicit_operator_eval";
  enabled: boolean;
  approvedScope: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
  defaultVisibleToOperators: false;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
};

export type Phase2LiveProactiveMessageDeliveryAdapterInput = {
  sessionKey: string;
  message: Phase2ControlledProactiveMessage;
  boundedDisplayText: "An approved operator suggestion is available.";
  label: "Model Memory";
  idempotencyKey: string;
};

export type Phase2LiveProactiveMessageDeliveryAdapterResult = {
  ok: boolean;
  adapterKind: "gateway_chat_inject";
  delivered: boolean;
  messageId?: string;
  observableInOperatorUi: boolean;
  resultHash: string;
  reasonCodes: string[];
};

export type Phase2LiveProactiveMessageDeliveryAdapter = {
  kind: "gateway_chat_inject";
  deliver: (
    input: Phase2LiveProactiveMessageDeliveryAdapterInput,
  ) =>
    | Phase2LiveProactiveMessageDeliveryAdapterResult
    | Promise<Phase2LiveProactiveMessageDeliveryAdapterResult>;
};

export type Phase2LiveProactiveMessageDeliveryResult = {
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

export type Phase2LiveProactiveMessageDeliveryAuditEntry = {
  auditId: string;
  generatedAt: string;
  messageId?: string;
  proposalId?: string;
  approvalReportId?: string;
  suggestionReportId?: string;
  sendApprovalId: string;
  deliveryId: string;
  operatorId: string;
  messageClass: Phase2ControlledProactiveMessageClass;
  decision: Phase2LiveProactiveMessageDeliveryDecision;
  evidenceHashes: string[];
  reasonCodes: string[];
  actionExecution: false;
  autonomousSending: false;
};

export type Phase2LiveProactiveMessageDeliveryRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_PROACTIVE_DELIVERY_DISABLED";
  targetMode: "proof_delivery_artifact_only";
  disablesLiveDelivery: true;
};

export type Phase2LiveProactiveMessageDeliveryTelemetry = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2LiveProactiveMessageDeliveryDecision;
  deliveryAdapterKind: "gateway_chat_inject";
  controlledReportId: string;
  messageClass: Phase2ControlledProactiveMessageClass;
  messageId?: string;
  deliveryId: string;
  adapterMessageId?: string;
  proposalId?: string;
  approvalReportId?: string;
  suggestionReportId?: string;
  sendApprovalId: string;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitSendApproval: boolean;
  liveUserMessageSent: boolean;
  observableInOperatorUi: boolean;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2LiveProactiveMessageDeliveryCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2LiveProactiveMessageDeliveryReport = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2LiveProactiveMessageDeliveryDecision;
  policy: Phase2LiveProactiveMessageDeliveryPolicy;
  config: Phase2LiveProactiveMessageDeliveryConfig;
  controlledReport: Phase2ControlledUserFacingProactivityReport;
  deliveryResult: Phase2LiveProactiveMessageDeliveryResult;
  auditTrail: Phase2LiveProactiveMessageDeliveryAuditEntry[];
  checks: Phase2LiveProactiveMessageDeliveryCheck[];
  rollbackPlan: Phase2LiveProactiveMessageDeliveryRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2LiveProactiveMessageDeliveryTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    liveDeliveryRunId?: string | null;
    observedDeliveryTextSha256?: string;
    terminalEvidence: boolean;
  };
};

export type Phase2LiveProactiveMessageDeliveryInput = {
  now?: Date;
  proofMarker?: string;
  controlledReport?: Phase2ControlledUserFacingProactivityReport;
  adapter?: Phase2LiveProactiveMessageDeliveryAdapter;
  approvedScope?: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
  requestScope?: Phase2ControlledUserFacingProactivityScope;
  explicitSendApproval?: boolean;
  messageClass?: Phase2ControlledProactiveMessageClass;
  operatorId?: string;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2LiveProactiveMessageDeliveryReport["uiEvidence"];
};

export type Phase2LiveProactiveMessageDeliveryArtifact = {
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
        `phase2 live proactive delivery contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
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
      throw new Error("phase2 live proactive delivery contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2LiveProactiveMessageDeliveryCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_LIVE_PROACTIVE_DELIVERY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function buildPolicy(generatedAt: string): Phase2LiveProactiveMessageDeliveryPolicy {
  return {
    schemaVersion: PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactive_message_delivery_policy",
      targetId: "planner",
      seed: generatedAt,
    }),
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    deliveryAdapterKind: "gateway_chat_inject",
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireExplicitSendApproval: true,
    requireApprovedOperatorEvalScope: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    actualLiveDeliveryEnabled: true,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
}

function buildConfig(input: {
  generatedAt: string;
  approvedScope: Omit<Phase2ControlledUserFacingProactivityScope, "purpose">;
}): Phase2LiveProactiveMessageDeliveryConfig {
  const configSeed = {
    generatedAt: input.generatedAt,
    approvedScope: input.approvedScope,
    mode: "explicit_operator_eval",
  };
  const configId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_proactive_message_delivery_config",
    targetId: input.approvedScope.operatorId,
    seed: configSeed,
  });
  return {
    configId,
    configHash: sha256JsonValue(configSeed),
    mode: "explicit_operator_eval",
    enabled: true,
    approvedScope: input.approvedScope,
    defaultVisibleToOperators: false,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
  };
}

function hasProvenance(message: Phase2ControlledProactiveMessage | undefined): boolean {
  return Boolean(
    message &&
    message.sourceRefIds.length > 0 &&
    message.sourceProfileIds.length > 0 &&
    message.authorityTiers.length > 0 &&
    (message.contentHashes.length > 0 || message.proofHashes.length > 0),
  );
}

function mapControlledDecision(
  decision: Phase2ControlledUserFacingProactivityReport["decision"],
): Phase2LiveProactiveMessageDeliveryDecision {
  if (decision === "controlled_proactive_message_proof_delivered") {
    return "blocked_delivery_adapter";
  }
  return decision;
}

export async function buildPhase2LiveProactiveMessageDeliveryReport(
  input: Phase2LiveProactiveMessageDeliveryInput = {},
): Promise<Phase2LiveProactiveMessageDeliveryReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const approvedScope = input.approvedScope ?? {
    sessionKey: "main",
    operatorId: input.operatorId ?? "phase2-operator",
    projectId: "openclaw",
  };
  const requestScope = input.requestScope ?? { ...approvedScope, purpose: "operator_eval" };
  const controlledReport =
    input.controlledReport ??
    (await buildPhase2ControlledUserFacingProactivityReport({
      now: input.now,
      proofMarker: input.proofMarker,
      approvedScope,
      requestScope,
      explicitSendApproval: input.explicitSendApproval,
      messageClass: input.messageClass,
      operatorId: input.operatorId,
      env: input.env,
    }));
  const killed = readKillSwitch(input.env);
  const checks: Phase2LiveProactiveMessageDeliveryCheck[] = [];
  const message = controlledReport.message;
  const provenanceOk = hasProvenance(message);
  addCheck(
    checks,
    "controlled_report:approved",
    controlledReport.decision === "controlled_proactive_message_proof_delivered",
    "controlled_user_facing_proactivity_proof_required",
  );
  addCheck(
    checks,
    "message_class:allowed",
    controlledReport.messageClass === "operator_approved_suggestion_available",
    "allowed_low_risk_message_class_required",
  );
  addCheck(
    checks,
    "send_approval:explicit",
    controlledReport.telemetry.explicitSendApproval,
    "explicit_send_approval_required",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");
  addCheck(
    checks,
    "no_dark_data:pass",
    controlledReport.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "adapter:present", Boolean(input.adapter), "live_delivery_adapter_required");

  let adapterResult: Phase2LiveProactiveMessageDeliveryAdapterResult | undefined;
  let decision: Phase2LiveProactiveMessageDeliveryDecision = mapControlledDecision(
    controlledReport.decision,
  );
  if (killed) {
    decision = "blocked_rollback";
  } else if (controlledReport.decision !== "controlled_proactive_message_proof_delivered") {
    decision = mapControlledDecision(controlledReport.decision);
    if (decision === "blocked_delivery_adapter" && controlledReport.noDarkDataStatus === "fail") {
      decision = "blocked_no_dark_data";
    }
  } else if (controlledReport.decision === "controlled_proactive_message_proof_delivered") {
    if (controlledReport.noDarkDataStatus === "fail") {
      decision = "blocked_no_dark_data";
    } else if (!provenanceOk) {
      decision = "blocked_provenance";
    } else if (!input.adapter || !message) {
      decision = "blocked_delivery_adapter";
    } else {
      adapterResult = await input.adapter.deliver({
        sessionKey: controlledReport.approvedScope.sessionKey,
        message,
        boundedDisplayText: "An approved operator suggestion is available.",
        label: "Model Memory",
        idempotencyKey: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_live_proactive_message_delivery_idempotency",
          targetId: message.messageId,
          seed: generatedAt,
        }),
      });
      decision =
        adapterResult.ok && adapterResult.delivered
          ? "live_proactive_message_delivered"
          : "blocked_delivery_adapter";
    }
  }

  const deliveryId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_proactive_message_delivery",
    targetId: message?.messageId ?? "blocked",
    seed: {
      generatedAt,
      decision,
      adapterMessageId: adapterResult?.messageId ?? null,
    },
  });
  const deliveryResult: Phase2LiveProactiveMessageDeliveryResult = {
    deliveryId,
    messageId: message?.messageId,
    adapterMessageId: adapterResult?.messageId,
    deliveryMode: "gateway_chat_inject",
    delivered: decision === "live_proactive_message_delivered",
    observableInOperatorUi: adapterResult?.observableInOperatorUi === true,
    liveUserMessageSent: decision === "live_proactive_message_delivered",
    resultHash: sha256JsonValue({
      deliveryId,
      messageId: message?.messageId ?? null,
      adapterMessageId: adapterResult?.messageId ?? null,
      decision,
    }),
    reasonCodes:
      decision === "live_proactive_message_delivered"
        ? ["live_proactive_message_delivered"]
        : uniqueSortedStrings([decision, ...(adapterResult?.reasonCodes ?? [])]),
  };
  const sendApprovalId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_proactive_message_send_approval",
    targetId: controlledReport.telemetry.proposalId ?? "missing-proposal",
    seed: {
      controlledReportId: controlledReport.reportId,
      explicitSendApproval: controlledReport.telemetry.explicitSendApproval,
    },
  });
  const auditEntry: Phase2LiveProactiveMessageDeliveryAuditEntry = {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactive_message_delivery_audit_entry",
      targetId: deliveryId,
      seed: { generatedAt, decision },
    }),
    generatedAt,
    messageId: message?.messageId,
    proposalId: controlledReport.telemetry.proposalId,
    approvalReportId: controlledReport.telemetry.approvalReportId,
    suggestionReportId: controlledReport.telemetry.suggestionReportId,
    sendApprovalId,
    deliveryId,
    operatorId: controlledReport.approvedScope.operatorId,
    messageClass: controlledReport.messageClass,
    decision,
    evidenceHashes: uniqueSortedStrings(
      (message?.contentHashes ?? []).concat(message?.proofHashes ?? []),
    ),
    reasonCodes: deliveryResult.reasonCodes,
    actionExecution: false,
    autonomousSending: false,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_proactive_message_delivery_report",
    targetId: controlledReport.approvedScope.operatorId,
    seed: {
      generatedAt,
      decision,
      controlledReportId: controlledReport.reportId,
      adapterMessageId: adapterResult?.messageId ?? null,
      marker: input.proofMarker ?? null,
    },
  });
  const policy = buildPolicy(generatedAt);
  const config = buildConfig({ generatedAt, approvedScope: controlledReport.approvedScope });
  const rollbackPlan: Phase2LiveProactiveMessageDeliveryRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactive_message_delivery_rollback",
      targetId: reportId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_PROACTIVE_DELIVERY_DISABLED",
    targetMode: "proof_delivery_artifact_only",
    disablesLiveDelivery: true,
  };
  const telemetry: Phase2LiveProactiveMessageDeliveryTelemetry = {
    schemaVersion: PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_SCHEMA_VERSION,
    reportId,
    decision,
    deliveryAdapterKind: "gateway_chat_inject",
    controlledReportId: controlledReport.reportId,
    messageClass: controlledReport.messageClass,
    messageId: message?.messageId,
    deliveryId,
    adapterMessageId: adapterResult?.messageId,
    proposalId: controlledReport.telemetry.proposalId,
    approvalReportId: controlledReport.telemetry.approvalReportId,
    suggestionReportId: controlledReport.telemetry.suggestionReportId,
    sendApprovalId,
    sourceProfileIds: uniqueSortedStrings(message?.sourceProfileIds ?? []) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(message?.authorityTiers ?? []) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(message?.sourceRefIds ?? []),
    contentHashes: uniqueSortedStrings(message?.contentHashes ?? []),
    proofHashes: uniqueSortedStrings(message?.proofHashes ?? []),
    reasonCodes: uniqueSortedStrings(
      checks.map((check) => check.reasonCode).concat(deliveryResult.reasonCodes),
    ),
    noDarkDataStatus: controlledReport.noDarkDataStatus,
    rollbackObserved: killed || decision === "blocked_rollback",
    explicitSendApproval: controlledReport.telemetry.explicitSendApproval,
    liveUserMessageSent: deliveryResult.liveUserMessageSent,
    observableInOperatorUi: deliveryResult.observableInOperatorUi,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2LiveProactiveMessageDeliveryReport = {
    schemaVersion: PHASE2_LIVE_PROACTIVE_MESSAGE_DELIVERY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    controlledReport,
    deliveryResult,
    auditTrail: [auditEntry],
    checks,
    rollbackPlan,
    noDarkDataStatus: controlledReport.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2LiveProactiveMessageDeliveryReport;
}

export function assertPhase2LiveProactiveMessageDeliveryProven(
  report: Phase2LiveProactiveMessageDeliveryReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "live_proactive_message_delivered") {
    throw new Error(`phase2 live proactive delivery not proven: ${report.decision}`);
  }
  if (!report.deliveryResult.delivered || !report.deliveryResult.liveUserMessageSent) {
    throw new Error("phase2 live proactive delivery did not deliver through live seam");
  }
  if (
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 live proactive delivery escaped controlled boundary");
  }
}

export async function writePhase2LiveProactiveMessageDeliveryArtifact(input: {
  report: Phase2LiveProactiveMessageDeliveryReport;
  artifactDir: string;
}): Promise<Phase2LiveProactiveMessageDeliveryArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-live-proactive-message-delivery",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Live Proactive Message Delivery Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- adapter: ${input.report.policy.deliveryAdapterKind}`,
    `- messageClass: ${input.report.controlledReport.messageClass}`,
    `- messageId: ${input.report.controlledReport.message?.messageId ?? "none"}`,
    `- adapterMessageId: ${input.report.deliveryResult.adapterMessageId ?? "none"}`,
    `- liveUserMessageSent: ${input.report.telemetry.liveUserMessageSent}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    "",
    "## Audit IDs",
    "",
    ...input.report.auditTrail.map((entry) => `- ${entry.auditId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 live proactive delivery markdown exceeds byte limit");
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
