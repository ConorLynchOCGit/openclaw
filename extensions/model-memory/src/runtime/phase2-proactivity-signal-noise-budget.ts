import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type {
  Phase2LiveProactivitySignalKind,
  Phase2LiveProactivitySignalSource,
  Phase2LiveProactivitySignalSourceType,
} from "./phase2-live-proactivity-signals.ts";

export const PHASE2_PROACTIVITY_NOISE_BUDGET_SCHEMA_VERSION =
  "phase2_proactivity_signal_noise_budget.v1" as const;
export const PHASE2_PROACTIVITY_NOISE_BUDGET_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_signal_noise_budget_report.v1" as const;

export type Phase2ProactivityFeedbackReason =
  | "ignored"
  | "dismissed"
  | "snoozed"
  | "not_useful"
  | "wrong_context"
  | "unsafe_private";

export type Phase2ProactivitySignalThreshold = {
  signalKind: Phase2LiveProactivitySignalKind;
  maxVisiblePerWindow: number;
};

export type Phase2ProactivityCooldownWindow = {
  contentHash: string;
  cooldownReasonCode: "cooldown_same_content";
};

export type Phase2ProactivityRecurrenceLimit = {
  signalKind: Phase2LiveProactivitySignalKind;
  sourceType: Phase2LiveProactivitySignalSourceType;
  maxRecurrence: number;
};

export type Phase2ProactivitySignalBudgetPolicy = {
  schemaVersion: typeof PHASE2_PROACTIVITY_NOISE_BUDGET_SCHEMA_VERSION;
  policyId: string;
  defaultMaxVisiblePerSignalKind: 2;
  defaultMaxRecurrencePerSourceType: 2;
  cooldownSameContentHash: true;
  feedbackSuppressionEnabled: true;
  deterministicDedupeOnly: true;
  semanticSimilarityTruthAllowed: false;
  feedbackCreatesSemanticTruth: false;
};

export type Phase2ProactivityNoiseSuppressionDecision = {
  sourceId: string;
  signalKind: Phase2LiveProactivitySignalKind;
  sourceType: Phase2LiveProactivitySignalSourceType;
  contentHash: string;
  suppressed: boolean;
  reasonCodes: string[];
};

export type Phase2ProactivityWhyNotShownDiagnostic = {
  diagnosticId: string;
  sourceId: string;
  shown: boolean;
  reasonCodes: string[];
  displayLocation: "proactivity_diagnostics";
  boundedSummary: string;
};

export type Phase2ProactivityNoiseBudgetCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "source_metadata_bounded"
    | "cooldown_available"
    | "dedupe_window_available"
    | "recurrence_limit_available"
    | "feedback_control_plane_only"
    | "why_not_shown_diagnostics_available"
    | "rollback_kill_switch_inactive"
    | "no_dark_data_required"
    | "no_action_execution";
};

export type Phase2ProactivityNoiseBudgetTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_NOISE_BUDGET_SCHEMA_VERSION;
  reportId: string;
  inputSourceCount: number;
  eligibleSourceCount: number;
  suppressedSourceCount: number;
  whyNotShownCount: number;
  signalKinds: Phase2LiveProactivitySignalKind[];
  sourceTypes: Phase2LiveProactivitySignalSourceType[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  semanticTruthWriteObserved: false;
  actionExecutionObserved: false;
};

export type Phase2ProactivityNoiseBudgetRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_NOISE_BUDGET_DISABLED";
  targetMode: "neutral_live_signal_ranking";
  disablesSuppressionEffects: true;
};

export type Phase2ProactivityNoiseBudgetReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_NOISE_BUDGET_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "noise_budget_applied" | "no_sources" | "blocked" | "rollback_disabled";
  policy: Phase2ProactivitySignalBudgetPolicy;
  eligibleSources: Phase2LiveProactivitySignalSource[];
  suppressionDecisions: Phase2ProactivityNoiseSuppressionDecision[];
  whyNotShownDiagnostics: Phase2ProactivityWhyNotShownDiagnostic[];
  checks: Phase2ProactivityNoiseBudgetCheck[];
  telemetry: Phase2ProactivityNoiseBudgetTelemetry;
  rollbackPlan: Phase2ProactivityNoiseBudgetRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ProactivityNoiseBudgetInput = {
  now?: Date;
  sources?: Phase2LiveProactivitySignalSource[];
  feedbackByContentHash?: Record<string, Phase2ProactivityFeedbackReason[]>;
  env?: Record<string, string | undefined>;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ProactivityNoiseBudgetArtifact = {
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
      throw new Error(`phase2 proactivity noise budget contains prohibited marker: ${marker}`);
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_NOISE_BUDGET_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProactivityNoiseBudgetCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2ProactivityNoiseBudgetCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function hasNegativeFeedback(reasons: Phase2ProactivityFeedbackReason[] | undefined): boolean {
  return Boolean(
    reasons?.some((reason) =>
      ["ignored", "dismissed", "snoozed", "not_useful", "wrong_context", "unsafe_private"].includes(
        reason,
      ),
    ),
  );
}

function makeDiagnostic(
  source: Phase2LiveProactivitySignalSource,
  reasonCodes: string[],
): Phase2ProactivityWhyNotShownDiagnostic {
  return {
    diagnosticId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_why_not_shown",
      targetId: source.sourceId,
      seed: { reasonCodes, contentHash: source.contentHash ?? source.sourceId },
    }),
    sourceId: source.sourceId,
    shown: false,
    reasonCodes,
    displayLocation: "proactivity_diagnostics",
    boundedSummary: source.boundedSummary,
  };
}

export async function buildPhase2ProactivityNoiseBudgetReport(
  input: Phase2ProactivityNoiseBudgetInput = {},
): Promise<Phase2ProactivityNoiseBudgetReport> {
  assertNoDarkData(input.sources ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const sources = input.sources ?? [];
  const checks: Phase2ProactivityNoiseBudgetCheck[] = [];
  addCheck(checks, "metadata:bounded", true, "source_metadata_bounded");
  addCheck(checks, "cooldown:available", true, "cooldown_available");
  addCheck(checks, "dedupe:available", true, "dedupe_window_available");
  addCheck(checks, "recurrence:available", true, "recurrence_limit_available");
  addCheck(checks, "feedback:control_plane", true, "feedback_control_plane_only");
  addCheck(checks, "diagnostics:why_not_shown", true, "why_not_shown_diagnostics_available");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  addCheck(checks, "no_dark_data:pass", !input.forceNoDarkDataFail, "no_dark_data_required");
  addCheck(checks, "action_execution:disabled", !input.forceActionExecution, "no_action_execution");
  const failedChecks = checks.filter((check) => check.status === "fail");
  const seenContentHashes = new Set<string>();
  const perSignalKind = new Map<Phase2LiveProactivitySignalKind, number>();
  const perSignalSourceType = new Map<string, number>();
  const suppressionDecisions: Phase2ProactivityNoiseSuppressionDecision[] = [];
  const eligibleSources: Phase2LiveProactivitySignalSource[] = [];
  const whyNotShownDiagnostics: Phase2ProactivityWhyNotShownDiagnostic[] = [];

  if (!rollback && failedChecks.length === 0) {
    for (const source of sources) {
      const contentHash = source.contentHash ?? source.sourceId;
      const signalCount = perSignalKind.get(source.signalKind) ?? 0;
      const recurrenceKey = `${source.signalKind}:${source.sourceType}`;
      const recurrenceCount = perSignalSourceType.get(recurrenceKey) ?? 0;
      const feedback = input.feedbackByContentHash?.[contentHash];
      const reasonCodes = [
        ...(seenContentHashes.has(contentHash) ? ["cooldown_same_content"] : []),
        ...(signalCount >= 2 ? ["threshold_signal_kind_exceeded"] : []),
        ...(recurrenceCount >= 2 ? ["recurrence_limit_exceeded"] : []),
        ...(hasNegativeFeedback(feedback) ? ["feedback_suppressed_signal"] : []),
        ...(feedback?.includes("unsafe_private") ? ["unsafe_private_feedback_blocked"] : []),
      ];
      const suppressed = reasonCodes.length > 0;
      suppressionDecisions.push({
        sourceId: source.sourceId,
        signalKind: source.signalKind,
        sourceType: source.sourceType,
        contentHash,
        suppressed,
        reasonCodes,
      });
      if (suppressed) {
        whyNotShownDiagnostics.push(makeDiagnostic(source, reasonCodes));
      } else {
        eligibleSources.push(source);
      }
      seenContentHashes.add(contentHash);
      perSignalKind.set(source.signalKind, signalCount + 1);
      perSignalSourceType.set(recurrenceKey, recurrenceCount + 1);
    }
  }

  const decision = rollback
    ? "rollback_disabled"
    : failedChecks.length
      ? "blocked"
      : sources.length
        ? "noise_budget_applied"
        : "no_sources";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_noise_budget_report",
    targetId: "proactivity-noise-budget",
    seed: {
      generatedAt,
      decision,
      sourceIds: sources.map((source) => source.sourceId),
      suppressed: suppressionDecisions.filter((decision) => decision.suppressed).length,
    },
  });
  const policy: Phase2ProactivitySignalBudgetPolicy = {
    schemaVersion: PHASE2_PROACTIVITY_NOISE_BUDGET_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_noise_budget_policy",
      targetId: "proactivity-noise-budget",
      seed: generatedAt.slice(0, 10),
    }),
    defaultMaxVisiblePerSignalKind: 2,
    defaultMaxRecurrencePerSourceType: 2,
    cooldownSameContentHash: true,
    feedbackSuppressionEnabled: true,
    deterministicDedupeOnly: true,
    semanticSimilarityTruthAllowed: false,
    feedbackCreatesSemanticTruth: false,
  };
  const rollbackPlan: Phase2ProactivityNoiseBudgetRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_noise_budget_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_NOISE_BUDGET_DISABLED",
    targetMode: "neutral_live_signal_ranking",
    disablesSuppressionEffects: true,
  };
  const telemetry: Phase2ProactivityNoiseBudgetTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_NOISE_BUDGET_SCHEMA_VERSION,
    reportId,
    inputSourceCount: sources.length,
    eligibleSourceCount: eligibleSources.length,
    suppressedSourceCount: suppressionDecisions.filter((decision) => decision.suppressed).length,
    whyNotShownCount: whyNotShownDiagnostics.length,
    signalKinds: uniqueSortedStrings(
      sources.map((source) => source.signalKind),
    ) as Phase2LiveProactivitySignalKind[],
    sourceTypes: uniqueSortedStrings(
      sources.map((source) => source.sourceType),
    ) as Phase2LiveProactivitySignalSourceType[],
    sourceRefs: uniqueSortedStrings(sources.flatMap((source) => source.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      sources.map((source) => source.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      sources.map((source) => source.authorityTier),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(
      sources.map((source) => source.contentHash ?? source.sourceId),
    ),
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
    semanticTruthWriteObserved: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ProactivityNoiseBudgetReport = {
    schemaVersion: PHASE2_PROACTIVITY_NOISE_BUDGET_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    eligibleSources: rollback ? [] : eligibleSources,
    suppressionDecisions,
    whyNotShownDiagnostics,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityNoiseBudgetApplied(
  report: Phase2ProactivityNoiseBudgetReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "noise_budget_applied") {
    throw new Error(`phase2 proactivity noise budget not applied: ${report.decision}`);
  }
  if (!report.policy.cooldownSameContentHash || !report.policy.deterministicDedupeOnly) {
    throw new Error("phase2 proactivity noise budget missing deterministic cooldown/dedupe");
  }
}

export async function writePhase2ProactivityNoiseBudgetArtifact(input: {
  report: Phase2ProactivityNoiseBudgetReport;
  artifactDir: string;
}): Promise<Phase2ProactivityNoiseBudgetArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-signal-noise-budget",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Signal Noise Budget",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- inputSourceCount: ${input.report.telemetry.inputSourceCount}`,
    `- eligibleSourceCount: ${input.report.telemetry.eligibleSourceCount}`,
    `- suppressedSourceCount: ${input.report.telemetry.suppressedSourceCount}`,
    `- whyNotShownCount: ${input.report.telemetry.whyNotShownCount}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
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
