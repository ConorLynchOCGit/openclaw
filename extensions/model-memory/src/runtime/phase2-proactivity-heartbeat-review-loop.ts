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

export const PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_SCHEMA_VERSION =
  "phase2_proactivity_heartbeat_review.v1" as const;
export const PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_heartbeat_review_report.v1" as const;

export type Phase2ProactivityHeartbeatSignalKind =
  | "active_work_state"
  | "unresolved_question"
  | "recent_failure"
  | "repeated_friction"
  | "stale_decision"
  | "incomplete_follow_up"
  | "user_feedback";

export type Phase2ProactivityHeartbeatSignal = {
  signalId: string;
  kind: Phase2ProactivityHeartbeatSignalKind;
  boundedSummary: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ProactivityHeartbeatSuggestion = {
  suggestionId: string;
  signalKind: Phase2ProactivityHeartbeatSignalKind;
  planTitle: string;
  whyNow: string;
  proposedMessage: string;
  suggestedAction: string;
  evidenceSummary: string;
  expectedUserValue: string;
  confidence: "high" | "medium" | "low";
  approvalRequired: true;
  automaticSendAllowed: false;
  externalTextHandling: "evidence_not_instruction";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
};

export type Phase2ProactivityHeartbeatReviewReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  reviewQuestion: "What would help this user today?";
  decision: "concrete_suggestions_generated" | "blocked" | "rollback_disabled";
  signals: Phase2ProactivityHeartbeatSignal[];
  suggestions: Phase2ProactivityHeartbeatSuggestion[];
  noDarkDataStatus: "pass" | "fail";
  telemetry: {
    schemaVersion: typeof PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_SCHEMA_VERSION;
    reportId: string;
    signalKinds: Phase2ProactivityHeartbeatSignalKind[];
    suggestionCount: number;
    approvalRequired: true;
    automaticSendAllowed: false;
    actionExecutionObserved: false;
    externalTextInstructionAllowed: false;
  };
  rollbackPlan: {
    rollbackId: string;
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED";
    disablesHeartbeatSuggestions: true;
  };
};

export type Phase2ProactivityHeartbeatReviewArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

function defaultSignals(): Phase2ProactivityHeartbeatSignal[] {
  return [
    {
      signalId: "active-work-proactivity-ux-correctness",
      kind: "active_work_state",
      boundedSummary:
        "Active work is fixing Proactivity UX correctness: no-op sends, inert filters, misleading counts, and blind approval.",
      sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      contentHash: "phase2-proactivity-active-work-correctness",
      noDarkDataStatus: "pass",
    },
    {
      signalId: "recent-failure-live-gateway-proactivity",
      kind: "recent_failure",
      boundedSummary:
        "The live gateway previously failed to make new Proactivity UX visible immediately; verify runtime pickup before judging the UI.",
      sourceRefs: ["docs/projects/operator-experience/STATUS.md"],
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      contentHash: "phase2-proactivity-live-gateway-failure",
      noDarkDataStatus: "pass",
    },
    {
      signalId: "repeated-friction-placeholder-proactivity",
      kind: "repeated_friction",
      boundedSummary:
        "Repeated user friction: proactivity cards say a plan exists without showing the actual plan or message.",
      sourceRefs: ["docs/projects/model-memory/DECISIONS.md"],
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      contentHash: "phase2-proactivity-placeholder-friction",
      noDarkDataStatus: "pass",
    },
    {
      signalId: "unresolved-question-inline-surfacing",
      kind: "unresolved_question",
      boundedSummary:
        "The user still has not seen a concrete proactive plan surface in chat; verify active context matching.",
      sourceRefs: ["docs/projects/model-memory/specs/planner-review-artifacts-and-surfacing.md"],
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      contentHash: "phase2-proactivity-inline-question",
      noDarkDataStatus: "pass",
    },
  ];
}

function suggestionFromSignal(
  signal: Phase2ProactivityHeartbeatSignal,
): Phase2ProactivityHeartbeatSuggestion {
  const planTitle =
    signal.kind === "recent_failure"
      ? "Verify live gateway pickup for Proactivity UX"
      : signal.kind === "repeated_friction"
        ? "Replace placeholder proactivity with reviewable plan cards"
        : signal.kind === "unresolved_question"
          ? "Check why no proactive plan appears inline"
          : "Fix Proactivity UX correctness before adding capability";
  const proposedMessage = `${planTitle}: ${signal.boundedSummary} Do you want this handled before any further proactivity expansion?`;
  const proofHash = sha256JsonValue(signal as unknown as JsonLike);
  return {
    suggestionId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_heartbeat_suggestion",
      targetId: signal.signalId,
      seed: proofHash,
    }),
    signalKind: signal.kind,
    planTitle,
    whyNow: signal.boundedSummary,
    proposedMessage,
    suggestedAction:
      "Review this concrete heartbeat suggestion and send only with explicit approval.",
    evidenceSummary: `Evidence from ${signal.sourceRefs.join(", ")}.`,
    expectedUserValue:
      "Turns current active-work friction into a specific next action instead of a generic note.",
    confidence: signal.noDarkDataStatus === "pass" ? "high" : "low",
    approvalRequired: true,
    automaticSendAllowed: false,
    externalTextHandling: "evidence_not_instruction",
    sourceRefs: signal.sourceRefs,
    sourceProfileIds: [signal.sourceProfileId],
    authorityTiers: [signal.authorityTier],
    contentHashes: [signal.contentHash],
    proofHashes: [proofHash],
    blockedReasonCodes: signal.noDarkDataStatus === "pass" ? [] : ["no_dark_data_required"],
  };
}

export async function buildPhase2ProactivityHeartbeatReviewReport(
  input: {
    now?: Date;
    signals?: Phase2ProactivityHeartbeatSignal[];
    env?: Record<string, string | undefined>;
  } = {},
): Promise<Phase2ProactivityHeartbeatReviewReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback =
    input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED === "1" ||
    input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED === "true";
  const signals = input.signals ?? defaultSignals();
  const noDarkDataStatus = signals.every((signal) => signal.noDarkDataStatus === "pass")
    ? "pass"
    : "fail";
  const suggestions = rollback ? [] : signals.map(suggestionFromSignal);
  const decision = rollback
    ? "rollback_disabled"
    : noDarkDataStatus === "pass"
      ? "concrete_suggestions_generated"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_heartbeat_review_report",
    targetId: "product-proactivity",
    seed: { generatedAt, decision, signals: signals.map((signal) => signal.signalId) },
  });
  return {
    schemaVersion: PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    reviewQuestion: "What would help this user today?",
    decision,
    signals,
    suggestions,
    noDarkDataStatus,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_SCHEMA_VERSION,
      reportId,
      signalKinds: uniqueSortedStrings(
        signals.map((signal) => signal.kind),
      ) as Phase2ProactivityHeartbeatSignalKind[],
      suggestionCount: suggestions.length,
      approvalRequired: true,
      automaticSendAllowed: false,
      actionExecutionObserved: false,
      externalTextInstructionAllowed: false,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_heartbeat_review_rollback",
        targetId: reportId,
        seed: "MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED",
      disablesHeartbeatSuggestions: true,
    },
  };
}

export async function writePhase2ProactivityHeartbeatReviewArtifact(input: {
  report: Phase2ProactivityHeartbeatReviewReport;
  artifactDir: string;
}): Promise<Phase2ProactivityHeartbeatReviewArtifact> {
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-heartbeat-review",
    value: input.report as unknown as JsonLike,
  });
  const markdownPath = path.join(input.artifactDir, "heartbeat-review.md");
  const markdown = `${[
    "# Phase 2 Proactivity Heartbeat Review",
    "",
    `- report: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- suggestions: ${input.report.suggestions.length}`,
  ].join("\n")}\n`;
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
