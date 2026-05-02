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
import type { Phase2ProactivityWorkItemKind } from "./phase2-proactivity-work-items.ts";

export const PHASE2_LIVE_PROACTIVITY_SIGNAL_SCHEMA_VERSION =
  "phase2_live_proactivity_signal.v1" as const;
export const PHASE2_LIVE_PROACTIVITY_DETECTION_REPORT_SCHEMA_VERSION =
  "phase2_live_proactivity_detection_report.v1" as const;

export type Phase2LiveProactivitySignalKind =
  | "active_work_state"
  | "unresolved_question"
  | "recent_failure"
  | "repeated_friction"
  | "incomplete_follow_up"
  | "stale_decision"
  | "maintenance_candidate"
  | "project_state_capsule"
  | "recent_memory_update"
  | "session_event";

export type Phase2LiveProactivitySignalSourceType =
  | "ordinary_turn_capture"
  | "session_runtime_event"
  | "task_or_queue_state"
  | "maintenance_loop_output"
  | "project_state_capsule"
  | "derived_memory_artifact"
  | "operator_feedback_event"
  | "gateway_delivery_or_error_event";

export type Phase2LiveProactivitySignalSource = {
  sourceId: string;
  sourceType: Phase2LiveProactivitySignalSourceType;
  signalKind: Phase2LiveProactivitySignalKind;
  projectId: string;
  sessionKey: string;
  boundedSummary: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash?: string;
  proofHash?: string;
  freshness?: "recent" | "stale" | "unknown";
  conflictState?: "clear" | "conflicted";
  inspectionOnly?: boolean;
  noDarkDataStatus?: "pass" | "fail";
  limitations?: string[];
};

export type Phase2LiveProactivitySignal = {
  signalId: string;
  signalKind: Phase2LiveProactivitySignalKind;
  sourceType: Phase2LiveProactivitySignalSourceType;
  projectId: string;
  sessionKey: string;
  boundedSummary: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash: string;
  freshness: "recent" | "stale" | "unknown";
  conflictState: "clear" | "conflicted";
  inspectionOnly: boolean;
  noDarkDataStatus: "pass" | "fail";
  limitations: string[];
};

export type Phase2LiveProactivityOpportunity = {
  opportunityId: string;
  signalId: string;
  sourceId: string;
  signalKind: Phase2LiveProactivitySignalKind;
  sourceType: Phase2LiveProactivitySignalSourceType;
  workItemKind: Phase2ProactivityWorkItemKind;
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  evidenceSummary: string;
  confidence: "high" | "medium" | "low";
  limitations: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  staleLabels: string[];
  conflictLabels: string[];
  noDarkDataStatus: "pass" | "fail";
  blockedReasonCodes: string[];
};

export type Phase2ModelReviewedLiveProactivityOpportunity = {
  sourceId: string;
  workItemKind: Phase2ProactivityWorkItemKind;
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  evidenceSummary: string;
  confidence?: "high" | "medium" | "low";
  limitations?: string[];
  sourceRefs?: string[];
  sourceProfileIds?: SourceProfileId[];
  authorityTiers?: SourceAuthorityTier[];
  contentHashes?: string[];
  proofHashes?: string[];
  noDarkDataStatus?: "pass" | "fail";
  blockedReasonCodes?: string[];
};

export type Phase2LiveProactivityDetectionPolicy = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVITY_SIGNAL_SCHEMA_VERSION;
  policyId: string;
  requireLiveSource: true;
  requireModelReviewedOpportunity: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireNoDarkDataPass: true;
  excludeInspectionOnly: true;
  staticFallbackPrimaryAllowed: false;
  deterministicDedupeOnly: true;
  semanticSimilarityTruthAllowed: false;
  topicParserAllowed: false;
  markerSpecificRuntimeLogicAllowed: false;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2LiveProactivityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "live_source_required"
    | "provenance_required"
    | "source_profile_required"
    | "authority_tier_required"
    | "no_dark_data_required"
    | "inspection_only_excluded"
    | "bounded_signal_summary_required"
    | "model_reviewed_opportunity_required"
    | "model_reviewed_signal_ref_required"
    | "static_fallback_not_primary"
    | "external_text_evidence_not_instruction";
};

export type Phase2LiveProactivitySignalTelemetry = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVITY_SIGNAL_SCHEMA_VERSION;
  reportId: string;
  signalCount: number;
  opportunityCount: number;
  blockedCount: number;
  signalKinds: Phase2LiveProactivitySignalKind[];
  sourceTypes: Phase2LiveProactivitySignalSourceType[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2LiveProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SIGNALS_DISABLED";
  targetMode: "diagnostics_only_static_fallback";
  disablesLiveSignalGeneration: true;
};

export type Phase2LiveProactivityDetectionReport = {
  schemaVersion: typeof PHASE2_LIVE_PROACTIVITY_DETECTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision:
    | "live_opportunities_detected"
    | "no_live_opportunities"
    | "blocked"
    | "rollback_disabled";
  policy: Phase2LiveProactivityDetectionPolicy;
  signals: Phase2LiveProactivitySignal[];
  opportunities: Phase2LiveProactivityOpportunity[];
  checks: Phase2LiveProactivityCheck[];
  telemetry: Phase2LiveProactivitySignalTelemetry;
  rollbackPlan: Phase2LiveProactivityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2LiveProactivitySignalInput = {
  now?: Date;
  sources?: Phase2LiveProactivitySignalSource[];
  modelReviewedOpportunities?: Phase2ModelReviewedLiveProactivityOpportunity[];
  env?: Record<string, string | undefined>;
  forceNoDarkDataFail?: boolean;
  forceMissingProvenance?: boolean;
};

export type Phase2LiveProactivityDetectionArtifact = {
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
        `phase2 live proactivity signals contain prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 live proactivity signals contain prohibited marker content");
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SIGNALS_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2LiveProactivityCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2LiveProactivityCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function compact(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function opportunityFromModelReview(input: {
  signal: Phase2LiveProactivitySignal;
  opportunity: Phase2ModelReviewedLiveProactivityOpportunity;
}): Phase2LiveProactivityOpportunity {
  const { signal, opportunity } = input;
  const staleLabels = signal.freshness === "stale" ? ["stale_evidence_labeled"] : [];
  const conflictLabels =
    signal.conflictState === "conflicted" ? ["conflicted_evidence_labeled"] : [];
  const sourceRefs = uniqueSortedStrings(opportunity.sourceRefs ?? signal.sourceRefs);
  const sourceProfileIds = uniqueSortedStrings(
    opportunity.sourceProfileIds ?? [signal.sourceProfileId],
  ) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings(
    opportunity.authorityTiers ?? [signal.authorityTier],
  ) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings(opportunity.contentHashes ?? [signal.contentHash]);
  const proofHashes = uniqueSortedStrings(opportunity.proofHashes ?? [signal.proofHash]);
  return {
    opportunityId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactivity_opportunity",
      targetId: signal.signalId,
      seed: {
        workItemKind: opportunity.workItemKind,
        title: opportunity.title,
        contentHashes,
        proofHashes,
      },
    }),
    signalId: signal.signalId,
    sourceId: opportunity.sourceId,
    signalKind: signal.signalKind,
    sourceType: signal.sourceType,
    workItemKind: opportunity.workItemKind,
    title: compact(opportunity.title, 120),
    whyNow: compact(opportunity.whyNow, 280),
    proposedNextStep: compact(opportunity.proposedNextStep, 280),
    expectedUserValue: compact(opportunity.expectedUserValue, 240),
    evidenceSummary: compact(opportunity.evidenceSummary, 320),
    confidence: opportunity.confidence ?? "medium",
    limitations: uniqueSortedStrings([
      ...(signal.limitations ?? []),
      ...(opportunity.limitations ?? []),
    ]),
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    staleLabels,
    conflictLabels,
    noDarkDataStatus:
      signal.noDarkDataStatus === "fail" || opportunity.noDarkDataStatus === "fail"
        ? "fail"
        : "pass",
    blockedReasonCodes: opportunity.blockedReasonCodes ?? [],
  };
}

function signalFromSource(input: {
  source: Phase2LiveProactivitySignalSource;
  forceMissingProvenance?: boolean;
  forceNoDarkDataFail?: boolean;
}): Phase2LiveProactivitySignal {
  const sourceRefs = input.forceMissingProvenance ? [] : input.source.sourceRefs;
  const contentHash =
    input.source.contentHash ??
    hash({
      sourceId: input.source.sourceId,
      sourceType: input.source.sourceType,
      signalKind: input.source.signalKind,
      boundedSummary: input.source.boundedSummary,
      sourceRefs,
    });
  return {
    signalId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactivity_signal",
      targetId: input.source.signalKind,
      seed: { sourceId: input.source.sourceId, sourceRefs, contentHash },
    }),
    signalKind: input.source.signalKind,
    sourceType: input.source.sourceType,
    projectId: input.source.projectId,
    sessionKey: input.source.sessionKey,
    boundedSummary: compact(input.source.boundedSummary),
    sourceRefs,
    sourceProfileId: input.source.sourceProfileId,
    authorityTier: input.source.authorityTier,
    contentHash,
    proofHash:
      input.source.proofHash ??
      hash({
        signal: input.source.signalKind,
        sourceRefs,
        contentHash,
        sourceId: input.source.sourceId,
      }),
    freshness: input.source.freshness ?? "recent",
    conflictState: input.source.conflictState ?? "clear",
    inspectionOnly: input.source.inspectionOnly ?? false,
    noDarkDataStatus: input.forceNoDarkDataFail
      ? "fail"
      : (input.source.noDarkDataStatus ?? "pass"),
    limitations: input.source.limitations ?? [],
  };
}

export async function buildPhase2LiveProactivityDetectionReport(
  input: Phase2LiveProactivitySignalInput = {},
): Promise<Phase2LiveProactivityDetectionReport> {
  assertNoDarkData({
    sources: input.sources ?? [],
    modelReviewedOpportunities: input.modelReviewedOpportunities ?? [],
  });
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const sources = input.sources ?? [];
  const reviewedOpportunities = input.modelReviewedOpportunities ?? [];
  const signals = sources.map((source) =>
    signalFromSource({
      source,
      forceMissingProvenance: input.forceMissingProvenance,
      forceNoDarkDataFail: input.forceNoDarkDataFail,
    }),
  );
  const checks: Phase2LiveProactivityCheck[] = [];
  addCheck(checks, "sources:live_source", sources.length > 0, "live_source_required");
  addCheck(
    checks,
    "model_reviewed_opportunities:present",
    reviewedOpportunities.length > 0,
    "model_reviewed_opportunity_required",
  );
  addCheck(checks, "static_fallback:not_primary", true, "static_fallback_not_primary");
  addCheck(
    checks,
    "external_text:evidence_not_instruction",
    true,
    "external_text_evidence_not_instruction",
  );
  for (const signal of signals) {
    addCheck(
      checks,
      `signal:${signal.signalId}:provenance`,
      signal.sourceRefs.length > 0,
      "provenance_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:source_profile`,
      Boolean(signal.sourceProfileId),
      "source_profile_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:authority`,
      Boolean(signal.authorityTier),
      "authority_tier_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:no_dark_data`,
      signal.noDarkDataStatus === "pass",
      "no_dark_data_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:inspection_only`,
      !signal.inspectionOnly,
      "inspection_only_excluded",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:bounded_summary`,
      signal.boundedSummary.length >= 24,
      "bounded_signal_summary_required",
    );
  }
  const signalBySourceId = new Map<string, Phase2LiveProactivitySignal>();
  sources.forEach((source, index) => {
    const signal = signals[index];
    if (signal) {
      signalBySourceId.set(source.sourceId, signal);
    }
  });
  const opportunities: Phase2LiveProactivityOpportunity[] = [];
  for (const reviewedOpportunity of reviewedOpportunities) {
    const signal = signalBySourceId.get(reviewedOpportunity.sourceId);
    addCheck(
      checks,
      `model_reviewed_opportunity:${reviewedOpportunity.sourceId}:signal_ref`,
      Boolean(signal),
      "model_reviewed_signal_ref_required",
    );
    if (!signal) {
      continue;
    }
    opportunities.push(opportunityFromModelReview({ signal, opportunity: reviewedOpportunity }));
  }
  const failedChecks = checks.filter(
    (check) =>
      check.status === "fail" &&
      check.reasonCode !== "live_source_required" &&
      check.reasonCode !== "model_reviewed_opportunity_required",
  );
  const validOpportunities = failedChecks.length
    ? []
    : opportunities.filter(
        (opportunity) =>
          opportunity.noDarkDataStatus === "pass" &&
          opportunity.sourceRefs.length > 0 &&
          opportunity.sourceProfileIds.length > 0 &&
          opportunity.authorityTiers.length > 0 &&
          opportunity.blockedReasonCodes.length === 0,
      );
  const decision = rollback
    ? "rollback_disabled"
    : failedChecks.length
      ? "blocked"
      : validOpportunities.length
        ? "live_opportunities_detected"
        : "no_live_opportunities";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_proactivity_detection_report",
    targetId: "live-proactivity",
    seed: {
      generatedAt,
      decision,
      opportunityIds: validOpportunities.map((opportunity) => opportunity.opportunityId),
      failedReasonCodes: failedChecks.map((check) => check.reasonCode),
    },
  });
  const policy: Phase2LiveProactivityDetectionPolicy = {
    schemaVersion: PHASE2_LIVE_PROACTIVITY_SIGNAL_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactivity_detection_policy",
      targetId: "live-proactivity",
      seed: generatedAt.slice(0, 10),
    }),
    requireLiveSource: true,
    requireModelReviewedOpportunity: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireNoDarkDataPass: true,
    excludeInspectionOnly: true,
    staticFallbackPrimaryAllowed: false,
    deterministicDedupeOnly: true,
    semanticSimilarityTruthAllowed: false,
    topicParserAllowed: false,
    markerSpecificRuntimeLogicAllowed: false,
    externalTextHandling: "evidence_not_instruction",
  };
  const sourceRefs = uniqueSortedStrings([
    ...signals.flatMap((signal) => signal.sourceRefs),
    ...validOpportunities.flatMap((opportunity) => opportunity.sourceRefs),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...signals.map((signal) => signal.sourceProfileId),
    ...validOpportunities.flatMap((opportunity) => opportunity.sourceProfileIds),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...signals.map((signal) => signal.authorityTier),
    ...validOpportunities.flatMap((opportunity) => opportunity.authorityTiers),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...signals.map((signal) => signal.contentHash),
    ...validOpportunities.flatMap((opportunity) => opportunity.contentHashes),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...signals.map((signal) => signal.proofHash),
    ...validOpportunities.flatMap((opportunity) => opportunity.proofHashes),
  ]);
  const rollbackPlan: Phase2LiveProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactivity_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SIGNALS_DISABLED",
    targetMode: "diagnostics_only_static_fallback",
    disablesLiveSignalGeneration: true,
  };
  const telemetry: Phase2LiveProactivitySignalTelemetry = {
    schemaVersion: PHASE2_LIVE_PROACTIVITY_SIGNAL_SCHEMA_VERSION,
    reportId,
    signalCount: signals.length,
    opportunityCount: validOpportunities.length,
    blockedCount: failedChecks.length,
    signalKinds: uniqueSortedStrings(
      signals.map((signal) => signal.signalKind),
    ) as Phase2LiveProactivitySignalKind[],
    sourceTypes: uniqueSortedStrings(
      signals.map((signal) => signal.sourceType),
    ) as Phase2LiveProactivitySignalSourceType[],
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2LiveProactivityDetectionReport = {
    schemaVersion: PHASE2_LIVE_PROACTIVITY_DETECTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    signals: rollback ? [] : signals,
    opportunities: decision === "live_opportunities_detected" ? validOpportunities : [],
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2LiveProactivityDetected(
  report: Phase2LiveProactivityDetectionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "live_opportunities_detected") {
    throw new Error(`phase2 live proactivity did not detect opportunities: ${report.decision}`);
  }
  if (report.opportunities.length < 1) {
    throw new Error("phase2 live proactivity missing opportunity output");
  }
  if (report.policy.staticFallbackPrimaryAllowed) {
    throw new Error("phase2 live proactivity allowed static fallback as primary");
  }
}

export async function writePhase2LiveProactivityDetectionArtifact(input: {
  report: Phase2LiveProactivityDetectionReport;
  artifactDir: string;
}): Promise<Phase2LiveProactivityDetectionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-live-proactivity-generation",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const jsonPath = written.path;
  const markdown = [
    "# Phase 2 Live Proactivity Generation",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- signalCount: ${input.report.telemetry.signalCount}`,
    `- opportunityCount: ${input.report.telemetry.opportunityCount}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
  ].join("\n");
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, `${markdown}\n`, "utf8");
  return {
    jsonPath,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
