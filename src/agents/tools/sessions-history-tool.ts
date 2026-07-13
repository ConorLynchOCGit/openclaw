/**
 * sessions_history built-in tool.
 *
 * Reads bounded, redacted session transcript history after session visibility filtering.
 */
import { readStringValue } from "@openclaw/normalization-core/string-coerce";
import { Type } from "typebox";
import { getRuntimeConfig } from "../../config/config.js";
import {
  loadSessionStore,
  readAssistantTextFromSessionTranscriptById,
  resolveDefaultSessionStorePath,
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
  resolveSessionStoreEntry,
} from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { callGateway } from "../../gateway/call.js";
import { capArrayByJsonBytes } from "../../gateway/session-utils.fs.js";
import { jsonUtf8Bytes } from "../../infra/json-utf8-bytes.js";
import { redactToolPayloadText } from "../../logging/redact.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { truncateUtf16Safe } from "../../utils.js";
import { optionalPositiveIntegerSchema } from "../schema/typebox.js";
import {
  describeSessionsHistoryTool,
  SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY,
} from "../tool-description-presets.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readPositiveIntegerParam, readStringParam } from "./common.js";
import {
  createSessionVisibilityGuard,
  createAgentToAgentPolicy,
  resolveEffectiveSessionToolsVisibility,
  resolveSessionReference,
  resolveSandboxedSessionToolContext,
  resolveVisibleSessionReference,
  stripToolMessages,
} from "./sessions-helpers.js";

const SessionsHistoryToolSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
  ref: Type.Optional(Type.String()),
  transcriptRef: Type.Optional(Type.String()),
  messageRef: Type.Optional(Type.String()),
  limit: optionalPositiveIntegerSchema(),
  includeTools: Type.Optional(Type.Boolean()),
});

const SESSIONS_HISTORY_MAX_BYTES = 256 * 1024;
const SESSIONS_HISTORY_TEXT_MAX_CHARS = 32_000;
type GatewayCaller = typeof callGateway;
type OpenClawTranscriptRef = {
  raw: string;
  sessionKey: string;
  scope: "message" | "session" | "other";
  messageId?: string;
};

// sandbox policy handling is shared with sessions-list-tool via sessions-helpers.ts

const OPENCLAW_TRANSCRIPT_REF_PREFIX = "openclaw-transcript://";

function parseOpenClawTranscriptRef(value: string): OpenClawTranscriptRef | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith(OPENCLAW_TRANSCRIPT_REF_PREFIX)) {
    return undefined;
  }
  const rest = trimmed.slice(OPENCLAW_TRANSCRIPT_REF_PREFIX.length);
  const hashIndex = rest.indexOf("#");
  const encodedSessionKey = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  if (!encodedSessionKey) {
    return undefined;
  }
  let sessionKey: string;
  try {
    sessionKey = decodeURIComponent(encodedSessionKey).trim();
  } catch {
    return undefined;
  }
  if (!sessionKey) {
    return undefined;
  }
  const fragment = hashIndex >= 0 ? rest.slice(hashIndex + 1) : "";
  let messageId: string | undefined;
  if (fragment.startsWith("message:")) {
    try {
      messageId = decodeURIComponent(fragment.slice("message:".length)).trim() || undefined;
    } catch {
      messageId = undefined;
    }
  }
  return {
    raw: trimmed,
    sessionKey,
    scope: messageId ? "message" : fragment === "session" ? "session" : "other",
    ...(messageId ? { messageId } : {}),
  };
}

function isDirectParentSessionTarget(params: {
  ref: OpenClawTranscriptRef | undefined;
  requesterSessionKey: string;
  resolvedSessionKey: string;
}): boolean {
  if (
    (params.ref !== undefined && params.ref.scope !== "session") ||
    !params.requesterSessionKey.trim()
  ) {
    return false;
  }
  try {
    const requesterAgentId = resolveAgentIdFromSessionKey(params.requesterSessionKey);
    const storePath = resolveDefaultSessionStorePath(requesterAgentId);
    const store = loadSessionStore(storePath, { skipCache: true });
    const requester = resolveSessionStoreEntry({
      store,
      sessionKey: params.requesterSessionKey,
    }).existing;
    return (
      requester?.spawnedBy === params.resolvedSessionKey ||
      requester?.parentSessionKey === params.resolvedSessionKey
    );
  } catch {
    return false;
  }
}

async function readTranscriptRefMessage(params: {
  ref: OpenClawTranscriptRef;
  resolvedSessionKey: string;
}): Promise<
  | {
      status: "found";
      message: {
        id?: string;
        role: "assistant";
        content: string;
        timestamp?: number;
      };
    }
  | { status: "not_found"; reason: string }
> {
  if (!params.ref.messageId) {
    return { status: "not_found", reason: "message id missing from transcript ref" };
  }

  const agentId = resolveAgentIdFromSessionKey(params.resolvedSessionKey);
  const storePath = resolveDefaultSessionStorePath(agentId);
  const store = loadSessionStore(storePath, { skipCache: true });
  const resolved = resolveSessionStoreEntry({
    store,
    sessionKey: params.resolvedSessionKey,
  });
  const entry = resolved.existing;
  if (!entry?.sessionId) {
    return { status: "not_found", reason: "session not found" };
  }

  const sessionFile = resolveSessionFilePath(
    entry.sessionId,
    entry,
    resolveSessionFilePathOptions({ agentId, storePath }),
  );
  const assistantText = await readAssistantTextFromSessionTranscriptById(
    sessionFile,
    params.ref.messageId,
  );
  if (!assistantText) {
    return { status: "not_found", reason: "assistant message not found" };
  }
  return {
    status: "found",
    message: {
      ...(assistantText.id ? { id: assistantText.id } : {}),
      role: "assistant",
      content: assistantText.text,
      ...(assistantText.timestamp !== undefined ? { timestamp: assistantText.timestamp } : {}),
    },
  };
}

function truncateHistoryText(text: string): {
  text: string;
  truncated: boolean;
  redacted: boolean;
} {
  // sessions_history is a tool surface, not a log sink. Keep it redacted even
  // when operators disable general-purpose log redaction.
  const sanitized = redactToolPayloadText(text);
  const redacted = sanitized !== text;
  if (sanitized.length <= SESSIONS_HISTORY_TEXT_MAX_CHARS) {
    return { text: sanitized, truncated: false, redacted };
  }
  const cut = truncateUtf16Safe(sanitized, SESSIONS_HISTORY_TEXT_MAX_CHARS);
  return { text: `${cut}\n…(truncated)…`, truncated: true, redacted };
}

function sanitizeHistoryContentBlock(block: unknown): {
  block: unknown;
  truncated: boolean;
  redacted: boolean;
} {
  if (!block || typeof block !== "object") {
    return { block, truncated: false, redacted: false };
  }
  const entry = { ...(block as Record<string, unknown>) };
  let truncated = false;
  let redacted = false;
  const type = typeof entry.type === "string" ? entry.type : "";
  if (typeof entry.text === "string") {
    const res = truncateHistoryText(entry.text);
    entry.text = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  if (type === "thinking") {
    if (typeof entry.thinking === "string") {
      const res = truncateHistoryText(entry.thinking);
      entry.thinking = res.text;
      truncated ||= res.truncated;
      redacted ||= res.redacted;
    }
    // The encrypted signature can be extremely large and is not useful for history recall.
    if ("thinkingSignature" in entry) {
      delete entry.thinkingSignature;
      truncated = true;
    }
    if ("openclawReasoningReplay" in entry) {
      delete entry.openclawReasoningReplay;
      truncated = true;
    }
  }
  if (typeof entry.partialJson === "string") {
    const res = truncateHistoryText(entry.partialJson);
    entry.partialJson = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  if (type === "image") {
    const data = readStringValue(entry.data);
    const bytes = data ? data.length : undefined;
    if ("data" in entry) {
      delete entry.data;
      truncated = true;
    }
    entry.omitted = true;
    if (bytes !== undefined) {
      entry.bytes = bytes;
    }
  }
  return { block: entry, truncated, redacted };
}

function sanitizeHistoryMessage(message: unknown): {
  message: unknown;
  truncated: boolean;
  redacted: boolean;
} {
  if (!message || typeof message !== "object") {
    return { message, truncated: false, redacted: false };
  }
  const entry = { ...(message as Record<string, unknown>) };
  let truncated = false;
  let redacted = false;
  // Tool result details often contain very large nested payloads.
  if ("details" in entry) {
    delete entry.details;
    truncated = true;
  }
  if ("usage" in entry) {
    delete entry.usage;
    truncated = true;
  }
  if ("cost" in entry) {
    delete entry.cost;
    truncated = true;
  }

  if (typeof entry.content === "string") {
    const res = truncateHistoryText(entry.content);
    entry.content = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  } else if (Array.isArray(entry.content)) {
    const updated = entry.content.map((block) => sanitizeHistoryContentBlock(block));
    entry.content = updated.map((item) => item.block);
    truncated ||= updated.some((item) => item.truncated);
    redacted ||= updated.some((item) => item.redacted);
  }
  if (typeof entry.text === "string") {
    const res = truncateHistoryText(entry.text);
    entry.text = res.text;
    truncated ||= res.truncated;
    redacted ||= res.redacted;
  }
  return { message: entry, truncated, redacted };
}

function enforceSessionsHistoryHardCap(params: {
  items: unknown[];
  bytes: number;
  maxBytes: number;
}): { items: unknown[]; bytes: number; hardCapped: boolean } {
  if (params.bytes <= params.maxBytes) {
    return { items: params.items, bytes: params.bytes, hardCapped: false };
  }

  const last = params.items.at(-1);
  const lastOnly = last ? [last] : [];
  const lastBytes = jsonUtf8Bytes(lastOnly);
  if (lastBytes <= params.maxBytes) {
    return { items: lastOnly, bytes: lastBytes, hardCapped: true };
  }

  const placeholder = [
    {
      role: "assistant",
      content: "[sessions_history omitted: message too large]",
    },
  ];
  return { items: placeholder, bytes: jsonUtf8Bytes(placeholder), hardCapped: true };
}

export function createSessionsHistoryTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  callGateway?: GatewayCaller;
}): AnyAgentTool {
  return {
    label: "Session History",
    name: "sessions_history",
    displaySummary: SESSIONS_HISTORY_TOOL_DISPLAY_SUMMARY,
    description: describeSessionsHistoryTool(),
    parameters: SessionsHistoryToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayCall = opts?.callGateway ?? callGateway;
      const rawSessionKeyParam =
        readStringParam(params, "ref") ??
        readStringParam(params, "transcriptRef") ??
        readStringParam(params, "messageRef") ??
        readStringParam(params, "sessionKey", {
          required: true,
          label: "sessionKey/ref",
        });
      const transcriptRef = parseOpenClawTranscriptRef(rawSessionKeyParam);
      const sessionKeyParam = transcriptRef?.sessionKey ?? rawSessionKeyParam;
      const cfg = opts?.config ?? getRuntimeConfig();
      const { mainKey, alias, effectiveRequesterKey, restrictToSpawned } =
        resolveSandboxedSessionToolContext({
          cfg,
          agentSessionKey: opts?.agentSessionKey,
          sandboxed: opts?.sandboxed,
        });
      const resolvedSession = await resolveSessionReference({
        sessionKey: sessionKeyParam,
        alias,
        mainKey,
        requesterInternalKey: effectiveRequesterKey,
        restrictToSpawned,
      });
      if (!resolvedSession.ok) {
        return jsonResult({ status: resolvedSession.status, error: resolvedSession.error });
      }
      const visibleSession = await resolveVisibleSessionReference({
        resolvedSession,
        requesterSessionKey: effectiveRequesterKey,
        restrictToSpawned,
        visibilitySessionKey: sessionKeyParam,
      });
      if (!visibleSession.ok) {
        return jsonResult({
          status: visibleSession.status,
          error: visibleSession.error,
        });
      }
      // From here on, use the canonical key (sessionId inputs already resolved).
      const resolvedKey = visibleSession.key;
      const displayKey = visibleSession.displayKey;

      if (transcriptRef?.messageId) {
        const refMessage = await readTranscriptRefMessage({
          ref: transcriptRef,
          resolvedSessionKey: resolvedKey,
        });
        if (refMessage.status === "found") {
          const sanitized = sanitizeHistoryMessage(refMessage.message);
          const bytes = jsonUtf8Bytes([sanitized.message]);
          return jsonResult({
            sessionKey: displayKey,
            transcriptRef: transcriptRef.raw,
            messages: [sanitized.message],
            truncated: sanitized.truncated,
            droppedMessages: false,
            contentTruncated: sanitized.truncated,
            contentRedacted: sanitized.redacted,
            bytes,
          });
        }
        return jsonResult({
          sessionKey: displayKey,
          transcriptRef: transcriptRef.raw,
          messages: [],
          truncated: false,
          droppedMessages: false,
          contentTruncated: false,
          contentRedacted: false,
          bytes: jsonUtf8Bytes([]),
          status: "message_not_found",
          error: refMessage.reason,
        });
      }

      const directParentSessionTarget = isDirectParentSessionTarget({
        ref: transcriptRef,
        requesterSessionKey: effectiveRequesterKey,
        resolvedSessionKey: resolvedKey,
      });
      if (!directParentSessionTarget) {
        const a2aPolicy = createAgentToAgentPolicy(cfg);
        const visibility = resolveEffectiveSessionToolsVisibility({
          cfg,
          sandboxed: opts?.sandboxed === true,
        });
        const visibilityGuard = await createSessionVisibilityGuard({
          action: "history",
          requesterSessionKey: effectiveRequesterKey,
          visibility,
          a2aPolicy,
        });
        const access = visibilityGuard.check(resolvedKey);
        if (!access.allowed) {
          return jsonResult({
            status: access.status,
            error: access.error,
          });
        }
      }

      const limit = readPositiveIntegerParam(params, "limit");
      const includeTools = Boolean(params.includeTools);
      const result = await gatewayCall<{ messages: Array<unknown> }>({
        method: "chat.history",
        params: { sessionKey: resolvedKey, limit, maxChars: SESSIONS_HISTORY_TEXT_MAX_CHARS },
      });
      const rawMessages = Array.isArray(result?.messages) ? result.messages : [];
      const selectedMessages = includeTools ? rawMessages : stripToolMessages(rawMessages);
      const sanitizedMessages = selectedMessages.map((message) => sanitizeHistoryMessage(message));
      const contentTruncated = sanitizedMessages.some((entry) => entry.truncated);
      const contentRedacted = sanitizedMessages.some((entry) => entry.redacted);
      const cappedMessages = capArrayByJsonBytes(
        sanitizedMessages.map((entry) => entry.message),
        SESSIONS_HISTORY_MAX_BYTES,
      );
      const droppedMessages = cappedMessages.items.length < selectedMessages.length;
      const hardened = enforceSessionsHistoryHardCap({
        items: cappedMessages.items,
        bytes: cappedMessages.bytes,
        maxBytes: SESSIONS_HISTORY_MAX_BYTES,
      });
      return jsonResult({
        sessionKey: displayKey,
        messages: hardened.items,
        truncated: droppedMessages || contentTruncated || hardened.hardCapped,
        droppedMessages: droppedMessages || hardened.hardCapped,
        contentTruncated,
        contentRedacted,
        bytes: hardened.bytes,
      });
    },
  };
}
