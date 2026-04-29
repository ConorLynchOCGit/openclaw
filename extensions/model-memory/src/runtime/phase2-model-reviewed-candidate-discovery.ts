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

export const CANDIDATE_REVIEW_PREFILTER_EVENT_SCHEMA_VERSION =
  "candidate_review_prefilter_event.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_PACKET_SCHEMA_VERSION =
  "candidate_review_trigger_packet.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_DECISION_SCHEMA_VERSION =
  "candidate_review_trigger_decision.v1" as const;
export const CANDIDATE_REVIEW_TRIGGER_REPORT_SCHEMA_VERSION =
  "candidate_review_trigger_report.v1" as const;
export const PROACTIVITY_REVIEW_EPISODE_PACKET_SCHEMA_VERSION =
  "proactivity_review_episode.v1" as const;
export const CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION = "candidate_review_proposal.v1" as const;
export const MODEL_REVIEWED_CANDIDATE_REPORT_SCHEMA_VERSION =
  "model_reviewed_candidate_report.v1" as const;
export const DEFAULT_CANDIDATE_TRIGGER_MODEL_ID = "openai-codex/gpt-5.4-mini";
export const DEFAULT_CANDIDATE_REVIEW_MODEL_ID = "openai-codex/gpt-5.4";

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
  reviewGoal: "find_proactive_plans_and_skill_candidates";
  sessionWindow: {
    runtime: CandidateReviewRuntime;
    sessionKey: string;
    turnCount: number;
    timeWindowLabel: string;
  };
  userIntentArc: {
    currentObjective: string;
    recentConcerns: string[];
    explicitAsks: string[];
    decisionPressure: string[];
  };
  boundedTurnExcerpts: Array<{
    role: "user" | "assistant";
    excerptType: "ask" | "correction" | "example" | "decision" | "result_summary";
    boundedText: string;
    hash: string;
    ref: string;
  }>;
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
  safetyEnvelope: {
    proposalOnly: true;
    noActionExecution: true;
    noSkillInstallOrPromotion: true;
    noCanonicalMemoryTruth: true;
    noRawToolLogs: true;
  };
};

export type CandidateReviewProposalKind =
  | "proactive_plan"
  | "new_skill_candidate"
  | "existing_skill_enhancement"
  | "merge_or_extend_candidate"
  | "demote_existing_candidate";

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
  confidence: CandidateReviewConfidence;
  riskTier: Phase2SkillCandidateRiskTier;
  shouldSurface: boolean;
  demotionReason?: string;
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
  status: "loaded" | "skipped";
  reasonCode?: string;
  sourceRoot?: string;
  entryCount: number;
};

const MAX_REF_TEXT_LENGTH = 520;
const MAX_EPISODE_EXCERPT_LENGTH = 760;
const MAX_TITLE_LENGTH = 96;
const MAX_PURPOSE_LENGTH = 220;
const MAX_NEXT_STEP_LENGTH = 240;
const MAX_EXPECTED_VALUE_LENGTH = 220;
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

function hash(value: JsonLike | string): string {
  return typeof value === "string" ? sha256Text(value) : sha256JsonValue(value);
}

function unique(values: Array<string | undefined | null>): string[] {
  return uniqueSortedStrings(values.filter(Boolean) as string[]);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function boundedText(value: string | undefined, maxLength: number): string {
  const normalized = normalizeWhitespace(value ?? "");
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
  loadedSkills?: CandidateReviewExistingSkill[];
  recentProactivityItems?: CandidateReviewRecentProactivityItem[];
  recentCandidateIds?: string[];
  possibleDuplicateTitles?: string[];
  rejectedOrDemotedSummary?: string[];
  activeMilestone?: string;
  activeDocsOrBranches?: string[];
}): ProactivityReviewEpisodePacket {
  const includedRefs = new Set(input.triggerDecision.episodeWindow.includedRefs);
  const includedIndexes = input.recentActivities
    .map((activity, index) => (includedRefs.has(activity.ref) ? index : -1))
    .filter((index) => index >= 0);
  const adjacentIndexes = new Set<number>();
  for (const index of includedIndexes) {
    adjacentIndexes.add(index - 1);
    adjacentIndexes.add(index);
    adjacentIndexes.add(index + 1);
    adjacentIndexes.add(index + 2);
  }
  const selectedActivities = input.recentActivities
    .filter(
      (activity, index) =>
        includedRefs.size === 0 || includedRefs.has(activity.ref) || adjacentIndexes.has(index),
    )
    .slice(-10);
  const boundedTurnExcerpts = selectedActivities
    .filter((activity) => activity.role === "user" || activity.role === "assistant")
    .map((activity) => {
      const bounded = redactAndBound(activity.boundedText, MAX_EPISODE_EXCERPT_LENGTH);
      const activityKind = classifyActivityKind(activity);
      const excerptType: "ask" | "correction" | "decision" | "example" | "result_summary" =
        activityKind === "correction"
          ? "correction"
          : activityKind === "ask"
            ? "ask"
            : activity.role === "assistant"
              ? "result_summary"
              : "example";
      return {
        role: activity.role as "user" | "assistant",
        excerptType,
        boundedText: bounded,
        hash: hash({ ref: activity.ref, bounded }),
        ref: activity.ref,
      };
    });
  const explicitAsks = selectedActivities
    .filter((activity) => classifyActivityKind(activity) === "ask")
    .map((activity) => redactAndBound(activity.boundedText, 180))
    .slice(-4);
  const recentConcerns = selectedActivities
    .filter((activity) => classifyActivityKind(activity) === "correction")
    .map((activity) => redactAndBound(activity.boundedText, 180))
    .slice(-4);
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
    reviewGoal: "find_proactive_plans_and_skill_candidates",
    sessionWindow: {
      runtime,
      sessionKey: input.triggerPacket.event.sessionKey,
      turnCount: boundedTurnExcerpts.length,
      timeWindowLabel: `${input.triggerDecision.episodeWindow.startRef}..${input.triggerDecision.episodeWindow.endRef}`,
    },
    userIntentArc: {
      currentObjective:
        explicitAsks[0] ??
        redactAndBound(input.triggerPacket.event.boundedSummary, 180) ??
        "Review recent work for useful skill and proactive-plan candidates.",
      recentConcerns,
      explicitAsks,
      decisionPressure: unique([
        input.triggerDecision.why,
        input.recentProactivityItems?.some((item) => item.quality?.includes("demote"))
          ? "Recent card-quality demotion suggests presentation or candidate-discovery repair value."
          : undefined,
      ]).slice(0, 4),
    },
    boundedTurnExcerpts,
    observedWorkPatterns: [
      {
        summary: redactAndBound(input.triggerPacket.event.boundedSummary, 220),
        recurrenceEvidence: input.triggerPacket.recentActivitySignals.slice(0, 4),
        frictionSignals: selectedActivities
          .filter((activity) => {
            const kind = classifyActivityKind(activity);
            return kind === "correction" || kind === "failure_summary" || kind === "card_summary";
          })
          .map((activity) => redactAndBound(activity.boundedText, 140))
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
    safetyEnvelope: {
      proposalOnly: true,
      noActionExecution: true,
      noSkillInstallOrPromotion: true,
      noCanonicalMemoryTruth: true,
      noRawToolLogs: true,
    },
  };
  assertNoProhibitedContent(packet, "proactivity review episode packet");
  return packet;
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
            titleWords: z.array(z.string().trim().min(1).max(32)).min(2).max(12),
            purposeWords: z.array(z.string().trim().min(1).max(32)).min(5).max(34),
            recommendedNextStepWords: z.array(z.string().trim().min(1).max(32)).min(4).max(34),
            suggestedSkillNameWords: z
              .array(z.string().trim().min(1).max(32))
              .min(1)
              .max(8)
              .nullable(),
            suggestedExistingSkillName: z.string().trim().min(1).max(80).nullable(),
            mergeTargetCandidateId: z.string().trim().min(1).max(160).nullable(),
            sourceRuntime: z.enum(["openclaw", "codex", "mixed"]),
            evidenceRefs: z.array(z.string().trim().min(1).max(180)).min(1).max(8),
            recurrenceSignals: z.array(z.string().trim().min(1).max(140)).max(6),
            frictionSignals: z.array(z.string().trim().min(1).max(140)).max(6),
            expectedUserValueWords: z.array(z.string().trim().min(1).max(32)).min(4).max(32),
            confidence: z.enum(["low", "medium", "high"]),
            riskTier: z.enum(["low", "medium", "high", "blocked"]),
            shouldSurface: z.boolean(),
            demotionReason: z.string().trim().min(1).max(120).nullable(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

type CandidateProposalModelOutput = z.infer<typeof CandidateProposalOutputSchema>;

const CANDIDATE_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { enum: [CANDIDATE_REVIEW_PROPOSAL_SCHEMA_VERSION] },
    proposals: {
      type: "array",
      maxItems: 8,
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
          titleWords: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 32 },
            minItems: 2,
            maxItems: 12,
          },
          purposeWords: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 32 },
            minItems: 5,
            maxItems: 34,
          },
          recommendedNextStepWords: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 32 },
            minItems: 4,
            maxItems: 34,
          },
          suggestedSkillNameWords: {
            type: ["array", "null"],
            items: { type: "string", minLength: 1, maxLength: 32 },
            minItems: 1,
            maxItems: 8,
          },
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
            items: { type: "string", minLength: 1, maxLength: 140 },
            maxItems: 6,
          },
          frictionSignals: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 140 },
            maxItems: 6,
          },
          expectedUserValueWords: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 32 },
            minItems: 4,
            maxItems: 32,
          },
          confidence: { enum: ["low", "medium", "high"] },
          riskTier: { enum: ["low", "medium", "high", "blocked"] },
          shouldSurface: { type: "boolean" },
          demotionReason: { type: ["string", "null"], maxLength: 120 },
        },
        required: [
          "proposalKind",
          "titleWords",
          "purposeWords",
          "recommendedNextStepWords",
          "suggestedSkillNameWords",
          "suggestedExistingSkillName",
          "mergeTargetCandidateId",
          "sourceRuntime",
          "evidenceRefs",
          "recurrenceSignals",
          "frictionSignals",
          "expectedUserValueWords",
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
  "You review a bounded OpenClaw/Codex recent-work episode for useful candidate proposals.",
  "Return strict JSON only.",
  "Identify concrete proactive plans, new skill candidates, existing skill enhancements, merge candidates, or demotions.",
  "Prefer enhancing an existing skill only when explicit loaded skill metadata supports it.",
  "Do not infer fuzzy merge as fact.",
  "Do not produce generic candidates.",
  "Titles must name a capability, decision, or outcome.",
  "Purposes must explain what the item does or unlocks.",
  "Next steps must be actionable.",
  "Output proposals only. Do not execute actions, install skills, promote skills, send messages, mutate files, or write canonical memory.",
  "Use only evidence refs from the packet.",
].join("\n");

function evidenceRefSet(packet: ProactivityReviewEpisodePacket): Set<string> {
  return new Set([
    ...packet.boundedTurnExcerpts.map((entry) => entry.ref),
    ...packet.existingContext.recentProactivityItems.map((item) => `proactivity://${item.id}`),
  ]);
}

function slugFromWords(words: string[] | null | undefined): string | undefined {
  const slug = (words ?? [])
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
  return slug || undefined;
}

function validateProposal(proposal: CandidateReviewProposal, allowedRefs: Set<string>): string[] {
  const reasons: string[] = [];
  const primary = `${proposal.title}\n${proposal.purpose}\n${proposal.recommendedNextStep}`;
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
  if (
    proposal.proposalKind === "existing_skill_enhancement" &&
    !proposal.suggestedExistingSkillName
  ) {
    reasons.push("existing_skill_enhancement_requires_explicit_skill");
  }
  return unique(reasons);
}

function proposalFromModelOutput(
  output: CandidateProposalModelOutput["proposals"][number],
  packet: ProactivityReviewEpisodePacket,
): CandidateReviewProposal {
  const title = textFromWords(output.titleWords, MAX_TITLE_LENGTH);
  const purpose = textFromWords(output.purposeWords, MAX_PURPOSE_LENGTH);
  const recommendedNextStep = textFromWords(output.recommendedNextStepWords, MAX_NEXT_STEP_LENGTH);
  const expectedUserValue = textFromWords(output.expectedUserValueWords, MAX_EXPECTED_VALUE_LENGTH);
  const allowedRefs = evidenceRefSet(packet);
  const modelEvidenceRefs = unique(output.evidenceRefs).filter((ref) => allowedRefs.has(ref));
  const episodeSurfaceRefs = packet.boundedTurnExcerpts.map((excerpt) => excerpt.ref).slice(-2);
  const evidenceRefs = unique([...modelEvidenceRefs, ...episodeSurfaceRefs]).filter((ref) =>
    allowedRefs.has(ref),
  );
  const evidenceHashes = evidenceRefs
    .map((ref) => packet.boundedTurnExcerpts.find((excerpt) => excerpt.ref === ref)?.hash)
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
    suggestedSkillName: slugFromWords(output.suggestedSkillNameWords),
    suggestedExistingSkillName: output.suggestedExistingSkillName ?? undefined,
    mergeTargetCandidateId: output.mergeTargetCandidateId ?? undefined,
    sourceRuntime: output.sourceRuntime,
    evidenceRefs,
    evidenceHashes:
      evidenceHashes.length > 0 ? unique(evidenceHashes) : unique(evidenceRefs.map(hash)),
    recurrenceSignals: output.recurrenceSignals.map((signal) => redactAndBound(signal, 140)),
    frictionSignals: output.frictionSignals.map((signal) => redactAndBound(signal, 140)),
    expectedUserValue,
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
        reasoningEffort: options.reasoningEffort ?? "medium",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["candidate_review_model_disabled"],
        proposalCount: 0,
        surfacedProposalCount: 0,
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: 0,
      },
    };
  }
  const modelId = options.modelId?.trim() || DEFAULT_CANDIDATE_REVIEW_MODEL_ID;
  const userPrompt = [
    "Return one JSON object matching the schema.",
    "Review this bounded recent-work episode for skills and proactive-plan proposals:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "candidate_review_proposal",
        contractVersion: "phase2-model-reviewed-candidates-v1",
        modelId,
      },
      systemPrompt: CANDIDATE_REVIEW_SYSTEM_PROMPT,
      userPrompt,
      responseFormat: "json",
      responseOptions: {
        maxOutputTokens: options.maxOutputTokens ?? 1_600,
        reasoningEffort: options.reasoningEffort ?? "medium",
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
        contractVersion: "phase2-model-reviewed-candidates-v1",
        modelId,
      },
      CandidateProposalOutputSchema,
    );
    const allowedRefs = evidenceRefSet(packet);
    const proposals = output.proposals
      .map((entry) => proposalFromModelOutput(entry, packet))
      .map((proposal) => {
        const reasons = validateProposal(proposal, allowedRefs);
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
        reasoningEffort: options.reasoningEffort ?? "medium",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        outputHash: hash(output),
        validationStatus: accepted ? "pass" : "reject",
        reasonCodes: unique(
          proposals.flatMap((proposal) => proposal.demotionReason?.split(", ") ?? []),
        ),
        proposalCount: proposals.length,
        surfacedProposalCount: proposals.filter((proposal) => proposal.shouldSurface).length,
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
        reasoningEffort: options.reasoningEffort ?? "medium",
        elapsedMs: Date.now() - startedAt,
        inputHash,
        validationStatus: "reject",
        reasonCodes: ["candidate_review_model_failed", ...readModelErrorReasonCodes(error)],
        proposalCount: 0,
        surfacedProposalCount: 0,
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
      },
    };
  }
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
}): {
  skillCandidates: Phase2SkillCandidateRecord[];
  opportunities: Phase2OpportunityLedgerSource[];
} {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
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
    if (
      proposal.proposalKind === "new_skill_candidate" ||
      proposal.proposalKind === "existing_skill_enhancement" ||
      proposal.proposalKind === "merge_or_extend_candidate"
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
        provenanceRefs: unique(proposal.evidenceRefs),
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
        blockedReasonCodes: ["model_reviewed_candidate"],
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
        sourceRefs: unique(proposal.evidenceRefs),
        sourceProfileIds: sourceProfilesForRuntime(proposal.sourceRuntime),
        authorityTiers: sourceAuthorityForRuntime(proposal.sourceRuntime),
        contentHashes,
        proofHashes,
        noDarkDataStatus: "pass",
        blockedReasonCodes: ["model_reviewed_candidate"],
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

function roleFromLine(value: unknown): CandidateReviewRecentActivity["role"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const role =
    (value as { role?: unknown; type?: unknown }).role ?? (value as { type?: unknown }).type;
  if (role === "user" || role === "assistant") {
    return role;
  }
  if (role === "tool" || role === "command" || role === "tool_result") {
    return "tool_summary";
  }
  return null;
}

function textFromLine(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as {
    text?: unknown;
    content?: unknown;
    message?: unknown;
    output?: unknown;
    command?: unknown;
    status?: unknown;
  };
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    return record.content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as { text?: unknown }).text === "string"
        ) {
          return (entry as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof record.command === "string") {
    return `Command ${record.command.split(/\s+/u)[0] ?? "unknown"} ${typeof record.status === "string" ? record.status : ""}`.trim();
  }
  if (typeof record.output === "string") {
    return record.output;
  }
  return "";
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
  const record = value as { status?: unknown; outcome?: unknown };
  const status = record.status ?? record.outcome;
  return status === "failed" || status === "error" || status === "timeout"
    ? "failure_summary"
    : "result_summary";
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
  return files.slice(-maxFiles);
}

export async function loadCodexSessionActivityForCandidateReview(
  input: {
    codexHome?: string;
    maxFiles?: number;
    maxEntries?: number;
  } = {},
): Promise<{
  activities: CandidateReviewRecentActivity[];
  report: CandidateReviewCodexAdapterReport;
}> {
  const codexHome =
    input.codexHome ??
    process.env.CODEX_HOME ??
    (process.env.HOME ? path.join(process.env.HOME, ".codex") : undefined);
  if (!codexHome) {
    return {
      activities: [],
      report: { status: "skipped", reasonCode: "codex_home_unavailable", entryCount: 0 },
    };
  }
  const sessionRoot = path.join(codexHome, "sessions");
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
  for (const filePath of files) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-80);
    for (const [index, line] of lines.entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        if (lines.length === 1) {
          try {
            parsed = JSON.parse(raw);
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
        const text = redactAndBound(textFromLine(candidate), role === "tool_summary" ? 160 : 520);
        if (!role || !text) {
          continue;
        }
        activities.push({
          ref: `codex://${path.basename(filePath)}#${index}`,
          role,
          kind: activityKindFromCodexLine(candidate, role),
          boundedText: text,
          sourceRuntime: "codex",
        });
      }
    }
  }
  return {
    activities: activities.slice(-(input.maxEntries ?? 24)),
    report: {
      status: activities.length > 0 ? "loaded" : "skipped",
      reasonCode: activities.length > 0 ? undefined : "codex_session_entries_unavailable",
      sourceRoot: sessionRoot,
      entryCount: activities.length,
    },
  };
}
