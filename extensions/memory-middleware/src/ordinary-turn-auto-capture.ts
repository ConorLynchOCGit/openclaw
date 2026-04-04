import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import {
  DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG,
  type MemoryMiddlewareConfig,
} from "./config.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AUTO_CAPTURE_SOURCE = "ordinary_turn_auto_capture";
const AUTO_CAPTURE_REASON = "explicit_preference_statement";
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
const PREFERENCE_CANDIDATE_CONTENT_PATTERNS = [
  {
    template: "my_preferred_is" as const,
    pattern:
      /^user(?: preference:|['’]s)? preferred ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
    subjectPrefix: "preferred",
  },
  {
    template: "my_favorite_is" as const,
    pattern:
      /^user(?: preference:|['’]s)? favorite ([a-z0-9][a-z0-9 -]{0,47}) is ([a-z0-9][a-z0-9 '&/().,-]{0,63})[.!?]?$/i,
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
  profile: "user-preference-v1";
  template: "my_preferred_is" | "my_favorite_is";
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
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
  submitLearning: (input: {
    content: string;
    agentId: string;
    sessionId: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ accepted: boolean; reason?: string; eventId?: string; memoryObjectId?: string }>;
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

function buildPreferenceMatch(params: {
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
  const value = normalizeText(matched[2] ?? "").replace(/[.!?]+$/, "");
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
  return {
    profile: "user-preference-v1",
    template: params.template,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content: `User preference: ${params.subjectPrefix} ${subject} is ${value}.`,
    key: buildAutoCaptureKey({
      template: params.template,
      normalizedSubject,
      normalizedValue,
    }),
  };
}

export function parseOrdinaryTurnAutoCapturePreference(
  messageText: string,
): OrdinaryTurnAutoCaptureMatch | null {
  const normalized = normalizeText(stripTranscriptTimestampPrefix(messageText));
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

  for (const { pattern, template, subjectPrefix } of PREFERENCE_PATTERNS) {
    const match = buildPreferenceMatch({
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
    submitLearning: async (input) => candidateIngress.submitLearning(input),
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
  const allowedAgents = new Set(
    autoCapture.allowedAgents.length > 0 ? autoCapture.allowedAgents : [...DEFAULT_ALLOWED_AGENTS],
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
    if (autoCapture.profile !== "user-preference-v1") {
      return;
    }
    const sessionKey =
      typeof update.sessionKey === "string" ? normalizeText(update.sessionKey) : "";
    const transcriptFile = normalizeText(update.sessionFile);
    const agentExternalKey = resolveAgentExternalKeyFromTranscriptFile(transcriptFile);
    if (
      !sessionKey ||
      !transcriptFile ||
      !agentExternalKey ||
      !allowedAgents.has(agentExternalKey)
    ) {
      return;
    }
    const text = extractTranscriptUserText(update.message);
    if (!text) {
      return;
    }
    const match = parseOrdinaryTurnAutoCapturePreference(text);
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
            agentId: agentExternalKey,
            sessionKey,
          }),
        );
        return;
      }
      const timestamp = extractTranscriptTimestamp(update.message);
      const result = await deps.submitLearning({
        content: match.content,
        agentId: attribution.agentId,
        sessionId: attribution.sessionId,
        metadata: {
          autoCapture: {
            source: AUTO_CAPTURE_SOURCE,
            profile: match.profile,
            reasonCode: AUTO_CAPTURE_REASON,
            template: match.template,
            key: match.key,
            subject: match.subject,
            value: match.value,
            agentExternalKey,
            sessionKey,
            transcriptFile,
            ...(timestamp ? { transcriptTimestamp: timestamp } : {}),
          },
        },
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
      params.logger.info(
        formatLog("memory-middleware ordinary-turn auto-capture accepted", {
          key: match.key,
          profile: match.profile,
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
  const autoCapture = params.config.autoCapture ?? DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG;
  const handleUpdate = createOrdinaryTurnAutoCaptureHandler({
    config: params.config,
    logger: params.logger,
    candidateIngress: params.candidateIngress,
    deps: params.deps,
  });

  return {
    start() {
      if (unsubscribe || autoCapture.profile === "disabled") {
        return;
      }
      unsubscribe = params.subscribe((update) => {
        void handleUpdate(update);
      });
      params.logger.info(
        formatLog("memory-middleware ordinary-turn auto-capture started", {
          profile: autoCapture.profile,
          allowedAgents: autoCapture.allowedAgents,
        }),
      );
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
