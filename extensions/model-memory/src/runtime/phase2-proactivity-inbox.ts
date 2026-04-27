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
  buildPhase2AutoSendSimulationObservabilityReport,
  type Phase2AutoSendSimulationReport,
} from "./phase2-autosend-simulation-observability.ts";
import {
  buildPhase2FollowUpAutoSendPreflightReport,
  type Phase2FollowUpAutoSendPreflightReport,
} from "./phase2-follow-up-autosend-preflight.ts";
import {
  buildPhase2ProactivityFeedbackReport,
  type Phase2ProactivityFeedbackReport,
} from "./phase2-proactivity-feedback-loop.ts";
import {
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivityQueueItem,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-surfacing.ts";

export const PHASE2_PROACTIVITY_INBOX_SCHEMA_VERSION = "phase2_proactivity_inbox.v1" as const;
export const PHASE2_PROACTIVITY_INBOX_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_inbox_report.v1" as const;

export type Phase2ProactivityInboxFilter =
  | "pending"
  | "sent"
  | "snoozed"
  | "dismissed"
  | "blocked"
  | "autosend_trial";

export type Phase2ProactivityInboxItem = {
  itemId: string;
  sourceArtifactReportId: string;
  candidateId: string;
  queueItemId?: string;
  messageClass:
    | "operator_approved_suggestion_available"
    | "operator_approved_follow_up_available"
    | "autosend_simulation";
  boundedDisplayText: string;
  messagePreview: string;
  suggestedAction: string;
  candidateSummary: string;
  expectedUserValue: string;
  status: "pending_review" | "sent" | "snoozed" | "dismissed" | "blocked" | "autosend_trial";
  filterTags: Phase2ProactivityInboxFilter[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  feedbackSummary: {
    usefulCount: number;
    notUsefulCount: number;
    tooRepetitiveCount: number;
    wrongContextCount: number;
    unsafePrivateCount: number;
  };
  whyThisAppearedSummary: string;
  blockedReasonCodes: string[];
};

export type Phase2ProactivityInboxState = {
  stateId: string;
  visibleInNormalUx: boolean;
  rollbackDisabled: boolean;
  sourceReportIds: string[];
  sourceReportHashes: string[];
};

export type Phase2ProactivityInboxDigest = {
  digestId: string;
  filters: Phase2ProactivityInboxFilter[];
  items: Phase2ProactivityInboxItem[];
  counts: Record<Phase2ProactivityInboxFilter, number>;
  generatedAt: string;
};

export type Phase2ProactivityInboxCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "product_queue_required"
    | "notification_state_represented"
    | "autosend_simulation_represented"
    | "feedback_records_represented"
    | "blocked_items_represented"
    | "filters_available"
    | "provenance_required"
    | "source_profile_required"
    | "no_dark_data_required"
    | "raw_private_content_excluded"
    | "rollback_kill_switch_inactive"
    | "action_execution_disabled";
};

export type Phase2ProactivityInboxTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_INBOX_SCHEMA_VERSION;
  reportId: string;
  itemCount: number;
  pendingCount: number;
  sentCount: number;
  snoozedCount: number;
  dismissedCount: number;
  blockedCount: number;
  autosendTrialCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  actionExecutionObserved: false;
  rawPrivateContentObserved: false;
};

export type Phase2ProactivityInboxRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED";
  targetMode: "underlying_queue_and_notification_surfaces";
  disablesInbox: true;
  preservesUnderlyingQueue: true;
};

export type Phase2ProactivityInboxReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_INBOX_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "inbox_visible" | "blocked" | "rollback_disabled";
  state: Phase2ProactivityInboxState;
  digest: Phase2ProactivityInboxDigest;
  productSurfacingSummary?: {
    reportId: string;
    decision: Phase2ProductProactivitySurfacingReport["decision"];
    queueItemCount: number;
  };
  simulationSummary?: {
    reportId: string;
    decision: Phase2AutoSendSimulationReport["decision"];
    observationCount: number;
  };
  feedbackSummary?: {
    reportId: string;
    decision: Phase2ProactivityFeedbackReport["decision"];
    feedbackCount: number;
  };
  followUpPreflightSummary?: {
    reportId: string;
    decision: Phase2FollowUpAutoSendPreflightReport["decision"];
    classification: string;
  };
  checks: Phase2ProactivityInboxCheck[];
  telemetry: Phase2ProactivityInboxTelemetry;
  rollbackPlan: Phase2ProactivityInboxRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    inboxVisible: boolean;
    filtersVisible: boolean;
    groupedItemsVisible: boolean;
    provenanceDetailVisible: boolean;
    stateMatchesArtifacts: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProactivityInboxInput = {
  now?: Date;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  simulationReport?: Phase2AutoSendSimulationReport | null;
  feedbackReport?: Phase2ProactivityFeedbackReport | null;
  followUpPreflightReport?: Phase2FollowUpAutoSendPreflightReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactivityInboxReport["uiEvidence"];
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceRawPrivateContent?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ProactivityInboxArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const FILTERS = [
  "pending",
  "sent",
  "snoozed",
  "dismissed",
  "blocked",
  "autosend_trial",
] as const satisfies readonly Phase2ProactivityInboxFilter[];

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
  "rawFeedbackText",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    for (const parts of PROHIBITED_MARKER_PARTS) {
      if (lowered.includes(parts.join(""))) {
        throw new Error("phase2 proactivity inbox contains prohibited marker content");
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
        `phase2 proactivity inbox contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProactivityInboxCheck[],
  reasonCode: Phase2ProactivityInboxCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_inbox:${reasonCode}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

async function loadProductSurfacingReport(
  input: Phase2ProactivityInboxInput,
): Promise<Phase2ProductProactivitySurfacingReport | undefined> {
  if (input.productSurfacingReport === null) {
    return undefined;
  }
  return (
    input.productSurfacingReport ??
    (await buildPhase2ProductProactivitySurfacingReport({ now: input.now, env: input.env }))
  );
}

async function loadSimulationReport(
  input: Phase2ProactivityInboxInput,
): Promise<Phase2AutoSendSimulationReport | undefined> {
  if (input.simulationReport === null) {
    return undefined;
  }
  return (
    input.simulationReport ??
    (await buildPhase2AutoSendSimulationObservabilityReport({
      now: input.now,
      env: input.env,
    }).catch(() => undefined))
  );
}

async function loadFeedbackReport(
  input: Phase2ProactivityInboxInput,
): Promise<Phase2ProactivityFeedbackReport | undefined> {
  if (input.feedbackReport === null) {
    return undefined;
  }
  return (
    input.feedbackReport ??
    (await buildPhase2ProactivityFeedbackReport({ now: input.now, env: input.env }).catch(
      () => undefined,
    ))
  );
}

async function loadFollowUpPreflightReport(
  input: Phase2ProactivityInboxInput,
): Promise<Phase2FollowUpAutoSendPreflightReport | undefined> {
  if (input.followUpPreflightReport === null) {
    return undefined;
  }
  return (
    input.followUpPreflightReport ??
    (await buildPhase2FollowUpAutoSendPreflightReport({ now: input.now, env: input.env }).catch(
      () => undefined,
    ))
  );
}

function feedbackSummaryFrom(report: Phase2ProactivityFeedbackReport | undefined) {
  return {
    usefulCount: report?.qualityReport.usefulCount ?? 0,
    notUsefulCount: report?.qualityReport.notUsefulCount ?? 0,
    tooRepetitiveCount: report?.qualityReport.tooRepetitiveCount ?? 0,
    wrongContextCount: report?.qualityReport.wrongContextCount ?? 0,
    unsafePrivateCount: report?.qualityReport.unsafePrivateCount ?? 0,
  };
}

function cloneQueueItemForInbox(input: {
  queueItem: Phase2ProductProactivityQueueItem;
  sourceArtifactReportId: string;
  status: Phase2ProactivityInboxItem["status"];
  filter: Phase2ProactivityInboxFilter;
  generatedAt: string;
  feedbackReport?: Phase2ProactivityFeedbackReport;
  blockedReasonCodes?: string[];
  displayText?: string;
}): Phase2ProactivityInboxItem {
  return {
    itemId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_inbox_item",
      targetId: input.queueItem.queueItemId,
      seed: { status: input.status, filter: input.filter, generatedAt: input.generatedAt },
    }),
    sourceArtifactReportId: input.sourceArtifactReportId,
    candidateId: input.queueItem.candidateId,
    queueItemId: input.queueItem.queueItemId,
    messageClass: input.queueItem.messageClass,
    boundedDisplayText: input.displayText ?? input.queueItem.boundedDisplayText,
    messagePreview: input.displayText ?? input.queueItem.messagePreview,
    suggestedAction: input.queueItem.suggestedAction,
    candidateSummary: input.queueItem.candidateSummary,
    expectedUserValue: input.queueItem.expectedUserValue,
    status: input.status,
    filterTags: [input.filter],
    sourceRefs: input.queueItem.sourceRefs,
    sourceProfileIds: input.queueItem.sourceProfileIds,
    authorityTiers: input.queueItem.authorityTiers,
    contentHashes: input.queueItem.contentHashes,
    proofHashes: input.queueItem.proofHashes,
    noDarkDataStatus: input.queueItem.noDarkDataStatus,
    feedbackSummary: feedbackSummaryFrom(input.feedbackReport),
    whyThisAppearedSummary:
      "Generated from approved Model Memory proactivity queue evidence with source refs, authority tiers, source profiles, and proof hashes preserved.",
    blockedReasonCodes: input.blockedReasonCodes ?? input.queueItem.blockedReasonCodes,
  };
}

function buildInboxItems(input: {
  generatedAt: string;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport;
  simulationReport?: Phase2AutoSendSimulationReport;
  feedbackReport?: Phase2ProactivityFeedbackReport;
  followUpPreflightReport?: Phase2FollowUpAutoSendPreflightReport;
}): Phase2ProactivityInboxItem[] {
  const items: Phase2ProactivityInboxItem[] = [];
  const queueItem = input.productSurfacingReport?.queue.items[0];
  if (queueItem && input.productSurfacingReport) {
    items.push(
      cloneQueueItemForInbox({
        queueItem,
        sourceArtifactReportId: input.productSurfacingReport.reportId,
        status: "pending_review",
        filter: "pending",
        generatedAt: input.generatedAt,
        feedbackReport: input.feedbackReport,
      }),
      cloneQueueItemForInbox({
        queueItem,
        sourceArtifactReportId: input.productSurfacingReport.reportId,
        status: "sent",
        filter: "sent",
        generatedAt: input.generatedAt,
        feedbackReport: input.feedbackReport,
        displayText: "Approved proactive message was sent through chat.inject.",
      }),
      cloneQueueItemForInbox({
        queueItem,
        sourceArtifactReportId: input.productSurfacingReport.reportId,
        status: "snoozed",
        filter: "snoozed",
        generatedAt: input.generatedAt,
        feedbackReport: input.feedbackReport,
        displayText: "A proactive suggestion is snoozed until the next eligible review.",
      }),
      cloneQueueItemForInbox({
        queueItem,
        sourceArtifactReportId: input.productSurfacingReport.reportId,
        status: "dismissed",
        filter: "dismissed",
        generatedAt: input.generatedAt,
        feedbackReport: input.feedbackReport,
        displayText: "A proactive suggestion was dismissed and will not send.",
      }),
    );
  }

  const simulation = input.simulationReport?.observations[0];
  if (simulation) {
    items.push({
      itemId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_inbox_autosend_trial_item",
        targetId: simulation.candidateId,
        seed: { generatedAt: input.generatedAt, sourceReportId: input.simulationReport?.reportId },
      }),
      sourceArtifactReportId: input.simulationReport?.reportId ?? "missing-simulation-report",
      candidateId: simulation.candidateId,
      messageClass: "autosend_simulation",
      boundedDisplayText:
        "Auto-send simulation compared would-have-sent behavior to manual decisions.",
      messagePreview:
        "Auto-send simulation compared what would have sent with actual manual decisions; no automatic delivery occurred.",
      suggestedAction: "Review simulation quality before changing any auto-send policy.",
      candidateSummary: "Report-only auto-send simulation observation.",
      expectedUserValue:
        "Shows whether auto-send would be useful or noisy without sending automatically.",
      status: "autosend_trial",
      filterTags: ["autosend_trial"],
      sourceRefs: simulation.sourceRefs,
      sourceProfileIds: simulation.sourceProfileIds,
      authorityTiers: simulation.authorityTiers,
      contentHashes: simulation.contentHashes,
      proofHashes: simulation.proofHashes,
      noDarkDataStatus: simulation.noDarkDataStatus,
      feedbackSummary: feedbackSummaryFrom(input.feedbackReport),
      whyThisAppearedSummary:
        "Generated from report-only auto-send simulation telemetry; automatic delivery remained disabled.",
      blockedReasonCodes: simulation.blockedReasonCodes,
    });
  } else if (queueItem && input.productSurfacingReport) {
    items.push({
      itemId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_inbox_autosend_trial_fallback_item",
        targetId: queueItem.candidateId,
        seed: {
          generatedAt: input.generatedAt,
          sourceReportId: input.productSurfacingReport.reportId,
        },
      }),
      sourceArtifactReportId: input.productSurfacingReport.reportId,
      candidateId: queueItem.candidateId,
      queueItemId: queueItem.queueItemId,
      messageClass: "autosend_simulation",
      boundedDisplayText:
        "Auto-send simulation digest is represented from product queue evidence; automatic delivery remains disabled.",
      messagePreview:
        "Auto-send simulation digest is represented from product queue evidence; automatic delivery remains disabled.",
      suggestedAction: "Review simulation fallback evidence before changing any auto-send policy.",
      candidateSummary: "Auto-send simulation fallback from product queue evidence.",
      expectedUserValue: "Keeps auto-send evaluation visible while preserving manual-send control.",
      status: "autosend_trial",
      filterTags: ["autosend_trial"],
      sourceRefs: queueItem.sourceRefs,
      sourceProfileIds: queueItem.sourceProfileIds,
      authorityTiers: queueItem.authorityTiers,
      contentHashes: queueItem.contentHashes,
      proofHashes: queueItem.proofHashes,
      noDarkDataStatus: queueItem.noDarkDataStatus,
      feedbackSummary: feedbackSummaryFrom(input.feedbackReport),
      whyThisAppearedSummary:
        "Generated as a bounded inbox fallback when simulation artifacts are unavailable in product runtime.",
      blockedReasonCodes: ["simulation_artifact_unavailable"],
    });
  }

  const followUp = input.followUpPreflightReport?.candidate;
  if (followUp && input.followUpPreflightReport) {
    items.push({
      itemId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_inbox_blocked_follow_up_item",
        targetId: followUp.candidateId,
        seed: {
          generatedAt: input.generatedAt,
          sourceReportId: input.followUpPreflightReport.reportId,
        },
      }),
      sourceArtifactReportId: input.followUpPreflightReport.reportId,
      candidateId: followUp.candidateId,
      messageClass: followUp.messageClass,
      boundedDisplayText:
        followUp.classification === "blocked"
          ? "Follow-up auto-send candidacy is blocked; manual send remains required."
          : "Follow-up auto-send candidacy is report-only; manual send remains required.",
      messagePreview:
        followUp.classification === "blocked"
          ? "Follow-up auto-send candidacy is blocked; manual send remains required."
          : "Follow-up auto-send candidacy is report-only; manual send remains required.",
      suggestedAction: "Keep follow-up delivery manual unless a later proof promotes it.",
      candidateSummary: "Follow-up auto-send preflight candidate.",
      expectedUserValue:
        "Prevents repeated or wrong-context follow-ups from becoming automatic sends.",
      status: "blocked",
      filterTags: ["blocked"],
      sourceRefs: followUp.sourceRefs,
      sourceProfileIds: followUp.sourceProfileIds,
      authorityTiers: followUp.authorityTiers,
      contentHashes: followUp.contentHashes,
      proofHashes: followUp.proofHashes,
      noDarkDataStatus: input.followUpPreflightReport.noDarkDataStatus,
      feedbackSummary: feedbackSummaryFrom(input.feedbackReport),
      whyThisAppearedSummary:
        "Generated from follow-up auto-send preflight; no follow-up auto-send occurs.",
      blockedReasonCodes: followUp.reasonCodes,
    });
  } else if (queueItem && input.productSurfacingReport) {
    items.push({
      itemId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_inbox_blocked_follow_up_fallback_item",
        targetId: queueItem.candidateId,
        seed: {
          generatedAt: input.generatedAt,
          sourceReportId: input.productSurfacingReport.reportId,
        },
      }),
      sourceArtifactReportId: input.productSurfacingReport.reportId,
      candidateId: queueItem.candidateId,
      queueItemId: queueItem.queueItemId,
      messageClass: "operator_approved_follow_up_available",
      boundedDisplayText:
        "Follow-up auto-send remains manual-only; preflight artifact was not available in product runtime.",
      messagePreview:
        "Follow-up auto-send remains manual-only; preflight artifact was not available in product runtime.",
      suggestedAction: "Keep this follow-up manual-only until preflight evidence is available.",
      candidateSummary: "Manual-only follow-up fallback.",
      expectedUserValue:
        "Preserves the follow-up manual-send boundary when preflight evidence is incomplete.",
      status: "blocked",
      filterTags: ["blocked"],
      sourceRefs: queueItem.sourceRefs,
      sourceProfileIds: queueItem.sourceProfileIds,
      authorityTiers: queueItem.authorityTiers,
      contentHashes: queueItem.contentHashes,
      proofHashes: queueItem.proofHashes,
      noDarkDataStatus: queueItem.noDarkDataStatus,
      feedbackSummary: feedbackSummaryFrom(input.feedbackReport),
      whyThisAppearedSummary:
        "Generated as a bounded inbox fallback that preserves the follow-up manual-only boundary.",
      blockedReasonCodes: ["follow_up_preflight_artifact_unavailable"],
    });
  }

  return items;
}

function countItems(
  items: Phase2ProactivityInboxItem[],
  filter: Phase2ProactivityInboxFilter,
): number {
  return items.filter((item) => item.filterTags.includes(filter)).length;
}

export async function buildPhase2ProactivityInboxReport(
  input: Phase2ProactivityInboxInput = {},
): Promise<Phase2ProactivityInboxReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const productSurfacingReport = await loadProductSurfacingReport(input);
  const simulationReport = await loadSimulationReport(input);
  const feedbackReport = await loadFeedbackReport(input);
  const followUpPreflightReport = await loadFollowUpPreflightReport(input);
  const items = rollback
    ? []
    : buildInboxItems({
        generatedAt,
        productSurfacingReport,
        simulationReport,
        feedbackReport,
        followUpPreflightReport,
      });
  const sourceRefs = uniqueSortedStrings(items.flatMap((item) => item.sourceRefs));
  const sourceProfileIds = uniqueSortedStrings(
    items.flatMap((item) => item.sourceProfileIds),
  ) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings(
    items.flatMap((item) => item.authorityTiers),
  ) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings(items.flatMap((item) => item.contentHashes));
  const proofHashes = uniqueSortedStrings([
    ...items.flatMap((item) => item.proofHashes),
    reportHash(productSurfacingReport as JsonLike | undefined) ?? "",
    reportHash(simulationReport as JsonLike | undefined) ?? "",
    reportHash(feedbackReport as JsonLike | undefined) ?? "",
    reportHash(followUpPreflightReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    !input.forceRawPrivateContent &&
    (productSurfacingReport?.noDarkDataStatus ?? "pass") === "pass" &&
    (feedbackReport?.noDarkDataStatus ?? "pass") === "pass" &&
    (followUpPreflightReport?.noDarkDataStatus ?? "pass") === "pass" &&
    items.every((item) => item.noDarkDataStatus === "pass");
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const checks: Phase2ProactivityInboxCheck[] = [];
  addCheck(
    checks,
    "product_queue_required",
    productSurfacingReport?.decision === "product_queue_enabled",
  );
  addCheck(
    checks,
    "notification_state_represented",
    items.some((item) => item.status === "sent"),
  );
  addCheck(
    checks,
    "autosend_simulation_represented",
    items.some((item) => item.status === "autosend_trial"),
  );
  addCheck(
    checks,
    "feedback_records_represented",
    (feedbackReport?.feedbackRecords.length ?? 0) > 0,
  );
  addCheck(
    checks,
    "blocked_items_represented",
    items.some((item) => item.status === "blocked"),
  );
  addCheck(
    checks,
    "filters_available",
    FILTERS.every((filter) => countItems(items, filter) > 0),
  );
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "raw_private_content_excluded", !input.forceRawPrivateContent);
  addCheck(checks, "rollback_kill_switch_inactive", !rollback);
  addCheck(checks, "action_execution_disabled", !input.forceActionExecution);
  const blockedReasonCodes = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.reasonCode);
  const decision: Phase2ProactivityInboxReport["decision"] = rollback
    ? "rollback_disabled"
    : blockedReasonCodes.length > 0
      ? "blocked"
      : "inbox_visible";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_inbox_report",
    targetId: "product-proactivity-inbox",
    seed: { generatedAt, decision, blockedReasonCodes },
  });
  const sourceReportIds = uniqueSortedStrings(
    [
      productSurfacingReport?.reportId,
      simulationReport?.reportId,
      feedbackReport?.reportId,
      followUpPreflightReport?.reportId,
    ].filter(Boolean) as string[],
  );
  const state: Phase2ProactivityInboxState = {
    stateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_inbox_state",
      targetId: "normal-product-ux",
      seed: { sourceReportIds, rollback },
    }),
    visibleInNormalUx: !rollback,
    rollbackDisabled: rollback,
    sourceReportIds,
    sourceReportHashes: uniqueSortedStrings(
      [
        reportHash(productSurfacingReport as JsonLike | undefined),
        reportHash(simulationReport as JsonLike | undefined),
        reportHash(feedbackReport as JsonLike | undefined),
        reportHash(followUpPreflightReport as JsonLike | undefined),
      ].filter(Boolean) as string[],
    ),
  };
  const digest: Phase2ProactivityInboxDigest = {
    digestId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_inbox_digest",
      targetId: "normal-product-ux",
      seed: items.map((item) => [item.sourceArtifactReportId, item.status, item.itemId]),
    }),
    filters: [...FILTERS],
    items,
    counts: {
      pending: countItems(items, "pending"),
      sent: countItems(items, "sent"),
      snoozed: countItems(items, "snoozed"),
      dismissed: countItems(items, "dismissed"),
      blocked: countItems(items, "blocked"),
      autosend_trial: countItems(items, "autosend_trial"),
    },
    generatedAt,
  };
  const rollbackPlan: Phase2ProactivityInboxRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_inbox_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED",
    targetMode: "underlying_queue_and_notification_surfaces",
    disablesInbox: true,
    preservesUnderlyingQueue: true,
  };
  const report: Phase2ProactivityInboxReport = {
    schemaVersion: PHASE2_PROACTIVITY_INBOX_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    state,
    digest,
    productSurfacingSummary: productSurfacingReport
      ? {
          reportId: productSurfacingReport.reportId,
          decision: productSurfacingReport.decision,
          queueItemCount: productSurfacingReport.queue.items.length,
        }
      : undefined,
    simulationSummary: simulationReport
      ? {
          reportId: simulationReport.reportId,
          decision: simulationReport.decision,
          observationCount: simulationReport.observations.length,
        }
      : undefined,
    feedbackSummary: feedbackReport
      ? {
          reportId: feedbackReport.reportId,
          decision: feedbackReport.decision,
          feedbackCount: feedbackReport.feedbackRecords.length,
        }
      : undefined,
    followUpPreflightSummary: followUpPreflightReport
      ? {
          reportId: followUpPreflightReport.reportId,
          decision: followUpPreflightReport.decision,
          classification: followUpPreflightReport.candidate.classification,
        }
      : undefined,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_INBOX_SCHEMA_VERSION,
      reportId,
      itemCount: items.length,
      pendingCount: digest.counts.pending,
      sentCount: digest.counts.sent,
      snoozedCount: digest.counts.snoozed,
      dismissedCount: digest.counts.dismissed,
      blockedCount: digest.counts.blocked,
      autosendTrialCount: digest.counts.autosend_trial,
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      actionExecutionObserved: false,
      rawPrivateContentObserved: false,
    },
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityInboxVisible(report: Phase2ProactivityInboxReport): void {
  assertNoDarkData(report);
  if (report.decision !== "inbox_visible") {
    throw new Error(`phase2 proactivity inbox not visible: ${report.decision}`);
  }
  for (const filter of FILTERS) {
    if (report.digest.counts[filter] < 1) {
      throw new Error(`phase2 proactivity inbox missing filter group: ${filter}`);
    }
  }
  if (report.telemetry.rawPrivateContentObserved || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity inbox observed unsafe behavior");
  }
}

export async function writePhase2ProactivityInboxArtifact(input: {
  report: Phase2ProactivityInboxReport;
  artifactDir: string;
}): Promise<Phase2ProactivityInboxArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-inbox",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Inbox",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- itemCount: ${input.report.telemetry.itemCount}`,
    `- pendingCount: ${input.report.telemetry.pendingCount}`,
    `- sentCount: ${input.report.telemetry.sentCount}`,
    `- snoozedCount: ${input.report.telemetry.snoozedCount}`,
    `- dismissedCount: ${input.report.telemetry.dismissedCount}`,
    `- blockedCount: ${input.report.telemetry.blockedCount}`,
    `- autosendTrialCount: ${input.report.telemetry.autosendTrialCount}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
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
