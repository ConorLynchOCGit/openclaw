import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue, sha256Text } from "../hashing.ts";
import type { JsonModelExecutor } from "../model-execution.ts";
import { parseJsonModelOutput } from "../model-execution.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2OpportunityLedgerSource } from "./phase2-proactivity-opportunity-ledger.ts";
import type { Phase2ProactivityWorkItemKind } from "./phase2-proactivity-work-items.ts";
import type {
  Phase2SkillCandidateAutonomyLevel,
  Phase2SkillCandidateCanaryStatus,
  Phase2SkillCandidateEvalStatus,
  Phase2SkillCandidateInstallTarget,
  Phase2SkillCandidateOpportunity,
  Phase2SkillCandidateRecord,
  Phase2SkillCandidateRiskTier,
  Phase2SkillCandidateSourceRuntime,
  Phase2SkillCandidateVettingStatus,
} from "./phase2-skill-candidate-ledger.ts";
import type { WorkEpisodeOutcomePack } from "./phase2-work-episode-outcome-pack.ts";

export const CANDIDATE_REVIEW_PREFILTER_EVENT_SCHEMA_VERSION =
  "candidate_review_prefilter_event.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_PACKET_SCHEMA_VERSION =
  "candidate_review_trigger_packet.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION =
  "candidate_review_trigger_decision.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION =
  "candidate_review_trigger_report.v1" as const;
export const PROACTIVITY_REVIEW_EPISODE_PACKET_SCHEMA_VERSION =
  "proactivity_review_episode.v2" as const;
export const CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION = "candidate_review_proposal.v2" as const;
export const MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION =
  "model_reviewed_candidate_report.v1" as const;
export const DEFAULT_CANDIDATE_TRIGGER_MODEL_ID = "openai-codex/gpt-5.4-mini";
export const DEFAULT_CANDIDATE_REVIEW_MODEL_ID = "openai-codex/gpt-5.4";
export const CODEX_SESSION_ROOT_ENV = "MODEL_MEMORY_PHASE2_CODEX_SESSION_ROOT";
export const CODEX_HISTORY_PATH_ENV = "MODEL_MEMORY_PHASE2_CODEX_HISTORY_PATH";

export type CandidateReviewRuntime = "openclaw" | "codex" | "mixed";
export type CandidateReviewGoal = "skills" | "proactivity" | "both" | "none";
export type CandidateReviewConfidence = "low" | "medium" | "high";

export type CandidateReviewPrefilterEventType =
  | "assistant_final_completed"
  | "heartbeat_started"
  | "session_boundary"
  | "validation_or_proof_failed"
  | "card_dismissed_or_not_useful"
  | "card_quality_failed";

export type CandidateReviewPrefilterEvent = {
  schemaVersion: typeof CANDIDATE_REVIEW_PREFILTER_EVENT_SCHEMA_VERSION;
  eventId: string;
  eventType: CandidateReviewPrefilterEventType;
  runtime: Exclude<CandidateReviewRuntime, "mixed">;
  sessionKey: string;
  createdAt: string;
  refs: string[];
  boundedSummary: string;
};

export type CandidateReviewPrefilterDecision = {
  shouldAskModel: boolean;
  reasonCodes: string[];
  episodeKey: string;
};

export type CandidateReviewTriggerRef = {
  ref: string;
  role: "user" | "assistant" | "system_event" | "tool_summary" | "card";
  kind:
    | "ask"
    | "final"
    | "correction"
    | "example"
    | "result_summary"
    | "failure_summary"
    | "card_summary";
  boundedText: string;
  hash: string;
};

export type CandidateReviewTriggerPacket = {
  schemaVersion: typeof CANDIDATE_REVIEW_TRIGGER_PACKET_SCHEMA_VERSION;
  event: CandidateReviewPrefilterEvent;
  recentRefs: CandidateReviewTriggerRef[];
  recentCardSummaries: Array<{
    id: string;
    kind: string;
    title: string;
    status: string;
    quality?: string;
  }>;
  recentActivitySignals: string[];
  safetyEnvelope: {
    noRawToolLogs: true;
    noSecrets: true;
    proposalOnly: true;
  };
};

export type CandidateReviewTriggerReasonCode =
  | "explicit_user_ask"
  | "user_correction_or_critique"
  | "related_turn_cluster"
  | "recurring_work_pattern"
  | "validation_or_proof_friction"
  | "card_quality_failure"
  | "session_boundary"
  | "heartbeat_review";

export type CandidateReviewTriggerDecision = {
  schemaVersion: typeof CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION;
  shouldRun: boolean;
  reasonCodes: CandidateReviewTriggerReasonCode[];
  confidence: CandidateReviewConfidence;
  episodeWindow: {
    startRef: string;
    endRef: string;
    includedRefs: string[];
  };
  reviewGoal: CandidateReviewGoal;
  why: string;
};

export type CandidateReviewTriggerReport = {
  schemaVersion: typeof CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION;
  enabled: boolean;
  source: "model" | "skipped" | "rejected";
  modelId?: string;
  resolvedModelId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  elapsedMs: number;
  inputHash: string;
  outputHash?: string;
  validationStatus: "pass" | "reject";
  reasonCodes: string[];
  promptPersisted: false;
  rawResponsePersisted: false;
  promptChars: number;
  outputChars?: number;
};

export type ProactivityReviewEpisodePacket = {
  schemaVersion: typeof PROACTIVITY_REVIEW_EPISODE_PACKET_SCHEMA_VERSION;
  reviewGoal: "find_few_high_value_candidates";
  sessionWindow: {
    runtime: CandidateReviewRuntime;
    sessionKey: string;
    startRef: string;
    endRef: string;
    turnCount: number;
    timeWindowLabel: string;
  };
  episodeTurns: Array<{
    role: "user" | "assistant";
    sourceRuntime: Exclude<CandidateReviewRuntime, "mixed">;
    ref: string;
    boundedText: string;
    hash: string;
    excerptPolicy: {
      maxChars: number;
      redacted: boolean;
      rawTranscriptPersisted: false;
    };
  }>;
  userIntentArc: {
    currentObjective: string;
    recentConcerns: string[];
    explicitAsks: string[];
    decisionPressure: string[];
  };
  codexActivitySummary: {
    status: CandidateReviewCodexAdapterReport["status"];
    reasonCode?: string;
    sessionRefs: string[];
    commandSummaries: Array<{
      ref: string;
      commandFamily: string;
      status: "passed" | "failed" | "unknown";
      failureClass?: string;
      boundedSummary: string;
      hash: string;
    }>;
    validationFailures: Array<{
      ref: string;
      lane: string;
      boundedSummary: string;
      hash: string;
    }>;
    touchedAreas: string[];
    outcomeSummaries: string[];
  };
  packetQuality: {
    status: "pass" | "degraded";
    reasonCodes: string[];
    contiguousWindowPresent: boolean;
    openClawTurnCount: number;
    codexTurnCount: number;
    duplicatedTurnCount: number;
    genericCommandSummaryCount: number;
    validationFailureSummaryCount: number;
    touchedAreaCount: number;
    assistantFinalCount: number;
    rawFullTranscriptPersisted: false;
  };
  observedWorkPatterns: Array<{
    summary: string;
    recurrenceEvidence: string[];
    frictionSignals: string[];
    successSignals: string[];
  }>;
  existingContext: {
    loadedSkills: Array<{ name: string; description?: string; source: string }>;
    activeMilestone: string;
    activeDocsOrBranches: string[];
    recentProactivityItems: Array<{
      id: string;
      kind: string;
      title: string;
      status: string;
      quality?: string;
    }>;
  };
  candidateLedgerContext: {
    recentCandidateIds: string[];
    possibleDuplicateTitles: string[];
    rejectedOrDemotedSummary: string[];
  };
  reviewPolicy: {
    maxSurfaceCandidates: 3;
    preferNoCandidateOverWeakCandidate: true;
    requireRepeatabilityOrLargeAvoidedCost: true;
    rejectTinyCleanupCandidates: true;
    proposalOnly: true;
  };
  safetyEnvelope: {
    proposalOnly: true;
    noActionExecution: true;
    noSkillInstallOrPromotion: true;
    noCanonicalMemoryTruth: true;
    noRawToolLogs: true;
    rawFullTranscriptPersisted: false;
  };
  sourceSelection?: {
    primaryInputKind:
      | "work_episode_outcome_pack"
      | "codex_episode_window"
      | "openclaw_episode_window"
      | "bounded_mixed_fallback";
    primaryRuntime: CandidateReviewRuntime;
    selectedSourceRefs: string[];
    droppedSourceCounts?: Record<string, number>;
    fallbackReason?: string;
    outcomePackId?: string;
  };
};

export type CandidateReviewProposalKind =
  | "proactive_plan"
  | "new_skill_candidate"
  | "existing_skill_enhancement"
  | "merge_or_extend_candidate"
  | "demote_existing_candidate";

export type CandidateReviewLeverageClass =
  | "large_repeated_cost"
  | "stability_risk"
  | "workflow_acceleration"
  | "strategic_unblock";

export type CandidateReviewProposal = {
  schemaVersion: typeof CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION;
  proposalId: string;
  proposalKind: CandidateReviewProposalKind;
  title: string;
  purpose: string;
  recommendedNextStep: string;
  candidateType?: string;
  suggestedSkillName?: string;
  suggestedExistingSkillName?: string;
  mergeTargetCandidateId?: string;
  sourceRuntime: CandidateReviewRuntime;
  evidenceRefs: string[];
  evidenceHashes: string[];
  recurrenceSignals: string[];
  frictionSignals: string[];
  expectedUserValue: string;
  leverageClass: CandidateReviewLeverageClass;
  whyHighImpact: string;
  whyNotSmallCleanup: string;
  confidence: CandidateReviewConfidence;
  riskTier: Phase2SkillCandidateRiskTier;
  shouldSurface: boolean;
  demotionReason?: string;
};

export type CandidateReviewRejectedProposalDiagnostic = {
  proposalKind: CandidateReviewProposalKind;
  title: string;
  reasonCodes: string[];
  sourceRuntime: CandidateReviewRuntime;
  evidenceRefs: string[];
};

export type CandidateReviewReport = {
  schemaVersion: typeof MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION;
  source: "model" | "skipped" | "rejected";
  enabled: boolean;
  modelId?: string;
  resolvedModelId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  elapsedMs: number;
  inputHash: string;
  outputHash?: string;
  validationStatus: "pass" | "reject";
  reasonCodes: string[];
  proposalCount: number;
  surfacedProposalCount: number;
  episodePacketHash?: string;
  episodePacketPath?: string;
  episodeTurnCount?: number;
  codexAdapterStatus?: CandidateReviewCodexAdapterReport["status"];
  sourceRuntimes?: CandidateReviewRuntime[];
  rejectedProposalDiagnostics?: CandidateReviewRejectedProposalDiagnostic[];
  packetQuality?: ProactivityReviewEpisodePacket["packetQuality"];
  sourceSelection?: ProactivityReviewEpisodePacket["sourceSelection"];
  promptPersisted: false;
  rawResponsePersisted: false;
  promptChars: number;
  outputChars?: number;
};

export type CandidateReviewModelOptions = {
  enabled?: boolean;
  executor?: JsonModelExecutor | null;
  modelId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  verbosity?: "low" | "medium";
  maxOutputTokens?: number;
};

export type ProactivityReviewEpisodePacketArtifact = {
  artifactRoot: string;
  jsonPath: string;
  markdownPath: string;
  packetHash: string;
  promptPersisted: false;
  rawResponsePersisted: false;
  rawFullTranscriptPersisted: false;
};

export type CandidateReviewRecentActivity = {
  ref: string;
  role: "user" | "assistant" | "system_event" | "tool_summary" | "card";
  kind?: CandidateReviewTriggerRef["kind"];
  boundedText: string;
  sourceRuntime?: CandidateReviewRuntime;
  recordedAt?: string;
};

export type CandidateReviewExistingSkill = {
  name: string;
  description?: string;
  source?: string;
};

export type CandidateReviewRecentProactivityItem = {
  id: string;
  kind: string;
  title: string;
  status: string;
  quality?: string;
};

export type CandidateReviewCodexAdapterReport = {
  status: "loaded" | "skipped" | "degraded";
  reasonCode?: string;
  sourceRoot?: string;
  entryCount: number;
  sessionRefs?: string[];
  commandSummaryCount?: number;
  validationFailureCount?: number;
  genericCommandSummaryCount?: number;
};

const MAX_REF_TEXT_LENGTH = 520;
const MAX_USER_EPISODE_TURN_LENGTH = 8_000;
const MAX_ASSISTANT_EPISODE_TURN_LENGTH = 12_000;
const MAX_SYSTEM_EPISODE_TURN_LENGTH = 1_200;
const MAX_EPISODE_TURNS = 48;
const MAX_TITLE_LENGTH = 96;
const MAX_PURPOSE_LENGTH = 320;
const MAX_NEXT_STEP_LENGTH = 360;
const MAX_EXPECTED_VALUE_LENGTH = 320;
const MAX_HIGH_IMPACT_REASON_LENGTH = 260;
const MAX_SMALL_CLEANUP_REASON_LENGTH = 220;
const DEFAULT_CODEX_SESSION_TAIL_BYTES = 20_000_000;
const DEFAULT_CODEX_SESSION_TAIL_LINES = 3_500;
const DEFAULT_CODEX_HISTORY_TAIL_BYTES = 1_500_000;
const DEFAULT_CODEX_HISTORY_TAIL_LINES = 80;
const PROHIBITED_PATTERNS = [
  /raw-prompt-marker/iu,
  /raw-transcript-marker/iu,
  /raw-tool-log-marker/iu,
  /secret-marker/iu,
  /private-phrase-marker/iu,
  /\bsk-[A-Za-z0-9_-]{12,}\b/u,
];
const GENERIC_COPY_PATTERN =
  /\b(turns a recent idea|without digging through the inbox|already recurring|build the bounded request with|it sets the default|question worth asking before|skill worth creating)\b/iu;
const CLIPPED_COPY_PATTERN =
  /(?:[,;:]|\b(?:and|or|with|from|to|for|because|whether|between|using|uses|use|into|against))\.?$/iu;
const FUSED_TRAILING_FRAGMENT_PATTERN = /\b(?:and|or|with|uses)[a-z]{1,8}[,.]?$/iu;
const DANGLING_TERMINAL_MODIFIER_PATTERN =
  /\b(?:available|blocking|bounded|complete|concrete|current|exact|existing|final|latest|missing|required|selected|specific|unresolved)\.?$/iu;

function hash(value: JsonLike | string): string {
  return typeof value === "string" ? sha256Text(value) : sha256JsonValue(value);
}

function unique(values: Array<string | undefined | null>): string[] {
  return uniqueSortedStrings(values.filter(Boolean) as string[]);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function looksLikeClippedVisibleCopy(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  return (
    CLIPPED_COPY_PATTERN.test(normalized) ||
    FUSED_TRAILING_FRAGMENT_PATTERN.test(normalized) ||
    DANGLING_TERMINAL_MODIFIER_PATTERN.test(normalized) ||
    /[a-z]{18,}[,.]?$/u.test(normalized)
  );
}

function boundedText(value: string | undefined, maxLength: number): string {
  const normalized = normalizeWhitespace(value ?? "");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function normalizeMultiline(value: string | undefined): string {
  return (value ?? "")
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trimEnd())
    .join("\n")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

function boundedMultilineText(value: string | undefined, maxLength: number): string {
  const normalized = normalizeMultiline(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function redactAndBound(value: string | undefined, maxLength: number): string {
  return boundedText(value, maxLength)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[redacted-secret]")
    .replace(/raw-prompt-marker/giu, "[redacted-marker]")
    .replace(/raw-transcript-marker/giu, "[redacted-marker]")
    .replace(/raw-tool-log-marker/giu, "[redacted-marker]")
    .replace(/secret-marker/giu, "[redacted-marker]")
    .replace(/private-phrase-marker/giu, "[redacted-marker]");
}

function redactAndBoundEpisodeText(value: string | undefined, maxLength: number): string {
  return boundedMultilineText(value, maxLength)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[redacted-secret]")
    .replace(/raw-prompt-marker/giu, "[redacted-marker]")
    .replace(/raw-transcript-marker/giu, "[redacted-marker]")
    .replace(/raw-tool-log-marker/giu, "[redacted-marker]")
    .replace(/secret-marker/giu, "[redacted-marker]")
    .replace(/private-phrase-marker/giu, "[redacted-marker]");
}

function duplicateTurnCount(turns: ProactivityReviewEpisodePacket["episodeTurns"]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const turn of turns) {
    const key = `${turn.sourceRuntime}:${turn.role}:${hash(turn.boundedText)}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
  }
  return duplicates;
}

function isGenericCommandSummary(value: string): boolean {
  return (
    /^Command\s+(?:function_call_output|write_stdin|exec_command|unknown)\s+unknown$/iu.test(
      value.trim(),
    ) || /^Command\s+unknown\b/iu.test(value.trim())
  );
}

function buildPacketQuality(input: {
  episodeTurns: ProactivityReviewEpisodePacket["episodeTurns"];
  codexStatus: CandidateReviewCodexAdapterReport["status"];
  commandSummaries: ProactivityReviewEpisodePacket["codexActivitySummary"]["commandSummaries"];
  validationFailures: ProactivityReviewEpisodePacket["codexActivitySummary"]["validationFailures"];
  touchedAreas: string[];
}): ProactivityReviewEpisodePacket["packetQuality"] {
  const openClawTurnCount = input.episodeTurns.filter(
    (turn) => turn.sourceRuntime === "openclaw",
  ).length;
  const codexTurnCount = input.episodeTurns.filter((turn) => turn.sourceRuntime === "codex").length;
  const assistantFinalCount = input.episodeTurns.filter((turn) => turn.role === "assistant").length;
  const duplicatedTurnCount = duplicateTurnCount(input.episodeTurns);
  const genericCommandSummaryCount = input.commandSummaries.filter((summary) =>
    isGenericCommandSummary(summary.boundedSummary),
  ).length;
  const reasonCodes = unique([
    input.episodeTurns.length === 0 ? "episode_turns_missing" : undefined,
    assistantFinalCount === 0 ? "assistant_finals_missing" : undefined,
    duplicatedTurnCount > 0 ? "duplicate_episode_turns_present" : undefined,
    input.codexStatus === "loaded" && codexTurnCount === 0
      ? "codex_loaded_without_turns"
      : undefined,
    input.codexStatus === "loaded" &&
    input.commandSummaries.length > 0 &&
    genericCommandSummaryCount === input.commandSummaries.length
      ? "codex_command_summaries_generic"
      : undefined,
    input.codexStatus === "loaded" &&
    codexTurnCount > 0 &&
    input.touchedAreas.length === 0 &&
    input.validationFailures.length === 0
      ? "codex_activity_low_signal"
      : undefined,
  ]);
  return {
    status: reasonCodes.length > 0 ? "degraded" : "pass",
    reasonCodes,
    contiguousWindowPresent: input.episodeTurns.length > 0,
    openClawTurnCount,
    codexTurnCount,
    duplicatedTurnCount,
    genericCommandSummaryCount,
    validationFailureSummaryCount: input.validationFailures.length,
    touchedAreaCount: input.touchedAreas.length,
    assistantFinalCount,
    rawFullTranscriptPersisted: false,
  };
}

function assertNoProhibitedContent(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`${label} contains prohibited raw/private content`);
    }
  }
}

function readModelErrorReasonCodes(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return ["model_error:unknown"];
  }
  return [`model_error:${error.name}`];
}

function classifyActivityKind(
  activity: CandidateReviewRecentActivity,
): CandidateReviewTriggerRef["kind"] {
  if (activity.kind) {
    return activity.kind;
  }
  if (activity.role === "tool_summary") {
    return "result_summary";
  }
  if (activity.role === "card") {
    return "card_summary";
  }
  if (activity.role === "assistant") {
    return "final";
  }
  if (activity.role === "user") {
    return "ask";
  }
  return "result_summary";
}

function deterministicEpisodeKey(params: {
  sessionKey: string;
  eventType: string;
  refs: string[];
  boundedSummary: string;
}): string {
  return hash({
    sessionKey: params.sessionKey,
    eventType: params.eventType,
    refs: params.refs.slice(-8).toSorted(),
    summaryKey: boundedText(params.boundedSummary.toLowerCase(), 160),
  }).slice(0, 24);
}

export function buildCandidateReviewPrefilterEvent(input: {
  eventType: CandidateReviewPrefilterEventType;
  runtime: Exclude<CandidateReviewRuntime, "mixed">;
  sessionKey: string;
  refs: string[];
  boundedSummary: string;
  createdAt?: string;
}): CandidateReviewPrefilterEvent {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const summary = redactAndBound(input.boundedSummary, 480);
  const refs = unique(input.refs).slice(-12);
  return {
    schemaVersion: CANDIDATE_REVIEW_PREFILTER_EVENT_SCHEMA_VERSION,
    eventId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "candidate_review_prefilter_event",
      targetId: input.sessionKey,
      seed: { createdAt, eventType: input.eventType, refs, summary },
    }),
    eventType: input.eventType,
    runtime: input.runtime,
    sessionKey: input.sessionKey,
    createdAt,
    refs,
    boundedSummary: summary,
  };
}

export function buildCandidateReviewPrefilterDecision(input: {
  event: CandidateReviewPrefilterEvent;
  recentEpisodeKeys?: string[];
}): CandidateReviewPrefilterDecision {
  assertNoProhibitedContent(input.event, "candidate review prefilter event");
  const reasonCodes: string[] = [];
  switch (input.event.eventType) {
    case "heartbeat_started":
      reasonCodes.push("heartbeat_review");
      break;
    case "session_boundary":
      reasonCodes.push("session_boundary");
      break;
    case "validation_or_proof_failed":
      reasonCodes.push("validation_or_proof_friction");
      break;
    case "card_quality_failed":
    case "card_dismissed_or_not_useful":
      reasonCodes.push("card_quality_failure");
      break;
    case "assistant_final_completed":
      reasonCodes.push("assistant_final_completed");
      break;
  }
  const episodeKey = deterministicEpisodeKey({
    sessionKey: input.event.sessionKey,
    eventType: input.event.eventType,
    refs: input.event.refs,
    boundedSummary: input.event.boundedSummary,
  });
  const cooldownHit = (input.recentEpisodeKeys ?? []).includes(episodeKey);
  const shouldAskModel = reasonCodes.length > 0 && !cooldownHit;
  return {
    shouldAskModel,
    reasonCodes: cooldownHit
      ? unique([...reasonCodes, "cooldown_episode_key"])
      : unique(reasonCodes),
    episodeKey,
  };
}

export function buildCandidateReviewTriggerPacket(input: {
  event: CandidateReviewPrefilterEvent;
  recentActivities: CandidateReviewRecentActivity[];
  recentCardSummaries?: CandidateReviewRecentProactivityItem[];
  recentActivitySignals?: string[];
}): CandidateReviewTriggerPacket {
  const recentRefs = input.recentActivities
    .slice(-8)
    .map((activity): CandidateReviewTriggerRef => {
      const bounded = redactAndBound(activity.boundedText, MAX_REF_TEXT_LENGTH);
      return {
        ref: activity.ref,
        role: activity.role,
        kind: classifyActivityKind(activity),
        boundedText: bounded,
        hash: hash({ ref: activity.ref, bounded }),
      };
    })
    .filter((entry) => entry.boundedText.length > 0);
  const packet: CandidateReviewTriggerPacket = {
    schemaVersion: CANDIDATE_REVIEW_TRIGGER_PACKET_SCHEMA_VERSION,
    event: input.event,
    recentRefs,
    recentCardSummaries: (input.recentCardSummaries ?? []).slice(-8).map((item) => ({
      id: item.id,
      kind: boundedText(item.kind, 48),
      title: redactAndBound(item.title, 120),
      status: boundedText(item.status, 48),
      quality: item.quality ? boundedText(item.quality, 80) : undefined,
    })),
    recentActivitySignals: (input.recentActivitySignals ?? [])
      .map((signal) => redactAndBound(signal, 140))
      .filter(Boolean)
      .slice(-10),
    safetyEnvelope: {
      noRawToolLogs: true,
      noSecrets: true,
      proposalOnly: true,
    },
  };
  assertNoProhibitedContent(packet, "candidate review trigger packet");
  return packet;
}

const TriggerDecisionOutputSchema = z
  .object({
    schemaVersion: z.literal(CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION),
    shouldRun: z.boolean(),
    reasonCodes: z
      .array(
        z.enum([
          "explicit_user_ask",
          "user_correction_or_critique",
          "related_turn_cluster",
          "recurring_work_pattern",
          "validation_or_proof_friction",
          "card_quality_failure",
          "session_boundary",
          "heartbeat_review",
        ]),
      )
      .max(8),
    confidence: z.enum(["low", "medium", "high"]),
    episodeWindow: z
      .object({
        startRef: z.string().trim().min(1).max(180),
        endRef: z.string().trim().min(1).max(180),
        includedRefs: z.array(z.string().trim().min(1).max(180)).min(0).max(12),
      })
      .strict(),
    reviewGoal: z.enum(["skills", "proactivity", "both", "none"]),
    whyWords: z.array(z.string().trim().min(1).max(32)).min(3).max(28),
  })
  .strict();

type TriggerDecisionModelOutput = z.infer<typeof TriggerDecisionOutputSchema>;

const TRIGGER_DECISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { enum: [CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION] },
    shouldRun: { type: "boolean" },
    reasonCodes: {
      type: "array",
      items: {
        enum: [
          "explicit_user_ask",
          "user_correction_or_critique",
          "related_turn_cluster",
          "recurring_work_pattern",
          "validation_or_proof_friction",
          "card_quality_failure",
          "session_boundary",
          "heartbeat_review",
        ],
      },
      maxItems: 8,
    },
    confidence: { enum: ["low", "medium", "high"] },
    episodeWindow: {
      type: "object",
      properties: {
        startRef: { type: "string", minLength: 1, maxLength: 180 },
        endRef: { type: "string", minLength: 1, maxLength: 180 },
        includedRefs: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 180 },
          maxItems: 12,
        },
      },
      required: ["startRef", "endRef", "includedRefs"],
      additionalProperties: false,
    },
    reviewGoal: { enum: ["skills", "proactivity", "both", "none"] },
    whyWords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 3,
      maxItems: 28,
    },
  },
  required: [
    "schemaVersion",
    "shouldRun",
    "reasonCodes",
    "confidence",
    "episodeWindow",
    "reviewGoal",
    "whyWords",
  ],
  additionalProperties: false,
} as const;

const TRIGGER_SYSTEM_PROMPT = [
  "You decide whether OpenClaw should spend a candidate-review model call.",
  "You receive a bounded recent-work packet, not canonical truth.",
  "Return strict JSON only.",
  "Decide whether there is enough signal to review for skill candidates, proactive plans, both, or none.",
  "Use only provided refs in episodeWindow.includedRefs.",
  "Do not execute actions, install skills, mutate memory, or infer durable truth.",
  "Choose shouldRun=false when the recent activity is unrelated, trivial, too vague, or only generic chatter.",
].join("\n");

function textFromWords(words: string[] | null | undefined, maxLength: number): string {
  return boundedText((words ?? []).join(" "), maxLength);
}

function triggerDecisionFromOutput(
  output: TriggerDecisionModelOutput,
): CandidateReviewTriggerDecision {
  return {
    schemaVersion: CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION,
    shouldRun: output.shouldRun,
    reasonCodes: output.reasonCodes,
    confidence: output.confidence,
    episodeWindow: output.episodeWindow,
    reviewGoal: output.reviewGoal,
    why: textFromWords(output.whyWords, 220),
  };
}

function validateTriggerDecision(
  decision: CandidateReviewTriggerDecision,
  packet: CandidateReviewTriggerPacket,
): string[] {
  const allowedRefs = new Set([
    ...packet.recentRefs.map((entry) => entry.ref),
    ...packet.event.refs,
    ...packet.recentCardSummaries.map((entry) => `card://${entry.id}`),
  ]);
  const reasons: string[] = [];
  if (decision.reviewGoal === "none" && decision.shouldRun) {
    reasons.push("review_goal_none_cannot_run");
  }
  for (const ref of decision.episodeWindow.includedRefs) {
    if (!allowedRefs.has(ref)) {
      reasons.push("included_ref_not_allowed");
      break;
    }
  }
  if (
    decision.shouldRun &&
    decision.confidence === "low" &&
    !decision.reasonCodes.some((reason) =>
      [
        "explicit_user_ask",
        "heartbeat_review",
        "session_boundary",
        "validation_or_proof_friction",
        "card_quality_failure",
      ].includes(reason),
    )
  ) {
    reasons.push("low_confidence_without_explicit_reason");
  }
  if (decision.episodeWindow.includedRefs.length > 12) {
    reasons.push("episode_window_too_large");
  }
  return unique(reasons);
}

export async function evaluateCandidateReviewTrigger(
  packet: CandidateReviewTriggerPacket,
  options: CandidateReviewModelOptions = {},
): Promise<{
  decision: CandidateReviewTriggerDecision;
  report: CandidateReviewTriggerReport;
}> {
  const startedAt = Date.now();
  assertNoProhibitedContent(packet, "candidate review trigger packet");
  const inputHash = hash(packet);
  const enabled = options.enabled === true && Boolean(options.executor);
  const defaultDecision: CandidateReviewTriggerDecision = {
    schemaVersion: CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION,
    shouldRun: false,
    reasonCodes: [],
    confidence: "low",
    episodeWindow: {
      startRef: packet.recentRefs[0]?.ref ?? packet.event.refs[0] ?? packet.event.eventId,
      endRef: packet.recentRefs.at(-1)?.ref ?? packet.event.refs.at(-1) ?? packet.event.eventId,
      includedRefs: [],
    },
    reviewGoal: "none",
    why: "No accepted trigger decision was produced.",
  };
  if (!enabled || !options.executor) {
    return {
      decision: defaultDecision,
      report: {
        schemaVersion: CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION,
        enabled,
        source: "skipped",
        reasoningEffort: options.reasoningEffort ?? "low",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["trigger_model_disabled"],
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: 0,
      },
    };
  }
  const modelId = options.modelId?.trim() || DEFAULT_CANDIDATE_TRIGGER_MODEL_ID;
  const userPrompt = [
    "Return one JSON object matching the schema.",
    "Evaluate this bounded OpenClaw/Codex recent-work packet:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "candidate_review_trigger",
        contractVersion: "phase2-candidate-review-trigger-v1",
        modelId,
      },
      systemPrompt: TRIGGER_SYSTEM_PROMPT,
      userPrompt,
      responseFormat: "json",
      responseOptions: {
        maxOutputTokens: options.maxOutputTokens ?? 700,
        reasoningEffort: options.reasoningEffort ?? "low",
        verbosity: options.verbosity ?? "low",
        transport: {
          type: "json_schema",
          name: "candidate_review_trigger_decision",
          strict: true,
          schema: TRIGGER_DECISION_JSON_SCHEMA,
        },
      },
    });
    const output = parseJsonModelOutput(
      response,
      {
        contractName: "candidate_review_trigger",
        contractVersion: "phase2-candidate-review-trigger-v1",
        modelId,
      },
      TriggerDecisionOutputSchema,
    );
    const decision = triggerDecisionFromOutput(output);
    const validationReasons = validateTriggerDecision(decision, packet);
    const accepted = validationReasons.length === 0;
    return {
      decision: accepted ? decision : { ...decision, shouldRun: false, reviewGoal: "none" },
      report: {
        schemaVersion: CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION,
        enabled: true,
        source: accepted ? "model" : "rejected",
        modelId,
        resolvedModelId: response.resolvedModelId,
        reasoningEffort: options.reasoningEffort ?? "low",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        outputHash: hash(output),
        validationStatus: accepted ? "pass" : "reject",
        reasonCodes: validationReasons,
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
        outputChars: response.outputText.length,
      },
    };
  } catch (error) {
    return {
      decision: defaultDecision,
      report: {
        schemaVersion: CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION,
        enabled: true,
        source: "rejected",
        modelId,
        reasoningEffort: options.reasoningEffort ?? "low",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["trigger_model_failed", ...readModelErrorReasonCodes(error)],
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
      },
    };
  }
}

export function buildProactivityReviewEpisodePacket(input: {
  triggerPacket: CandidateReviewTriggerPacket;
  triggerDecision: CandidateReviewTriggerDecision;
  recentActivities: CandidateReviewRecentActivity[];
  codexAdapterReport?: CandidateReviewCodexAdapterReport | null;
  loadedSkills?: CandidateReviewExistingSkill[];
  recentProactivityItems?: CandidateReviewRecentProactivityItem[];
  recentCandidateIds?: string[];
  possibleDuplicateTitles?: string[];
  rejectedOrDemotedSummary?: string[];
  activeMilestone?: string;
  activeDocsOrBranches?: string[];
  sourceSelection?: ProactivityReviewEpisodePacket["sourceSelection"];
}): ProactivityReviewEpisodePacket {
  const narrativeActivities = input.recentActivities.filter(
    (activity) => activity.role === "user" || activity.role === "assistant",
  );
  const selectedNarrativeActivities = narrativeActivities.slice(-MAX_EPISODE_TURNS);
  const selectedNarrativeRefs = new Set(
    selectedNarrativeActivities.map((activity) => activity.ref),
  );
  const selectedToolRefs = new Set(
    input.recentActivities
      .filter((activity) => activity.role === "tool_summary")
      .slice(-12)
      .map((activity) => activity.ref),
  );
  const selectedActivities = input.recentActivities.filter(
    (activity) => selectedNarrativeRefs.has(activity.ref) || selectedToolRefs.has(activity.ref),
  );
  const episodeTurns: ProactivityReviewEpisodePacket["episodeTurns"] = selectedActivities
    .filter((activity) => activity.role === "user" || activity.role === "assistant")
    .map((activity) => {
      const maxChars =
        activity.role === "assistant"
          ? MAX_ASSISTANT_EPISODE_TURN_LENGTH
          : MAX_USER_EPISODE_TURN_LENGTH;
      const bounded = redactAndBoundEpisodeText(activity.boundedText, maxChars);
      return {
        role: activity.role as "user" | "assistant",
        sourceRuntime: activity.sourceRuntime === "codex" ? "codex" : "openclaw",
        ref: activity.ref,
        boundedText: bounded,
        hash: hash({ ref: activity.ref, bounded }),
        excerptPolicy: {
          maxChars,
          redacted: bounded !== boundedMultilineText(activity.boundedText, maxChars),
          rawTranscriptPersisted: false,
        },
      };
    });
  const recentUserTurns = selectedActivities
    .filter((activity) => activity.role === "user")
    .map((activity) => redactAndBound(activity.boundedText, 180))
    .slice(-4);
  const codexActivities = selectedActivities.filter(
    (activity) => activity.sourceRuntime === "codex",
  );
  const codexCommandActivities = codexActivities.filter(
    (activity) => activity.role === "tool_summary",
  );
  const codexValidationFailures = codexCommandActivities.filter((activity) =>
    /failed|failure|error|exit\s+code|non[-\s]?zero/iu.test(activity.boundedText),
  );
  const codexSessionRefs = unique(
    codexActivities.map((activity) => activity.ref.split("#")[0]).filter(Boolean),
  );
  const commandSummaries = codexCommandActivities.slice(-8).map((activity) => {
    const bounded = redactAndBound(activity.boundedText, MAX_SYSTEM_EPISODE_TURN_LENGTH);
    const commandFamily = bounded.match(/^Command\s+([^\s]+)/iu)?.[1] ?? "unknown";
    const status: "passed" | "failed" | "unknown" =
      /\bfailed\b|\bfailure\b|\berror\b|\bexit\s+code\b|\bnon[-\s]?zero\b/iu.test(bounded)
        ? "failed"
        : /\bpassed\b|\bsucceeded\b|\bok\b/iu.test(bounded)
          ? "passed"
          : "unknown";
    return {
      ref: activity.ref,
      commandFamily: boundedText(commandFamily, 80),
      status,
      failureClass: status === "failed" ? "validation_or_command_failure" : undefined,
      boundedSummary: bounded,
      hash: hash({ ref: activity.ref, bounded }),
    };
  });
  const validationFailures = codexValidationFailures.slice(-8).map((activity) => {
    const bounded = redactAndBound(activity.boundedText, MAX_SYSTEM_EPISODE_TURN_LENGTH);
    return {
      ref: activity.ref,
      lane: bounded.match(/^Command\s+([^\s]+)/iu)?.[1] ?? "codex",
      boundedSummary: bounded,
      hash: hash({ ref: activity.ref, bounded }),
    };
  });
  const touchedAreas = unique(
    codexActivities.flatMap((activity) =>
      [
        ...activity.boundedText.matchAll(
          /\b(?:src|docs|ui|extensions|scripts|ops)\/[^\s'"`),:]+/giu,
        ),
      ]
        .map((match) => boundedText(match[0], 120))
        .slice(0, 4),
    ),
  ).slice(0, 12);
  const outcomeSummaries = codexActivities
    .filter((activity) => activity.role === "assistant")
    .map((activity) => redactAndBound(activity.boundedText, 220))
    .slice(-6);
  const packetQuality = buildPacketQuality({
    episodeTurns,
    codexStatus:
      input.codexAdapterReport?.status ?? (codexActivities.length > 0 ? "loaded" : "skipped"),
    commandSummaries,
    validationFailures,
    touchedAreas,
  });
  const runtimeSet = new Set(
    selectedActivities.map((activity) => activity.sourceRuntime).filter(Boolean),
  );
  const runtime: CandidateReviewRuntime =
    runtimeSet.size > 1
      ? "mixed"
      : runtimeSet.has("codex")
        ? "codex"
        : input.triggerPacket.event.runtime;
  const packet: ProactivityReviewEpisodePacket = {
    schemaVersion: PROACTIVITY_REVIEW_EPISODE_PACKET_SCHEMA_VERSION,
    reviewGoal: "find_few_high_value_candidates",
    sessionWindow: {
      runtime,
      sessionKey: input.triggerPacket.event.sessionKey,
      startRef:
        episodeTurns[0]?.ref ??
        input.triggerDecision.episodeWindow.startRef ??
        input.triggerPacket.event.refs[0] ??
        input.triggerPacket.event.eventId,
      endRef:
        episodeTurns.at(-1)?.ref ??
        input.triggerDecision.episodeWindow.endRef ??
        input.triggerPacket.event.refs.at(-1) ??
        input.triggerPacket.event.eventId,
      turnCount: episodeTurns.length,
      timeWindowLabel: `${input.triggerDecision.episodeWindow.startRef}..${input.triggerDecision.episodeWindow.endRef}`,
    },
    episodeTurns,
    userIntentArc: {
      currentObjective:
        recentUserTurns.at(-1) ??
        redactAndBound(input.triggerPacket.event.boundedSummary, 180) ??
        "Review recent work for useful skill and proactive-plan candidates.",
      recentConcerns: [],
      explicitAsks: recentUserTurns,
      decisionPressure: unique([
        input.triggerDecision.why,
        input.recentProactivityItems?.some((item) => item.quality?.includes("demote"))
          ? "Recent card-quality demotion suggests presentation or candidate-discovery repair value."
          : undefined,
      ]).slice(0, 4),
    },
    codexActivitySummary: {
      status:
        input.codexAdapterReport?.status ?? (codexActivities.length > 0 ? "loaded" : "skipped"),
      reasonCode: input.codexAdapterReport?.reasonCode,
      sessionRefs: unique([
        ...(input.codexAdapterReport?.sessionRefs ?? []),
        ...codexSessionRefs,
      ]).slice(-12),
      commandSummaries,
      validationFailures,
      touchedAreas,
      outcomeSummaries,
    },
    packetQuality,
    observedWorkPatterns: [
      {
        summary: redactAndBound(input.triggerPacket.event.boundedSummary, 220),
        recurrenceEvidence: input.triggerPacket.recentActivitySignals.slice(0, 4),
        frictionSignals: commandSummaries
          .filter((summary) => summary.status === "failed")
          .map((summary) => summary.boundedSummary)
          .slice(0, 4),
        successSignals: selectedActivities
          .filter((activity) => activity.role === "assistant")
          .map((activity) => redactAndBound(activity.boundedText, 140))
          .slice(0, 4),
      },
    ],
    existingContext: {
      loadedSkills: (input.loadedSkills ?? []).slice(0, 30).map((skill) => ({
        name: boundedText(skill.name, 80),
        description: skill.description ? boundedText(skill.description, 160) : undefined,
        source: boundedText(skill.source ?? "unknown", 180),
      })),
      activeMilestone: boundedText(
        input.activeMilestone ?? "pre-Milestone-4 candidate discovery",
        160,
      ),
      activeDocsOrBranches: (input.activeDocsOrBranches ?? [])
        .map((entry) => boundedText(entry, 180))
        .slice(0, 12),
      recentProactivityItems: (input.recentProactivityItems ?? []).slice(-10).map((item) => ({
        id: item.id,
        kind: boundedText(item.kind, 64),
        title: redactAndBound(item.title, 140),
        status: boundedText(item.status, 64),
        quality: item.quality ? boundedText(item.quality, 100) : undefined,
      })),
    },
    candidateLedgerContext: {
      recentCandidateIds: unique(input.recentCandidateIds ?? []).slice(-12),
      possibleDuplicateTitles: (input.possibleDuplicateTitles ?? [])
        .map((title) => redactAndBound(title, 120))
        .slice(-10),
      rejectedOrDemotedSummary: (input.rejectedOrDemotedSummary ?? [])
        .map((summary) => redactAndBound(summary, 160))
        .slice(-10),
    },
    reviewPolicy: {
      maxSurfaceCandidates: 3,
      preferNoCandidateOverWeakCandidate: true,
      requireRepeatabilityOrLargeAvoidedCost: true,
      rejectTinyCleanupCandidates: true,
      proposalOnly: true,
    },
    safetyEnvelope: {
      proposalOnly: true,
      noActionExecution: true,
      noSkillInstallOrPromotion: true,
      noCanonicalMemoryTruth: true,
      noRawToolLogs: true,
      rawFullTranscriptPersisted: false,
    },
    sourceSelection: input.sourceSelection,
  };
  assertNoProhibitedContent(packet, "proactivity review episode packet");
  return packet;
}

function workEpisodeOutcomePackSummary(pack: WorkEpisodeOutcomePack): string {
  const lines = [
    `Work episode outcome pack: ${pack.episodeId}`,
    `Runtime: ${pack.runtime}`,
    `Outcome status: ${pack.outcomeStatus}`,
    pack.workType ? `Work type: ${pack.workType}` : undefined,
    pack.primarySystemArea ? `Primary system area: ${pack.primarySystemArea}` : undefined,
    pack.completedObjective ? `Completed objective: ${pack.completedObjective}` : undefined,
    pack.recoveryRecommendation
      ? `Recovery recommendation: ${pack.recoveryRecommendation}`
      : undefined,
    `User goal: ${pack.userGoal}`,
    `Work summary: ${pack.workSummary}`,
    `Final outcome: ${pack.finalOutcome}`,
    pack.filesTouched.length > 0
      ? `Files touched: ${pack.filesTouched
          .map((file) => `${file.path}${file.summary ? ` - ${file.summary}` : ""}`)
          .join("; ")}`
      : undefined,
    pack.testsRun.length > 0
      ? `Tests run: ${pack.testsRun
          .map((test) => `${test.status}: ${test.command} - ${test.summary}`)
          .join("; ")}`
      : undefined,
    pack.failuresAndFixes.length > 0
      ? `Failures and fixes: ${pack.failuresAndFixes
          .map(
            (entry) => `${entry.status}: ${entry.failure}${entry.fix ? ` Fix: ${entry.fix}` : ""}`,
          )
          .join("; ")}`
      : undefined,
    pack.unresolvedQuestions.length > 0
      ? `Unresolved questions: ${pack.unresolvedQuestions.join("; ")}`
      : undefined,
    pack.followUpCandidates.length > 0
      ? `Follow-up candidates: ${pack.followUpCandidates
          .map((candidate) => `${candidate.title} - ${candidate.rationale}`)
          .join("; ")}`
      : undefined,
    pack.skillImprovementEvidence.length > 0
      ? `Skill improvement evidence: ${pack.skillImprovementEvidence
          .map(
            (entry) =>
              `${entry.workflowName ?? "workflow"} - ${entry.evidence}${
                entry.suggestedDirection ? ` Direction: ${entry.suggestedDirection}` : ""
              }`,
          )
          .join("; ")}`
      : undefined,
    "Safety: no raw logs, no raw transcripts, no provider prompts, no hidden reasoning, no secrets.",
  ];
  return redactAndBoundEpisodeText(lines.filter(Boolean).join("\n"), MAX_USER_EPISODE_TURN_LENGTH);
}

function workEpisodeOutcomePackToolSummaries(
  pack: WorkEpisodeOutcomePack,
): CandidateReviewRecentActivity[] {
  return [
    ...pack.testsRun.map((test, index) => ({
      ref: `work-episode://${pack.episodeId}/test/${index}`,
      role: "tool_summary" as const,
      kind: test.status === "failed" ? ("failure_summary" as const) : ("result_summary" as const),
      boundedText: redactAndBound(
        `Command ${test.command} ${test.status}. ${test.summary}`,
        MAX_SYSTEM_EPISODE_TURN_LENGTH,
      ),
      sourceRuntime: pack.runtime === "openclaw" ? ("openclaw" as const) : ("codex" as const),
      recordedAt: pack.completedAt,
    })),
    ...pack.failuresAndFixes.map((entry, index) => ({
      ref: `work-episode://${pack.episodeId}/failure/${index}`,
      role: "tool_summary" as const,
      kind: entry.status === "fixed" ? ("result_summary" as const) : ("failure_summary" as const),
      boundedText: redactAndBound(
        `Failure ${entry.status}: ${entry.failure}${entry.fix ? ` Fix: ${entry.fix}` : ""}`,
        MAX_SYSTEM_EPISODE_TURN_LENGTH,
      ),
      sourceRuntime: pack.runtime === "openclaw" ? ("openclaw" as const) : ("codex" as const),
      recordedAt: pack.completedAt,
    })),
  ];
}

export function buildProactivityReviewEpisodePacketFromOutcomePack(input: {
  outcomePack: WorkEpisodeOutcomePack;
  loadedSkills?: CandidateReviewExistingSkill[];
  recentProactivityItems?: CandidateReviewRecentProactivityItem[];
  recentCandidateIds?: string[];
  possibleDuplicateTitles?: string[];
  rejectedOrDemotedSummary?: string[];
  activeMilestone?: string;
  activeDocsOrBranches?: string[];
}): ProactivityReviewEpisodePacket {
  const pack = input.outcomePack;
  const runtime: Exclude<CandidateReviewRuntime, "mixed"> =
    pack.runtime === "openclaw" ? "openclaw" : "codex";
  const summaryRef = `work-episode://${pack.episodeId}/summary`;
  const recentActivities: CandidateReviewRecentActivity[] = [
    {
      ref: summaryRef,
      role: "user",
      kind: "ask",
      boundedText: workEpisodeOutcomePackSummary(pack),
      sourceRuntime: runtime,
      recordedAt: pack.completedAt,
    },
    ...workEpisodeOutcomePackToolSummaries(pack),
  ];
  const event = buildCandidateReviewPrefilterEvent({
    eventType: "session_boundary",
    runtime,
    sessionKey: pack.sessionKey ?? pack.projectId,
    refs: [summaryRef, ...pack.sourceRefs].slice(-12),
    boundedSummary: workEpisodeOutcomePackSummary(pack),
    createdAt: pack.completedAt,
  });
  const triggerPacket = buildCandidateReviewTriggerPacket({
    event,
    recentActivities,
    recentCardSummaries: input.recentProactivityItems,
    recentActivitySignals: [
      "primary_input:work_episode_outcome_pack",
      `outcome_pack_runtime:${pack.runtime}`,
      `files_touched:${pack.filesTouched.length}`,
      `tests_run:${pack.testsRun.length}`,
      `failures_and_fixes:${pack.failuresAndFixes.length}`,
      `follow_up_candidates:${pack.followUpCandidates.length}`,
      `skill_improvement_evidence:${pack.skillImprovementEvidence.length}`,
    ],
  });
  const triggerDecision: CandidateReviewTriggerDecision = {
    schemaVersion: CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION,
    shouldRun: true,
    reasonCodes: ["session_boundary"],
    confidence: "high",
    episodeWindow: {
      startRef: summaryRef,
      endRef: summaryRef,
      includedRefs: [summaryRef, ...pack.sourceRefs].slice(-12),
    },
    reviewGoal: "both",
    why: "Structured work episode outcome pack is available as primary candidate-review input.",
  };
  const packet = buildProactivityReviewEpisodePacket({
    triggerPacket,
    triggerDecision,
    recentActivities,
    codexAdapterReport: {
      status: pack.runtime === "openclaw" ? "skipped" : "loaded",
      reasonCode: pack.runtime === "openclaw" ? "outcome_pack_openclaw_runtime" : undefined,
      entryCount: recentActivities.length,
      sessionRefs: pack.sourceRefs.slice(0, 12),
      commandSummaryCount: pack.testsRun.length,
      validationFailureCount: pack.failuresAndFixes.filter((entry) => entry.status !== "fixed")
        .length,
      genericCommandSummaryCount: 0,
    },
    loadedSkills: input.loadedSkills,
    recentProactivityItems: input.recentProactivityItems,
    recentCandidateIds: input.recentCandidateIds,
    possibleDuplicateTitles: input.possibleDuplicateTitles,
    rejectedOrDemotedSummary: input.rejectedOrDemotedSummary,
    activeMilestone: input.activeMilestone ?? "pre-Milestone-4 work episode outcome pack review",
    activeDocsOrBranches: input.activeDocsOrBranches ?? [],
    sourceSelection: {
      primaryInputKind: "work_episode_outcome_pack",
      primaryRuntime: pack.runtime,
      selectedSourceRefs: [summaryRef, ...pack.sourceRefs].slice(0, 24),
      droppedSourceCounts: {},
      outcomePackId: pack.episodeId,
    },
  });
  const reasonCodes = packet.packetQuality.reasonCodes.filter(
    (reasonCode) => reasonCode !== "assistant_finals_missing",
  );
  return {
    ...packet,
    packetQuality: {
      ...packet.packetQuality,
      status: reasonCodes.length > 0 ? "degraded" : "pass",
      reasonCodes,
    },
  };
}

const CandidateProposalOutputSchema = z
  .object({
    schemaVersion: z.literal(CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION),
    proposals: z
      .array(
        z
          .object({
            proposalKind: z.enum([
              "proactive_plan",
              "new_skill_candidate",
              "existing_skill_enhancement",
              "merge_or_extend_candidate",
              "demote_existing_candidate",
            ]),
            title: z.string().trim().min(4).max(MAX_TITLE_LENGTH),
            purpose: z.string().trim().min(16).max(MAX_PURPOSE_LENGTH),
            recommendedNextStep: z.string().trim().min(12).max(MAX_NEXT_STEP_LENGTH),
            expectedUserValue: z.string().trim().min(12).max(MAX_EXPECTED_VALUE_LENGTH),
            leverageClass: z.enum([
              "large_repeated_cost",
              "stability_risk",
              "workflow_acceleration",
              "strategic_unblock",
            ]),
            whyHighImpact: z.string().trim().min(16).max(MAX_HIGH_IMPACT_REASON_LENGTH),
            whyNotSmallCleanup: z.string().trim().min(16).max(MAX_SMALL_CLEANUP_REASON_LENGTH),
            suggestedSkillName: z.string().trim().min(1).max(80).nullable(),
            suggestedExistingSkillName: z.string().trim().min(1).max(80).nullable(),
            mergeTargetCandidateId: z.string().trim().min(1).max(160).nullable(),
            sourceRuntime: z.enum(["openclaw", "codex", "mixed"]),
            evidenceRefs: z.array(z.string().trim().min(1).max(180)).min(1).max(8),
            recurrenceSignals: z.array(z.string().trim().min(1).max(180)).max(6),
            frictionSignals: z.array(z.string().trim().min(1).max(180)).max(6),
            confidence: z.enum(["low", "medium", "high"]),
            riskTier: z.enum(["low", "medium", "high", "blocked"]),
            shouldSurface: z.boolean(),
            demotionReason: z.string().trim().min(1).max(120).nullable(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();

type CandidateProposalModelOutput = z.infer<typeof CandidateProposalOutputSchema>;

const CANDIDATE_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { enum: [CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION] },
    proposals: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          proposalKind: {
            enum: [
              "proactive_plan",
              "new_skill_candidate",
              "existing_skill_enhancement",
              "merge_or_extend_candidate",
              "demote_existing_candidate",
            ],
          },
          title: { type: "string", minLength: 4, maxLength: MAX_TITLE_LENGTH },
          purpose: { type: "string", minLength: 16, maxLength: MAX_PURPOSE_LENGTH },
          recommendedNextStep: {
            type: "string",
            minLength: 12,
            maxLength: MAX_NEXT_STEP_LENGTH,
          },
          expectedUserValue: {
            type: "string",
            minLength: 12,
            maxLength: MAX_EXPECTED_VALUE_LENGTH,
          },
          leverageClass: {
            enum: [
              "large_repeated_cost",
              "stability_risk",
              "workflow_acceleration",
              "strategic_unblock",
            ],
          },
          whyHighImpact: {
            type: "string",
            minLength: 16,
            maxLength: MAX_HIGH_IMPACT_REASON_LENGTH,
          },
          whyNotSmallCleanup: {
            type: "string",
            minLength: 16,
            maxLength: MAX_SMALL_CLEANUP_REASON_LENGTH,
          },
          suggestedSkillName: { type: ["string", "null"], maxLength: 80 },
          suggestedExistingSkillName: { type: ["string", "null"], maxLength: 80 },
          mergeTargetCandidateId: { type: ["string", "null"], maxLength: 160 },
          sourceRuntime: { enum: ["openclaw", "codex", "mixed"] },
          evidenceRefs: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 180 },
            minItems: 1,
            maxItems: 8,
          },
          recurrenceSignals: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 180 },
            maxItems: 6,
          },
          frictionSignals: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 180 },
            maxItems: 6,
          },
          confidence: { enum: ["low", "medium", "high"] },
          riskTier: { enum: ["low", "medium", "high", "blocked"] },
          shouldSurface: { type: "boolean" },
          demotionReason: { type: ["string", "null"], maxLength: 120 },
        },
        required: [
          "proposalKind",
          "title",
          "purpose",
          "recommendedNextStep",
          "expectedUserValue",
          "leverageClass",
          "whyHighImpact",
          "whyNotSmallCleanup",
          "suggestedSkillName",
          "suggestedExistingSkillName",
          "mergeTargetCandidateId",
          "sourceRuntime",
          "evidenceRefs",
          "recurrenceSignals",
          "frictionSignals",
          "confidence",
          "riskTier",
          "shouldSurface",
          "demotionReason",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["schemaVersion", "proposals"],
  additionalProperties: false,
} as const;

const CANDIDATE_REVIEW_SYSTEM_PROMPT = [
  "You review a bounded high-context OpenClaw/Codex recent-work episode for useful candidate proposals.",
  "Return strict JSON only.",
  "Return 0-3 proposals maximum; prefer no proposal over a weak proposal.",
  "Default to at most one sharp proactive plan and at most one sharp skill or skill enhancement.",
  "Use a third proposal only when it is an explicit merge/demotion or an independently exceptional opportunity.",
  "Treat the recent episode as one coherent unit and prioritize what matters to the user's current objective.",
  "Identify only high-impact proactive plans, new skill candidates, existing skill enhancements, merge candidates, or demotions.",
  "Require repeatability, large avoided cost, stability risk, workflow acceleration, or strategic unblock value.",
  "Reject tiny cleanup candidates, one-off local optimizations, vague checklists, clipped source fragments, and unclear expected value.",
  "Repeated wording, repeated titles, or repeated requests are not sufficient evidence by themselves; surface only if there is a concrete implementation target or reusable workflow.",
  "Demote vague repeated-request cards that do not name a specific next implementation target, artifact, or quality gate.",
  "When the primary input is a work episode outcome pack, do not propose restating the completedObjective or finalOutcome as future work.",
  "Prefer downstream follow-ups, recovery work, unresolved questions, or reusable workflow improvements over repeating work that the pack says is already complete.",
  "If the only candidate would be do the thing that was just completed, demote it instead of surfacing it.",
  "For proactive_plan proposals, name the concrete next implementation target and the evidence that this plan is ready to queue.",
  "For new skill candidates, prefer bounded reusable capabilities over broad activity labels.",
  "A new skill candidate must have a clear trigger condition, repeatable inputs, a reusable procedure or checklist, a concrete output artifact, validation criteria, and evidence that it reduces repeated work across future sessions.",
  "Do not label a broad review activity as a new skill unless it can become an executable SKILL.md-style workflow.",
  "If the opportunity is mainly run this check before release or verify this system state, prefer proactive_plan or existing_skill_enhancement unless the reusable procedure is clearly skill-shaped.",
  "Existing skill enhancement is also a legitimate surfaced card when the evidence points to improving an already-known workflow, prompt, proof, validation checklist, or candidate-review method.",
  "For new_skill_candidate or existing_skill_enhancement proposals, explain why it is a skill or enhancement rather than a proactive plan, what it would do step by step, what inputs it expects, what outputs it produces, and what quality gate proves it worked.",
  "Prefer precise operational titles over broad source-context titles; for example, use Candidate Discovery QA Gate, Model-Owned Memory Lane Validation Skill, or Proactivity Candidate Review Release Gate rather than High Context Episode Review Skill.",
  "Use proposalKind existing_skill_enhancement only when suggestedExistingSkillName is an exact loaded skill name from existingContext.loadedSkills.",
  "If no exact loaded skill match exists, use new_skill_candidate, proactive_plan, merge_or_extend_candidate, or demote_existing_candidate instead.",
  "Use merge_or_extend_candidate only when existingContext.recentProactivityItems contains a specific existing plan or skill candidate that your proposal should merge into or extend.",
  "For merge_or_extend_candidate, set mergeTargetCandidateId to that exact existing item id and do not create a new surfaced card.",
  "Do not infer fuzzy merge as fact; related items can remain distinct.",
  "Do not produce generic candidates.",
  "Titles must name a capability, decision, or outcome in readable human text.",
  "Titles must use readable Title Case, not sentence-case fragments. Purpose, next step, expected value, and rationale fields should use normal sentence capitalization.",
  "Avoid hyphen-separated title fragments unless the hyphen is part of a normal term.",
  "Titles must not be slugs, ids, normalized keys, hyphen-joined fragments, or concatenated source phrases.",
  "Use normal English word spacing in title, purpose, next step, expected value, and rationale fields; never concatenate words together.",
  "If a field is too long, shorten the wording; do not remove spaces between words to satisfy length limits.",
  "Purpose, next step, expected value, and rationale fields must be complete readable sentences. Shorten by removing detail, not by cutting off the final phrase.",
  "Do not end title, purpose, or next step with a comma, colon, semicolon, dangling connector, or dangling modifier such as missing, selected, specific, latest, or current.",
  "Use suggestedSkillName for slugs; never put slugs in title.",
  "Purposes must explain what the item does or unlocks.",
  "Next steps must be actionable.",
  "Output proposals only. Do not execute actions, install skills, promote skills, send messages, mutate files, or write canonical memory.",
  "Use only evidence refs from the packet.",
].join("\n");

function evidenceRefSet(packet: ProactivityReviewEpisodePacket): Set<string> {
  return new Set([
    ...packet.episodeTurns.map((entry) => entry.ref),
    ...packet.codexActivitySummary.commandSummaries.map((entry) => entry.ref),
    ...packet.codexActivitySummary.validationFailures.map((entry) => entry.ref),
    ...packet.existingContext.recentProactivityItems.map((item) => `proactivity://${item.id}`),
  ]);
}

function slugFromString(value: string | null | undefined): string | undefined {
  const slug = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
  return slug || undefined;
}

function validateProposal(
  proposal: CandidateReviewProposal,
  allowedRefs: Set<string>,
  loadedSkillNames: Set<string>,
): string[] {
  const reasons: string[] = [];
  const primary = `${proposal.title}\n${proposal.purpose}\n${proposal.recommendedNextStep}`;
  const readabilityFields = [
    proposal.title,
    proposal.purpose,
    proposal.recommendedNextStep,
    proposal.expectedUserValue,
    proposal.whyHighImpact,
    proposal.whyNotSmallCleanup,
  ];
  if (proposal.title.length > MAX_TITLE_LENGTH) {
    reasons.push("title_too_long");
  }
  if (proposal.purpose.length > MAX_PURPOSE_LENGTH) {
    reasons.push("purpose_too_long");
  }
  if (proposal.recommendedNextStep.length > MAX_NEXT_STEP_LENGTH) {
    reasons.push("next_step_too_long");
  }
  if (GENERIC_COPY_PATTERN.test(primary)) {
    reasons.push("generic_or_source_fragment_copy");
  }
  if (readabilityFields.some((field) => /[a-z]{32,}/u.test(field))) {
    reasons.push("candidate_copy_lacks_word_spacing");
  }
  if (
    [proposal.purpose, proposal.recommendedNextStep, proposal.expectedUserValue].some(
      looksLikeClippedVisibleCopy,
    )
  ) {
    reasons.push("clipped_candidate_copy");
  }
  if (proposal.recommendedNextStep.toLowerCase().includes(proposal.title.toLowerCase())) {
    reasons.push("next_step_repeats_title");
  }
  if (proposal.evidenceRefs.some((ref) => !allowedRefs.has(ref))) {
    reasons.push("evidence_ref_not_allowed");
  }
  if (proposal.shouldSurface && proposal.confidence === "low") {
    reasons.push("low_confidence_surface_rejected");
  }
  if (proposal.riskTier === "blocked" && proposal.shouldSurface) {
    reasons.push("blocked_risk_surface_rejected");
  }
  if (proposal.whyHighImpact.length < 16 || GENERIC_COPY_PATTERN.test(proposal.whyHighImpact)) {
    reasons.push("missing_high_impact_rationale");
  }
  if (
    proposal.whyNotSmallCleanup.length < 16 ||
    /\b(cleanup|small|tiny|minor|local)\b/iu.test(proposal.title)
  ) {
    reasons.push("small_cleanup_not_rejected");
  }
  if (
    proposal.proposalKind === "existing_skill_enhancement" &&
    !proposal.suggestedExistingSkillName
  ) {
    reasons.push("existing_skill_enhancement_requires_explicit_skill");
  }
  if (
    proposal.proposalKind === "existing_skill_enhancement" &&
    proposal.suggestedExistingSkillName &&
    !loadedSkillNames.has(proposal.suggestedExistingSkillName.toLowerCase())
  ) {
    reasons.push("existing_skill_enhancement_requires_loaded_skill_match");
  }
  return unique(reasons);
}

function rejectedProposalDiagnostics(
  proposals: CandidateReviewProposal[],
): CandidateReviewRejectedProposalDiagnostic[] {
  return proposals
    .filter((proposal) => proposal.demotionReason)
    .map((proposal) => ({
      proposalKind: proposal.proposalKind,
      title: redactAndBound(proposal.title, MAX_TITLE_LENGTH),
      reasonCodes: unique(proposal.demotionReason?.split(", ") ?? []).slice(0, 8),
      sourceRuntime: proposal.sourceRuntime,
      evidenceRefs: proposal.evidenceRefs.slice(0, 8),
    }));
}

function proposalFromModelOutput(
  output: CandidateProposalModelOutput["proposals"][number],
  packet: ProactivityReviewEpisodePacket,
): CandidateReviewProposal {
  const title = redactAndBound(output.title, MAX_TITLE_LENGTH);
  const purpose = redactAndBound(output.purpose, MAX_PURPOSE_LENGTH);
  const recommendedNextStep = redactAndBound(output.recommendedNextStep, MAX_NEXT_STEP_LENGTH);
  const expectedUserValue = redactAndBound(output.expectedUserValue, MAX_EXPECTED_VALUE_LENGTH);
  const whyHighImpact = redactAndBound(output.whyHighImpact, MAX_HIGH_IMPACT_REASON_LENGTH);
  const whyNotSmallCleanup = redactAndBound(
    output.whyNotSmallCleanup,
    MAX_SMALL_CLEANUP_REASON_LENGTH,
  );
  const allowedRefs = evidenceRefSet(packet);
  const modelEvidenceRefs = unique(output.evidenceRefs).filter((ref) => allowedRefs.has(ref));
  const episodeSurfaceRefs = packet.episodeTurns.map((excerpt) => excerpt.ref).slice(-3);
  const evidenceRefs = unique([...modelEvidenceRefs, ...episodeSurfaceRefs]).filter((ref) =>
    allowedRefs.has(ref),
  );
  const evidenceHashes = evidenceRefs
    .map((ref) => {
      const turnHash = packet.episodeTurns.find((excerpt) => excerpt.ref === ref)?.hash;
      const commandHash = packet.codexActivitySummary.commandSummaries.find(
        (entry) => entry.ref === ref,
      )?.hash;
      const failureHash = packet.codexActivitySummary.validationFailures.find(
        (entry) => entry.ref === ref,
      )?.hash;
      return turnHash ?? commandHash ?? failureHash;
    })
    .filter(Boolean) as string[];
  return {
    schemaVersion: CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION,
    proposalId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "candidate_review_proposal",
      targetId: packet.sessionWindow.sessionKey,
      seed: {
        proposalKind: output.proposalKind,
        title,
        evidenceRefs,
        runtime: output.sourceRuntime,
      },
    }),
    proposalKind: output.proposalKind,
    title,
    purpose,
    recommendedNextStep,
    candidateType:
      output.proposalKind === "proactive_plan"
        ? "proactive_plan"
        : output.proposalKind === "existing_skill_enhancement"
          ? "existing_skill_enhancement"
          : output.proposalKind === "merge_or_extend_candidate"
            ? "merge_or_extend_candidate"
            : "model_reviewed_repeated_work",
    suggestedSkillName: slugFromString(output.suggestedSkillName),
    suggestedExistingSkillName: output.suggestedExistingSkillName ?? undefined,
    mergeTargetCandidateId: output.mergeTargetCandidateId ?? undefined,
    sourceRuntime: output.sourceRuntime,
    evidenceRefs,
    evidenceHashes:
      evidenceHashes.length > 0 ? unique(evidenceHashes) : unique(evidenceRefs.map(hash)),
    recurrenceSignals: output.recurrenceSignals.map((signal) => redactAndBound(signal, 180)),
    frictionSignals: output.frictionSignals.map((signal) => redactAndBound(signal, 180)),
    expectedUserValue,
    leverageClass: output.leverageClass,
    whyHighImpact,
    whyNotSmallCleanup,
    confidence: output.confidence,
    riskTier: output.riskTier,
    shouldSurface: output.shouldSurface,
    demotionReason: output.demotionReason ?? undefined,
  };
}

export async function reviewEpisodeForCandidates(
  packet: ProactivityReviewEpisodePacket,
  options: CandidateReviewModelOptions = {},
): Promise<{
  proposals: CandidateReviewProposal[];
  report: CandidateReviewReport;
}> {
  const startedAt = Date.now();
  assertNoProhibitedContent(packet, "proactivity review episode packet");
  const inputHash = hash(packet);
  const enabled = options.enabled === true && Boolean(options.executor);
  if (!enabled || !options.executor) {
    return {
      proposals: [],
      report: {
        schemaVersion: MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION,
        source: "skipped",
        enabled,
        reasoningEffort: options.reasoningEffort ?? "high",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["candidate_review_model_disabled"],
        proposalCount: 0,
        surfacedProposalCount: 0,
        episodeTurnCount: packet.episodeTurns.length,
        codexAdapterStatus: packet.codexActivitySummary.status,
        packetQuality: packet.packetQuality,
        sourceSelection: packet.sourceSelection,
        sourceRuntimes: unique(
          packet.episodeTurns.map((turn) => turn.sourceRuntime),
        ) as CandidateReviewRuntime[],
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: 0,
      },
    };
  }
  const modelId = options.modelId?.trim() || DEFAULT_CANDIDATE_REVIEW_MODEL_ID;
  const userPrompt = [
    "Return one JSON object matching the schema.",
    "Review this high-context bounded recent-work episode for 0-3 high-impact skills and proactive-plan proposals:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "candidate_review_proposal",
        contractVersion: "phase2-high-context-candidate-review-v2",
        modelId,
      },
      systemPrompt: CANDIDATE_REVIEW_SYSTEM_PROMPT,
      userPrompt,
      responseFormat: "json",
      responseOptions: {
        maxOutputTokens: options.maxOutputTokens ?? 3_200,
        reasoningEffort: options.reasoningEffort ?? "high",
        verbosity: options.verbosity ?? "low",
        transport: {
          type: "json_schema",
          name: "candidate_review_proposals",
          strict: true,
          schema: CANDIDATE_PROPOSAL_JSON_SCHEMA,
        },
      },
    });
    const output = parseJsonModelOutput(
      response,
      {
        contractName: "candidate_review_proposal",
        contractVersion: "phase2-high-context-candidate-review-v2",
        modelId,
      },
      CandidateProposalOutputSchema,
    );
    const allowedRefs = evidenceRefSet(packet);
    const allowedSkillNames = new Set(
      packet.existingContext.loadedSkills.map((skill) => skill.name.toLowerCase()),
    );
    const proposals = output.proposals
      .map((entry) => proposalFromModelOutput(entry, packet))
      .map((proposal) => {
        const reasons = validateProposal(proposal, allowedRefs, allowedSkillNames);
        return reasons.length === 0
          ? proposal
          : {
              ...proposal,
              shouldSurface: false,
              demotionReason: unique([proposal.demotionReason, ...reasons]).join(", "),
            };
      });
    const accepted = proposals.every((proposal) => {
      assertNoProhibitedContent(proposal, "candidate review proposal");
      return true;
    });
    return {
      proposals,
      report: {
        schemaVersion: MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION,
        source: accepted ? "model" : "rejected",
        enabled: true,
        modelId,
        resolvedModelId: response.resolvedModelId,
        reasoningEffort: options.reasoningEffort ?? "high",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        outputHash: hash(output),
        validationStatus: accepted ? "pass" : "reject",
        reasonCodes: unique(
          proposals.flatMap((proposal) => proposal.demotionReason?.split(", ") ?? []),
        ),
        proposalCount: proposals.length,
        surfacedProposalCount: proposals.filter((proposal) => proposal.shouldSurface).length,
        episodeTurnCount: packet.episodeTurns.length,
        codexAdapterStatus: packet.codexActivitySummary.status,
        packetQuality: packet.packetQuality,
        sourceSelection: packet.sourceSelection,
        sourceRuntimes: unique(
          packet.episodeTurns.map((turn) => turn.sourceRuntime),
        ) as CandidateReviewRuntime[],
        rejectedProposalDiagnostics: rejectedProposalDiagnostics(proposals),
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
        outputChars: response.outputText.length,
      },
    };
  } catch (error) {
    return {
      proposals: [],
      report: {
        schemaVersion: MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION,
        source: "rejected",
        enabled: true,
        modelId,
        reasoningEffort: options.reasoningEffort ?? "high",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["candidate_review_model_failed", ...readModelErrorReasonCodes(error)],
        proposalCount: 0,
        surfacedProposalCount: 0,
        episodeTurnCount: packet.episodeTurns.length,
        codexAdapterStatus: packet.codexActivitySummary.status,
        packetQuality: packet.packetQuality,
        sourceSelection: packet.sourceSelection,
        sourceRuntimes: unique(
          packet.episodeTurns.map((turn) => turn.sourceRuntime),
        ) as CandidateReviewRuntime[],
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
      },
    };
  }
}

export async function writeProactivityReviewEpisodePacketArtifact(
  packet: ProactivityReviewEpisodePacket,
  options: {
    artifactRoot?: string;
    timestamp?: string;
  } = {},
): Promise<ProactivityReviewEpisodePacketArtifact> {
  assertNoProhibitedContent(packet, "proactivity review episode packet artifact");
  const packetHash = hash(packet);
  const safeTimestamp = (options.timestamp ?? new Date().toISOString()).replace(/[:.]/gu, "-");
  const artifactRoot = path.resolve(
    options.artifactRoot ??
      path.join(
        ".artifacts",
        "model-memory",
        "phase2-contiguous-candidate-packets-and-model-cards",
      ),
    safeTimestamp,
  );
  await fs.mkdir(artifactRoot, { recursive: true });
  const jsonPath = path.join(artifactRoot, "episode-packet.json");
  const markdownPath = path.join(artifactRoot, "episode-packet.md");
  const markdown = [
    "# High-Context Candidate Review Episode Packet",
    "",
    `- packetHash: ${packetHash}`,
    `- schemaVersion: ${packet.schemaVersion}`,
    `- runtime: ${packet.sessionWindow.runtime}`,
    `- sessionKey: ${packet.sessionWindow.sessionKey}`,
    `- turnCount: ${packet.sessionWindow.turnCount}`,
    `- codexAdapterStatus: ${packet.codexActivitySummary.status}`,
    `- packetQuality: ${packet.packetQuality.status}`,
    `- packetQualityReasons: ${packet.packetQuality.reasonCodes.join(", ") || "none"}`,
    `- openClawTurnCount: ${packet.packetQuality.openClawTurnCount}`,
    `- codexTurnCount: ${packet.packetQuality.codexTurnCount}`,
    `- genericCommandSummaryCount: ${packet.packetQuality.genericCommandSummaryCount}`,
    `- validationFailureSummaryCount: ${packet.packetQuality.validationFailureSummaryCount}`,
    `- touchedAreaCount: ${packet.packetQuality.touchedAreaCount}`,
    `- promptPersisted: false`,
    `- rawResponsePersisted: false`,
    `- rawFullTranscriptPersisted: false`,
    "",
    "## Episode Turns",
    "",
    ...packet.episodeTurns.map(
      (turn, index) =>
        `${index + 1}. ${turn.sourceRuntime}/${turn.role} ${turn.ref} (${turn.hash.slice(0, 12)})`,
    ),
    "",
    "## Review Policy",
    "",
    `- maxSurfaceCandidates: ${packet.reviewPolicy.maxSurfaceCandidates}`,
    `- preferNoCandidateOverWeakCandidate: ${packet.reviewPolicy.preferNoCandidateOverWeakCandidate}`,
    `- rejectTinyCleanupCandidates: ${packet.reviewPolicy.rejectTinyCleanupCandidates}`,
    "",
  ].join("\n");
  await fs.writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    artifactRoot,
    jsonPath,
    markdownPath,
    packetHash,
    promptPersisted: false,
    rawResponsePersisted: false,
    rawFullTranscriptPersisted: false,
  };
}

function skillSourceRuntime(runtime: CandidateReviewRuntime): Phase2SkillCandidateSourceRuntime {
  if (runtime === "codex") {
    return "codex_session";
  }
  if (runtime === "mixed") {
    return "recurring_task";
  }
  return "openclaw_session";
}

function sourceProfilesForRuntime(runtime: CandidateReviewRuntime): SourceProfileId[] {
  return runtime === "codex" ? ["manual_note"] : ["manual_note"];
}

function sourceAuthorityForRuntime(_runtime: CandidateReviewRuntime): SourceAuthorityTier[] {
  return ["tool_grounded"];
}

function confidenceForLedger(confidence: CandidateReviewConfidence): "high" | "medium" | "low" {
  return confidence;
}

function titleFocusKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .split(/\s+/u)
    .slice(0, 8)
    .join(" ");
}

function candidateTypeForProposal(
  proposal: CandidateReviewProposal,
):
  | "repeated_work_pattern"
  | "explicit_skill_request"
  | "recurring_validation_fix"
  | "manual_workflow" {
  if (
    proposal.proposalKind === "new_skill_candidate" ||
    proposal.proposalKind === "existing_skill_enhancement"
  ) {
    return "repeated_work_pattern";
  }
  return "manual_workflow";
}

export function convertCandidateReviewProposalsToLedgerSources(input: {
  proposals: CandidateReviewProposal[];
  projectId: string;
  sessionKey: string;
  generatedAt?: string;
  previousSkillCandidates?: Phase2SkillCandidateRecord[];
  episodePacketHash?: string;
  episodePacketPath?: string;
}): {
  skillCandidates: Phase2SkillCandidateRecord[];
  opportunities: Phase2OpportunityLedgerSource[];
} {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const packetRef = input.episodePacketHash
    ? `candidate-review-packet://${input.episodePacketHash}`
    : undefined;
  const previousByIntent = new Map(
    (input.previousSkillCandidates ?? []).map((record) => [record.normalizedIntentKey, record]),
  );
  const skillCandidates: Phase2SkillCandidateRecord[] = [];
  const opportunities: Phase2OpportunityLedgerSource[] = [];
  for (const proposal of input.proposals) {
    if (
      !proposal.shouldSurface ||
      proposal.confidence === "low" ||
      proposal.riskTier === "blocked"
    ) {
      continue;
    }
    const normalizedIntentKey = titleFocusKey(
      `${proposal.proposalKind} ${proposal.suggestedSkillName ?? ""} ${proposal.title}`,
    );
    const contentHashes = unique([
      ...proposal.evidenceHashes,
      hash({
        title: proposal.title,
        purpose: proposal.purpose,
        next: proposal.recommendedNextStep,
      }),
    ]);
    const proofHashes = unique([
      hash({
        proposalId: proposal.proposalId,
        evidenceRefs: proposal.evidenceRefs,
        sourceRuntime: proposal.sourceRuntime,
      }),
    ]);
    if (proposal.proposalKind === "merge_or_extend_candidate") {
      continue;
    }
    if (
      proposal.proposalKind === "new_skill_candidate" ||
      proposal.proposalKind === "existing_skill_enhancement"
    ) {
      const previous = previousByIntent.get(normalizedIntentKey);
      const skillCandidateId =
        previous?.skillCandidateId ??
        buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_model_reviewed_skill_candidate",
          targetId: `${input.projectId}:${input.sessionKey}`,
          seed: {
            normalizedIntentKey,
            sourceRuntime: proposal.sourceRuntime,
            suggestedExistingSkillName: proposal.suggestedExistingSkillName ?? null,
          },
        });
      const proactivityOpportunityId =
        previous?.proactivityOpportunityId ??
        buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_model_reviewed_skill_candidate_opportunity",
          targetId: skillCandidateId,
          seed: normalizedIntentKey,
        });
      const installTargets: Phase2SkillCandidateInstallTarget[] = ["workspace_skills_dir"];
      const record: Phase2SkillCandidateRecord = {
        skillCandidateId,
        proactivityOpportunityId,
        normalizedIntentKey,
        sourceRuntime: skillSourceRuntime(proposal.sourceRuntime),
        candidateType: candidateTypeForProposal(proposal),
        evidenceSummary: boundedText(proposal.purpose, 180),
        recurrenceCount: Math.max(
          1,
          proposal.recurrenceSignals.length,
          previous?.recurrenceCount ?? 0,
        ),
        recurrenceWindow: {
          firstSeenAt: previous?.recurrenceWindow.firstSeenAt ?? generatedAt,
          lastSeenAt: generatedAt,
        },
        exampleHashes: contentHashes,
        suggestedSkillName:
          proposal.suggestedSkillName ?? titleFocusKey(proposal.title).replace(/\s+/gu, "-"),
        suggestedExistingSkillName: proposal.suggestedExistingSkillName,
        riskTier: proposal.riskTier,
        autonomyLevelCeiling: 1 as Phase2SkillCandidateAutonomyLevel,
        lifecycleStatus: previous?.lifecycleStatus ?? "detected",
        installTargets,
        evalStatus: (previous?.evalStatus ?? "not_started") as Phase2SkillCandidateEvalStatus,
        vettingStatus: (previous?.vettingStatus ??
          "not_started") as Phase2SkillCandidateVettingStatus,
        canaryStatus: (previous?.canaryStatus ?? "not_started") as Phase2SkillCandidateCanaryStatus,
        createdAt: previous?.createdAt ?? generatedAt,
        updatedAt: generatedAt,
        provenanceRefs: unique([...proposal.evidenceRefs, packetRef]),
        rollbackPlan: previous?.rollbackPlan ?? {
          rollbackId: buildDerivedArtifactId({
            family: "context_artifact",
            artifactType: "phase2_model_reviewed_skill_candidate_rollback",
            targetId: skillCandidateId,
            seed: "disable_candidate_only",
          }),
          strategy: "disable_candidate_only",
          targetPaths: installTargets,
          directMainMutationAllowed: false,
        },
        sourceProfileIds: sourceProfilesForRuntime(proposal.sourceRuntime),
        authorityTiers: sourceAuthorityForRuntime(proposal.sourceRuntime),
        contentHashes,
        proofHashes,
        noDarkDataStatus: "pass",
      };
      skillCandidates.push(record);
      const opportunity: Phase2SkillCandidateOpportunity = {
        sourceFamily: "skill_candidate",
        opportunityClass: "skill_candidate",
        opportunityId: proactivityOpportunityId,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        workItemKind: "planning_request",
        title: proposal.title,
        whyNow: boundedText(proposal.purpose, 180),
        proposedNextStep: proposal.recommendedNextStep,
        expectedUserValue: proposal.expectedUserValue,
        evidenceSummary: boundedText(
          `Model-reviewed bounded episode proposal from ${proposal.sourceRuntime} activity.`,
          180,
        ),
        confidence: proposal.confidence,
        sourceRefs: record.provenanceRefs,
        sourceProfileIds: record.sourceProfileIds,
        authorityTiers: record.authorityTiers,
        contentHashes,
        proofHashes,
        blockedReasonCodes: unique(["model_reviewed_candidate", "high_context_review", packetRef]),
        noDarkDataStatus: "pass",
        generatedAt,
        skillCandidate: record,
      };
      opportunities.push(opportunity);
      continue;
    }
    if (proposal.proposalKind === "proactive_plan") {
      const opportunityId = buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_model_reviewed_proactive_plan",
        targetId: `${input.projectId}:${input.sessionKey}`,
        seed: {
          normalizedIntentKey,
          evidenceRefs: proposal.evidenceRefs,
        },
      });
      opportunities.push({
        sourceFamily: "pattern_or_followup",
        opportunityClass: "proactive_plan",
        opportunityId,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: proposal.title,
        whyNow: boundedText(proposal.purpose, 180),
        proposedNextStep: proposal.recommendedNextStep,
        expectedUserValue: proposal.expectedUserValue,
        evidenceSummary: boundedText(
          `Model-reviewed bounded episode proposal from ${proposal.sourceRuntime} activity.`,
          180,
        ),
        confidence: confidenceForLedger(proposal.confidence),
        sourceRefs: unique([...proposal.evidenceRefs, packetRef]),
        sourceProfileIds: sourceProfilesForRuntime(proposal.sourceRuntime),
        authorityTiers: sourceAuthorityForRuntime(proposal.sourceRuntime),
        contentHashes,
        proofHashes,
        noDarkDataStatus: "pass",
        blockedReasonCodes: unique(["model_reviewed_candidate", "high_context_review", packetRef]),
        workItemKind: "planning_request" as Phase2ProactivityWorkItemKind,
        generatedAt,
      });
    }
  }
  assertNoProhibitedContent({ skillCandidates, opportunities }, "model-reviewed ledger sources");
  return { skillCandidates, opportunities };
}

function isJsonLikeSessionFile(filePath: string): boolean {
  return /\.(?:jsonl?|ndjson)$/iu.test(filePath);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function payloadRecordFromLine(value: unknown): Record<string, unknown> | null {
  const record = objectRecord(value);
  return objectRecord(record?.payload);
}

function preferredCodexRecord(value: unknown): Record<string, unknown> | null {
  const payload = payloadRecordFromLine(value);
  return payload ?? objectRecord(value);
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function isToolLikeCodexRecord(record: Record<string, unknown> | null): boolean {
  const type = stringField(record, "type");
  return (
    type === "function_call" ||
    type === "function_call_output" ||
    type === "tool_call" ||
    type === "tool_result" ||
    type === "exec_command_begin" ||
    type === "exec_command_end" ||
    type === "command"
  );
}

function roleFromLine(value: unknown): CandidateReviewRecentActivity["role"] | null {
  const record = objectRecord(value);
  const preferred = preferredCodexRecord(value);
  const role = stringField(preferred, "role") ?? stringField(record, "role");
  if (role === "user" || role === "assistant") {
    return role;
  }
  const type = stringField(preferred, "type") ?? stringField(record, "type");
  if (
    role === "tool" ||
    role === "command" ||
    role === "tool_result" ||
    isToolLikeCodexRecord(preferred) ||
    isToolLikeCodexRecord(record) ||
    (type === "event_msg" && isToolLikeCodexRecord(payloadRecordFromLine(value)))
  ) {
    return "tool_summary";
  }
  return null;
}

function textFromContentArray(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      const record = objectRecord(entry);
      return stringField(record, "text") ?? stringField(record, "content") ?? "";
    })
    .filter(Boolean)
    .join("\n");
}

function textFromLine(value: unknown): string {
  const record = preferredCodexRecord(value);
  if (!record) {
    return "";
  }
  const directText =
    stringField(record, "text") ?? stringField(record, "message") ?? stringField(record, "content");
  if (directText) {
    return directText;
  }
  const contentText = textFromContentArray(record.content);
  if (contentText) {
    return contentText;
  }
  const command = stringField(record, "command");
  if (command) {
    return `Command ${command.split(/\s+/u)[0] ?? "unknown"} ${
      stringField(record, "status") ?? ""
    }`.trim();
  }
  return "";
}

function timestampFromLine(value: unknown): string | undefined {
  const record = objectRecord(value);
  const payload = payloadRecordFromLine(value);
  const timestamp =
    stringField(record, "timestamp") ??
    stringField(payload, "timestamp") ??
    stringField(record, "created_at") ??
    stringField(payload, "created_at");
  if (timestamp) {
    return timestamp;
  }
  const ts = numberField(record, "ts") ?? numberField(payload, "ts");
  return typeof ts === "number" && Number.isFinite(ts)
    ? new Date(ts * 1_000).toISOString()
    : undefined;
}

function commandFamilyFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().split(/\s+/u)[0] ?? null;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return null;
}

function toolSummaryTextFromLine(value: unknown): string {
  const record = preferredCodexRecord(value);
  if (!record) {
    return "";
  }
  const commandFamily =
    commandFamilyFromValue(record.command) ??
    stringField(record, "tool") ??
    stringField(record, "name") ??
    stringField(record, "type") ??
    "unknown";
  const exitCode = numberField(record, "exit_code") ?? numberField(record, "exitCode");
  const status =
    exitCode === 0
      ? "passed"
      : typeof exitCode === "number"
        ? "failed"
        : (stringField(record, "status") ??
          stringField(record, "outcome") ??
          (typeof record.error === "string" ? "failed" : "unknown"));
  return `Command ${commandFamily ?? "unknown"} ${status}`.trim();
}

function activityKindFromCodexLine(
  value: unknown,
  role: CandidateReviewRecentActivity["role"],
): CandidateReviewRecentActivity["kind"] {
  if (role === "assistant") {
    return "final";
  }
  if (role === "user") {
    return "ask";
  }
  if (role !== "tool_summary" || !value || typeof value !== "object") {
    return undefined;
  }
  const record = preferredCodexRecord(value);
  const exitCode = numberField(record, "exit_code") ?? numberField(record, "exitCode");
  const status = stringField(record, "status") ?? stringField(record, "outcome");
  return exitCode === 0 ||
    (status !== "failed" && status !== "error" && status !== "timeout" && exitCode === null)
    ? "result_summary"
    : "failure_summary";
}

async function listSessionFiles(root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3 || files.length >= maxFiles) {
      return;
    }
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && isJsonLikeSessionFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(root, 0);
  return files.toSorted().slice(-maxFiles);
}

async function directoryStatus(
  root: string,
): Promise<"available" | "missing" | "not_directory" | "unreadable"> {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return "not_directory";
    }
    await fs.access(root);
    return "available";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? "missing" : "unreadable";
  }
}

async function readSessionFileTail(
  filePath: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, Math.max(1, maxBytes));
    const start = Math.max(0, stat.size - bytesToRead);
    const buffer = Buffer.alloc(bytesToRead);
    const read = await handle.read(buffer, 0, bytesToRead, start);
    return {
      text: buffer.subarray(0, read.bytesRead).toString("utf8"),
      truncated: start > 0,
    };
  } finally {
    await handle.close();
  }
}

function selectCodexActivitiesForReview(
  activities: CandidateReviewRecentActivity[],
  maxEntries: number,
): CandidateReviewRecentActivity[] {
  return activities.slice(-maxEntries);
}

async function loadCodexHistoryActivities(input: {
  historyPath?: string;
  maxBytes?: number;
  maxLines?: number;
}): Promise<CandidateReviewRecentActivity[]> {
  if (!input.historyPath) {
    return [];
  }
  let raw: { text: string; truncated: boolean };
  try {
    raw = await readSessionFileTail(
      input.historyPath,
      input.maxBytes ?? DEFAULT_CODEX_HISTORY_TAIL_BYTES,
    );
  } catch {
    return [];
  }
  const rawLines = raw.text.split(/\r?\n/u);
  if (raw.truncated) {
    rawLines.shift();
  }
  const lines = rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-(input.maxLines ?? DEFAULT_CODEX_HISTORY_TAIL_LINES));
  const activities: CandidateReviewRecentActivity[] = [];
  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = objectRecord(parsed);
    const text = redactAndBoundEpisodeText(
      stringField(record, "text") ?? "",
      MAX_USER_EPISODE_TURN_LENGTH,
    );
    if (!text) {
      continue;
    }
    const sessionId = boundedText(stringField(record, "session_id") ?? "unknown", 80);
    const ts = numberField(record, "ts");
    activities.push({
      ref: `codex-history://${sessionId}/${typeof ts === "number" ? ts : index}`,
      role: "user",
      kind: "ask",
      boundedText: text,
      sourceRuntime: "codex",
      recordedAt: typeof ts === "number" ? new Date(ts * 1_000).toISOString() : undefined,
    });
  }
  return activities;
}

export async function loadCodexSessionActivityForCandidateReview(
  input: {
    codexHome?: string;
    sessionRoot?: string;
    historyPath?: string;
    maxFiles?: number;
    maxEntries?: number;
    maxFileTailBytes?: number;
    maxTailLines?: number;
    maxHistoryTailBytes?: number;
    maxHistoryLines?: number;
  } = {},
): Promise<{
  activities: CandidateReviewRecentActivity[];
  report: CandidateReviewCodexAdapterReport;
}> {
  const explicitSessionRoot = input.sessionRoot ?? process.env[CODEX_SESSION_ROOT_ENV];
  const codexHome =
    input.codexHome ??
    process.env.CODEX_HOME ??
    (process.env.HOME ? path.join(process.env.HOME, ".codex") : undefined);
  const historyPath =
    input.historyPath ??
    process.env[CODEX_HISTORY_PATH_ENV] ??
    (codexHome ? path.join(codexHome, "history.jsonl") : undefined);
  if (!explicitSessionRoot && !codexHome) {
    return {
      activities: [],
      report: { status: "skipped", reasonCode: "codex_home_unavailable", entryCount: 0 },
    };
  }
  const sessionRoot = explicitSessionRoot ?? path.join(codexHome as string, "sessions");
  const rootStatus = await directoryStatus(sessionRoot);
  if (rootStatus !== "available") {
    return {
      activities: [],
      report: {
        status: "skipped",
        reasonCode:
          rootStatus === "missing"
            ? "codex_session_root_unavailable"
            : rootStatus === "not_directory"
              ? "codex_session_root_not_directory"
              : "codex_session_root_unreadable",
        sourceRoot: sessionRoot,
        entryCount: 0,
      },
    };
  }
  const files = await listSessionFiles(sessionRoot, input.maxFiles ?? 12);
  if (files.length === 0) {
    return {
      activities: [],
      report: {
        status: "skipped",
        reasonCode: "codex_session_files_unavailable",
        sourceRoot: sessionRoot,
        entryCount: 0,
      },
    };
  }
  const activities: CandidateReviewRecentActivity[] = [];
  const historyActivities = await loadCodexHistoryActivities({
    historyPath,
    maxBytes: input.maxHistoryTailBytes,
    maxLines: input.maxHistoryLines,
  });
  activities.push(...historyActivities);
  for (const filePath of files) {
    let raw: { text: string; truncated: boolean };
    try {
      raw = await readSessionFileTail(
        filePath,
        input.maxFileTailBytes ?? DEFAULT_CODEX_SESSION_TAIL_BYTES,
      );
    } catch {
      continue;
    }
    const rawLines = raw.text.split(/\r?\n/u);
    if (raw.truncated) {
      rawLines.shift();
    }
    const lines = rawLines
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-(input.maxTailLines ?? DEFAULT_CODEX_SESSION_TAIL_LINES));
    for (const [index, line] of lines.entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        if (lines.length === 1) {
          try {
            parsed = JSON.parse(raw.text);
          } catch {
            continue;
          }
        } else {
          continue;
        }
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const role = roleFromLine(candidate);
        const textLimit =
          role === "user"
            ? MAX_USER_EPISODE_TURN_LENGTH
            : role === "assistant"
              ? MAX_ASSISTANT_EPISODE_TURN_LENGTH
              : 160;
        const text = redactAndBound(
          role === "tool_summary" ? toolSummaryTextFromLine(candidate) : textFromLine(candidate),
          textLimit,
        );
        if (!role || !text) {
          continue;
        }
        activities.push({
          ref: `codex://${path.basename(filePath)}#${index}`,
          role,
          kind: activityKindFromCodexLine(candidate, role),
          boundedText: text,
          sourceRuntime: "codex",
          recordedAt: timestampFromLine(candidate),
        });
      }
    }
  }
  activities.sort((left, right) => {
    const leftMs = left.recordedAt ? Date.parse(left.recordedAt) : NaN;
    const rightMs = right.recordedAt ? Date.parse(right.recordedAt) : NaN;
    if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
      return leftMs - rightMs;
    }
    if (Number.isFinite(leftMs)) {
      return -1;
    }
    if (Number.isFinite(rightMs)) {
      return 1;
    }
    return 0;
  });
  return {
    activities: selectCodexActivitiesForReview(activities, input.maxEntries ?? 80),
    report: {
      status: activities.length > 0 ? "loaded" : "skipped",
      reasonCode: activities.length > 0 ? undefined : "codex_session_entries_unavailable",
      sourceRoot: sessionRoot,
      entryCount: activities.length,
      sessionRefs: unique(files.map((filePath) => `codex://${path.basename(filePath)}`)).slice(-12),
      commandSummaryCount: activities.filter((activity) => activity.role === "tool_summary").length,
      validationFailureCount: activities.filter((activity) => activity.kind === "failure_summary")
        .length,
      genericCommandSummaryCount: activities.filter(
        (activity) =>
          activity.role === "tool_summary" && isGenericCommandSummary(activity.boundedText),
      ).length,
    },
  };
}
