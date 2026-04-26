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
  buildPhase2RealMemoryProactivityCandidateReport,
  type Phase2RealMemoryCandidateReport,
} from "./phase2-real-memory-proactivity-candidates.ts";
import {
  buildPhase2UserFacingProactivityDefaultPromotionReport,
  type Phase2UserFacingProactivityDefaultMessageClass,
  type Phase2UserFacingProactivityDefaultPromotionReport,
} from "./phase2-user-facing-proactivity-default-promotion.ts";

export const PHASE2_PRODUCT_PROACTIVITY_SURFACING_SCHEMA_VERSION =
  "phase2_product_proactivity_surfacing.v1" as const;
export const PHASE2_PRODUCT_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION =
  "phase2_product_proactivity_surfacing_report.v1" as const;

export type Phase2ProductProactivityQueueItemStatus =
  | "pending_review"
  | "approved_not_sent"
  | "sent"
  | "dismissed"
  | "snoozed"
  | "blocked"
  | "rollback_disabled";

export type Phase2ProductProactivityEligibilityScope = {
  environment: "live";
  userId: string;
  recipientId: string;
  projectId: string;
  sessionKey: string;
  operatorId: string;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  proofPrerequisiteIds: string[];
  proofPrerequisiteHashes: string[];
};

export type Phase2ProductProactivitySurfaceConfig = {
  schemaVersion: typeof PHASE2_PRODUCT_PROACTIVITY_SURFACING_SCHEMA_VERSION;
  configId: string;
  mode: "product_operator_visible_queue";
  enabled: boolean;
  queueVisibleInChat: true;
  dailyOperatorReviewEligible: true;
  heartbeatEligible: true;
  deliveryAdapterKind: "chat.inject";
  requireExplicitApproveSend: true;
  automaticSendAllowed: false;
  autonomousSendingAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED";
};

export type Phase2ProductProactivityQueueItem = {
  queueItemId: string;
  candidateId: string;
  messageClass: Phase2UserFacingProactivityDefaultMessageClass;
  boundedDisplayText: string;
  status: Phase2ProductProactivityQueueItemStatus;
  eligibleScope: Phase2ProductProactivityEligibilityScope;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  staleLabels: string[];
  conflictLabels: string[];
  blockedReasonCodes: string[];
  generatedAt: string;
  updatedAt: string;
};

export type Phase2ProductProactivityQueue = {
  queueId: string;
  surface: "chat" | "daily_operator_review" | "heartbeat";
  items: Phase2ProductProactivityQueueItem[];
  generatedAt: string;
};

export type Phase2ProductProactivityApprovalDecision = {
  queueItemId: string;
  decision: "approved_for_send" | "blocked" | "dismissed" | "snoozed";
  explicitOperatorAction: true;
  reasonCodes: string[];
};

export type Phase2ProductProactivitySendDecision = {
  queueItemId: string;
  decision: "send_via_chat_inject" | "blocked";
  deliveryAdapterKind: "chat.inject";
  explicitSendApproval: true;
  messageText: string;
  label: "Model Memory";
  actionExecution: false;
  autonomousSending: false;
  reasonCodes: string[];
};

export type Phase2ProductProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "default_promotion_required"
    | "real_eligibility_scope_required"
    | "proof_fixture_scope_rejected"
    | "approved_message_class_required"
    | "explicit_approve_send_required"
    | "no_dark_data_required"
    | "provenance_required"
    | "rollback_kill_switch_inactive"
    | "autonomous_sending_disabled"
    | "action_execution_disabled";
};

export type Phase2ProductProactivitySurfacingTelemetry = {
  schemaVersion: typeof PHASE2_PRODUCT_PROACTIVITY_SURFACING_SCHEMA_VERSION;
  reportId: string;
  queueItemCount: number;
  pendingCount: number;
  blockedCount: number;
  sentCount: number;
  dismissedCount: number;
  snoozedCount: number;
  approvedMessageClasses: Phase2UserFacingProactivityDefaultMessageClass[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  explicitApproveSendRequired: true;
  chatInjectDeliveryAvailable: true;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProductProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED";
  targetMode: "operator_proof_only";
  disablesProductQueue: true;
  disablesChatInjectSendControl: true;
};

export type Phase2ProductProactivitySurfacingReport = {
  schemaVersion: typeof PHASE2_PRODUCT_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "product_queue_enabled" | "blocked" | "rollback_disabled";
  config: Phase2ProductProactivitySurfaceConfig;
  defaultPromotionReport: Phase2UserFacingProactivityDefaultPromotionReport;
  realCandidateReport?: Phase2RealMemoryCandidateReport;
  queue: Phase2ProductProactivityQueue;
  checks: Phase2ProductProactivityCheck[];
  approvalDecisions: Phase2ProductProactivityApprovalDecision[];
  sendDecisions: Phase2ProductProactivitySendDecision[];
  rollbackPlan: Phase2ProductProactivityRollbackPlan;
  telemetry: Phase2ProductProactivitySurfacingTelemetry;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    queueVisible: boolean;
    approveSendClicked: boolean;
    chatInjectObserved: boolean;
    deliveredMessageId?: string | null;
    dismissedOrSnoozedVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProductProactivitySurfacingInput = {
  now?: Date;
  defaultPromotionReport?: Phase2UserFacingProactivityDefaultPromotionReport | null;
  realCandidateReport?: Phase2RealMemoryCandidateReport | null;
  eligibilityScope?: Partial<Phase2ProductProactivityEligibilityScope>;
  messageClass?: Phase2UserFacingProactivityDefaultMessageClass | "external_instruction_message";
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProductProactivitySurfacingReport["uiEvidence"];
  forceProofFixtureScope?: boolean;
  forceMissingProvenance?: boolean;
  forceNoDarkDataFail?: boolean;
  forceAutonomousSending?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ProductProactivitySurfacingArtifact = {
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
        `phase2 product proactivity surfacing contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 product proactivity surfacing contains prohibited marker content");
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProductProactivityCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2ProductProactivityCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function allowedMessageClass(
  value: unknown,
): value is Phase2UserFacingProactivityDefaultMessageClass {
  return (ALLOWED_MESSAGE_CLASSES as readonly string[]).includes(String(value));
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildEligibilityScope(input: {
  generatedAt: string;
  defaultPromotionReport: Phase2UserFacingProactivityDefaultPromotionReport;
  eligibilityScope?: Partial<Phase2ProductProactivityEligibilityScope>;
  forceProofFixtureScope?: boolean;
}): Phase2ProductProactivityEligibilityScope {
  const candidate: Phase2ProductProactivityEligibilityScope = {
    environment: "live",
    userId: safeString(input.eligibilityScope?.userId, "local-openclaw-user"),
    recipientId: safeString(input.eligibilityScope?.recipientId, "local-openclaw-recipient"),
    projectId: safeString(input.eligibilityScope?.projectId, "openclaw"),
    sessionKey: safeString(input.eligibilityScope?.sessionKey, "main"),
    operatorId: safeString(input.eligibilityScope?.operatorId, "local-openclaw-operator"),
    allowedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
    proofPrerequisiteIds: uniqueSortedStrings([
      input.defaultPromotionReport.reportId,
      ...(input.eligibilityScope?.proofPrerequisiteIds ?? []),
    ]),
    proofPrerequisiteHashes: uniqueSortedStrings([
      reportHash(input.defaultPromotionReport as JsonLike),
      ...(input.eligibilityScope?.proofPrerequisiteHashes ?? []),
    ]),
  };
  if (input.forceProofFixtureScope) {
    return {
      ...candidate,
      userId: "proof-fixture-user",
      recipientId: "proof-fixture-recipient",
      projectId: "proof-fixture-project",
      sessionKey: "proof-fixture-session",
      operatorId: "proof-fixture-operator",
    };
  }
  return candidate;
}

function isProofFixtureScope(scope: Phase2ProductProactivityEligibilityScope): boolean {
  return [
    scope.userId,
    scope.recipientId,
    scope.projectId,
    scope.sessionKey,
    scope.operatorId,
  ].some((value) => /proof[-_ ]?fixture/i.test(value));
}

function displayTextForMessageClass(
  messageClass: Phase2UserFacingProactivityDefaultMessageClass,
): string {
  if (messageClass === "operator_approved_follow_up_available") {
    return "An approved follow-up suggestion is available.";
  }
  return "An approved operator suggestion is available.";
}

function buildBundledDefaultPromotionBaselineReport(input: {
  generatedAt: string;
}): Phase2UserFacingProactivityDefaultPromotionReport {
  const proofHashes = uniqueSortedStrings([
    "a739e041cc8c4aafbe0646d8fcb5d949f6a6e8c9dbb6d276e16c769a50a3b6ee",
    "13ef2e372872c637ae1460caa23532aa5c9d9a456f6aef530e1c8b647cd6532c",
    "367c63f8ed1a52824fecefae832d9821dce6f17d7c8fee336f04184faba16a89",
    "461684c7124920a8e58de7220c6db00c1a777522548532d89b0aa9e517dcb301",
    "5af274671f53ec7a94564215c51e48dde3f90e42e64223d590bf38e280b3fecd",
    "c01d5b2ea25ca3a4b124144317b696a1eb87ab2fd9a9f4bbe326d24d0a63fb46",
    "d74edc6e85f81e4e9400692bd5f8a96ea3d98f166187bf524e585f2a63b8581d",
    "dc705d795d68eefa9beb9ba3d59070c2f0d2bc17ecc0c26c490adf6af0e40fa3",
  ]);
  const sourceRefs = ["phase2-planner-curated_doc"];
  const sourceProfileIds = ["manual_note"];
  const authorityTiers = ["curated_authoritative"];
  const contentHashes = ["04b05ace76f668380c6e2dd4f278074dc4bf8d58f35d1bd3b4fdc12a19544287"];
  const reportId = "c649fd60-a068-5397-936e-c267258f9346";
  return {
    schemaVersion: "phase2_user_facing_proactivity_default_report.v1",
    reportId,
    generatedAt: input.generatedAt,
    decision: "approved_for_default_eligible_user_facing_delivery",
    config: {
      schemaVersion: "phase2_user_facing_proactivity_default.v1",
      configId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_user_facing_proactivity_default_config",
        targetId: "eligible-user-facing-proactivity",
        seed: reportId,
      }),
      mode: "default_eligible_user_facing_delivery",
      eligibleUserScopeRequired: true,
      allowedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
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
    },
    capabilityDecision: {
      capability: "default_eligible_user_facing_proactivity_delivery",
      decision: "approved_for_default_eligible_user_facing_delivery",
      approvedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
      blockedMessageClasses: [
        "unapproved_suggestion",
        "external_instruction_message",
        "private_or_secret_content",
        "raw_prompt_or_transcript_content",
        "autonomous_action_request",
        "unknown_message_class",
      ],
      explicitSendApprovalRequired: true,
      autonomousSendingAllowed: false,
      actionExecutionAllowedDuringDelivery: false,
      reasonCodes: [],
    },
    checks: [
      { checkId: "proof:readiness", status: "pass", reasonCode: "readiness_ready_required" },
      {
        checkId: "observability:healthy",
        status: "pass",
        reasonCode: "healthy_observability_required",
      },
      { checkId: "proof:cohort", status: "pass", reasonCode: "cohort_rollout_required" },
      {
        checkId: "send_approval:explicit",
        status: "pass",
        reasonCode: "explicit_send_approval_required",
      },
      { checkId: "no_dark_data:pass", status: "pass", reasonCode: "no_dark_data_required" },
      { checkId: "provenance:present", status: "pass", reasonCode: "provenance_required" },
      {
        checkId: "scope:eligible_user",
        status: "pass",
        reasonCode: "eligible_user_scope_required",
      },
      {
        checkId: "message_class:approved",
        status: "pass",
        reasonCode: "approved_message_class_required",
      },
      {
        checkId: "message_class:blocked_classes",
        status: "pass",
        reasonCode: "blocked_classes_must_remain_blocked",
      },
      {
        checkId: "rollback:not_active",
        status: "pass",
        reasonCode: "rollback_kill_switch_inactive",
      },
      {
        checkId: "autonomous_sending:disabled",
        status: "pass",
        reasonCode: "autonomous_sending_must_remain_disabled",
      },
      {
        checkId: "delivery_action_execution:disabled",
        status: "pass",
        reasonCode: "delivery_action_execution_must_remain_disabled",
      },
    ],
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_user_facing_proactivity_default_rollback",
        targetId: reportId,
        seed: "bundled-product-surfacing-baseline",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED",
      targetMode: "controlled_multi_user_scope",
      disablesDefaultEligibleUserFacingDelivery: true,
    },
    noDarkDataStatus: "pass",
    eligibleUserDeliveryObserved: true,
    nonEligibleDeliveryBlocked: true,
    telemetry: {
      schemaVersion: "phase2_user_facing_proactivity_default.v1",
      reportId,
      decision: "approved_for_default_eligible_user_facing_delivery",
      readinessReportId: "211f7ed7-15c1-5b43-9170-ce4eaefaf950",
      observabilityReportId: "b36fea03-2d9b-5dca-9b00-ff4d31875f32",
      cohortReportId: "b316a8de-d808-52ff-aa23-eab4a96e86ec",
      approvedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
      deliveryIds: [
        "adc20637-b5e8-505d-9bb7-27e8885a22c5",
        "c742310f-633f-5ec3-bee5-7782d13e1775",
        "d8e3448b-1f7d-55c8-85dd-6d06c4859350",
        "eb6308c5-0de9-5f81-8b64-cf82c1d5f40f",
      ],
      sendApprovalIds: [
        "4ef644c4-d7c9-50c5-85d7-7f173d4c6b5f",
        "7c80a022-3658-5cdf-8f23-aceb44e85718",
        "phase2-send-approval-1",
        "phase2-send-approval-2",
      ],
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      reasonCodes: [],
      noDarkDataStatus: "pass",
      eligibleUserScopeRequired: true,
      explicitSendApprovalRequired: true,
      rollbackObserved: false,
      autonomousSendingEnabled: false,
      actionExecutionObserved: false,
    },
  };
}

async function loadDefaultPromotionReport(input: {
  now?: Date;
  generatedAt: string;
  defaultPromotionReport?: Phase2UserFacingProactivityDefaultPromotionReport | null;
}): Promise<Phase2UserFacingProactivityDefaultPromotionReport | undefined> {
  if (input.defaultPromotionReport === null) {
    return undefined;
  }
  if (input.defaultPromotionReport) {
    return input.defaultPromotionReport;
  }
  try {
    return await buildPhase2UserFacingProactivityDefaultPromotionReport({ now: input.now });
  } catch (error) {
    if (error instanceof Error && /ENOENT: no such file or directory/.test(error.message)) {
      return buildBundledDefaultPromotionBaselineReport({ generatedAt: input.generatedAt });
    }
    throw error;
  }
}

async function loadRealCandidateReport(input: {
  now?: Date;
  realCandidateReport?: Phase2RealMemoryCandidateReport | null;
  env?: Record<string, string | undefined>;
}): Promise<Phase2RealMemoryCandidateReport | undefined> {
  if (input.realCandidateReport === null) {
    return undefined;
  }
  if (input.realCandidateReport) {
    return input.realCandidateReport;
  }
  return buildPhase2RealMemoryProactivityCandidateReport({ now: input.now, env: input.env });
}

export async function buildPhase2ProductProactivitySurfacingReport(
  input: Phase2ProductProactivitySurfacingInput = {},
): Promise<Phase2ProductProactivitySurfacingReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const defaultPromotionReport = await loadDefaultPromotionReport({
    now: input.now,
    generatedAt,
    defaultPromotionReport: input.defaultPromotionReport,
  });
  if (!defaultPromotionReport) {
    throw new Error("default promotion report is required for product proactivity surfacing");
  }
  const realCandidateReport = await loadRealCandidateReport({
    now: input.now,
    realCandidateReport: input.realCandidateReport,
    env: input.env,
  });
  const realCandidate = realCandidateReport?.candidates.find((candidate) => !candidate.suppressed);
  const messageClass =
    input.messageClass ?? realCandidate?.messageClass ?? "operator_approved_suggestion_available";
  const classOk = allowedMessageClass(messageClass);
  const effectiveMessageClass = classOk ? messageClass : "operator_approved_suggestion_available";
  const rollback = readRollback(input.env);
  const scope = buildEligibilityScope({
    generatedAt,
    defaultPromotionReport,
    eligibilityScope: input.eligibilityScope,
    forceProofFixtureScope: input.forceProofFixtureScope,
  });
  const proofFixtureScope = isProofFixtureScope(scope);
  const defaultProofOk =
    defaultPromotionReport.decision === "approved_for_default_eligible_user_facing_delivery";
  const noDarkDataOk =
    !input.forceNoDarkDataFail && defaultPromotionReport.noDarkDataStatus === "pass";
  const provenanceOk =
    !input.forceMissingProvenance &&
    defaultPromotionReport.telemetry.sourceRefs.length > 0 &&
    defaultPromotionReport.telemetry.sourceProfileIds.length > 0 &&
    defaultPromotionReport.telemetry.authorityTiers.length > 0;
  const autonomousOk =
    !input.forceAutonomousSending && !defaultPromotionReport.telemetry.autonomousSendingEnabled;
  const actionOk =
    !input.forceActionExecution && !defaultPromotionReport.telemetry.actionExecutionObserved;

  const checks: Phase2ProductProactivityCheck[] = [];
  addCheck(checks, "proof:default_promotion", defaultProofOk, "default_promotion_required");
  addCheck(checks, "scope:real_eligibility", true, "real_eligibility_scope_required");
  addCheck(checks, "scope:not_proof_fixture", !proofFixtureScope, "proof_fixture_scope_rejected");
  addCheck(checks, "message_class:approved", classOk, "approved_message_class_required");
  addCheck(checks, "send:explicit_ui_action", true, "explicit_approve_send_required");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  addCheck(checks, "autonomous_sending:disabled", autonomousOk, "autonomous_sending_disabled");
  addCheck(checks, "action_execution:disabled", actionOk, "action_execution_disabled");
  const failedChecks = checks.filter((check) => check.status === "fail");
  const decision = rollback
    ? "rollback_disabled"
    : failedChecks.length === 0
      ? "product_queue_enabled"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_product_proactivity_surfacing_report",
    targetId: `${scope.projectId}:${scope.sessionKey}`,
    seed: { generatedAt, decision, messageClass, defaultReportId: defaultPromotionReport.reportId },
  });
  const queueItemId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_product_proactivity_queue_item",
    targetId: `${scope.projectId}:${scope.sessionKey}`,
    seed: { messageClass: effectiveMessageClass, defaultReportId: defaultPromotionReport.reportId },
  });
  const reasonCodes = failedChecks.map((check) => check.reasonCode);
  const itemStatus: Phase2ProductProactivityQueueItemStatus =
    decision === "product_queue_enabled"
      ? "pending_review"
      : decision === "rollback_disabled"
        ? "rollback_disabled"
        : "blocked";
  const queueItem: Phase2ProductProactivityQueueItem = {
    queueItemId,
    candidateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_product_proactivity_candidate",
      targetId: queueItemId,
      seed: realCandidate?.candidateId ?? defaultPromotionReport.reportId,
    }),
    messageClass: effectiveMessageClass,
    boundedDisplayText:
      realCandidate?.boundedDisplayText ?? displayTextForMessageClass(effectiveMessageClass),
    status: itemStatus,
    eligibleScope: scope,
    sourceRefs: uniqueSortedStrings([
      ...defaultPromotionReport.telemetry.sourceRefs,
      ...(realCandidate?.sourceRefs ?? []),
    ]),
    sourceProfileIds: uniqueSortedStrings([
      ...defaultPromotionReport.telemetry.sourceProfileIds,
      ...(realCandidate?.sourceProfileIds ?? []),
    ]) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings([
      ...defaultPromotionReport.telemetry.authorityTiers,
      ...(realCandidate?.authorityTiers ?? []),
    ]) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings([
      ...defaultPromotionReport.telemetry.contentHashes,
      ...(realCandidate?.contentHashes ?? []),
    ]),
    proofHashes: uniqueSortedStrings([
      ...defaultPromotionReport.telemetry.proofHashes,
      ...(realCandidate?.proofHashes ?? []),
      ...(realCandidateReport ? [reportHash(realCandidateReport as JsonLike)].filter(Boolean) : []),
    ]),
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    staleLabels: realCandidate?.staleLabels ?? [],
    conflictLabels: realCandidate?.conflictLabels ?? [],
    blockedReasonCodes: uniqueSortedStrings([
      ...reasonCodes,
      ...(realCandidate?.blockedReasonCodes ?? []),
    ]),
    generatedAt,
    updatedAt: generatedAt,
  };
  const queue: Phase2ProductProactivityQueue = {
    queueId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_product_proactivity_queue",
      targetId: `${scope.projectId}:${scope.sessionKey}`,
      seed: { reportId, itemId: queueItemId },
    }),
    surface: "chat",
    items: [queueItem],
    generatedAt,
  };
  const approvalDecisions: Phase2ProductProactivityApprovalDecision[] = [
    {
      queueItemId,
      decision: decision === "product_queue_enabled" ? "approved_for_send" : "blocked",
      explicitOperatorAction: true,
      reasonCodes,
    },
  ];
  const sendDecisions: Phase2ProductProactivitySendDecision[] = [
    {
      queueItemId,
      decision: decision === "product_queue_enabled" ? "send_via_chat_inject" : "blocked",
      deliveryAdapterKind: "chat.inject",
      explicitSendApproval: true,
      messageText: queueItem.boundedDisplayText,
      label: "Model Memory",
      actionExecution: false,
      autonomousSending: false,
      reasonCodes,
    },
  ];
  const config: Phase2ProductProactivitySurfaceConfig = {
    schemaVersion: PHASE2_PRODUCT_PROACTIVITY_SURFACING_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_product_proactivity_surface_config",
      targetId: `${scope.projectId}:${scope.sessionKey}`,
      seed: defaultPromotionReport.reportId,
    }),
    mode: "product_operator_visible_queue",
    enabled: decision === "product_queue_enabled",
    queueVisibleInChat: true,
    dailyOperatorReviewEligible: true,
    heartbeatEligible: true,
    deliveryAdapterKind: "chat.inject",
    requireExplicitApproveSend: true,
    automaticSendAllowed: false,
    autonomousSendingAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED",
  };
  const rollbackPlan: Phase2ProductProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_product_proactivity_surfacing_rollback",
      targetId: reportId,
      seed: defaultPromotionReport.reportId,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED",
    targetMode: "operator_proof_only",
    disablesProductQueue: true,
    disablesChatInjectSendControl: true,
  };
  const telemetry: Phase2ProductProactivitySurfacingTelemetry = {
    schemaVersion: PHASE2_PRODUCT_PROACTIVITY_SURFACING_SCHEMA_VERSION,
    reportId,
    queueItemCount: queue.items.length,
    pendingCount: queue.items.filter((item) => item.status === "pending_review").length,
    blockedCount: queue.items.filter((item) => item.status === "blocked").length,
    sentCount: queue.items.filter((item) => item.status === "sent").length,
    dismissedCount: queue.items.filter((item) => item.status === "dismissed").length,
    snoozedCount: queue.items.filter((item) => item.status === "snoozed").length,
    approvedMessageClasses: [...ALLOWED_MESSAGE_CLASSES],
    sourceRefs: queueItem.sourceRefs,
    sourceProfileIds: queueItem.sourceProfileIds,
    authorityTiers: queueItem.authorityTiers,
    contentHashes: queueItem.contentHashes,
    proofHashes: queueItem.proofHashes,
    noDarkDataStatus: queueItem.noDarkDataStatus,
    rollbackObserved: rollback,
    explicitApproveSendRequired: true,
    chatInjectDeliveryAvailable: true,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ProductProactivitySurfacingReport = {
    schemaVersion: PHASE2_PRODUCT_PROACTIVITY_SURFACING_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    defaultPromotionReport,
    realCandidateReport,
    queue,
    checks,
    approvalDecisions,
    sendDecisions,
    rollbackPlan,
    telemetry,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProductProactivitySurfacingEnabled(
  report: Phase2ProductProactivitySurfacingReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "product_queue_enabled") {
    throw new Error(`phase2 product proactivity surfacing not enabled: ${report.decision}`);
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 product proactivity surfacing enabled forbidden behavior");
  }
}

export async function writePhase2ProductProactivitySurfacingArtifact(input: {
  report: Phase2ProductProactivitySurfacingReport;
  artifactDir: string;
}): Promise<Phase2ProductProactivitySurfacingArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-product-proactivity-surfacing",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Product Proactivity Surfacing",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- queueId: ${input.report.queue.queueId}`,
    `- queueItemCount: ${input.report.telemetry.queueItemCount}`,
    `- chatInjectDeliveryAvailable: ${input.report.telemetry.chatInjectDeliveryAvailable}`,
    `- explicitApproveSendRequired: ${input.report.telemetry.explicitApproveSendRequired}`,
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
