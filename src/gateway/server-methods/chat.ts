import fs from "node:fs";
import path from "node:path";
import { CURRENT_SESSION_VERSION, SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import {
  buildExecutionPlatformFeatureFlagRegistry,
  evaluateExecutionPlatformFlag,
  ModelCloseoutCapsuleReporter,
  parseCloseoutCapsule,
  projectCloseoutCapsuleOpportunitySeedsToWorkQueue,
  runProtocolPreGate,
  WorkflowQueuedRunner,
} from "../../../extensions/execution-platform/runtime-api.js";
import { CodexAppServerJsonExecutor } from "../../../extensions/model-memory/src/mmv2/codex-app-server-json-executor.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveThinkingDefault } from "../../agents/model-selection.js";
import { rewriteTranscriptEntriesInSessionFile } from "../../agents/pi-embedded-runner/transcript-rewrite.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import type { ReplyPayload } from "../../auto-reply/reply-payload.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import { extractCanvasFromText } from "../../chat/canvas-render.js";
import { resolveSessionFilePath } from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { jsonUtf8Bytes } from "../../infra/json-utf8-bytes.js";
import { getAgentScopedMediaLocalRoots } from "../../media/local-roots.js";
import { isAudioFileName } from "../../media/mime.js";
import type { PromptImageOrderEntry } from "../../media/prompt-image-order.js";
import { type SavedMedia, saveMediaBuffer } from "../../media/store.js";
import { createChannelReplyPipeline } from "../../plugin-sdk/channel-reply-pipeline.js";
import { normalizeInputProvenance, type InputProvenance } from "../../sessions/input-provenance.js";
import { resolveSendPolicy } from "../../sessions/send-policy.js";
import { parseAgentSessionKey } from "../../sessions/session-key-utils.js";
import { emitSessionTranscriptUpdate } from "../../sessions/transcript-events.js";
import {
  parseAssistantTextSignature,
  resolveAssistantMessagePhase,
} from "../../shared/chat-message-content.js";
import {
  stripInlineDirectiveTagsForDisplay,
  stripInlineDirectiveTagsFromMessageForDisplay,
} from "../../utils/directive-tags.js";
import {
  INTERNAL_MESSAGE_CHANNEL,
  isGatewayCliClient,
  isWebchatClient,
  normalizeMessageChannel,
} from "../../utils/message-channel.js";
import {
  abortChatRunById,
  type ChatAbortControllerEntry,
  type ChatAbortOps,
  isChatStopCommandText,
  resolveChatRunExpiresAtMs,
} from "../chat-abort.js";
import {
  type ChatImageContent,
  type OffloadedRef,
  parseMessageWithAttachments,
} from "../chat-attachments.js";
import { MediaOffloadError } from "../chat-attachments.js";
import { stripEnvelopeFromMessage, stripEnvelopeFromMessages } from "../chat-sanitize.js";
import { augmentChatHistoryWithCliSessionImports } from "../cli-session-history.js";
import { isSuppressedControlReplyText } from "../control-reply-text.js";
import { runGatewayAgentTeamRuntimeJobOnce } from "../execution-platform-agent-team-runner.js";
import { getExecutionPlatformRuntime } from "../execution-platform-http.js";
import { ADMIN_SCOPE } from "../method-scopes.js";
import {
  GATEWAY_CLIENT_CAPS,
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  hasGatewayClientCap,
} from "../protocol/client-info.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatAbortParams,
  validateChatHistoryParams,
  validateChatInjectParams,
  validateChatSendParams,
} from "../protocol/index.js";
import { CHAT_SEND_SESSION_KEY_MAX_LENGTH } from "../protocol/schema/primitives.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  loadSessionEntry,
  resolveGatewayModelSupportsImages,
  readSessionMessages,
  resolveSessionModelRef,
} from "../session-utils.js";
import { formatForLog } from "../ws-log.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";
import { setGatewayDedupeEntry } from "./agent-wait-dedupe.js";
import { normalizeRpcAttachmentsToChatAttachments } from "./attachment-normalize.js";
import { appendInjectedAssistantMessageToTranscript } from "./chat-transcript-inject.js";
import { buildWebchatAudioContentBlocksFromReplyPayloads } from "./chat-webchat-media.js";
import type {
  GatewayRequestContext,
  GatewayRequestHandlerOptions,
  GatewayRequestHandlers,
} from "./types.js";

type TranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

type AbortOrigin = "rpc" | "stop-command";

type AbortedPartialSnapshot = {
  runId: string;
  sessionId: string;
  text: string;
  abortOrigin: AbortOrigin;
};

type ChatAbortRequester = {
  connId?: string;
  deviceId?: string;
  isAdmin: boolean;
};

/** True when a reply payload carries at least one media reference (mediaUrl or mediaUrls). */
function isMediaBearingPayload(payload: ReplyPayload): boolean {
  if (payload.mediaUrl?.trim()) {
    return true;
  }
  if (payload.mediaUrls?.some((url) => url.trim())) {
    return true;
  }
  return false;
}

async function buildWebchatAudioOnlyAssistantMessage(
  payloads: ReplyPayload[],
  options?: {
    localRoots?: readonly string[];
    onLocalAudioAccessDenied?: (message: string) => void;
  },
): Promise<{ content: Array<Record<string, unknown>>; transcriptText: string } | null> {
  const audioBlocks = await buildWebchatAudioContentBlocksFromReplyPayloads(payloads, {
    localRoots: options?.localRoots,
    onLocalAudioAccessDenied: (err) => {
      options?.onLocalAudioAccessDenied?.(formatForLog(err));
    },
  });
  if (audioBlocks.length === 0) {
    return null;
  }
  return {
    transcriptText: "Audio reply",
    content: [{ type: "text", text: "Audio reply" }, ...audioBlocks],
  };
}

export const DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS = 8_000;
const CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES = 128 * 1024;
const CHAT_HISTORY_OVERSIZED_PLACEHOLDER = "[chat.history omitted: message too large]";
let chatHistoryPlaceholderEmitCount = 0;
const CHANNEL_AGNOSTIC_SESSION_SCOPES = new Set([
  "main",
  "direct",
  "dm",
  "group",
  "channel",
  "cron",
  "run",
  "subagent",
  "acp",
  "thread",
  "topic",
]);
const CHANNEL_SCOPED_SESSION_SHAPES = new Set(["direct", "dm", "group", "channel"]);

export function resolveEffectiveChatHistoryMaxChars(
  cfg: { gateway?: { webchat?: { chatHistoryMaxChars?: number } } },
  maxChars?: number,
): number {
  if (typeof maxChars === "number") {
    return maxChars;
  }
  if (typeof cfg.gateway?.webchat?.chatHistoryMaxChars === "number") {
    return cfg.gateway.webchat.chatHistoryMaxChars;
  }
  return DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS;
}

type ChatSendDeliveryEntry = {
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  origin?: {
    provider?: string;
    accountId?: string;
    threadId?: string | number;
  };
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
};

type ChatSendOriginatingRoute = {
  originatingChannel: string;
  originatingTo?: string;
  accountId?: string;
  messageThreadId?: string | number;
  explicitDeliverRoute: boolean;
};

type ChatSendExplicitOrigin = {
  originatingChannel?: string;
  originatingTo?: string;
  accountId?: string;
  messageThreadId?: string;
};

type SideResultPayload = {
  kind: "btw";
  runId: string;
  sessionKey: string;
  question: string;
  text: string;
  isError?: boolean;
  ts: number;
};

function buildTranscriptReplyText(payloads: ReplyPayload[]): string {
  const chunks = payloads
    .map((payload) => {
      const parts = resolveSendableOutboundReplyParts(payload);
      const lines: string[] = [];
      if (typeof payload.replyToId === "string" && payload.replyToId.trim()) {
        lines.push(`[[reply_to:${payload.replyToId.trim()}]]`);
      } else if (payload.replyToCurrent) {
        lines.push("[[reply_to_current]]");
      }
      const text = payload.text?.trim();
      if (text && !isSuppressedControlReplyText(text)) {
        lines.push(text);
      }
      for (const mediaUrl of parts.mediaUrls) {
        const trimmed = mediaUrl.trim();
        if (trimmed) {
          lines.push(`MEDIA:${trimmed}`);
        }
      }
      if (payload.audioAsVoice && parts.mediaUrls.some((mediaUrl) => isAudioFileName(mediaUrl))) {
        lines.push("[[audio_as_voice]]");
      }
      return lines.join("\n").trim();
    })
    .filter(Boolean);
  return chunks.join("\n\n").trim();
}

function resolveChatSendOriginatingRoute(params: {
  client?: { mode?: string | null; id?: string | null } | null;
  deliver?: boolean;
  entry?: ChatSendDeliveryEntry;
  explicitOrigin?: ChatSendExplicitOrigin;
  hasConnectedClient?: boolean;
  mainKey?: string;
  sessionKey: string;
}): ChatSendOriginatingRoute {
  if (params.explicitOrigin?.originatingChannel && params.explicitOrigin.originatingTo) {
    return {
      originatingChannel: params.explicitOrigin.originatingChannel,
      originatingTo: params.explicitOrigin.originatingTo,
      ...(params.explicitOrigin.accountId ? { accountId: params.explicitOrigin.accountId } : {}),
      ...(params.explicitOrigin.messageThreadId
        ? { messageThreadId: params.explicitOrigin.messageThreadId }
        : {}),
      explicitDeliverRoute: params.deliver === true,
    };
  }
  const shouldDeliverExternally = params.deliver === true;
  if (!shouldDeliverExternally) {
    return {
      originatingChannel: INTERNAL_MESSAGE_CHANNEL,
      explicitDeliverRoute: false,
    };
  }

  const routeChannelCandidate = normalizeMessageChannel(
    params.entry?.deliveryContext?.channel ??
      params.entry?.lastChannel ??
      params.entry?.origin?.provider,
  );
  const routeToCandidate = params.entry?.deliveryContext?.to ?? params.entry?.lastTo;
  const routeAccountIdCandidate =
    params.entry?.deliveryContext?.accountId ??
    params.entry?.lastAccountId ??
    params.entry?.origin?.accountId ??
    undefined;
  const routeThreadIdCandidate =
    params.entry?.deliveryContext?.threadId ??
    params.entry?.lastThreadId ??
    params.entry?.origin?.threadId;
  if (params.sessionKey.length > CHAT_SEND_SESSION_KEY_MAX_LENGTH) {
    return {
      originatingChannel: INTERNAL_MESSAGE_CHANNEL,
      explicitDeliverRoute: false,
    };
  }

  const parsedSessionKey = parseAgentSessionKey(params.sessionKey);
  const sessionScopeParts = (parsedSessionKey?.rest ?? params.sessionKey)
    .split(":", 3)
    .filter(Boolean);
  const sessionScopeHead = sessionScopeParts[0];
  const sessionChannelHint = normalizeMessageChannel(sessionScopeHead);
  const normalizedSessionScopeHead = (sessionScopeHead ?? "").trim().toLowerCase();
  const sessionPeerShapeCandidates = [sessionScopeParts[1], sessionScopeParts[2]]
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter(Boolean);
  const isChannelAgnosticSessionScope = CHANNEL_AGNOSTIC_SESSION_SCOPES.has(
    normalizedSessionScopeHead,
  );
  const isChannelScopedSession = sessionPeerShapeCandidates.some((part) =>
    CHANNEL_SCOPED_SESSION_SHAPES.has(part),
  );
  const hasLegacyChannelPeerShape =
    !isChannelScopedSession &&
    typeof sessionScopeParts[1] === "string" &&
    sessionChannelHint === routeChannelCandidate;
  const isFromWebchatClient = isWebchatClient(params.client);
  const isFromGatewayCliClient = isGatewayCliClient(params.client);
  const hasClientMetadata =
    (typeof params.client?.mode === "string" && params.client.mode.trim().length > 0) ||
    (typeof params.client?.id === "string" && params.client.id.trim().length > 0);
  const configuredMainKey = (params.mainKey ?? "main").trim().toLowerCase();
  const isConfiguredMainSessionScope =
    normalizedSessionScopeHead.length > 0 && normalizedSessionScopeHead === configuredMainKey;
  const canInheritConfiguredMainRoute =
    isConfiguredMainSessionScope &&
    params.hasConnectedClient &&
    (isFromGatewayCliClient || !hasClientMetadata);

  // Webchat clients never inherit external delivery routes. Configured-main
  // sessions are stricter than channel-scoped sessions: only CLI callers, or
  // legacy callers with no client metadata, may inherit the last external route.
  const canInheritDeliverableRoute = Boolean(
    !isFromWebchatClient &&
    sessionChannelHint &&
    sessionChannelHint !== INTERNAL_MESSAGE_CHANNEL &&
    ((!isChannelAgnosticSessionScope && (isChannelScopedSession || hasLegacyChannelPeerShape)) ||
      canInheritConfiguredMainRoute),
  );
  const hasDeliverableRoute =
    canInheritDeliverableRoute &&
    routeChannelCandidate &&
    routeChannelCandidate !== INTERNAL_MESSAGE_CHANNEL &&
    typeof routeToCandidate === "string" &&
    routeToCandidate.trim().length > 0;

  if (!hasDeliverableRoute) {
    return {
      originatingChannel: INTERNAL_MESSAGE_CHANNEL,
      explicitDeliverRoute: false,
    };
  }

  return {
    originatingChannel: routeChannelCandidate,
    originatingTo: routeToCandidate,
    accountId: routeAccountIdCandidate,
    messageThreadId: routeThreadIdCandidate,
    explicitDeliverRoute: true,
  };
}

function stripDisallowedChatControlChars(message: string): string {
  let output = "";
  for (const char of message) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      output += char;
    }
  }
  return output;
}

export function sanitizeChatSendMessageInput(
  message: string,
): { ok: true; message: string } | { ok: false; error: string } {
  const normalized = message.normalize("NFC");
  if (normalized.includes("\u0000")) {
    return { ok: false, error: "message must not contain null bytes" };
  }
  return { ok: true, message: stripDisallowedChatControlChars(normalized) };
}

function normalizeOptionalChatSystemReceipt(
  value: unknown,
): { ok: true; receipt?: string } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "systemProvenanceReceipt must be a string" };
  }
  const sanitized = sanitizeChatSendMessageInput(value);
  if (!sanitized.ok) {
    return sanitized;
  }
  const receipt = sanitized.message.trim();
  return { ok: true, receipt: receipt || undefined };
}

function isAcpBridgeClient(client: GatewayRequestHandlerOptions["client"]): boolean {
  const info = client?.connect?.client;
  return (
    info?.id === GATEWAY_CLIENT_NAMES.CLI &&
    info?.mode === GATEWAY_CLIENT_MODES.CLI &&
    info?.displayName === "ACP" &&
    info?.version === "acp"
  );
}

function canInjectSystemProvenance(client: GatewayRequestHandlerOptions["client"]): boolean {
  const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  return scopes.includes(ADMIN_SCOPE);
}

async function persistChatSendImages(params: {
  images: ChatImageContent[];
  imageOrder: PromptImageOrderEntry[];
  offloadedRefs: OffloadedRef[];
  client: GatewayRequestHandlerOptions["client"];
  logGateway: GatewayRequestContext["logGateway"];
}): Promise<SavedMedia[]> {
  if (
    (params.images.length === 0 && params.offloadedRefs.length === 0) ||
    isAcpBridgeClient(params.client)
  ) {
    return [];
  }
  const inlineSaved: SavedMedia[] = [];
  for (const img of params.images) {
    try {
      inlineSaved.push(
        await saveMediaBuffer(Buffer.from(img.data, "base64"), img.mimeType, "inbound"),
      );
    } catch (err) {
      params.logGateway.warn(
        `chat.send: failed to persist inbound image (${img.mimeType}): ${formatForLog(err)}`,
      );
    }
  }
  const offloadedSaved = params.offloadedRefs.map((ref) => ({
    id: ref.id,
    path: ref.path,
    size: 0,
    contentType: ref.mimeType,
  }));
  if (params.imageOrder.length === 0) {
    return [...inlineSaved, ...offloadedSaved];
  }
  const saved: SavedMedia[] = [];
  let inlineIndex = 0;
  let offloadedIndex = 0;
  for (const entry of params.imageOrder) {
    if (entry === "inline") {
      const inline = inlineSaved[inlineIndex++];
      if (inline) {
        saved.push(inline);
      }
      continue;
    }
    const offloaded = offloadedSaved[offloadedIndex++];
    if (offloaded) {
      saved.push(offloaded);
    }
  }
  for (; inlineIndex < inlineSaved.length; inlineIndex++) {
    const inline = inlineSaved[inlineIndex];
    if (inline) {
      saved.push(inline);
    }
  }
  for (; offloadedIndex < offloadedSaved.length; offloadedIndex++) {
    const offloaded = offloadedSaved[offloadedIndex];
    if (offloaded) {
      saved.push(offloaded);
    }
  }
  return saved;
}

function buildChatSendTranscriptMessage(params: {
  message: string;
  savedImages: SavedMedia[];
  timestamp: number;
}) {
  const mediaFields = resolveChatSendTranscriptMediaFields(params.savedImages);
  return {
    role: "user" as const,
    content: params.message,
    timestamp: params.timestamp,
    ...mediaFields,
  };
}

function resolveChatSendTranscriptMediaFields(savedImages: SavedMedia[]) {
  const mediaPaths = savedImages.map((entry) => entry.path);
  if (mediaPaths.length === 0) {
    return {};
  }
  const mediaTypes = savedImages.map((entry) => entry.contentType ?? "application/octet-stream");
  return {
    MediaPath: mediaPaths[0],
    MediaPaths: mediaPaths,
    MediaType: mediaTypes[0],
    MediaTypes: mediaTypes,
  };
}

function extractTranscriptUserText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const textBlocks = content
    .map((block) =>
      block && typeof block === "object" && "text" in block ? block.text : undefined,
    )
    .filter((text): text is string => typeof text === "string");
  return textBlocks.length > 0 ? textBlocks.join("") : undefined;
}

async function rewriteChatSendUserTurnMediaPaths(params: {
  transcriptPath: string;
  sessionKey: string;
  message: string;
  savedImages: SavedMedia[];
}) {
  const mediaFields = resolveChatSendTranscriptMediaFields(params.savedImages);
  if (!("MediaPath" in mediaFields)) {
    return;
  }
  const sessionManager = SessionManager.open(params.transcriptPath);
  const branch = sessionManager.getBranch();
  const target = [...branch].toReversed().find((entry) => {
    if (entry.type !== "message" || entry.message.role !== "user") {
      return false;
    }
    const existingPaths = Array.isArray((entry.message as { MediaPaths?: unknown }).MediaPaths)
      ? (entry.message as { MediaPaths?: unknown[] }).MediaPaths
      : undefined;
    if (
      (typeof (entry.message as { MediaPath?: unknown }).MediaPath === "string" &&
        (entry.message as { MediaPath?: string }).MediaPath) ||
      (existingPaths && existingPaths.length > 0)
    ) {
      return false;
    }
    return (
      extractTranscriptUserText((entry.message as { content?: unknown }).content) === params.message
    );
  });
  if (!target || target.type !== "message") {
    return;
  }
  const rewrittenMessage = {
    ...target.message,
    ...mediaFields,
  };
  await rewriteTranscriptEntriesInSessionFile({
    sessionFile: params.transcriptPath,
    sessionKey: params.sessionKey,
    request: {
      replacements: [
        {
          entryId: target.id,
          message: rewrittenMessage,
        },
      ],
    },
  });
}

function truncateChatHistoryText(
  text: string,
  maxChars: number = DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, maxChars)}\n...(truncated)...`,
    truncated: true,
  };
}

function isToolHistoryBlockType(type: unknown): boolean {
  if (typeof type !== "string") {
    return false;
  }
  const normalized = type.trim().toLowerCase();
  return (
    normalized === "toolcall" ||
    normalized === "tool_call" ||
    normalized === "tooluse" ||
    normalized === "tool_use" ||
    normalized === "toolresult" ||
    normalized === "tool_result"
  );
}

function extractChatHistoryBlockText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const entry = message as Record<string, unknown>;
  if (typeof entry.content === "string") {
    return entry.content;
  }
  if (typeof entry.text === "string") {
    return entry.text;
  }
  if (!Array.isArray(entry.content)) {
    return undefined;
  }
  const textParts = entry.content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return undefined;
      }
      const typed = block as { text?: unknown; type?: unknown };
      return typeof typed.text === "string" ? typed.text : undefined;
    })
    .filter((value): value is string => typeof value === "string");
  return textParts.length > 0 ? textParts.join("\n") : undefined;
}

function sanitizeChatHistoryContentBlock(
  block: unknown,
  opts?: { preserveExactToolPayload?: boolean; maxChars?: number },
): { block: unknown; changed: boolean } {
  if (!block || typeof block !== "object") {
    return { block, changed: false };
  }
  const entry = { ...(block as Record<string, unknown>) };
  let changed = false;
  const preserveExactToolPayload =
    opts?.preserveExactToolPayload === true || isToolHistoryBlockType(entry.type);
  const maxChars = opts?.maxChars ?? DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS;
  if (typeof entry.text === "string") {
    const stripped = stripInlineDirectiveTagsForDisplay(entry.text);
    if (preserveExactToolPayload) {
      entry.text = stripped.text;
      changed ||= stripped.changed;
    } else {
      const res = truncateChatHistoryText(stripped.text, maxChars);
      entry.text = res.text;
      changed ||= stripped.changed || res.truncated;
    }
  }
  if (typeof entry.content === "string") {
    const stripped = stripInlineDirectiveTagsForDisplay(entry.content);
    if (preserveExactToolPayload) {
      entry.content = stripped.text;
      changed ||= stripped.changed;
    } else {
      const res = truncateChatHistoryText(stripped.text, maxChars);
      entry.content = res.text;
      changed ||= stripped.changed || res.truncated;
    }
  }
  if (typeof entry.partialJson === "string") {
    if (!preserveExactToolPayload) {
      const res = truncateChatHistoryText(entry.partialJson, maxChars);
      entry.partialJson = res.text;
      changed ||= res.truncated;
    }
  }
  if (typeof entry.arguments === "string") {
    if (!preserveExactToolPayload) {
      const res = truncateChatHistoryText(entry.arguments, maxChars);
      entry.arguments = res.text;
      changed ||= res.truncated;
    }
  }
  if (typeof entry.thinking === "string") {
    const res = truncateChatHistoryText(entry.thinking, maxChars);
    entry.thinking = res.text;
    changed ||= res.truncated;
  }
  if ("thinkingSignature" in entry) {
    delete entry.thinkingSignature;
    changed = true;
  }
  const type = typeof entry.type === "string" ? entry.type : "";
  if (type === "image" && typeof entry.data === "string") {
    const bytes = Buffer.byteLength(entry.data, "utf8");
    delete entry.data;
    entry.omitted = true;
    entry.bytes = bytes;
    changed = true;
  }
  return { block: changed ? entry : block, changed };
}

function sanitizeAssistantPhasedContentBlocks(content: unknown[]): {
  content: unknown[];
  changed: boolean;
} {
  const hasExplicitPhasedText = content.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const entry = block as { type?: unknown; textSignature?: unknown };
    return (
      entry.type === "text" && Boolean(parseAssistantTextSignature(entry.textSignature)?.phase)
    );
  });
  if (!hasExplicitPhasedText) {
    return { content, changed: false };
  }
  const filtered = content.filter((block) => {
    if (!block || typeof block !== "object") {
      return true;
    }
    const entry = block as { type?: unknown; textSignature?: unknown };
    if (entry.type !== "text") {
      return true;
    }
    return parseAssistantTextSignature(entry.textSignature)?.phase === "final_answer";
  });
  return {
    content: filtered,
    changed: filtered.length !== content.length,
  };
}

/**
 * Validate that a value is a finite number, returning undefined otherwise.
 */
function toFiniteNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

/**
 * Sanitize usage metadata to ensure only finite numeric fields are included.
 * Prevents UI crashes from malformed transcript JSON.
 */
function sanitizeUsage(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const u = raw as Record<string, unknown>;
  const out: Record<string, number> = {};

  // Whitelist known usage fields and validate they're finite numbers
  const knownFields = [
    "input",
    "output",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cacheRead",
    "cacheWrite",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
  ];

  for (const k of knownFields) {
    const n = toFiniteNumber(u[k]);
    if (n !== undefined) {
      out[k] = n;
    }
  }

  // Preserve nested usage.cost when present
  if ("cost" in u && u.cost != null && typeof u.cost === "object") {
    const sanitizedCost = sanitizeCost(u.cost);
    if (sanitizedCost) {
      (out as Record<string, unknown>).cost = sanitizedCost;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Sanitize cost metadata to ensure only finite numeric fields are included.
 * Prevents UI crashes from calling .toFixed() on non-numbers.
 */
function sanitizeCost(raw: unknown): { total?: number } | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const c = raw as Record<string, unknown>;
  const total = toFiniteNumber(c.total);
  return total !== undefined ? { total } : undefined;
}

function summarizeToolHistoryDetails(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const details = raw as Record<string, unknown>;
  const summarized: Record<string, unknown> = {};

  if (typeof details.status === "string" && details.status.trim()) {
    summarized.status = details.status;
  }
  if (typeof details.error === "string" && details.error.trim()) {
    summarized.error = details.error;
  }
  if (
    details.delivery &&
    typeof details.delivery === "object" &&
    details.delivery !== null &&
    typeof (details.delivery as { status?: unknown }).status === "string"
  ) {
    const delivery = details.delivery as { status?: string; mode?: string };
    summarized.delivery = {
      status: delivery.status,
      ...(typeof delivery.mode === "string" ? { mode: delivery.mode } : {}),
    };
  }

  for (const key of [
    "truncated",
    "droppedMessages",
    "contentTruncated",
    "contentRedacted",
  ] as const) {
    if (typeof details[key] === "boolean") {
      summarized[key] = details[key];
    }
  }
  if (typeof details.bytes === "number" && Number.isFinite(details.bytes)) {
    summarized.bytes = details.bytes;
  }
  if (
    summarized.contentTruncated === true ||
    summarized.truncated === true ||
    summarized.droppedMessages === true
  ) {
    summarized.fullContentAvailable = false;
  }

  return Object.keys(summarized).length > 0 ? summarized : undefined;
}

function sanitizeChatHistoryMessage(
  message: unknown,
  maxChars: number = DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS,
): { message: unknown; changed: boolean } {
  if (!message || typeof message !== "object") {
    return { message, changed: false };
  }
  const entry = { ...(message as Record<string, unknown>) };
  let changed = false;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  const preserveExactToolPayload =
    role === "toolresult" ||
    role === "tool_result" ||
    role === "tool" ||
    role === "function" ||
    typeof entry.toolName === "string" ||
    typeof entry.tool_name === "string" ||
    typeof entry.toolCallId === "string" ||
    typeof entry.tool_call_id === "string";

  if ("details" in entry) {
    const toolMeta = preserveExactToolPayload
      ? summarizeToolHistoryDetails(entry.details)
      : undefined;
    if (toolMeta) {
      entry.__openclawToolMeta = toolMeta;
    }
    delete entry.details;
    changed = true;
  }

  // Keep usage/cost so the chat UI can render per-message token and cost badges.
  // Only retain usage/cost on assistant messages and validate numeric fields to prevent UI crashes.
  if (entry.role !== "assistant") {
    if ("usage" in entry) {
      delete entry.usage;
      changed = true;
    }
    if ("cost" in entry) {
      delete entry.cost;
      changed = true;
    }
  } else {
    // Validate and sanitize usage/cost for assistant messages
    if ("usage" in entry) {
      const sanitized = sanitizeUsage(entry.usage);
      if (sanitized) {
        entry.usage = sanitized;
      } else {
        delete entry.usage;
      }
      changed = true;
    }
    if ("cost" in entry) {
      const sanitized = sanitizeCost(entry.cost);
      if (sanitized) {
        entry.cost = sanitized;
      } else {
        delete entry.cost;
      }
      changed = true;
    }
  }

  if (typeof entry.content === "string") {
    const stripped = stripInlineDirectiveTagsForDisplay(entry.content);
    if (preserveExactToolPayload) {
      entry.content = stripped.text;
      changed ||= stripped.changed;
    } else {
      const res = truncateChatHistoryText(stripped.text, maxChars);
      entry.content = res.text;
      changed ||= stripped.changed || res.truncated;
    }
  } else if (Array.isArray(entry.content)) {
    const updated = entry.content.map((block) =>
      sanitizeChatHistoryContentBlock(block, { preserveExactToolPayload, maxChars }),
    );
    if (updated.some((item) => item.changed)) {
      entry.content = updated.map((item) => item.block);
      changed = true;
    }
    if (entry.role === "assistant" && Array.isArray(entry.content)) {
      const sanitizedPhases = sanitizeAssistantPhasedContentBlocks(entry.content);
      if (sanitizedPhases.changed) {
        entry.content = sanitizedPhases.content;
        changed = true;
      }
    }
  }

  if (typeof entry.text === "string") {
    const stripped = stripInlineDirectiveTagsForDisplay(entry.text);
    if (preserveExactToolPayload) {
      entry.text = stripped.text;
      changed ||= stripped.changed;
    } else {
      const res = truncateChatHistoryText(stripped.text, maxChars);
      entry.text = res.text;
      changed ||= stripped.changed || res.truncated;
    }
  }

  return { message: changed ? entry : message, changed };
}

/**
 * Extract the visible text from an assistant history message for silent-token checks.
 * Returns `undefined` for non-assistant messages or messages with no extractable text.
 * When `entry.text` is present it takes precedence over `entry.content` to avoid
 * dropping messages that carry real text alongside a stale `content: "NO_REPLY"`.
 */
function extractAssistantTextForSilentCheck(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const entry = message as Record<string, unknown>;
  if (entry.role !== "assistant") {
    return undefined;
  }
  if (typeof entry.text === "string") {
    return entry.text;
  }
  if (typeof entry.content === "string") {
    return entry.content;
  }
  if (!Array.isArray(entry.content) || entry.content.length === 0) {
    return undefined;
  }

  const texts: string[] = [];
  for (const block of entry.content) {
    if (!block || typeof block !== "object") {
      return undefined;
    }
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type !== "text" || typeof typed.text !== "string") {
      return undefined;
    }
    texts.push(typed.text);
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function hasAssistantNonTextContent(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (block) => block && typeof block === "object" && (block as { type?: unknown }).type !== "text",
  );
}

function shouldDropAssistantHistoryMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const entry = message as { role?: unknown };
  if (entry.role !== "assistant") {
    return false;
  }
  if (resolveAssistantMessagePhase(message) === "commentary") {
    return true;
  }
  const text = extractAssistantTextForSilentCheck(message);
  if (text === undefined || !isSuppressedControlReplyText(text)) {
    return false;
  }
  return !hasAssistantNonTextContent(message);
}

export function sanitizeChatHistoryMessages(
  messages: unknown[],
  maxChars: number = DEFAULT_CHAT_HISTORY_TEXT_MAX_CHARS,
): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  let changed = false;
  const next: unknown[] = [];
  for (const message of messages) {
    if (shouldDropAssistantHistoryMessage(message)) {
      changed = true;
      continue;
    }
    const res = sanitizeChatHistoryMessage(message, maxChars);
    changed ||= res.changed;
    if (shouldDropAssistantHistoryMessage(res.message)) {
      changed = true;
      continue;
    }
    next.push(res.message);
  }
  return changed ? next : messages;
}

function appendCanvasBlockToAssistantHistoryMessage(params: {
  message: unknown;
  preview: ReturnType<typeof extractCanvasFromText>;
  rawText: string | null;
}): unknown {
  const preview = params.preview;
  if (!preview || !params.message || typeof params.message !== "object") {
    return params.message;
  }
  const entry = params.message as Record<string, unknown>;
  const baseContent = Array.isArray(entry.content)
    ? [...entry.content]
    : typeof entry.content === "string"
      ? [{ type: "text", text: entry.content }]
      : typeof entry.text === "string"
        ? [{ type: "text", text: entry.text }]
        : [];
  const alreadyPresent = baseContent.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const typed = block as { type?: unknown; preview?: unknown };
    return (
      typed.type === "canvas" &&
      typed.preview &&
      typeof typed.preview === "object" &&
      (((typed.preview as { viewId?: unknown }).viewId &&
        (typed.preview as { viewId?: unknown }).viewId === preview.viewId) ||
        ((typed.preview as { url?: unknown }).url &&
          (typed.preview as { url?: unknown }).url === preview.url))
    );
  });
  if (!alreadyPresent) {
    baseContent.push({
      type: "canvas",
      preview,
      rawText: params.rawText,
    });
  }
  return {
    ...entry,
    content: baseContent,
  };
}

function messageContainsToolHistoryContent(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const entry = message as Record<string, unknown>;
  if (
    typeof entry.toolCallId === "string" ||
    typeof entry.tool_call_id === "string" ||
    typeof entry.toolName === "string" ||
    typeof entry.tool_name === "string"
  ) {
    return true;
  }
  if (!Array.isArray(entry.content)) {
    return false;
  }
  return entry.content.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    return isToolHistoryBlockType((block as { type?: unknown }).type);
  });
}

export function augmentChatHistoryWithCanvasBlocks(messages: unknown[]): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  const next = [...messages];
  let changed = false;
  let lastAssistantIndex = -1;
  let lastRenderableAssistantIndex = -1;
  const pending: Array<{
    preview: NonNullable<ReturnType<typeof extractCanvasFromText>>;
    rawText: string | null;
  }> = [];
  for (let index = 0; index < next.length; index++) {
    const message = next[index];
    if (!message || typeof message !== "object") {
      continue;
    }
    const entry = message as Record<string, unknown>;
    const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
    if (role === "assistant") {
      lastAssistantIndex = index;
      if (!messageContainsToolHistoryContent(entry)) {
        lastRenderableAssistantIndex = index;
        if (pending.length > 0) {
          let target = next[index];
          for (const item of pending) {
            target = appendCanvasBlockToAssistantHistoryMessage({
              message: target,
              preview: item.preview,
              rawText: item.rawText,
            });
          }
          next[index] = target;
          pending.length = 0;
          changed = true;
        }
      }
      continue;
    }
    if (!messageContainsToolHistoryContent(entry)) {
      continue;
    }
    const toolName =
      typeof entry.toolName === "string"
        ? entry.toolName
        : typeof entry.tool_name === "string"
          ? entry.tool_name
          : undefined;
    const text = extractChatHistoryBlockText(entry);
    const preview = extractCanvasFromText(text, toolName);
    if (!preview) {
      continue;
    }
    pending.push({
      preview,
      rawText: text ?? null,
    });
  }
  if (pending.length > 0) {
    const targetIndex =
      lastRenderableAssistantIndex >= 0 ? lastRenderableAssistantIndex : lastAssistantIndex;
    if (targetIndex >= 0) {
      let target = next[targetIndex];
      for (const item of pending) {
        target = appendCanvasBlockToAssistantHistoryMessage({
          message: target,
          preview: item.preview,
          rawText: item.rawText,
        });
      }
      next[targetIndex] = target;
      changed = true;
    }
  }
  return changed ? next : messages;
}

function buildOversizedHistoryPlaceholder(message?: unknown): Record<string, unknown> {
  const role =
    message &&
    typeof message === "object" &&
    typeof (message as { role?: unknown }).role === "string"
      ? (message as { role: string }).role
      : "assistant";
  const timestamp =
    message &&
    typeof message === "object" &&
    typeof (message as { timestamp?: unknown }).timestamp === "number"
      ? (message as { timestamp: number }).timestamp
      : Date.now();
  return {
    role,
    timestamp,
    content: [{ type: "text", text: CHAT_HISTORY_OVERSIZED_PLACEHOLDER }],
    __openclaw: { truncated: true, reason: "oversized" },
  };
}

function replaceOversizedChatHistoryMessages(params: {
  messages: unknown[];
  maxSingleMessageBytes: number;
}): { messages: unknown[]; replacedCount: number } {
  const { messages, maxSingleMessageBytes } = params;
  if (messages.length === 0) {
    return { messages, replacedCount: 0 };
  }
  let replacedCount = 0;
  const next = messages.map((message) => {
    if (jsonUtf8Bytes(message) <= maxSingleMessageBytes) {
      return message;
    }
    replacedCount += 1;
    return buildOversizedHistoryPlaceholder(message);
  });
  return { messages: replacedCount > 0 ? next : messages, replacedCount };
}

function enforceChatHistoryFinalBudget(params: { messages: unknown[]; maxBytes: number }): {
  messages: unknown[];
  placeholderCount: number;
} {
  const { messages, maxBytes } = params;
  if (messages.length === 0) {
    return { messages, placeholderCount: 0 };
  }
  if (jsonUtf8Bytes(messages) <= maxBytes) {
    return { messages, placeholderCount: 0 };
  }
  const last = messages.at(-1);
  if (last && jsonUtf8Bytes([last]) <= maxBytes) {
    return { messages: [last], placeholderCount: 0 };
  }
  const placeholder = buildOversizedHistoryPlaceholder(last);
  if (jsonUtf8Bytes([placeholder]) <= maxBytes) {
    return { messages: [placeholder], placeholderCount: 1 };
  }
  return { messages: [], placeholderCount: 0 };
}

function resolveTranscriptPath(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
}): string | null {
  const { sessionId, storePath, sessionFile, agentId } = params;
  if (!storePath && !sessionFile) {
    return null;
  }
  try {
    const sessionsDir = storePath ? path.dirname(storePath) : undefined;
    return resolveSessionFilePath(
      sessionId,
      sessionFile ? { sessionFile } : undefined,
      sessionsDir || agentId ? { sessionsDir, agentId } : undefined,
    );
  } catch {
    return null;
  }
}

function ensureTranscriptFile(params: { transcriptPath: string; sessionId: string }): {
  ok: boolean;
  error?: string;
} {
  if (fs.existsSync(params.transcriptPath)) {
    return { ok: true };
  }
  try {
    fs.mkdirSync(path.dirname(params.transcriptPath), { recursive: true });
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: params.sessionId,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
    };
    fs.writeFileSync(params.transcriptPath, `${JSON.stringify(header)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function transcriptHasIdempotencyKey(transcriptPath: string, idempotencyKey: string): boolean {
  try {
    const lines = fs.readFileSync(transcriptPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as { message?: { idempotencyKey?: unknown } };
      if (parsed?.message?.idempotencyKey === idempotencyKey) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function appendAssistantTranscriptMessage(params: {
  message: string;
  label?: string;
  content?: Array<Record<string, unknown>>;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  createIfMissing?: boolean;
  idempotencyKey?: string;
  abortMeta?: {
    aborted: true;
    origin: AbortOrigin;
    runId: string;
  };
}): TranscriptAppendResult {
  const transcriptPath = resolveTranscriptPath({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
  });
  if (!transcriptPath) {
    return { ok: false, error: "transcript path not resolved" };
  }

  if (!fs.existsSync(transcriptPath)) {
    if (!params.createIfMissing) {
      return { ok: false, error: "transcript file not found" };
    }
    const ensured = ensureTranscriptFile({
      transcriptPath,
      sessionId: params.sessionId,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error ?? "failed to create transcript file" };
    }
  }

  if (params.idempotencyKey && transcriptHasIdempotencyKey(transcriptPath, params.idempotencyKey)) {
    return { ok: true };
  }

  return appendInjectedAssistantMessageToTranscript({
    transcriptPath,
    message: params.message,
    label: params.label,
    content: params.content,
    idempotencyKey: params.idempotencyKey,
    abortMeta: params.abortMeta,
  });
}

function appendUserTranscriptMessage(params: {
  message: string;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  idempotencyKey: string;
  timestamp: number;
}): TranscriptAppendResult {
  const transcriptPath = resolveTranscriptPath({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
  });
  if (!transcriptPath) {
    return { ok: false, error: "transcript path not resolved" };
  }
  if (!fs.existsSync(transcriptPath)) {
    const ensured = ensureTranscriptFile({
      transcriptPath,
      sessionId: params.sessionId,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error ?? "failed to create transcript file" };
    }
  }
  if (transcriptHasIdempotencyKey(transcriptPath, params.idempotencyKey)) {
    return { ok: true };
  }

  const messageBody = {
    ...buildChatSendTranscriptMessage({
      message: params.message,
      savedImages: [],
      timestamp: params.timestamp,
    }),
    idempotencyKey: params.idempotencyKey,
  };
  try {
    const sessionManager = SessionManager.open(transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    emitSessionTranscriptUpdate({
      sessionFile: transcriptPath,
      message: messageBody,
      messageId,
    });
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function collectSessionAbortPartials(params: {
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  chatRunBuffers: Map<string, string>;
  runIds: ReadonlySet<string>;
  abortOrigin: AbortOrigin;
}): AbortedPartialSnapshot[] {
  const out: AbortedPartialSnapshot[] = [];
  for (const [runId, active] of params.chatAbortControllers) {
    if (!params.runIds.has(runId)) {
      continue;
    }
    const text = params.chatRunBuffers.get(runId);
    if (!text || !text.trim()) {
      continue;
    }
    out.push({
      runId,
      sessionId: active.sessionId,
      text,
      abortOrigin: params.abortOrigin,
    });
  }
  return out;
}

function persistAbortedPartials(params: {
  context: Pick<GatewayRequestContext, "logGateway">;
  sessionKey: string;
  snapshots: AbortedPartialSnapshot[];
}) {
  if (params.snapshots.length === 0) {
    return;
  }
  const { storePath, entry } = loadSessionEntry(params.sessionKey);
  for (const snapshot of params.snapshots) {
    const sessionId = entry?.sessionId ?? snapshot.sessionId ?? snapshot.runId;
    const appended = appendAssistantTranscriptMessage({
      message: snapshot.text,
      sessionId,
      storePath,
      sessionFile: entry?.sessionFile,
      createIfMissing: true,
      idempotencyKey: `${snapshot.runId}:assistant`,
      abortMeta: {
        aborted: true,
        origin: snapshot.abortOrigin,
        runId: snapshot.runId,
      },
    });
    if (!appended.ok) {
      params.context.logGateway.warn(
        `chat.abort transcript append failed: ${appended.error ?? "unknown error"}`,
      );
    }
  }
}

function createChatAbortOps(context: GatewayRequestContext): ChatAbortOps {
  return {
    chatAbortControllers: context.chatAbortControllers,
    chatRunBuffers: context.chatRunBuffers,
    chatDeltaSentAt: context.chatDeltaSentAt,
    chatDeltaLastBroadcastLen: context.chatDeltaLastBroadcastLen,
    chatAbortedRuns: context.chatAbortedRuns,
    removeChatRun: context.removeChatRun,
    agentRunSeq: context.agentRunSeq,
    broadcast: context.broadcast,
    nodeSendToSession: context.nodeSendToSession,
  };
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeExplicitChatSendOrigin(
  params: ChatSendExplicitOrigin,
): { ok: true; value?: ChatSendExplicitOrigin } | { ok: false; error: string } {
  const originatingChannel = normalizeOptionalText(params.originatingChannel);
  const originatingTo = normalizeOptionalText(params.originatingTo);
  const accountId = normalizeOptionalText(params.accountId);
  const messageThreadId = normalizeOptionalText(params.messageThreadId);
  const hasAnyExplicitOriginField = Boolean(
    originatingChannel || originatingTo || accountId || messageThreadId,
  );
  if (!hasAnyExplicitOriginField) {
    return { ok: true };
  }
  const normalizedChannel = normalizeMessageChannel(originatingChannel);
  if (!normalizedChannel) {
    return {
      ok: false,
      error: "originatingChannel is required when using originating route fields",
    };
  }
  if (!originatingTo) {
    return {
      ok: false,
      error: "originatingTo is required when using originating route fields",
    };
  }
  return {
    ok: true,
    value: {
      originatingChannel: normalizedChannel,
      originatingTo,
      ...(accountId ? { accountId } : {}),
      ...(messageThreadId ? { messageThreadId } : {}),
    },
  };
}

function resolveChatAbortRequester(
  client: GatewayRequestHandlerOptions["client"],
): ChatAbortRequester {
  const scopes = Array.isArray(client?.connect?.scopes) ? client.connect.scopes : [];
  return {
    connId: normalizeOptionalText(client?.connId),
    deviceId: normalizeOptionalText(client?.connect?.device?.id),
    isAdmin: scopes.includes(ADMIN_SCOPE),
  };
}

function canRequesterAbortChatRun(
  entry: ChatAbortControllerEntry,
  requester: ChatAbortRequester,
): boolean {
  if (requester.isAdmin) {
    return true;
  }
  const ownerDeviceId = normalizeOptionalText(entry.ownerDeviceId);
  const ownerConnId = normalizeOptionalText(entry.ownerConnId);
  if (!ownerDeviceId && !ownerConnId) {
    return true;
  }
  if (ownerDeviceId && requester.deviceId && ownerDeviceId === requester.deviceId) {
    return true;
  }
  if (ownerConnId && requester.connId && ownerConnId === requester.connId) {
    return true;
  }
  return false;
}

function resolveAuthorizedRunIdsForSession(params: {
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  sessionKey: string;
  requester: ChatAbortRequester;
}) {
  const authorizedRunIds: string[] = [];
  let matchedSessionRuns = 0;
  for (const [runId, active] of params.chatAbortControllers) {
    if (active.sessionKey !== params.sessionKey) {
      continue;
    }
    matchedSessionRuns += 1;
    if (canRequesterAbortChatRun(active, params.requester)) {
      authorizedRunIds.push(runId);
    }
  }
  return {
    matchedSessionRuns,
    authorizedRunIds,
  };
}

function abortChatRunsForSessionKeyWithPartials(params: {
  context: GatewayRequestContext;
  ops: ChatAbortOps;
  sessionKey: string;
  abortOrigin: AbortOrigin;
  stopReason?: string;
  requester: ChatAbortRequester;
}) {
  const { matchedSessionRuns, authorizedRunIds } = resolveAuthorizedRunIdsForSession({
    chatAbortControllers: params.context.chatAbortControllers,
    sessionKey: params.sessionKey,
    requester: params.requester,
  });
  if (authorizedRunIds.length === 0) {
    return {
      aborted: false,
      runIds: [],
      unauthorized: matchedSessionRuns > 0,
    };
  }
  const authorizedRunIdSet = new Set(authorizedRunIds);
  const snapshots = collectSessionAbortPartials({
    chatAbortControllers: params.context.chatAbortControllers,
    chatRunBuffers: params.context.chatRunBuffers,
    runIds: authorizedRunIdSet,
    abortOrigin: params.abortOrigin,
  });
  const runIds: string[] = [];
  for (const runId of authorizedRunIds) {
    const res = abortChatRunById(params.ops, {
      runId,
      sessionKey: params.sessionKey,
      stopReason: params.stopReason,
    });
    if (res.aborted) {
      runIds.push(runId);
    }
  }
  const res = { aborted: runIds.length > 0, runIds, unauthorized: false };
  if (res.aborted) {
    persistAbortedPartials({
      context: params.context,
      sessionKey: params.sessionKey,
      snapshots,
    });
  }
  return res;
}

function nextChatSeq(context: { agentRunSeq: Map<string, number> }, runId: string) {
  const next = (context.agentRunSeq.get(runId) ?? 0) + 1;
  context.agentRunSeq.set(runId, next);
  return next;
}

function broadcastChatFinal(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  message?: Record<string, unknown>;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const strippedEnvelopeMessage = stripEnvelopeFromMessage(params.message) as
    | Record<string, unknown>
    | undefined;
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "final" as const,
    message: stripInlineDirectiveTagsFromMessageForDisplay(strippedEnvelopeMessage),
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
  params.context.agentRunSeq.delete(params.runId);
}

function broadcastChatDelta(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  text: string;
}) {
  const normalizedText = stripInlineDirectiveTagsForDisplay(params.text).text.trim();
  if (!normalizedText) {
    return;
  }
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "delta" as const,
    message: {
      role: "assistant",
      content: [{ type: "text", text: normalizedText }],
      timestamp: Date.now(),
    },
  };
  params.context.broadcast("chat", payload, { dropIfSlow: true });
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

function isBtwReplyPayload(payload: ReplyPayload | undefined): payload is ReplyPayload & {
  btw: { question: string };
  text: string;
} {
  return (
    typeof payload?.btw?.question === "string" &&
    payload.btw.question.trim().length > 0 &&
    typeof payload.text === "string" &&
    payload.text.trim().length > 0
  );
}

function broadcastSideResult(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  payload: SideResultPayload;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.payload.runId);
  params.context.broadcast("chat.side_result", {
    ...params.payload,
    seq,
  });
  params.context.nodeSendToSession(params.payload.sessionKey, "chat.side_result", {
    ...params.payload,
    seq,
  });
}

function broadcastChatError(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  errorMessage?: string;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "error" as const,
    errorMessage: params.errorMessage,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
  params.context.agentRunSeq.delete(params.runId);
}

const EXECUTION_CHAT_INTENT_PATTERN =
  /\b(?:use (?:the )?(?:full )?(?:coding|agent) team|coding team|agent team|full team|build|implement|fix|add (?:a )?(?:small )?(?:regression )?test|make (?:a )?(?:tiny|small) .*change|deploy if policy permits|close it out)\b/iu;

export const LEGACY_EXECUTION_CHAT_INTENT_FALLBACK_ENV =
  "OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK";

export function isLegacyExecutionChatIntentFallbackEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const testRuntime =
    env.NODE_ENV === "test" || env.VITEST === "true" || env.OPENCLAW_TEST_MINIMAL_GATEWAY === "1";
  return testRuntime && env[LEGACY_EXECUTION_CHAT_INTENT_FALLBACK_ENV] === "1";
}

function isHighRiskForLegacyExecutionChatFallback(message: string): boolean {
  return /\b(production|deploy|send|outbound|install|dependency|model promotion|promote model|work queue lifecycle)\b/iu.test(
    message,
  );
}

export function shouldAttemptExecutionWorkflowChatTurn(
  message: string,
  options: { allowTemporaryLegacySemanticFallback?: boolean } = {},
): boolean {
  const trimmed = message.trim();
  const preGate = runProtocolPreGate({
    text: message,
    sourceRoute: "ux",
    auth: { authenticated: true, actorId: "operator:gateway-chat" },
    requireAuthentication: false,
  });
  if (preGate.kind !== "continue_to_intent_routing") {
    return false;
  }
  if (isChatStopCommandText(trimmed)) {
    return false;
  }
  const fallbackEnabled =
    options.allowTemporaryLegacySemanticFallback === true ||
    isLegacyExecutionChatIntentFallbackEnabled();
  if (!fallbackEnabled || isHighRiskForLegacyExecutionChatFallback(trimmed)) {
    return false;
  }
  return EXECUTION_CHAT_INTENT_PATTERN.test(trimmed);
}

export function evaluateGatewayChatFrontDoorHandoffReadiness(input: {
  config?: OpenClawConfig | null;
  env?: Record<string, string | undefined>;
}) {
  const registry = buildExecutionPlatformFeatureFlagRegistry({
    config: input.config ?? null,
    env: input.env ?? process.env,
    scope: "owner_only",
  });
  const handoffDecision = evaluateExecutionPlatformFlag(
    registry,
    "normal_chat_gateway_front_door_handoff",
    { critical: true },
  );
  const ownerCanaryDecision = evaluateExecutionPlatformFlag(
    registry,
    "two_lane_router_owner_canary",
    { critical: true },
  );
  const nativeSubmitDecision = evaluateExecutionPlatformFlag(
    registry,
    "native_execution_submit_front_door",
    { critical: true },
  );
  const killSwitchDecision = evaluateExecutionPlatformFlag(registry, "live_router_kill_switch", {
    critical: true,
  });
  const allowed =
    handoffDecision.allowed &&
    ownerCanaryDecision.allowed &&
    nativeSubmitDecision.allowed &&
    killSwitchDecision.allowed;
  return {
    artifactKind: "gateway_chat_front_door_handoff_readiness" as const,
    allowed,
    decision: allowed ? ("allowed" as const) : ("blocked" as const),
    handoffDecision,
    ownerCanaryDecision,
    nativeSubmitDecision,
    killSwitchDecision,
    reasonCodes: [
      ...handoffDecision.reasonCodes,
      ...ownerCanaryDecision.reasonCodes,
      ...nativeSubmitDecision.reasonCodes,
      ...killSwitchDecision.reasonCodes,
      ...(allowed ? ["gateway_chat_front_door_handoff_owner_default_allowed"] : []),
    ].slice(0, 40),
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function shouldAttemptIntentFrontDoorChatTurn(
  message: string,
  options: {
    config?: OpenClawConfig | null;
    env?: Record<string, string | undefined>;
    allowWithoutFeatureGate?: boolean;
  } = {},
): boolean {
  const trimmed = message.trim();
  const preGate = runProtocolPreGate({
    text: message,
    sourceRoute: "ux",
    auth: { authenticated: true, actorId: "operator:gateway-chat" },
    requireAuthentication: false,
  });
  if (preGate.kind !== "continue_to_intent_routing" || isChatStopCommandText(trimmed)) {
    return false;
  }
  if (options.allowWithoutFeatureGate === true) {
    return true;
  }
  return evaluateGatewayChatFrontDoorHandoffReadiness({
    config: options.config ?? null,
    env: options.env,
  }).allowed;
}

export function shouldPreserveNormalChatAfterFrontDoorSubmit(input: {
  accepted: boolean;
  runtimeJobId: string | null;
  reasonCodes?: string[] | null;
  frontDoorRouterResult?: { output?: { route?: string | null } | null } | null;
  frontDoorCompiledRequest?: { artifactKind?: string | null } | null;
}): boolean {
  const reasonCodes = input.reasonCodes ?? [];
  if (
    reasonCodes.includes("structured_model_intent_router_provider_not_configured") ||
    reasonCodes.includes("front_door_required_for_free_form_execution_submit")
  ) {
    return true;
  }
  const route = input.frontDoorRouterResult?.output?.route ?? null;
  if (
    !input.accepted &&
    !input.runtimeJobId &&
    (route === "chat_response" || route === "status_response" || route === "plan_only")
  ) {
    return true;
  }
  if (input.frontDoorCompiledRequest?.artifactKind === "front_door_compiled_plan_only") {
    return true;
  }
  return false;
}

export function buildExecutionChatAssistantText(input: {
  accepted: boolean;
  workflowId: string | null;
  runtimeJobId: string | null;
  teamRunId: string | null;
  completed: boolean;
  failed: boolean;
  closeoutState: string;
  reasonCodes: string[];
  closeout?: Record<string, unknown> | null;
}): string {
  const capsule = asChatRecord(input.closeout?.closeoutCapsule);
  const humanReport = asChatRecord(capsule?.humanReport);
  const reportMarkdown = humanReport ? stringField(humanReport, "reportMarkdown", "") : "";
  if (humanReport && reportMarkdown && stringField(humanReport, "source", "") === "model") {
    const refs = [
      input.workflowId ? `Workflow selected: ${input.workflowId}` : null,
      input.runtimeJobId ? `Runtime job: ${input.runtimeJobId}` : null,
      input.teamRunId ? `Team run: ${input.teamRunId}` : null,
      `Closeout: ${input.closeoutState}`,
      input.reasonCodes.length > 0 ? `Reason codes: ${input.reasonCodes.join(", ")}` : null,
    ].filter((line): line is string => Boolean(line));
    return [reportMarkdown, refs.length ? `\nRefs:\n${refs.join("\n")}` : null]
      .filter((line): line is string => typeof line === "string")
      .join("\n");
  }
  const status = input.completed
    ? "completed"
    : input.failed
      ? "needs review"
      : input.accepted
        ? "accepted"
        : "not routed";
  const humanCloseout = asChatRecord(input.closeout?.humanCloseoutSummary);
  const agentTeam = asChatRecord(input.closeout?.agentTeam);
  const closeoutQuality = asChatRecord(input.closeout?.closeoutQuality);
  const activeGraphProgress = asChatRecord(input.closeout?.activeGraphProgress);
  const roleAssignments = arrayRecords(agentTeam?.roleAssignments);
  const roster = arrayRecords(agentTeam?.roster);
  const permission = asChatRecord(agentTeam?.permissionEvidence);
  const whatChanged = humanCloseout ? stringField(humanCloseout, "whatChanged", "") : "";
  const result = humanCloseout ? stringField(humanCloseout, "result", "") : "";
  const eli5Progress = humanCloseout ? stringField(humanCloseout, "eli5Progress", "") : "";
  const filesTouched = stringArray(humanCloseout?.filesTouched).slice(0, 8);
  const testsRun = stringArray(humanCloseout?.testsRun).slice(0, 8);
  const limitations = [
    ...stringArray(humanCloseout?.limitations),
    ...stringArray(closeoutQuality?.limitations),
  ].slice(0, 8);
  const requiredFixes = stringArray(closeoutQuality?.requiredFixes).slice(0, 8);
  const activeGraphState = activeGraphProgress
    ? stringField(activeGraphProgress, "state", "missing")
    : "missing";
  const activeGraphObjective = activeGraphProgress
    ? stringField(activeGraphProgress, "objective", "")
    : "";
  const activeGraphPhase = activeGraphProgress
    ? stringField(activeGraphProgress, "currentPhase", "")
    : "";
  const activeGraphRole = activeGraphProgress ? stringField(activeGraphProgress, "roleId", "") : "";
  const activeGraphNode = activeGraphProgress
    ? stringField(activeGraphProgress, "activeNodeKind", "")
    : "";
  const activeGraphEli5 = activeGraphProgress
    ? stringField(activeGraphProgress, "eli5Progress", "")
    : "";
  const activeGraphOpenCommitments = stringArray(activeGraphProgress?.openCommitmentIds).slice(
    0,
    8,
  );
  const lines = [
    `Execution Platform ${status}.`,
    input.failed && !reportMarkdown
      ? "The workflow did not produce enough accepted closeout evidence for a clean success. I kept the runtime evidence bounded and surfaced the next useful debugging facts below."
      : null,
    input.completed && !reportMarkdown
      ? "The workflow completed through runtime evidence. The model-authored closeout was missing or degraded, so this is a bounded readback summary."
      : null,
    "",
    "What happened:",
    input.workflowId ? `- Workflow selected: ${input.workflowId}` : null,
    input.runtimeJobId ? `- Runtime job: ${input.runtimeJobId}` : null,
    input.teamRunId ? `- Team run: ${input.teamRunId}` : null,
    roleAssignments.length > 0
      ? `- Roles used: ${roleAssignments
          .slice(0, 8)
          .map(
            (role) =>
              `${stringField(role, "roleId", "unknown")} (${stringField(role, "modelId", "unknown")}, ${stringField(role, "status", "unknown")})`,
          )
          .join("; ")}`
      : null,
    roster.length > 0
      ? `- Model refs: ${roster
          .slice(0, 8)
          .map(
            (role) =>
              `${stringField(role, "roleId", "role")}: ${stringField(role, "modelId", "unknown")}`,
          )
          .join("; ")}`
      : null,
    permission
      ? `- Permission model: ${stringField(permission, "permissionModelId", "unknown")} (${stringField(permission, "decision", "unknown")})`
      : null,
    activeGraphState === "present"
      ? `- Active graph progress: ${[
          activeGraphPhase || null,
          activeGraphRole || null,
          activeGraphNode || null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" / ")}`
      : null,
    activeGraphObjective ? `- Current objective: ${activeGraphObjective}` : null,
    activeGraphOpenCommitments.length > 0
      ? `- Open commitments: ${activeGraphOpenCommitments.join(", ")}`
      : null,
    whatChanged ? `- What changed: ${whatChanged}` : null,
    result ? `- Result: ${result}` : null,
    filesTouched.length > 0 ? `- Files/artifacts: ${filesTouched.join(", ")}` : null,
    testsRun.length > 0 ? `- Validation: ${testsRun.join(", ")}` : null,
    `- Closeout: ${input.closeoutState}${capsule ? " (degraded: model-authored capsule missing)" : ""}`,
    closeoutQuality
      ? `- Closeout quality: ${stringField(closeoutQuality, "goalSatisfaction", "unknown")}${closeoutQuality.needsReview === true ? " (needs review)" : ""}`
      : null,
    "",
    "Limitations and next step:",
    limitations.length > 0
      ? `- Limitations: ${limitations.join("; ")}`
      : "- Limitations: none recorded in bounded readback.",
    requiredFixes.length > 0 ? `- Required fixes: ${requiredFixes.join("; ")}` : null,
    eli5Progress
      ? `- ELI5: ${eli5Progress}`
      : activeGraphEli5
        ? `- ELI5: ${activeGraphEli5}`
        : "- ELI5: OpenClaw created or inspected a runtime job, then reported bounded evidence instead of treating the chat UI as execution truth.",
    "",
    "Technical refs:",
    "- Work Queue readback is runtime-truth backed; lifecycle was not mutated by the UI.",
    input.reasonCodes.length > 0
      ? `- Reason codes: ${input.reasonCodes.slice(0, 10).join(", ")}${input.reasonCodes.length > 10 ? " ..." : ""}`
      : null,
  ];
  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function buildHumanOperatorDecisionAssistantText(input: {
  workflowId: string | null;
  runtimeJobId: string;
  metadata: Record<string, unknown>;
}): string {
  const title = stringField(input.metadata, "decisionTitle", "OpenClaw needs your decision");
  const summary = stringField(
    input.metadata,
    "decisionSummary",
    "The workflow paused before continuing and needs an owner decision.",
  );
  const instruction = stringField(
    input.metadata,
    "naturalLanguageInstruction",
    "Reply in OpenClaw with your choice in plain language.",
  );
  const options = arrayRecords(input.metadata.options).slice(0, 4);
  const technicalResumeRefs = asChatRecord(input.metadata.technicalResumeRefs);
  const humanTaskId = technicalResumeRefs
    ? stringField(technicalResumeRefs, "humanTaskId", "")
    : "";
  const optionLines =
    options.length > 0
      ? options.flatMap((option) => {
          const label = stringField(option, "label", "Option");
          const impact = stringField(option, "impact", "");
          const recommended = option.recommended === true ? " (recommended)" : "";
          return [`- ${label}${recommended}`, impact ? `  ${impact}` : null].filter(
            (line): line is string => typeof line === "string",
          );
        })
      : ["- Continue with the owner-approved default decision."];
  return [
    "OpenClaw is paused for your decision.",
    "",
    `Decision: ${title}`,
    summary,
    "",
    "Choices:",
    ...optionLines,
    "",
    instruction,
    "",
    "Technical refs:",
    input.workflowId ? `- Workflow: ${input.workflowId}` : null,
    `- Runtime job: ${input.runtimeJobId}`,
    humanTaskId ? `- Human task: ${humanTaskId}` : null,
    "- The workflow will resume after your reply; Work Queue lifecycle remains runtime-truth backed.",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export function buildFrontDoorHandoffFailureAssistantText(
  input: {
    reasonCodes?: string[] | null;
  } = {},
): string {
  const reasonCodes = input.reasonCodes?.length ? input.reasonCodes : ["front_door_handoff_failed"];
  return [
    "Execution Platform front-door handoff failed before a runtime job could be created.",
    "I did not fall back to ordinary chat/tool execution for this work request.",
    `Reason codes: ${reasonCodes.slice(0, 12).join(", ")}`,
  ].join("\n");
}

function asChatRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function parseHumanOperatorDecisionResume(message: string): {
  runtimeJobId: string | null;
  humanTaskId: string | null;
  decision: "plan_only" | "child_action_graph_proposal";
} | null {
  const trimmed = message.trim();
  const runtimeJobId = message.match(
    /\b(?:runtime\s*job|job)\s*[:#]?\s*(native-exec-[a-z0-9-]+)/iu,
  )?.[1];
  const humanTaskId = message.match(
    /\b(?:human\s*task|humanTaskId)\s*[:#]?\s*(human-task-[a-z0-9-]+)/iu,
  )?.[1];
  const normalized = message.toLowerCase().replace(/[_-]+/gu, " ");
  const decisionMatch =
    message.match(/\b(plan_only|child_action_graph_proposal)\b/iu)?.[1] ??
    (/\bplan\s+only\b/u.test(normalized)
      ? "plan_only"
      : /\bchild\s+action\s+graph(?:\s+proposal)?s?\b/u.test(normalized)
        ? "child_action_graph_proposal"
        : null);
  if (!decisionMatch) {
    return null;
  }
  const hasExplicitTaskRef = Boolean(runtimeJobId || humanTaskId);
  const looksLikeShortDecisionReply =
    trimmed.length <= 280 &&
    /^(?:i\s+(?:choose|select|approve|want)|choose|select|approve|decision|resume|use|go with|proceed with)?\s*(?:plan[_\s-]*only|child[_\s-]*action[_\s-]*graph(?:[_\s-]*proposal)?s?)\b/iu.test(
      trimmed,
    );
  if (!hasExplicitTaskRef && !looksLikeShortDecisionReply) {
    return null;
  }
  const decision = decisionMatch.toLowerCase() as "plan_only" | "child_action_graph_proposal";
  return { runtimeJobId: runtimeJobId ?? null, humanTaskId: humanTaskId ?? null, decision };
}

async function findLatestWaitingHumanDecision(input: {
  runtime: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>;
  sessionKey: string;
}): Promise<{ runtimeJobId: string; humanTaskId: string } | null> {
  const jobs = await input.runtime.runtimeJobs.listRecentJobs({
    jobTypes: ["executor.agent_team"],
    states: ["pending"],
    limit: 50,
  });
  for (const job of jobs) {
    const payload = asChatRecord(job.payload);
    const operator = asChatRecord(payload?.operator);
    if (stringField(operator ?? {}, "sessionId", input.sessionKey) !== input.sessionKey) {
      continue;
    }
    const artifacts = await input.runtime.runtimeJobs.listArtifacts(job.jobId);
    const humanDecision = artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.human_scope_decision")
      .map((artifact) => asChatRecord(artifact.metadata))
      .find((metadata) => metadata?.waitingForOwnerPrompt === true);
    const created = asChatRecord(humanDecision?.created);
    const humanTask = asChatRecord(created?.humanTask);
    const humanTaskId = stringField(humanTask ?? {}, "humanTaskId", "");
    if (!humanTaskId) {
      continue;
    }
    const currentTask = await input.runtime.runtimeWorkGraphs.readHumanTask(humanTaskId);
    if (currentTask?.taskStatus === "waiting") {
      return { runtimeJobId: job.jobId, humanTaskId };
    }
  }
  return null;
}

async function readWaitingHumanDecisionMetadata(input: {
  runtimeJobs: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>["runtimeJobs"];
  runtimeJobId: string;
}): Promise<Record<string, unknown> | null> {
  const artifacts = await input.runtimeJobs.listArtifacts(input.runtimeJobId);
  return (
    artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.human_scope_decision")
      .map((artifact) => asChatRecord(artifact.metadata))
      .find((metadata) => metadata?.waitingForOwnerPrompt === true) ?? null
  );
}

async function tryResumeHumanOperatorDecisionFromChat(params: {
  runtime: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>;
  context: GatewayRequestContext;
  sessionKey: string;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  runId: string;
  message: string;
}): Promise<{ handled: boolean; runtimeJobId: string | null; teamRunId: string | null }> {
  const parsed = parseHumanOperatorDecisionResume(params.message);
  if (!parsed) {
    return { handled: false, runtimeJobId: null, teamRunId: null };
  }
  const resolved =
    parsed.runtimeJobId && parsed.humanTaskId
      ? { runtimeJobId: parsed.runtimeJobId, humanTaskId: parsed.humanTaskId }
      : await findLatestWaitingHumanDecision({
          runtime: params.runtime,
          sessionKey: params.sessionKey,
        });
  if (!resolved) {
    const appended = appendAssistantTranscriptMessage({
      message:
        "I understood your human decision, but I could not find a waiting OpenClaw human task in this session to resume.",
      sessionId: params.sessionId,
      storePath: params.storePath,
      sessionFile: params.sessionFile,
      agentId: params.agentId,
      createIfMissing: true,
      idempotencyKey: `${params.runId}:human-decision-no-waiting-task`,
    });
    broadcastChatFinal({
      context: params.context,
      runId: params.runId,
      sessionKey: params.sessionKey,
      message: appended.message,
    });
    return { handled: true, runtimeJobId: null, teamRunId: null };
  }
  const task = await params.runtime.runtimeWorkGraphs.readHumanTask(resolved.humanTaskId);
  if (!task || task.taskStatus !== "waiting") {
    const appended = appendAssistantTranscriptMessage({
      message: `I could not resume that human decision because the referenced task is not waiting: ${resolved.humanTaskId}.`,
      sessionId: params.sessionId,
      storePath: params.storePath,
      sessionFile: params.sessionFile,
      agentId: params.agentId,
      createIfMissing: true,
      idempotencyKey: `${params.runId}:human-decision-not-resumable`,
    });
    broadcastChatFinal({
      context: params.context,
      runId: params.runId,
      sessionKey: params.sessionKey,
      message: appended.message,
    });
    return { handled: true, runtimeJobId: resolved.runtimeJobId, teamRunId: null };
  }
  const decisionRef = `owner-decision://product-spec-planning/${parsed.decision}`;
  await params.runtime.runtimeWorkGraphs.resumeHumanTask({
    humanTaskId: resolved.humanTaskId,
    boundedResponseRef: decisionRef,
    decisionRefs: [`decision://product-spec-planning/${parsed.decision}`],
  });
  await params.runtime.runtimeJobs.resumePendingJobWithPayloadPatch({
    jobId: resolved.runtimeJobId,
    workerId: `chat:${params.sessionKey}`,
    payloadPatch: {
      ownerDecisionRef: decisionRef,
      ownerHumanTaskId: resolved.humanTaskId,
      ownerHumanTaskGraphId: task.graphId,
      ownerDecision: parsed.decision,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
    reasonCodes: ["human_operator_decision_received_from_chat"],
  });
  const runOnce = await runAgentTeamChatJobThroughWorkerSupervisor({
    runtimeJobs: params.runtime.runtimeJobs,
    runtimeWorkGraphs: params.runtime.runtimeWorkGraphs,
    runtimeToolKernel: params.runtime.runtimeToolKernel,
    workQueue: params.runtime.workQueue,
    runtimeJobId: resolved.runtimeJobId,
    workerId: `chat:${params.sessionKey}`,
  });
  const appended = appendAssistantTranscriptMessage({
    message: runOnce.completed
      ? `Human decision received and runtime job resumed: ${resolved.runtimeJobId}.`
      : `Human decision was recorded, but the resumed runtime job needs review: ${runOnce.reasonCodes.slice(0, 8).join(", ")}`,
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
    createIfMissing: true,
    idempotencyKey: `${params.runId}:human-decision-resumed`,
  });
  broadcastChatFinal({
    context: params.context,
    runId: params.runId,
    sessionKey: params.sessionKey,
    message: appended.message,
  });
  return { handled: true, runtimeJobId: resolved.runtimeJobId, teamRunId: runOnce.teamRunId };
}

async function runAgentTeamChatJobThroughWorkerSupervisor(input: {
  runtimeJobs: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>["runtimeJobs"];
  runtimeWorkGraphs: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>["runtimeWorkGraphs"];
  runtimeToolKernel: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>["runtimeToolKernel"];
  workQueue: Awaited<ReturnType<typeof getExecutionPlatformRuntime>>["workQueue"];
  runtimeJobId: string;
  workerId: string;
}): Promise<{
  completed: boolean;
  failed: boolean;
  status: string;
  teamRunId: string | null;
  reasonCodes: string[];
}> {
  const supervisorResult = await runGatewayAgentTeamRuntimeJobOnce({
    runtimeJobs: input.runtimeJobs,
    runtimeWorkGraphs: input.runtimeWorkGraphs,
    runtimeToolKernel: input.runtimeToolKernel,
    workQueue: input.workQueue,
    runtimeJobId: input.runtimeJobId,
    workerId: input.workerId,
    queueName: "agent-team",
  });
  return {
    completed: supervisorResult.completed,
    failed: supervisorResult.failed,
    status: supervisorResult.status,
    teamRunId: supervisorResult.teamRunId,
    reasonCodes: supervisorResult.reasonCodes,
  };
}

async function tryRunExecutionWorkflowChatTurn(params: {
  cfg: OpenClawConfig;
  context: GatewayRequestContext;
  sessionKey: string;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  runId: string;
  message: string;
}): Promise<{ handled: boolean; runtimeJobId: string | null; teamRunId: string | null }> {
  const humanDecisionResume = parseHumanOperatorDecisionResume(params.message);
  if (
    !humanDecisionResume &&
    !shouldAttemptIntentFrontDoorChatTurn(params.message, { config: params.cfg }) &&
    !shouldAttemptExecutionWorkflowChatTurn(params.message)
  ) {
    return { handled: false, runtimeJobId: null, teamRunId: null };
  }
  const runtime = await getExecutionPlatformRuntime(params.cfg);
  const humanResume = await tryResumeHumanOperatorDecisionFromChat({
    runtime,
    context: params.context,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
    runId: params.runId,
    message: params.message,
  });
  if (humanResume.handled) {
    return humanResume;
  }
  const workItemId = `${params.runId}-execution-work`;
  const submit = await runtime.nativeExecutionRpc.submit({
    prompt: params.message,
    auth: {
      actorId: "operator:main",
      authenticated: true,
      role: "operator",
      sessionId: params.sessionKey,
      sourceRoute: "ux",
    },
    workItemId,
    sourceRoute: "ux",
    sourcePromptRef: {
      refKind: "gateway_chat_transcript",
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      runId: params.runId,
      sourceRoute: "ux",
      rawPromptStored: false,
    },
  });
  if (shouldPreserveNormalChatAfterFrontDoorSubmit(submit)) {
    return { handled: false, runtimeJobId: null, teamRunId: null };
  }
  appendUserTranscriptMessage({
    message: params.message,
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
    idempotencyKey: `${params.runId}:execution-platform-user`,
    timestamp: Date.now(),
  });
  if (!submit.accepted || !submit.runtimeJobId) {
    const clarification = submit.frontDoorClarification?.clarification;
    const message =
      buildExecutionChatAssistantText({
        accepted: submit.accepted,
        workflowId: submit.workflowId,
        runtimeJobId: submit.runtimeJobId,
        teamRunId: null,
        completed: false,
        failed: true,
        closeoutState: clarification ? "clarification_required" : "not_created",
        reasonCodes: submit.reasonCodes ?? ["execution_submit_not_accepted"],
        closeout: null,
      }) + (clarification ? `\nClarification: ${clarification.questionSummary}` : "");
    const appended = appendAssistantTranscriptMessage({
      message,
      sessionId: params.sessionId,
      storePath: params.storePath,
      sessionFile: params.sessionFile,
      agentId: params.agentId,
      createIfMissing: true,
      idempotencyKey: `${params.runId}:execution-platform-not-accepted`,
    });
    broadcastChatFinal({
      context: params.context,
      runId: params.runId,
      sessionKey: params.sessionKey,
      message: appended.message,
    });
    return { handled: true, runtimeJobId: null, teamRunId: null };
  }

  const job = await runtime.runtimeJobs.getJob(submit.runtimeJobId);
  const runOnce =
    job?.jobType === "executor.agent_team"
      ? await runAgentTeamChatJobThroughWorkerSupervisor({
          runtimeJobs: runtime.runtimeJobs,
          runtimeWorkGraphs: runtime.runtimeWorkGraphs,
          runtimeToolKernel: runtime.runtimeToolKernel,
          workQueue: runtime.workQueue,
          runtimeJobId: submit.runtimeJobId,
          workerId: `chat:${params.sessionKey}`,
        })
      : await new WorkflowQueuedRunner({
          runtimeJobs: runtime.runtimeJobs,
          workerId: `chat:${params.sessionKey}`,
          queueName: "agent-team",
          runtimeJobId: submit.runtimeJobId,
          closeoutReporter: new ModelCloseoutCapsuleReporter({
            executor: new CodexAppServerJsonExecutor({
              cwd: process.cwd(),
              requestTimeoutMs: 300_000,
              reasoningEffort: "medium",
            }),
            modelId: "openai-codex/gpt-5.4",
            reasoningEffort: "medium",
            maxOutputTokens: 12_000,
          }),
        }).runOnce();
  const closeout = await runtime.nativeExecutionRpc.readCloseout(submit.runtimeJobId);
  const closeoutRecord =
    closeout && typeof closeout === "object" && !Array.isArray(closeout)
      ? (closeout as Record<string, unknown>)
      : {};
  try {
    if (closeoutRecord.closeoutCapsule) {
      await projectCloseoutCapsuleOpportunitySeedsToWorkQueue({
        workQueue: runtime.workQueue,
        capsule: parseCloseoutCapsule(closeoutRecord.closeoutCapsule),
        actorId: "operator:main",
      });
    }
  } catch {
    // Closeout opportunity projection is advisory; the runtime closeout remains readable.
  }
  const closeoutState =
    typeof closeoutRecord.closeoutState === "string" ? closeoutRecord.closeoutState : "unknown";
  const reasonCodes = [
    ...(submit.reasonCodes ?? []),
    ...("reasonCodes" in runOnce && Array.isArray(runOnce.reasonCodes) ? runOnce.reasonCodes : []),
    ...(runOnce.failed ? ["workflow_runner_failed"] : []),
  ];
  const runOnceStatus =
    "status" in runOnce && typeof runOnce.status === "string" ? runOnce.status : null;
  if (runOnceStatus === "deferred" && reasonCodes.includes("human_operator_input_required")) {
    const humanDecision = await readWaitingHumanDecisionMetadata({
      runtimeJobs: runtime.runtimeJobs,
      runtimeJobId: submit.runtimeJobId,
    });
    if (humanDecision) {
      const message = buildHumanOperatorDecisionAssistantText({
        workflowId: submit.workflowId,
        runtimeJobId: submit.runtimeJobId,
        metadata: humanDecision,
      });
      const appended = appendAssistantTranscriptMessage({
        message,
        sessionId: params.sessionId,
        storePath: params.storePath,
        sessionFile: params.sessionFile,
        agentId: params.agentId,
        createIfMissing: true,
        idempotencyKey: `${params.runId}:execution-platform-human-decision`,
      });
      broadcastChatFinal({
        context: params.context,
        runId: params.runId,
        sessionKey: params.sessionKey,
        message: appended.message,
      });
      return {
        handled: true,
        runtimeJobId: submit.runtimeJobId,
        teamRunId:
          "teamRunId" in runOnce && typeof runOnce.teamRunId === "string"
            ? runOnce.teamRunId
            : null,
      };
    }
  }
  const message = buildExecutionChatAssistantText({
    accepted: submit.accepted,
    workflowId: submit.workflowId,
    runtimeJobId: submit.runtimeJobId,
    teamRunId:
      "teamRunId" in runOnce && typeof runOnce.teamRunId === "string" ? runOnce.teamRunId : null,
    completed: runOnce.completed,
    failed: runOnce.failed,
    closeoutState,
    reasonCodes,
    closeout: closeoutRecord,
  });
  const appended = appendAssistantTranscriptMessage({
    message,
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
    createIfMissing: true,
    idempotencyKey: `${params.runId}:execution-platform-final`,
  });
  broadcastChatFinal({
    context: params.context,
    runId: params.runId,
    sessionKey: params.sessionKey,
    message: appended.message,
  });
  return {
    handled: true,
    runtimeJobId: submit.runtimeJobId,
    teamRunId:
      "teamRunId" in runOnce && typeof runOnce.teamRunId === "string" ? runOnce.teamRunId : null,
  };
}

export const chatHandlers: GatewayRequestHandlers = {
  "chat.history": async ({ params, respond, context }) => {
    if (!validateChatHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.history params: ${formatValidationErrors(validateChatHistoryParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit, maxChars } = params as {
      sessionKey: string;
      limit?: number;
      maxChars?: number;
    };
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    const sessionAgentId = resolveSessionAgentId({ sessionKey, config: cfg });
    const resolvedSessionModel = resolveSessionModelRef(cfg, entry, sessionAgentId);
    const localMessages =
      sessionId && storePath ? readSessionMessages(sessionId, storePath, entry?.sessionFile) : [];
    const rawMessages = augmentChatHistoryWithCliSessionImports({
      entry,
      provider: resolvedSessionModel.provider,
      localMessages,
    });
    const hardMax = 1000;
    const defaultLimit = 200;
    const requested = typeof limit === "number" ? limit : defaultLimit;
    const max = Math.min(hardMax, requested);
    const effectiveMaxChars = resolveEffectiveChatHistoryMaxChars(cfg, maxChars);
    const sliced = rawMessages.length > max ? rawMessages.slice(-max) : rawMessages;
    const sanitized = stripEnvelopeFromMessages(sliced);
    const normalized = augmentChatHistoryWithCanvasBlocks(
      sanitizeChatHistoryMessages(sanitized, effectiveMaxChars),
    );
    const maxHistoryBytes = getMaxChatHistoryMessagesBytes();
    const perMessageHardCap = Math.min(CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES, maxHistoryBytes);
    const replaced = replaceOversizedChatHistoryMessages({
      messages: normalized,
      maxSingleMessageBytes: perMessageHardCap,
    });
    const capped = capArrayByJsonBytes(replaced.messages, maxHistoryBytes).items;
    const bounded = enforceChatHistoryFinalBudget({ messages: capped, maxBytes: maxHistoryBytes });
    const placeholderCount = replaced.replacedCount + bounded.placeholderCount;
    if (placeholderCount > 0) {
      chatHistoryPlaceholderEmitCount += placeholderCount;
      context.logGateway.debug(
        `chat.history omitted oversized payloads placeholders=${placeholderCount} total=${chatHistoryPlaceholderEmitCount}`,
      );
    }
    let thinkingLevel = entry?.thinkingLevel;
    if (!thinkingLevel) {
      const catalog = await context.loadGatewayModelCatalog();
      thinkingLevel = resolveThinkingDefault({
        cfg,
        provider: resolvedSessionModel.provider,
        model: resolvedSessionModel.model,
        catalog,
      });
    }
    const verboseLevel = entry?.verboseLevel ?? cfg.agents?.defaults?.verboseDefault;
    respond(true, {
      sessionKey,
      sessionId,
      messages: bounded.messages,
      thinkingLevel,
      fastMode: entry?.fastMode,
      verboseLevel,
    });
  },
  "chat.abort": ({ params, respond, context, client }) => {
    if (!validateChatAbortParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.abort params: ${formatValidationErrors(validateChatAbortParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey: rawSessionKey, runId } = params as {
      sessionKey: string;
      runId?: string;
    };

    const ops = createChatAbortOps(context);
    const requester = resolveChatAbortRequester(client);

    if (!runId) {
      const res = abortChatRunsForSessionKeyWithPartials({
        context,
        ops,
        sessionKey: rawSessionKey,
        abortOrigin: "rpc",
        stopReason: "rpc",
        requester,
      });
      if (res.unauthorized) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unauthorized"));
        return;
      }
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const active = context.chatAbortControllers.get(runId);
    if (!active) {
      respond(true, { ok: true, aborted: false, runIds: [] });
      return;
    }
    if (active.sessionKey !== rawSessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "runId does not match sessionKey"),
      );
      return;
    }
    if (!canRequesterAbortChatRun(active, requester)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unauthorized"));
      return;
    }

    const partialText = context.chatRunBuffers.get(runId);
    const res = abortChatRunById(ops, {
      runId,
      sessionKey: rawSessionKey,
      stopReason: "rpc",
    });
    if (res.aborted && partialText && partialText.trim()) {
      persistAbortedPartials({
        context,
        sessionKey: rawSessionKey,
        snapshots: [
          {
            runId,
            sessionId: active.sessionId,
            text: partialText,
            abortOrigin: "rpc",
          },
        ],
      });
    }
    respond(true, {
      ok: true,
      aborted: res.aborted,
      runIds: res.aborted ? [runId] : [],
    });
  },
  "chat.send": async ({ params, respond, context, client }) => {
    if (!validateChatSendParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.send params: ${formatValidationErrors(validateChatSendParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      thinking?: string;
      deliver?: boolean;
      originatingChannel?: string;
      originatingTo?: string;
      originatingAccountId?: string;
      originatingThreadId?: string;
      attachments?: Array<{
        type?: string;
        mimeType?: string;
        fileName?: string;
        content?: unknown;
      }>;
      timeoutMs?: number;
      systemInputProvenance?: InputProvenance;
      systemProvenanceReceipt?: string;
      idempotencyKey: string;
    };
    const explicitOriginResult = normalizeExplicitChatSendOrigin({
      originatingChannel: p.originatingChannel,
      originatingTo: p.originatingTo,
      accountId: p.originatingAccountId,
      messageThreadId: p.originatingThreadId,
    });
    if (!explicitOriginResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, explicitOriginResult.error));
      return;
    }
    if (
      (p.systemInputProvenance || p.systemProvenanceReceipt || explicitOriginResult.value) &&
      !canInjectSystemProvenance(client)
    ) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          p.systemInputProvenance || p.systemProvenanceReceipt
            ? "system provenance fields require admin scope"
            : "originating route fields require admin scope",
        ),
      );
      return;
    }
    const sanitizedMessageResult = sanitizeChatSendMessageInput(p.message);
    if (!sanitizedMessageResult.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, sanitizedMessageResult.error),
      );
      return;
    }
    const systemReceiptResult = normalizeOptionalChatSystemReceipt(p.systemProvenanceReceipt);
    if (!systemReceiptResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, systemReceiptResult.error));
      return;
    }
    const inboundMessage = sanitizedMessageResult.message;
    const systemInputProvenance = normalizeInputProvenance(p.systemInputProvenance);
    const systemProvenanceReceipt = systemReceiptResult.receipt;
    const stopCommand = isChatStopCommandText(inboundMessage);
    const normalizedAttachments = normalizeRpcAttachmentsToChatAttachments(p.attachments);
    const rawMessage = inboundMessage.trim();
    if (!rawMessage && normalizedAttachments.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "message or attachment required"),
      );
      return;
    }
    const rawSessionKey = p.sessionKey;
    const { cfg, entry, canonicalKey: sessionKey } = loadSessionEntry(rawSessionKey);
    const agentId = resolveSessionAgentId({
      sessionKey,
      config: cfg,
    });
    let parsedMessage = inboundMessage;
    let parsedImages: ChatImageContent[] = [];
    let imageOrder: PromptImageOrderEntry[] = [];
    let offloadedRefs: OffloadedRef[] = [];
    const timeoutMs = resolveAgentTimeoutMs({
      cfg,
      overrideMs: p.timeoutMs,
    });
    const now = Date.now();
    const clientRunId = p.idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    if (stopCommand) {
      const res = abortChatRunsForSessionKeyWithPartials({
        context,
        ops: createChatAbortOps(context),
        sessionKey: rawSessionKey,
        abortOrigin: "stop-command",
        stopReason: "stop",
        requester: resolveChatAbortRequester(client),
      });
      if (res.unauthorized) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unauthorized"));
        return;
      }
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const cached = context.dedupe.get(`chat:${clientRunId}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }

    const activeExisting = context.chatAbortControllers.get(clientRunId);
    if (activeExisting) {
      respond(true, { runId: clientRunId, status: "in_flight" as const }, undefined, {
        cached: true,
        runId: clientRunId,
      });
      return;
    }
    if (normalizedAttachments.length > 0) {
      const modelRef = resolveSessionModelRef(cfg, entry, agentId);
      const supportsImages = await resolveGatewayModelSupportsImages({
        loadGatewayModelCatalog: context.loadGatewayModelCatalog,
        provider: modelRef.provider,
        model: modelRef.model,
      });
      try {
        const parsed = await parseMessageWithAttachments(inboundMessage, normalizedAttachments, {
          maxBytes: 5_000_000,
          log: context.logGateway,
          supportsImages,
        });
        parsedMessage = parsed.message;
        parsedImages = parsed.images;
        imageOrder = parsed.imageOrder;
        offloadedRefs = parsed.offloadedRefs;
      } catch (err) {
        respond(
          false,
          undefined,
          errorShape(
            err instanceof MediaOffloadError ? ErrorCodes.UNAVAILABLE : ErrorCodes.INVALID_REQUEST,
            String(err),
          ),
        );
        return;
      }
    }

    try {
      const abortController = new AbortController();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey: rawSessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
        ownerConnId: normalizeOptionalText(client?.connId),
        ownerDeviceId: normalizeOptionalText(client?.connect?.device?.id),
      });
      const ackPayload = {
        runId: clientRunId,
        status: "started" as const,
      };
      respond(true, ackPayload, undefined, { runId: clientRunId });
      const persistedImagesPromise = persistChatSendImages({
        images: parsedImages,
        imageOrder,
        offloadedRefs,
        client,
        logGateway: context.logGateway,
      });

      const trimmedMessage = parsedMessage.trim();
      const injectThinking = Boolean(
        p.thinking && trimmedMessage && !trimmedMessage.startsWith("/"),
      );
      const commandBody = injectThinking ? `/think ${p.thinking} ${parsedMessage}` : parsedMessage;
      const messageForAgent = systemProvenanceReceipt
        ? [systemProvenanceReceipt, parsedMessage].filter(Boolean).join("\n\n")
        : parsedMessage;
      const clientInfo = client?.connect?.client;
      const {
        originatingChannel,
        originatingTo,
        accountId,
        messageThreadId,
        explicitDeliverRoute,
      } = resolveChatSendOriginatingRoute({
        client: clientInfo,
        deliver: p.deliver,
        entry,
        explicitOrigin: explicitOriginResult.value,
        hasConnectedClient: client?.connect !== undefined,
        mainKey: cfg.session?.mainKey,
        sessionKey,
      });
      // Inject timestamp so agents know the current date/time.
      // Only BodyForAgent gets the timestamp — Body stays raw for UI display.
      // See: https://github.com/moltbot/moltbot/issues/3658
      const stampedMessage = injectTimestamp(messageForAgent, timestampOptsFromConfig(cfg));

      const ctx: MsgContext = {
        Body: messageForAgent,
        BodyForAgent: stampedMessage,
        BodyForCommands: commandBody,
        RawBody: parsedMessage,
        CommandBody: commandBody,
        InputProvenance: systemInputProvenance,
        SessionKey: sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: originatingChannel,
        OriginatingTo: originatingTo,
        ExplicitDeliverRoute: explicitDeliverRoute,
        AccountId: accountId,
        MessageThreadId: messageThreadId,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
        GatewayClientScopes: client?.connect?.scopes ?? [],
      };

      const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
        cfg,
        agentId,
        channel: INTERNAL_MESSAGE_CHANNEL,
      });
      const deliveredReplies: Array<{ payload: ReplyPayload; kind: "block" | "final" }> = [];
      let appendedWebchatAgentAudio = false;
      let userTranscriptUpdatePromise: Promise<void> | null = null;
      const emitUserTranscriptUpdate = async () => {
        if (userTranscriptUpdatePromise) {
          await userTranscriptUpdatePromise;
          return;
        }
        userTranscriptUpdatePromise = (async () => {
          const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(sessionKey);
          const resolvedSessionId = latestEntry?.sessionId ?? entry?.sessionId;
          if (!resolvedSessionId) {
            return;
          }
          const transcriptPath = resolveTranscriptPath({
            sessionId: resolvedSessionId,
            storePath: latestStorePath,
            sessionFile: latestEntry?.sessionFile ?? entry?.sessionFile,
            agentId,
          });
          if (!transcriptPath) {
            return;
          }
          const persistedImages = await persistedImagesPromise;
          emitSessionTranscriptUpdate({
            sessionFile: transcriptPath,
            sessionKey,
            message: buildChatSendTranscriptMessage({
              message: parsedMessage,
              savedImages: persistedImages,
              timestamp: now,
            }),
          });
        })();
        await userTranscriptUpdatePromise;
      };
      let transcriptMediaRewriteDone = false;
      const rewriteUserTranscriptMedia = async () => {
        if (transcriptMediaRewriteDone) {
          return;
        }
        const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(sessionKey);
        const resolvedSessionId = latestEntry?.sessionId ?? entry?.sessionId;
        if (!resolvedSessionId) {
          return;
        }
        const transcriptPath = resolveTranscriptPath({
          sessionId: resolvedSessionId,
          storePath: latestStorePath,
          sessionFile: latestEntry?.sessionFile ?? entry?.sessionFile,
          agentId,
        });
        if (!transcriptPath) {
          return;
        }
        transcriptMediaRewriteDone = true;
        await rewriteChatSendUserTurnMediaPaths({
          transcriptPath,
          sessionKey,
          message: parsedMessage,
          savedImages: await persistedImagesPromise,
        });
      };
      const appendWebchatAgentAudioTranscriptIfNeeded = async (payload: ReplyPayload) => {
        if (!agentRunStarted || appendedWebchatAgentAudio || !isMediaBearingPayload(payload)) {
          return;
        }
        const audioMessage = await buildWebchatAudioOnlyAssistantMessage([payload], {
          localRoots: getAgentScopedMediaLocalRoots(cfg, agentId),
          onLocalAudioAccessDenied: (message) => {
            context.logGateway.warn(`webchat audio embedding denied local path: ${message}`);
          },
        });
        if (!audioMessage) {
          return;
        }
        const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(sessionKey);
        const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
        const appended = appendAssistantTranscriptMessage({
          message: audioMessage.transcriptText,
          content: audioMessage.content,
          sessionId,
          storePath: latestStorePath,
          sessionFile: latestEntry?.sessionFile,
          agentId,
          createIfMissing: true,
          idempotencyKey: `${clientRunId}:assistant-audio`,
        });
        if (appended.ok) {
          appendedWebchatAgentAudio = true;
          return;
        }
        context.logGateway.warn(
          `webchat transcript append failed for audio reply: ${appended.error ?? "unknown error"}`,
        );
      };
      const dispatcher = createReplyDispatcher({
        ...replyPipeline,
        onError: (err) => {
          context.logGateway.warn(`webchat dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          switch (info.kind) {
            case "block":
              if (!isBtwReplyPayload(payload) && typeof payload.text === "string") {
                broadcastChatDelta({
                  context,
                  runId: clientRunId,
                  sessionKey,
                  text: payload.text,
                });
              }
              deliveredReplies.push({ payload, kind: info.kind });
              await appendWebchatAgentAudioTranscriptIfNeeded(payload);
              break;
            case "final":
              deliveredReplies.push({ payload, kind: info.kind });
              await appendWebchatAgentAudioTranscriptIfNeeded(payload);
              break;
            case "tool":
              // Tool results that carry audio (e.g. the TTS tool) must be promoted
              // to "final" so the downstream audio extraction path can pick them up.
              // Strip text to avoid leaking tool summary into the combined reply.
              if (isMediaBearingPayload(payload)) {
                deliveredReplies.push({
                  payload: { ...payload, text: undefined },
                  kind: "final",
                });
              }
              break;
          }
        },
      });

      // Surface accepted inbound turns immediately so transcript subscribers
      // (gateway watchers, MCP bridges, external channel backends) do not wait
      // on model startup, completion, or failure paths before seeing the user turn.
      void emitUserTranscriptUpdate().catch((transcriptErr) => {
        context.logGateway.warn(
          `webchat eager user transcript update failed: ${formatForLog(transcriptErr)}`,
        );
      });

      const frontDoorHandoffExpected = shouldAttemptIntentFrontDoorChatTurn(
        typeof params.message === "string" ? params.message : parsedMessage,
        { config: cfg },
      );
      try {
        const executionTurn = await tryRunExecutionWorkflowChatTurn({
          cfg,
          context,
          sessionKey,
          sessionId: entry?.sessionId ?? clientRunId,
          storePath: loadSessionEntry(sessionKey).storePath,
          sessionFile: entry?.sessionFile,
          agentId,
          runId: clientRunId,
          message: typeof params.message === "string" ? params.message : parsedMessage,
        });
        if (executionTurn.handled) {
          await rewriteUserTranscriptMedia();
          setGatewayDedupeEntry({
            dedupe: context.dedupe,
            key: `chat:${clientRunId}`,
            entry: {
              ts: Date.now(),
              ok: true,
              payload: {
                runId: clientRunId,
                status: "ok" as const,
                runtimeJobId: executionTurn.runtimeJobId,
                teamRunId: executionTurn.teamRunId,
              },
            },
          });
          context.chatAbortControllers.delete(clientRunId);
          return;
        }
      } catch (executionErr) {
        context.logGateway.warn(
          `execution workflow chat routing skipped: ${formatForLog(executionErr)}`,
        );
        if (frontDoorHandoffExpected) {
          const message = buildFrontDoorHandoffFailureAssistantText({
            reasonCodes: ["front_door_handoff_exception", "ordinary_chat_fallback_suppressed"],
          });
          const latest = loadSessionEntry(sessionKey);
          const appended = appendAssistantTranscriptMessage({
            message,
            sessionId: latest.entry?.sessionId ?? entry?.sessionId ?? clientRunId,
            storePath: latest.storePath,
            sessionFile: latest.entry?.sessionFile ?? entry?.sessionFile,
            agentId,
            createIfMissing: true,
            idempotencyKey: `${clientRunId}:execution-platform-front-door-exception`,
          });
          broadcastChatFinal({
            context,
            runId: clientRunId,
            sessionKey,
            message: appended.message,
          });
          setGatewayDedupeEntry({
            dedupe: context.dedupe,
            key: `chat:${clientRunId}`,
            entry: {
              ts: Date.now(),
              ok: true,
              payload: {
                runId: clientRunId,
                status: "ok" as const,
                runtimeJobId: null,
                teamRunId: null,
              },
            },
          });
          context.chatAbortControllers.delete(clientRunId);
          return;
        }
      }

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          images: parsedImages.length > 0 ? parsedImages : undefined,
          imageOrder: imageOrder.length > 0 ? imageOrder : undefined,
          onAgentRunStart: (runId) => {
            agentRunStarted = true;
            void emitUserTranscriptUpdate();
            const connId = typeof client?.connId === "string" ? client.connId : undefined;
            const wantsToolEvents = hasGatewayClientCap(
              client?.connect?.caps,
              GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
            );
            if (connId && wantsToolEvents) {
              context.registerToolEventRecipient(runId, connId);
              // Register for any other active runs *in the same session* so
              // late-joining clients (e.g. page refresh mid-response) receive
              // in-progress tool events without leaking cross-session data.
              for (const [activeRunId, active] of context.chatAbortControllers) {
                if (activeRunId !== runId && active.sessionKey === p.sessionKey) {
                  context.registerToolEventRecipient(activeRunId, connId);
                }
              }
            }
          },
          onModelSelected,
        },
      })
        .then(async () => {
          await rewriteUserTranscriptMedia();
          if (!agentRunStarted) {
            await emitUserTranscriptUpdate();
            const btwReplies = deliveredReplies
              .map((entry) => entry.payload)
              .filter(isBtwReplyPayload);
            const btwText = btwReplies
              .map((payload) => payload.text.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            if (btwReplies.length > 0 && btwText) {
              broadcastSideResult({
                context,
                payload: {
                  kind: "btw",
                  runId: clientRunId,
                  sessionKey,
                  question: btwReplies[0].btw.question.trim(),
                  text: btwText,
                  isError: btwReplies.some((payload) => payload.isError),
                  ts: Date.now(),
                },
              });
              broadcastChatFinal({
                context,
                runId: clientRunId,
                sessionKey,
              });
            } else {
              const combinedReply = buildTranscriptReplyText(
                deliveredReplies
                  .filter((entry) => entry.kind === "final")
                  .map((entry) => entry.payload),
              );
              let message: Record<string, unknown> | undefined;
              if (combinedReply) {
                const { storePath: latestStorePath, entry: latestEntry } =
                  loadSessionEntry(sessionKey);
                const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
                const appended = appendAssistantTranscriptMessage({
                  message: combinedReply,
                  sessionId,
                  storePath: latestStorePath,
                  sessionFile: latestEntry?.sessionFile,
                  agentId,
                  createIfMissing: true,
                });
                if (appended.ok) {
                  message = appended.message;
                } else {
                  context.logGateway.warn(
                    `webchat transcript append failed: ${appended.error ?? "unknown error"}`,
                  );
                  const now = Date.now();
                  message = {
                    role: "assistant",
                    content: [{ type: "text", text: combinedReply }],
                    timestamp: now,
                    // Keep this compatible with Pi stopReason enums even though this message isn't
                    // persisted to the transcript due to the append failure.
                    stopReason: "stop",
                    usage: { input: 0, output: 0, totalTokens: 0 },
                  };
                }
              }
              broadcastChatFinal({
                context,
                runId: clientRunId,
                sessionKey,
                message,
              });
            }
          } else {
            void emitUserTranscriptUpdate();
          }
          setGatewayDedupeEntry({
            dedupe: context.dedupe,
            key: `chat:${clientRunId}`,
            entry: {
              ts: Date.now(),
              ok: true,
              payload: { runId: clientRunId, status: "ok" as const },
            },
          });
        })
        .catch((err) => {
          void rewriteUserTranscriptMedia().catch((rewriteErr) => {
            context.logGateway.warn(
              `webchat transcript media rewrite failed after error: ${formatForLog(rewriteErr)}`,
            );
          });
          void emitUserTranscriptUpdate().catch((transcriptErr) => {
            context.logGateway.warn(
              `webchat user transcript update failed after error: ${formatForLog(transcriptErr)}`,
            );
          });
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          setGatewayDedupeEntry({
            dedupe: context.dedupe,
            key: `chat:${clientRunId}`,
            entry: {
              ts: Date.now(),
              ok: false,
              payload: {
                runId: clientRunId,
                status: "error" as const,
                summary: String(err),
              },
              error,
            },
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey,
            errorMessage: String(err),
          });
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });
    } catch (err) {
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      const payload = {
        runId: clientRunId,
        status: "error" as const,
        summary: String(err),
      };
      setGatewayDedupeEntry({
        dedupe: context.dedupe,
        key: `chat:${clientRunId}`,
        entry: {
          ts: Date.now(),
          ok: false,
          payload,
          error,
        },
      });
      respond(false, payload, error, {
        runId: clientRunId,
        error: formatForLog(err),
      });
    }
  },
  "chat.inject": async ({ params, respond, context }) => {
    if (!validateChatInjectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.inject params: ${formatValidationErrors(validateChatInjectParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      label?: string;
    };

    // Load session to find transcript file
    const rawSessionKey = p.sessionKey;
    const { cfg, storePath, entry, canonicalKey: sessionKey } = loadSessionEntry(rawSessionKey);
    const sessionId = entry?.sessionId;
    if (!sessionId || !storePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const appended = appendAssistantTranscriptMessage({
      message: p.message,
      label: p.label,
      sessionId,
      storePath,
      sessionFile: entry?.sessionFile,
      agentId: resolveSessionAgentId({ sessionKey, config: cfg }),
      createIfMissing: true,
    });
    if (!appended.ok || !appended.messageId || !appended.message) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `failed to write transcript: ${appended.error ?? "unknown error"}`,
        ),
      );
      return;
    }

    // Broadcast to webchat for immediate UI update
    const chatPayload = {
      runId: `inject-${appended.messageId}`,
      sessionKey,
      seq: 0,
      state: "final" as const,
      message: stripInlineDirectiveTagsFromMessageForDisplay(
        stripEnvelopeFromMessage(appended.message) as Record<string, unknown>,
      ),
    };
    context.broadcast("chat", chatPayload);
    context.nodeSendToSession(sessionKey, "chat", chatPayload);

    respond(true, { ok: true, messageId: appended.messageId });
  },
};
