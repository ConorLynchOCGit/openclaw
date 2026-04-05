import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import {
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG,
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG,
  type MemoryMiddlewareConfig,
} from "./config.js";
import {
  type ResponseStyleForgetResult,
  type ResponseStyleLifecycleInspection,
  forgetApprovedResponseStyleBySubjectKey,
  inspectResponseStyleLifecycle,
  isExpiredPendingResponseStyleCandidate,
} from "./response-style-lifecycle.js";
import {
  detectResponseStyleSemanticDecision,
  isResponseStyleCorrectionMatch,
  isResponseStyleLearningMatch,
  RESPONSE_STYLE_TEMPLATES,
  type ResponseStyleCanonicalMatch,
  type ResponseStyleSemanticConfidence,
} from "./response-style-semantic.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AUTO_CAPTURE_SOURCE = "ordinary_turn_auto_capture";
const AUTO_PROMOTION_SOURCE = "ordinary_turn_auto_promotion";
const RESPONSE_STYLE_FORGET_SOURCE = "response_style_forget_request";
const AUTO_CAPTURE_ALLOWED_ROLES = new Set(["user"]);
const DEFAULT_ALLOWED_AGENTS = new Set(["chief", "main"]);
const RESPONSE_STYLE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS = 5_000;
const CORRECTION_PREFIX =
  "(?:actually,?|correction:|no,?|i meant,?|that(?:'|’)s not right,?|sorry,?)\\s*";
const RESPONSE_STYLE_TEMPLATE_SET = new Set<string>(RESPONSE_STYLE_TEMPLATES);
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
    pattern:
      /^(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ([a-z0-9][a-z0-9 _./:-]{0,63})[.!?]?$/i,
  },
] as const;
const PROJECT_FACT_CORRECTION_PATTERNS = [
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ([a-z0-9][a-z0-9 _./:-]{0,63})[.!?]?$`,
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
    pattern:
      /^project fact \[([a-z0-9][a-z0-9 -]{0,47})\]: ([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?([a-z0-9][a-z0-9 _./:-]{0,63})["']?[.!?]?$/i,
  },
  {
    template: "project_fact_named_scope" as const,
    pattern:
      /^(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?([a-z0-9][a-z0-9 _./:-]{0,63})["']?[.!?]?$/i,
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
    pattern:
      /^project correction \[([a-z0-9][a-z0-9 -]{0,47})\]: ([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?([a-z0-9][a-z0-9 _./:-]{0,63})["']?[.!?]?$/i,
  },
  {
    template: "project_fact_named_scope" as const,
    pattern: new RegExp(
      `^${CORRECTION_PREFIX}(?:for|in) project ([a-z0-9][a-z0-9 -]{0,47}), (?:the )?([a-z0-9][a-z0-9 _/-]{0,47}) is ["']?([a-z0-9][a-z0-9 _./:-]{0,63})["']?(?:\\s*\\(not [^)]+\\))?[.!?]?$`,
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

export type OrdinaryTurnAutoCaptureMatch = {
  profile: "user-preference-v1" | "user-preference-v2";
  captureClass:
    | "explicit_preference"
    | "preference_correction"
    | "explicit_requirement"
    | "requirement_correction"
    | "explicit_project_fact"
    | "project_fact_correction";
  candidateKind: "learning" | "correction";
  reasonCode:
    | "explicit_preference_statement"
    | "explicit_preference_correction"
    | "explicit_requirement_statement"
    | "explicit_requirement_correction"
    | "explicit_project_fact_statement"
    | "explicit_project_fact_correction";
  template:
    | "my_preferred_is"
    | "my_favorite_is"
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps"
    | "project_fact_named_scope";
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  projectScope?: string;
  normalizedProjectScope?: string;
};

type ResolvedAttribution = {
  agentId: string;
  sessionId: string;
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
  inspectResponseStyleLifecycle: (params: {
    config: MemoryMiddlewareConfig;
    key: string;
    subjectKey: string;
    logger?: PluginLogger;
  }) => Promise<ResponseStyleLifecycleInspection | null>;
  forgetApprovedResponseStyleBySubjectKey: (params: {
    config: MemoryMiddlewareConfig;
    subjectKey: string;
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<ResponseStyleForgetResult>;
};

export type OrdinaryTurnAutoCaptureController = {
  start: () => void;
  stop: () => void;
};

type ResponseStyleDetectionSource = "deterministic" | "semantic";

type ResponseStyleCaptureDecision =
  | {
      action: "capture";
      confidence: "high";
      detectionSource: "deterministic" | "semantic";
      evidence: string[];
      match: OrdinaryTurnAutoCaptureMatch;
      confirmationMode: "direct";
    }
  | {
      action: "capture";
      confidence: ResponseStyleSemanticConfidence;
      detectionSource: "semantic";
      evidence: string[];
      match: OrdinaryTurnAutoCaptureMatch;
      confirmationMode: "pending_confirmation";
    }
  | {
      action: "forget";
      confidence: "high";
      detectionSource: "semantic";
      evidence: string[];
      subject: string;
      subjectKey: string;
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
  template: "project_fact_named_scope";
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
    looksLikeSensitiveValue(value)
  ) {
    return null;
  }
  const normalizedCompositeSubject = `${normalizedProjectScope} :: ${normalizedSubject}`;
  const subjectKey = buildAutoCaptureSubjectKey({
    template: params.template,
    normalizedSubject: normalizedCompositeSubject,
  });
  return {
    profile: params.profile,
    captureClass: params.captureClass,
    candidateKind: params.candidateKind,
    reasonCode: params.reasonCode,
    template: params.template,
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
      template: params.template,
      normalizedSubject: normalizedCompositeSubject,
      normalizedValue,
    }),
    projectScope,
    normalizedProjectScope,
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

    for (const { pattern, template } of PROJECT_FACT_CORRECTION_PATTERNS) {
      const match = buildProjectFactMatch({
        profile,
        captureClass: "project_fact_correction",
        candidateKind: "correction",
        reasonCode: "explicit_project_fact_correction",
        normalized,
        pattern,
        template,
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
    for (const { pattern, template } of PROJECT_FACT_PATTERNS) {
      const match = buildProjectFactMatch({
        profile,
        captureClass: "explicit_project_fact",
        candidateKind: "learning",
        reasonCode: "explicit_project_fact_statement",
        normalized,
        pattern,
        template,
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

  for (const { pattern, template } of PROJECT_FACT_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildProjectFactMatch({
      profile: "user-preference-v2",
      captureClass: "explicit_project_fact",
      candidateKind: "learning",
      reasonCode: "explicit_project_fact_statement",
      normalized,
      pattern,
      template,
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

  for (const { pattern, template } of PROJECT_FACT_CORRECTION_CANDIDATE_CONTENT_PATTERNS) {
    const match = buildProjectFactMatch({
      profile: "user-preference-v2",
      captureClass: "project_fact_correction",
      candidateKind: "correction",
      reasonCode: "explicit_project_fact_correction",
      normalized,
      pattern,
      template,
    });
    if (match) {
      return match;
    }
  }

  return null;
}

function isSupportedResponseStyleTemplate(template: string): boolean {
  return RESPONSE_STYLE_TEMPLATE_SET.has(template);
}

function toOrdinaryTurnResponseStyleMatch(
  match: ResponseStyleCanonicalMatch,
): OrdinaryTurnAutoCaptureMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
  };
}

function detectResponseStyleCaptureDecision(
  text: string,
  profile: "user-preference-v1" | "user-preference-v2",
): ResponseStyleCaptureDecision | null {
  if (profile !== "user-preference-v2") {
    return null;
  }

  const exactMatch = parseOrdinaryTurnAutoCapturePreference(text, profile);
  if (exactMatch && isSupportedResponseStyleTemplate(exactMatch.template)) {
    return {
      action: "capture",
      confidence: "high",
      detectionSource: "deterministic",
      evidence: ["deterministic_pattern_match"],
      match: exactMatch,
      confirmationMode: "direct",
    };
  }

  const semanticDecision = detectResponseStyleSemanticDecision(text);
  if (semanticDecision.action === "ignore") {
    return null;
  }
  if (semanticDecision.action === "forget") {
    return {
      action: "forget",
      confidence: "high",
      detectionSource: "semantic",
      evidence: semanticDecision.evidence,
      subject: semanticDecision.subject,
      subjectKey: semanticDecision.subjectKey,
    };
  }

  const match = toOrdinaryTurnResponseStyleMatch(semanticDecision.match);
  if (semanticDecision.confidence === "high") {
    return {
      action: "capture",
      confidence: "high",
      detectionSource: "semantic",
      evidence: semanticDecision.evidence,
      match,
      confirmationMode: "direct",
    };
  }
  return {
    action: "capture",
    confidence: "medium",
    detectionSource: "semantic",
    evidence: semanticDecision.evidence,
    match,
    confirmationMode: "pending_confirmation",
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
    const sessionResult = await client.query<{ id: string }>(
      `
        insert into ${sessionsTable} (agent_id, session_key, metadata)
        values ($1::uuid, $2, $3::jsonb)
        on conflict (session_key) do update
          set agent_id = excluded.agent_id,
              metadata = ${sessionsTable}.metadata || excluded.metadata,
              updated_at = now()
        returning id::text as id
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
    return { agentId, sessionId };
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
    inspectResponseStyleLifecycle,
    forgetApprovedResponseStyleBySubjectKey,
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

function buildPendingConfirmationMetadata(params: {
  confidence: ResponseStyleSemanticConfidence;
  evidence: string[];
  observedAt?: string;
}): Record<string, unknown> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    candidateLifecycle: {
      family: "response_style",
      state: "pending_confirmation",
      confidence: params.confidence,
      evidenceCount: 1,
      observedAt,
      expiresAt: new Date(
        Date.parse(observedAt) + RESPONSE_STYLE_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      evidence: params.evidence,
    },
  };
}

function shouldSkipImmediateConfirmation(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && now - createdAtMs < RESPONSE_STYLE_CONFIRMATION_MIN_AGE_MS;
}

function buildSubscriberCaptureMetadata(params: {
  match: OrdinaryTurnAutoCaptureMatch;
  agentExternalKey: string;
  sessionKey: string;
  transcriptFile: string;
  timestamp?: string;
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
      value: match.value,
      ...(match.projectScope ? { projectScope: match.projectScope } : {}),
      agentExternalKey: params.agentExternalKey,
      sessionKey: params.sessionKey,
      transcriptFile: params.transcriptFile,
      ...(params.timestamp ? { transcriptTimestamp: params.timestamp } : {}),
    },
  };

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
      metadata.category = "project_fact";
      metadata.source = "explicit_project_fact";
      metadata.subject_key = match.subjectKey;
      break;
    case "project_fact_correction":
      metadata.category = "project_fact_correction";
      metadata.source = "conversational_project_fact_correction";
      metadata.subject_key = match.subjectKey;
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
      key: params.match.key,
      subjectKey: params.match.subjectKey,
      subject: params.match.subject,
      value: params.match.value,
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

export function createOrdinaryTurnAutoCaptureHandler(params: {
  config: MemoryMiddlewareConfig;
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
        ...(decisionParams.decision.confirmationMode === "pending_confirmation"
          ? buildPendingConfirmationMetadata({
              confidence: decisionParams.decision.confidence,
              evidence: decisionParams.decision.evidence,
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
      decisionParams.decision.confirmationMode === "direct" &&
      (isResponseStyleLearningMatch(match) || isResponseStyleCorrectionMatch(match));

    if (shouldDirectPromote && result.memoryObjectId) {
      await autoPromoteResponseStyleCandidate({
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
    }

    params.logger.info(
      formatLog("memory-middleware ordinary-turn response-style capture accepted", {
        key: match.key,
        profile: match.profile,
        captureClass: match.captureClass,
        candidateKind: match.candidateKind,
        confidence: decisionParams.decision.confidence,
        confirmationMode: decisionParams.decision.confirmationMode,
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
    const responseStyleDecision = detectResponseStyleCaptureDecision(text, autoCapture.profile);
    if (
      responseStyleDecision &&
      (await handleResponseStyleDecision({
        decision: responseStyleDecision,
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
