import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import {
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";
import {
  buildPhase2ProactivityScopeExpansionDecisionReport,
  type Phase2ProactivityScopeExpansionReport,
} from "./phase2-proactivity-scope-expansion-decision.ts";

export const PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION =
  "phase2_controlled_multi_user_proactivity.v1" as const;
export const PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_REPORT_SCHEMA_VERSION =
  "phase2_controlled_multi_user_proactivity_report.v1" as const;

export type Phase2ControlledMultiUserMessageClass =
  | "operator_approved_suggestion_available"
  | "operator_approved_follow_up_available";

export type Phase2ControlledMultiUserProactivityDecision =
  | "controlled_multi_user_delivery_observed"
  | "blocked_missing_scope_expansion_decision"
  | "blocked_scope_expansion_not_approved"
  | "blocked_missing_observability"
  | "blocked_observability_not_healthy"
  | "blocked_wildcard_scope"
  | "blocked_non_cohort_recipient"
  | "blocked_message_class"
  | "blocked_missing_per_recipient_send_approval"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback";

export type Phase2ControlledMultiUserRecipientScope = {
  recipientId: string;
  userId: string;
  sessionKey: string;
  projectId: string;
  operatorId: string;
  sendApprovalIds: [string, ...string[]];
};

export type Phase2ControlledMultiUserRolloutScope = {
  environment: "live";
  rolloutMode: "controlled_multi_user_scope";
  cohortId: string;
  recipients: [
    Phase2ControlledMultiUserRecipientScope,
    ...Phase2ControlledMultiUserRecipientScope[],
  ];
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
};

export type Phase2ControlledMultiUserProactivityPolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION;
  policyId: string;
  requireScopeExpansionDecision: true;
  requireHealthyObservability: true;
  requireExactCohortMembership: true;
  requirePerRecipientSendApproval: true;
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireNoDarkDataPass: true;
  requireProvenance: true;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledMultiUserProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED";
  targetMode: "expanded_controlled_user_scope_decision_only";
  disablesCohortDelivery: true;
};

export type Phase2ControlledMultiUserProactivityConfig = {
  schemaVersion: typeof PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION;
  configId: string;
  mode: "controlled_multi_user_scope";
  rolloutScope: Phase2ControlledMultiUserRolloutScope;
  proofPrerequisites: {
    scopeExpansionReportId?: string;
    scopeExpansionProofHash?: string;
    observabilityReportId?: string;
    observabilityProofHash?: string;
    observabilityStatus?: Phase2ProactiveDeliveryHealthReport["status"];
  };
  rollbackPlan: Phase2ControlledMultiUserProactivityRollbackPlan;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
};

export type Phase2ControlledMultiUserDeliveryEvidence = {
  deliveryId: string;
  recipientId: string;
  userId: string;
  sessionKey: string;
  projectId: string;
  operatorId: string;
  messageClass: Phase2ControlledMultiUserMessageClass;
  sendApprovalId: string;
  delivered: boolean;
  boundedDisplayText:
    | "An approved operator suggestion is available."
    | "An approved follow-up suggestion is available.";
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  actionExecution: false;
};

export type Phase2ControlledMultiUserCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledMultiUserProactivityTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledMultiUserProactivityDecision;
  cohortId: string;
  scopeExpansionReportId?: string;
  observabilityReportId?: string;
  deliveredRecipientIds: string[];
  blockedRecipientIds: string[];
  deliveryIds: string[];
  sendApprovalIds: string[];
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ControlledMultiUserProactivityReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledMultiUserProactivityDecision;
  policy: Phase2ControlledMultiUserProactivityPolicy;
  config: Phase2ControlledMultiUserProactivityConfig;
  requestRecipient: Phase2ControlledMultiUserRecipientScope;
  messageClass: Phase2ControlledMultiUserMessageClass | "external_instruction_message";
  deliveryEvidence: Phase2ControlledMultiUserDeliveryEvidence[];
  nonCohortBlocked: boolean;
  checks: Phase2ControlledMultiUserCheck[];
  rollbackPlan: Phase2ControlledMultiUserProactivityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledMultiUserProactivityTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    insideCohortRunId?: string | null;
    outsideCohortRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    observedTextSha256?: string;
  };
};

export type Phase2ControlledMultiUserProactivityInput = {
  now?: Date;
  proofMarker?: string;
  scopeExpansionReport?: Phase2ProactivityScopeExpansionReport | null;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport | null;
  rolloutScope?: Phase2ControlledMultiUserRolloutScope;
  requestRecipient?: Phase2ControlledMultiUserRecipientScope;
  messageClass?: Phase2ControlledMultiUserProactivityReport["messageClass"];
  perRecipientSendApproval?: boolean;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ControlledMultiUserProactivityReport["uiEvidence"];
};

export type Phase2ControlledMultiUserProactivityArtifact = {
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
        `phase2 controlled multi-user proactivity contains prohibited field: ${[
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
        "phase2 controlled multi-user proactivity contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ControlledMultiUserCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function isWildcard(value: string): boolean {
  return value === "*" || value.toLowerCase() === "all" || value.trim().length === 0;
}

function hasWildcard(scope: Phase2ControlledMultiUserRolloutScope): boolean {
  return scope.recipients.some((recipient) =>
    [
      recipient.recipientId,
      recipient.userId,
      recipient.sessionKey,
      recipient.projectId,
      recipient.operatorId,
      ...recipient.sendApprovalIds,
    ].some(isWildcard),
  );
}

function defaultRecipient(index = 0): Phase2ControlledMultiUserRecipientScope {
  return {
    recipientId: `phase2-cohort-recipient-${index + 1}`,
    userId: `phase2-cohort-user-${index + 1}`,
    sessionKey: index === 0 ? "main" : `phase2-cohort-session-${index + 1}`,
    projectId: "openclaw",
    operatorId: "phase2-operator",
    sendApprovalIds: [`phase2-send-approval-${index + 1}`],
  };
}

function defaultRolloutScope(): Phase2ControlledMultiUserRolloutScope {
  return {
    environment: "live",
    rolloutMode: "controlled_multi_user_scope",
    cohortId: "phase2-controlled-proactivity-cohort",
    recipients: [defaultRecipient(0), defaultRecipient(1)],
    allowedMessageClasses: [...ALLOWED_CLASSES],
  };
}

function hasRecipientMatch(
  scope: Phase2ControlledMultiUserRolloutScope,
  request: Phase2ControlledMultiUserRecipientScope,
): boolean {
  return scope.recipients.some(
    (recipient) =>
      recipient.recipientId === request.recipientId &&
      recipient.userId === request.userId &&
      recipient.sessionKey === request.sessionKey &&
      recipient.projectId === request.projectId &&
      recipient.operatorId === request.operatorId,
  );
}

function allowedClass(
  messageClass: Phase2ControlledMultiUserProactivityReport["messageClass"] | undefined,
): messageClass is Phase2ControlledMultiUserMessageClass {
  return (ALLOWED_CLASSES as readonly string[]).includes(String(messageClass));
}

function displayText(
  messageClass: Phase2ControlledMultiUserMessageClass,
): Phase2ControlledMultiUserDeliveryEvidence["boundedDisplayText"] {
  return messageClass === "operator_approved_follow_up_available"
    ? "An approved follow-up suggestion is available."
    : "An approved operator suggestion is available.";
}

function scopeExpansionApproved(report: Phase2ProactivityScopeExpansionReport | undefined) {
  return Boolean(report && report.decision === "approved_for_expanded_controlled_scope");
}

function observabilityHealthy(report: Phase2ProactiveDeliveryHealthReport | undefined) {
  return Boolean(
    report &&
    report.status === "healthy" &&
    report.noDarkDataStatus === "pass" &&
    report.alerts.length === 0 &&
    report.rollbackProof.allProactiveDeliveryDisabled,
  );
}

function hasProvenance(report: Phase2ProactiveDeliveryHealthReport | undefined) {
  return Boolean(
    report &&
    report.telemetry.sourceRefs.length > 0 &&
    report.telemetry.sourceProfileIds.length > 0 &&
    report.telemetry.authorityTiers.length > 0 &&
    report.telemetry.proofHashes.length > 0,
  );
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

export async function buildPhase2ControlledMultiUserProactivityReport(
  input: Phase2ControlledMultiUserProactivityInput = {},
): Promise<Phase2ControlledMultiUserProactivityReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const scopeExpansionReport =
    input.scopeExpansionReport === null
      ? undefined
      : (input.scopeExpansionReport ??
        (await buildPhase2ProactivityScopeExpansionDecisionReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const observabilityReport =
    input.observabilityReport === null
      ? undefined
      : (input.observabilityReport ??
        (await buildPhase2ProactiveDeliveryHealthReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const rolloutScope = input.rolloutScope ?? defaultRolloutScope();
  const requestRecipient = input.requestRecipient ?? rolloutScope.recipients[0];
  const messageClass = input.messageClass ?? "operator_approved_suggestion_available";
  const rollback = readRollback(input.env);
  const scopeOk = scopeExpansionApproved(scopeExpansionReport);
  const observabilityOk = observabilityHealthy(observabilityReport);
  const wildcard = hasWildcard(rolloutScope);
  const recipientMatch = !wildcard && hasRecipientMatch(rolloutScope, requestRecipient);
  const classOk = allowedClass(messageClass);
  const sendApprovalOk =
    (input.perRecipientSendApproval ?? true) && requestRecipient.sendApprovalIds.length > 0;
  const noDarkDataOk =
    scopeExpansionReport?.noDarkDataStatus === "pass" &&
    observabilityReport?.noDarkDataStatus === "pass";
  const provenanceOk = hasProvenance(observabilityReport);
  const checks: Phase2ControlledMultiUserCheck[] = [];
  addCheck(checks, "proof:scope_expansion", scopeOk, "scope_expansion_decision_required");
  addCheck(checks, "observability:healthy", observabilityOk, "healthy_observability_required");
  addCheck(checks, "scope:no_wildcard", !wildcard, "wildcard_scope_rejected");
  addCheck(
    checks,
    "scope:recipient_exact_match",
    recipientMatch,
    "exact_cohort_recipient_required",
  );
  addCheck(checks, "message_class:allowed", classOk, "approved_message_class_required");
  addCheck(
    checks,
    "send_approval:per_recipient",
    sendApprovalOk,
    "per_recipient_send_approval_required",
  );
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");

  let decision: Phase2ControlledMultiUserProactivityDecision;
  if (rollback) {
    decision = "blocked_rollback";
  } else if (!scopeExpansionReport) {
    decision = "blocked_missing_scope_expansion_decision";
  } else if (!scopeOk) {
    decision = "blocked_scope_expansion_not_approved";
  } else if (!observabilityReport) {
    decision = "blocked_missing_observability";
  } else if (!observabilityOk) {
    decision = "blocked_observability_not_healthy";
  } else if (wildcard) {
    decision = "blocked_wildcard_scope";
  } else if (!recipientMatch) {
    decision = "blocked_non_cohort_recipient";
  } else if (!classOk) {
    decision = "blocked_message_class";
  } else if (!sendApprovalOk) {
    decision = "blocked_missing_per_recipient_send_approval";
  } else if (!noDarkDataOk) {
    decision = "blocked_no_dark_data";
  } else if (!provenanceOk) {
    decision = "blocked_provenance";
  } else {
    decision = "controlled_multi_user_delivery_observed";
  }

  const delivered = decision === "controlled_multi_user_delivery_observed" && classOk;
  const deliveryEvidence: Phase2ControlledMultiUserDeliveryEvidence[] =
    delivered && classOk
      ? [
          {
            deliveryId: buildDerivedArtifactId({
              family: "context_artifact",
              artifactType: "phase2_controlled_multi_user_delivery",
              targetId: requestRecipient.recipientId,
              seed: { generatedAt, messageClass, requestRecipient },
            }),
            recipientId: requestRecipient.recipientId,
            userId: requestRecipient.userId,
            sessionKey: requestRecipient.sessionKey,
            projectId: requestRecipient.projectId,
            operatorId: requestRecipient.operatorId,
            messageClass,
            sendApprovalId: requestRecipient.sendApprovalIds[0],
            delivered: true,
            boundedDisplayText: displayText(messageClass),
            sourceRefs: uniqueSortedStrings(observabilityReport?.telemetry.sourceRefs ?? []),
            sourceProfileIds: uniqueSortedStrings(
              observabilityReport?.telemetry.sourceProfileIds ?? [],
            ),
            authorityTiers: uniqueSortedStrings(
              observabilityReport?.telemetry.authorityTiers ?? [],
            ),
            contentHashes: uniqueSortedStrings(observabilityReport?.telemetry.contentHashes ?? []),
            proofHashes: uniqueSortedStrings([
              ...(observabilityReport?.telemetry.proofHashes ?? []),
              reportHash(scopeExpansionReport as JsonLike | undefined) ?? "",
            ]).filter(Boolean),
            actionExecution: false,
          },
        ]
      : [];
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_multi_user_proactivity_report",
    targetId: rolloutScope.cohortId,
    seed: {
      generatedAt,
      scopeExpansionReportId: scopeExpansionReport?.reportId ?? null,
      observabilityReportId: observabilityReport?.reportId ?? null,
      decision,
      requestRecipient,
      messageClass,
    },
  });
  const rollbackPlan: Phase2ControlledMultiUserProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_multi_user_rollback",
      targetId: reportId,
      seed: { rolloutScope, decision },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED",
    targetMode: "expanded_controlled_user_scope_decision_only",
    disablesCohortDelivery: true,
  };
  const policy: Phase2ControlledMultiUserProactivityPolicy = {
    schemaVersion: PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_multi_user_policy",
      targetId: rolloutScope.cohortId,
      seed: rolloutScope,
    }),
    requireScopeExpansionDecision: true,
    requireHealthyObservability: true,
    requireExactCohortMembership: true,
    requirePerRecipientSendApproval: true,
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireNoDarkDataPass: true,
    requireProvenance: true,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
  const config: Phase2ControlledMultiUserProactivityConfig = {
    schemaVersion: PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_multi_user_config",
      targetId: rolloutScope.cohortId,
      seed: { rolloutScope, scopeExpansionReportId: scopeExpansionReport?.reportId ?? null },
    }),
    mode: "controlled_multi_user_scope",
    rolloutScope,
    proofPrerequisites: {
      scopeExpansionReportId: scopeExpansionReport?.reportId,
      scopeExpansionProofHash: reportHash(scopeExpansionReport as JsonLike | undefined),
      observabilityReportId: observabilityReport?.reportId,
      observabilityProofHash: reportHash(observabilityReport as JsonLike | undefined),
      observabilityStatus: observabilityReport?.status,
    },
    rollbackPlan,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
  };
  const telemetry: Phase2ControlledMultiUserProactivityTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_SCHEMA_VERSION,
    reportId,
    decision,
    cohortId: rolloutScope.cohortId,
    scopeExpansionReportId: scopeExpansionReport?.reportId,
    observabilityReportId: observabilityReport?.reportId,
    deliveredRecipientIds: delivered ? [requestRecipient.recipientId] : [],
    blockedRecipientIds: delivered ? [] : [requestRecipient.recipientId],
    deliveryIds: deliveryEvidence.map((evidence) => evidence.deliveryId),
    sendApprovalIds: uniqueSortedStrings(
      rolloutScope.recipients.flatMap((recipient) => recipient.sendApprovalIds),
    ),
    sourceRefs: uniqueSortedStrings(deliveryEvidence.flatMap((evidence) => evidence.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      deliveryEvidence.flatMap((evidence) => evidence.sourceProfileIds),
    ),
    authorityTiers: uniqueSortedStrings(
      deliveryEvidence.flatMap((evidence) => evidence.authorityTiers),
    ),
    contentHashes: uniqueSortedStrings(
      deliveryEvidence.flatMap((evidence) => evidence.contentHashes),
    ),
    proofHashes: uniqueSortedStrings(deliveryEvidence.flatMap((evidence) => evidence.proofHashes)),
    reasonCodes: checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackObserved: rollback,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ControlledMultiUserProactivityReport = {
    schemaVersion: PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    requestRecipient,
    messageClass,
    deliveryEvidence,
    nonCohortBlocked: !recipientMatch,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ControlledMultiUserProactivityObserved(
  report: Phase2ControlledMultiUserProactivityReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "controlled_multi_user_delivery_observed") {
    throw new Error(
      `phase2 controlled multi-user proactivity was not observed: ${report.decision}`,
    );
  }
  if (
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 controlled multi-user proactivity enabled a forbidden behavior");
  }
}

export async function writePhase2ControlledMultiUserProactivityArtifact(input: {
  report: Phase2ControlledMultiUserProactivityReport;
  artifactDir: string;
}): Promise<Phase2ControlledMultiUserProactivityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-multi-user-proactivity-rollout",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Controlled Multi-User Proactivity Rollout",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- cohortId: ${input.report.config.rolloutScope.cohortId}`,
    `- deliveredRecipientIds: ${input.report.telemetry.deliveredRecipientIds.join(", ") || "none"}`,
    `- blockedRecipientIds: ${input.report.telemetry.blockedRecipientIds.join(", ") || "none"}`,
    `- allowedMessageClasses: ${input.report.config.rolloutScope.allowedMessageClasses.join(", ")}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
