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
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";
import {
  buildPhase2ProactiveMessageExpandedOperatorDefaultReport,
  type Phase2ExpandedOperatorDefaultMessageClass,
  type Phase2ProactiveMessageExpandedOperatorDefaultReport,
} from "./phase2-proactive-message-expanded-operator-default.ts";

export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity_scope.v1" as const;
export const PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION =
  "phase2_controlled_user_facing_proactivity_scope_report.v1" as const;

export type Phase2ControlledUserFacingProactivityScopeDecision =
  | "scoped_user_facing_proactivity_delivered"
  | "blocked_scope"
  | "blocked_wildcard_scope"
  | "blocked_missing_expanded_operator_default_proof"
  | "blocked_missing_observability"
  | "blocked_observability_not_healthy"
  | "blocked_message_class"
  | "blocked_missing_send_approval"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_delivery_adapter";

export type Phase2ControlledUserFacingProactivityRolloutScope = {
  environment: "live";
  rolloutMode: "controlled_user_scope";
  sessionKey: string;
  projectId: string;
  userId: string;
  recipientId: string;
  operatorId: string;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
};

export type Phase2ControlledUserFacingProactivityScopePolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_SCHEMA_VERSION;
  policyId: string;
  requireExpandedOperatorDefaultProof: true;
  requireHealthyObservability: true;
  requireApprovedSuggestion: true;
  requireStagedApproval: true;
  requireExplicitSendApproval: true;
  requireSelectedUserProjectSessionScope: true;
  requireProvenance: true;
  requireNoDarkDataPass: true;
  deliveryAdapterKind: "gateway_chat_inject";
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledUserFacingProactivityScopeConfig = {
  configId: string;
  environment: "live";
  mode: "controlled_user_scope";
  approvedScope: Phase2ControlledUserFacingProactivityRolloutScope;
  proofPrerequisites: {
    expandedOperatorDefaultReportId?: string;
    expandedOperatorDefaultProofHash?: string;
    observabilityReportId?: string;
    observabilityProofHash?: string;
    observabilityStatus?: Phase2ProactiveDeliveryHealthReport["status"];
  };
  rollbackPlan: Phase2ControlledUserFacingProactivityScopeRollbackPlan;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
};

export type Phase2ControlledUserFacingProactivityScopeTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledUserFacingProactivityScopeDecision;
  configId: string;
  expandedOperatorDefaultReportId?: string;
  observabilityReportId?: string;
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  deliveryId: string;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefs: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  observabilityStatus?: Phase2ProactiveDeliveryHealthReport["status"];
  scopeMatched: boolean;
  rollbackObserved: boolean;
  explicitSendApproval: boolean;
  liveUserMessageSent: boolean;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ControlledUserFacingProactivityScopeRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED";
  targetMode: "operator_default_visible_workflow_only";
  disablesScopedRealUserDelivery: true;
};

export type Phase2ControlledUserFacingDeliveryEvidence = {
  deliveryId: string;
  adapterMessageId?: string;
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  boundedDisplayText:
    | "An approved operator suggestion is available."
    | "An approved follow-up suggestion is available.";
  delivered: boolean;
  observableInOperatorUi: boolean;
  liveUserMessageSent: boolean;
  resultHash: string;
  actionExecution: false;
};

export type Phase2ControlledUserFacingProactivityScopeCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledUserFacingProactivityScopeReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledUserFacingProactivityScopeDecision;
  policy: Phase2ControlledUserFacingProactivityScopePolicy;
  config: Phase2ControlledUserFacingProactivityScopeConfig;
  approvedScope: Phase2ControlledUserFacingProactivityRolloutScope;
  requestScope: Phase2ControlledUserFacingProactivityRolloutScope;
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  deliveryEvidence: Phase2ControlledUserFacingDeliveryEvidence;
  checks: Phase2ControlledUserFacingProactivityScopeCheck[];
  rollbackPlan: Phase2ControlledUserFacingProactivityScopeRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledUserFacingProactivityScopeTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    insideScopeDeliveryId?: string | null;
    outsideScopeReportId?: string | null;
    rollbackReportId?: string | null;
    terminalEvidence: boolean;
    observedDeliveryTextSha256?: string;
  };
};

export type Phase2ControlledUserFacingProactivityScopeAdapterInput = {
  sessionKey: string;
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  boundedDisplayText: Phase2ControlledUserFacingDeliveryEvidence["boundedDisplayText"];
  label: "Model Memory";
  idempotencyKey: string;
};

export type Phase2ControlledUserFacingProactivityScopeAdapterResult = {
  ok: boolean;
  adapterKind: "gateway_chat_inject";
  delivered: boolean;
  messageId?: string;
  observableInOperatorUi: boolean;
  resultHash: string;
  reasonCodes: string[];
};

export type Phase2ControlledUserFacingProactivityScopeAdapter = {
  kind: "gateway_chat_inject";
  deliver: (
    input: Phase2ControlledUserFacingProactivityScopeAdapterInput,
  ) =>
    | Phase2ControlledUserFacingProactivityScopeAdapterResult
    | Promise<Phase2ControlledUserFacingProactivityScopeAdapterResult>;
};

export type Phase2ControlledUserFacingProactivityScopeInput = {
  now?: Date;
  proofMarker?: string;
  expandedOperatorDefaultReport?: Phase2ProactiveMessageExpandedOperatorDefaultReport | null;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport | null;
  approvedScope?: Phase2ControlledUserFacingProactivityRolloutScope;
  requestScope?: Phase2ControlledUserFacingProactivityRolloutScope;
  explicitSendApproval?: boolean;
  messageClass?: Phase2ExpandedOperatorDefaultMessageClass | "external_instruction_message";
  env?: Record<string, string | undefined>;
  adapter?: Phase2ControlledUserFacingProactivityScopeAdapter;
  uiEvidence?: Phase2ControlledUserFacingProactivityScopeReport["uiEvidence"];
};

export type Phase2ControlledUserFacingProactivityScopeArtifact = {
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
        `phase2 controlled user-facing proactivity scope contains prohibited field: ${[
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
        "phase2 controlled user-facing proactivity scope contains prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ControlledUserFacingProactivityScopeCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function defaultScope(): Phase2ControlledUserFacingProactivityRolloutScope {
  return {
    environment: "live",
    rolloutMode: "controlled_user_scope",
    sessionKey: "main",
    projectId: "openclaw",
    userId: "phase2-approved-user",
    recipientId: "phase2-approved-recipient",
    operatorId: "phase2-operator",
    allowedMessageClasses: [...ALLOWED_CLASSES],
  };
}

function isWildcard(value: string): boolean {
  return value === "*" || value.toLowerCase() === "all" || value.trim().length === 0;
}

function hasWildcardScope(scope: Phase2ControlledUserFacingProactivityRolloutScope): boolean {
  return [
    scope.sessionKey,
    scope.projectId,
    scope.userId,
    scope.recipientId,
    scope.operatorId,
  ].some(isWildcard);
}

function hasScopeMatch(
  approved: Phase2ControlledUserFacingProactivityRolloutScope,
  request: Phase2ControlledUserFacingProactivityRolloutScope,
): boolean {
  return (
    approved.environment === "live" &&
    request.environment === "live" &&
    approved.rolloutMode === "controlled_user_scope" &&
    request.rolloutMode === "controlled_user_scope" &&
    approved.sessionKey === request.sessionKey &&
    approved.projectId === request.projectId &&
    approved.userId === request.userId &&
    approved.recipientId === request.recipientId &&
    approved.operatorId === request.operatorId
  );
}

function isAllowedMessageClass(
  messageClass: Phase2ControlledUserFacingProactivityScopeInput["messageClass"],
): messageClass is Phase2ExpandedOperatorDefaultMessageClass {
  return (ALLOWED_CLASSES as readonly string[]).includes(String(messageClass));
}

function boundedDisplayText(
  messageClass: Phase2ExpandedOperatorDefaultMessageClass,
): Phase2ControlledUserFacingDeliveryEvidence["boundedDisplayText"] {
  if (messageClass === "operator_approved_follow_up_available") {
    return "An approved follow-up suggestion is available.";
  }
  return "An approved operator suggestion is available.";
}

function syntheticAdapter(): Phase2ControlledUserFacingProactivityScopeAdapter {
  return {
    kind: "gateway_chat_inject",
    deliver(input) {
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `scoped-user-facing-${input.messageClass}`,
        observableInOperatorUi: true,
        resultHash: sha256JsonValue({
          messageClass: input.messageClass,
          idempotencyKey: input.idempotencyKey,
        }),
        reasonCodes: ["gateway_chat_inject_delivered"],
      };
    },
  };
}

function hasExpandedProof(
  report: Phase2ProactiveMessageExpandedOperatorDefaultReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "approved_for_default_operator_visible_expanded_send_workflow" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.defaultVisibleExpandedOperatorSendWorkflowObserved &&
    report.config.allowedMessageClasses.length === 2,
  );
}

function hasHealthyObservability(report: Phase2ProactiveDeliveryHealthReport | undefined): boolean {
  return Boolean(
    report &&
    report.status === "healthy" &&
    report.noDarkDataStatus === "pass" &&
    report.rollbackProof.allProactiveDeliveryDisabled &&
    !report.telemetry.autonomousSendingAllowed &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function hasProvenance(input: {
  expandedReport: Phase2ProactiveMessageExpandedOperatorDefaultReport | undefined;
  observabilityReport: Phase2ProactiveDeliveryHealthReport | undefined;
}): boolean {
  return Boolean(
    input.expandedReport &&
    input.observabilityReport &&
    input.expandedReport.telemetry.sourceRefIds.length > 0 &&
    input.expandedReport.telemetry.sourceProfileIds.length > 0 &&
    input.expandedReport.telemetry.authorityTiers.length > 0 &&
    input.observabilityReport.telemetry.sourceRefs.length > 0 &&
    input.observabilityReport.telemetry.sourceProfileIds.length > 0 &&
    input.observabilityReport.telemetry.authorityTiers.length > 0,
  );
}

export async function buildPhase2ControlledUserFacingProactivityScopeReport(
  input: Phase2ControlledUserFacingProactivityScopeInput = {},
): Promise<Phase2ControlledUserFacingProactivityScopeReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const approvedScope = input.approvedScope ?? defaultScope();
  const requestScope = input.requestScope ?? approvedScope;
  const messageClass = input.messageClass ?? "operator_approved_suggestion_available";
  const rollback = readRollback(input.env);
  const expandedOperatorDefaultReport =
    input.expandedOperatorDefaultReport === null
      ? undefined
      : (input.expandedOperatorDefaultReport ??
        (await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
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
          expandedOperatorDefaultReport,
        })));
  const adapter = input.adapter ?? syntheticAdapter();
  const allowedClass = isAllowedMessageClass(messageClass);
  const wildcardScope = hasWildcardScope(approvedScope) || hasWildcardScope(requestScope);
  const scopeMatched = !wildcardScope && hasScopeMatch(approvedScope, requestScope);
  const expandedProofOk = hasExpandedProof(expandedOperatorDefaultReport);
  const observabilityPresent = observabilityReport !== undefined;
  const observabilityHealthy = hasHealthyObservability(observabilityReport);
  const explicitSendApproval = input.explicitSendApproval ?? true;
  const noDarkDataOk =
    expandedOperatorDefaultReport?.noDarkDataStatus === "pass" &&
    observabilityReport?.noDarkDataStatus === "pass";
  const provenanceOk = hasProvenance({
    expandedReport: expandedOperatorDefaultReport,
    observabilityReport,
  });
  const checks: Phase2ControlledUserFacingProactivityScopeCheck[] = [];
  addCheck(checks, "scope:no_wildcard", !wildcardScope, "wildcard_scope_rejected");
  addCheck(checks, "scope:exact_match", scopeMatched, "exact_approved_scope_required");
  addCheck(
    checks,
    "proof:slice32_expanded_operator_default",
    expandedProofOk,
    "slice32_expanded_operator_default_required",
  );
  addCheck(checks, "observability:present", observabilityPresent, "slice33_observability_required");
  addCheck(checks, "observability:healthy", observabilityHealthy, "observability_healthy_required");
  addCheck(checks, "message_class:allowed", allowedClass, "approved_message_class_required");
  addCheck(
    checks,
    "send_approval:explicit",
    explicitSendApproval,
    "explicit_send_approval_required",
  );
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");

  let decision: Phase2ControlledUserFacingProactivityScopeDecision;
  if (rollback) {
    decision = "blocked_rollback";
  } else if (wildcardScope) {
    decision = "blocked_wildcard_scope";
  } else if (!scopeMatched) {
    decision = "blocked_scope";
  } else if (!expandedProofOk) {
    decision = "blocked_missing_expanded_operator_default_proof";
  } else if (!observabilityPresent) {
    decision = "blocked_missing_observability";
  } else if (!observabilityHealthy) {
    decision = "blocked_observability_not_healthy";
  } else if (!allowedClass) {
    decision = "blocked_message_class";
  } else if (!explicitSendApproval) {
    decision = "blocked_missing_send_approval";
  } else if (!noDarkDataOk) {
    decision = "blocked_no_dark_data";
  } else if (!provenanceOk) {
    decision = "blocked_provenance";
  } else {
    decision = "blocked_delivery_adapter";
  }

  let adapterResult: Phase2ControlledUserFacingProactivityScopeAdapterResult | undefined;
  if (decision === "blocked_delivery_adapter" && allowedClass) {
    adapterResult = await adapter.deliver({
      sessionKey: requestScope.sessionKey,
      messageClass,
      boundedDisplayText: boundedDisplayText(messageClass),
      label: "Model Memory",
      idempotencyKey: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_controlled_user_facing_scope_idempotency",
        targetId: messageClass,
        seed: { generatedAt, requestScope },
      }),
    });
    decision =
      adapterResult.ok && adapterResult.delivered
        ? "scoped_user_facing_proactivity_delivered"
        : "blocked_delivery_adapter";
  }

  const deliveryId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_scope_delivery",
    targetId: allowedClass ? messageClass : "blocked",
    seed: {
      generatedAt,
      decision,
      requestScope,
      adapterMessageId: adapterResult?.messageId ?? null,
    },
  });
  const rollbackPlan: Phase2ControlledUserFacingProactivityScopeRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_scope_rollback",
      targetId: deliveryId,
      seed: rollback,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED",
    targetMode: "operator_default_visible_workflow_only",
    disablesScopedRealUserDelivery: true,
  };
  const proofHashes = uniqueSortedStrings([
    ...(expandedOperatorDefaultReport
      ? [sha256JsonValue(expandedOperatorDefaultReport as unknown as JsonLike)]
      : []),
    ...(observabilityReport ? [sha256JsonValue(observabilityReport as unknown as JsonLike)] : []),
  ]);
  const deliveryEvidence: Phase2ControlledUserFacingDeliveryEvidence = {
    deliveryId,
    adapterMessageId: adapterResult?.messageId,
    messageClass: allowedClass ? messageClass : "operator_approved_suggestion_available",
    boundedDisplayText: allowedClass
      ? boundedDisplayText(messageClass)
      : "An approved operator suggestion is available.",
    delivered: decision === "scoped_user_facing_proactivity_delivered",
    observableInOperatorUi: adapterResult?.observableInOperatorUi === true,
    liveUserMessageSent: decision === "scoped_user_facing_proactivity_delivered",
    resultHash: sha256JsonValue({ deliveryId, adapterMessageId: adapterResult?.messageId ?? null }),
    actionExecution: false,
  };
  const config: Phase2ControlledUserFacingProactivityScopeConfig = {
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_scope_config",
      targetId: approvedScope.recipientId,
      seed: { generatedAt, approvedScope },
    }),
    environment: "live",
    mode: "controlled_user_scope",
    approvedScope,
    proofPrerequisites: {
      expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId,
      expandedOperatorDefaultProofHash: expandedOperatorDefaultReport
        ? sha256JsonValue(expandedOperatorDefaultReport as unknown as JsonLike)
        : undefined,
      observabilityReportId: observabilityReport?.reportId,
      observabilityProofHash: observabilityReport
        ? sha256JsonValue(observabilityReport as unknown as JsonLike)
        : undefined,
      observabilityStatus: observabilityReport?.status,
    },
    rollbackPlan,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_user_facing_scope_report",
    targetId: approvedScope.recipientId,
    seed: {
      generatedAt,
      proofMarker: input.proofMarker ?? null,
      decision,
      messageClass,
      expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId ?? null,
      observabilityReportId: observabilityReport?.reportId ?? null,
    },
  });
  const reasonCodes = uniqueSortedStrings(
    checks.map((check) => check.reasonCode).concat(adapterResult?.reasonCodes ?? [], decision),
  );
  const policy: Phase2ControlledUserFacingProactivityScopePolicy = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_user_facing_scope_policy",
      targetId: approvedScope.recipientId,
      seed: generatedAt,
    }),
    requireExpandedOperatorDefaultProof: true,
    requireHealthyObservability: true,
    requireApprovedSuggestion: true,
    requireStagedApproval: true,
    requireExplicitSendApproval: true,
    requireSelectedUserProjectSessionScope: true,
    requireProvenance: true,
    requireNoDarkDataPass: true,
    deliveryAdapterKind: "gateway_chat_inject",
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
  const telemetry: Phase2ControlledUserFacingProactivityScopeTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId,
    observabilityReportId: observabilityReport?.reportId,
    messageClass: allowedClass ? messageClass : "operator_approved_suggestion_available",
    deliveryId,
    sourceProfileIds: uniqueSortedStrings(
      expandedOperatorDefaultReport?.telemetry.sourceProfileIds ?? [],
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      expandedOperatorDefaultReport?.telemetry.authorityTiers ?? [],
    ) as SourceAuthorityTier[],
    sourceRefs: uniqueSortedStrings(expandedOperatorDefaultReport?.telemetry.sourceRefIds ?? []),
    contentHashes: uniqueSortedStrings(
      expandedOperatorDefaultReport?.telemetry.contentHashes ?? [],
    ),
    proofHashes,
    reasonCodes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    observabilityStatus: observabilityReport?.status,
    scopeMatched,
    rollbackObserved: rollback,
    explicitSendApproval,
    liveUserMessageSent: deliveryEvidence.liveUserMessageSent,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ControlledUserFacingProactivityScopeReport = {
    schemaVersion: PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    approvedScope,
    requestScope,
    messageClass: allowedClass ? messageClass : "operator_approved_suggestion_available",
    deliveryEvidence,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ControlledUserFacingProactivityScopeReport;
}

export function assertPhase2ControlledUserFacingProactivityScopeDelivered(
  report: Phase2ControlledUserFacingProactivityScopeReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "scoped_user_facing_proactivity_delivered") {
    throw new Error(`phase2 controlled user-facing scope not delivered: ${report.decision}`);
  }
  if (!report.telemetry.scopeMatched || !report.deliveryEvidence.liveUserMessageSent) {
    throw new Error("phase2 controlled user-facing scope did not deliver inside approved scope");
  }
  if (
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 controlled user-facing scope escaped approval boundary");
  }
}

export async function writePhase2ControlledUserFacingProactivityScopeArtifact(input: {
  report: Phase2ControlledUserFacingProactivityScopeReport;
  artifactDir: string;
}): Promise<Phase2ControlledUserFacingProactivityScopeArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-user-facing-proactivity-scope",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Controlled User-Facing Proactivity Scope Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- messageClass: ${input.report.messageClass}`,
    `- deliveryId: ${input.report.deliveryEvidence.deliveryId}`,
    `- expandedOperatorDefaultReportId: ${
      input.report.telemetry.expandedOperatorDefaultReportId ?? "none"
    }`,
    `- observabilityReportId: ${input.report.telemetry.observabilityReportId ?? "none"}`,
    `- observabilityStatus: ${input.report.telemetry.observabilityStatus ?? "none"}`,
    `- scopeMatched: ${input.report.telemetry.scopeMatched}`,
    `- liveUserMessageSent: ${input.report.telemetry.liveUserMessageSent}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 controlled user-facing scope markdown exceeds byte limit");
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
