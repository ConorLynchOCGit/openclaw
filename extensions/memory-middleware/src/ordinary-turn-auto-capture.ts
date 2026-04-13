import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { type CanonicalMemoryIngestionCandidate } from "openclaw/plugin-sdk/memory-canonical-ingestion";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import type { PluginLogger } from "../api.js";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import { getCanonicalCaptureMetadataByCaptureClass } from "./capture-class-metadata.js";
import {
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG,
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG,
  type MemoryMiddlewareConfig,
} from "./config.js";
import { withMemoryMiddlewarePgClient } from "./db/pg-pool.js";
import {
  buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch,
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
} from "./memory-canonical-compat.js";
import {
  executeMemoryObjectCorrectionPlan,
  isExecutableMemoryObjectCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
  resolveMemoryCorrectionPlan,
} from "./memory-correction-engine.js";
import {
  resolveProjectFactIngestion,
  resolveRecurringProcedureIngestion,
  resolveResponseStyleIngestion,
  resolveWorkflowImprovementIngestion,
} from "./memory-ingestion-resolver.js";
import {
  type OrdinaryTurnAutoCaptureMatch,
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
  toOrdinaryTurnResponseStyleMatch,
  toOrdinaryTurnWorkflowImprovementMatch,
} from "./memory-ingestion-types.js";
import {
  buildPendingConfirmationMetadata as buildPendingConfirmationLifecycleMetadata,
  buildProjectFactPendingConfirmationMetadata as buildProjectFactPendingConfirmationLifecycleMetadata,
  buildProjectFactSemanticMetadata as buildProjectFactSemanticDetectionMetadata,
  buildRecurringProcedurePendingConfirmationMetadata as buildRecurringProcedurePendingConfirmationLifecycleMetadata,
  buildRecurringProcedureSemanticMetadata as buildRecurringProcedureSemanticDetectionMetadata,
  buildResponseStyleSemanticMetadata as buildResponseStyleSemanticDetectionMetadata,
  buildWorkflowImprovementPendingConfirmationMetadata as buildWorkflowImprovementPendingConfirmationLifecycleMetadata,
  buildWorkflowImprovementSemanticMetadata as buildWorkflowImprovementSemanticDetectionMetadata,
  shouldSkipImmediateConfirmation as shouldSkipImmediateResponseStyleConfirmation,
  shouldSkipImmediateProjectFactConfirmation as shouldSkipImmediateProjectFactLifecycleConfirmation,
  shouldSkipImmediateRecurringProcedureConfirmation as shouldSkipImmediateRecurringProcedureLifecycleConfirmation,
  shouldSkipImmediateWorkflowImprovementConfirmation as shouldSkipImmediateWorkflowImprovementLifecycleConfirmation,
} from "./memory-lifecycle-metadata.js";
import { type MemorySemanticInterpreterPort } from "./memory-model-semantic-interpreter.js";
import { resolveWorkflowCaptureCategoryFromCaptureClass } from "./memory-profile-routing.js";
import { collectPlannedMemorySemanticCaptures } from "./memory-semantic-capture-service.js";
import {
  deriveCorpusDemandSignalsFromPrompt,
  type MemorySoakTelemetryPort,
  MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
} from "./memory-soak-telemetry.js";
import {
  normalizeTranscriptMemorySource,
  type NormalizedTranscriptContextEntry,
} from "./memory-source-normalization.js";
import { buildMemorySourceWindows } from "./memory-source-windowing.js";
import {
  buildDeferredOverflowMetadata,
  readCandidateLifecycleState,
  readCandidateObservedAt,
  readCandidateOverflowMode,
} from "./ordinary-turn-auto-capture-candidate-state.js";
import {
  applyCapturePlanDecisionScore,
  createOrdinaryTurnAutoCaptureTurnState,
  hasImmediateLaneCapacity,
  hasReachedMultiCaptureTurnLimit,
  markTurnAcceptedCaptureForLane,
  markTurnDeferredOverflow,
  resolveCapturePlanBaseScore,
  resolveCapturePlanPosture,
  resolveDeferredOverflowLimit,
  resolveImmediateCaptureLimit,
  type OrdinaryTurnAutoCaptureCompatibilityLane,
  type OrdinaryTurnAutoCapturePlan,
  type OrdinaryTurnAutoCapturePosture,
  type OrdinaryTurnAutoCaptureSubmissionMode,
  type OrdinaryTurnAutoCaptureTurnState,
} from "./ordinary-turn-auto-capture-plan-policy.js";
import {
  buildWorkflowImprovementAutoPromotionMetadata,
  buildWorkflowImprovementAutoReviewMetadata,
  resolveGeneralizedWorkflowAutoReviewContext,
} from "./ordinary-turn-auto-capture-workflow-auto-review.js";
import {
  type ProjectFactLifecycleInspection,
  inspectProjectFactLifecycle,
  isExpiredPendingProjectFactCandidate,
} from "./project-fact-lifecycle.js";
import {
  containsHedgedProjectFactLanguage,
  isBoundedGenericProjectFactReference,
  type ProjectFactCanonicalMatch,
  type ProjectFactFamily,
  type ProjectFactFieldKey,
  type ProjectFactSemanticConfidence,
} from "./project-fact-semantic.js";
import {
  type RecurringProcedureLifecycleInspection,
  inspectRecurringProcedureLifecycle,
  isExpiredPendingRecurringProcedureCandidate,
  supersedeValidatedProceduresBySubjectKey,
} from "./recurring-procedure-lifecycle.js";
import {
  type RecurringProcedureFamily,
  getRecurringProcedureTitle,
  type RecurringProcedureCanonicalMatch,
  type RecurringProcedureKey,
  type RecurringProcedureSemanticConfidence,
} from "./recurring-procedure-semantic.js";
import {
  advanceRecurringProcedureCandidateStages,
  buildRecurringProcedureStagedInspection,
} from "./recurring-procedure-staged-substrate.js";
import {
  type ResponseStyleForgetResult,
  type ResponseStyleLifecycleInspection,
  forgetApprovedResponseStyleBySubjectKey,
  inspectResponseStyleLifecycle,
  isExpiredPendingResponseStyleCandidate,
} from "./response-style-lifecycle.js";
import {
  findApprovedResponseStylePhrasePatternMatch,
  maybeInduceResponseStylePhrasePattern,
} from "./response-style-phrase-induction.js";
import {
  createResponseStyleCanonicalMatch,
  isSupportedResponseStyleTemplate,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  type ResponseStyleCanonicalMatch,
  type ResponseStyleFamily,
  type ResponseStyleSemanticConfidence,
} from "./response-style-semantic.js";
import {
  storeApprovedApiWorkaroundSemanticEmbedding,
  storeApprovedEnvironmentConstraintSemanticEmbedding,
  storeApprovedWorkflowToolGotchaSemanticEmbedding,
} from "./semantic-retrieval-routing.js";
import {
  type WorkflowImprovementLifecycleInspection,
  type WorkflowImprovementSubjectEntry,
  inspectWorkflowImprovementLifecycle,
  isExpiredPendingWorkflowImprovementCandidate,
  supersedeApprovedWorkflowImprovementSubjectEntries,
} from "./workflow-improvement-lifecycle.js";
import {
  createGeneralizedWorkflowImprovementMatch,
  type WorkflowImprovementCanonicalMatch,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
} from "./workflow-improvement-semantic.js";
import {
  findApprovedWorkflowPhrasePatternMatch,
  maybeInduceWorkflowPhrasePattern,
} from "./workflow-phrase-induction.js";

function isLegacySemanticFallbackEnabled(): boolean {
  return process.env.OPENCLAW_ENABLE_LEGACY_SEMANTIC_FALLBACK === "1";
}

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AUTO_CAPTURE_SOURCE = "ordinary_turn_auto_capture";
const AUTO_PROMOTION_SOURCE = "ordinary_turn_auto_promotion";
const RESPONSE_STYLE_FORGET_SOURCE = "response_style_forget_request";
const AUTO_CAPTURE_ALLOWED_ROLES = new Set(["user"]);
const DEFAULT_ALLOWED_AGENTS = new Set(["chief", "main"]);
const CANDIDATE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const CORRECTION_PREFIX =
  "(?:actually,?|correction:|no,?|i meant,?|that(?:'|’)s not right,?|sorry,?)\\s*";
const PROJECT_FACT_FIELD_LABEL_TO_KEY: Record<string, ProjectFactFieldKey> = {
  "default branch": "default_branch",
  "staging branch": "staging_branch",
  "repository url": "repository_url",
  "deployment url": "deployment_url",
  "documentation url": "documentation_url",
  "runbook url": "runbook_url",
  "primary package manager": "primary_package_manager",
  "primary environment name": "primary_environment_name",
};
const PROJECT_FACT_VALUE_PATTERN = `([a-z0-9#][a-z0-9 _./:?&=%#~-]{0,191})`;
const PREFERENCE_PATTERNS = [
  {
    template: "my_preferred_is" as const,
    pattern:
      /^my preferred ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern: /^my favorite ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
    subjectPrefix: "favorite",
  },
] as const;
const PREFERENCE_CORRECTION_PATTERNS = [
  {
    template: "my_preferred_is" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}my preferred ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$`,
      "i",
    ),
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}my favorite ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$`,
      "i",
    ),
    subjectPrefix: "favorite",
  },
] as const;
const REQUIREMENT_PATTERNS = [
  {
    template: "responses_concise" as const,
    pattern:
      /^(?:please\s+|always\s+)?(?:keep|make) (?:your |the )?(?:responses|reply|replies|answers) (?:concise|brief|short)[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User requirement: keep responses concise.",
  },
  {
    template: "responses_bullets" as const,
    pattern:
      /^(?:please\s+)?(?:use bullet points(?: for me)?|write (?:your )?(?:responses|reply|replies|answers) in bullet points)(?: when listing items)?[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User requirement: use bullet points when listing items.",
  },
  {
    template: "responses_plain_english" as const,
    pattern:
      /^(?:please\s+)?(?:use plain english(?:,?\s+not jargon)?|write (?:your )?(?:responses|reply|replies|answers) in plain english(?:,?\s+not jargon)?)[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User requirement: use plain English.",
  },
  {
    template: "responses_no_tables" as const,
    pattern: /^(?:please\s+)?do not use tables(?: unless i ask)?[.!?]?$/i,
    subject: "response format",
    value: "do not use tables unless the user asks",
    content: "User requirement: do not use tables unless the user asks.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern:
      /^(?:please\s+)?(?:use numbered (?:steps|lists?)|give me numbered (?:steps|lists?)|write (?:your )?(?:responses|reply|replies|answers) in numbered (?:steps|lists?))(?: when (?:giving instructions|walking me through something|explaining steps|explaining instructions))?[.!?]?$/i,
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User requirement: use numbered steps when giving instructions.",
  },
] as const;
const REQUIREMENT_CORRECTION_PATTERNS = [
  {
    template: "responses_concise" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:please\\s+|always\\s+)?(?:keep|make) (?:your |the )?(?:responses|reply|replies|answers) (?:concise|brief|short)[.!?]?$`,
      "i",
    ),
    subject: "response style",
    value: "keep responses concise",
    content: "User correction: keep responses concise.",
  },
  {
    template: "responses_bullets" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:please\\s+)?(?:use bullet points(?: for me)?|write (?:your )?(?:responses|reply|replies|answers) in bullet points)(?: when listing items)?[.!?]?$`,
      "i",
    ),
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User correction: use bullet points when listing items.",
  },
  {
    template: "responses_plain_english" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:(?:please\\s+)?(?:use plain english|write (?:your )?(?:responses|reply|replies|answers) in plain english)(?:,? not jargon)?|plain english,? not jargon)[.!?]?$`,
      "i",
    ),
    subject: "response language",
    value: "use plain English",
    content: "User correction: use plain English.",
  },
  {
    template: "responses_no_tables" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:please\\s+)?do not use tables(?: unless i ask)?[.!?]?$`,
      "i",
    ),
    subject: "response format",
    value: "do not use tables unless the user asks",
    content: "User correction: do not use tables unless the user asks.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:please\\s+)?(?:use numbered (?:steps|lists?)|give me numbered (?:steps|lists?)|write (?:your )?(?:responses|reply|replies|answers) in numbered (?:steps|lists?))(?: when (?:giving instructions|walking me through something|explaining steps|explaining instructions))?[.!?]?$`,
      "i",
    ),
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User correction: use numbered steps when giving instructions.",
  },
] as const;
const PROJECT_FACT_PATTERNS = [
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ${PROJECT_FACT_VALUE_PATTERN}[.!?]?$`,
      "i",
    ),
  },
] as const;
const PROJECT_FACT_CORRECTION_PATTERNS = [
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ${PROJECT_FACT_VALUE_PATTERN}[.!?]?$`,
      "i",
    ),
  },
] as const;
const PREFERENCE_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "my_preferred_is" as const,
    pattern:
      /^user(?: preference(?::| stated explicitly:)|['’]s)? preferred ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern:
      /^user(?: preference(?::| stated explicitly:)|['’]s)? favorite ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "favorite",
  },
] as const;
const REQUIREMENT_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "responses_concise" as const,
    pattern: /^user requirement(?::| stated explicitly:)? keep responses concise[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User requirement: keep responses concise.",
  },
  {
    template: "responses_concise" as const,
    pattern: /^user prefers concise responses[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User requirement: keep responses concise.",
  },
  {
    template: "responses_concise" as const,
    pattern: /^user prefers (?:short|brief) replies[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User requirement: keep responses concise.",
  },
  {
    template: "responses_bullets" as const,
    pattern:
      /^user requirement(?::| stated explicitly:)? use bullet points when listing items[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User requirement: use bullet points when listing items.",
  },
  {
    template: "responses_bullets" as const,
    pattern: /^user prefers bullet(?:-point)? responses[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User requirement: use bullet points when listing items.",
  },
  {
    template: "responses_bullets" as const,
    pattern: /^user prefers bullet points for replies[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User requirement: use bullet points when listing items.",
  },
  {
    template: "responses_plain_english" as const,
    pattern: /^user requirement(?::| stated explicitly:)? use plain english[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User requirement: use plain English.",
  },
  {
    template: "responses_plain_english" as const,
    pattern: /^user prefers plain english responses[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User requirement: use plain English.",
  },
  {
    template: "responses_no_tables" as const,
    pattern:
      /^user requirement(?::| stated explicitly:)? do not use tables unless (?:the )?user asks[.!?]?$/i,
    subject: "response format",
    value: "do not use tables unless the user asks",
    content: "User requirement: do not use tables unless the user asks.",
  },
  {
    template: "responses_no_tables" as const,
    pattern: /^user prefers no tables unless asked[.!?]?$/i,
    subject: "response format",
    value: "do not use tables unless the user asks",
    content: "User requirement: do not use tables unless the user asks.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern:
      /^user requirement(?::| stated explicitly:)? use numbered steps when giving instructions[.!?]?$/i,
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User requirement: use numbered steps when giving instructions.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern: /^user prefers numbered steps for instructions[.!?]?$/i,
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User requirement: use numbered steps when giving instructions.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern: /^user prefers numbered steps when giving instructions[.!?]?$/i,
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User requirement: use numbered steps when giving instructions.",
  },
] as const;
const PROJECT_FACT_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^project fact \\[([a-z0-9][a-z0-9 -]{0,47})\\]: ([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?${PROJECT_FACT_VALUE_PATTERN}["']?[.!?]?$`,
      "i",
    ),
  },
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?${PROJECT_FACT_VALUE_PATTERN}["']?[.!?]?$`,
      "i",
    ),
  },
] as const;
const PREFERENCE_CORRECTION_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "my_preferred_is" as const,
    pattern:
      /^user correction: preferred ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_preferred_is" as const,
    pattern:
      /^user corrected a durable preference: preferred ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern:
      /^user correction: favorite ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "favorite",
  },
  {
    template: "my_favorite_is" as const,
    pattern:
      /^user corrected a durable preference: favorite ([a-z0-9][a-z0-9 -]{0,47}) is ["']?([a-z0-9][a-z0-9 '&/().,-]{0,63})["']?[.!?]?$/i,
    subjectPrefix: "favorite",
  },
] as const;
const PROJECT_FACT_CORRECTION_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^project correction \\[([a-z0-9][a-z0-9 -]{0,47})\\]: ([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?${PROJECT_FACT_VALUE_PATTERN}["']?[.!?]?$`,
      "i",
    ),
  },
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?${PROJECT_FACT_VALUE_PATTERN}["']?(?:\\s*\\(not [^)]+\\))?[.!?]?$`,
      "i",
    ),
  },
] as const;
const REQUIREMENT_CORRECTION_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "responses_concise" as const,
    pattern: /^user correction: keep responses concise[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User correction: keep responses concise.",
  },
  {
    template: "responses_concise" as const,
    pattern:
      /^user correction to response (?:style|format|language) preference: keep replies short[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User correction: keep responses concise.",
  },
  {
    template: "responses_concise" as const,
    pattern:
      /^user corrected response(?:-| )(?:style|format|language) preference: keep replies short[.!?]?$/i,
    subject: "response style",
    value: "keep responses concise",
    content: "User correction: keep responses concise.",
  },
  {
    template: "responses_bullets" as const,
    pattern: /^user correction: use bullet points when listing items[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User correction: use bullet points when listing items.",
  },
  {
    template: "responses_bullets" as const,
    pattern:
      /^user correction to response (?:style|format|language) preference: use bullet points(?: for me)?[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User correction: use bullet points when listing items.",
  },
  {
    template: "responses_bullets" as const,
    pattern:
      /^user corrected response(?:-| )(?:style|format|language) preference: use bullet points(?: for me)?[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User correction: use bullet points when listing items.",
  },
  {
    template: "responses_bullets" as const,
    pattern: new RegExp(`^${CORRECTION_PREFIX}use bullet points(?: for me)?[.!?]?$`, "i"),
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User correction: use bullet points when listing items.",
  },
  {
    template: "responses_plain_english" as const,
    pattern: /^user correction: use plain english(?:,? not jargon)?(?:,? when replying)?[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User correction: use plain English.",
  },
  {
    template: "responses_plain_english" as const,
    pattern:
      /^user correction to response (?:style|format|language) preference: use plain english(?:,? not jargon)?[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User correction: use plain English.",
  },
  {
    template: "responses_plain_english" as const,
    pattern:
      /^user corrected response(?:-| )(?:style|format|language) preference: use plain english(?:,? not jargon)?[.!?]?$/i,
    subject: "response language",
    value: "use plain English",
    content: "User correction: use plain English.",
  },
  {
    template: "responses_plain_english" as const,
    pattern: new RegExp(`^${CORRECTION_PREFIX}plain english,? not jargon[.!?]?$`, "i"),
    subject: "response language",
    value: "use plain English",
    content: "User correction: use plain English.",
  },
  {
    template: "responses_no_tables" as const,
    pattern: /^user correction: do not use tables unless the user asks[.!?]?$/i,
    subject: "response format",
    value: "do not use tables unless the user asks",
    content: "User correction: do not use tables unless the user asks.",
  },
  {
    template: "responses_numbered_steps" as const,
    pattern: /^user correction: use numbered steps when giving instructions[.!?]?$/i,
    subject: "response format",
    value: "use numbered steps when giving instructions",
    content: "User correction: use numbered steps when giving instructions.",
  },
] as const;
const SUBJECT_DENYLIST = new Set([
  "approach",
  "command",
  "fix",
  "implementation",
  "method",
  "plan",
  "procedure",
  "process",
  "project",
  "prompt",
  "repo",
  "spec",
  "task",
  "way",
  "workflow",
]);
const SENSITIVE_TERMS = [
  "address",
  "api key",
  "apikey",
  "auth",
  "bank",
  "card",
  "credit",
  "email",
  "login",
  "otp",
  "passcode",
  "password",
  "phone",
  "pin",
  "routing",
  "secret",
  "social security",
  "ssn",
  "token",
  "2fa",
];
const EXPLICIT_MEMORY_PATTERNS = [
  /\bremember\b/i,
  /\bsave this\b/i,
  /\bstore this\b/i,
  /\bdon'?t forget\b/i,
];
const AUTO_CAPTURE_TRANSCRIPT_SCAN_INTERVAL_MS = 5_000;
const AUTO_CAPTURE_TRANSCRIPT_SCAN_LOOKBACK_MS = 15 * 60_000;
const AUTO_CAPTURE_TRANSCRIPT_SCAN_LIMIT = 12;
const AUTO_CAPTURE_DEFAULT_MULTI_SEGMENT_LIMIT = 24;
const AUTO_CAPTURE_BULK_MULTI_SEGMENT_LIMIT = 48;
const AUTO_CAPTURE_BULK_LIST_ITEM_THRESHOLD = 4;
const AUTO_CAPTURE_BULK_SENTENCE_THRESHOLD = 16;
const AUTO_CAPTURE_CONTEXT_LOOKBACK_MESSAGES = 4;
const AUTO_CAPTURE_CONTEXT_ENTRY_MAX_CHARS = 360;

type SessionTranscriptUpdateLike = {
  sessionFile: string;
  sessionKey?: string;
  message?: unknown;
  messageId?: string;
};

type TranscriptUserMessage = {
  role: "user";
  content: string | Array<{ text?: unknown }>;
  timestamp?: number;
};

type TranscriptMessageRole = "user" | "assistant" | "system" | "tool";
type TranscriptContextEntry = NormalizedTranscriptContextEntry;

type ResolvedAttribution = {
  agentId: string;
  sessionId: string;
  projectId?: string;
};

type OrdinaryTurnAutoCaptureHandlerDeps = {
  resolveAttribution: (params: {
    config: MemoryMiddlewareConfig;
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
  }) => Promise<ResolvedAttribution | null>;
  findExistingByKey: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
  }) => Promise<FindExistingByKeyResult | null>;
  submitCorrectionSuggestion: (input: {
    content: string;
    agentId: string;
    sessionId: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; eventId?: string; memoryObjectId?: string }>;
  submitLearning: (input: {
    content: string;
    agentId: string;
    sessionId: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; eventId?: string; memoryObjectId?: string }>;
  submitProcedureSuggestion: (input: {
    content: string;
    projectId?: string;
    agentId: string;
    sessionId: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; eventId?: string; memoryObjectId?: string }>;
  submitImprovementNote: (input: {
    content: string;
    projectId?: string;
    agentId: string;
    sessionId: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; eventId?: string; memoryObjectId?: string }>;
  reviewCandidate: (input: {
    candidateId: string;
    outcome: "accepted" | "rejected";
    reviewerAgentId?: string;
    rationale?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; reviewId?: string }>;
  promoteToMemory: (input: {
    candidateId: string;
    promoterAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; promotedMemoryObjectId?: string }>;
  promoteToProcedureDraft: (input: {
    candidateId: string;
    promoterAgentId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; procedureId?: string }>;
  validateProcedure: (input: {
    procedureId: string;
    validatorAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{
    accepted: boolean;
    reason?: string;
    procedureId?: string;
    procedureRunId?: string;
  }>;
  inspectResponseStyleLifecycle: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
    subjectKey: string;
    logger?: PluginLogger;
  }) => Promise<ResponseStyleLifecycleInspection | null>;
  inspectProjectFactLifecycle: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
    subjectKey: string;
    projectId?: string;
    logger?: PluginLogger;
  }) => Promise<ProjectFactLifecycleInspection | null>;
  inspectRecurringProcedureLifecycle: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
    subjectKey: string;
    logger?: PluginLogger;
  }) => Promise<RecurringProcedureLifecycleInspection | null>;
  inspectWorkflowImprovementLifecycle: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
    subjectKey: string;
    logger?: PluginLogger;
  }) => Promise<WorkflowImprovementLifecycleInspection | null>;
  forgetApprovedResponseStyleBySubjectKey: (params: {
    config: MemoryMiddlewareConfig;
    subjectKey: string;
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<ResponseStyleForgetResult>;
  supersedeValidatedProceduresBySubjectKey: (params: {
    config: MemoryMiddlewareConfig;
    subjectKey: string;
    supersededByProcedureId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{
    accepted: boolean;
    status: string;
    supersededProcedureIds?: string[];
    reason?: string;
  }>;
};

export type OrdinaryTurnAutoCaptureController = {
  start: () => void;
  stop: () => void;
};

type ResponseStyleDetectionSource = "deterministic" | "semantic";
type ProjectFactDetectionSource = "deterministic" | "semantic";
type RecurringProcedureDetectionSource = "deterministic" | "semantic";
type WorkflowImprovementDetectionSource = "semantic" | "deterministic";

type ResponseStyleCaptureDecision =
  | {
      action: "capture";
      canonicalCandidate: CanonicalMemoryIngestionCandidate;
      confidence: "high" | ResponseStyleSemanticConfidence;
      detectionSource: "deterministic" | "semantic";
      evidence: string[];
      responseStyleFamily: ResponseStyleFamily;
      match: OrdinaryTurnAutoCaptureMatch;
      reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
    }
  | {
      action: "forget";
      confidence: "high";
      detectionSource: ResponseStyleDetectionSource;
      evidence: string[];
      subject: string;
      subjectKey: string;
    };

type ProjectFactCaptureDecision = {
  action: "capture";
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  confidence: "high" | "medium";
  detectionSource: ProjectFactDetectionSource;
  evidence: string[];
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  match: OrdinaryTurnAutoCaptureMatch;
};

type RecurringProcedureCaptureDecision = {
  action: "capture";
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  confidence: "high" | "medium";
  detectionSource: RecurringProcedureDetectionSource;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  match: OrdinaryTurnAutoCaptureMatch;
};

type WorkflowImprovementCaptureDecision = {
  action: "capture";
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  confidence: WorkflowImprovementSemanticConfidence;
  detectionSource: WorkflowImprovementDetectionSource;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  lessonFamily: WorkflowImprovementLessonFamily;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  match: OrdinaryTurnAutoCaptureMatch;
};

const CAPTURE_CLASS_TELEMETRY_LANE_OVERRIDES: Record<
  string,
  OrdinaryTurnAutoCaptureCompatibilityLane | "project_rule" | "unmet_need"
> = {
  explicit_requirement: "response_style",
  requirement_correction: "response_style",
  project_rule_guidance: "project_rule",
  unmet_need_recommendation: "unmet_need",
};

const CAPTURE_CATEGORY_TELEMETRY_FAMILY: Record<
  Exclude<
    NonNullable<ReturnType<typeof getCanonicalCaptureMetadataByCaptureClass>>["category"],
    "project_rule" | "unmet_need"
  >,
  OrdinaryTurnAutoCaptureCompatibilityLane
> = {
  project_fact: "project_fact",
  recurring_procedure: "recurring_procedure",
  workflow_improvement: "workflow_improvement",
};

type FindExistingByKeyResult = {
  id: string;
  reviewState: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function resolveTelemetryLaneFromCaptureClass(
  captureClass: string,
): OrdinaryTurnAutoCaptureCompatibilityLane | "project_rule" | "unmet_need" {
  const override = CAPTURE_CLASS_TELEMETRY_LANE_OVERRIDES[captureClass];
  if (override) {
    return override;
  }
  const captureCategory = getCanonicalCaptureMetadataByCaptureClass(captureClass)?.category;
  if (captureCategory === "project_rule" || captureCategory === "unmet_need") {
    return captureCategory;
  }
  if (captureCategory) {
    return CAPTURE_CATEGORY_TELEMETRY_FAMILY[captureCategory];
  }
  return "preference";
}

function resolvePreferencePlanLaneFromCaptureClass(
  captureClass: string,
): "preference" | "project_fact" {
  return getCanonicalCaptureMetadataByCaptureClass(captureClass)?.category === "project_fact"
    ? "project_fact"
    : "preference";
}

function resolveTelemetryScopeFromMatch(params: {
  projectScope?: string;
  agentExternalKey?: string;
}): "shared" | "project" | "agent" | "agent_project" {
  const agentKey = params.agentExternalKey?.trim().toLowerCase();
  const projectScoped = Boolean(params.projectScope?.trim());
  const agentScoped = Boolean(agentKey && agentKey !== "main" && agentKey !== "chief");
  if (projectScoped && agentScoped) {
    return "agent_project";
  }
  if (projectScoped) {
    return "project";
  }
  if (agentScoped) {
    return "agent";
  }
  return "shared";
}

function stripTranscriptTimestampPrefix(value: string): string {
  return value.replace(/^\[[^\]\n]{1,80}\]\s*/, "");
}

function stripGatewaySenderMetadataPrefix(value: string): string {
  return value.replace(/^Sender \(untrusted metadata\):\n```json[\s\S]*?```\n\n/, "");
}

function containsSensitiveTerm(value: string): boolean {
  const normalized = normalizeLower(value);
  return SENSITIVE_TERMS.some((term) => normalized.includes(term));
}

function looksLikeSensitiveValue(value: string): boolean {
  const normalized = normalizeText(value);
  if (normalized.includes("@") || normalized.includes("://")) {
    return true;
  }
  return containsSensitiveTerm(normalized);
}

function hasExplicitMemoryRequest(value: string): boolean {
  return EXPLICIT_MEMORY_PATTERNS.some((pattern) => pattern.test(value));
}

function hasProcedureLikeSubject(subject: string): boolean {
  const words = normalizeLower(subject).split(" ");
  return words.some((word) => SUBJECT_DENYLIST.has(word));
}

function isProjectUrlFieldSubject(subject: string): boolean {
  const normalized = normalizeLower(subject);
  return (
    normalized === "repository url" ||
    normalized === "deployment url" ||
    normalized === "documentation url" ||
    normalized === "runbook url"
  );
}

function hasSupportedRole(value: unknown): value is "user" {
  return typeof value === "string" && AUTO_CAPTURE_ALLOWED_ROLES.has(value);
}

function hasContextMessageRole(value: unknown): value is TranscriptMessageRole {
  return value === "user" || value === "assistant" || value === "system" || value === "tool";
}

function extractTranscriptMessageText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    const text = content.replace(/\r\n?/g, "\n").trim();
    return text ? text : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const parts = content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return undefined;
      }
      if ("text" in block && typeof block.text === "string") {
        return block.text;
      }
      return undefined;
    })
    .filter((text): text is string => typeof text === "string")
    .map((text) => text.replace(/\r\n?/g, "\n").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function extractTranscriptUserText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const entry = message as TranscriptUserMessage;
  if (!hasSupportedRole(entry.role)) {
    return null;
  }
  return extractTranscriptMessageText(message);
}

function extractTranscriptContextEntry(value: unknown): TranscriptContextEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as {
    type?: unknown;
    tool?: unknown;
    input?: unknown;
    result?: unknown;
    message?: unknown;
  };
  if (entry.message && typeof entry.message === "object") {
    const role = (entry.message as { role?: unknown }).role;
    if (!hasContextMessageRole(role)) {
      return null;
    }
    const text = extractTranscriptMessageText(entry.message);
    if (!text) {
      return null;
    }
    return {
      role,
      text: normalizeText(text).slice(0, AUTO_CAPTURE_CONTEXT_ENTRY_MAX_CHARS),
      timestamp:
        typeof (entry.message as { timestamp?: unknown }).timestamp === "number"
          ? (entry.message as { timestamp?: number }).timestamp
          : undefined,
    };
  }

  if (entry.type === "tool_result" && typeof entry.result === "string") {
    const text = normalizeText(entry.result);
    return text
      ? {
          role: "tool_result",
          text: text.slice(0, AUTO_CAPTURE_CONTEXT_ENTRY_MAX_CHARS),
        }
      : null;
  }

  if (
    entry.type === "tool_use" &&
    typeof entry.tool === "string" &&
    typeof entry.input === "string"
  ) {
    const text = normalizeText(`${entry.tool}: ${entry.input}`);
    return text
      ? {
          role: "tool_use",
          text: text.slice(0, AUTO_CAPTURE_CONTEXT_ENTRY_MAX_CHARS),
        }
      : null;
  }

  return null;
}

async function readRecentTranscriptContextEntries(params: {
  transcriptFile: string;
  currentMessage?: unknown;
}): Promise<TranscriptContextEntry[]> {
  try {
    const raw = await readFile(params.transcriptFile, "utf8");
    const currentText = params.currentMessage
      ? normalizeText(extractTranscriptUserText(params.currentMessage) ?? "")
      : "";
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is unknown => entry !== null)
      .map((entry) => extractTranscriptContextEntry(entry))
      .filter((entry): entry is TranscriptContextEntry => entry !== null);

    if (currentText) {
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!entry) {
          continue;
        }
        if (entry.role === "user" && normalizeText(entry.text) === currentText) {
          entries.splice(index, 1);
          break;
        }
      }
    }

    return entries.slice(-AUTO_CAPTURE_CONTEXT_LOOKBACK_MESSAGES);
  } catch {
    return [];
  }
}

function lowercaseFirstMeaningfulCharacter(value: string): string {
  return value.replace(/^[A-Z]/, (match) => match.toLowerCase());
}

function extractContextualCorrectionPrefix(value: string): {
  prefix: string;
  body: string;
} {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return { prefix: "", body: "" };
  }
  if (/^actually[, ]/i.test(trimmed)) {
    return {
      prefix: "Actually, ",
      body: normalizeText(trimmed.replace(/^actually[, ]+/i, "")),
    };
  }
  if (/^i meant[, ]/i.test(trimmed)) {
    return {
      prefix: "I meant, ",
      body: normalizeText(trimmed.replace(/^i meant[, ]+/i, "")),
    };
  }
  if (/^no[, ]/i.test(trimmed)) {
    return {
      prefix: "No, ",
      body: normalizeText(trimmed.replace(/^no[, ]+/i, "")),
    };
  }
  return { prefix: "", body: trimmed };
}

function applyContextualPrefix(prefix: string, statement: string): string {
  return prefix ? `${prefix}${lowercaseFirstMeaningfulCharacter(statement)}` : statement;
}

function inferProjectScopeFromContextText(value: string): string | null {
  const projectFactMatch = value.match(/^Project (?:fact|correction) \[([^\]]+)\]:/i);
  if (projectFactMatch?.[1]) {
    return normalizeText(projectFactMatch[1]);
  }
  const docsMatch = value.match(/^For project ([a-z0-9][a-z0-9 /_-]{1,80}?) docs[,.:]/i);
  if (docsMatch?.[1]) {
    return normalizeText(docsMatch[1]);
  }
  const projectMatch = value.match(/^For project ([a-z0-9][a-z0-9 /_-]{1,80}?)[,:]/i);
  if (projectMatch?.[1]) {
    return normalizeText(projectMatch[1]).replace(/\s+docs$/i, "");
  }
  const scopedDocsMatch = value.match(/^For ([a-z0-9][a-z0-9 /_-]{1,80}?) docs[,.:]/i);
  if (scopedDocsMatch?.[1]) {
    return normalizeText(scopedDocsMatch[1]);
  }
  return null;
}

function inferProjectFieldStatement(
  value: string,
): { fieldLabel: string; fieldValue: string } | null {
  const match = value.match(
    /^(?:the )?(default branch|staging branch|repository url|deployment url|documentation url|runbook url|primary environment name|primary package manager|package manager)\s+(?:is|=)\s+(.+?)[.!?]?$/i,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    fieldLabel: normalizeText(match[1]),
    fieldValue: normalizeText(match[2]).replace(/[.!?]+$/, ""),
  };
}

function inferProjectFieldValueFromReply(
  value: string,
  fieldKey?: ProjectFactFieldKey,
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const urlMatch = normalized.match(/https?:\/\/\S+/i);
  if (urlMatch?.[0]) {
    return normalizeText(urlMatch[0]).replace(/[.)]+$/, "");
  }
  if (fieldKey === "primary_package_manager") {
    const packageManagerMatch = normalized.match(/\b(pnpm|npm|yarn|bun)\b/i);
    return packageManagerMatch?.[1] ? normalizeText(packageManagerMatch[1]) : null;
  }
  const branchLikeMatch = normalized.match(
    /^(?:use |it(?:'s| is) |the correct one is |the right one is )?([a-z0-9][a-z0-9._/#:-]*)(?: there| instead)?[.!?]?$/i,
  );
  return branchLikeMatch?.[1] ? normalizeText(branchLikeMatch[1]) : null;
}

function inferContextualResponseStyleRawCandidate(
  body: string,
  prefix: string,
  contextEntries: TranscriptContextEntry[],
): string | null {
  const normalized = normalizeLower(body);
  if (!normalized) {
    return null;
  }
  const responseContext = contextEntries.some((entry) =>
    /\b(reply|response|format|style|bullet points|direct answer|plain english|jargon|concise|short)\b/i.test(
      entry.text,
    ),
  );
  if (!responseContext) {
    return null;
  }
  if (/^bullets?[.!?]?$/i.test(body)) {
    return applyContextualPrefix(prefix, "Use bullet points for me.");
  }
  if (/^(?:use )?bullet points(?: for me)?[.!?]?$/i.test(body)) {
    return applyContextualPrefix(prefix, "Use bullet points for me.");
  }
  if (/^(?:start with )?(?:the )?direct answer first[.!?]?$/i.test(body)) {
    return applyContextualPrefix(prefix, "Start with the direct answer first.");
  }
  if (/^plain english(?:,? not jargon)?[.!?]?$/i.test(body)) {
    return applyContextualPrefix(prefix, "Use plain English, not jargon.");
  }
  if (/^(?:keep it )?(?:short|concise|brief)[.!?]?$/i.test(body)) {
    return applyContextualPrefix(prefix, "Keep responses concise.");
  }
  return null;
}

// Legacy degraded-mode helper only.
// Normal runtime should not synthesize semantic raw candidates before the model seam.
async function buildLegacyOrdinaryTurnContextualRawCandidates(params: {
  text: string;
  profile: "user-preference-v1" | "user-preference-v2";
  config: MemoryMiddlewareConfig;
  contextEntries: TranscriptContextEntry[];
}): Promise<string[]> {
  if (params.profile !== "user-preference-v2") {
    return [];
  }

  const normalized = normalizeText(params.text);
  if (!normalized) {
    return [];
  }

  const { prefix, body } = extractContextualCorrectionPrefix(normalized);
  const rawCandidates = new Set<string>();
  const directFieldStatement = inferProjectFieldStatement(body);

  let anchoredProjectScope: string | null = null;
  let anchoredFieldLabel: string | null = null;
  let anchoredFieldKey: ProjectFactFieldKey | undefined;
  let docsScopedProjectScope: string | null = null;

  for (const entry of [...params.contextEntries].reverse()) {
    const projectResolution = await resolveProjectFactIngestion({
      content: entry.text,
      primarySource: "transcript",
      mode: "ordinary_turn",
    });
    if (!anchoredProjectScope) {
      anchoredProjectScope =
        projectResolution?.parsed.projectScope ?? inferProjectScopeFromContextText(entry.text);
    }
    if (!anchoredFieldLabel && projectResolution) {
      anchoredFieldLabel = normalizeText(projectResolution.parsed.subject.split("/").pop() ?? "");
      anchoredFieldKey = projectResolution.fieldKey;
    }

    if (!docsScopedProjectScope && /\b(docs|zh-cn|i18n|localization)\b/i.test(entry.text)) {
      docsScopedProjectScope =
        inferProjectScopeFromContextText(entry.text) ?? anchoredProjectScope ?? null;
    }
  }

  if (anchoredProjectScope && directFieldStatement) {
    rawCandidates.add(
      applyContextualPrefix(
        prefix,
        `For project ${anchoredProjectScope}, the ${directFieldStatement.fieldLabel} is ${directFieldStatement.fieldValue}.`,
      ),
    );
  }

  if (anchoredProjectScope && anchoredFieldLabel && !directFieldStatement) {
    const replacementValue = inferProjectFieldValueFromReply(body, anchoredFieldKey);
    if (replacementValue) {
      rawCandidates.add(
        applyContextualPrefix(
          prefix,
          `For project ${anchoredProjectScope}, the ${anchoredFieldLabel} is ${replacementValue}.`,
        ),
      );
    }
  }

  if (
    docsScopedProjectScope &&
    /^(?:update|use|trust|avoid|do not|don't|dont|not)\b/i.test(body) &&
    /\b(docs|zh-cn|i18n|localization|english docs)\b/i.test(body)
  ) {
    rawCandidates.add(
      applyContextualPrefix(
        prefix,
        `For ${docsScopedProjectScope} docs, ${lowercaseFirstMeaningfulCharacter(body)}.`,
      ).replace(/\.\./g, "."),
    );
  }

  const responseStyleRawCandidate = inferContextualResponseStyleRawCandidate(
    body,
    prefix,
    params.contextEntries,
  );
  if (responseStyleRawCandidate) {
    rawCandidates.add(responseStyleRawCandidate);
  }

  return [...rawCandidates].filter(
    (candidate) => normalizeText(candidate) !== normalized && normalizeText(candidate).length > 0,
  );
}

function shouldKeepAutoCaptureParagraphWhole(value: string): boolean {
  const listItems = value.match(/(?:^|\n)\s*(?:[-*]|\d+\.)\s+\S+/gm) ?? [];
  return listItems.length >= 2;
}

function countStructuredListItems(value: string): number {
  return value.match(/(?:^|\n)\s*(?:[-*]|\d+\.)\s+\S+/gm)?.length ?? 0;
}

function countSentenceCandidates(value: string): number {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((segment) => normalizeText(segment))
    .filter(Boolean).length;
}

function splitAutoCaptureParagraphIntoSegments(value: string): string[] {
  return value
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
}

function normalizeStructuredAutoCaptureParagraph(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
}

function resolveInitialAutoCaptureSegmentLimit(messageText: string): number {
  const normalized = normalizeText(messageText);
  const paragraphCount = normalized ? messageText.split(/\n{2,}/).filter(Boolean).length : 0;
  const listItemCount = countStructuredListItems(messageText);
  const sentenceCount = countSentenceCandidates(messageText);
  const looksBulk =
    hasExplicitMemoryRequest(normalized) ||
    listItemCount >= AUTO_CAPTURE_BULK_LIST_ITEM_THRESHOLD ||
    sentenceCount >= AUTO_CAPTURE_BULK_SENTENCE_THRESHOLD ||
    paragraphCount >= AUTO_CAPTURE_BULK_LIST_ITEM_THRESHOLD;
  return looksBulk
    ? AUTO_CAPTURE_BULK_MULTI_SEGMENT_LIMIT
    : AUTO_CAPTURE_DEFAULT_MULTI_SEGMENT_LIMIT;
}

function extractOrdinaryTurnAutoCaptureSegments(
  messageText: string,
  limit = resolveInitialAutoCaptureSegmentLimit(messageText),
): string[] {
  const cleaned = stripTranscriptTimestampPrefix(
    stripGatewaySenderMetadataPrefix(messageText),
  ).replace(/\r\n?/g, "\n");
  const normalized = normalizeText(cleaned);
  if (!normalized) {
    return [];
  }

  const rawParagraphs = cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const segments: string[] = [];

  for (const paragraph of rawParagraphs.length > 0 ? rawParagraphs : [cleaned]) {
    if (shouldKeepAutoCaptureParagraphWhole(paragraph)) {
      const segment = normalizeStructuredAutoCaptureParagraph(paragraph);
      if (segment) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(...splitAutoCaptureParagraphIntoSegments(paragraph));
  }

  const dedupedSegments = Array.from(
    new Set(segments.map((segment) => normalizeText(segment)).filter(Boolean)),
  );

  if (dedupedSegments.length === 0) {
    return [normalized];
  }

  return dedupedSegments.slice(0, Math.max(1, limit));
}

function extractTranscriptTimestamp(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const timestamp = (message as { timestamp?: unknown }).timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function resolveAgentExternalKeyFromTranscriptFile(sessionFile: string): string | null {
  const match = sessionFile.match(/[\\/]agents[\\/](.+?)[\\/]sessions[\\/]/);
  return match?.[1] ? normalizeText(match[1]) : null;
}

function resolveSessionKeyFromTranscriptFile(sessionFile: string): string | null {
  const parsed = path.parse(sessionFile);
  if (!parsed.base || parsed.base === "sessions.json" || parsed.ext !== ".jsonl") {
    return null;
  }
  const sessionKey = normalizeText(parsed.name);
  return sessionKey ? sessionKey : null;
}

async function readLatestTranscriptUserMessage(
  sessionFile: string,
): Promise<TranscriptUserMessage | null> {
  try {
    const raw = await readFile(sessionFile, "utf8");
    const lines = raw.split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const message = (parsed as { message?: unknown } | null)?.message;
      if (!message || typeof message !== "object") {
        continue;
      }
      const entry = message as TranscriptUserMessage;
      if (hasSupportedRole(entry.role)) {
        return entry;
      }
    }
  } catch {
    // Best effort only.
  }
  return null;
}

async function listRecentTranscriptFiles(agentExternalKeys: Iterable<string>): Promise<string[]> {
  const homeDir = process.env.HOME?.trim();
  if (!homeDir) {
    return [];
  }
  const now = Date.now();
  const files: Array<{ sessionFile: string; mtimeMs: number }> = [];
  for (const agentExternalKey of agentExternalKeys) {
    const sessionsDir = path.join(homeDir, ".openclaw", "agents", agentExternalKey, "sessions");
    let entries: string[];
    try {
      entries = await readdir(sessionsDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl") || entry === "sessions.json") {
        continue;
      }
      const sessionFile = path.join(sessionsDir, entry);
      let fileStat;
      try {
        fileStat = await stat(sessionFile);
      } catch {
        continue;
      }
      if (!fileStat.isFile() || now - fileStat.mtimeMs > AUTO_CAPTURE_TRANSCRIPT_SCAN_LOOKBACK_MS) {
        continue;
      }
      files.push({ sessionFile, mtimeMs: fileStat.mtimeMs });
    }
  }
  return files
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, AUTO_CAPTURE_TRANSCRIPT_SCAN_LIMIT)
    .map((entry) => entry.sessionFile);
}

function buildAutoCaptureKey(params: {
  template: string;
  normalizedSubject: string;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "user-preference-v1",
        params.template,
        params.normalizedSubject,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildAutoCaptureSubjectKey(params: {
  template: string;
  normalizedSubject: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "user-preference-subject",
        params.template,
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function buildPreferenceMatch(params: {
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_preference" | "preference_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_preference_statement" | "explicit_preference_correction";
  normalized: string;
  pattern: RegExp;
  template: "my_preferred_is" | "my_favorite_is";
  subjectPrefix: "preferred" | "favorite";
}): OrdinaryTurnAutoCaptureMatch | null {
  const matched = params.normalized.match(params.pattern);
  if (!matched) {
    return null;
  }
  const subject = normalizeText(matched[1] ?? "");
  const value = normalizeText(matched[2] ?? "")
    .replace(/[.!?]+$/, "")
    .replace(/^["']+|["']+$/g, "");
  const normalizedSubject = normalizeLower(subject);
  const normalizedValue = normalizeLower(value);
  if (!subject || !value) {
    return null;
  }
  if (normalizedSubject.split(" ").length > 4 || normalizedValue.split(" ").length > 6) {
    return null;
  }
  if (
    hasProcedureLikeSubject(subject) ||
    containsSensitiveTerm(subject) ||
    looksLikeSensitiveValue(value)
  ) {
    return null;
  }
  const subjectKey = buildAutoCaptureSubjectKey({
    template: params.template,
    normalizedSubject,
  });
  return {
    profile: params.profile,
    captureClass: params.captureClass,
    candidateKind: params.candidateKind,
    reasonCode: params.reasonCode,
    template: params.template,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content:
      params.captureClass === "preference_correction"
        ? `User correction: ${params.subjectPrefix} ${subject} is ${value}.`
        : `User preference: ${params.subjectPrefix} ${subject} is ${value}.`,
    subjectKey,
    key: buildAutoCaptureKey({
      template: params.template,
      normalizedSubject,
      normalizedValue,
    }),
  };
}

function buildRequirementMatch(params: {
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_requirement" | "requirement_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_requirement_statement" | "explicit_requirement_correction";
  normalized: string;
  template:
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps";
  pattern: RegExp;
  subject: string;
  value: string;
  content: string;
}): OrdinaryTurnAutoCaptureMatch | null {
  if (!params.pattern.test(params.normalized)) {
    return null;
  }
  const subject = normalizeText(params.subject);
  const value = normalizeText(params.value);
  const normalizedSubject = normalizeLower(subject);
  const normalizedValue = normalizeLower(value);
  const subjectKey = buildAutoCaptureSubjectKey({
    template: params.template,
    normalizedSubject,
  });
  return {
    profile: params.profile,
    captureClass: params.captureClass,
    candidateKind: params.candidateKind,
    reasonCode: params.reasonCode,
    template: params.template,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content: params.content,
    subjectKey,
    key: buildAutoCaptureKey({
      template: params.template,
      normalizedSubject,
      normalizedValue,
    }),
  };
}

function buildProjectFactMatch(params: {
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_project_fact" | "project_fact_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_project_fact_statement" | "explicit_project_fact_correction";
  normalized: string;
  pattern: RegExp;
}): OrdinaryTurnAutoCaptureMatch | null {
  const matched = params.normalized.match(params.pattern);
  if (!matched) {
    return null;
  }
  const projectScope = normalizeText(matched[1] ?? "");
  const subject = normalizeText(matched[2] ?? "");
  const value = normalizeText(matched[3] ?? "")
    .replace(/[.!?]+$/, "")
    .replace(/^["']+|["']+$/g, "");
  const normalizedProjectScope = normalizeLower(projectScope);
  const normalizedSubject = normalizeLower(subject);
  const normalizedValue = normalizeLower(value);
  if (!projectScope || !subject || !value) {
    return null;
  }
  if (
    normalizedProjectScope.split(" ").length > 5 ||
    normalizedSubject.split(" ").length > 5 ||
    normalizedValue.split(" ").length > 6
  ) {
    return null;
  }
  if (containsHedgedProjectFactLanguage(value)) {
    return null;
  }
  if (
    containsSensitiveTerm(projectScope) ||
    containsSensitiveTerm(subject) ||
    (looksLikeSensitiveValue(value) && !isProjectUrlFieldSubject(subject))
  ) {
    return null;
  }
  const fieldKey = PROJECT_FACT_FIELD_LABEL_TO_KEY[normalizedSubject];
  const factFamily: ProjectFactFamily = fieldKey ? "supported_field" : "generalized_reference";
  if (
    factFamily === "generalized_reference" &&
    !isBoundedGenericProjectFactReference({ subjectLabel: subject, value })
  ) {
    return null;
  }
  const template =
    factFamily === "supported_field"
      ? "project_fact_named_scope"
      : "project_fact_generalized_named_scope";
  const normalizedCompositeSubject = `${normalizedProjectScope} :: ${normalizedSubject}`;
  const subjectKey = buildAutoCaptureSubjectKey({
    template,
    normalizedSubject: normalizedCompositeSubject,
  });
  return {
    profile: params.profile,
    captureClass: params.captureClass,
    candidateKind: params.candidateKind,
    reasonCode: params.reasonCode,
    template,
    subject: `${projectScope} / ${subject}`,
    value,
    normalizedSubject: normalizedCompositeSubject,
    normalizedValue,
    content:
      params.captureClass === "project_fact_correction"
        ? `Project correction [${projectScope}]: ${subject} is ${value}.`
        : `Project fact [${projectScope}]: ${subject} is ${value}.`,
    subjectKey,
    key: buildAutoCaptureKey({
      template,
      normalizedSubject: normalizedCompositeSubject,
      normalizedValue,
    }),
    projectScope,
    normalizedProjectScope,
    factFamily,
    ...(fieldKey ? { fieldKey } : {}),
  };
}

type OrdinaryTurnTextDetector = {
  id: string;
  detect(normalized: string): OrdinaryTurnAutoCaptureMatch | null;
};

function runOrdinaryTurnTextDetectors(
  detectors: readonly OrdinaryTurnTextDetector[],
  normalized: string,
): OrdinaryTurnAutoCaptureMatch | null {
  for (const detector of detectors) {
    const match = detector.detect(normalized);
    if (match) {
      return match;
    }
  }
  return null;
}

function createPreferenceDetector(params: {
  id: string;
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_preference" | "preference_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_preference_statement" | "explicit_preference_correction";
  pattern: RegExp;
  template: "my_preferred_is" | "my_favorite_is";
  subjectPrefix: "preferred" | "favorite";
}): OrdinaryTurnTextDetector {
  return {
    id: params.id,
    detect: (normalized) =>
      buildPreferenceMatch({
        profile: params.profile,
        captureClass: params.captureClass,
        candidateKind: params.candidateKind,
        reasonCode: params.reasonCode,
        normalized,
        pattern: params.pattern,
        template: params.template,
        subjectPrefix: params.subjectPrefix,
      }),
  };
}

function createRequirementDetector(params: {
  id: string;
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_requirement" | "requirement_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_requirement_statement" | "explicit_requirement_correction";
  pattern: RegExp;
  template:
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps";
  subject: string;
  value: string;
  content: string;
}): OrdinaryTurnTextDetector {
  return {
    id: params.id,
    detect: (normalized) =>
      buildRequirementMatch({
        profile: params.profile,
        captureClass: params.captureClass,
        candidateKind: params.candidateKind,
        reasonCode: params.reasonCode,
        normalized,
        template: params.template,
        pattern: params.pattern,
        subject: params.subject,
        value: params.value,
        content: params.content,
      }),
  };
}

function createProjectFactDetector(params: {
  id: string;
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass: "explicit_project_fact" | "project_fact_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_project_fact_statement" | "explicit_project_fact_correction";
  pattern: RegExp;
}): OrdinaryTurnTextDetector {
  return {
    id: params.id,
    detect: (normalized) =>
      buildProjectFactMatch({
        profile: params.profile,
        captureClass: params.captureClass,
        candidateKind: params.candidateKind,
        reasonCode: params.reasonCode,
        normalized,
        pattern: params.pattern,
      }),
  };
}

const ORDINARY_TURN_PROFILE_V1_DETECTORS: readonly OrdinaryTurnTextDetector[] =
  PREFERENCE_PATTERNS.map((pattern, index) =>
    createPreferenceDetector({
      id: `turn-v1-preference-${index}`,
      profile: "user-preference-v1",
      captureClass: "explicit_preference",
      candidateKind: "learning",
      reasonCode: "explicit_preference_statement",
      pattern: pattern.pattern,
      template: pattern.template,
      subjectPrefix: pattern.subjectPrefix,
    }),
  );

const ORDINARY_TURN_PROFILE_V2_DETECTORS: readonly OrdinaryTurnTextDetector[] = [
  ...PREFERENCE_CORRECTION_PATTERNS.map((pattern, index) =>
    createPreferenceDetector({
      id: `turn-v2-preference-correction-${index}`,
      profile: "user-preference-v2",
      captureClass: "preference_correction",
      candidateKind: "correction",
      reasonCode: "explicit_preference_correction",
      pattern: pattern.pattern,
      template: pattern.template,
      subjectPrefix: pattern.subjectPrefix,
    }),
  ),
  ...PROJECT_FACT_CORRECTION_PATTERNS.map((pattern, index) =>
    createProjectFactDetector({
      id: `turn-v2-project-fact-correction-${index}`,
      profile: "user-preference-v2",
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      reasonCode: "explicit_project_fact_correction",
      pattern: pattern.pattern,
    }),
  ),
  ...REQUIREMENT_CORRECTION_PATTERNS.map((pattern, index) =>
    createRequirementDetector({
      id: `turn-v2-requirement-correction-${index}`,
      profile: "user-preference-v2",
      captureClass: "requirement_correction",
      candidateKind: "correction",
      reasonCode: "explicit_requirement_correction",
      pattern: pattern.pattern,
      template: pattern.template,
      subject: pattern.subject,
      value: pattern.value,
      content: pattern.content,
    }),
  ),
  ...REQUIREMENT_PATTERNS.map((pattern, index) =>
    createRequirementDetector({
      id: `turn-v2-requirement-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      reasonCode: "explicit_requirement_statement",
      pattern: pattern.pattern,
      template: pattern.template,
      subject: pattern.subject,
      value: pattern.value,
      content: pattern.content,
    }),
  ),
  ...PROJECT_FACT_PATTERNS.map((pattern, index) =>
    createProjectFactDetector({
      id: `turn-v2-project-fact-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      reasonCode: "explicit_project_fact_statement",
      pattern: pattern.pattern,
    }),
  ),
  ...PREFERENCE_PATTERNS.map((pattern, index) =>
    createPreferenceDetector({
      id: `turn-v2-preference-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      candidateKind: "learning",
      reasonCode: "explicit_preference_statement",
      pattern: pattern.pattern,
      template: pattern.template,
      subjectPrefix: pattern.subjectPrefix,
    }),
  ),
];

const MANAGED_LEARNING_DETECTORS: readonly OrdinaryTurnTextDetector[] = [
  ...PREFERENCE_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createPreferenceDetector({
      id: `managed-learning-preference-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      candidateKind: "learning",
      reasonCode: "explicit_preference_statement",
      pattern: pattern.pattern,
      template: pattern.template,
      subjectPrefix: pattern.subjectPrefix,
    }),
  ),
  ...REQUIREMENT_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createRequirementDetector({
      id: `managed-learning-requirement-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      reasonCode: "explicit_requirement_statement",
      pattern: pattern.pattern,
      template: pattern.template,
      subject: pattern.subject,
      value: pattern.value,
      content: pattern.content,
    }),
  ),
  ...PROJECT_FACT_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createProjectFactDetector({
      id: `managed-learning-project-fact-${index}`,
      profile: "user-preference-v2",
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      reasonCode: "explicit_project_fact_statement",
      pattern: pattern.pattern,
    }),
  ),
];

const MANAGED_CORRECTION_DETECTORS: readonly OrdinaryTurnTextDetector[] = [
  ...PREFERENCE_CORRECTION_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createPreferenceDetector({
      id: `managed-correction-preference-${index}`,
      profile: "user-preference-v2",
      captureClass: "preference_correction",
      candidateKind: "correction",
      reasonCode: "explicit_preference_correction",
      pattern: pattern.pattern,
      template: pattern.template,
      subjectPrefix: pattern.subjectPrefix,
    }),
  ),
  ...REQUIREMENT_CORRECTION_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createRequirementDetector({
      id: `managed-correction-requirement-${index}`,
      profile: "user-preference-v2",
      captureClass: "requirement_correction",
      candidateKind: "correction",
      reasonCode: "explicit_requirement_correction",
      pattern: pattern.pattern,
      template: pattern.template,
      subject: pattern.subject,
      value: pattern.value,
      content: pattern.content,
    }),
  ),
  ...PROJECT_FACT_CORRECTION_CANDIDATE_CONTENT_PATTERNS.map((pattern, index) =>
    createProjectFactDetector({
      id: `managed-correction-project-fact-${index}`,
      profile: "user-preference-v2",
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      reasonCode: "explicit_project_fact_correction",
      pattern: pattern.pattern,
    }),
  ),
];

/**
 * Legacy bounded plain-text preference parser retained for degraded-mode compatibility
 * and managed tool normalization. Normal runtime semantic ownership lives on the
 * source-window interpreter seam.
 */
export function parseOrdinaryTurnAutoCapturePreference(
  messageText: string,
  profile: "user-preference-v1" | "user-preference-v2" = "user-preference-v1",
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(
    stripTranscriptTimestampPrefix(stripGatewaySenderMetadataPrefix(messageText)),
  );
  if (!normalized || normalized.length < 12 || normalized.length > 120) {
    return null;
  }
  if (
    normalized.includes("\n") ||
    normalized.startsWith("/") ||
    hasExplicitMemoryRequest(normalized)
  ) {
    return null;
  }
  if (containsSensitiveTerm(normalized)) {
    return null;
  }
  return runOrdinaryTurnTextDetectors(
    profile === "user-preference-v2"
      ? ORDINARY_TURN_PROFILE_V2_DETECTORS
      : ORDINARY_TURN_PROFILE_V1_DETECTORS,
    normalized,
  );
}

export function parseAutoCaptureManagedCandidateContent(
  content: string,
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(content);
  if (!normalized || normalized.length < 12 || normalized.length > 140) {
    return null;
  }
  return runOrdinaryTurnTextDetectors(MANAGED_LEARNING_DETECTORS, normalized);
}

export function parseManagedCorrectionCandidateContent(
  content: string,
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(content);
  if (!normalized || normalized.length < 12 || normalized.length > 140) {
    return null;
  }
  return runOrdinaryTurnTextDetectors(MANAGED_CORRECTION_DETECTORS, normalized);
}

function inferSupportedProjectFactFieldKey(
  match: OrdinaryTurnAutoCaptureMatch,
): ProjectFactFieldKey | null {
  if (match.template !== "project_fact_named_scope") {
    return null;
  }
  const fieldLabel = normalizeLower(match.subject.split("/").pop() ?? "");
  return PROJECT_FACT_FIELD_LABEL_TO_KEY[fieldLabel] ?? null;
}

function isGeneralizedProjectFactMatch(match: OrdinaryTurnAutoCaptureMatch): boolean {
  return (
    match.template === "project_fact_generalized_named_scope" ||
    match.factFamily === "generalized_reference"
  );
}

// Legacy degraded-mode helper only.
async function detectLegacyResponseStyleCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  config: MemoryMiddlewareConfig,
  rawCandidates?: string[],
): Promise<ResponseStyleCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }
  const resolution = await resolveResponseStyleIngestion({
    config,
    content: text,
    primarySource: "transcript",
    mode: "ordinary_turn",
    allowPhrasePatternMatch: false,
    rawCandidates,
  });
  if (!resolution) {
    return null;
  }
  if (resolution.action === "forget") {
    return {
      action: "forget",
      confidence: resolution.confidence,
      detectionSource: resolution.detectionSource,
      evidence: resolution.evidence,
      subject: resolution.subject,
      subjectKey: resolution.subjectKey,
    };
  }
  return {
    action: "capture",
    canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: resolution,
      mode: "ordinary_turn",
      captureSeam: AUTO_CAPTURE_SOURCE,
      captureProfile: profile,
    }),
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    responseStyleFamily: resolution.responseStyleFamily,
    match: resolution.parsed,
    reviewMode: resolution.reviewMode,
  };
}

// Legacy degraded-mode helper only.
async function detectLegacyProjectFactCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  rawCandidates?: string[],
): Promise<ProjectFactCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }
  const resolution = await resolveProjectFactIngestion({
    content: text,
    primarySource: "transcript",
    mode: "ordinary_turn",
    rawCandidates,
  });
  if (!resolution) {
    return null;
  }
  return {
    action: "capture",
    canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: resolution,
      mode: "ordinary_turn",
      captureSeam: AUTO_CAPTURE_SOURCE,
      captureProfile: profile,
    }),
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    factFamily: resolution.factFamily,
    ...(resolution.fieldKey ? { fieldKey: resolution.fieldKey } : {}),
    match: resolution.parsed,
  };
}

// Legacy degraded-mode helper only.
async function detectLegacyRecurringProcedureCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  rawCandidates?: string[],
): Promise<RecurringProcedureCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }
  const resolution = await resolveRecurringProcedureIngestion({
    content: text,
    primarySource: "transcript",
    rawCandidates,
  });
  if (!resolution) {
    return null;
  }
  return {
    action: "capture",
    canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: resolution,
      mode: "ordinary_turn",
      captureSeam: AUTO_CAPTURE_SOURCE,
      captureProfile: profile,
    }),
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    procedureFamily: resolution.procedureFamily,
    ...(resolution.procedureKey ? { procedureKey: resolution.procedureKey } : {}),
    match: resolution.parsed,
  };
}

// Legacy degraded-mode helper only.
async function detectLegacyWorkflowImprovementCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  config: MemoryMiddlewareConfig,
  rawCandidates?: string[],
): Promise<WorkflowImprovementCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }

  const resolution = await resolveWorkflowImprovementIngestion({
    config,
    content: text,
    primarySource: "transcript",
    allowPhrasePatternMatch: false,
    rawCandidates,
  });
  if (!resolution) {
    return null;
  }

  return {
    action: "capture",
    canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
      ingestion: resolution,
      mode: "ordinary_turn",
      captureSeam: AUTO_CAPTURE_SOURCE,
      captureProfile: profile,
    }),
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    lessonFamily: resolution.lessonFamily,
    ...(resolution.guidancePattern ? { guidancePattern: resolution.guidancePattern } : {}),
    match: resolution.parsed,
  };
}

async function resolveAttributionWithDatabase(params: {
  config: MemoryMiddlewareConfig;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
}): Promise<ResolvedAttribution | null> {
  if (!params.config.database.url) {
    return null;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const agentsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("agents")}`;
  const sessionsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("sessions")}`;
  return withMemoryMiddlewarePgClient({
    config: params.config,
    run: async (client) => {
      await client.query("begin");
      try {
        const agentResult = await client.query<{ id: string }>(
          `
        insert into ${agentsTable} (external_key, name, role, metadata)
        values ($1, $2, $3, $4::jsonb)
        on conflict (external_key) do update
          set name = excluded.name,
              role = excluded.role,
              updated_at = now()
        returning id::text as id
      `,
          [
            params.agentExternalKey,
            params.agentExternalKey,
            "assistant",
            JSON.stringify({
              source: AUTO_CAPTURE_SOURCE,
            }),
          ],
        );
        const agentId = agentResult.rows[0]?.id;
        if (!agentId) {
          throw new Error("failed to resolve agent attribution");
        }
        const sessionResult = await client.query<{ id: string; project_id: string | null }>(
          `
        insert into ${sessionsTable} (agent_id, session_key, metadata)
        values ($1::uuid, $2, $3::jsonb)
        on conflict (session_key) do update
          set agent_id = excluded.agent_id,
              metadata = ${sessionsTable}.metadata || excluded.metadata,
              updated_at = now()
        returning id::text as id, project_id::text as project_id
      `,
          [
            agentId,
            params.sessionKey,
            JSON.stringify({
              source: AUTO_CAPTURE_SOURCE,
              transcriptFile: params.transcriptFile,
            }),
          ],
        );
        const sessionId = sessionResult.rows[0]?.id;
        if (!sessionId) {
          throw new Error("failed to resolve session attribution");
        }
        await client.query("commit");
        return {
          agentId,
          sessionId,
          ...(sessionResult.rows[0]?.project_id
            ? { projectId: sessionResult.rows[0].project_id }
            : {}),
        };
      } catch (error) {
        try {
          await client.query("rollback");
        } catch {
          // Best effort only.
        }
        throw error;
      }
    },
  });
}

async function findExistingByKeyWithDatabase(params: {
  config: MemoryMiddlewareConfig;
  key: string;
}): Promise<FindExistingByKeyResult | null> {
  if (!params.config.database.url) {
    return null;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("memory_objects")}`;
  return withMemoryMiddlewarePgClient({
    config: params.config,
    run: async (client) => {
      const result = await client.query<{
        id: string;
        review_state: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }>(
        `
        select
          id::text as id,
          review_state::text as review_state,
          metadata,
          created_at::text as created_at
        from ${memoryObjectsTable}
        where (
          metadata->'candidateMetadata'->'autoCapture'->>'key' = $1
          or metadata->'autoCapture'->>'key' = $1
        )
          and review_state in ('candidate', 'approved', 'corrected')
        order by created_at desc
        limit 1
        `,
        [params.key],
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            reviewState: row.review_state,
            ...(row.metadata ? { metadata: row.metadata } : {}),
            createdAt: row.created_at,
          }
        : null;
    },
  });
}

function createDefaultDeps(
  candidateIngress: CandidateIngressPort,
): OrdinaryTurnAutoCaptureHandlerDeps {
  return {
    resolveAttribution: resolveAttributionWithDatabase,
    findExistingByKey: findExistingByKeyWithDatabase,
    submitCorrectionSuggestion: async (input) => candidateIngress.submitCorrectionSuggestion(input),
    submitLearning: async (input) => candidateIngress.submitLearning(input),
    submitProcedureSuggestion: async (input) => candidateIngress.submitProcedureSuggestion(input),
    submitImprovementNote: async (input) => candidateIngress.submitImprovementNote(input),
    async reviewCandidate() {
      return {
        accepted: false,
        reason: "auto-promotion review dependency is not configured",
      };
    },
    async promoteToMemory() {
      return {
        accepted: false,
        reason: "auto-promotion promotion dependency is not configured",
      };
    },
    async promoteToProcedureDraft() {
      return {
        accepted: false,
        reason: "procedure auto-promotion dependency is not configured",
      };
    },
    async validateProcedure() {
      return {
        accepted: false,
        reason: "procedure validation dependency is not configured",
      };
    },
    inspectResponseStyleLifecycle,
    inspectProjectFactLifecycle,
    inspectRecurringProcedureLifecycle,
    inspectWorkflowImprovementLifecycle,
    forgetApprovedResponseStyleBySubjectKey,
    supersedeValidatedProceduresBySubjectKey,
  };
}

function formatLog(message: string, meta: Record<string, unknown>): string {
  return `${message} ${JSON.stringify(meta)}`;
}

function buildResponseStyleSemanticMetadata(params: {
  detectionSource: ResponseStyleDetectionSource;
  confidence: ResponseStyleSemanticConfidence | "high";
  evidence: string[];
}): Record<string, unknown> {
  return buildResponseStyleSemanticDetectionMetadata({
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
  });
}

function buildProjectFactSemanticMetadata(params: {
  detectionSource: ProjectFactDetectionSource;
  confidence: ProjectFactSemanticConfidence | "high";
  evidence: string[];
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
}): Record<string, unknown> {
  return buildProjectFactSemanticDetectionMetadata({
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
    factFamily: params.factFamily,
    ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
  });
}

function buildRecurringProcedureSemanticMetadata(params: {
  detectionSource: RecurringProcedureDetectionSource;
  confidence: RecurringProcedureSemanticConfidence | "high";
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
}): Record<string, unknown> {
  return buildRecurringProcedureSemanticDetectionMetadata({
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
    procedureFamily: params.procedureFamily,
    ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
  });
}

function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: WorkflowImprovementDetectionSource;
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  guidancePattern?: WorkflowImprovementGuidancePattern;
}): Record<string, unknown> {
  return buildWorkflowImprovementSemanticDetectionMetadata({
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
    lessonFamily: params.lessonFamily,
    ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
  });
}

function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
  responseStyleFamily: ResponseStyleFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  return buildPendingConfirmationLifecycleMetadata(params);
}

function buildProjectFactPendingConfirmationMetadata(params: {
  confidence: ProjectFactSemanticConfidence;
  evidence: string[];
  factFamily: ProjectFactFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  fieldKey?: ProjectFactFieldKey;
  clusterKey?: string;
  observedAt?: string;
}): Record<string, unknown> {
  return buildProjectFactPendingConfirmationLifecycleMetadata(params);
}

function buildRecurringProcedurePendingConfirmationMetadata(params: {
  confidence: RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  return buildRecurringProcedurePendingConfirmationLifecycleMetadata(params);
}

function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  guidancePattern?: WorkflowImprovementGuidancePattern;
  observedAt?: string;
  clusterKey?: string;
  contradictionCount?: number;
}): Record<string, unknown> {
  return buildWorkflowImprovementPendingConfirmationLifecycleMetadata(params);
}

function resolveDeferredReviewMode(
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence",
): "pending_confirmation" | "hold_for_more_evidence" {
  return reviewMode === "hold_for_more_evidence"
    ? "hold_for_more_evidence"
    : "pending_confirmation";
}

function shouldSkipImmediateConfirmation(createdAt: string, now = Date.now()): boolean {
  return shouldSkipImmediateResponseStyleConfirmation(createdAt, now);
}

function shouldSkipImmediateProjectFactConfirmation(createdAt: string, now = Date.now()): boolean {
  return shouldSkipImmediateProjectFactLifecycleConfirmation(createdAt, now);
}

function shouldSkipImmediateRecurringProcedureConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  return shouldSkipImmediateRecurringProcedureLifecycleConfirmation(createdAt, now);
}

function shouldSkipImmediateWorkflowImprovementConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  return shouldSkipImmediateWorkflowImprovementLifecycleConfirmation(createdAt, now);
}

function rankOrdinaryTurnAutoCapturePlans(
  plans: readonly OrdinaryTurnAutoCapturePlan[],
): OrdinaryTurnAutoCapturePlan[] {
  return [...plans].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.segmentIndex !== right.segmentIndex) {
      return left.segmentIndex - right.segmentIndex;
    }
    return left.key.localeCompare(right.key);
  });
}

const SUBSCRIBER_CAPTURE_METADATA_OVERRIDES: Partial<
  Record<
    OrdinaryTurnAutoCaptureMatch["captureClass"],
    {
      category?: string;
      source?: string;
      subjectKey?: boolean;
      preferenceKey?: boolean;
    }
  >
> = {
  explicit_preference: {
    category: "user_preference",
    source: "explicit_user_statement",
  },
  preference_correction: {
    category: "user_preference_correction",
    source: "conversational_user_correction",
    subjectKey: true,
    preferenceKey: true,
  },
  explicit_requirement: {
    category: "user_requirement",
    source: "explicit_user_requirement",
  },
  requirement_correction: {
    category: "user_requirement_correction",
    source: "conversational_user_requirement_correction",
    subjectKey: true,
  },
  project_fact_correction: {
    category: "project_fact_correction",
    source: "conversational_project_fact_correction",
    subjectKey: true,
  },
  recurring_procedure_correction: {
    category: "recurring_procedure_correction",
    source: "conversational_recurring_procedure_correction",
    subjectKey: true,
  },
};

function buildSubscriberCaptureMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  timestamp?: string;
  canonicalCandidate?: CanonicalMemoryIngestionCandidate;
  autoCaptureExtras?: Record<string, unknown>;
  extraMetadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const { match } = params;
  const metadata: Record<string, unknown> = {
    autoCapture: {
      source: AUTO_CAPTURE_SOURCE,
      captureSeam: "transcript_subscriber_fallback",
      profile: match.profile,
      captureClass: match.captureClass,
      reasonCode: match.reasonCode,
      template: match.template,
      key: match.key,
      subjectKey: match.subjectKey,
      subject: match.subject,
      normalizedSubject: match.normalizedSubject,
      value: match.value,
      normalizedValue: match.normalizedValue,
      ...(match.responseStyleFamily ? { responseStyleFamily: match.responseStyleFamily } : {}),
      ...(match.projectScope ? { projectScope: match.projectScope } : {}),
      ...(match.normalizedProjectScope
        ? { normalizedProjectScope: match.normalizedProjectScope }
        : {}),
      ...(match.needCategory ? { needCategory: match.needCategory } : {}),
      ...(match.neededCapability ? { neededCapability: match.neededCapability } : {}),
      ...(match.normalizedNeededCapability
        ? { normalizedNeededCapability: match.normalizedNeededCapability }
        : {}),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
      ...(params.autoCaptureExtras ?? {}),
    },
    ...(params.canonicalCandidate
      ? {
          canonicalIngestionCandidate: params.canonicalCandidate,
        }
      : {}),
  };

  const familyCaptureMetadata = getCanonicalCaptureMetadataByCaptureClass(match.captureClass);
  if (familyCaptureMetadata) {
    metadata.category = familyCaptureMetadata.category;
    metadata.source = familyCaptureMetadata.source;
    if (familyCaptureMetadata.subjectKeyMetadata === "subject_key") {
      metadata.subject_key = match.subjectKey;
    }
  }
  const override = SUBSCRIBER_CAPTURE_METADATA_OVERRIDES[match.captureClass];
  if (override?.category) {
    metadata.category = override.category;
  }
  if (override?.source) {
    metadata.source = override.source;
  }
  if (override?.subjectKey) {
    metadata.subject_key = match.subjectKey;
  }
  if (override?.preferenceKey) {
    metadata.preference_key = match.subjectKey;
  }

  return params.extraMetadata ? { ...metadata, ...params.extraMetadata } : metadata;
}

function buildPreferenceDeferredOverflowMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  posture: OrdinaryTurnAutoCapturePosture;
  rank: number;
  candidatePoolSize: number;
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return buildSubscriberCaptureMetadata({
    match: params.match,
    agentExternalKey: params.agentExternalKey,
    sessionKey: params.sessionKey,
    transcriptFile: params.transcriptFile,
    timestamp: observedAt,
    extraMetadata: buildDeferredOverflowMetadata({
      compatibilityLane: "preference",
      posture: params.posture,
      state: "pending_confirmation",
      rank: params.rank,
      candidatePoolSize: params.candidatePoolSize,
      observedAt,
      evidence: [params.match.reasonCode],
      extraLifecycle: {
        preferenceTemplate: params.match.template,
      },
    }),
  });
}

function shouldPromoteDeferredPreferenceCandidate(existing: FindExistingByKeyResult): boolean {
  if (existing.reviewState !== "candidate") {
    return false;
  }
  const lifecycleState = readCandidateLifecycleState(existing.metadata);
  if (lifecycleState !== "pending_confirmation" && lifecycleState !== "hold_for_more_evidence") {
    return false;
  }
  const observedAt = readCandidateObservedAt(existing.metadata) ?? existing.createdAt;
  if (!observedAt) {
    return true;
  }
  return !shouldSkipImmediateConfirmation(observedAt);
}

async function autoPromoteDeferredPreferenceCandidate(params: {
  candidateId: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  promoteToMemory: OrdinaryTurnAutoCaptureHandlerDeps["promoteToMemory"];
  metadata: Record<string, unknown>;
  logContext: Record<string, unknown>;
}): Promise<boolean> {
  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!reviewResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware deferred preference review rejected", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: reviewResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  const promotionResult = await params.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!promotionResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware deferred preference promotion failed", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: promotionResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  params.logger.info(
    formatLog("memory-middleware deferred preference promotion accepted", {
      ...params.logContext,
      candidateId: params.candidateId,
      promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
    }),
  );
  return true;
}

async function rejectCandidateIfPresent(params: {
  candidateId: string;
  subjectKey: string;
  rationale: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  source: string;
}): Promise<void> {
  const result = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "rejected",
    reviewerAgentId: params.reviewerAgentId,
    rationale: params.rationale,
    metadata: {
      source: params.source,
      candidateLifecycle: {
        family: "response_style",
        state: "rejected",
        subjectKey: params.subjectKey,
      },
    },
  });
  if (!result.accepted) {
    params.logger.warn(
      formatLog("memory-middleware response-style candidate rejection failed", {
        candidateId: params.candidateId,
        subjectKey: params.subjectKey,
        reason: result.reason ?? "unknown",
      }),
    );
  }
}

async function autoPromoteResponseStyleCandidate(params: {
  candidateId: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  promoteToMemory: OrdinaryTurnAutoCaptureHandlerDeps["promoteToMemory"];
  metadata: Record<string, unknown>;
  logContext: Record<string, unknown>;
}): Promise<boolean> {
  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!reviewResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware response-style auto-promotion review rejected", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: reviewResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  const promotionResult = await params.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!promotionResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware response-style auto-promotion failed", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: promotionResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  params.logger.info(
    formatLog("memory-middleware response-style auto-promotion accepted", {
      ...params.logContext,
      candidateId: params.candidateId,
      promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
    }),
  );
  return true;
}

async function rejectProjectFactCandidateIfPresent(params: {
  candidateId: string;
  subjectKey: string;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  rationale: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  source: string;
}): Promise<void> {
  const result = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "rejected",
    reviewerAgentId: params.reviewerAgentId,
    rationale: params.rationale,
    metadata: {
      source: params.source,
      candidateLifecycle: {
        family: "project_fact",
        state: "rejected",
        subjectKey: params.subjectKey,
        factFamily: params.factFamily,
        ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      },
    },
  });
  if (!result.accepted) {
    params.logger.warn(
      formatLog("memory-middleware project-fact candidate rejection failed", {
        candidateId: params.candidateId,
        subjectKey: params.subjectKey,
        factFamily: params.factFamily,
        ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
        reason: result.reason ?? "unknown",
      }),
    );
  }
}

async function autoPromoteProjectFactCandidate(params: {
  candidateId: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  promoteToMemory: OrdinaryTurnAutoCaptureHandlerDeps["promoteToMemory"];
  metadata: Record<string, unknown>;
  logContext: Record<string, unknown>;
}): Promise<boolean> {
  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!reviewResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware project-fact auto-promotion review rejected", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: reviewResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  const promotionResult = await params.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!promotionResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware project-fact auto-promotion failed", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: promotionResult.reason ?? "unknown",
      }),
    );
    return false;
  }

  params.logger.info(
    formatLog("memory-middleware project-fact auto-promotion accepted", {
      ...params.logContext,
      candidateId: params.candidateId,
      promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
    }),
  );
  return true;
}

async function rejectRecurringProcedureCandidateIfPresent(params: {
  candidateId: string;
  subjectKey: string;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  rationale: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  source: string;
}): Promise<void> {
  const result = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "rejected",
    reviewerAgentId: params.reviewerAgentId,
    rationale: params.rationale,
    metadata: {
      source: params.source,
      candidateLifecycle: {
        family: "recurring_procedure",
        state: "rejected",
        subjectKey: params.subjectKey,
        procedureFamily: params.procedureFamily,
        ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      },
    },
  });
  if (!result.accepted) {
    params.logger.warn(
      formatLog("memory-middleware recurring-procedure candidate rejection failed", {
        candidateId: params.candidateId,
        subjectKey: params.subjectKey,
        procedureFamily: params.procedureFamily,
        ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
        reason: result.reason ?? "unknown",
      }),
    );
  }
}

async function autoPromoteRecurringProcedureCandidate(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  candidateId: string;
  title: string;
  subjectKey: string;
  captureClass: OrdinaryTurnAutoCaptureMatch["captureClass"];
  correctionPlan?: ReturnType<typeof resolveMemoryCorrectionPlan> | null;
  agentExternalKey: string;
  sessionKey: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  promoteToProcedureDraft: OrdinaryTurnAutoCaptureHandlerDeps["promoteToProcedureDraft"];
  validateProcedure: OrdinaryTurnAutoCaptureHandlerDeps["validateProcedure"];
  supersedeValidatedProceduresBySubjectKey: OrdinaryTurnAutoCaptureHandlerDeps["supersedeValidatedProceduresBySubjectKey"];
  metadata: Record<string, unknown>;
  logContext: Record<string, unknown>;
}): Promise<boolean> {
  if (
    params.captureClass === "recurring_procedure_correction" &&
    (!params.correctionPlan ||
      params.correctionPlan.status !== "execute" ||
      params.correctionPlan.executionKind !== "validated_procedure_supersede")
  ) {
    return false;
  }
  const result = await advanceRecurringProcedureCandidateStages({
    config: params.config,
    cfg: params.cfg,
    candidateId: params.candidateId,
    title: params.title,
    subjectKey: params.subjectKey,
    correctionPlan: params.correctionPlan,
    agentExternalKey: params.agentExternalKey,
    sessionKey: params.sessionKey,
    reviewerAgentId: params.reviewerAgentId,
    logger: params.logger,
    reviewCandidate: params.reviewCandidate,
    promoteToProcedureDraft: params.promoteToProcedureDraft,
    validateProcedure: params.validateProcedure,
    supersedeValidatedProceduresBySubjectKey: params.supersedeValidatedProceduresBySubjectKey,
    metadata: params.metadata,
    logLabel: "recurring-procedure",
    logContext: params.logContext,
  });
  return result.accepted;
}

function buildResponseStyleAutoPromotionMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
  candidateConfirmation?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    autoPromotion: {
      source: AUTO_PROMOTION_SOURCE,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      template: params.match.template,
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      normalizedSubject: params.match.normalizedSubject,
      value: params.match.value,
      normalizedValue: params.match.normalizedValue,
      ...(params.match.responseStyleFamily
        ? { responseStyleFamily: params.match.responseStyleFamily }
        : {}),
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    ...(params.candidateConfirmation
      ? { candidateConfirmation: params.candidateConfirmation }
      : {}),
  };
}

function buildProjectFactAutoPromotionMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
  candidateConfirmation?: Record<string, unknown>;
  autoReview?: {
    outcome: "approve" | "supersede_existing";
    supersedeTargetIds: string[];
    rejectedCandidateIds: string[];
  };
}): Record<string, unknown> {
  return {
    autoPromotion: {
      source: AUTO_PROMOTION_SOURCE,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      value: params.match.value,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.normalizedProjectScope
        ? { normalizedProjectScope: params.match.normalizedProjectScope }
        : {}),
      normalizedSubject: params.match.normalizedSubject,
      normalizedValue: params.match.normalizedValue,
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    ...(params.candidateConfirmation
      ? { candidateConfirmation: params.candidateConfirmation }
      : {}),
    ...(params.autoReview
      ? {
          projectFactAutoReview: {
            family: "project_fact",
            factFamily: params.factFamily,
            outcome: params.autoReview.outcome,
            supersedeTargetIds: params.autoReview.supersedeTargetIds,
            rejectedCandidateIds: params.autoReview.rejectedCandidateIds,
          },
        }
      : {}),
  };
}

function buildRecurringProcedureAutoPromotionMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
  candidateConfirmation?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    autoPromotion: {
      source: AUTO_PROMOTION_SOURCE,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      normalizedSubject: params.match.normalizedSubject,
      title: params.match.title,
      value: params.match.value,
      normalizedValue: params.match.normalizedValue,
      ...(params.match.recommendedAction
        ? { recommendedAction: params.match.recommendedAction }
        : {}),
      ...(params.match.normalizedRecommendedAction
        ? { normalizedRecommendedAction: params.match.normalizedRecommendedAction }
        : {}),
      ...(params.match.avoidAction ? { avoidAction: params.match.avoidAction } : {}),
      ...(params.match.normalizedAvoidAction
        ? { normalizedAvoidAction: params.match.normalizedAvoidAction }
        : {}),
      ...(params.match.rationale ? { rationale: params.match.rationale } : {}),
      ...(params.match.normalizedRationale
        ? { normalizedRationale: params.match.normalizedRationale }
        : {}),
      toolName: "memory_candidate_submit",
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    ...(params.candidateConfirmation
      ? { candidateConfirmation: params.candidateConfirmation }
      : {}),
  };
}

async function rejectWorkflowImprovementCandidateIfPresent(params: {
  candidateId: string;
  subjectKey: string;
  lessonFamily: WorkflowImprovementLessonFamily;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  rationale: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  source: string;
}): Promise<void> {
  const result = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "rejected",
    reviewerAgentId: params.reviewerAgentId,
    rationale: params.rationale,
    metadata: {
      source: params.source,
      candidateLifecycle: {
        family: "workflow_improvement",
        state: "rejected",
        subjectKey: params.subjectKey,
        lessonFamily: params.lessonFamily,
        ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      },
    },
  });
  if (!result.accepted) {
    params.logger.warn(
      formatLog("memory-middleware workflow-improvement candidate rejection failed", {
        candidateId: params.candidateId,
        subjectKey: params.subjectKey,
        lessonFamily: params.lessonFamily,
        ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
        reason: result.reason ?? "unknown",
      }),
    );
  }
}

async function autoPromoteWorkflowImprovementCandidate(params: {
  candidateId: string;
  reviewerAgentId?: string;
  logger: PluginLogger;
  reviewCandidate: OrdinaryTurnAutoCaptureHandlerDeps["reviewCandidate"];
  promoteToMemory: OrdinaryTurnAutoCaptureHandlerDeps["promoteToMemory"];
  metadata: Record<string, unknown>;
  logContext: Record<string, unknown>;
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  sessionKey?: string;
  semanticProfileId?: "environment_constraint" | "workflow_tool_gotcha" | "api_workaround";
  lessonFamily: WorkflowImprovementLessonFamily;
}): Promise<string | null> {
  const reviewResult = await params.reviewCandidate({
    candidateId: params.candidateId,
    outcome: "accepted",
    reviewerAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!reviewResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware workflow-improvement auto-promotion review rejected", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: reviewResult.reason ?? "unknown",
      }),
    );
    return null;
  }

  const promotionResult = await params.promoteToMemory({
    candidateId: params.candidateId,
    promoterAgentId: params.reviewerAgentId,
    metadata: params.metadata,
  });
  if (!promotionResult.accepted) {
    params.logger.warn(
      formatLog("memory-middleware workflow-improvement auto-promotion failed", {
        ...params.logContext,
        candidateId: params.candidateId,
        reason: promotionResult.reason ?? "unknown",
      }),
    );
    return null;
  }

  if (
    params.semanticProfileId === "environment_constraint" &&
    promotionResult.promotedMemoryObjectId
  ) {
    await storeApprovedEnvironmentConstraintSemanticEmbedding({
      config: params.config,
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
      logger: params.logger,
    });
  } else if (
    params.semanticProfileId === "workflow_tool_gotcha" &&
    promotionResult.promotedMemoryObjectId
  ) {
    await storeApprovedWorkflowToolGotchaSemanticEmbedding({
      config: params.config,
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
      logger: params.logger,
    });
  } else if (
    params.semanticProfileId === "api_workaround" &&
    promotionResult.promotedMemoryObjectId
  ) {
    await storeApprovedApiWorkaroundSemanticEmbedding({
      config: params.config,
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      memoryObjectId: promotionResult.promotedMemoryObjectId,
      logger: params.logger,
    });
  }

  params.logger.info(
    formatLog("memory-middleware workflow-improvement auto-promotion accepted", {
      ...params.logContext,
      candidateId: params.candidateId,
      promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
    }),
  );
  return promotionResult.promotedMemoryObjectId ?? null;
}

function findConflictingApprovedGeneralizedGuidanceEntries(params: {
  inspection: WorkflowImprovementLifecycleInspection | null | undefined;
  key: string;
  lessonFamily: WorkflowImprovementLessonFamily;
}): WorkflowImprovementSubjectEntry[] {
  return (params.inspection?.activeApprovedSubjectEntries ?? []).filter(
    (entry) => entry.lessonFamily === params.lessonFamily && entry.key && entry.key !== params.key,
  );
}

function findConflictingPendingGeneralizedGuidanceEntries(params: {
  inspection: WorkflowImprovementLifecycleInspection | null | undefined;
  key: string;
  lessonFamily: WorkflowImprovementLessonFamily;
  pendingCandidateId?: string;
}): WorkflowImprovementSubjectEntry[] {
  return (params.inspection?.pendingSubjectCandidates ?? []).filter(
    (entry) =>
      entry.lessonFamily === params.lessonFamily &&
      entry.key &&
      entry.key !== params.key &&
      entry.id !== params.pendingCandidateId,
  );
}

export function createOrdinaryTurnAutoCaptureHandler(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  logger: PluginLogger;
  candidateIngress: CandidateIngressPort;
  soakTelemetry?: MemorySoakTelemetryPort;
  semanticInterpreter?: MemorySemanticInterpreterPort;
  deps?: Partial<OrdinaryTurnAutoCaptureHandlerDeps>;
}): (update: SessionTranscriptUpdateLike) => Promise<void> {
  const autoCapture = params.config.autoCapture ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG;
  const autoPromotion =
    params.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  const allowedAgents = new Set(
    autoCapture.allowedAgents.length > 0 ? autoCapture.allowedAgents : [...DEFAULT_ALLOWED_AGENTS],
  );
  const autoPromotionAgents = new Set(
    autoPromotion.allowedAgents.length > 0
      ? autoPromotion.allowedAgents
      : [...DEFAULT_ALLOWED_AGENTS],
  );
  const deps = {
    ...createDefaultDeps(params.candidateIngress),
    ...params.deps,
  };
  const inFlightKeys = new Set<string>();
  const recentKeys = new Map<string, number>();

  function buildCaptureTelemetryContext(input: {
    captureClass: string;
    key?: string;
    subjectKey?: string;
    projectScope?: string;
    agentExternalKey: string;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
  }) {
    return {
      family: resolveTelemetryLaneFromCaptureClass(input.captureClass),
      scope: resolveTelemetryScopeFromMatch({
        projectScope: input.projectScope,
        agentExternalKey: input.agentExternalKey,
      }),
      captureClass: input.captureClass,
      ...(input.key ? { key: input.key } : {}),
      ...(input.subjectKey ? { subjectKey: input.subjectKey } : {}),
      ...(input.projectScope ? { projectScope: input.projectScope } : {}),
      ...(input.agentExternalKey ? { agentKey: input.agentExternalKey } : {}),
      ...(input.submissionMode ? { submissionMode: input.submissionMode } : {}),
      ...(input.posture ? { posture: input.posture } : {}),
      ...(typeof input.rank === "number" ? { rank: input.rank } : {}),
      ...(typeof input.candidatePoolSize === "number"
        ? { candidatePoolSize: input.candidatePoolSize }
        : {}),
    };
  }

  async function recordCaptureSuppressionTelemetry(input: {
    action: "candidate_duplicate_suppressed" | "candidate_submission_failed";
    reason: string;
    captureClass: string;
    key?: string;
    subjectKey?: string;
    projectScope?: string;
    agentExternalKey: string;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
  }): Promise<void> {
    if (!params.soakTelemetry) {
      return;
    }
    await params.soakTelemetry.record({
      schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
      recordedAt: new Date().toISOString(),
      category: "capture",
      action: input.action,
      source: "ordinary_turn_auto_capture",
      ...buildCaptureTelemetryContext(input),
      accepted: false,
      status: input.action,
      reason: input.reason,
    });
  }

  function markRecent(key: string): void {
    const now = Date.now();
    recentKeys.set(key, now);
    for (const [entryKey, ts] of recentKeys) {
      if (now - ts > 5 * 60_000) {
        recentKeys.delete(entryKey);
      }
    }
  }

  async function handleResponseStyleDecision(decisionParams: {
    decision: ResponseStyleCaptureDecision;
    observedText: string;
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
    turnState: OrdinaryTurnAutoCaptureTurnState;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
    timestamp?: string;
  }): Promise<boolean> {
    if (
      decisionParams.decision.action !== "forget" &&
      decisionParams.submissionMode !== "deferred_overflow" &&
      hasReachedMultiCaptureTurnLimit({
        turnState: decisionParams.turnState,
        posture: decisionParams.posture,
      })
    ) {
      return false;
    }
    const semanticMetadata =
      decisionParams.decision.detectionSource === "semantic"
        ? buildResponseStyleSemanticMetadata({
            detectionSource: decisionParams.decision.detectionSource,
            confidence: decisionParams.decision.confidence,
            evidence: decisionParams.decision.evidence,
          })
        : undefined;

    if (decisionParams.decision.action === "forget") {
      const attribution = await deps.resolveAttribution({
        config: params.config,
        agentExternalKey: decisionParams.agentExternalKey,
        sessionKey: decisionParams.sessionKey,
        transcriptFile: decisionParams.transcriptFile,
      });
      if (!attribution) {
        params.logger.warn(
          formatLog("memory-middleware response-style forget skipped missing attribution", {
            agentExternalKey: decisionParams.agentExternalKey,
            sessionKey: decisionParams.sessionKey,
            subjectKey: decisionParams.decision.subjectKey,
          }),
        );
        await recordCaptureSuppressionTelemetry({
          action: "candidate_submission_failed",
          reason: "missing_attribution",
          captureClass: "response_style_forget",
          key: decisionParams.decision.subjectKey,
          subjectKey: decisionParams.decision.subjectKey,
          agentExternalKey: decisionParams.agentExternalKey,
        });
        return true;
      }
      const inspection = await deps.inspectResponseStyleLifecycle({
        config: params.config,
        key: decisionParams.decision.subjectKey,
        subjectKey: decisionParams.decision.subjectKey,
        logger: params.logger,
      });
      if (inspection?.pendingSubjectCandidateIds.length) {
        for (const candidateId of inspection.pendingSubjectCandidateIds) {
          await rejectCandidateIfPresent({
            candidateId,
            subjectKey: decisionParams.decision.subjectKey,
            rationale: "targeted forget request replaced pending response-style candidate state",
            reviewerAgentId: attribution.agentId,
            logger: params.logger,
            reviewCandidate: deps.reviewCandidate,
            source: RESPONSE_STYLE_FORGET_SOURCE,
          });
        }
      }
      const forgetResult = await deps.forgetApprovedResponseStyleBySubjectKey({
        config: params.config,
        subjectKey: decisionParams.decision.subjectKey,
        reviewerAgentId: attribution.agentId,
        metadata: {
          source: RESPONSE_STYLE_FORGET_SOURCE,
          subject: decisionParams.decision.subject,
          captureSeam: "transcript_subscriber_fallback",
          ...(semanticMetadata ?? {}),
        },
      });
      if (!forgetResult.accepted) {
        params.logger.warn(
          formatLog("memory-middleware response-style forget failed", {
            subjectKey: decisionParams.decision.subjectKey,
            reason: forgetResult.reason,
          }),
        );
      } else {
        params.logger.info(
          formatLog("memory-middleware response-style forget recorded", {
            subjectKey: decisionParams.decision.subjectKey,
            status: forgetResult.status,
            supersededObjectIds: forgetResult.supersededObjectIds,
          }),
        );
      }
      return true;
    }

    const match = decisionParams.decision.match;
    if (inFlightKeys.has(match.key)) {
      return true;
    }

    const inspection = await deps.inspectResponseStyleLifecycle({
      config: params.config,
      key: match.key,
      subjectKey: match.subjectKey,
      logger: params.logger,
    });
    const attribution = await deps.resolveAttribution({
      config: params.config,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
    });
    if (!attribution) {
      params.logger.warn(
        formatLog("memory-middleware ordinary-turn auto-capture skipped missing attribution", {
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_submission_failed",
        reason: "missing_attribution",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      isExpiredPendingResponseStyleCandidate(inspection.pendingCandidate)
    ) {
      await rejectCandidateIfPresent({
        candidateId: inspection.pendingCandidate.id,
        subjectKey: match.subjectKey,
        rationale:
          "response-style candidate confirmation window expired without later confirming evidence",
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        source: "response_style_candidate_confirmation",
      });
    }

    if (
      inspection?.matchingApprovedObjectId &&
      (isResponseStyleLearningMatch(match) || isResponseStyleCorrectionMatch(match))
    ) {
      const targetMatch = createResponseStyleCanonicalMatch({
        template: match.template,
        family: match.responseStyleFamily ?? "supported_template",
        subject: match.subject,
        value: match.value,
      });
      if (isLegacySemanticFallbackEnabled()) {
        await maybeInduceResponseStylePhrasePattern({
          config: params.config,
          candidateIngress: {
            submitImprovementNote: async (input) =>
              deps.submitImprovementNote({
                content: input.content,
                projectId: input.projectId ?? attribution.projectId,
                agentId: input.agentId ?? attribution.agentId,
                sessionId: input.sessionId ?? attribution.sessionId,
                metadata: input.metadata ?? {},
              }),
          },
          candidateReview: { review: deps.reviewCandidate },
          candidatePromotion: { promoteToMemory: deps.promoteToMemory },
          text: decisionParams.observedText,
          ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
          sessionId: attribution.sessionId,
          agentId: attribution.agentId,
          detectionSource: decisionParams.decision.detectionSource,
          targetMatch,
          logger: params.logger,
          source: "response_style_phrase_induction_transcript_auto_capture",
          ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
        });
      }
      params.logger.debug?.(
        formatLog("memory-middleware response-style capture skipped existing approved key", {
          key: match.key,
          memoryObjectId: inspection.matchingApprovedObjectId,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "existing_approved_key",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware response-style capture skipped recent duplicate", {
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "recent_duplicate",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    if (isResponseStyleCorrectionMatch(match) && inspection?.pendingSubjectCandidateIds.length) {
      for (const candidateId of inspection.pendingSubjectCandidateIds) {
        if (candidateId === inspection.pendingCandidate?.id) {
          continue;
        }
        await rejectCandidateIfPresent({
          candidateId,
          subjectKey: match.subjectKey,
          rationale: "high-confidence response-style correction superseded pending candidate state",
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          reviewCandidate: deps.reviewCandidate,
          source: "response_style_candidate_correction_reject",
        });
      }
    }

    const deferredReviewMode =
      decisionParams.submissionMode === "deferred_overflow"
        ? resolveDeferredReviewMode(decisionParams.decision.reviewMode)
        : undefined;
    const effectiveReviewMode = deferredReviewMode ?? decisionParams.decision.reviewMode;
    const overflowReviewMode = resolveDeferredReviewMode(decisionParams.decision.reviewMode);
    const overflowMetadata =
      decisionParams.submissionMode === "deferred_overflow"
        ? buildDeferredOverflowMetadata({
            compatibilityLane: "response_style",
            posture: decisionParams.posture ?? "default",
            state: overflowReviewMode,
            rank: decisionParams.rank ?? 0,
            candidatePoolSize: decisionParams.candidatePoolSize ?? 0,
            observedAt: decisionParams.timestamp,
            evidence: decisionParams.decision.evidence,
            extraLifecycle: {
              responseStyleFamily: decisionParams.decision.responseStyleFamily,
            },
          })
        : undefined;
    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      canonicalCandidate: decisionParams.decision.canonicalCandidate,
      extraMetadata: {
        ...(semanticMetadata ?? {}),
        ...(effectiveReviewMode !== "direct"
          ? buildPendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              responseStyleFamily: decisionParams.decision.responseStyleFamily,
              state: effectiveReviewMode,
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
        ...(overflowMetadata ?? {}),
      },
    });

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingResponseStyleCandidate(inspection.pendingCandidate) &&
      !shouldSkipImmediateConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      const promoted = await autoPromoteResponseStyleCandidate({
        candidateId: inspection.pendingCandidate.id,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        metadata: buildResponseStyleAutoPromotionMetadata({
          match,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: "response_style_confirmation_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          ...(semanticMetadata ? { semanticMetadata } : {}),
          candidateConfirmation: {
            state: "confirmed",
            method: "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            confirmationWindowMs: CANDIDATE_CONFIRMATION_WINDOW_MS,
          },
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          confirmationMode: "repeat_subject_signal",
          confidence: decisionParams.decision.confidence,
        },
      });
      if (promoted) {
        markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "response_style");
        markRecent(match.key);
      }
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingResponseStyleCandidate(inspection.pendingCandidate) &&
      shouldSkipImmediateConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      params.logger.debug?.(
        formatLog("memory-middleware response-style capture skipped immediate duplicate", {
          key: match.key,
          candidateId: inspection.pendingCandidate.id,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "pending_candidate_wait_window",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    const submit =
      match.candidateKind === "correction" ? deps.submitCorrectionSuggestion : deps.submitLearning;
    const result = await submit({
      content: match.content,
      agentId: attribution.agentId,
      sessionId: attribution.sessionId,
      metadata: candidateMetadata,
    });
    if (!result.accepted) {
      params.logger.warn(
        formatLog("memory-middleware ordinary-turn auto-capture submission rejected", {
          key: match.key,
          reason: result.reason ?? "unknown",
        }),
      );
      return true;
    }

    markRecent(match.key);
    if (decisionParams.submissionMode === "deferred_overflow") {
      markTurnDeferredOverflow(decisionParams.turnState, match.key);
    } else {
      markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "response_style");
    }

    const shouldDirectPromote =
      autoPromotion.profile === "explicit-user-preference-v1" &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId &&
      effectiveReviewMode === "direct" &&
      (isResponseStyleLearningMatch(match) || isResponseStyleCorrectionMatch(match));
    const responseStyleCorrectionPlan =
      result.memoryObjectId &&
      match.responseStyleFamily === "generalized_guidance" &&
      isResponseStyleCorrectionMatch(match)
        ? resolveMemoryCorrectionPlan({
            familyId: "response_style",
            trigger: "explicit_correction",
            promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
            activeApprovedSubjectObjectIds: inspection?.activeApprovedSubjectObjectIds ?? [],
          })
        : null;

    if (shouldDirectPromote && result.memoryObjectId) {
      const promoted = await autoPromoteResponseStyleCandidate({
        candidateId: result.memoryObjectId,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        metadata: buildResponseStyleAutoPromotionMetadata({
          match,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: autoPromotion.profile,
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          ...(semanticMetadata ? { semanticMetadata } : {}),
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          confidence: decisionParams.decision.confidence,
        },
      });
      if (promoted) {
        if (isLegacySemanticFallbackEnabled()) {
          await maybeInduceResponseStylePhrasePattern({
            config: params.config,
            candidateIngress: {
              submitImprovementNote: async (input) =>
                deps.submitImprovementNote({
                  content: input.content,
                  projectId: input.projectId ?? attribution.projectId,
                  agentId: input.agentId ?? attribution.agentId,
                  sessionId: input.sessionId ?? attribution.sessionId,
                  metadata: input.metadata ?? {},
                }),
            },
            candidateReview: { review: deps.reviewCandidate },
            candidatePromotion: { promoteToMemory: deps.promoteToMemory },
            text: decisionParams.observedText,
            ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
            sessionId: attribution.sessionId,
            agentId: attribution.agentId,
            detectionSource: decisionParams.decision.detectionSource,
            targetMatch: createResponseStyleCanonicalMatch({
              template:
                match.template === "response_style_generalized_guidance" ||
                isSupportedResponseStyleTemplate(match.template)
                  ? match.template
                  : "response_style_generalized_guidance",
              family: match.responseStyleFamily ?? "supported_template",
              subject: match.subject,
              value: match.value,
            }),
            logger: params.logger,
            source: "response_style_phrase_induction_transcript_auto_capture",
            ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
          });
        }
      }
    }

    if (
      responseStyleCorrectionPlan &&
      isExecutableMemoryObjectCorrectionPlan(responseStyleCorrectionPlan) &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId
    ) {
      const promoted = await executeMemoryObjectCorrectionPlan({
        familyId: "response_style",
        plan: responseStyleCorrectionPlan,
        candidateId: result.memoryObjectId,
        reviewerAgentId: attribution.agentId,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        promotionMetadata: buildResponseStyleAutoPromotionMetadata({
          match,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: "response_style_generalized_correction_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          ...(semanticMetadata ? { semanticMetadata } : {}),
        }),
        config: params.config,
        schema: params.config.database.schema ?? "memory_middleware",
        logger: params.logger,
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          correctionMode: "generic_subject_supersede",
          confidence: decisionParams.decision.confidence,
        },
        logLabel: "response-style correction",
        supersedeRationale:
          "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
        supersedeSource: "response-style-correction-promotion",
        supersedeReason: "candidate_correction_promotion",
        supersedeMetadata: {
          subjectKey: match.subjectKey,
        },
      });
      if (promoted.accepted) {
        if (isLegacySemanticFallbackEnabled()) {
          await maybeInduceResponseStylePhrasePattern({
            config: params.config,
            candidateIngress: {
              submitImprovementNote: async (input) =>
                deps.submitImprovementNote({
                  content: input.content,
                  projectId: input.projectId ?? attribution.projectId,
                  agentId: input.agentId ?? attribution.agentId,
                  sessionId: input.sessionId ?? attribution.sessionId,
                  metadata: input.metadata ?? {},
                }),
            },
            candidateReview: { review: deps.reviewCandidate },
            candidatePromotion: { promoteToMemory: deps.promoteToMemory },
            text: decisionParams.observedText,
            ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
            sessionId: attribution.sessionId,
            agentId: attribution.agentId,
            detectionSource: decisionParams.decision.detectionSource,
            targetMatch: createResponseStyleCanonicalMatch({
              template:
                match.template === "response_style_generalized_guidance" ||
                isSupportedResponseStyleTemplate(match.template)
                  ? match.template
                  : "response_style_generalized_guidance",
              family: match.responseStyleFamily ?? "supported_template",
              subject: match.subject,
              value: match.value,
            }),
            logger: params.logger,
            source: "response_style_phrase_induction_transcript_auto_capture",
            ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
          });
        }
      }
    }

    params.logger.info(
      formatLog("memory-middleware ordinary-turn response-style capture accepted", {
        key: match.key,
        profile: match.profile,
        captureClass: match.captureClass,
        candidateKind: match.candidateKind,
        confidence: decisionParams.decision.confidence,
        confirmationMode: effectiveReviewMode,
        eventId: result.eventId,
        memoryObjectId: result.memoryObjectId,
      }),
    );
    return true;
  }

  async function handleProjectFactDecision(decisionParams: {
    decision: ProjectFactCaptureDecision;
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
    turnState: OrdinaryTurnAutoCaptureTurnState;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
    timestamp?: string;
  }): Promise<boolean> {
    if (
      decisionParams.submissionMode !== "deferred_overflow" &&
      hasReachedMultiCaptureTurnLimit({
        turnState: decisionParams.turnState,
        posture: decisionParams.posture,
      })
    ) {
      return false;
    }
    const match = decisionParams.decision.match;
    if (inFlightKeys.has(match.key)) {
      return true;
    }

    const semanticMetadata =
      decisionParams.decision.detectionSource === "semantic"
        ? buildProjectFactSemanticMetadata({
            detectionSource: decisionParams.decision.detectionSource,
            confidence: decisionParams.decision.confidence,
            evidence: decisionParams.decision.evidence,
            factFamily: decisionParams.decision.factFamily,
            ...(decisionParams.decision.fieldKey
              ? { fieldKey: decisionParams.decision.fieldKey }
              : {}),
          })
        : undefined;

    const attribution = await deps.resolveAttribution({
      config: params.config,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
    });
    if (!attribution) {
      params.logger.warn(
        formatLog("memory-middleware project-fact capture skipped missing attribution", {
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_submission_failed",
        reason: "missing_attribution",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }
    const inspection = await deps.inspectProjectFactLifecycle({
      config: params.config,
      key: match.key,
      subjectKey: match.subjectKey,
      ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
      logger: params.logger,
    });

    if (
      inspection?.pendingCandidate &&
      isExpiredPendingProjectFactCandidate(inspection.pendingCandidate)
    ) {
      await rejectProjectFactCandidateIfPresent({
        candidateId: inspection.pendingCandidate.id,
        subjectKey: match.subjectKey,
        factFamily: decisionParams.decision.factFamily,
        ...(decisionParams.decision.fieldKey ? { fieldKey: decisionParams.decision.fieldKey } : {}),
        rationale:
          "project-fact candidate confirmation window expired without later confirming evidence",
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        source: "project_fact_candidate_confirmation",
      });
    }

    if (inspection?.matchingApprovedObjectId && match.captureClass === "explicit_project_fact") {
      params.logger.debug?.(
        formatLog("memory-middleware project-fact capture skipped existing approved key", {
          key: match.key,
          memoryObjectId: inspection.matchingApprovedObjectId,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "existing_approved_key",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware project-fact capture skipped recent duplicate", {
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "recent_duplicate",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    if (
      match.captureClass === "project_fact_correction" &&
      inspection?.pendingSubjectCandidateIds.length
    ) {
      for (const candidateId of inspection.pendingSubjectCandidateIds) {
        if (candidateId === inspection.pendingCandidate?.id) {
          continue;
        }
        await rejectProjectFactCandidateIfPresent({
          candidateId,
          subjectKey: match.subjectKey,
          factFamily: decisionParams.decision.factFamily,
          ...(decisionParams.decision.fieldKey
            ? { fieldKey: decisionParams.decision.fieldKey }
            : {}),
          rationale: "high-confidence project-fact correction superseded pending candidate state",
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          reviewCandidate: deps.reviewCandidate,
          source: "project_fact_candidate_correction_reject",
        });
      }
    }

    const deferredReviewMode =
      decisionParams.submissionMode === "deferred_overflow"
        ? resolveDeferredReviewMode(decisionParams.decision.reviewMode)
        : undefined;
    const effectiveReviewMode = deferredReviewMode ?? decisionParams.decision.reviewMode;
    const overflowMetadata =
      decisionParams.submissionMode === "deferred_overflow"
        ? buildDeferredOverflowMetadata({
            compatibilityLane: "project_fact",
            posture: decisionParams.posture ?? "default",
            state: resolveDeferredReviewMode(decisionParams.decision.reviewMode),
            rank: decisionParams.rank ?? 0,
            candidatePoolSize: decisionParams.candidatePoolSize ?? 0,
            observedAt: decisionParams.timestamp,
            evidence: decisionParams.decision.evidence,
            extraLifecycle: {
              factFamily: decisionParams.decision.factFamily,
              ...(decisionParams.decision.fieldKey
                ? { fieldKey: decisionParams.decision.fieldKey }
                : {}),
              ...(isGeneralizedProjectFactMatch(match) ? { clusterKey: match.key } : {}),
            },
          })
        : undefined;

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      canonicalCandidate: decisionParams.decision.canonicalCandidate,
      autoCaptureExtras: {
        factFamily: decisionParams.decision.factFamily,
        ...(decisionParams.decision.fieldKey ? { fieldKey: decisionParams.decision.fieldKey } : {}),
      },
      extraMetadata: {
        ...(semanticMetadata ?? {}),
        ...(match.captureClass === "explicit_project_fact" && effectiveReviewMode !== "direct"
          ? buildProjectFactPendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              factFamily: decisionParams.decision.factFamily,
              state: effectiveReviewMode,
              ...(decisionParams.decision.fieldKey
                ? { fieldKey: decisionParams.decision.fieldKey }
                : {}),
              ...(isGeneralizedProjectFactMatch(match) ? { clusterKey: match.key } : {}),
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
        ...(overflowMetadata ?? {}),
      },
    });

    if (
      isGeneralizedProjectFactMatch(match) &&
      match.captureClass === "explicit_project_fact" &&
      inspection?.activeApprovedSubjectObjectIds.length &&
      !inspection.matchingApprovedObjectId
    ) {
      params.logger.debug?.(
        formatLog(
          "memory-middleware generic project-fact capture blocked conflicting approved subject",
          {
            key: match.key,
            subjectKey: match.subjectKey,
            activeApprovedSubjectObjectIds: inspection.activeApprovedSubjectObjectIds,
          },
        ),
      );
      markRecent(match.key);
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingProjectFactCandidate(inspection.pendingCandidate) &&
      !shouldSkipImmediateProjectFactConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      const promoted = await autoPromoteProjectFactCandidate({
        candidateId: inspection.pendingCandidate.id,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        metadata: buildProjectFactAutoPromotionMetadata({
          match,
          factFamily: decisionParams.decision.factFamily,
          ...(decisionParams.decision.fieldKey
            ? { fieldKey: decisionParams.decision.fieldKey }
            : {}),
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: isGeneralizedProjectFactMatch(match)
            ? "project_fact_generalized_confirmation_v1"
            : "project_fact_confirmation_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          ...(semanticMetadata ? { semanticMetadata } : {}),
          candidateConfirmation: {
            state: "confirmed",
            method: isGeneralizedProjectFactMatch(match)
              ? "generalized_cluster_auto_review"
              : "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            confirmationWindowMs: CANDIDATE_CONFIRMATION_WINDOW_MS,
            ...(isGeneralizedProjectFactMatch(match) ? { clusterKey: match.key } : {}),
          },
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          factFamily: decisionParams.decision.factFamily,
          ...(decisionParams.decision.fieldKey
            ? { fieldKey: decisionParams.decision.fieldKey }
            : {}),
          confirmationMode: isGeneralizedProjectFactMatch(match)
            ? "generalized_cluster_auto_review"
            : "repeat_subject_signal",
          confidence: decisionParams.decision.confidence,
        },
      });
      if (promoted) {
        markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "project_fact");
        markRecent(match.key);
      }
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingProjectFactCandidate(inspection.pendingCandidate) &&
      shouldSkipImmediateProjectFactConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      params.logger.debug?.(
        formatLog("memory-middleware project-fact capture skipped immediate duplicate", {
          key: match.key,
          candidateId: inspection.pendingCandidate.id,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "pending_candidate_wait_window",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    const submit =
      match.candidateKind === "correction" ? deps.submitCorrectionSuggestion : deps.submitLearning;
    const result = await submit({
      content: match.content,
      ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
      agentId: attribution.agentId,
      sessionId: attribution.sessionId,
      metadata: candidateMetadata,
    });
    if (!result.accepted) {
      params.logger.warn(
        formatLog("memory-middleware project-fact submission rejected", {
          key: match.key,
          reason: result.reason ?? "unknown",
        }),
      );
      return true;
    }

    markRecent(match.key);
    if (decisionParams.submissionMode === "deferred_overflow") {
      markTurnDeferredOverflow(decisionParams.turnState, match.key);
    } else {
      markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "project_fact");
    }

    const projectFactCorrectionPlan =
      result.memoryObjectId &&
      decisionParams.submissionMode !== "deferred_overflow" &&
      match.captureClass === "project_fact_correction"
        ? resolveMemoryCorrectionPlan({
            familyId: "project_fact",
            trigger: "explicit_correction",
            promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
            activeApprovedSubjectObjectIds: inspection?.activeApprovedSubjectObjectIds ?? [],
          })
        : null;

    if (
      projectFactCorrectionPlan &&
      isExecutableMemoryObjectCorrectionPlan(projectFactCorrectionPlan) &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId
    ) {
      await executeMemoryObjectCorrectionPlan({
        familyId: "project_fact",
        plan: projectFactCorrectionPlan,
        candidateId: result.memoryObjectId,
        reviewerAgentId: attribution.agentId,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        promotionMetadata: buildProjectFactAutoPromotionMetadata({
          match,
          factFamily: decisionParams.decision.factFamily,
          ...(decisionParams.decision.fieldKey
            ? { fieldKey: decisionParams.decision.fieldKey }
            : {}),
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: isGeneralizedProjectFactMatch(match)
            ? "project_fact_generalized_correction_v1"
            : "project_fact_correction_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          ...(semanticMetadata ? { semanticMetadata } : {}),
        }),
        config: params.config,
        schema: params.config.database.schema ?? "memory_middleware",
        logger: params.logger,
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          factFamily: decisionParams.decision.factFamily,
          ...(decisionParams.decision.fieldKey
            ? { fieldKey: decisionParams.decision.fieldKey }
            : {}),
          confidence: decisionParams.decision.confidence,
          correctionPromotion: true,
        },
        logLabel: "project-fact correction",
        supersedeRationale:
          "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
        supersedeSource: "project-fact-correction-promotion",
        supersedeReason: "candidate_correction_promotion",
        supersedeMetadata: {
          subjectKey: match.subjectKey,
        },
      });
    }

    params.logger.info(
      formatLog("memory-middleware ordinary-turn project-fact capture accepted", {
        key: match.key,
        factFamily: decisionParams.decision.factFamily,
        ...(decisionParams.decision.fieldKey ? { fieldKey: decisionParams.decision.fieldKey } : {}),
        profile: match.profile,
        captureClass: match.captureClass,
        candidateKind: match.candidateKind,
        confidence: decisionParams.decision.confidence,
        reviewMode: effectiveReviewMode,
        eventId: result.eventId,
        memoryObjectId: result.memoryObjectId,
      }),
    );
    return true;
  }

  async function handleRecurringProcedureDecision(decisionParams: {
    decision: RecurringProcedureCaptureDecision;
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
    turnState: OrdinaryTurnAutoCaptureTurnState;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
    timestamp?: string;
  }): Promise<boolean> {
    if (
      decisionParams.submissionMode !== "deferred_overflow" &&
      hasReachedMultiCaptureTurnLimit({
        turnState: decisionParams.turnState,
        posture: decisionParams.posture,
      })
    ) {
      return false;
    }
    const match = decisionParams.decision.match;
    const resolvedTitle =
      match.title ??
      (decisionParams.decision.procedureKey
        ? getRecurringProcedureTitle(decisionParams.decision.procedureKey)
        : match.subject);
    if (inFlightKeys.has(match.key)) {
      return true;
    }

    const semanticMetadata = buildRecurringProcedureSemanticMetadata({
      detectionSource: decisionParams.decision.detectionSource,
      confidence: decisionParams.decision.confidence,
      evidence: decisionParams.decision.evidence,
      procedureFamily: decisionParams.decision.procedureFamily,
      ...(decisionParams.decision.procedureKey
        ? { procedureKey: decisionParams.decision.procedureKey }
        : {}),
    });

    const inspection = buildRecurringProcedureStagedInspection(
      await deps.inspectRecurringProcedureLifecycle({
        config: params.config,
        key: match.key,
        subjectKey: match.subjectKey,
        logger: params.logger,
      }),
    );
    const attribution = await deps.resolveAttribution({
      config: params.config,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
    });
    if (!attribution) {
      params.logger.warn(
        formatLog("memory-middleware recurring-procedure capture skipped missing attribution", {
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_submission_failed",
        reason: "missing_attribution",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      isExpiredPendingRecurringProcedureCandidate(inspection.pendingCandidate)
    ) {
      await rejectRecurringProcedureCandidateIfPresent({
        candidateId: inspection.pendingCandidate.id,
        subjectKey: match.subjectKey,
        procedureFamily: decisionParams.decision.procedureFamily,
        ...(decisionParams.decision.procedureKey
          ? { procedureKey: decisionParams.decision.procedureKey }
          : {}),
        rationale:
          "recurring-procedure candidate confirmation window expired without later confirming evidence",
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        source: "recurring_procedure_candidate_confirmation",
      });
    }

    if (inspection?.matchingValidatedProcedureId) {
      params.logger.debug?.(
        formatLog("memory-middleware recurring-procedure capture skipped existing validated key", {
          key: match.key,
          procedureId: inspection.matchingValidatedProcedureId,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "existing_validated_key",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    if (
      match.captureClass !== "recurring_procedure_correction" &&
      inspection?.hasActiveValidatedSubjectTargets
    ) {
      params.logger.debug?.(
        formatLog("memory-middleware recurring-procedure capture skipped existing active title", {
          key: match.key,
          subjectKey: match.subjectKey,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "existing_active_subject",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware recurring-procedure capture skipped recent duplicate", {
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "recent_duplicate",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    if (
      match.captureClass === "recurring_procedure_correction" &&
      inspection?.pendingSubjectCandidateIds.length
    ) {
      for (const candidateId of inspection.pendingSubjectCandidateIds) {
        if (candidateId === inspection.pendingCandidate?.id) {
          continue;
        }
        await rejectRecurringProcedureCandidateIfPresent({
          candidateId,
          subjectKey: match.subjectKey,
          procedureFamily: decisionParams.decision.procedureFamily,
          ...(decisionParams.decision.procedureKey
            ? { procedureKey: decisionParams.decision.procedureKey }
            : {}),
          rationale: "recurring-procedure correction superseded pending procedure candidate state",
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          reviewCandidate: deps.reviewCandidate,
          source: "recurring_procedure_candidate_correction_reject",
        });
      }
    }

    const effectiveReviewMode =
      decisionParams.submissionMode === "deferred_overflow"
        ? resolveDeferredReviewMode(decisionParams.decision.reviewMode)
        : decisionParams.decision.reviewMode;
    const overflowMetadata =
      decisionParams.submissionMode === "deferred_overflow"
        ? buildDeferredOverflowMetadata({
            compatibilityLane: "recurring_procedure",
            posture: decisionParams.posture ?? "default",
            state: effectiveReviewMode,
            rank: decisionParams.rank ?? 0,
            candidatePoolSize: decisionParams.candidatePoolSize ?? 0,
            observedAt: decisionParams.timestamp,
            evidence: decisionParams.decision.evidence,
            extraLifecycle: {
              procedureFamily: decisionParams.decision.procedureFamily,
              ...(decisionParams.decision.procedureKey
                ? { procedureKey: decisionParams.decision.procedureKey }
                : {}),
            },
          })
        : undefined;

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      canonicalCandidate: decisionParams.decision.canonicalCandidate,
      autoCaptureExtras: {
        procedureFamily: decisionParams.decision.procedureFamily,
        ...(decisionParams.decision.procedureKey
          ? { procedureKey: decisionParams.decision.procedureKey }
          : {}),
        title: resolvedTitle,
        steps: match.steps ?? [],
      },
      extraMetadata: {
        ...(semanticMetadata ?? {}),
        ...(match.captureClass !== "recurring_procedure_correction" &&
        (decisionParams.decision.confidence === "medium" ||
          effectiveReviewMode === "hold_for_more_evidence")
          ? buildRecurringProcedurePendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              procedureFamily: decisionParams.decision.procedureFamily,
              ...(decisionParams.decision.procedureKey
                ? { procedureKey: decisionParams.decision.procedureKey }
                : {}),
              state: effectiveReviewMode,
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
        ...(overflowMetadata ?? {}),
      },
    });
    const recurringProcedureCorrectionPlan =
      decisionParams.submissionMode !== "deferred_overflow" &&
      match.captureClass === "recurring_procedure_correction"
        ? resolveMemoryCorrectionPlan({
            familyId: "recurring_procedure",
            trigger: "explicit_correction",
            promotionPolicy: resolveMemoryCorrectionPromotionPolicy(autoPromotion.profile),
            activeValidatedSubjectProcedureIds:
              inspection?.activeValidatedSubjectProcedureIds ?? [],
          })
        : null;

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingRecurringProcedureCandidate(inspection.pendingCandidate) &&
      !shouldSkipImmediateRecurringProcedureConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      const promoted = await autoPromoteRecurringProcedureCandidate({
        config: params.config,
        cfg: params.cfg,
        candidateId: inspection.pendingCandidate.id,
        title: resolvedTitle,
        subjectKey: match.subjectKey,
        captureClass: match.captureClass,
        correctionPlan: recurringProcedureCorrectionPlan,
        agentExternalKey: decisionParams.agentExternalKey,
        sessionKey: decisionParams.sessionKey,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToProcedureDraft: deps.promoteToProcedureDraft,
        validateProcedure: deps.validateProcedure,
        supersedeValidatedProceduresBySubjectKey: deps.supersedeValidatedProceduresBySubjectKey,
        metadata: buildRecurringProcedureAutoPromotionMetadata({
          match,
          procedureFamily: decisionParams.decision.procedureFamily,
          ...(decisionParams.decision.procedureKey
            ? { procedureKey: decisionParams.decision.procedureKey }
            : {}),
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile:
            decisionParams.decision.procedureFamily === "generalized_named_checklist"
              ? "recurring_procedure_generalized_confirmation_v1"
              : "recurring_procedure_confirmation_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          semanticMetadata,
          candidateConfirmation: {
            state: "confirmed",
            method:
              decisionParams.decision.procedureFamily === "generalized_named_checklist"
                ? "generalized_cluster_auto_review"
                : "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            confirmationWindowMs: CANDIDATE_CONFIRMATION_WINDOW_MS,
          },
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          procedureFamily: decisionParams.decision.procedureFamily,
          ...(decisionParams.decision.procedureKey
            ? { procedureKey: decisionParams.decision.procedureKey }
            : {}),
          confirmationMode: "repeat_subject_signal",
          confidence: decisionParams.decision.confidence,
        },
      });
      if (promoted) {
        markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "recurring_procedure");
        markRecent(match.key);
      }
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingRecurringProcedureCandidate(inspection.pendingCandidate) &&
      shouldSkipImmediateRecurringProcedureConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      params.logger.debug?.(
        formatLog("memory-middleware recurring-procedure capture skipped immediate duplicate", {
          key: match.key,
          candidateId: inspection.pendingCandidate.id,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "pending_candidate_wait_window",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    const result = await deps.submitProcedureSuggestion({
      content: match.content,
      projectId: attribution.projectId,
      agentId: attribution.agentId,
      sessionId: attribution.sessionId,
      metadata: candidateMetadata,
    });
    if (!result.accepted) {
      params.logger.warn(
        formatLog("memory-middleware recurring-procedure submission rejected", {
          key: match.key,
          reason: result.reason ?? "unknown",
        }),
      );
      return true;
    }

    markRecent(match.key);
    if (decisionParams.submissionMode === "deferred_overflow") {
      markTurnDeferredOverflow(decisionParams.turnState, match.key);
    } else {
      markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "recurring_procedure");
    }

    const shouldDirectPromote =
      autoPromotion.profile === "explicit-user-preference-v1" &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId &&
      decisionParams.submissionMode !== "deferred_overflow" &&
      ((recurringProcedureCorrectionPlan?.status === "execute" &&
        recurringProcedureCorrectionPlan.executionKind === "validated_procedure_supersede") ||
        (decisionParams.decision.procedureFamily === "supported_key" &&
          decisionParams.decision.confidence === "high"));

    if (shouldDirectPromote && result.memoryObjectId) {
      await autoPromoteRecurringProcedureCandidate({
        config: params.config,
        cfg: params.cfg,
        candidateId: result.memoryObjectId,
        title: resolvedTitle,
        subjectKey: match.subjectKey,
        captureClass: match.captureClass,
        correctionPlan: recurringProcedureCorrectionPlan,
        agentExternalKey: decisionParams.agentExternalKey,
        sessionKey: decisionParams.sessionKey,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToProcedureDraft: deps.promoteToProcedureDraft,
        validateProcedure: deps.validateProcedure,
        supersedeValidatedProceduresBySubjectKey: deps.supersedeValidatedProceduresBySubjectKey,
        metadata: buildRecurringProcedureAutoPromotionMetadata({
          match,
          procedureFamily: decisionParams.decision.procedureFamily,
          ...(decisionParams.decision.procedureKey
            ? { procedureKey: decisionParams.decision.procedureKey }
            : {}),
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile:
            match.captureClass === "recurring_procedure_correction"
              ? decisionParams.decision.procedureFamily === "generalized_named_checklist"
                ? "recurring_procedure_generalized_correction_v1"
                : "recurring_procedure_correction_v1"
              : "recurring_procedure_direct_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          semanticMetadata,
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          procedureFamily: decisionParams.decision.procedureFamily,
          ...(decisionParams.decision.procedureKey
            ? { procedureKey: decisionParams.decision.procedureKey }
            : {}),
          confidence: decisionParams.decision.confidence,
        },
      });
    }

    params.logger.info(
      formatLog("memory-middleware ordinary-turn recurring-procedure capture accepted", {
        key: match.key,
        procedureFamily: decisionParams.decision.procedureFamily,
        ...(decisionParams.decision.procedureKey
          ? { procedureKey: decisionParams.decision.procedureKey }
          : {}),
        title: match.title,
        captureClass: match.captureClass,
        confidence: decisionParams.decision.confidence,
        reviewMode: effectiveReviewMode,
        eventId: result.eventId,
        memoryObjectId: result.memoryObjectId,
      }),
    );
    return true;
  }

  async function handleWorkflowImprovementDecision(decisionParams: {
    decision: WorkflowImprovementCaptureDecision;
    text: string;
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
    turnState: OrdinaryTurnAutoCaptureTurnState;
    submissionMode?: OrdinaryTurnAutoCaptureSubmissionMode;
    posture?: OrdinaryTurnAutoCapturePosture;
    rank?: number;
    candidatePoolSize?: number;
    timestamp?: string;
  }): Promise<boolean> {
    if (
      decisionParams.submissionMode !== "deferred_overflow" &&
      hasReachedMultiCaptureTurnLimit({
        turnState: decisionParams.turnState,
        posture: decisionParams.posture,
      })
    ) {
      return false;
    }
    let effectiveDecision = decisionParams.decision;
    let match = effectiveDecision.match;
    if (inFlightKeys.has(match.key)) {
      return true;
    }

    const attribution = await deps.resolveAttribution({
      config: params.config,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
    });
    if (!attribution) {
      params.logger.warn(
        formatLog("memory-middleware workflow-improvement capture skipped missing attribution", {
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_submission_failed",
        reason: "missing_attribution",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }
    if (
      isLegacySemanticFallbackEnabled() &&
      effectiveDecision.lessonFamily === "generalized_workflow_lesson" &&
      attribution.projectId
    ) {
      const deterministicPattern = await findApprovedWorkflowPhrasePatternMatch({
        config: params.config,
        text: decisionParams.text,
        projectId: attribution.projectId,
        logger: params.logger,
      });
      if (deterministicPattern) {
        const deterministicMatch = toOrdinaryTurnWorkflowImprovementMatch(
          deterministicPattern.match,
        );
        effectiveDecision = {
          action: "capture",
          canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch({
            profileId: resolveWorkflowCaptureProfileId(deterministicPattern.match.captureClass),
            match: deterministicMatch,
            reviewMode: "hold_for_more_evidence",
            detectionSource: "deterministic",
            evidence: ["approved_phrase_pattern_match"],
            observedText: decisionParams.text,
            projectId: attribution.projectId,
            captureSeam: AUTO_CAPTURE_SOURCE,
            captureProfile: match.profile,
          }),
          confidence: "high",
          detectionSource: "deterministic",
          evidence: ["approved_phrase_pattern_match"],
          reviewMode: "hold_for_more_evidence",
          lessonFamily: deterministicPattern.match.lessonFamily,
          ...(deterministicPattern.match.guidancePattern
            ? { guidancePattern: deterministicPattern.match.guidancePattern }
            : {}),
          match: deterministicMatch,
        };
        match = effectiveDecision.match;
      }
    }
    const semanticMetadata = buildWorkflowImprovementSemanticMetadata({
      detectionSource: effectiveDecision.detectionSource,
      confidence: effectiveDecision.confidence,
      evidence: effectiveDecision.evidence,
      lessonFamily: effectiveDecision.lessonFamily,
      ...(effectiveDecision.guidancePattern
        ? { guidancePattern: effectiveDecision.guidancePattern }
        : {}),
    });
    const inspection = await deps.inspectWorkflowImprovementLifecycle({
      config: params.config,
      key: match.key,
      subjectKey: match.subjectKey,
      ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
      logger: params.logger,
    });
    const workflowAutoReviewContext = resolveGeneralizedWorkflowAutoReviewContext({
      lessonFamily: effectiveDecision.lessonFamily,
      captureClass: effectiveDecision.match.captureClass,
    });
    const isGeneralized = workflowAutoReviewContext.isAutoReviewed;
    const generalizedWorkflowProfile = workflowAutoReviewContext.profile;
    const supportsPhraseInduction =
      effectiveDecision.lessonFamily === "generalized_workflow_lesson";
    const canonicalMatchForPhraseInduction: WorkflowImprovementCanonicalMatch | null =
      supportsPhraseInduction && effectiveDecision.guidancePattern
        ? createGeneralizedWorkflowImprovementMatch({
            guidancePattern: effectiveDecision.guidancePattern,
            subject: match.subject,
            ...(match.recommendedAction ? { recommendedAction: match.recommendedAction } : {}),
            ...(match.avoidAction ? { avoidAction: match.avoidAction } : {}),
            ...(match.rationale ? { rationale: match.rationale } : {}),
          })
        : null;
    const conflictingApprovedGeneralizedEntries = isGeneralized
      ? findConflictingApprovedGeneralizedGuidanceEntries({
          inspection,
          key: match.key,
          lessonFamily: effectiveDecision.lessonFamily,
        })
      : [];
    const conflictingPendingGeneralizedEntries = isGeneralized
      ? findConflictingPendingGeneralizedGuidanceEntries({
          inspection,
          key: match.key,
          lessonFamily: effectiveDecision.lessonFamily,
          pendingCandidateId: inspection?.pendingCandidate?.id,
        })
      : [];
    const effectiveReviewMode =
      decisionParams.submissionMode === "deferred_overflow"
        ? resolveDeferredReviewMode(effectiveDecision.reviewMode)
        : effectiveDecision.reviewMode;
    const overflowMetadata =
      decisionParams.submissionMode === "deferred_overflow"
        ? buildDeferredOverflowMetadata({
            compatibilityLane: "workflow_improvement",
            posture: decisionParams.posture ?? "default",
            state: effectiveReviewMode,
            rank: decisionParams.rank ?? 0,
            candidatePoolSize: decisionParams.candidatePoolSize ?? 0,
            observedAt: decisionParams.timestamp,
            evidence: effectiveDecision.evidence,
            extraLifecycle: {
              lessonFamily: effectiveDecision.lessonFamily,
              ...(effectiveDecision.guidancePattern
                ? { guidancePattern: effectiveDecision.guidancePattern }
                : {}),
              ...(isGeneralized ? { clusterKey: match.key } : {}),
            },
          })
        : undefined;

    if (
      inspection?.pendingCandidate &&
      isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)
    ) {
      await rejectWorkflowImprovementCandidateIfPresent({
        candidateId: inspection.pendingCandidate.id,
        subjectKey: match.subjectKey,
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.guidancePattern
          ? { guidancePattern: effectiveDecision.guidancePattern }
          : {}),
        rationale: isGeneralized
          ? `${workflowAutoReviewContext.clusterLabel} expired without enough compatible evidence`
          : "workflow-improvement candidate confirmation window expired without later confirming evidence",
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        source: isGeneralized
          ? workflowAutoReviewContext.autoReviewSource
          : "workflow_improvement_candidate_confirmation",
      });
    }

    if (isGeneralized && conflictingPendingGeneralizedEntries.length > 0) {
      for (const pendingEntry of conflictingPendingGeneralizedEntries) {
        if (isExpiredPendingWorkflowImprovementCandidate(pendingEntry)) {
          await rejectWorkflowImprovementCandidateIfPresent({
            candidateId: pendingEntry.id,
            subjectKey: match.subjectKey,
            lessonFamily: effectiveDecision.lessonFamily,
            ...(effectiveDecision.guidancePattern
              ? { guidancePattern: effectiveDecision.guidancePattern }
              : {}),
            rationale: `older ${workflowAutoReviewContext.clusterLabel} expired without enough compatible evidence`,
            reviewerAgentId: attribution.agentId,
            logger: params.logger,
            reviewCandidate: deps.reviewCandidate,
            source: workflowAutoReviewContext.autoReviewSource,
          });
        }
      }
    }

    if (inspection?.matchingApprovedObjectId) {
      if (supportsPhraseInduction && attribution.projectId && canonicalMatchForPhraseInduction) {
        if (isLegacySemanticFallbackEnabled()) {
          await maybeInduceWorkflowPhrasePattern({
            config: params.config,
            candidateIngress: {
              submitImprovementNote: async (input) =>
                deps.submitImprovementNote({
                  content: input.content,
                  projectId: input.projectId ?? attribution.projectId,
                  agentId: input.agentId ?? attribution.agentId,
                  sessionId: input.sessionId ?? attribution.sessionId,
                  metadata: input.metadata ?? {},
                }),
            },
            candidateReview: { review: deps.reviewCandidate },
            candidatePromotion: { promoteToMemory: deps.promoteToMemory },
            text: decisionParams.text,
            projectId: attribution.projectId,
            sessionId: attribution.sessionId,
            agentId: attribution.agentId,
            detectionSource: effectiveDecision.detectionSource,
            targetMatch: canonicalMatchForPhraseInduction,
            logger: params.logger,
            source: "workflow_phrase_induction_transcript_auto_capture",
            ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
          });
        }
      }
      params.logger.debug?.(
        formatLog("memory-middleware workflow-improvement capture skipped existing approved key", {
          key: match.key,
          memoryObjectId: inspection.matchingApprovedObjectId,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "existing_approved_key",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware workflow-improvement capture skipped recent duplicate", {
          key: match.key,
        }),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason: "recent_duplicate",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      return true;
    }

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      canonicalCandidate: decisionParams.decision.canonicalCandidate,
      autoCaptureExtras: {
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.guidancePattern
          ? { guidancePattern: effectiveDecision.guidancePattern }
          : {}),
        ...(match.recommendedAction ? { recommendedAction: match.recommendedAction } : {}),
        ...(match.normalizedRecommendedAction
          ? { normalizedRecommendedAction: match.normalizedRecommendedAction }
          : {}),
        ...(match.avoidAction ? { avoidAction: match.avoidAction } : {}),
        ...(match.normalizedAvoidAction
          ? { normalizedAvoidAction: match.normalizedAvoidAction }
          : {}),
        ...(match.rationale ? { rationale: match.rationale } : {}),
        ...(match.normalizedRationale ? { normalizedRationale: match.normalizedRationale } : {}),
        ...(match.projectScope ? { projectScope: match.projectScope } : {}),
        ...(match.normalizedProjectScope
          ? { normalizedProjectScope: match.normalizedProjectScope }
          : {}),
        ...(match.needCategory ? { needCategory: match.needCategory } : {}),
        ...(match.neededCapability ? { neededCapability: match.neededCapability } : {}),
        ...(match.normalizedNeededCapability
          ? { normalizedNeededCapability: match.normalizedNeededCapability }
          : {}),
        ...(generalizedWorkflowProfile?.modeMetadata ?? { guidanceMode: "guidance_only" }),
      },
      extraMetadata: {
        ...semanticMetadata,
        ...buildWorkflowImprovementPendingConfirmationMetadata({
          confidence: effectiveDecision.confidence,
          evidence: effectiveDecision.evidence,
          lessonFamily: effectiveDecision.lessonFamily,
          state: effectiveReviewMode,
          ...(effectiveDecision.guidancePattern
            ? { guidancePattern: effectiveDecision.guidancePattern }
            : {}),
          ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
          ...(isGeneralized ? { clusterKey: match.key } : {}),
          ...(isGeneralized
            ? {
                contradictionCount:
                  conflictingApprovedGeneralizedEntries.length +
                  conflictingPendingGeneralizedEntries.filter(
                    (entry) => !isExpiredPendingWorkflowImprovementCandidate(entry),
                  ).length,
              }
            : {}),
        }),
        ...(overflowMetadata ?? {}),
      },
    });

    if (
      isGeneralized &&
      inspection?.pendingCandidate &&
      !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate) &&
      !shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      const contradictoryPendingCandidateIds = conflictingPendingGeneralizedEntries
        .filter((entry) => !isExpiredPendingWorkflowImprovementCandidate(entry))
        .map((entry) => entry.id);
      for (const candidateId of contradictoryPendingCandidateIds) {
        await rejectWorkflowImprovementCandidateIfPresent({
          candidateId,
          subjectKey: match.subjectKey,
          lessonFamily: effectiveDecision.lessonFamily,
          ...(effectiveDecision.guidancePattern
            ? { guidancePattern: effectiveDecision.guidancePattern }
            : {}),
          rationale: `older ${workflowAutoReviewContext.clusterLabel} was replaced by stronger newer conflicting evidence for the same scoped subject`,
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          reviewCandidate: deps.reviewCandidate,
          source: workflowAutoReviewContext.autoReviewSource,
        });
      }

      const workflowCorrectionPlan = resolveMemoryCorrectionPlan({
        familyId: resolveWorkflowCaptureProfileId(effectiveDecision.match.captureClass),
        trigger: "cluster_auto_review",
        conflictingApprovedObjectIds: conflictingApprovedGeneralizedEntries.map(
          (entry) => entry.id,
        ),
      });
      const supersedeTargetIds =
        workflowCorrectionPlan.status === "execute"
          ? workflowCorrectionPlan.supersedeTargetIds
          : [];
      const promotedMemoryObjectId = await autoPromoteWorkflowImprovementCandidate({
        candidateId: inspection.pendingCandidate.id,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        config: params.config,
        cfg: params.cfg,
        sessionKey: decisionParams.sessionKey,
        semanticProfileId: effectiveDecision.match.semanticProfileId,
        lessonFamily: effectiveDecision.lessonFamily,
        metadata: buildWorkflowImprovementAutoReviewMetadata({
          source: AUTO_PROMOTION_SOURCE,
          match,
          lessonFamily: effectiveDecision.lessonFamily,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile:
            generalizedWorkflowProfile?.autoReviewProfile ?? "workflow_generalized_auto_review_v1",
          outcome: supersedeTargetIds.length > 0 ? "supersede_existing" : "approve",
          evidenceCount: 2,
          contradictionCount: supersedeTargetIds.length + contradictoryPendingCandidateIds.length,
          supersedeTargetIds,
          rejectedCandidateIds: contradictoryPendingCandidateIds,
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          semanticMetadata,
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          lessonFamily: effectiveDecision.lessonFamily,
          guidancePattern: effectiveDecision.guidancePattern,
          confidence: effectiveDecision.confidence,
          outcome: supersedeTargetIds.length > 0 ? "supersede_existing" : "approve",
        },
      });
      if (promotedMemoryObjectId && supersedeTargetIds.length > 0) {
        const supersedeResult = await supersedeApprovedWorkflowImprovementSubjectEntries({
          config: params.config,
          targetObjectIds: supersedeTargetIds,
          supersededByObjectId: promotedMemoryObjectId,
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          metadata: {
            clusterKey: match.key,
            subjectKey: match.subjectKey,
            guidancePattern: effectiveDecision.guidancePattern,
            evidenceCount: 2,
          },
        });
        if (!supersedeResult.accepted) {
          params.logger.warn(
            formatLog(workflowAutoReviewContext.supersedeFailureLabel, {
              key: match.key,
              promotedMemoryObjectId,
              reason: supersedeResult.reason ?? "unknown",
            }),
          );
        }
      }
      if (promotedMemoryObjectId) {
        markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "workflow_improvement");
        if (supportsPhraseInduction && attribution.projectId && canonicalMatchForPhraseInduction) {
          if (isLegacySemanticFallbackEnabled()) {
            await maybeInduceWorkflowPhrasePattern({
              config: params.config,
              candidateIngress: {
                submitImprovementNote: async (input) =>
                  deps.submitImprovementNote({
                    content: input.content,
                    projectId: input.projectId ?? attribution.projectId,
                    agentId: input.agentId ?? attribution.agentId,
                    sessionId: input.sessionId ?? attribution.sessionId,
                    metadata: input.metadata ?? {},
                  }),
              },
              candidateReview: { review: deps.reviewCandidate },
              candidatePromotion: { promoteToMemory: deps.promoteToMemory },
              text: decisionParams.text,
              projectId: attribution.projectId,
              sessionId: attribution.sessionId,
              agentId: attribution.agentId,
              detectionSource: effectiveDecision.detectionSource,
              targetMatch: canonicalMatchForPhraseInduction,
              logger: params.logger,
              source: "workflow_phrase_induction_transcript_auto_capture",
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            });
          }
        }
        markRecent(match.key);
      }
      return true;
    }

    if (
      effectiveReviewMode === "pending_confirmation" &&
      inspection?.pendingCandidate &&
      !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate) &&
      !shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt)
    ) {
      const promotedMemoryObjectId = await autoPromoteWorkflowImprovementCandidate({
        candidateId: inspection.pendingCandidate.id,
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        promoteToMemory: deps.promoteToMemory,
        config: params.config,
        cfg: params.cfg,
        sessionKey: decisionParams.sessionKey,
        semanticProfileId: effectiveDecision.match.semanticProfileId,
        lessonFamily: effectiveDecision.lessonFamily,
        metadata: buildWorkflowImprovementAutoPromotionMetadata({
          source: AUTO_PROMOTION_SOURCE,
          match,
          lessonFamily: effectiveDecision.lessonFamily,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile: "workflow_improvement_confirmation_v1",
          ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
          semanticMetadata,
          candidateConfirmation: {
            state: "confirmed",
            method: "repeat_subject_signal",
            confirmationEvidenceCount: 2,
            confirmationWindowMs: CANDIDATE_CONFIRMATION_WINDOW_MS,
          },
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          lessonFamily: effectiveDecision.lessonFamily,
          confidence: effectiveDecision.confidence,
        },
      });
      if (promotedMemoryObjectId) {
        markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "workflow_improvement");
        markRecent(match.key);
      }
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate) &&
      (effectiveReviewMode === "hold_for_more_evidence" ||
        shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt))
    ) {
      params.logger.debug?.(
        formatLog(
          effectiveReviewMode === "hold_for_more_evidence"
            ? "memory-middleware workflow-improvement capture skipped existing held cluster"
            : "memory-middleware workflow-improvement capture skipped immediate duplicate",
          {
            key: match.key,
            candidateId: inspection.pendingCandidate.id,
            lessonFamily: effectiveDecision.lessonFamily,
          },
        ),
      );
      await recordCaptureSuppressionTelemetry({
        action: "candidate_duplicate_suppressed",
        reason:
          effectiveReviewMode === "hold_for_more_evidence"
            ? "existing_held_cluster"
            : "pending_candidate_wait_window",
        captureClass: match.captureClass,
        key: match.key,
        subjectKey: match.subjectKey,
        projectScope: match.projectScope,
        agentExternalKey: decisionParams.agentExternalKey,
        submissionMode: decisionParams.submissionMode,
        posture: decisionParams.posture,
        rank: decisionParams.rank,
        candidatePoolSize: decisionParams.candidatePoolSize,
      });
      markRecent(match.key);
      return true;
    }

    const result = await deps.submitImprovementNote({
      content: match.content,
      ...(attribution.projectId ? { projectId: attribution.projectId } : {}),
      agentId: attribution.agentId,
      sessionId: attribution.sessionId,
      metadata: candidateMetadata,
    });
    if (!result.accepted) {
      params.logger.warn(
        formatLog("memory-middleware workflow-improvement submission rejected", {
          key: match.key,
          reason: result.reason ?? "unknown",
        }),
      );
      return true;
    }

    markRecent(match.key);
    if (decisionParams.submissionMode === "deferred_overflow") {
      markTurnDeferredOverflow(decisionParams.turnState, match.key);
    } else {
      markTurnAcceptedCaptureForLane(decisionParams.turnState, match.key, "workflow_improvement");
    }
    params.logger.info(
      formatLog("memory-middleware ordinary-turn workflow-improvement capture accepted", {
        key: match.key,
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.guidancePattern
          ? { guidancePattern: effectiveDecision.guidancePattern }
          : {}),
        reviewMode: effectiveReviewMode,
        confidence: effectiveDecision.confidence,
        eventId: result.eventId,
        memoryObjectId: result.memoryObjectId,
      }),
    );
    return true;
  }

  async function buildCapturePlanForSegment(paramsForPlan: {
    text: string;
    segmentIndex: number;
    autoCaptureProfile: "user-preference-v1" | "user-preference-v2";
    agentExternalKey: string;
    sessionKey: string;
    transcriptFile: string;
    recentContextEntries: TranscriptContextEntry[];
    timestamp?: string;
  }): Promise<OrdinaryTurnAutoCapturePlan | null> {
    const legacySemanticFallbackEnabled = isLegacySemanticFallbackEnabled();
    const contextualRawCandidates = legacySemanticFallbackEnabled
      ? await buildLegacyOrdinaryTurnContextualRawCandidates({
          text: paramsForPlan.text,
          profile: paramsForPlan.autoCaptureProfile,
          config: params.config,
          contextEntries: paramsForPlan.recentContextEntries,
        })
      : [];
    const contextualPreferenceMatch = legacySemanticFallbackEnabled
      ? (contextualRawCandidates
          .map((candidate) =>
            parseOrdinaryTurnAutoCapturePreference(candidate, paramsForPlan.autoCaptureProfile),
          )
          .find((candidate): candidate is OrdinaryTurnAutoCaptureMatch => candidate !== null) ??
        null)
      : null;
    const scorePlan = (input: {
      kind: OrdinaryTurnAutoCapturePlan["kind"];
      compatibilityLane: OrdinaryTurnAutoCaptureCompatibilityLane;
      key: string;
      subjectKey: string;
      supportsDeferredOverflow: boolean;
      detectionSource?: "deterministic" | "semantic";
      confidence?: "high" | "medium" | "low";
      reviewMode?: "direct" | "pending_confirmation" | "hold_for_more_evidence";
      captureClass?: string;
      candidateKind?: OrdinaryTurnAutoCaptureMatch["candidateKind"];
      run: OrdinaryTurnAutoCapturePlan["run"];
    }): OrdinaryTurnAutoCapturePlan => {
      const base = resolveCapturePlanBaseScore({
        kind: input.kind,
        compatibilityLane: input.compatibilityLane,
        key: input.key,
        subjectKey: input.subjectKey,
        segmentIndex: paramsForPlan.segmentIndex,
        score: 0,
        rankSignals: [],
        supportsDeferredOverflow: input.supportsDeferredOverflow,
        run: input.run,
      } as OrdinaryTurnAutoCapturePlan);
      const scored = applyCapturePlanDecisionScore({
        score: base.score,
        signals: base.signals,
        detectionSource: input.detectionSource,
        confidence: input.confidence,
        reviewMode: input.reviewMode,
        captureClass: input.captureClass,
        candidateKind: input.candidateKind,
      });
      if (input.kind === "response_style_forget") {
        return {
          kind: "response_style_forget",
          compatibilityLane: "response_style",
          key: input.key,
          subjectKey: input.subjectKey,
          segmentIndex: paramsForPlan.segmentIndex,
          score: scored.score,
          rankSignals: scored.signals,
          supportsDeferredOverflow: false,
          run: input.run,
        };
      }
      return {
        kind: "capture",
        compatibilityLane: input.compatibilityLane,
        key: input.key,
        subjectKey: input.subjectKey,
        segmentIndex: paramsForPlan.segmentIndex,
        score: scored.score,
        rankSignals: scored.signals,
        supportsDeferredOverflow: input.supportsDeferredOverflow,
        run: input.run,
      };
    };

    if (params.semanticInterpreter) {
      const normalizedBlocks = normalizeTranscriptMemorySource({
        source: {
          kind: "transcript",
          sourceId: `${paramsForPlan.sessionKey}:${paramsForPlan.segmentIndex}`,
          sessionKey: paramsForPlan.sessionKey,
          agentId: paramsForPlan.agentExternalKey,
        },
        text: paramsForPlan.text,
        parentContext: paramsForPlan.recentContextEntries,
        maxSegments: 4,
        ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
      });
      const semanticWindow = buildMemorySourceWindows({
        blocks: normalizedBlocks,
        maxWindowChars: 2_400,
        maxBlocksPerWindow: 4,
      })[0];
      if (semanticWindow) {
        const planned = await collectPlannedMemorySemanticCaptures({
          config: params.config,
          lane: "ordinary_turn_capture",
          windows: [semanticWindow],
          interpreter: params.semanticInterpreter,
        });
        const semanticPlans: OrdinaryTurnAutoCapturePlan[] = [];
        for (const capture of planned.captures) {
          const evidence = [
            ...capture.validated.evidence,
            "model_driven_interpretation",
            `model:${capture.modelId}`,
            `prompt:${capture.promptVersion}`,
          ];
          if (capture.materialized.action === "forget") {
            const projection = capture.materialized.projection;
            semanticPlans.push(
              scorePlan({
                kind: "response_style_forget",
                compatibilityLane: "response_style",
                key: projection.subjectKey,
                subjectKey: projection.subjectKey,
                supportsDeferredOverflow: false,
                detectionSource: "semantic",
                confidence: "high",
                run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
                  handleResponseStyleDecision({
                    decision: {
                      action: "forget",
                      confidence: "high",
                      detectionSource: "semantic",
                      evidence,
                      subject: projection.subject,
                      subjectKey: projection.subjectKey,
                    },
                    observedText: paramsForPlan.text,
                    agentExternalKey: paramsForPlan.agentExternalKey,
                    sessionKey: paramsForPlan.sessionKey,
                    transcriptFile: paramsForPlan.transcriptFile,
                    turnState,
                    submissionMode,
                    posture,
                    rank,
                    candidatePoolSize,
                    ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                  }),
              }),
            );
            continue;
          }
          const projection = capture.materialized.projection;
          if (projection.compatibilityCategory === "response_style") {
            semanticPlans.push(
              scorePlan({
                kind: "capture",
                compatibilityLane: "response_style",
                key: capture.identity.dedupeKey,
                subjectKey: capture.identity.subjectKey,
                supportsDeferredOverflow: true,
                detectionSource: "semantic",
                confidence: projection.confidence,
                reviewMode: projection.reviewMode,
                captureClass: projection.compatibilityMatch.captureClass,
                candidateKind: projection.compatibilityMatch.candidateKind,
                run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
                  handleResponseStyleDecision({
                    decision: {
                      action: "capture",
                      canonicalCandidate: projection.canonicalCandidate,
                      confidence: projection.confidence,
                      detectionSource: "semantic",
                      evidence,
                      responseStyleFamily: projection.responseStyleFamily ?? "generalized_guidance",
                      match: projection.compatibilityMatch,
                      reviewMode: projection.reviewMode,
                    },
                    observedText: paramsForPlan.text,
                    agentExternalKey: paramsForPlan.agentExternalKey,
                    sessionKey: paramsForPlan.sessionKey,
                    transcriptFile: paramsForPlan.transcriptFile,
                    turnState,
                    submissionMode,
                    posture,
                    rank,
                    candidatePoolSize,
                    ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                  }),
              }),
            );
            continue;
          }
          if (projection.compatibilityCategory === "project_fact") {
            semanticPlans.push(
              scorePlan({
                kind: "capture",
                compatibilityLane: "project_fact",
                key: capture.identity.dedupeKey,
                subjectKey: capture.identity.subjectKey,
                supportsDeferredOverflow: true,
                detectionSource: "semantic",
                confidence: projection.confidence,
                reviewMode: projection.reviewMode,
                captureClass: projection.compatibilityMatch.captureClass,
                candidateKind: projection.compatibilityMatch.candidateKind,
                run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
                  handleProjectFactDecision({
                    decision: {
                      action: "capture",
                      canonicalCandidate: projection.canonicalCandidate,
                      confidence: projection.confidence,
                      detectionSource: "semantic",
                      evidence,
                      reviewMode:
                        projection.reviewMode === "direct"
                          ? "pending_confirmation"
                          : projection.reviewMode,
                      factFamily: projection.factFamily ?? "generalized_reference",
                      ...(projection.fieldKey ? { fieldKey: projection.fieldKey } : {}),
                      match: projection.compatibilityMatch,
                    },
                    agentExternalKey: paramsForPlan.agentExternalKey,
                    sessionKey: paramsForPlan.sessionKey,
                    transcriptFile: paramsForPlan.transcriptFile,
                    turnState,
                    submissionMode,
                    posture,
                    rank,
                    candidatePoolSize,
                    ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                  }),
              }),
            );
            continue;
          }
          if (projection.compatibilityCategory === "recurring_procedure") {
            semanticPlans.push(
              scorePlan({
                kind: "capture",
                compatibilityLane: "recurring_procedure",
                key: capture.identity.dedupeKey,
                subjectKey: capture.identity.subjectKey,
                supportsDeferredOverflow: true,
                detectionSource: "semantic",
                confidence: projection.confidence,
                reviewMode: projection.reviewMode,
                captureClass: projection.compatibilityMatch.captureClass,
                candidateKind: projection.compatibilityMatch.candidateKind,
                run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
                  handleRecurringProcedureDecision({
                    decision: {
                      action: "capture",
                      canonicalCandidate: projection.canonicalCandidate,
                      confidence: projection.confidence,
                      detectionSource: "semantic",
                      evidence,
                      reviewMode:
                        projection.reviewMode === "direct"
                          ? "pending_confirmation"
                          : projection.reviewMode,
                      procedureFamily: projection.procedureFamily ?? "generalized_named_checklist",
                      match: projection.compatibilityMatch,
                    },
                    agentExternalKey: paramsForPlan.agentExternalKey,
                    sessionKey: paramsForPlan.sessionKey,
                    transcriptFile: paramsForPlan.transcriptFile,
                    turnState,
                    submissionMode,
                    posture,
                    rank,
                    candidatePoolSize,
                    ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                  }),
              }),
            );
            continue;
          }
          semanticPlans.push(
            scorePlan({
              kind: "capture",
              compatibilityLane: "workflow_improvement",
              key: capture.identity.dedupeKey,
              subjectKey: capture.identity.subjectKey,
              supportsDeferredOverflow: true,
              detectionSource: "semantic",
              confidence: projection.confidence,
              reviewMode: projection.reviewMode,
              captureClass: projection.compatibilityMatch.captureClass,
              candidateKind: projection.compatibilityMatch.candidateKind,
              run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
                handleWorkflowImprovementDecision({
                  decision: {
                    action: "capture",
                    canonicalCandidate: projection.canonicalCandidate,
                    confidence: projection.confidence,
                    detectionSource: "semantic",
                    evidence,
                    reviewMode:
                      projection.reviewMode === "direct"
                        ? "pending_confirmation"
                        : projection.reviewMode,
                    lessonFamily: projection.lessonFamily ?? "generalized_workflow_lesson",
                    ...(projection.guidancePattern
                      ? { guidancePattern: projection.guidancePattern }
                      : {}),
                    match: projection.compatibilityMatch,
                  },
                  text: paramsForPlan.text,
                  agentExternalKey: paramsForPlan.agentExternalKey,
                  sessionKey: paramsForPlan.sessionKey,
                  transcriptFile: paramsForPlan.transcriptFile,
                  turnState,
                  submissionMode,
                  posture,
                  rank,
                  candidatePoolSize,
                  ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                }),
            }),
          );
        }
        semanticPlans.sort((left, right) => right.score - left.score);
        if (semanticPlans[0]) {
          return semanticPlans[0];
        }
      }
    }

    if (legacySemanticFallbackEnabled) {
      // Explicit degraded-mode only. Normal runtime must stay on the model-native seam.
      const deterministicResponseStylePhraseMatch =
        await findApprovedResponseStylePhrasePatternMatch({
          config: params.config,
          text: paramsForPlan.text,
          logger: params.logger,
        });
      if (deterministicResponseStylePhraseMatch) {
        const deterministicMatch = toOrdinaryTurnResponseStyleMatch(
          deterministicResponseStylePhraseMatch.match,
        );
        const reviewMode =
          deterministicResponseStylePhraseMatch.match.family === "generalized_guidance"
            ? "hold_for_more_evidence"
            : "direct";
        return scorePlan({
          kind: "capture",
          compatibilityLane: "response_style",
          key: deterministicMatch.key,
          subjectKey: deterministicMatch.subjectKey,
          supportsDeferredOverflow: true,
          detectionSource: "deterministic",
          confidence: "high",
          reviewMode,
          captureClass: deterministicMatch.captureClass,
          candidateKind: deterministicMatch.candidateKind,
          run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
            handleResponseStyleDecision({
              decision: {
                action: "capture",
                canonicalCandidate: buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch({
                  profileId: "response_style",
                  match: deterministicMatch,
                  reviewMode,
                  detectionSource: "deterministic",
                  evidence: ["approved_phrase_pattern_match"],
                  observedText: paramsForPlan.text,
                  captureSeam: AUTO_CAPTURE_SOURCE,
                  captureProfile: paramsForPlan.autoCaptureProfile,
                }),
                confidence: "high",
                detectionSource: "deterministic",
                evidence: ["approved_phrase_pattern_match"],
                responseStyleFamily: deterministicResponseStylePhraseMatch.match.family,
                match: deterministicMatch,
                reviewMode,
              },
              observedText: paramsForPlan.text,
              agentExternalKey: paramsForPlan.agentExternalKey,
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
              turnState,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
              ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
            }),
        });
      }
    }

    if (legacySemanticFallbackEnabled) {
      const responseStyleDecision = await detectLegacyResponseStyleCaptureDecision(
        paramsForPlan.text,
        paramsForPlan.autoCaptureProfile,
        params.config,
        contextualRawCandidates,
      );
      if (responseStyleDecision) {
        if (responseStyleDecision.action === "forget") {
          return scorePlan({
            kind: "response_style_forget",
            compatibilityLane: "response_style",
            key: responseStyleDecision.subjectKey,
            subjectKey: responseStyleDecision.subjectKey,
            supportsDeferredOverflow: false,
            detectionSource: responseStyleDecision.detectionSource,
            confidence: "high",
            run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
              handleResponseStyleDecision({
                decision: responseStyleDecision,
                observedText: paramsForPlan.text,
                agentExternalKey: paramsForPlan.agentExternalKey,
                sessionKey: paramsForPlan.sessionKey,
                transcriptFile: paramsForPlan.transcriptFile,
                turnState,
                submissionMode,
                posture,
                rank,
                candidatePoolSize,
                ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
              }),
          });
        }
        return scorePlan({
          kind: "capture",
          compatibilityLane: "response_style",
          key: responseStyleDecision.match.key,
          subjectKey: responseStyleDecision.match.subjectKey,
          supportsDeferredOverflow: true,
          detectionSource: responseStyleDecision.detectionSource,
          confidence: responseStyleDecision.confidence,
          reviewMode: responseStyleDecision.reviewMode,
          captureClass: responseStyleDecision.match.captureClass,
          candidateKind: responseStyleDecision.match.candidateKind,
          run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
            handleResponseStyleDecision({
              decision: responseStyleDecision,
              observedText: paramsForPlan.text,
              agentExternalKey: paramsForPlan.agentExternalKey,
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
              turnState,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
              ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
            }),
        });
      }

      const projectFactDecision = await detectLegacyProjectFactCaptureDecision(
        paramsForPlan.text,
        paramsForPlan.autoCaptureProfile,
        contextualRawCandidates,
      );
      if (projectFactDecision) {
        return scorePlan({
          kind: "capture",
          compatibilityLane: "project_fact",
          key: projectFactDecision.match.key,
          subjectKey: projectFactDecision.match.subjectKey,
          supportsDeferredOverflow: true,
          detectionSource: projectFactDecision.detectionSource,
          confidence: projectFactDecision.confidence,
          reviewMode: projectFactDecision.reviewMode,
          captureClass: projectFactDecision.match.captureClass,
          candidateKind: projectFactDecision.match.candidateKind,
          run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
            handleProjectFactDecision({
              decision: projectFactDecision,
              agentExternalKey: paramsForPlan.agentExternalKey,
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
              turnState,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
              ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
            }),
        });
      }

      const recurringProcedureDecision = await detectLegacyRecurringProcedureCaptureDecision(
        paramsForPlan.text,
        paramsForPlan.autoCaptureProfile,
        contextualRawCandidates,
      );
      if (recurringProcedureDecision) {
        return scorePlan({
          kind: "capture",
          compatibilityLane: "recurring_procedure",
          key: recurringProcedureDecision.match.key,
          subjectKey: recurringProcedureDecision.match.subjectKey,
          supportsDeferredOverflow: true,
          detectionSource: recurringProcedureDecision.detectionSource,
          confidence: recurringProcedureDecision.confidence,
          reviewMode: recurringProcedureDecision.reviewMode,
          captureClass: recurringProcedureDecision.match.captureClass,
          candidateKind: recurringProcedureDecision.match.candidateKind,
          run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
            handleRecurringProcedureDecision({
              decision: recurringProcedureDecision,
              agentExternalKey: paramsForPlan.agentExternalKey,
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
              turnState,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
              ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
            }),
        });
      }

      const workflowImprovementDecision = await detectLegacyWorkflowImprovementCaptureDecision(
        paramsForPlan.text,
        paramsForPlan.autoCaptureProfile,
        params.config,
        contextualRawCandidates,
      );
      if (workflowImprovementDecision) {
        return scorePlan({
          kind: "capture",
          compatibilityLane: "workflow_improvement",
          key: workflowImprovementDecision.match.key,
          subjectKey: workflowImprovementDecision.match.subjectKey,
          supportsDeferredOverflow: true,
          detectionSource: workflowImprovementDecision.detectionSource,
          confidence: workflowImprovementDecision.confidence,
          reviewMode: workflowImprovementDecision.reviewMode,
          captureClass: workflowImprovementDecision.match.captureClass,
          candidateKind: workflowImprovementDecision.match.candidateKind,
          run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) =>
            handleWorkflowImprovementDecision({
              decision: workflowImprovementDecision,
              text: paramsForPlan.text,
              agentExternalKey: paramsForPlan.agentExternalKey,
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
              turnState,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
              ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
            }),
        });
      }
    }

    const match =
      parseOrdinaryTurnAutoCapturePreference(
        paramsForPlan.text,
        paramsForPlan.autoCaptureProfile,
      ) ?? contextualPreferenceMatch;
    if (!match) {
      return null;
    }
    return scorePlan({
      kind: "capture",
      compatibilityLane: resolvePreferencePlanLaneFromCaptureClass(match.captureClass),
      key: match.key,
      subjectKey: match.subjectKey,
      supportsDeferredOverflow: true,
      captureClass: match.captureClass,
      candidateKind: match.candidateKind,
      reviewMode:
        match.captureClass === "project_fact_correction" ? "pending_confirmation" : "direct",
      run: async ({ submissionMode, turnState, posture, rank, candidatePoolSize }) => {
        if (inFlightKeys.has(match.key)) {
          return true;
        }
        inFlightKeys.add(match.key);
        try {
          const existing = await deps.findExistingByKey({
            config: params.config,
            key: match.key,
          });
          if (existing) {
            if (
              submissionMode === "immediate" &&
              shouldPromoteDeferredPreferenceCandidate(existing)
            ) {
              const attribution = await deps.resolveAttribution({
                config: params.config,
                agentExternalKey: paramsForPlan.agentExternalKey,
                sessionKey: paramsForPlan.sessionKey,
                transcriptFile: paramsForPlan.transcriptFile,
              });
              if (!attribution) {
                return true;
              }
              const promoted = await autoPromoteDeferredPreferenceCandidate({
                candidateId: existing.id,
                reviewerAgentId: attribution.agentId,
                logger: params.logger,
                reviewCandidate: deps.reviewCandidate,
                promoteToMemory: deps.promoteToMemory,
                metadata: {
                  autoPromotion: {
                    source: AUTO_PROMOTION_SOURCE,
                    captureSeam: "transcript_subscriber_fallback",
                    profile: "deferred_preference_confirmation_v1",
                    captureProfile: match.profile,
                    captureClass: match.captureClass,
                    reasonCode: match.reasonCode,
                    key: match.key,
                    subjectKey: match.subjectKey,
                    subject: match.subject,
                    value: match.value,
                    ...(match.projectScope ? { projectScope: match.projectScope } : {}),
                    agentExternalKey: paramsForPlan.agentExternalKey,
                    sessionKey: paramsForPlan.sessionKey,
                    transcriptFile: paramsForPlan.transcriptFile,
                    ...(paramsForPlan.timestamp
                      ? { transcriptTimestamp: paramsForPlan.timestamp }
                      : {}),
                  },
                  candidateConfirmation: {
                    state: "confirmed",
                    method: "repeat_subject_signal",
                    confirmationEvidenceCount: 2,
                    confirmationWindowMs: CANDIDATE_CONFIRMATION_WINDOW_MS,
                  },
                },
                logContext: {
                  key: match.key,
                  subjectKey: match.subjectKey,
                  profile: match.profile,
                },
              });
              if (promoted) {
                markTurnAcceptedCaptureForLane(turnState, match.key, "preference");
                markRecent(match.key);
              }
            } else {
              params.logger.debug?.(
                formatLog("memory-middleware ordinary-turn auto-capture skipped existing key", {
                  key: match.key,
                  memoryObjectId: existing.id,
                  reviewState: existing.reviewState,
                }),
              );
              await recordCaptureSuppressionTelemetry({
                action: "candidate_duplicate_suppressed",
                reason: "existing_key",
                captureClass: match.captureClass,
                key: match.key,
                subjectKey: match.subjectKey,
                projectScope: match.projectScope,
                agentExternalKey: paramsForPlan.agentExternalKey,
                submissionMode,
                posture,
                rank,
                candidatePoolSize,
              });
              markRecent(match.key);
            }
            return true;
          }

          if (recentKeys.has(match.key)) {
            params.logger.debug?.(
              formatLog("memory-middleware ordinary-turn auto-capture skipped recent duplicate", {
                key: match.key,
              }),
            );
            await recordCaptureSuppressionTelemetry({
              action: "candidate_duplicate_suppressed",
              reason: "recent_duplicate",
              captureClass: match.captureClass,
              key: match.key,
              subjectKey: match.subjectKey,
              projectScope: match.projectScope,
              agentExternalKey: paramsForPlan.agentExternalKey,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
            });
            return true;
          }

          const attribution = await deps.resolveAttribution({
            config: params.config,
            agentExternalKey: paramsForPlan.agentExternalKey,
            sessionKey: paramsForPlan.sessionKey,
            transcriptFile: paramsForPlan.transcriptFile,
          });
          if (!attribution) {
            params.logger.warn(
              formatLog(
                "memory-middleware ordinary-turn auto-capture skipped missing attribution",
                {
                  agentExternalKey: paramsForPlan.agentExternalKey,
                  sessionKey: paramsForPlan.sessionKey,
                },
              ),
            );
            await recordCaptureSuppressionTelemetry({
              action: "candidate_submission_failed",
              reason: "missing_attribution",
              captureClass: match.captureClass,
              key: match.key,
              subjectKey: match.subjectKey,
              projectScope: match.projectScope,
              agentExternalKey: paramsForPlan.agentExternalKey,
              submissionMode,
              posture,
              rank,
              candidatePoolSize,
            });
            return true;
          }
          const candidateMetadata =
            submissionMode === "deferred_overflow"
              ? buildPreferenceDeferredOverflowMetadata({
                  match,
                  agentExternalKey: paramsForPlan.agentExternalKey,
                  sessionKey: paramsForPlan.sessionKey,
                  transcriptFile: paramsForPlan.transcriptFile,
                  posture,
                  rank,
                  candidatePoolSize,
                  ...(paramsForPlan.timestamp ? { observedAt: paramsForPlan.timestamp } : {}),
                })
              : buildSubscriberCaptureMetadata({
                  match,
                  agentExternalKey: paramsForPlan.agentExternalKey,
                  sessionKey: paramsForPlan.sessionKey,
                  transcriptFile: paramsForPlan.transcriptFile,
                  ...(paramsForPlan.timestamp ? { timestamp: paramsForPlan.timestamp } : {}),
                });
          const submit =
            match.candidateKind === "correction"
              ? deps.submitCorrectionSuggestion
              : deps.submitLearning;
          const result = await submit({
            content: match.content,
            agentId: attribution.agentId,
            sessionId: attribution.sessionId,
            metadata: candidateMetadata,
          });
          if (!result.accepted) {
            params.logger.warn(
              formatLog("memory-middleware ordinary-turn auto-capture submission rejected", {
                key: match.key,
                reason: result.reason ?? "unknown",
              }),
            );
            return true;
          }
          markRecent(match.key);
          if (submissionMode === "deferred_overflow") {
            markTurnDeferredOverflow(turnState, match.key);
          } else {
            markTurnAcceptedCaptureForLane(turnState, match.key, "preference");
          }
          if (
            submissionMode !== "deferred_overflow" &&
            autoPromotion.profile === "explicit-user-preference-v1" &&
            autoPromotionAgents.has(paramsForPlan.agentExternalKey) &&
            (match.captureClass === "explicit_preference" ||
              match.captureClass === "explicit_requirement") &&
            result.memoryObjectId
          ) {
            const autoPromotionMetadata = {
              autoPromotion: {
                source: AUTO_PROMOTION_SOURCE,
                captureSeam: "transcript_subscriber_fallback",
                profile: autoPromotion.profile,
                captureProfile: match.profile,
                captureClass: match.captureClass,
                reasonCode: match.reasonCode,
                key: match.key,
                subjectKey: match.subjectKey,
                subject: match.subject,
                value: match.value,
                ...(match.projectScope ? { projectScope: match.projectScope } : {}),
                agentExternalKey: paramsForPlan.agentExternalKey,
                sessionKey: paramsForPlan.sessionKey,
                transcriptFile: paramsForPlan.transcriptFile,
                ...(paramsForPlan.timestamp
                  ? { transcriptTimestamp: paramsForPlan.timestamp }
                  : {}),
              },
            };
            const reviewResult = await deps.reviewCandidate({
              candidateId: result.memoryObjectId,
              outcome: "accepted",
              reviewerAgentId: attribution.agentId,
              metadata: autoPromotionMetadata,
            });
            if (reviewResult.accepted) {
              const promotionResult = await deps.promoteToMemory({
                candidateId: result.memoryObjectId,
                promoterAgentId: attribution.agentId,
                metadata: autoPromotionMetadata,
              });
              if (promotionResult.accepted) {
                params.logger.info(
                  formatLog("memory-middleware ordinary-turn auto-promotion accepted", {
                    key: match.key,
                    profile: autoPromotion.profile,
                    candidateId: result.memoryObjectId,
                    promotedMemoryObjectId: promotionResult.promotedMemoryObjectId,
                  }),
                );
              }
            }
          }
          params.logger.info(
            formatLog("memory-middleware ordinary-turn auto-capture accepted", {
              key: match.key,
              profile: match.profile,
              captureClass: match.captureClass,
              candidateKind: match.candidateKind,
              submissionMode,
              eventId: result.eventId,
              memoryObjectId: result.memoryObjectId,
            }),
          );
          return true;
        } catch (error) {
          params.logger.error(
            formatLog("memory-middleware ordinary-turn auto-capture failed", {
              error: error instanceof Error ? error.message : String(error),
              sessionKey: paramsForPlan.sessionKey,
              transcriptFile: paramsForPlan.transcriptFile,
            }),
          );
          return true;
        } finally {
          inFlightKeys.delete(match.key);
        }
      },
    });
  }

  return async (update) => {
    if (autoCapture.profile === "disabled") {
      return;
    }
    const autoCaptureProfile = autoCapture.profile;
    const transcriptFile = normalizeText(update.sessionFile);
    const sessionKey = normalizeText(
      typeof update.sessionKey === "string" && update.sessionKey.trim()
        ? update.sessionKey
        : (resolveSessionKeyFromTranscriptFile(transcriptFile) ?? ""),
    );
    const agentExternalKey = resolveAgentExternalKeyFromTranscriptFile(transcriptFile);
    if (
      !sessionKey ||
      !transcriptFile ||
      !agentExternalKey ||
      !allowedAgents.has(agentExternalKey)
    ) {
      return;
    }
    const transcriptMessage =
      update.message ?? (await readLatestTranscriptUserMessage(transcriptFile));
    const text = extractTranscriptUserText(transcriptMessage);
    if (!text) {
      return;
    }
    const timestamp = extractTranscriptTimestamp(transcriptMessage);
    const recentContextEntries = await readRecentTranscriptContextEntries({
      transcriptFile,
      currentMessage: transcriptMessage,
    });
    const turnState = createOrdinaryTurnAutoCaptureTurnState();
    const captureSegments = extractOrdinaryTurnAutoCaptureSegments(text);
    const capturePlans: OrdinaryTurnAutoCapturePlan[] = [];
    for (const [segmentIndex, segment] of captureSegments.entries()) {
      const capturePlan = await buildCapturePlanForSegment({
        text: segment,
        segmentIndex,
        autoCaptureProfile,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        recentContextEntries,
        ...(timestamp ? { timestamp } : {}),
      });
      if (capturePlan) {
        capturePlans.push(capturePlan);
      }
    }

    const explicitCandidateCount = capturePlans.filter(
      (plan) =>
        plan.kind === "capture" &&
        (plan.rankSignals.includes("capture:explicit") || plan.compatibilityLane === "preference"),
    ).length;
    const demandSignals = deriveCorpusDemandSignalsFromPrompt({
      text,
      candidatePlanCount: capturePlans.length,
      segmentCount: captureSegments.length,
    });
    const capturePosture = resolveCapturePlanPosture({
      text,
      captureSegments,
      candidatePlanCount: capturePlans.length,
      explicitCandidateCount,
      hasExplicitMemoryRequest,
    });
    const rankedPlans = rankOrdinaryTurnAutoCapturePlans(capturePlans);

    for (const [rankIndex, capturePlan] of rankedPlans.entries()) {
      const immediateAllowed =
        capturePlan.kind === "response_style_forget" ||
        (turnState.acceptedKeys.size < resolveImmediateCaptureLimit(capturePosture) &&
          hasImmediateLaneCapacity({
            turnState,
            posture: capturePosture,
            compatibilityLane: capturePlan.compatibilityLane,
          }));
      const submissionMode: OrdinaryTurnAutoCaptureSubmissionMode | null = immediateAllowed
        ? "immediate"
        : capturePlan.supportsDeferredOverflow &&
            turnState.deferredKeys.size < resolveDeferredOverflowLimit(capturePosture)
          ? "deferred_overflow"
          : null;
      if (!submissionMode) {
        continue;
      }
      await capturePlan.run({
        submissionMode,
        turnState,
        posture: capturePosture,
        rank: rankIndex + 1,
        candidatePoolSize: rankedPlans.length,
      });
    }

    if (
      rankedPlans.length > 0 ||
      demandSignals.length > 0 ||
      captureSegments.length > 1 ||
      turnState.acceptedKeys.size > 1 ||
      turnState.deferredKeys.size > 0
    ) {
      await params.soakTelemetry?.record({
        schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        category: "capture",
        action: "turn_summary",
        source: "ordinary_turn_auto_capture",
        agentKey: agentExternalKey,
        sessionKey,
        posture: capturePosture,
        segmentCount: captureSegments.length,
        candidatePlanCount: rankedPlans.length,
        acceptedCaptureCount: turnState.acceptedKeys.size,
        deferredOverflowCount: turnState.deferredKeys.size,
        acceptedCaptureLimit: resolveImmediateCaptureLimit(capturePosture),
        deferredOverflowLimit: resolveDeferredOverflowLimit(capturePosture),
        demandSignals,
      });
      params.logger.info(
        formatLog("memory-middleware ordinary-turn multi-capture summary", {
          posture: capturePosture,
          segmentCount: captureSegments.length,
          candidatePlanCount: rankedPlans.length,
          acceptedCaptureCount: turnState.acceptedKeys.size,
          acceptedKeys: [...turnState.acceptedKeys],
          deferredOverflowCount: turnState.deferredKeys.size,
          deferredKeys: [...turnState.deferredKeys],
          acceptedCaptureLimit: resolveImmediateCaptureLimit(capturePosture),
          deferredOverflowLimit: resolveDeferredOverflowLimit(capturePosture),
          demandSignals,
        }),
      );
    }
  };
}

export function createOrdinaryTurnAutoCaptureController(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  logger: PluginLogger;
  candidateIngress: CandidateIngressPort;
  soakTelemetry?: MemorySoakTelemetryPort;
  semanticInterpreter: MemorySemanticInterpreterPort;
  subscribe: (listener: (update: SessionTranscriptUpdateLike) => void) => () => void;
  deps?: Partial<OrdinaryTurnAutoCaptureHandlerDeps>;
}): OrdinaryTurnAutoCaptureController {
  let unsubscribe: (() => void) | undefined;
  let scanTimer: NodeJS.Timeout | undefined;
  const autoCapture = params.config.autoCapture ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG;
  const autoPromotion =
    params.config.autoPromotion ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG;
  const handleUpdate = createOrdinaryTurnAutoCaptureHandler({
    config: params.config,
    cfg: params.cfg,
    logger: params.logger,
    candidateIngress: params.candidateIngress,
    soakTelemetry: params.soakTelemetry,
    semanticInterpreter: params.semanticInterpreter,
    deps: params.deps,
  });
  const scanRecentTranscripts = async () => {
    const recentFiles = await listRecentTranscriptFiles(autoCapture.allowedAgents);
    for (const sessionFile of recentFiles) {
      await handleUpdate({ sessionFile });
    }
  };

  return {
    start() {
      if (unsubscribe || autoCapture.profile === "disabled") {
        return;
      }
      unsubscribe = params.subscribe((update) => {
        void handleUpdate(update);
      });
      scanTimer = setInterval(() => {
        void scanRecentTranscripts().catch((error) => {
          params.logger.warn(
            formatLog("memory-middleware ordinary-turn auto-capture scan failed", {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
      }, AUTO_CAPTURE_TRANSCRIPT_SCAN_INTERVAL_MS);
      void scanRecentTranscripts().catch((error) => {
        params.logger.warn(
          formatLog("memory-middleware ordinary-turn auto-capture initial scan failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
      params.logger.info(
        formatLog("memory-middleware ordinary-turn auto-capture started", {
          profile: autoCapture.profile,
          allowedAgents: autoCapture.allowedAgents,
          autoPromotionProfile: autoPromotion.profile,
        }),
      );
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
      if (scanTimer) {
        clearInterval(scanTimer);
        scanTimer = undefined;
      }
    },
  };
}
const resolveWorkflowCaptureProfileId = resolveWorkflowCaptureCategoryFromCaptureClass;
