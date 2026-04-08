import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import {
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG,
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG,
  type MemoryMiddlewareConfig,
} from "./config.js";
import {
  executeMemoryObjectCorrectionPlan,
  isExecutableMemoryObjectCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
  resolveMemoryCorrectionPlan,
} from "./memory-correction-engine.js";
import {
  getCaptureMetadataByCaptureClass,
  getMemoryFamilyIdByWorkflowLessonFamily,
} from "./memory-family-registry.js";
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
  type ProjectFactLifecycleInspection,
  inspectProjectFactLifecycle,
  isExpiredPendingProjectFactCandidate,
} from "./project-fact-lifecycle.js";
import {
  detectGenericProjectFactSemanticDecision,
  detectProjectFactSemanticDecision,
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
  detectRecurringProcedureSemanticDecision,
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
  detectResponseStyleSemanticDecision,
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
  type WorkflowImprovementCaptureClass,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  type WorkflowImprovementLessonKey,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
  type WorkflowImprovementToolKey,
} from "./workflow-improvement-semantic.js";
import {
  findApprovedWorkflowPhrasePatternMatch,
  maybeInduceWorkflowPhrasePattern,
} from "./workflow-phrase-induction.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AUTO_CAPTURE_SOURCE = "ordinary_turn_auto_capture";
const AUTO_PROMOTION_SOURCE = "ordinary_turn_auto_promotion";
const RESPONSE_STYLE_FORGET_SOURCE = "response_style_forget_request";
const AUTO_CAPTURE_ALLOWED_ROLES = new Set(["user"]);
const DEFAULT_ALLOWED_AGENTS = new Set(["chief", "main"]);
const RESPONSE_STYLE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS = 5_000;
const PROJECT_FACT_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const PROJECT_FACT_CONFIRMATION_MIN_AGE_MS = 5_000;
const PROCEDURE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const PROCEDURE_CONFIRMATION_MIN_AGE_MS = 5_000;
const WORKFLOW_IMPROVEMENT_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const WORKFLOW_IMPROVEMENT_CONFIRMATION_MIN_AGE_MS = 5_000;
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
  }) => Promise<{ id: string; reviewState: string } | null>;
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
type RecurringProcedureDetectionSource = "semantic";
type WorkflowImprovementDetectionSource = "semantic" | "deterministic";

type ResponseStyleCaptureDecision =
  | {
      action: "capture";
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
      detectionSource: "semantic";
      evidence: string[];
      subject: string;
      subjectKey: string;
    };

type ProjectFactCaptureDecision = {
  action: "capture";
  confidence: "high" | "medium";
  detectionSource: ProjectFactDetectionSource;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
  match: OrdinaryTurnAutoCaptureMatch;
};

type RecurringProcedureCaptureDecision = {
  action: "capture";
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
  confidence: WorkflowImprovementSemanticConfidence;
  detectionSource: WorkflowImprovementDetectionSource;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  match: OrdinaryTurnAutoCaptureMatch;
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

function extractTranscriptUserText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const entry = message as TranscriptUserMessage;
  if (!hasSupportedRole(entry.role)) {
    return null;
  }
  if (typeof entry.content === "string") {
    const text = normalizeText(entry.content);
    return text ? text : null;
  }
  if (!Array.isArray(entry.content)) {
    return null;
  }
  const parts = entry.content
    .map((block) =>
      block && typeof block === "object" && "text" in block ? block.text : undefined,
    )
    .filter((text): text is string => typeof text === "string")
    .map((text) => normalizeText(text))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
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

  if (profile === "user-preference-v2") {
    for (const { pattern, template, subjectPrefix } of PREFERENCE_CORRECTION_PATTERNS) {
      const match = buildPreferenceMatch({
        profile,
        captureClass: "preference_correction",
        candidateKind: "correction",
        reasonCode: "explicit_preference_correction",
        normalized,
        pattern,
        template,
        subjectPrefix,
      });
      if (match) {
        return match;
      }
    }

    for (const { pattern } of PROJECT_FACT_CORRECTION_PATTERNS) {
      const match = buildProjectFactMatch({
        profile,
        captureClass: "project_fact_correction",
        candidateKind: "correction",
        reasonCode: "explicit_project_fact_correction",
        normalized,
        pattern,
      });
      if (match) {
        return match;
      }
    }

    for (const { pattern, template, subject, value, content } of REQUIREMENT_CORRECTION_PATTERNS) {
      const match = buildRequirementMatch({
        profile,
        captureClass: "requirement_correction",
        candidateKind: "correction",
        reasonCode: "explicit_requirement_correction",
        normalized,
        pattern,
        template,
        subject,
        value,
        content,
      });
      if (match) {
        return match;
      }
    }

    for (const { pattern, template, subject, value, content } of REQUIREMENT_PATTERNS) {
      const match = buildRequirementMatch({
        profile,
        captureClass: "explicit_requirement",
        candidateKind: "learning",
        reasonCode: "explicit_requirement_statement",
        normalized,
        pattern,
        template,
        subject,
        value,
        content,
      });
      if (match) {
        return match;
      }
    }
  }

  if (profile === "user-preference-v2") {
    for (const { pattern } of PROJECT_FACT_PATTERNS) {
      const match = buildProjectFactMatch({
        profile,
        captureClass: "explicit_project_fact",
        candidateKind: "learning",
        reasonCode: "explicit_project_fact_statement",
        normalized,
        pattern,
      });
      if (match) {
        return match;
      }
    }
  }

  for (const { pattern, template, subjectPrefix } of PREFERENCE_PATTERNS) {
    const match = buildPreferenceMatch({
      profile,
      captureClass: "explicit_preference",
      candidateKind: "learning",
      reasonCode: "explicit_preference_statement",
      normalized,
      pattern,
      template,
      subjectPrefix,
    });
    if (match) {
      return match;
    }
  }

  return null;
}

export function parseAutoCaptureManagedCandidateContent(
  content: string,
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(content);
  if (!normalized || normalized.length < 12 || normalized.length > 140) {
    return null;
  }

  for (const { pattern, template, subjectPrefix } of PREFERENCE_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildPreferenceMatch({
      profile: "user-preference-v2",
      captureClass: "explicit_preference",
      candidateKind: "learning",
      reasonCode: "explicit_preference_statement",
      normalized,
      pattern,
      template,
      subjectPrefix,
    });
    if (match) {
      return match;
    }
  }

  for (const {
    pattern,
    template,
    subject,
    value,
    content: requirementContent,
  } of REQUIREMENT_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildRequirementMatch({
      profile: "user-preference-v2",
      captureClass: "explicit_requirement",
      candidateKind: "learning",
      reasonCode: "explicit_requirement_statement",
      normalized,
      pattern,
      template,
      subject,
      value,
      content: requirementContent,
    });
    if (match) {
      return match;
    }
  }

  for (const { pattern } of PROJECT_FACT_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildProjectFactMatch({
      profile: "user-preference-v2",
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      reasonCode: "explicit_project_fact_statement",
      normalized,
      pattern,
    });
    if (match) {
      return match;
    }
  }

  return null;
}

export function parseManagedCorrectionCandidateContent(
  content: string,
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(content);
  if (!normalized || normalized.length < 12 || normalized.length > 140) {
    return null;
  }

  for (const {
    pattern,
    template,
    subjectPrefix,
  } of PREFERENCE_CORRECTION_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildPreferenceMatch({
      profile: "user-preference-v2",
      captureClass: "preference_correction",
      candidateKind: "correction",
      reasonCode: "explicit_preference_correction",
      normalized,
      pattern,
      template,
      subjectPrefix,
    });
    if (match) {
      return match;
    }
  }

  for (const {
    pattern,
    template,
    subject,
    value,
    content: requirementContent,
  } of REQUIREMENT_CORRECTION_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildRequirementMatch({
      profile: "user-preference-v2",
      captureClass: "requirement_correction",
      candidateKind: "correction",
      reasonCode: "explicit_requirement_correction",
      normalized,
      pattern,
      template,
      subject,
      value,
      content: requirementContent,
    });
    if (match) {
      return match;
    }
  }

  for (const { pattern } of PROJECT_FACT_CORRECTION_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildProjectFactMatch({
      profile: "user-preference-v2",
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      reasonCode: "explicit_project_fact_correction",
      normalized,
      pattern,
    });
    if (match) {
      return match;
    }
  }

  return null;
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

async function detectResponseStyleCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  config: MemoryMiddlewareConfig,
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
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    responseStyleFamily: resolution.responseStyleFamily,
    match: resolution.parsed,
    reviewMode: resolution.reviewMode,
  };
}

async function detectProjectFactCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
): Promise<ProjectFactCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }
  const resolution = await resolveProjectFactIngestion({
    content: text,
    primarySource: "transcript",
    mode: "ordinary_turn",
  });
  if (!resolution) {
    return null;
  }
  return {
    action: "capture",
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    factFamily: resolution.factFamily,
    ...(resolution.fieldKey ? { fieldKey: resolution.fieldKey } : {}),
    match: resolution.parsed,
  };
}

async function detectRecurringProcedureCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
): Promise<RecurringProcedureCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }
  const resolution = await resolveRecurringProcedureIngestion({
    content: text,
    primarySource: "transcript",
  });
  if (!resolution) {
    return null;
  }
  return {
    action: "capture",
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    procedureFamily: resolution.procedureFamily,
    ...(resolution.procedureKey ? { procedureKey: resolution.procedureKey } : {}),
    match: resolution.parsed,
  };
}

async function detectWorkflowImprovementCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
  config: MemoryMiddlewareConfig,
): Promise<WorkflowImprovementCaptureDecision | null> {
  if (profile !== "user-preference-v2") {
    return null;
  }

  const resolution = await resolveWorkflowImprovementIngestion({
    config,
    content: text,
    primarySource: "transcript",
    allowPhrasePatternMatch: false,
  });
  if (!resolution) {
    return null;
  }

  return {
    action: "capture",
    confidence: resolution.confidence,
    detectionSource: resolution.detectionSource,
    evidence: resolution.evidence,
    reviewMode: resolution.reviewMode,
    lessonFamily: resolution.lessonFamily,
    ...(resolution.lessonKey ? { lessonKey: resolution.lessonKey } : {}),
    ...(resolution.toolKey ? { toolKey: resolution.toolKey } : {}),
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
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    await client.query("begin");
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
      ...(sessionResult.rows[0]?.project_id ? { projectId: sessionResult.rows[0].project_id } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort only.
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function findExistingByKeyWithDatabase(params: {
  config: MemoryMiddlewareConfig;
  key: string;
}): Promise<{ id: string; reviewState: string } | null> {
  if (!params.config.database.url) {
    return null;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("memory_objects")}`;
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    const result = await client.query<{ id: string; review_state: string }>(
      `
        select id::text as id, review_state::text as review_state
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
    return row ? { id: row.id, reviewState: row.review_state } : null;
  } finally {
    await client.end().catch(() => {});
  }
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
  return {
    semanticDetection: {
      source: "response_style_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      evidence: params.evidence,
    },
  };
}

function buildProjectFactSemanticMetadata(params: {
  detectionSource: ProjectFactDetectionSource;
  confidence: ProjectFactSemanticConfidence | "high";
  evidence: string[];
  factFamily: ProjectFactFamily;
  fieldKey?: ProjectFactFieldKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "project_fact_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedureSemanticMetadata(params: {
  detectionSource: RecurringProcedureDetectionSource;
  confidence: RecurringProcedureSemanticConfidence | "high";
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source: "recurring_procedure_semantic_v1",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementSemanticMetadata(params: {
  detectionSource: WorkflowImprovementDetectionSource;
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
}): Record<string, unknown> {
  return {
    semanticDetection: {
      source:
        params.detectionSource === "deterministic"
          ? "workflow_phrase_induction_v1"
          : params.lessonFamily === "generalized_project_rule"
            ? "project_rule_semantic_v1"
            : params.lessonFamily === "generalized_unmet_need"
              ? "unmet_need_semantic_v1"
              : "workflow_improvement_semantic_v2",
      detectionSource: params.detectionSource,
      confidence: params.confidence,
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      evidence: params.evidence,
    },
  };
}

function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
  responseStyleFamily: ResponseStyleFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "response_style",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(
        Date.parse(observedAt) + RESPONSE_STYLE_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      responseStyleFamily: params.responseStyleFamily,
      evidence: params.evidence,
    },
  };
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
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "project_fact",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + PROCEDURE_CONFIRMATION_WINDOW_MS).toISOString(),
      factFamily: params.factFamily,
      ...(params.fieldKey ? { fieldKey: params.fieldKey } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildRecurringProcedurePendingConfirmationMetadata(params: {
  confidence: RecurringProcedureSemanticConfidence;
  evidence: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "recurring_procedure",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(
        Date.parse(observedAt) + PROJECT_FACT_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      procedureFamily: params.procedureFamily,
      ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
      evidence: params.evidence,
    },
  };
}

function buildWorkflowImprovementPendingConfirmationMetadata(params: {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  lessonFamily: WorkflowImprovementLessonFamily;
  state?: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  observedAt?: string;
  clusterKey?: string;
  contradictionCount?: number;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "workflow_improvement",
      state: params.state ?? "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(
        Date.parse(observedAt) + WORKFLOW_IMPROVEMENT_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      ...(params.guidancePattern ? { guidancePattern: params.guidancePattern } : {}),
      ...(params.clusterKey ? { clusterKey: params.clusterKey } : {}),
      ...(typeof params.contradictionCount === "number"
        ? { contradictionCount: params.contradictionCount }
        : {}),
      evidence: params.evidence,
    },
  };
}

function shouldSkipImmediateConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateProjectFactConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < PROJECT_FACT_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateRecurringProcedureConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < PROCEDURE_CONFIRMATION_MIN_AGE_MS;
}

function shouldSkipImmediateWorkflowImprovementConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) && now - createdAtMs < WORKFLOW_IMPROVEMENT_CONFIRMATION_MIN_AGE_MS
  );
}

function buildSubscriberCaptureMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  timestamp?: string;
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
  };

  const familyCaptureMetadata = getCaptureMetadataByCaptureClass(match.captureClass);
  if (familyCaptureMetadata) {
    metadata.category = familyCaptureMetadata.category;
    metadata.source = familyCaptureMetadata.source;
    if (familyCaptureMetadata.subjectKeyMetadata === "subject_key") {
      metadata.subject_key = match.subjectKey;
    }
  }

  switch (match.captureClass) {
    case "explicit_preference":
      metadata.category = "user_preference";
      metadata.source = "explicit_user_statement";
      break;
    case "preference_correction":
      metadata.category = "user_preference_correction";
      metadata.source = "conversational_user_correction";
      metadata.subject_key = match.subjectKey;
      metadata.preference_key = match.subjectKey;
      break;
    case "explicit_requirement":
      metadata.category = "user_requirement";
      metadata.source = "explicit_user_requirement";
      break;
    case "requirement_correction":
      metadata.category = "user_requirement_correction";
      metadata.source = "conversational_user_requirement_correction";
      metadata.subject_key = match.subjectKey;
      break;
    case "explicit_project_fact":
      break;
    case "project_fact_correction":
      metadata.category = "project_fact_correction";
      metadata.source = "conversational_project_fact_correction";
      metadata.subject_key = match.subjectKey;
      break;
    case "explicit_recurring_procedure":
      break;
    case "recurring_procedure_correction":
      metadata.category = "recurring_procedure_correction";
      metadata.source = "conversational_recurring_procedure_correction";
      metadata.subject_key = match.subjectKey;
      break;
    case "workflow_tool_gotcha":
    case "workflow_environment_constraint":
    case "workflow_api_workaround":
    case "workflow_generalized_guidance":
    case "project_rule_guidance":
    case "unmet_need_recommendation":
      break;
  }

  return params.extraMetadata ? { ...metadata, ...params.extraMetadata } : metadata;
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
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
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
        ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
        ...(params.toolKey ? { toolKey: params.toolKey } : {}),
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
        ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
        ...(params.toolKey ? { toolKey: params.toolKey } : {}),
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
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
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
    (params.lessonKey === "python_command_unavailable" ||
      params.lessonKey === "gateway_tools_invoke_forbidden") &&
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
    (params.lessonKey === "vitest_wrapper_required" ||
      params.lessonKey === "scripts_committer_required" ||
      params.lessonKey === "git_stash_unsafe") &&
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
    (params.lessonKey === "openai_embeddings_api_key_required" ||
      params.lessonKey === "anthropic_context1m_eligible_credential_required") &&
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

function buildWorkflowImprovementAutoPromotionMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
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
      lessonFamily: params.lessonFamily,
      ...(params.lessonKey ? { lessonKey: params.lessonKey } : {}),
      ...(params.toolKey ? { toolKey: params.toolKey } : {}),
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      value: params.match.value,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.normalizedProjectScope
        ? { normalizedProjectScope: params.match.normalizedProjectScope }
        : {}),
      ...(params.match.guidancePattern ? { guidancePattern: params.match.guidancePattern } : {}),
      ...(params.match.needCategory ? { needCategory: params.match.needCategory } : {}),
      ...(params.match.neededCapability ? { neededCapability: params.match.neededCapability } : {}),
      ...(params.match.normalizedNeededCapability
        ? { normalizedNeededCapability: params.match.normalizedNeededCapability }
        : {}),
      ...(params.match.recommendedAction
        ? { recommendedAction: params.match.recommendedAction }
        : {}),
      ...(params.match.avoidAction ? { avoidAction: params.match.avoidAction } : {}),
      ...(params.match.rationale ? { rationale: params.match.rationale } : {}),
      ...(params.lessonFamily === "generalized_unmet_need"
        ? { recommendationMode: "recommendation_only" }
        : { guidanceMode: "guidance_only" }),
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

function isAutoReviewedManagedImprovementDecision(
  decision: WorkflowImprovementCaptureDecision,
): boolean {
  return decision.lessonFamily !== "supported_lesson";
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

function buildWorkflowImprovementAutoReviewMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  autoPromotionProfile: string;
  outcome: "approve" | "supersede_existing";
  evidenceCount: number;
  contradictionCount: number;
  supersedeTargetIds: string[];
  rejectedCandidateIds: string[];
  timestamp?: string;
  semanticMetadata?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    autoPromotion: {
      source: AUTO_PROMOTION_SOURCE,
      captureSeam: "transcript_subscriber_fallback",
      profile: params.autoPromotionProfile,
      captureProfile: params.match.profile,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      lessonFamily: params.lessonFamily,
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      normalizedSubject: params.match.normalizedSubject,
      value: params.match.value,
      normalizedValue: params.match.normalizedValue,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.normalizedProjectScope
        ? { normalizedProjectScope: params.match.normalizedProjectScope }
        : {}),
      ...(params.match.guidancePattern ? { guidancePattern: params.match.guidancePattern } : {}),
      ...(params.match.needCategory ? { needCategory: params.match.needCategory } : {}),
      ...(params.match.neededCapability ? { neededCapability: params.match.neededCapability } : {}),
      ...(params.match.normalizedNeededCapability
        ? { normalizedNeededCapability: params.match.normalizedNeededCapability }
        : {}),
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
      ...(params.lessonFamily === "generalized_unmet_need"
        ? { recommendationMode: "recommendation_only" }
        : { guidanceMode: "guidance_only" }),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
    ...(params.semanticMetadata ?? {}),
    candidateConfirmation: {
      state: "confirmed",
      method: "generalized_cluster_auto_review",
      confirmationEvidenceCount: params.evidenceCount,
      contradictionCount: params.contradictionCount,
      clusterKey: params.match.key,
    },
    workflowAutoReview: {
      family: "workflow_improvement",
      lessonFamily: params.lessonFamily,
      clusterKey: params.match.key,
      outcome: params.outcome,
      evidenceCount: params.evidenceCount,
      contradictionCount: params.contradictionCount,
      supersedeTargetIds: params.supersedeTargetIds,
      rejectedCandidateIds: params.rejectedCandidateIds,
    },
  };
}

export function createOrdinaryTurnAutoCaptureHandler(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  logger: PluginLogger;
  candidateIngress: CandidateIngressPort;
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
    timestamp?: string;
  }): Promise<boolean> {
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
      params.logger.debug?.(
        formatLog("memory-middleware response-style capture skipped existing approved key", {
          key: match.key,
          memoryObjectId: inspection.matchingApprovedObjectId,
        }),
      );
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware response-style capture skipped recent duplicate", {
          key: match.key,
        }),
      );
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

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      extraMetadata: {
        ...(semanticMetadata ?? {}),
        ...(decisionParams.decision.reviewMode !== "direct"
          ? buildPendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              responseStyleFamily: decisionParams.decision.responseStyleFamily,
              state: decisionParams.decision.reviewMode,
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
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
            confirmationWindowMs: RESPONSE_STYLE_CONFIRMATION_WINDOW_MS,
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

    const shouldDirectPromote =
      autoPromotion.profile === "explicit-user-preference-v1" &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId &&
      decisionParams.decision.reviewMode === "direct" &&
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

    params.logger.info(
      formatLog("memory-middleware ordinary-turn response-style capture accepted", {
        key: match.key,
        profile: match.profile,
        captureClass: match.captureClass,
        candidateKind: match.candidateKind,
        confidence: decisionParams.decision.confidence,
        confirmationMode: decisionParams.decision.reviewMode,
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
    timestamp?: string;
  }): Promise<boolean> {
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
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware project-fact capture skipped recent duplicate", {
          key: match.key,
        }),
      );
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

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      autoCaptureExtras: {
        factFamily: decisionParams.decision.factFamily,
        ...(decisionParams.decision.fieldKey ? { fieldKey: decisionParams.decision.fieldKey } : {}),
      },
      extraMetadata: {
        ...(semanticMetadata ?? {}),
        ...(match.captureClass === "explicit_project_fact"
          ? buildProjectFactPendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              factFamily: decisionParams.decision.factFamily,
              state: decisionParams.decision.reviewMode,
              ...(decisionParams.decision.fieldKey
                ? { fieldKey: decisionParams.decision.fieldKey }
                : {}),
              ...(isGeneralizedProjectFactMatch(match) ? { clusterKey: match.key } : {}),
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
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
            confirmationWindowMs: PROJECT_FACT_CONFIRMATION_WINDOW_MS,
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

    const projectFactCorrectionPlan =
      result.memoryObjectId && match.captureClass === "project_fact_correction"
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
        reviewMode: decisionParams.decision.reviewMode,
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
    timestamp?: string;
  }): Promise<boolean> {
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
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware recurring-procedure capture skipped recent duplicate", {
          key: match.key,
        }),
      );
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

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
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
          decisionParams.decision.reviewMode === "hold_for_more_evidence")
          ? buildRecurringProcedurePendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
              procedureFamily: decisionParams.decision.procedureFamily,
              ...(decisionParams.decision.procedureKey
                ? { procedureKey: decisionParams.decision.procedureKey }
                : {}),
              state: decisionParams.decision.reviewMode,
              ...(decisionParams.timestamp ? { observedAt: decisionParams.timestamp } : {}),
            })
          : {}),
      },
    });
    const recurringProcedureCorrectionPlan =
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
            confirmationWindowMs: PROCEDURE_CONFIRMATION_WINDOW_MS,
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

    const shouldDirectPromote =
      autoPromotion.profile === "explicit-user-preference-v1" &&
      autoPromotionAgents.has(decisionParams.agentExternalKey) &&
      result.memoryObjectId &&
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
        reviewMode: decisionParams.decision.reviewMode,
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
    timestamp?: string;
  }): Promise<boolean> {
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
      return true;
    }
    if (effectiveDecision.lessonFamily === "generalized_workflow_lesson" && attribution.projectId) {
      const deterministicPattern = await findApprovedWorkflowPhrasePatternMatch({
        config: params.config,
        text: decisionParams.text,
        projectId: attribution.projectId,
        logger: params.logger,
      });
      if (deterministicPattern) {
        effectiveDecision = {
          action: "capture",
          confidence: "high",
          detectionSource: "deterministic",
          evidence: ["approved_phrase_pattern_match"],
          reviewMode: "hold_for_more_evidence",
          lessonFamily: deterministicPattern.match.lessonFamily,
          ...(deterministicPattern.match.guidancePattern
            ? { guidancePattern: deterministicPattern.match.guidancePattern }
            : {}),
          match: toOrdinaryTurnWorkflowImprovementMatch(deterministicPattern.match),
        };
        match = effectiveDecision.match;
      }
    }
    const semanticMetadata = buildWorkflowImprovementSemanticMetadata({
      detectionSource: effectiveDecision.detectionSource,
      confidence: effectiveDecision.confidence,
      evidence: effectiveDecision.evidence,
      lessonFamily: effectiveDecision.lessonFamily,
      ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
      ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
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
    const isGeneralized = isAutoReviewedManagedImprovementDecision(effectiveDecision);
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

    if (
      inspection?.pendingCandidate &&
      isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate)
    ) {
      await rejectWorkflowImprovementCandidateIfPresent({
        candidateId: inspection.pendingCandidate.id,
        subjectKey: match.subjectKey,
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
        ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
        ...(effectiveDecision.guidancePattern
          ? { guidancePattern: effectiveDecision.guidancePattern }
          : {}),
        rationale: isGeneralized
          ? effectiveDecision.lessonFamily === "generalized_project_rule"
            ? "project-rule cluster expired without enough compatible evidence"
            : effectiveDecision.lessonFamily === "generalized_unmet_need"
              ? "unmet-need cluster expired without enough compatible evidence"
              : "generalized workflow lesson cluster expired without enough compatible evidence"
          : "workflow-improvement candidate confirmation window expired without later confirming evidence",
        reviewerAgentId: attribution.agentId,
        logger: params.logger,
        reviewCandidate: deps.reviewCandidate,
        source: isGeneralized
          ? effectiveDecision.lessonFamily === "generalized_project_rule"
            ? "project_rule_generic_auto_review"
            : effectiveDecision.lessonFamily === "generalized_unmet_need"
              ? "unmet_need_generic_auto_review"
              : "workflow_improvement_generic_auto_review"
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
            rationale:
              effectiveDecision.lessonFamily === "generalized_project_rule"
                ? "older project-rule cluster expired without enough compatible evidence"
                : effectiveDecision.lessonFamily === "generalized_unmet_need"
                  ? "older unmet-need cluster expired without enough compatible evidence"
                  : "older generalized workflow lesson cluster expired without enough compatible evidence",
            reviewerAgentId: attribution.agentId,
            logger: params.logger,
            reviewCandidate: deps.reviewCandidate,
            source:
              effectiveDecision.lessonFamily === "generalized_project_rule"
                ? "project_rule_generic_auto_review"
                : effectiveDecision.lessonFamily === "generalized_unmet_need"
                  ? "unmet_need_generic_auto_review"
                  : "workflow_improvement_generic_auto_review",
          });
        }
      }
    }

    if (inspection?.matchingApprovedObjectId) {
      if (supportsPhraseInduction && attribution.projectId && canonicalMatchForPhraseInduction) {
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
      params.logger.debug?.(
        formatLog("memory-middleware workflow-improvement capture skipped existing approved key", {
          key: match.key,
          memoryObjectId: inspection.matchingApprovedObjectId,
        }),
      );
      markRecent(match.key);
      return true;
    }

    if (recentKeys.has(match.key) && !inspection?.pendingCandidate) {
      params.logger.debug?.(
        formatLog("memory-middleware workflow-improvement capture skipped recent duplicate", {
          key: match.key,
        }),
      );
      return true;
    }

    const candidateMetadata = buildSubscriberCaptureMetadata({
      match,
      agentExternalKey: decisionParams.agentExternalKey,
      sessionKey: decisionParams.sessionKey,
      transcriptFile: decisionParams.transcriptFile,
      ...(decisionParams.timestamp ? { timestamp: decisionParams.timestamp } : {}),
      autoCaptureExtras: {
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
        ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
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
        ...(effectiveDecision.lessonFamily === "generalized_unmet_need"
          ? { recommendationMode: "recommendation_only" }
          : { guidanceMode: "guidance_only" }),
      },
      extraMetadata: {
        ...semanticMetadata,
        ...buildWorkflowImprovementPendingConfirmationMetadata({
          confidence: effectiveDecision.confidence,
          evidence: effectiveDecision.evidence,
          lessonFamily: effectiveDecision.lessonFamily,
          state: effectiveDecision.reviewMode,
          ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
          ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
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
          rationale:
            effectiveDecision.lessonFamily === "generalized_project_rule"
              ? "older project-rule cluster was replaced by stronger newer conflicting evidence for the same scoped subject"
              : effectiveDecision.lessonFamily === "generalized_unmet_need"
                ? "older unmet-need cluster was replaced by stronger newer conflicting evidence for the same scoped subject"
                : "older generalized workflow lesson cluster was replaced by stronger newer conflicting evidence for the same scoped subject",
          reviewerAgentId: attribution.agentId,
          logger: params.logger,
          reviewCandidate: deps.reviewCandidate,
          source:
            effectiveDecision.lessonFamily === "generalized_project_rule"
              ? "project_rule_generic_auto_review"
              : effectiveDecision.lessonFamily === "generalized_unmet_need"
                ? "unmet_need_generic_auto_review"
                : "workflow_improvement_generic_auto_review",
        });
      }

      const workflowCorrectionPlan = resolveMemoryCorrectionPlan({
        familyId:
          getMemoryFamilyIdByWorkflowLessonFamily(effectiveDecision.lessonFamily) ??
          "workflow_improvement",
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
        lessonFamily: effectiveDecision.lessonFamily,
        metadata: buildWorkflowImprovementAutoReviewMetadata({
          match,
          lessonFamily: effectiveDecision.lessonFamily,
          agentExternalKey: decisionParams.agentExternalKey,
          sessionKey: decisionParams.sessionKey,
          transcriptFile: decisionParams.transcriptFile,
          autoPromotionProfile:
            effectiveDecision.lessonFamily === "generalized_project_rule"
              ? "project_rule_auto_review_v1"
              : effectiveDecision.lessonFamily === "generalized_unmet_need"
                ? "unmet_need_auto_review_v1"
                : "workflow_generalized_auto_review_v1",
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
            formatLog(
              effectiveDecision.lessonFamily === "generalized_project_rule"
                ? "memory-middleware project-rule supersede failed"
                : effectiveDecision.lessonFamily === "generalized_unmet_need"
                  ? "memory-middleware unmet-need supersede failed"
                  : "memory-middleware generalized workflow supersede failed",
              {
                key: match.key,
                promotedMemoryObjectId,
                reason: supersedeResult.reason ?? "unknown",
              },
            ),
          );
        }
      }
      if (promotedMemoryObjectId) {
        if (supportsPhraseInduction && attribution.projectId && canonicalMatchForPhraseInduction) {
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
        markRecent(match.key);
      }
      return true;
    }

    if (
      effectiveDecision.reviewMode === "pending_confirmation" &&
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
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
        metadata: buildWorkflowImprovementAutoPromotionMetadata({
          match,
          lessonFamily: effectiveDecision.lessonFamily,
          ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
          ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
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
            confirmationWindowMs: WORKFLOW_IMPROVEMENT_CONFIRMATION_WINDOW_MS,
          },
        }),
        logContext: {
          key: match.key,
          subjectKey: match.subjectKey,
          lessonFamily: effectiveDecision.lessonFamily,
          ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
          ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
          confidence: effectiveDecision.confidence,
        },
      });
      if (promotedMemoryObjectId) {
        markRecent(match.key);
      }
      return true;
    }

    if (
      inspection?.pendingCandidate &&
      !isExpiredPendingWorkflowImprovementCandidate(inspection.pendingCandidate) &&
      (effectiveDecision.reviewMode === "hold_for_more_evidence" ||
        shouldSkipImmediateWorkflowImprovementConfirmation(inspection.pendingCandidate.createdAt))
    ) {
      params.logger.debug?.(
        formatLog(
          effectiveDecision.reviewMode === "hold_for_more_evidence"
            ? "memory-middleware workflow-improvement capture skipped existing held cluster"
            : "memory-middleware workflow-improvement capture skipped immediate duplicate",
          {
            key: match.key,
            candidateId: inspection.pendingCandidate.id,
            lessonFamily: effectiveDecision.lessonFamily,
          },
        ),
      );
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
    params.logger.info(
      formatLog("memory-middleware ordinary-turn workflow-improvement capture accepted", {
        key: match.key,
        lessonFamily: effectiveDecision.lessonFamily,
        ...(effectiveDecision.lessonKey ? { lessonKey: effectiveDecision.lessonKey } : {}),
        ...(effectiveDecision.toolKey ? { toolKey: effectiveDecision.toolKey } : {}),
        ...(effectiveDecision.guidancePattern
          ? { guidancePattern: effectiveDecision.guidancePattern }
          : {}),
        reviewMode: effectiveDecision.reviewMode,
        confidence: effectiveDecision.confidence,
        eventId: result.eventId,
        memoryObjectId: result.memoryObjectId,
      }),
    );
    return true;
  }

  return async (update) => {
    if (autoCapture.profile === "disabled") {
      return;
    }
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
    const deterministicResponseStylePhraseMatch = await findApprovedResponseStylePhrasePatternMatch(
      {
        config: params.config,
        text,
        logger: params.logger,
      },
    );
    if (
      deterministicResponseStylePhraseMatch &&
      (await handleResponseStyleDecision({
        decision: {
          action: "capture",
          confidence: "high",
          detectionSource: "deterministic",
          evidence: ["approved_phrase_pattern_match"],
          responseStyleFamily: deterministicResponseStylePhraseMatch.match.family,
          match: toOrdinaryTurnResponseStyleMatch(deterministicResponseStylePhraseMatch.match),
          reviewMode:
            deterministicResponseStylePhraseMatch.match.family === "generalized_guidance"
              ? "hold_for_more_evidence"
              : "direct",
        },
        observedText: text,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
      }))
    ) {
      return;
    }
    const responseStyleDecision = await detectResponseStyleCaptureDecision(
      text,
      autoCapture.profile,
      params.config,
    );
    if (
      responseStyleDecision &&
      (await handleResponseStyleDecision({
        decision: responseStyleDecision,
        observedText: text,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
      }))
    ) {
      return;
    }
    const projectFactDecision = await detectProjectFactCaptureDecision(text, autoCapture.profile);
    if (
      projectFactDecision &&
      (await handleProjectFactDecision({
        decision: projectFactDecision,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
      }))
    ) {
      return;
    }
    const recurringProcedureDecision = await detectRecurringProcedureCaptureDecision(
      text,
      autoCapture.profile,
    );
    if (
      recurringProcedureDecision &&
      (await handleRecurringProcedureDecision({
        decision: recurringProcedureDecision,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
      }))
    ) {
      return;
    }
    const workflowImprovementDecision = await detectWorkflowImprovementCaptureDecision(
      text,
      autoCapture.profile,
      params.config,
    );
    if (
      workflowImprovementDecision &&
      (await handleWorkflowImprovementDecision({
        decision: workflowImprovementDecision,
        text,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
      }))
    ) {
      return;
    }
    const match = parseOrdinaryTurnAutoCapturePreference(text, autoCapture.profile);
    if (!match) {
      return;
    }
    if (inFlightKeys.has(match.key) || recentKeys.has(match.key)) {
      return;
    }

    inFlightKeys.add(match.key);
    try {
      const existing = await deps.findExistingByKey({
        config: params.config,
        key: match.key,
      });
      if (existing) {
        params.logger.debug?.(
          formatLog("memory-middleware ordinary-turn auto-capture skipped existing key", {
            key: match.key,
            memoryObjectId: existing.id,
            reviewState: existing.reviewState,
          }),
        );
        markRecent(match.key);
        return;
      }
      const attribution = await deps.resolveAttribution({
        config: params.config,
        agentExternalKey,
        sessionKey,
        transcriptFile,
      });
      if (!attribution) {
        params.logger.warn(
          formatLog("memory-middleware ordinary-turn auto-capture skipped missing attribution", {
            agentExternalKey,
            sessionKey,
          }),
        );
        return;
      }
      const candidateMetadata = buildSubscriberCaptureMetadata({
        match,
        agentExternalKey,
        sessionKey,
        transcriptFile,
        ...(timestamp ? { timestamp } : {}),
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
        return;
      }
      markRecent(match.key);
      if (
        autoPromotion.profile === "explicit-user-preference-v1" &&
        autoPromotionAgents.has(agentExternalKey) &&
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
            agentExternalKey,
            sessionKey,
            transcriptFile,
            ...(timestamp ? { transcriptTimestamp: timestamp } : {}),
          },
        };
        const reviewResult = await deps.reviewCandidate({
          candidateId: result.memoryObjectId,
          outcome: "accepted",
          reviewerAgentId: attribution.agentId,
          metadata: autoPromotionMetadata,
        });
        if (!reviewResult.accepted) {
          params.logger.warn(
            formatLog("memory-middleware ordinary-turn auto-promotion review rejected", {
              key: match.key,
              candidateId: result.memoryObjectId,
              reason: reviewResult.reason ?? "unknown",
            }),
          );
        } else {
          const promotionResult = await deps.promoteToMemory({
            candidateId: result.memoryObjectId,
            promoterAgentId: attribution.agentId,
            metadata: autoPromotionMetadata,
          });
          if (!promotionResult.accepted) {
            params.logger.warn(
              formatLog("memory-middleware ordinary-turn auto-promotion failed", {
                key: match.key,
                candidateId: result.memoryObjectId,
                reason: promotionResult.reason ?? "unknown",
              }),
            );
          } else {
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
          eventId: result.eventId,
          memoryObjectId: result.memoryObjectId,
        }),
      );
    } catch (error) {
      params.logger.error(
        formatLog("memory-middleware ordinary-turn auto-capture failed", {
          error: error instanceof Error ? error.message : String(error),
          sessionKey,
          transcriptFile,
        }),
      );
    } finally {
      inFlightKeys.delete(match.key);
    }
  };
}

export function createOrdinaryTurnAutoCaptureController(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  logger: PluginLogger;
  candidateIngress: CandidateIngressPort;
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
