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
  buildPhase2ProactivityDailyReviewHeartbeatReport,
  type Phase2ProactivityReviewReport,
} from "./phase2-proactivity-daily-review-heartbeat.ts";
import {
  buildPhase2ProactivityFeedbackReport,
  type Phase2ProactivityFeedbackControl,
  type Phase2ProactivityFeedbackReport,
} from "./phase2-proactivity-feedback-loop.ts";

export const PHASE2_PROACTIVITY_USEFULNESS_SCHEMA_VERSION =
  "phase2_proactivity_usefulness_tuning.v1" as const;
export const PHASE2_PROACTIVITY_USEFULNESS_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_usefulness_tuning_report.v1" as const;

export type Phase2ProactivityUxEventType =
  | "viewed"
  | "opened_detail"
  | "approved"
  | "sent"
  | "dismissed"
  | "snoozed"
  | "ignored"
  | "marked_useful"
  | "marked_not_useful";

export type Phase2ProactivityUxEvent = {
  eventId: string;
  eventType: Phase2ProactivityUxEventType;
  candidateId: string;
  queueItemId: string;
  messageClass: "operator_approved_suggestion_available" | "operator_approved_follow_up_available";
  surfacingLane: "must_surface" | "context_surface" | "background_only";
  signalType: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  timestamp: string;
  rawTextStored: false;
};

export type Phase2ProactivityUsefulnessSignal = {
  signalId: string;
  candidateId: string;
  queueItemId: string;
  signalType:
    | "positive_engagement"
    | "negative_engagement"
    | "repeat_noise"
    | "context_noise"
    | "unsafe_private";
  eventTypes: Phase2ProactivityUxEventType[];
  feedbackReasons: Phase2ProactivityFeedbackControl[];
  reasonCodes: string[];
};

export type Phase2ProactivityQualityScore = {
  scoreId: string;
  signalType: string;
  candidateSource: string;
  messageClass: Phase2ProactivityUxEvent["messageClass"];
  surfacingLane: Phase2ProactivityUxEvent["surfacingLane"];
  projectSessionScope: string;
  viewedCount: number;
  openedDetailCount: number;
  approvedCount: number;
  sentCount: number;
  dismissedCount: number;
  snoozedCount: number;
  ignoredCount: number;
  usefulCount: number;
  notUsefulCount: number;
  quality: "promote" | "neutral" | "downrank" | "suppress" | "block";
  reasonCodes: string[];
};

export type Phase2ProactivitySourceQualityReport = {
  sourceQualityReportId: string;
  groupedBySignalType: Record<string, number>;
  groupedByCandidateSource: Record<string, number>;
  groupedByMessageClass: Record<string, number>;
  groupedBySurfacingLane: Record<string, number>;
  qualityScores: Phase2ProactivityQualityScore[];
};

export type Phase2ProactivitySuppressionRule = {
  ruleId: string;
  candidateId: string;
  sourceRef: string;
  action: "neutral" | "downrank_source" | "suppress_candidate" | "block_future_surfacing";
  reasonCodes: string[];
  semanticTruthWrite: false;
  memoryCorrectionWrite: false;
};

export type Phase2ProactivityWhyNotShownDiagnostic = {
  diagnosticId: string;
  candidateId: string;
  shown: boolean;
  reasonCodes: string[];
  displayLocation: "operator_debug_proactivity_detail";
};

export type Phase2ProactivityUsefulnessDecision =
  | "usefulness_tuning_enabled"
  | "tuning_degraded_by_noise"
  | "blocked"
  | "rollback_disabled";

export type Phase2ProactivityUsefulnessCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "ux_events_bounded_metadata"
    | "feedback_control_plane_only"
    | "quality_grouping_available"
    | "noisy_sources_downranked"
    | "repeat_suppression_available"
    | "why_not_shown_diagnostics_available"
    | "rollback_kill_switch_inactive"
    | "no_semantic_truth_write"
    | "no_memory_correction_write"
    | "no_dark_data_required"
    | "no_autonomous_send"
    | "no_action_execution";
};

export type Phase2ProactivityUsefulnessTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_USEFULNESS_SCHEMA_VERSION;
  reportId: string;
  uxEventCount: number;
  signalCount: number;
  qualityScoreCount: number;
  suppressionRuleCount: number;
  whyNotShownCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  semanticTruthWriteObserved: false;
  memoryCorrectionWriteObserved: false;
  rawPrivateContentObserved: false;
};

export type Phase2ProactivityUsefulnessRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED";
  targetMode: "neutral_ranking_no_tuning_effects";
  disablesTuningEffects: true;
  preservesQueueAndInbox: true;
};

export type Phase2ProactivityUsefulnessReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_USEFULNESS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityUsefulnessDecision;
  dailyReviewSummary?: {
    reportId: string;
    decision: Phase2ProactivityReviewReport["decision"];
    reviewItemCount: number;
  };
  feedbackSummary?: {
    reportId: string;
    decision: Phase2ProactivityFeedbackReport["decision"];
    feedbackCount: number;
  };
  uxEvents: Phase2ProactivityUxEvent[];
  usefulnessSignals: Phase2ProactivityUsefulnessSignal[];
  sourceQualityReport: Phase2ProactivitySourceQualityReport;
  suppressionRules: Phase2ProactivitySuppressionRule[];
  whyNotShownDiagnostics: Phase2ProactivityWhyNotShownDiagnostic[];
  checks: Phase2ProactivityUsefulnessCheck[];
  telemetry: Phase2ProactivityUsefulnessTelemetry;
  rollbackPlan: Phase2ProactivityUsefulnessRollbackPlan;
  uiEvidence?: {
    usefulnessControlsVisible: boolean;
    qualityReportVisible: boolean;
    whyNotShownDiagnosticVisible: boolean;
    rollbackDisablesTuning: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProactivityUsefulnessInput = {
  now?: Date;
  env?: Record<string, string | undefined>;
  dailyReviewReport?: Phase2ProactivityReviewReport | null;
  feedbackReport?: Phase2ProactivityFeedbackReport | null;
  uxEvents?: Phase2ProactivityUxEvent[];
  uiEvidence?: Phase2ProactivityUsefulnessReport["uiEvidence"];
  forceNoDarkDataFail?: boolean;
  forceRawPrivateContent?: boolean;
  forceSemanticTruthWrite?: boolean;
  forceMemoryCorrectionWrite?: boolean;
  forceAutonomousSend?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ProactivityUsefulnessArtifact = {
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
  "rawFeedbackText",
]);

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (PROHIBITED_MARKERS.some((marker) => lowered.includes(marker))) {
      throw new Error("phase2 proactivity usefulness tuning contains prohibited marker content");
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
        `phase2 proactivity usefulness tuning contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function rollbackActive(env?: Record<string, string | undefined>): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProactivityUsefulnessCheck[],
  reasonCode: Phase2ProactivityUsefulnessCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_usefulness_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadDailyReviewReport(
  input: Phase2ProactivityUsefulnessInput,
): Promise<Phase2ProactivityReviewReport | undefined> {
  if (input.dailyReviewReport === null) {
    return undefined;
  }
  return (
    input.dailyReviewReport ??
    (await buildPhase2ProactivityDailyReviewHeartbeatReport({ now: input.now, env: input.env }))
  );
}

async function loadFeedbackReport(
  input: Phase2ProactivityUsefulnessInput,
): Promise<Phase2ProactivityFeedbackReport | undefined> {
  if (input.feedbackReport === null) {
    return undefined;
  }
  return (
    input.feedbackReport ??
    (await buildPhase2ProactivityFeedbackReport({
      now: input.now,
      env: input.env,
      controls: ["useful", "not_useful", "too_repetitive", "wrong_context"],
    }))
  );
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function eventId(seed: Record<string, unknown>): string {
  const targetId = typeof seed.candidateId === "string" ? seed.candidateId : "candidate";
  return buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_ux_event",
    targetId,
    seed,
  });
}

function buildDefaultEvents(input: {
  generatedAt: string;
  dailyReviewReport?: Phase2ProactivityReviewReport;
  feedbackReport?: Phase2ProactivityFeedbackReport;
}): Phase2ProactivityUxEvent[] {
  const item = input.dailyReviewReport?.reviewItems[0];
  const feedbackRecord = input.feedbackReport?.feedbackRecords[0];
  const candidateId = item?.candidateId ?? feedbackRecord?.candidateId ?? "candidate-missing";
  const queueItemId = item?.queueItemId ?? feedbackRecord?.queueItemId ?? "queue-missing";
  const sourceRefs = uniqueSortedStrings([
    ...(item?.sourceRefs ?? []),
    ...(feedbackRecord?.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(item?.sourceProfileIds ?? []),
    ...(feedbackRecord?.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(item?.authorityTiers ?? []),
    ...(feedbackRecord?.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(item?.contentHashes ?? []),
    ...(feedbackRecord?.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...(item?.proofHashes ?? []),
    ...(feedbackRecord?.proofHashes ?? []),
    reportHash(input.dailyReviewReport as unknown as JsonLike | undefined) ?? "",
    reportHash(input.feedbackReport as unknown as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const base = {
    candidateId,
    queueItemId,
    messageClass:
      feedbackRecord?.messageClass ?? ("operator_approved_suggestion_available" as const),
    surfacingLane: item?.lane ?? ("must_surface" as const),
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    timestamp: input.generatedAt,
    rawTextStored: false as const,
  };
  const types: Array<{
    eventType: Phase2ProactivityUxEventType;
    signalType: string;
  }> = [
    { eventType: "viewed", signalType: "view" },
    { eventType: "opened_detail", signalType: "detail" },
    { eventType: "approved", signalType: "manual_positive" },
    { eventType: "sent", signalType: "manual_positive" },
    { eventType: "marked_useful", signalType: "feedback_positive" },
    { eventType: "dismissed", signalType: "feedback_negative" },
    { eventType: "snoozed", signalType: "repeat_noise" },
    { eventType: "ignored", signalType: "attention_noise" },
    { eventType: "marked_not_useful", signalType: "feedback_negative" },
  ];
  return types.map(({ eventType, signalType }) => ({
    ...base,
    eventId: eventId({ candidateId, queueItemId, eventType, signalType, at: input.generatedAt }),
    eventType,
    signalType,
  }));
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

function feedbackReasonsForCandidate(
  feedbackReport: Phase2ProactivityFeedbackReport | undefined,
  candidateId: string,
): Phase2ProactivityFeedbackControl[] {
  return (
    feedbackReport?.feedbackRecords
      .filter((record) => record.candidateId === candidateId)
      .map((record) => record.selectedFeedbackReason) ?? []
  );
}

function buildUsefulnessSignal(
  events: Phase2ProactivityUxEvent[],
  feedbackReport: Phase2ProactivityFeedbackReport | undefined,
): Phase2ProactivityUsefulnessSignal[] {
  const byCandidate = new Map<string, Phase2ProactivityUxEvent[]>();
  for (const event of events) {
    byCandidate.set(event.candidateId, [...(byCandidate.get(event.candidateId) ?? []), event]);
  }
  return [...byCandidate.entries()].map(([candidateId, candidateEvents]) => {
    const reasons = feedbackReasonsForCandidate(feedbackReport, candidateId);
    const eventTypes = uniqueSortedStrings(
      candidateEvents.map((event) => event.eventType),
    ) as Phase2ProactivityUxEventType[];
    const negativeCount = candidateEvents.filter((event) =>
      ["dismissed", "ignored", "marked_not_useful"].includes(event.eventType),
    ).length;
    const repeatCount = candidateEvents.filter((event) => event.eventType === "snoozed").length;
    const unsafe = reasons.includes("unsafe_private");
    const wrongContext = reasons.includes("wrong_context");
    const signalType: Phase2ProactivityUsefulnessSignal["signalType"] = unsafe
      ? "unsafe_private"
      : repeatCount > 0 || reasons.includes("too_repetitive")
        ? "repeat_noise"
        : wrongContext
          ? "context_noise"
          : negativeCount > 0
            ? "negative_engagement"
            : "positive_engagement";
    const reasonCodes = [
      ...(eventTypes.includes("approved") || eventTypes.includes("sent")
        ? ["manual_positive_signal"]
        : []),
      ...(eventTypes.includes("dismissed") || eventTypes.includes("ignored")
        ? ["negative_engagement_signal"]
        : []),
      ...(repeatCount > 0 || reasons.includes("too_repetitive")
        ? ["deterministic_repeat_suppression_signal"]
        : []),
      ...(wrongContext ? ["wrong_context_downrank_signal"] : []),
      ...(unsafe ? ["unsafe_private_block_signal"] : []),
    ];
    return {
      signalId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_usefulness_signal",
        targetId: candidateId,
        seed: { eventTypes, reasons },
      }),
      candidateId,
      queueItemId: candidateEvents[0]?.queueItemId ?? "queue-missing",
      signalType,
      eventTypes,
      feedbackReasons: uniqueSortedStrings(reasons) as Phase2ProactivityFeedbackControl[],
      reasonCodes: uniqueSortedStrings(reasonCodes),
    };
  });
}

function buildQualityScores(events: Phase2ProactivityUxEvent[]): Phase2ProactivityQualityScore[] {
  const groups = new Map<string, Phase2ProactivityUxEvent[]>();
  for (const event of events) {
    const source = event.sourceRefs[0] ?? "missing-source";
    const key = [
      event.signalType,
      source,
      event.messageClass,
      event.surfacingLane,
      event.queueItemId,
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()].map(([key, groupEvents]) => {
    const [signalType, candidateSource, messageClass, surfacingLane] = key.split("|");
    const eventTypes = groupEvents.map((event) => event.eventType);
    const dismissedCount = eventTypes.filter((eventType) => eventType === "dismissed").length;
    const snoozedCount = eventTypes.filter((eventType) => eventType === "snoozed").length;
    const ignoredCount = eventTypes.filter((eventType) => eventType === "ignored").length;
    const notUsefulCount = eventTypes.filter(
      (eventType) => eventType === "marked_not_useful",
    ).length;
    const usefulCount = eventTypes.filter((eventType) => eventType === "marked_useful").length;
    const negativeCount = dismissedCount + ignoredCount + notUsefulCount;
    const quality: Phase2ProactivityQualityScore["quality"] =
      signalType === "unsafe_private"
        ? "block"
        : snoozedCount > 0
          ? "suppress"
          : negativeCount >= 2
            ? "downrank"
            : usefulCount > 0
              ? "promote"
              : "neutral";
    return {
      scoreId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_quality_score",
        targetId: groupEvents[0]?.candidateId ?? candidateSource,
        seed: { key, eventTypes },
      }),
      signalType,
      candidateSource,
      messageClass: messageClass as Phase2ProactivityUxEvent["messageClass"],
      surfacingLane: surfacingLane as Phase2ProactivityUxEvent["surfacingLane"],
      projectSessionScope: `${groupEvents[0]?.queueItemId ?? "unknown"}:${surfacingLane}`,
      viewedCount: eventTypes.filter((eventType) => eventType === "viewed").length,
      openedDetailCount: eventTypes.filter((eventType) => eventType === "opened_detail").length,
      approvedCount: eventTypes.filter((eventType) => eventType === "approved").length,
      sentCount: eventTypes.filter((eventType) => eventType === "sent").length,
      dismissedCount,
      snoozedCount,
      ignoredCount,
      usefulCount,
      notUsefulCount,
      quality,
      reasonCodes: uniqueSortedStrings([
        ...(quality === "downrank" ? ["high_not_useful_dismiss_ignored_rate"] : []),
        ...(quality === "suppress" ? ["repeated_snooze_or_dismiss_suppression"] : []),
        ...(quality === "block" ? ["unsafe_private_feedback_block"] : []),
        ...(quality === "promote" ? ["useful_or_approved_signal"] : []),
      ]),
    };
  });
}

export async function buildPhase2ProactivityUsefulnessReport(
  input: Phase2ProactivityUsefulnessInput = {},
): Promise<Phase2ProactivityUsefulnessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = rollbackActive(input.env);
  const dailyReviewReport = await loadDailyReviewReport(input);
  const feedbackReport = await loadFeedbackReport(input);
  const uxEvents =
    input.uxEvents ??
    buildDefaultEvents({
      generatedAt,
      dailyReviewReport,
      feedbackReport,
    });
  const sourceRefs = uniqueSortedStrings(uxEvents.flatMap((event) => event.sourceRefs));
  const sourceProfileIds = uniqueSortedStrings(
    uxEvents.flatMap((event) => event.sourceProfileIds),
  ) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings(
    uxEvents.flatMap((event) => event.authorityTiers),
  ) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings(uxEvents.flatMap((event) => event.contentHashes));
  const proofHashes = uniqueSortedStrings([
    ...uxEvents.flatMap((event) => event.proofHashes),
    reportHash(dailyReviewReport as unknown as JsonLike | undefined) ?? "",
    reportHash(feedbackReport as unknown as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const usefulnessSignals = buildUsefulnessSignal(uxEvents, feedbackReport);
  const qualityScores = buildQualityScores(uxEvents);
  const groupedBySignalType = countBy(uxEvents.map((event) => event.signalType));
  const groupedByCandidateSource = countBy(
    uxEvents.map((event) => event.sourceRefs[0] ?? "missing-source"),
  );
  const groupedByMessageClass = countBy(uxEvents.map((event) => event.messageClass));
  const groupedBySurfacingLane = countBy(uxEvents.map((event) => event.surfacingLane));
  const sourceQualityReport: Phase2ProactivitySourceQualityReport = {
    sourceQualityReportId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_source_quality_report",
      targetId: "source-lane-quality",
      seed: { generatedAt, groupedBySignalType, groupedByCandidateSource },
    }),
    groupedBySignalType,
    groupedByCandidateSource,
    groupedByMessageClass,
    groupedBySurfacingLane,
    qualityScores,
  };
  const suppressionRules: Phase2ProactivitySuppressionRule[] = qualityScores
    .filter(
      (score) =>
        score.quality === "downrank" || score.quality === "suppress" || score.quality === "block",
    )
    .map((score) => ({
      ruleId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_suppression_rule",
        targetId: score.candidateSource,
        seed: { quality: score.quality, reasonCodes: score.reasonCodes },
      }),
      candidateId:
        uxEvents.find((event) => event.sourceRefs[0] === score.candidateSource)?.candidateId ??
        "candidate-missing",
      sourceRef: score.candidateSource,
      action:
        score.quality === "block"
          ? "block_future_surfacing"
          : score.quality === "suppress"
            ? "suppress_candidate"
            : "downrank_source",
      reasonCodes: score.reasonCodes,
      semanticTruthWrite: false,
      memoryCorrectionWrite: false,
    }));
  const whyNotShownDiagnostics: Phase2ProactivityWhyNotShownDiagnostic[] = suppressionRules.map(
    (rule) => ({
      diagnosticId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_why_not_shown",
        targetId: rule.candidateId,
        seed: { action: rule.action, reasonCodes: rule.reasonCodes },
      }),
      candidateId: rule.candidateId,
      shown: false,
      reasonCodes: rule.reasonCodes,
      displayLocation: "operator_debug_proactivity_detail",
    }),
  );
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    !input.forceRawPrivateContent &&
    uxEvents.every((event) => !event.rawTextStored) &&
    sourceRefs.length > 0 &&
    sourceProfileIds.length > 0;
  const checks: Phase2ProactivityUsefulnessCheck[] = [];
  addCheck(
    checks,
    "ux_events_bounded_metadata",
    uxEvents.every((event) => !event.rawTextStored),
  );
  addCheck(
    checks,
    "feedback_control_plane_only",
    Boolean(
      feedbackReport &&
      !feedbackReport.telemetry.semanticTruthWriteObserved &&
      !feedbackReport.telemetry.memoryCorrectionWriteObserved,
    ),
  );
  addCheck(checks, "quality_grouping_available", qualityScores.length > 0);
  addCheck(
    checks,
    "noisy_sources_downranked",
    suppressionRules.some((rule) => rule.action === "downrank_source") ||
      qualityScores.some((score) => score.quality === "promote"),
  );
  addCheck(
    checks,
    "repeat_suppression_available",
    suppressionRules.some((rule) => rule.action === "suppress_candidate"),
  );
  addCheck(
    checks,
    "why_not_shown_diagnostics_available",
    whyNotShownDiagnostics.length === suppressionRules.length,
  );
  addCheck(checks, "rollback_kill_switch_inactive", !rollback);
  addCheck(checks, "no_semantic_truth_write", !input.forceSemanticTruthWrite);
  addCheck(checks, "no_memory_correction_write", !input.forceMemoryCorrectionWrite);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "no_autonomous_send", !input.forceAutonomousSend);
  addCheck(checks, "no_action_execution", !input.forceActionExecution);
  const failed = checks.filter((check) => check.status === "fail");
  const hasNoise = qualityScores.some(
    (score) => score.quality === "downrank" || score.quality === "suppress",
  );
  const decision: Phase2ProactivityUsefulnessDecision = rollback
    ? "rollback_disabled"
    : failed.length > 0
      ? "blocked"
      : hasNoise
        ? "tuning_degraded_by_noise"
        : "usefulness_tuning_enabled";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_usefulness_tuning_report",
    targetId: dailyReviewReport?.reportId ?? feedbackReport?.reportId ?? "missing",
    seed: { generatedAt, decision, failed: failed.map((check) => check.reasonCode) },
  });
  const report: Phase2ProactivityUsefulnessReport = {
    schemaVersion: PHASE2_PROACTIVITY_USEFULNESS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    dailyReviewSummary: dailyReviewReport
      ? {
          reportId: dailyReviewReport.reportId,
          decision: dailyReviewReport.decision,
          reviewItemCount: dailyReviewReport.reviewItems.length,
        }
      : undefined,
    feedbackSummary: feedbackReport
      ? {
          reportId: feedbackReport.reportId,
          decision: feedbackReport.decision,
          feedbackCount: feedbackReport.feedbackRecords.length,
        }
      : undefined,
    uxEvents,
    usefulnessSignals,
    sourceQualityReport,
    suppressionRules: rollback ? [] : suppressionRules,
    whyNotShownDiagnostics: rollback ? [] : whyNotShownDiagnostics,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_USEFULNESS_SCHEMA_VERSION,
      reportId,
      uxEventCount: uxEvents.length,
      signalCount: usefulnessSignals.length,
      qualityScoreCount: qualityScores.length,
      suppressionRuleCount: rollback ? 0 : suppressionRules.length,
      whyNotShownCount: rollback ? 0 : whyNotShownDiagnostics.length,
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      autonomousSendingEnabled: false,
      actionExecutionObserved: false,
      semanticTruthWriteObserved: false,
      memoryCorrectionWriteObserved: false,
      rawPrivateContentObserved: false,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_usefulness_rollback",
        targetId: reportId,
        seed: "neutral-ranking",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED",
      targetMode: "neutral_ranking_no_tuning_effects",
      disablesTuningEffects: true,
      preservesQueueAndInbox: true,
    },
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityUsefulnessReport(
  report: Phase2ProactivityUsefulnessReport,
): void {
  assertNoDarkData(report);
  if (report.decision === "blocked" || report.decision === "rollback_disabled") {
    throw new Error(`phase2 proactivity usefulness tuning not enabled: ${report.decision}`);
  }
  if (
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.actionExecutionObserved ||
    report.telemetry.semanticTruthWriteObserved ||
    report.telemetry.memoryCorrectionWriteObserved ||
    report.telemetry.rawPrivateContentObserved
  ) {
    throw new Error("phase2 proactivity usefulness tuning observed forbidden behavior");
  }
}

export async function writePhase2ProactivityUsefulnessArtifact(input: {
  report: Phase2ProactivityUsefulnessReport;
  artifactDir: string;
}): Promise<Phase2ProactivityUsefulnessArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-usefulness-tuning",
    value: input.report as unknown as JsonLike,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Usefulness Tuning",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- uxEventCount: ${input.report.telemetry.uxEventCount}`,
    `- suppressionRuleCount: ${input.report.telemetry.suppressionRuleCount}`,
    `- whyNotShownCount: ${input.report.telemetry.whyNotShownCount}`,
    `- semanticTruthWriteObserved: ${input.report.telemetry.semanticTruthWriteObserved}`,
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
