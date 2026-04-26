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
  buildPhase2ControlledMultiUserProactivityReport,
  type Phase2ControlledMultiUserProactivityReport,
} from "./phase2-controlled-multi-user-proactivity-rollout.ts";
import {
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";
import {
  buildPhase2ProactivityDefaultReadinessReport,
  type Phase2ProactivityDefaultReadinessReport,
} from "./phase2-proactivity-default-readiness.ts";

export const PHASE2_USER_FACING_PROACTIVITY_DEFAULT_SCHEMA_VERSION =
  "phase2_user_facing_proactivity_default.v1" as const;
export const PHASE2_USER_FACING_PROACTIVITY_DEFAULT_REPORT_SCHEMA_VERSION =
  "phase2_user_facing_proactivity_default_report.v1" as const;

export type Phase2UserFacingProactivityDefaultPromotionDecision =
  | "approved_for_default_eligible_user_facing_delivery"
  | "partial_approval"
  | "blocked";

export type Phase2UserFacingProactivityDefaultMessageClass =
  | "operator_approved_suggestion_available"
  | "operator_approved_follow_up_available";

export type Phase2UserFacingProactivityCapabilityDecision = {
  capability: "default_eligible_user_facing_proactivity_delivery";
  decision: Phase2UserFacingProactivityDefaultPromotionDecision;
  approvedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  blockedMessageClasses: [
    "unapproved_suggestion",
    "external_instruction_message",
    "private_or_secret_content",
    "raw_prompt_or_transcript_content",
    "autonomous_action_request",
    "unknown_message_class",
  ];
  explicitSendApprovalRequired: true;
  autonomousSendingAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  reasonCodes: string[];
};

export type Phase2UserFacingProactivityDefaultPromotionConfig = {
  schemaVersion: typeof PHASE2_USER_FACING_PROACTIVITY_DEFAULT_SCHEMA_VERSION;
  configId: string;
  mode: "default_eligible_user_facing_delivery";
  eligibleUserScopeRequired: true;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  requireReadinessReady: true;
  requireHealthyObservability: true;
  requireCohortProof: true;
  requireExplicitSendApproval: true;
  requireNoDarkDataPass: true;
  requireProvenance: true;
  automaticSendAllowed: false;
  autonomousSendingAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2UserFacingProactivityDefaultRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED";
  targetMode: "controlled_multi_user_scope";
  disablesDefaultEligibleUserFacingDelivery: true;
};

export type Phase2UserFacingProactivityDefaultCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "readiness_ready_required"
    | "healthy_observability_required"
    | "cohort_rollout_required"
    | "explicit_send_approval_required"
    | "no_dark_data_required"
    | "provenance_required"
    | "eligible_user_scope_required"
    | "approved_message_class_required"
    | "blocked_classes_must_remain_blocked"
    | "rollback_kill_switch_inactive"
    | "autonomous_sending_must_remain_disabled"
    | "delivery_action_execution_must_remain_disabled";
};

export type Phase2UserFacingProactivityDefaultTelemetry = {
  schemaVersion: typeof PHASE2_USER_FACING_PROACTIVITY_DEFAULT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2UserFacingProactivityDefaultPromotionDecision;
  readinessReportId?: string;
  observabilityReportId?: string;
  cohortReportId?: string;
  approvedMessageClasses: Phase2UserFacingProactivityDefaultMessageClass[];
  deliveryIds: string[];
  sendApprovalIds: string[];
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  eligibleUserScopeRequired: true;
  explicitSendApprovalRequired: true;
  rollbackObserved: boolean;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2UserFacingProactivityDefaultPromotionReport = {
  schemaVersion: typeof PHASE2_USER_FACING_PROACTIVITY_DEFAULT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2UserFacingProactivityDefaultPromotionDecision;
  config: Phase2UserFacingProactivityDefaultPromotionConfig;
  capabilityDecision: Phase2UserFacingProactivityCapabilityDecision;
  checks: Phase2UserFacingProactivityDefaultCheck[];
  rollbackPlan: Phase2UserFacingProactivityDefaultRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  eligibleUserDeliveryObserved: boolean;
  nonEligibleDeliveryBlocked: boolean;
  telemetry: Phase2UserFacingProactivityDefaultTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    eligibleDeliveryRunId?: string | null;
    nonEligibleBlockedRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    observedTextSha256?: string;
  };
};

export type Phase2UserFacingProactivityDefaultPromotionInput = {
  now?: Date;
  proofMarker?: string;
  readinessReport?: Phase2ProactivityDefaultReadinessReport | null;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport | null;
  cohortRolloutReport?: Phase2ControlledMultiUserProactivityReport | null;
  messageClass?: Phase2UserFacingProactivityDefaultMessageClass | "external_instruction_message";
  eligibleUserScope?: boolean;
  explicitSendApproval?: boolean;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2UserFacingProactivityDefaultPromotionReport["uiEvidence"];
  forceAutonomousSending?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2UserFacingProactivityDefaultArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_CLASSES = [
  "operator_approved_suggestion_available",
  "operator_approved_follow_up_available",
] as const;

const BLOCKED_CLASSES = [
  "unapproved_suggestion",
  "external_instruction_message",
  "private_or_secret_content",
  "raw_prompt_or_transcript_content",
  "autonomous_action_request",
  "unknown_message_class",
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
        `phase2 user-facing proactivity default contains prohibited field: ${[
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
      throw new Error("phase2 user-facing proactivity default contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2UserFacingProactivityDefaultCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2UserFacingProactivityDefaultCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function allowedClass(
  messageClass: Phase2UserFacingProactivityDefaultPromotionInput["messageClass"],
): messageClass is Phase2UserFacingProactivityDefaultMessageClass {
  return (ALLOWED_CLASSES as readonly string[]).includes(String(messageClass));
}

export async function buildPhase2UserFacingProactivityDefaultPromotionReport(
  input: Phase2UserFacingProactivityDefaultPromotionInput = {},
): Promise<Phase2UserFacingProactivityDefaultPromotionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const proofMarker = input.proofMarker;
  const readinessReport =
    input.readinessReport === null
      ? undefined
      : (input.readinessReport ??
        (await buildPhase2ProactivityDefaultReadinessReport({ now: input.now, proofMarker })));
  const observabilityReport =
    input.observabilityReport === null
      ? undefined
      : (input.observabilityReport ??
        (await buildPhase2ProactiveDeliveryHealthReport({ now: input.now, proofMarker })));
  const cohortRolloutReport =
    input.cohortRolloutReport === null
      ? undefined
      : (input.cohortRolloutReport ??
        (await buildPhase2ControlledMultiUserProactivityReport({
          now: input.now,
          proofMarker,
          observabilityReport,
        })));
  const messageClass = input.messageClass ?? "operator_approved_suggestion_available";
  const classOk = allowedClass(messageClass);
  const eligibleUserScope = input.eligibleUserScope ?? true;
  const explicitSendApproval = input.explicitSendApproval ?? true;
  const rollback = readRollback(input.env);
  const readinessOk = readinessReport?.decision === "ready_for_default_promotion_decision";
  const observabilityOk = observabilityReport?.status === "healthy";
  const cohortOk = cohortRolloutReport?.decision === "controlled_multi_user_delivery_observed";
  const noDarkDataOk =
    readinessReport?.noDarkDataStatus === "pass" &&
    observabilityReport?.noDarkDataStatus === "pass" &&
    cohortRolloutReport?.noDarkDataStatus === "pass";
  const provenanceOk = Boolean(
    readinessReport &&
    readinessReport.evidence.sourceRefs.length > 0 &&
    readinessReport.evidence.sourceProfileIds.length > 0 &&
    readinessReport.evidence.authorityTiers.length > 0,
  );
  const blockedClassesOk = !(BLOCKED_CLASSES as readonly string[]).includes(messageClass);
  const autonomousOk =
    !input.forceAutonomousSending &&
    readinessReport?.telemetry.autonomousSendingEnabled === false &&
    observabilityReport?.telemetry.autonomousSendingAllowed === false &&
    cohortRolloutReport?.telemetry.autonomousSendingEnabled === false;
  const actionOk =
    !input.forceActionExecution &&
    readinessReport?.telemetry.actionExecutionObserved === false &&
    observabilityReport?.telemetry.actionExecutionObserved === false &&
    cohortRolloutReport?.telemetry.actionExecutionObserved === false;

  const checks: Phase2UserFacingProactivityDefaultCheck[] = [];
  addCheck(checks, "proof:readiness", readinessOk, "readiness_ready_required");
  addCheck(checks, "observability:healthy", observabilityOk, "healthy_observability_required");
  addCheck(checks, "proof:cohort", cohortOk, "cohort_rollout_required");
  addCheck(
    checks,
    "send_approval:explicit",
    explicitSendApproval,
    "explicit_send_approval_required",
  );
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "scope:eligible_user", eligibleUserScope, "eligible_user_scope_required");
  addCheck(checks, "message_class:approved", classOk, "approved_message_class_required");
  addCheck(
    checks,
    "message_class:blocked_classes",
    blockedClassesOk,
    "blocked_classes_must_remain_blocked",
  );
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  addCheck(
    checks,
    "autonomous_sending:disabled",
    autonomousOk,
    "autonomous_sending_must_remain_disabled",
  );
  addCheck(
    checks,
    "delivery_action_execution:disabled",
    actionOk,
    "delivery_action_execution_must_remain_disabled",
  );

  const failedChecks = checks.filter((check) => check.status === "fail");
  const coreProofsOk = readinessOk && observabilityOk && cohortOk;
  const decision: Phase2UserFacingProactivityDefaultPromotionDecision =
    failedChecks.length === 0
      ? "approved_for_default_eligible_user_facing_delivery"
      : coreProofsOk && failedChecks.length <= 2
        ? "partial_approval"
        : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_user_facing_proactivity_default_report",
    targetId: "eligible-user-facing-proactivity",
    seed: {
      generatedAt,
      decision,
      readinessReportId: readinessReport?.reportId ?? null,
      messageClass,
      failedReasonCodes: failedChecks.map((check) => check.reasonCode),
    },
  });
  const reasonCodes = failedChecks.map((check) => check.reasonCode);
  const rollbackPlan: Phase2UserFacingProactivityDefaultRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_user_facing_proactivity_default_rollback",
      targetId: reportId,
      seed: { decision, readinessReportId: readinessReport?.reportId ?? null },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED",
    targetMode: "controlled_multi_user_scope",
    disablesDefaultEligibleUserFacingDelivery: true,
  };
  const config: Phase2UserFacingProactivityDefaultPromotionConfig = {
    schemaVersion: PHASE2_USER_FACING_PROACTIVITY_DEFAULT_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_user_facing_proactivity_default_config",
      targetId: "eligible-user-facing-proactivity",
      seed: readinessReport?.reportId ?? generatedAt,
    }),
    mode: "default_eligible_user_facing_delivery",
    eligibleUserScopeRequired: true,
    allowedMessageClasses: [...ALLOWED_CLASSES],
    requireReadinessReady: true,
    requireHealthyObservability: true,
    requireCohortProof: true,
    requireExplicitSendApproval: true,
    requireNoDarkDataPass: true,
    requireProvenance: true,
    automaticSendAllowed: false,
    autonomousSendingAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    externalTextHandling: "evidence_not_instruction",
  };
  const capabilityDecision: Phase2UserFacingProactivityCapabilityDecision = {
    capability: "default_eligible_user_facing_proactivity_delivery",
    decision,
    approvedMessageClasses: [...ALLOWED_CLASSES],
    blockedMessageClasses: [...BLOCKED_CLASSES],
    explicitSendApprovalRequired: true,
    autonomousSendingAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    reasonCodes,
  };
  const telemetry: Phase2UserFacingProactivityDefaultTelemetry = {
    schemaVersion: PHASE2_USER_FACING_PROACTIVITY_DEFAULT_SCHEMA_VERSION,
    reportId,
    decision,
    readinessReportId: readinessReport?.reportId,
    observabilityReportId: observabilityReport?.reportId,
    cohortReportId: cohortRolloutReport?.reportId,
    approvedMessageClasses: [...ALLOWED_CLASSES],
    deliveryIds: uniqueSortedStrings([
      ...(readinessReport?.evidence.deliveryIds ?? []),
      ...(cohortRolloutReport?.telemetry.deliveryIds ?? []),
    ]),
    sendApprovalIds: uniqueSortedStrings([
      ...(readinessReport?.evidence.sendApprovalIds ?? []),
      ...(cohortRolloutReport?.telemetry.sendApprovalIds ?? []),
    ]),
    sourceRefs: uniqueSortedStrings(readinessReport?.evidence.sourceRefs ?? []),
    sourceProfileIds: uniqueSortedStrings(readinessReport?.evidence.sourceProfileIds ?? []),
    authorityTiers: uniqueSortedStrings(readinessReport?.evidence.authorityTiers ?? []),
    contentHashes: uniqueSortedStrings(readinessReport?.evidence.contentHashes ?? []),
    proofHashes: uniqueSortedStrings([
      ...(readinessReport?.evidence.proofHashes ?? []),
      reportHash(readinessReport as JsonLike | undefined) ?? "",
      reportHash(cohortRolloutReport as JsonLike | undefined) ?? "",
    ]).filter(Boolean),
    reasonCodes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    eligibleUserScopeRequired: true,
    explicitSendApprovalRequired: true,
    rollbackObserved: rollback,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2UserFacingProactivityDefaultPromotionReport = {
    schemaVersion: PHASE2_USER_FACING_PROACTIVITY_DEFAULT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    capabilityDecision,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    eligibleUserDeliveryObserved:
      decision === "approved_for_default_eligible_user_facing_delivery" && eligibleUserScope,
    nonEligibleDeliveryBlocked: !eligibleUserScope || input.eligibleUserScope === undefined,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2UserFacingProactivityDefaultPromotionApproved(
  report: Phase2UserFacingProactivityDefaultPromotionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_default_eligible_user_facing_delivery") {
    throw new Error(`phase2 user-facing proactivity default not approved: ${report.decision}`);
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 user-facing proactivity default enabled forbidden behavior");
  }
}

export async function writePhase2UserFacingProactivityDefaultPromotionArtifact(input: {
  report: Phase2UserFacingProactivityDefaultPromotionReport;
  artifactDir: string;
}): Promise<Phase2UserFacingProactivityDefaultArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-user-facing-proactivity-default-promotion",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 User-Facing Proactivity Default Promotion",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- readinessReportId: ${input.report.telemetry.readinessReportId ?? "missing"}`,
    `- approvedMessageClasses: ${input.report.telemetry.approvedMessageClasses.join(", ")}`,
    `- explicitSendApprovalRequired: ${input.report.telemetry.explicitSendApprovalRequired}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
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
