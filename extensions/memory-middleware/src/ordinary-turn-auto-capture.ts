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

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AUTO_CAPTURE_SOURCE = "ordinary_turn_auto_capture";
const AUTO_PROMOTION_SOURCE = "ordinary_turn_auto_promotion";
const AUTO_CAPTURE_ALLOWED_ROLES = new Set(["user"]);
const DEFAULT_ALLOWED_AGENTS = new Set(["chief", "main"]);
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
    pattern:
      /^(?:actually,?|correction:|no,|i meant,?|that(?:'|’)s not right,?|sorry,)\s*my preferred ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern:
      /^(?:actually,?|correction:|no,|i meant,?|that(?:'|’)s not right,?|sorry,)\s*my favorite ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
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
      /^(?:please\s+)?(?:use bullet points|write (?:your )?(?:responses|reply|replies|answers) in bullet points)(?: when listing items)?[.!?]?$/i,
    subject: "response format",
    value: "use bullet points when listing items",
    content: "User requirement: use bullet points when listing items.",
  },
  {
    template: "responses_plain_english" as const,
    pattern:
      /^(?:please\s+)?(?:use plain english|write (?:your )?(?:responses|reply|replies|answers) in plain english)[.!?]?$/i,
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
  captureClass: "explicit_preference" | "preference_correction" | "explicit_requirement";
  candidateKind: "learning" | "correction";
  reasonCode:
    | "explicit_preference_statement"
    | "explicit_preference_correction"
    | "explicit_requirement_statement";
  template:
    | "my_preferred_is"
    | "my_favorite_is"
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables";
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
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
    outcome: "accepted";
    reviewerAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; reviewId?: string }>;
  promoteToMemory: (input: {
    candidateId: string;
    promoterAgentId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; promotedMemoryObjectId?: string }>;
};

export type OrdinaryTurnAutoCaptureController = {
  start: () => void;
  stop: () => void;
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
  normalized: string;
  template:
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables";
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
    captureClass: "explicit_requirement",
    candidateKind: "learning",
    reasonCode: "explicit_requirement_statement",
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

    for (const { pattern, template, subject, value, content } of REQUIREMENT_PATTERNS) {
      const match = buildRequirementMatch({
        profile,
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

  return null;
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
  };
}

function formatLog(message: string, meta: Record<string, unknown>): string {
  return `${message} ${JSON.stringify(meta)}`;
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
      const timestamp = extractTranscriptTimestamp(transcriptMessage);
      const candidateMetadata = {
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
          agentExternalKey,
          sessionKey,
          transcriptFile,
          ...(timestamp ? { transcriptTimestamp: timestamp } : {}),
        },
      };
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
