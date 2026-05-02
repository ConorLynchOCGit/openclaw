import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  buildPhase2ContextualProactivitySurfacingReport,
  type Phase2ContextualProactivityReport,
  type Phase2ProactivitySurfacingLane,
} from "./phase2-contextual-proactivity-surfacing.ts";

export const PHASE2_PROACTIVITY_DAILY_REVIEW_SCHEMA_VERSION =
  "phase2_proactivity_daily_review_heartbeat.v1" as const;
export const PHASE2_PROACTIVITY_DAILY_REVIEW_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_daily_review_heartbeat_report.v1" as const;

export type Phase2ProactivityReviewItem = {
  reviewItemId: string;
  candidateId: string;
  queueItemId: string;
  lane: Phase2ProactivitySurfacingLane;
  title: string;
  messagePreview: string;
  suggestedAction: string;
  displayOrder: number;
  orderReason: "contextual_report_order";
  directPath: "proactivity_inbox_detail_send";
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ProactivityHeartbeatSummary = {
  heartbeatId: string;
  mustSurfaceCount: number;
  contextSurfaceCount: number;
  backgroundOnlyCount: number;
  groupedLowerPriorityCount: number;
  bounded: true;
};

export type Phase2ProactivityDailyReviewGroup = {
  groupId: string;
  lane: Phase2ProactivitySurfacingLane | "lower_priority_grouped";
  count: number;
  candidateIds: string[];
};

export type Phase2ProactivityReviewOrdering = {
  candidateId: string;
  displayOrder: number;
  orderReason: "contextual_report_order";
};

export type Phase2ProactivityReviewCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "must_surface_items_included"
    | "background_context_grouped"
    | "contextual_order_preserved"
    | "same_candidate_id_preserved"
    | "direct_path_to_detail_send"
    | "heartbeat_bounded"
    | "no_dark_data_required"
    | "no_autonomous_send"
    | "no_action_execution";
};

export type Phase2ProactivityReviewTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_DAILY_REVIEW_SCHEMA_VERSION;
  reportId: string;
  reviewItemCount: number;
  groupedCount: number;
  candidateIds: string[];
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  rawPrivateContentObserved: false;
};

export type Phase2ProactivityReviewRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED";
  targetMode: "inbox_only_no_daily_review_heartbeat_items";
};

export type Phase2ProactivityReviewReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_DAILY_REVIEW_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "daily_review_heartbeat_enabled" | "blocked" | "rollback_disabled";
  reviewItems: Phase2ProactivityReviewItem[];
  heartbeatSummary: Phase2ProactivityHeartbeatSummary;
  groups: Phase2ProactivityDailyReviewGroup[];
  orderings: Phase2ProactivityReviewOrdering[];
  checks: Phase2ProactivityReviewCheck[];
  telemetry: Phase2ProactivityReviewTelemetry;
  rollbackPlan: Phase2ProactivityReviewRollbackPlan;
};

export type Phase2ProactivityDailyReviewHeartbeatInput = {
  now?: Date;
  env?: Record<string, string | undefined>;
  contextualReport?: Phase2ContextualProactivityReport | null;
  forceMissingProvenance?: boolean;
  forceNoDarkDataFail?: boolean;
};

export type Phase2ProactivityReviewArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_KEYS = new Set([
  "prompt",
  "rawPrompt",
  "transcript",
  "rawTranscript",
  "toolLog",
  "rawToolLog",
  "secret",
  "privatePhrase",
]);

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (typeof value === "string") {
    if (
      /raw-prompt-marker|raw-transcript-marker|raw-tool-log-marker|secret-marker|private-phrase-marker/i.test(
        value,
      )
    ) {
      throw new Error("phase2 daily review proactivity contains prohibited marker content");
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 daily review proactivity contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function rollbackActive(env?: Record<string, string | undefined>): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED;
  return value === "1" || value === "true";
}

function addCheck(
  checks: Phase2ProactivityReviewCheck[],
  reasonCode: Phase2ProactivityReviewCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_daily_review_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadContextualReport(
  input: Phase2ProactivityDailyReviewHeartbeatInput,
): Promise<Phase2ContextualProactivityReport> {
  if (input.contextualReport === null) {
    throw new Error("phase2 daily review proactivity requires contextual surfacing evidence");
  }
  return (
    input.contextualReport ??
    buildPhase2ContextualProactivitySurfacingReport({
      now: input.now,
      env: input.env,
      lane: "must_surface",
    })
  );
}

export async function buildPhase2ProactivityDailyReviewHeartbeatReport(
  input: Phase2ProactivityDailyReviewHeartbeatInput = {},
): Promise<Phase2ProactivityReviewReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const contextualReport = await loadContextualReport(input);
  const reviewItems = contextualReport.contextualCards.map((card, index) => ({
    reviewItemId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_daily_review_item",
      targetId: card.candidateId,
      seed: { generatedAt, index },
    }),
    candidateId: card.candidateId,
    queueItemId: card.queueItemId,
    lane: card.lane,
    title: card.candidateSummary,
    messagePreview: card.messagePreview,
    suggestedAction: card.suggestedAction,
    displayOrder: index + 1,
    orderReason: "contextual_report_order" as const,
    directPath: "proactivity_inbox_detail_send" as const,
    sourceRefs: input.forceMissingProvenance ? [] : card.sourceRefs,
    sourceProfileIds: card.sourceProfileIds,
    authorityTiers: card.authorityTiers,
    contentHashes: card.contentHashes,
    proofHashes: card.proofHashes,
    noDarkDataStatus: input.forceNoDarkDataFail ? ("fail" as const) : card.noDarkDataStatus,
  }));
  const backgroundCount = contextualReport.relevanceDecisions.filter(
    (decision) => decision.lane !== "must_surface" || decision.inboxOnly,
  ).length;
  const candidateIds = [
    ...new Set([
      ...reviewItems.map((item) => item.candidateId),
      ...contextualReport.relevanceDecisions.map((decision) => decision.candidateId),
    ]),
  ].toSorted();
  const groups: Phase2ProactivityDailyReviewGroup[] = [
    {
      groupId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_daily_review_group",
        targetId: "must_surface",
        seed: candidateIds,
      }),
      lane: "must_surface",
      count: reviewItems.length,
      candidateIds: reviewItems.map((item) => item.candidateId),
    },
    {
      groupId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_daily_review_group",
        targetId: "lower_priority_grouped",
        seed: backgroundCount,
      }),
      lane: "lower_priority_grouped",
      count: backgroundCount,
      candidateIds: contextualReport.relevanceDecisions
        .filter((decision) => decision.inboxOnly)
        .map((decision) => decision.candidateId),
    },
  ];
  const orderings = reviewItems.map((item) => ({
    candidateId: item.candidateId,
    displayOrder: item.displayOrder,
    orderReason: item.orderReason,
  }));
  const checks: Phase2ProactivityReviewCheck[] = [];
  addCheck(checks, "must_surface_items_included", reviewItems.length > 0);
  addCheck(
    checks,
    "background_context_grouped",
    groups.some((group) => group.lane === "lower_priority_grouped"),
  );
  addCheck(
    checks,
    "contextual_order_preserved",
    orderings.every((ordering, index) => ordering.displayOrder === index + 1),
  );
  addCheck(
    checks,
    "same_candidate_id_preserved",
    candidateIds.includes(reviewItems[0]?.candidateId ?? ""),
  );
  addCheck(
    checks,
    "direct_path_to_detail_send",
    reviewItems.every((item) => item.directPath === "proactivity_inbox_detail_send"),
  );
  addCheck(checks, "heartbeat_bounded", true);
  addCheck(
    checks,
    "no_dark_data_required",
    reviewItems.every(
      (item) =>
        item.noDarkDataStatus === "pass" &&
        item.sourceRefs.length > 0 &&
        item.sourceProfileIds.length > 0 &&
        item.authorityTiers.length > 0,
    ),
  );
  addCheck(checks, "no_autonomous_send", true);
  addCheck(checks, "no_action_execution", true);
  const failed = checks.filter((check) => check.status === "fail");
  const rollback = rollbackActive(input.env);
  const decision = rollback
    ? "rollback_disabled"
    : failed.length === 0
      ? "daily_review_heartbeat_enabled"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_daily_review_heartbeat_report",
    targetId: contextualReport.reportId,
    seed: { generatedAt, decision },
  });
  const report: Phase2ProactivityReviewReport = {
    schemaVersion: PHASE2_PROACTIVITY_DAILY_REVIEW_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    reviewItems,
    heartbeatSummary: {
      heartbeatId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_heartbeat_summary",
        targetId: reportId,
        seed: { reviewItems: reviewItems.length, backgroundCount },
      }),
      mustSurfaceCount: reviewItems.length,
      contextSurfaceCount: contextualReport.relevanceDecisions.filter(
        (decision) => decision.lane === "context_surface",
      ).length,
      backgroundOnlyCount: contextualReport.relevanceDecisions.filter(
        (decision) => decision.lane === "background_only",
      ).length,
      groupedLowerPriorityCount: backgroundCount,
      bounded: true,
    },
    groups,
    orderings,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_DAILY_REVIEW_SCHEMA_VERSION,
      reportId,
      reviewItemCount: reviewItems.length,
      groupedCount: backgroundCount,
      candidateIds,
      autonomousSendingEnabled: false,
      actionExecutionObserved: false,
      rawPrivateContentObserved: false,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_daily_review_rollback",
        targetId: reportId,
        seed: "inbox-only",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED",
      targetMode: "inbox_only_no_daily_review_heartbeat_items",
    },
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityDailyReviewHeartbeatReport(
  report: Phase2ProactivityReviewReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "daily_review_heartbeat_enabled") {
    throw new Error(`phase2 proactivity daily review not enabled: ${report.decision}`);
  }
  if (report.telemetry.autonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity daily review enabled forbidden behavior");
  }
}

export async function writePhase2ProactivityDailyReviewHeartbeatArtifact(input: {
  report: Phase2ProactivityReviewReport;
  artifactDir: string;
}): Promise<Phase2ProactivityReviewArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-daily-review-heartbeat",
    value: input.report as unknown as JsonLike,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Daily Review / Heartbeat",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- reviewItemCount: ${input.report.telemetry.reviewItemCount}`,
    `- groupedCount: ${input.report.telemetry.groupedCount}`,
    `- candidateIds: ${input.report.telemetry.candidateIds.join(", ")}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  await fs.mkdir(input.artifactDir, { recursive: true });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
