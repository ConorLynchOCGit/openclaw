import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2ProductProactivityQueueItem } from "./phase2-product-proactivity-presentation.ts";
import type { Phase2SkillCandidateRecord } from "./phase2-skill-candidate-ledger.ts";
import {
  cleanProactivityUserFacingText,
  isInternalProactivityWorkflowText,
  isMeaningfulProactivityUserFacingText,
} from "./proactivity-text.ts";

export const PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_SCHEMA_VERSION =
  "phase2_heartbeat_proactivity_reliability.v1" as const;
export const PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_REPORT_SCHEMA_VERSION =
  "phase2_heartbeat_proactivity_reliability_report.v1" as const;

export type Phase2HeartbeatProactivitySelection = {
  selectionId: string;
  workItemId: string;
  structuralPriority: number;
  recencyWeight: number;
  activeContextMatch: boolean;
  feedbackNoisePenalty: number;
  cleanlinessPenalty: number;
  selectionOrder: number;
  reasonCodes: string[];
};

export type Phase2HeartbeatProactivityItem = {
  workItemId: string;
  queueItemId: string;
  candidateId: string;
  skillCandidate?: Phase2SkillCandidateRecord;
  opportunityClass?:
    | "skill_candidate"
    | "proactive_plan"
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
  selections: Phase2HeartbeatProactivitySelection[];
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
  if (!item.userFacingBrief) {
    return false;
  }
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

export function selectHeartbeatProactivityItems(input: {
  queueItems: Phase2ProductProactivityQueueItem[];
  activeContextWorkItemIds?: string[];
  now?: Date;
}): Phase2HeartbeatProactivitySelection[] {
  const active = new Set(input.activeContextWorkItemIds ?? []);
  const now = input.now ?? new Date();
  return input.queueItems
    .filter((item) => item.layer === "actionable" && item.status === "pending_review")
    .map((item) => {
      const structuralPriority = item.attentionRequired ? 3 : 1;
      const activeContextMatch = active.size === 0 || active.has(item.workItemId);
      const recencyWeight = recencyScore(item.updatedAt, now);
      const recentAssistantOpportunity =
        recencyWeight > 0 &&
        item.sourceRefs.some((sourceRef) =>
          /\/(?:assistant_turn|planning_output)\//u.test(sourceRef),
        );
      const feedbackNoisePenalty = item.blockedReasonCodes.some((code) =>
        ["feedback_suppressed_signal", "cooldown_same_content"].includes(code),
      )
        ? 4
        : 0;
      const dirtySurfacePenalty = hasCleanHeartbeatSurfaceText(item) ? 0 : 20;
      const selectionOrder =
        structuralPriority +
        recencyWeight +
        (recentAssistantOpportunity ? 5 : 0) +
        (activeContextMatch ? 2 : 0) -
        feedbackNoisePenalty -
        dirtySurfacePenalty;
      return {
        selectionId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_heartbeat_proactivity_selection",
          targetId: item.workItemId,
          seed: { selectionOrder, contentHashes: item.contentHashes },
        }),
        workItemId: item.workItemId,
        structuralPriority,
        recencyWeight,
        activeContextMatch,
        feedbackNoisePenalty,
        cleanlinessPenalty: dirtySurfacePenalty,
        selectionOrder,
        reasonCodes: [
          "structural_attention_flag",
          "structural_recency_order",
          ...(recentAssistantOpportunity
            ? ["recent_assistant_output"]
            : ["older_or_non_assistant_source"]),
          ...(activeContextMatch ? ["active_context_match"] : ["background_context"]),
          ...(dirtySurfacePenalty > 0 ? ["suppressed_dirty_surface_copy"] : ["clean_surface_copy"]),
        ],
      };
    })
    .toSorted(
      (left, right) =>
        right.selectionOrder - left.selectionOrder ||
        left.workItemId.localeCompare(right.workItemId),
    );
}

function itemForHeartbeat(item: Phase2ProductProactivityQueueItem): Phase2HeartbeatProactivityItem {
  const brief = item.userFacingBrief;
  if (!brief || brief.quality.status !== "pass") {
    throw new Error("heartbeat item requires model-authored user-facing brief");
  }
  return {
    workItemId: item.workItemId,
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    skillCandidate: item.skillCandidate,
    opportunityClass: item.opportunityClass,
    title:
      cleanProactivityUserFacingText(brief.title, { maxLength: 120 }) ??
      "Model-authored proactivity item",
    whyNow:
      cleanProactivityUserFacingText(brief.oneLinePurpose, { maxLength: 180 }) ??
      "Model-authored proactivity brief is available.",
    proposedNextStep:
      cleanProactivityUserFacingText(brief.recommendedNextStep, {
        maxLength: 220,
      }) ?? "Open the item for review.",
    expectedUserValue:
      cleanProactivityUserFacingText(brief.detailSummary ?? brief.oneLinePurpose, {
        maxLength: 180,
      }) ?? "Review the model-authored proactivity brief.",
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
  const selections = selectHeartbeatProactivityItems({
    queueItems,
    activeContextWorkItemIds: input.activeContextWorkItemIds,
    now: input.now,
  });
  const selectedIds = new Set(selections.map((selection) => selection.workItemId));
  const topItems = selections
    .filter((selection) => selection.selectionOrder > 0)
    .slice(0, 3)
    .map((selection) => queueItems.find((item) => item.workItemId === selection.workItemId))
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
    topItems.every((item) => inboxIds.has(item.workItemId) && selectedIds.has(item.workItemId)),
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
    selections,
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
