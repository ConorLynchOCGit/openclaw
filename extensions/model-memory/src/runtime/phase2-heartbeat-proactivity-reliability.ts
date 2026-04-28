import fs from "node:fs/promises";
import path from "node:path";
import {
  cleanProactivityUserFacingText,
  isInternalProactivityWorkflowText,
  isMeaningfulProactivityUserFacingText,
} from "../../../../src/shared/chat-message-content.js";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2ProductProactivityQueueItem } from "./phase2-product-proactivity-surfacing.ts";
import type { Phase2SkillCandidateRecord } from "./phase2-skill-candidate-ledger.ts";

export const PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_SCHEMA_VERSION =
  "phase2_heartbeat_proactivity_reliability.v1" as const;
export const PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_REPORT_SCHEMA_VERSION =
  "phase2_heartbeat_proactivity_reliability_report.v1" as const;

export type Phase2HeartbeatProactivityRanking = {
  rankingId: string;
  workItemId: string;
  urgency: number;
  freshness: number;
  recurrence: number;
  expectedUserValue: number;
  activeContextMatch: boolean;
  feedbackNoisePenalty: number;
  cleanlinessPenalty: number;
  confidence: "high" | "medium" | "low";
  score: number;
  reasonCodes: string[];
};

export type Phase2HeartbeatProactivityItem = {
  workItemId: string;
  queueItemId: string;
  candidateId: string;
  skillCandidate?: Phase2SkillCandidateRecord;
  opportunityClass?:
    | "skill_candidate"
    | "reverse_prompt"
    | "followup"
    | "delight"
    | "self_healing"
    | "recovery";
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  confidence: "high" | "medium" | "low";
  primaryActionLabel: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
};

export type Phase2HeartbeatProactivitySurface = {
  surfaceId: string;
  heading: "What would help this user today?";
  primarySurface: "daily_operator_review_heartbeat";
  diagnosticsOnly: false;
  topItems: Phase2HeartbeatProactivityItem[];
};

export type Phase2HeartbeatProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "top_live_opportunity_required"
    | "heartbeat_not_diagnostics_only"
    | "direct_cta_required"
    | "shared_work_item_ids_required"
    | "bounded_payload_required"
    | "no_dark_data_required"
    | "action_execution_disabled"
    | "rollback_kill_switch_inactive";
};

export type Phase2HeartbeatProactivityTelemetry = {
  schemaVersion: typeof PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_SCHEMA_VERSION;
  reportId: string;
  inputItemCount: number;
  topItemCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  actionExecutionObserved: false;
};

export type Phase2HeartbeatProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_DISABLED";
  targetMode: "inbox_only_proactivity";
  disablesHeartbeatPrimarySurface: true;
};

export type Phase2HeartbeatProactivityReport = {
  schemaVersion: typeof PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "heartbeat_reliable" | "blocked" | "rollback_disabled";
  rankings: Phase2HeartbeatProactivityRanking[];
  surface: Phase2HeartbeatProactivitySurface;
  checks: Phase2HeartbeatProactivityCheck[];
  telemetry: Phase2HeartbeatProactivityTelemetry;
  rollbackPlan: Phase2HeartbeatProactivityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2HeartbeatProactivityInput = {
  now?: Date;
  queueItems?: Phase2ProductProactivityQueueItem[];
  inboxWorkItemIds?: string[];
  activeContextWorkItemIds?: string[];
  env?: Record<string, string | undefined>;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2HeartbeatProactivityArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function assertNoDarkData(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(
        `phase2 heartbeat proactivity reliability contains prohibited marker: ${marker}`,
      );
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2HeartbeatProactivityCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2HeartbeatProactivityCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function confidenceScore(confidence: "high" | "medium" | "low"): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function recencyScore(updatedAt: string, now: Date): number {
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return 0;
  }
  const ageMinutes = Math.max(0, (now.getTime() - updatedAtMs) / 60_000);
  if (ageMinutes <= 15) {
    return 4;
  }
  if (ageMinutes <= 60) {
    return 2;
  }
  return 0;
}

function hasCleanHeartbeatSurfaceText(item: Phase2ProductProactivityQueueItem): boolean {
  if (item.userFacingBrief) {
    return (
      item.userFacingBrief.quality.status === "pass" &&
      isMeaningfulProactivityUserFacingText(item.userFacingBrief.title) &&
      isMeaningfulProactivityUserFacingText(item.userFacingBrief.oneLinePurpose) &&
      isMeaningfulProactivityUserFacingText(item.userFacingBrief.recommendedNextStep) &&
      !isInternalProactivityWorkflowText(item.userFacingBrief.title) &&
      !isInternalProactivityWorkflowText(item.userFacingBrief.oneLinePurpose) &&
      !isInternalProactivityWorkflowText(item.userFacingBrief.recommendedNextStep)
    );
  }
  return (
    isMeaningfulProactivityUserFacingText(item.planTitle) &&
    isMeaningfulProactivityUserFacingText(item.problem) &&
    isMeaningfulProactivityUserFacingText(item.proposedMessage) &&
    !isInternalProactivityWorkflowText(item.planTitle) &&
    !isInternalProactivityWorkflowText(item.problem) &&
    !isInternalProactivityWorkflowText(item.proposedMessage)
  );
}

export function rankHeartbeatProactivityItems(input: {
  queueItems: Phase2ProductProactivityQueueItem[];
  activeContextWorkItemIds?: string[];
  now?: Date;
}): Phase2HeartbeatProactivityRanking[] {
  const active = new Set(input.activeContextWorkItemIds ?? []);
  const now = input.now ?? new Date();
  return input.queueItems
    .filter((item) => item.layer === "actionable" && item.status === "pending_review")
    .map((item) => {
      const urgency = item.attentionRequired ? 3 : 1;
      const freshness = item.staleLabels.length ? 1 : 3;
      const recurrence = item.blockedReasonCodes.includes("recurrence_limit_exceeded") ? 0 : 2;
      const expectedUserValue = item.expectedUserValue.length > 24 ? 3 : 1;
      const activeContextMatch = active.size === 0 || active.has(item.workItemId);
      const recentAssistantOpportunity =
        recencyScore(item.updatedAt, now) > 0 &&
        item.sourceRefs.some((sourceRef) =>
          /\/(?:assistant_turn|planning_output)\//u.test(sourceRef),
        );
      const opportunityClassBonus =
        item.opportunityClass === "skill_candidate"
          ? 2
          : item.opportunityClass === "self_healing"
            ? 4
            : item.opportunityClass === "delight"
              ? 3
              : item.opportunityClass === "reverse_prompt"
                ? 2
                : item.opportunityClass === "followup" || item.opportunityClass === "recovery"
                  ? 2
                  : 0;
      const feedbackNoisePenalty = item.blockedReasonCodes.some((code) =>
        ["feedback_suppressed_signal", "cooldown_same_content"].includes(code),
      )
        ? 4
        : 0;
      const dirtySurfacePenalty = hasCleanHeartbeatSurfaceText(item) ? 0 : 20;
      const score =
        urgency +
        freshness +
        recurrence +
        expectedUserValue +
        confidenceScore(item.confidence) +
        recencyScore(item.updatedAt, now) +
        (recentAssistantOpportunity ? 5 : 0) +
        opportunityClassBonus +
        (activeContextMatch ? 2 : 0) -
        feedbackNoisePenalty -
        dirtySurfacePenalty;
      return {
        rankingId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_heartbeat_proactivity_ranking",
          targetId: item.workItemId,
          seed: { score, contentHashes: item.contentHashes },
        }),
        workItemId: item.workItemId,
        urgency,
        freshness,
        recurrence,
        expectedUserValue,
        activeContextMatch,
        feedbackNoisePenalty,
        cleanlinessPenalty: dirtySurfacePenalty,
        confidence: item.confidence,
        score,
        reasonCodes: [
          "ranked_by_urgency",
          "ranked_by_freshness",
          "ranked_by_recurrence",
          "ranked_by_expected_value",
          ...(recentAssistantOpportunity
            ? ["recent_assistant_output"]
            : ["older_or_non_assistant_source"]),
          ...(opportunityClassBonus > 0
            ? [`opportunity_class:${item.opportunityClass ?? "standard"}`]
            : []),
          ...(activeContextMatch ? ["active_context_match"] : ["background_context"]),
          ...(dirtySurfacePenalty > 0 ? ["suppressed_dirty_surface_copy"] : ["clean_surface_copy"]),
        ],
      };
    })
    .toSorted(
      (left, right) => right.score - left.score || left.workItemId.localeCompare(right.workItemId),
    );
}

function itemForHeartbeat(item: Phase2ProductProactivityQueueItem): Phase2HeartbeatProactivityItem {
  const brief = item.userFacingBrief;
  return {
    workItemId: item.workItemId,
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    skillCandidate: item.skillCandidate,
    opportunityClass: item.opportunityClass,
    title:
      cleanProactivityUserFacingText(brief?.title ?? item.planTitle, { maxLength: 120 }) ??
      item.planTitle ??
      item.candidateSummary ??
      "Proactive work item",
    whyNow:
      cleanProactivityUserFacingText(brief?.oneLinePurpose ?? item.problem, { maxLength: 180 }) ??
      item.problem ??
      item.candidateSummary ??
      "A recent assistant answer identified useful work.",
    proposedNextStep:
      cleanProactivityUserFacingText(brief?.recommendedNextStep ?? item.proposedMessage, {
        maxLength: 220,
      }) ??
      item.proposedMessage ??
      item.messagePreview ??
      item.boundedDisplayText,
    expectedUserValue:
      cleanProactivityUserFacingText(item.expectedUserValue, { maxLength: 180 }) ??
      item.expectedUserValue ??
      item.userBenefit ??
      "Keeps recent proactive work reviewable without exposing raw memory data.",
    confidence: item.confidence,
    primaryActionLabel: item.primaryAction?.label ?? "Open in current chat",
    sourceRefs: item.sourceRefs,
    sourceProfileIds: item.sourceProfileIds,
    authorityTiers: item.authorityTiers,
    contentHashes: item.contentHashes,
    proofHashes: item.proofHashes,
  };
}

export async function buildPhase2HeartbeatProactivityReliabilityReport(
  input: Phase2HeartbeatProactivityInput = {},
): Promise<Phase2HeartbeatProactivityReport> {
  assertNoDarkData(input.queueItems ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const queueItems = input.queueItems ?? [];
  const rankings = rankHeartbeatProactivityItems({
    queueItems,
    activeContextWorkItemIds: input.activeContextWorkItemIds,
    now: input.now,
  });
  const rankedIds = new Set(rankings.map((ranking) => ranking.workItemId));
  const topItems = rankings
    .filter((ranking) => ranking.score > 0)
    .slice(0, 3)
    .map((ranking) => queueItems.find((item) => item.workItemId === ranking.workItemId))
    .filter((item): item is Phase2ProductProactivityQueueItem => Boolean(item))
    .filter((item) => hasCleanHeartbeatSurfaceText(item))
    .map(itemForHeartbeat);
  const inboxIds = new Set(input.inboxWorkItemIds ?? topItems.map((item) => item.workItemId));
  const checks: Phase2HeartbeatProactivityCheck[] = [];
  addCheck(checks, "top_items:present", topItems.length > 0, "top_live_opportunity_required");
  addCheck(checks, "surface:primary", true, "heartbeat_not_diagnostics_only");
  addCheck(
    checks,
    "cta:direct",
    topItems.every((item) => item.primaryActionLabel.length > 0),
    "direct_cta_required",
  );
  addCheck(
    checks,
    "ids:shared",
    topItems.every((item) => inboxIds.has(item.workItemId) && rankedIds.has(item.workItemId)),
    "shared_work_item_ids_required",
  );
  addCheck(
    checks,
    "payload:bounded",
    topItems.every((item) => item.title.length > 0 && item.proposedNextStep.length > 0),
    "bounded_payload_required",
  );
  addCheck(checks, "no_dark_data:pass", !input.forceNoDarkDataFail, "no_dark_data_required");
  addCheck(
    checks,
    "action_execution:disabled",
    !input.forceActionExecution,
    "action_execution_disabled",
  );
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  const failedChecks = checks.filter((check) => check.status === "fail");
  const decision = rollback
    ? "rollback_disabled"
    : failedChecks.length
      ? "blocked"
      : "heartbeat_reliable";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_heartbeat_proactivity_reliability_report",
    targetId: "heartbeat-proactivity",
    seed: { generatedAt, decision, topWorkItemIds: topItems.map((item) => item.workItemId) },
  });
  const surface: Phase2HeartbeatProactivitySurface = {
    surfaceId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_heartbeat_proactivity_surface",
      targetId: reportId,
      seed: topItems.map((item) => item.workItemId),
    }),
    heading: "What would help this user today?",
    primarySurface: "daily_operator_review_heartbeat",
    diagnosticsOnly: false,
    topItems: rollback ? [] : topItems,
  };
  const rollbackPlan: Phase2HeartbeatProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_heartbeat_proactivity_reliability_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_DISABLED",
    targetMode: "inbox_only_proactivity",
    disablesHeartbeatPrimarySurface: true,
  };
  const telemetry: Phase2HeartbeatProactivityTelemetry = {
    schemaVersion: PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_SCHEMA_VERSION,
    reportId,
    inputItemCount: queueItems.length,
    topItemCount: surface.topItems.length,
    sourceRefs: uniqueSortedStrings(topItems.flatMap((item) => item.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      topItems.flatMap((item) => item.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      topItems.flatMap((item) => item.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(topItems.flatMap((item) => item.contentHashes)),
    proofHashes: uniqueSortedStrings(topItems.flatMap((item) => item.proofHashes)),
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
    actionExecutionObserved: false,
  };
  const report: Phase2HeartbeatProactivityReport = {
    schemaVersion: PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    rankings,
    surface,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2HeartbeatProactivityReliable(
  report: Phase2HeartbeatProactivityReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "heartbeat_reliable") {
    throw new Error(`phase2 heartbeat proactivity not reliable: ${report.decision}`);
  }
  if (report.surface.diagnosticsOnly || report.surface.topItems.length < 1) {
    throw new Error("phase2 heartbeat proactivity missing primary top item");
  }
}

export async function writePhase2HeartbeatProactivityReliabilityArtifact(input: {
  report: Phase2HeartbeatProactivityReport;
  artifactDir: string;
}): Promise<Phase2HeartbeatProactivityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-heartbeat-proactivity-reliability",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Heartbeat Proactivity Reliability",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- topItemCount: ${input.report.telemetry.topItemCount}`,
    `- heading: ${input.report.surface.heading}`,
    `- diagnosticsOnly: ${input.report.surface.diagnosticsOnly}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
  ].join("\n");
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
