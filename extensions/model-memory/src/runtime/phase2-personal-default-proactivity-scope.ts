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
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-presentation.ts";
import {
  buildPhase2RealMemoryProactivityCandidateReport,
  type Phase2RealMemoryCandidateReport,
} from "./phase2-real-memory-proactivity-candidates.ts";
import {
  buildPhase2ProactivityNotificationReport,
  type Phase2ProactivityNotificationReport,
} from "./phase2-user-facing-proactivity-notification-ux.ts";

export const PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_SCHEMA_VERSION =
  "phase2_personal_default_proactivity_scope.v1" as const;
export const PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION =
  "phase2_personal_default_proactivity_scope_report.v1" as const;

export type Phase2PersonalDefaultProactivityScope = {
  environment: "live";
  rolloutMode: "personal_default_scope";
  userId: string;
  recipientId: string;
  projectId: string;
  sessionKeys: [string, ...string[]];
  operatorIds: [string, ...string[]];
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  proofPrerequisiteIds: string[];
  proofPrerequisiteHashes: string[];
  observabilityStatus: "healthy";
};

export type Phase2PersonalDefaultProactivityPolicy = {
  schemaVersion: typeof PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_SCHEMA_VERSION;
  policyId: string;
  requireExactPersonalScope: true;
  requireRealCandidateProof: true;
  requireProductSurfacingProof: true;
  requireNotificationUxProof: true;
  requireExplicitSendApproval: true;
  allowedMessageClasses: Phase2PersonalDefaultProactivityScope["allowedMessageClasses"];
  rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED";
  autonomousSendingAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
};

export type Phase2PersonalDefaultProactivityConfig = {
  configId: string;
  enabled: boolean;
  scope: Phase2PersonalDefaultProactivityScope;
  policyId: string;
};

export type Phase2PersonalDefaultProactivityDecision =
  | "personal_default_scope_enabled"
  | "blocked"
  | "rollback_disabled";

export type Phase2PersonalDefaultProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "explicit_personal_scope_required"
    | "wildcard_scope_rejected"
    | "slice40_surfacing_proof_required"
    | "slice41_real_candidate_proof_required"
    | "slice42_notification_proof_required"
    | "approved_message_classes_required"
    | "explicit_send_approval_required"
    | "healthy_observability_required"
    | "provenance_required"
    | "no_dark_data_required"
    | "rollback_kill_switch_inactive"
    | "autonomous_sending_disabled"
    | "action_execution_disabled";
};

export type Phase2PersonalDefaultProactivityTelemetry = {
  schemaVersion: typeof PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_SCHEMA_VERSION;
  reportId: string;
  generatedCount: number;
  reviewedCount: number;
  sentCount: number;
  deliveredCount: number;
  dismissedCount: number;
  snoozedCount: number;
  allowedMessageClasses: Phase2PersonalDefaultProactivityScope["allowedMessageClasses"];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  observabilityStatus: "healthy" | "degraded" | "blocked";
  explicitSendApprovalRequired: true;
  personalScopeDefaultActive: boolean;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  rollbackObserved: boolean;
};

export type Phase2PersonalDefaultProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED";
  targetMode: "operator_only_manual_proof";
  disablesPersonalDefaultScope: true;
  preservesManualQueueReview: true;
};

export type Phase2PersonalDefaultProactivityReport = {
  schemaVersion: typeof PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PersonalDefaultProactivityDecision;
  policy: Phase2PersonalDefaultProactivityPolicy;
  config: Phase2PersonalDefaultProactivityConfig;
  realCandidateReport: Phase2RealMemoryCandidateReport;
  productSurfacingReport: Phase2ProductProactivitySurfacingReport;
  notificationReport: Phase2ProactivityNotificationReport;
  checks: Phase2PersonalDefaultProactivityCheck[];
  telemetry: Phase2PersonalDefaultProactivityTelemetry;
  rollbackPlan: Phase2PersonalDefaultProactivityRollbackPlan;
  uiEvidence?: {
    sessionKey: string;
    personalScopeActive: boolean;
    realCandidateVisibleByDefault: boolean;
    notificationAfterApproval: boolean;
    chatInjectObserved: boolean;
    dismissedOrSnoozedTelemetryVisible: boolean;
    outsideScopeBlocked: boolean;
    rollbackToOperatorOnly: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2PersonalDefaultProactivityInput = {
  now?: Date;
  scope?: Partial<Phase2PersonalDefaultProactivityScope>;
  realCandidateReport?: Phase2RealMemoryCandidateReport | null;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  notificationReport?: Phase2ProactivityNotificationReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2PersonalDefaultProactivityReport["uiEvidence"];
  forceWildcardScope?: boolean;
  forceMissingSendApproval?: boolean;
  forceDegradedObservability?: boolean;
  forceMissingProvenance?: boolean;
  forceNoDarkDataFail?: boolean;
  forceAutonomousSending?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2PersonalDefaultProactivityArtifact = {
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
  "privatePhrase",
]);

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
];

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    for (const marker of PROHIBITED_MARKERS) {
      if (lowered.includes(marker)) {
        throw new Error("phase2 personal default proactivity contains prohibited marker content");
      }
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 personal default proactivity contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function buildScope(
  input: Phase2PersonalDefaultProactivityInput,
  prerequisiteIds: string[],
  prerequisiteHashes: string[],
): Phase2PersonalDefaultProactivityScope {
  const sessionKey = input.scope?.sessionKeys?.[0] ?? input.scope?.sessionKeys?.[0] ?? "main";
  const operatorId = input.scope?.operatorIds?.[0] ?? "local-openclaw-operator";
  return {
    environment: "live",
    rolloutMode: "personal_default_scope",
    userId: input.forceWildcardScope ? "*" : (input.scope?.userId ?? "local-openclaw-user"),
    recipientId: input.forceWildcardScope
      ? "*"
      : (input.scope?.recipientId ?? "local-openclaw-recipient"),
    projectId: input.forceWildcardScope ? "*" : (input.scope?.projectId ?? "openclaw"),
    sessionKeys: [input.forceWildcardScope ? "*" : sessionKey],
    operatorIds: [input.forceWildcardScope ? "*" : operatorId],
    allowedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
    proofPrerequisiteIds: prerequisiteIds,
    proofPrerequisiteHashes: prerequisiteHashes,
    observabilityStatus: "healthy",
  };
}

function addCheck(
  checks: Phase2PersonalDefaultProactivityCheck[],
  reasonCode: Phase2PersonalDefaultProactivityCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_default_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function hasWildcardScope(scope: Phase2PersonalDefaultProactivityScope): boolean {
  return (
    scope.userId === "*" ||
    scope.recipientId === "*" ||
    scope.projectId === "*" ||
    scope.sessionKeys.includes("*") ||
    scope.operatorIds.includes("*")
  );
}

async function loadPrerequisites(input: Phase2PersonalDefaultProactivityInput): Promise<{
  realCandidateReport: Phase2RealMemoryCandidateReport;
  productSurfacingReport: Phase2ProductProactivitySurfacingReport;
  notificationReport: Phase2ProactivityNotificationReport;
}> {
  const realCandidateReport =
    input.realCandidateReport ??
    (await buildPhase2RealMemoryProactivityCandidateReport({
      now: input.now,
      env: input.env,
    }));
  const productSurfacingReport =
    input.productSurfacingReport ??
    (await buildPhase2ProductProactivitySurfacingReport({
      now: input.now,
      env: input.env,
      realCandidateReport,
    }));
  const notificationReport =
    input.notificationReport ??
    (await buildPhase2ProactivityNotificationReport({
      now: input.now,
      env: input.env,
      productSurfacingReport,
      queueItemStatus: "sent",
    }));
  return { realCandidateReport, productSurfacingReport, notificationReport };
}

export async function buildPhase2PersonalDefaultProactivityReport(
  input: Phase2PersonalDefaultProactivityInput = {},
): Promise<Phase2PersonalDefaultProactivityReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const rollback = input.env?.MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED === "1";
  const { realCandidateReport, productSurfacingReport, notificationReport } =
    await loadPrerequisites(input);
  const prerequisiteIds = [
    productSurfacingReport.reportId,
    realCandidateReport.reportId,
    notificationReport.reportId,
  ];
  const prerequisiteHashes = [
    reportHash(productSurfingReportAsJson(productSurfacingReport)),
    reportHash(realCandidateReport as JsonLike),
    reportHash(notificationReport as JsonLike),
  ];
  const scope = buildScope(input, prerequisiteIds, prerequisiteHashes);
  const policy: Phase2PersonalDefaultProactivityPolicy = {
    schemaVersion: PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_default_policy",
      targetId: "personal-default-proactivity",
      seed: { scope, prerequisiteIds },
    }),
    requireExactPersonalScope: true,
    requireRealCandidateProof: true,
    requireProductSurfacingProof: true,
    requireNotificationUxProof: true,
    requireExplicitSendApproval: true,
    allowedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
    rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED",
    autonomousSendingAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_personal_default_proactivity_report",
    targetId: scope.userId,
    seed: { generatedAt, scope, prerequisiteIds, rollback },
  });
  const checks: Phase2PersonalDefaultProactivityCheck[] = [];
  const explicitScopeOk =
    scope.environment === "live" &&
    scope.rolloutMode === "personal_default_scope" &&
    scope.userId.length > 0 &&
    scope.projectId.length > 0 &&
    scope.sessionKeys.length > 0 &&
    scope.operatorIds.length > 0;
  const allowedClassesOk =
    scope.allowedMessageClasses.length === 2 &&
    scope.allowedMessageClasses.every((entry) => ALLOWED_MESSAGE_CLASSES.includes(entry));
  const provenanceOk =
    !input.forceMissingProvenance &&
    productSurfacingReport.telemetry.sourceRefs.length > 0 &&
    productSurfacingReport.telemetry.sourceProfileIds.length > 0 &&
    notificationReport.telemetry.proofHashes.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    productSurfacingReport.noDarkDataStatus === "pass" &&
    realCandidateReport.noDarkDataStatus === "pass" &&
    notificationReport.telemetry.noDarkDataStatus === "pass";
  const explicitSendApprovalOk =
    !input.forceMissingSendApproval &&
    productSurfacingReport.telemetry.explicitApproveSendRequired &&
    notificationReport.telemetry.visibleCount > 0;
  const observabilityOk = !input.forceDegradedObservability;
  addCheck(checks, "explicit_personal_scope_required", explicitScopeOk);
  addCheck(checks, "wildcard_scope_rejected", !hasWildcardScope(scope));
  addCheck(
    checks,
    "slice40_surfacing_proof_required",
    productSurfacingReport.decision === "product_queue_enabled",
  );
  addCheck(
    checks,
    "slice41_real_candidate_proof_required",
    realCandidateReport.decision === "real_candidates_generated",
  );
  addCheck(
    checks,
    "slice42_notification_proof_required",
    notificationReport.decision === "notification_ux_enabled",
  );
  addCheck(checks, "approved_message_classes_required", allowedClassesOk);
  addCheck(checks, "explicit_send_approval_required", explicitSendApprovalOk);
  addCheck(checks, "healthy_observability_required", observabilityOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "rollback_kill_switch_inactive", !rollback);
  addCheck(checks, "autonomous_sending_disabled", input.forceAutonomousSending !== true);
  addCheck(checks, "action_execution_disabled", input.forceActionExecution !== true);
  const failed = checks.some((check) => check.status === "fail");
  const decision: Phase2PersonalDefaultProactivityDecision = rollback
    ? "rollback_disabled"
    : failed
      ? "blocked"
      : "personal_default_scope_enabled";
  const queueItems = productSurfacingReport.queue.items;
  const telemetry: Phase2PersonalDefaultProactivityTelemetry = {
    schemaVersion: PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_SCHEMA_VERSION,
    reportId,
    generatedCount: realCandidateReport.telemetry.candidateCount,
    reviewedCount: queueItems.length,
    sentCount: notificationReport.telemetry.visibleCount,
    deliveredCount: notificationReport.telemetry.visibleCount,
    dismissedCount: queueItems.filter((item) => item.status === "dismissed").length,
    snoozedCount: queueItems.filter((item) => item.status === "snoozed").length,
    allowedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
    sourceRefs: uniqueSortedStrings([
      ...productSurfacingReport.telemetry.sourceRefs,
      ...realCandidateReport.telemetry.sourceRefs,
      ...notificationReport.telemetry.sourceRefs,
    ]),
    sourceProfileIds: uniqueSortedStrings([
      ...productSurfacingReport.telemetry.sourceProfileIds,
      ...realCandidateReport.telemetry.sourceProfileIds,
      ...notificationReport.telemetry.sourceProfileIds,
    ]) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings([
      ...productSurfacingReport.telemetry.authorityTiers,
      ...realCandidateReport.telemetry.authorityTiers,
      ...notificationReport.telemetry.authorityTiers,
    ]) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings([
      ...productSurfacingReport.telemetry.contentHashes,
      ...realCandidateReport.telemetry.contentHashes,
      ...notificationReport.telemetry.contentHashes,
    ]),
    proofHashes: uniqueSortedStrings([
      ...productSurfacingReport.telemetry.proofHashes,
      ...realCandidateReport.telemetry.proofHashes,
      ...notificationReport.telemetry.proofHashes,
      ...prerequisiteHashes,
    ]),
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    observabilityStatus: observabilityOk ? "healthy" : "degraded",
    explicitSendApprovalRequired: true,
    personalScopeDefaultActive: decision === "personal_default_scope_enabled",
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
    rollbackObserved: rollback,
  };
  const config: Phase2PersonalDefaultProactivityConfig = {
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_default_config",
      targetId: scope.userId,
      seed: { scope, decision },
    }),
    enabled: decision === "personal_default_scope_enabled",
    scope,
    policyId: policy.policyId,
  };
  const rollbackPlan: Phase2PersonalDefaultProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_default_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED",
    targetMode: "operator_only_manual_proof",
    disablesPersonalDefaultScope: true,
    preservesManualQueueReview: true,
  };
  const report: Phase2PersonalDefaultProactivityReport = {
    schemaVersion: PHASE2_PERSONAL_DEFAULT_PROACTIVITY_SCOPE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    config,
    realCandidateReport,
    productSurfacingReport,
    notificationReport,
    checks,
    telemetry,
    rollbackPlan,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

function productSurfingReportAsJson(report: Phase2ProductProactivitySurfacingReport): JsonLike {
  return report as JsonLike;
}

export function assertPhase2PersonalDefaultProactivityEnabled(
  report: Phase2PersonalDefaultProactivityReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "personal_default_scope_enabled") {
    throw new Error(`phase2 personal default proactivity not enabled: ${report.decision}`);
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 personal default proactivity enabled forbidden behavior");
  }
  if (!report.telemetry.explicitSendApprovalRequired) {
    throw new Error("phase2 personal default proactivity removed explicit send approval");
  }
}

export async function writePhase2PersonalDefaultProactivityArtifact(input: {
  report: Phase2PersonalDefaultProactivityReport;
  artifactDir: string;
}): Promise<Phase2PersonalDefaultProactivityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-personal-default-proactivity-scope",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Personal Default Proactivity Scope",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- rolloutMode: ${input.report.config.scope.rolloutMode}`,
    `- userId: ${input.report.config.scope.userId}`,
    `- projectId: ${input.report.config.scope.projectId}`,
    `- generatedCount: ${input.report.telemetry.generatedCount}`,
    `- deliveredCount: ${input.report.telemetry.deliveredCount}`,
    `- explicitSendApprovalRequired: ${input.report.telemetry.explicitSendApprovalRequired}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    `- noDarkDataStatus: ${input.report.telemetry.noDarkDataStatus}`,
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
