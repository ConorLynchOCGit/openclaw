import { html, nothing, type TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { CompactionStatus, FallbackStatus } from "../app-tool-stream.ts";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isSupportedChatAttachmentMimeType,
} from "../chat/attachment-support.ts";
import { DeletedMessages } from "../chat/deleted-messages.ts";
import { exportChatMarkdown } from "../chat/export.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { InputHistory } from "../chat/input-history.ts";
import { extractTextCached } from "../chat/message-extract.ts";
import {
  isToolResultMessage,
  normalizeMessage,
  normalizeRoleForGrouping,
} from "../chat/message-normalizer.ts";
import { PinnedMessages } from "../chat/pinned-messages.ts";
import { getPinnedMessageSummary } from "../chat/pinned-summary.ts";
import { messageMatchesSearchQuery } from "../chat/search-match.ts";
import { getOrCreateSessionCacheValue } from "../chat/session-cache.ts";
import type { ChatSideResult } from "../chat/side-result.ts";
import {
  CATEGORY_LABELS,
  SLASH_COMMANDS,
  getSlashCommandCompletions,
  type SlashCommandCategory,
  type SlashCommandDef,
} from "../chat/slash-commands.ts";
import { isSttSupported, startStt, stopStt } from "../chat/speech.ts";
import { buildSidebarContent, extractToolCards, extractToolPreview } from "../chat/tool-cards.ts";
import type { EmbedSandboxMode } from "../embed-sandbox.ts";
import { icons } from "../icons.ts";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import type { SidebarContent } from "../sidebar-content.ts";
import { detectTextDirection } from "../text-direction.ts";
import type {
  GatewaySessionRow,
  PersonalAutoSendUxSettings,
  ProactivityInboxDigest,
  ProactivityInboxItem,
  ProductProactivityQueueItem,
  SessionsListResult,
} from "../types.ts";
import type { ChatItem, MessageGroup, ToolCard } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import { agentLogoUrl, resolveAgentAvatarUrl } from "./agents-utils.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  runId?: string | null;
  runtimeVersion?: string | null;
  hostOperatorStatus?: HostOperatorUiStatus | null;
  thinkingLevel: string | null;
  showThinking: boolean;
  showToolCalls: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionStatus | null;
  fallbackStatus?: FallbackStatus | null;
  messages: unknown[];
  sideResult?: ChatSideResult | null;
  toolMessages: unknown[];
  streamSegments: Array<{ text: string; ts: number }>;
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  productProactivityLoading?: boolean;
  productProactivityError?: string | null;
  productProactivityQueue?: ProductProactivityQueueItem[];
  proactivityInboxDigest?: ProactivityInboxDigest | null;
  proactivityInboxLoading?: boolean;
  proactivityInboxError?: string | null;
  personalAutoSendUx?: PersonalAutoSendUxSettings | null;
  personalAutoSendUxLoading?: boolean;
  personalAutoSendUxError?: string | null;
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  focusMode: boolean;
  sidebarOpen?: boolean;
  sidebarContent?: SidebarContent | null;
  sidebarError?: string | null;
  splitRatio?: number;
  canvasHostUrl?: string | null;
  embedSandboxMode?: EmbedSandboxMode;
  allowExternalEmbedUrls?: boolean;
  assistantName: string;
  assistantAvatar: string | null;
  localMediaPreviewRoots?: string[];
  assistantAttachmentAuthToken?: string | null;
  autoExpandToolCalls?: boolean;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  getDraft?: () => string;
  onDraftChange: (next: string) => void;
  onRequestUpdate?: () => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onProductProactivityApproveSend?: (id: string) => void;
  onProductProactivityDismiss?: (id: string) => void;
  onProductProactivitySnooze?: (id: string) => void;
  onPersonalAutoSendDisable?: () => void;
  onDismissSideResult?: () => void;
  onNewSession: () => void;
  onClearHistory?: () => void;
  agentsList: {
    agents: Array<{ id: string; name?: string; identity?: { name?: string; avatarUrl?: string } }>;
    defaultId?: string;
  } | null;
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onNavigateToAgent?: () => void;
  onSessionSelect?: (sessionKey: string) => void;
  onOpenSidebar?: (content: SidebarContent) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  basePath?: string;
};

export type HostOperatorUiStatus = {
  state: "ordinary" | "disabled" | "read_only" | "write_enabled" | "exec_enabled";
  scopes?: string[];
  auditId?: string | null;
  auditPath?: string | null;
  reason?: string | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;
const FALLBACK_TOAST_DURATION_MS = 8000;

// Persistent instances keyed by session
const inputHistories = new Map<string, InputHistory>();
const pinnedMessagesMap = new Map<string, PinnedMessages>();
const deletedMessagesMap = new Map<string, DeletedMessages>();
const expandedToolCardsBySession = new Map<string, Map<string, boolean>>();
const initializedToolCardsBySession = new Map<string, Set<string>>();
const lastAutoExpandPrefBySession = new Map<string, boolean>();
const operatorPanelExpandedBySession = new Map<string, boolean>();

function getOperatorPanelExpanded(sessionKey: string): boolean {
  return getOrCreateSessionCacheValue(operatorPanelExpandedBySession, sessionKey, () => false);
}

function getInputHistory(sessionKey: string): InputHistory {
  return getOrCreateSessionCacheValue(inputHistories, sessionKey, () => new InputHistory());
}

function getPinnedMessages(sessionKey: string): PinnedMessages {
  return getOrCreateSessionCacheValue(
    pinnedMessagesMap,
    sessionKey,
    () => new PinnedMessages(sessionKey),
  );
}

function getDeletedMessages(sessionKey: string): DeletedMessages {
  return getOrCreateSessionCacheValue(
    deletedMessagesMap,
    sessionKey,
    () => new DeletedMessages(sessionKey),
  );
}

function getExpandedToolCards(sessionKey: string): Map<string, boolean> {
  return getOrCreateSessionCacheValue(expandedToolCardsBySession, sessionKey, () => new Map());
}

function getInitializedToolCards(sessionKey: string): Set<string> {
  return getOrCreateSessionCacheValue(initializedToolCardsBySession, sessionKey, () => new Set());
}

function appendCanvasBlockToAssistantMessage(
  message: unknown,
  preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>,
  rawText: string | null,
) {
  const raw = message as Record<string, unknown>;
  const existingContent = Array.isArray(raw.content)
    ? [...raw.content]
    : typeof raw.content === "string"
      ? [{ type: "text", text: raw.content }]
      : typeof raw.text === "string"
        ? [{ type: "text", text: raw.text }]
        : [];
  const alreadyHasArtifact = existingContent.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const typed = block as {
      type?: unknown;
      preview?: { kind?: unknown; viewId?: unknown; url?: unknown };
    };
    return (
      typed.type === "canvas" &&
      typed.preview?.kind === "canvas" &&
      ((preview.viewId && typed.preview.viewId === preview.viewId) ||
        (preview.url && typed.preview.url === preview.url))
    );
  });
  if (alreadyHasArtifact) {
    return message;
  }
  return {
    ...raw,
    content: [
      ...existingContent,
      {
        type: "canvas",
        preview,
        ...(rawText ? { rawText } : {}),
      },
    ],
  };
}

function extractChatMessagePreview(toolMessage: unknown): {
  preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>;
  text: string | null;
  timestamp: number | null;
} | null {
  const normalized = normalizeMessage(toolMessage);
  const cards = extractToolCards(toolMessage, "preview");
  for (let index = cards.length - 1; index >= 0; index--) {
    const card = cards[index];
    if (card?.preview?.kind === "canvas") {
      return {
        preview: card.preview,
        text: card.outputText ?? null,
        timestamp: normalized.timestamp ?? null,
      };
    }
  }
  const text = extractTextCached(toolMessage) ?? undefined;
  const toolRecord = toolMessage as Record<string, unknown>;
  const toolName =
    typeof toolRecord.toolName === "string"
      ? toolRecord.toolName
      : typeof toolRecord.tool_name === "string"
        ? toolRecord.tool_name
        : undefined;
  const preview = extractToolPreview(text, toolName);
  if (preview?.kind !== "canvas") {
    return null;
  }
  return { preview, text: text ?? null, timestamp: normalized.timestamp ?? null };
}

function findNearestAssistantMessageIndex(
  items: ChatItem[],
  toolTimestamp: number | null,
): number | null {
  const assistantEntries = items
    .map((item, index) => {
      if (item.kind !== "message") {
        return null;
      }
      const message = item.message as Record<string, unknown>;
      const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
      if (role !== "assistant") {
        return null;
      }
      return {
        index,
        timestamp: normalizeMessage(item.message).timestamp ?? null,
      };
    })
    .filter(Boolean) as Array<{ index: number; timestamp: number | null }>;
  if (assistantEntries.length === 0) {
    return null;
  }
  if (toolTimestamp == null) {
    return assistantEntries[assistantEntries.length - 1]?.index ?? null;
  }
  let previous: { index: number; timestamp: number } | null = null;
  let next: { index: number; timestamp: number } | null = null;
  for (const entry of assistantEntries) {
    if (entry.timestamp == null) {
      continue;
    }
    if (entry.timestamp <= toolTimestamp) {
      previous = { index: entry.index, timestamp: entry.timestamp };
      continue;
    }
    next = { index: entry.index, timestamp: entry.timestamp };
    break;
  }
  if (previous && next) {
    const previousDelta = toolTimestamp - previous.timestamp;
    const nextDelta = next.timestamp - toolTimestamp;
    return nextDelta < previousDelta ? next.index : previous.index;
  }
  if (previous) {
    return previous.index;
  }
  if (next) {
    return next.index;
  }
  return assistantEntries[assistantEntries.length - 1]?.index ?? null;
}

interface ChatEphemeralState {
  sttRecording: boolean;
  sttInterimText: string;
  slashMenuOpen: boolean;
  slashMenuItems: SlashCommandDef[];
  slashMenuIndex: number;
  slashMenuMode: "command" | "args";
  slashMenuCommand: SlashCommandDef | null;
  slashMenuArgItems: string[];
  searchOpen: boolean;
  searchQuery: string;
  pinnedExpanded: boolean;
}

function createChatEphemeralState(): ChatEphemeralState {
  return {
    sttRecording: false,
    sttInterimText: "",
    slashMenuOpen: false,
    slashMenuItems: [],
    slashMenuIndex: 0,
    slashMenuMode: "command",
    slashMenuCommand: null,
    slashMenuArgItems: [],
    searchOpen: false,
    searchQuery: "",
    pinnedExpanded: false,
  };
}

const vs = createChatEphemeralState();

/**
 * Reset chat view ephemeral state when navigating away.
 * Stops STT recording and clears search/slash UI that should not survive navigation.
 */
export function resetChatViewState() {
  if (vs.sttRecording) {
    stopStt();
  }
  Object.assign(vs, createChatEphemeralState());
  operatorPanelExpandedBySession.clear();
}

export const cleanupChatModuleState = resetChatViewState;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
}

function syncToolCardExpansionState(
  sessionKey: string,
  items: Array<ChatItem | MessageGroup>,
  autoExpandToolCalls: boolean,
) {
  const expanded = getExpandedToolCards(sessionKey);
  const initialized = getInitializedToolCards(sessionKey);
  const previousAutoExpand = lastAutoExpandPrefBySession.get(sessionKey) ?? false;
  const currentToolCardIds = new Set<string>();
  for (const item of items) {
    if (item.kind !== "group") {
      continue;
    }
    for (const entry of item.messages) {
      const cards = extractToolCards(entry.message, entry.key);
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        const disclosureId = `${entry.key}:toolcard:${cardIndex}`;
        currentToolCardIds.add(disclosureId);
        if (initialized.has(disclosureId)) {
          continue;
        }
        expanded.set(disclosureId, autoExpandToolCalls);
        initialized.add(disclosureId);
      }
      const messageRecord = entry.message as Record<string, unknown>;
      const role = typeof messageRecord.role === "string" ? messageRecord.role : "unknown";
      const normalizedRole = normalizeRoleForGrouping(role);
      const isToolMessage =
        isToolResultMessage(entry.message) ||
        normalizedRole === "tool" ||
        role.toLowerCase() === "toolresult" ||
        role.toLowerCase() === "tool_result" ||
        typeof messageRecord.toolCallId === "string" ||
        typeof messageRecord.tool_call_id === "string";
      if (!isToolMessage) {
        continue;
      }
      const disclosureId = `toolmsg:${entry.key}`;
      currentToolCardIds.add(disclosureId);
      if (initialized.has(disclosureId)) {
        continue;
      }
      expanded.set(disclosureId, autoExpandToolCalls);
      initialized.add(disclosureId);
    }
  }
  if (autoExpandToolCalls && !previousAutoExpand) {
    for (const toolCardId of currentToolCardIds) {
      expanded.set(toolCardId, true);
    }
  }
  lastAutoExpandPrefBySession.set(sessionKey, autoExpandToolCalls);
}

function renderCompactionIndicator(status: CompactionStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  if (status.phase === "active" || status.phase === "retrying") {
    return html`
      <div
        class="compaction-indicator compaction-indicator--active"
        role="status"
        aria-live="polite"
      >
        ${icons.loader} Compacting context...
      </div>
    `;
  }
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div
          class="compaction-indicator compaction-indicator--complete"
          role="status"
          aria-live="polite"
        >
          ${icons.check} Context compacted
        </div>
      `;
    }
  }
  return nothing;
}

function renderFallbackIndicator(status: FallbackStatus | null | undefined) {
  if (!status) {
    return nothing;
  }
  const phase = status.phase ?? "active";
  const elapsed = Date.now() - status.occurredAt;
  if (elapsed >= FALLBACK_TOAST_DURATION_MS) {
    return nothing;
  }
  const details = [
    `Selected: ${status.selected}`,
    phase === "cleared" ? `Active: ${status.selected}` : `Active: ${status.active}`,
    phase === "cleared" && status.previous ? `Previous fallback: ${status.previous}` : null,
    status.reason ? `Reason: ${status.reason}` : null,
    status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const message =
    phase === "cleared"
      ? `Fallback cleared: ${status.selected}`
      : `Fallback active: ${status.active}`;
  const className =
    phase === "cleared"
      ? "compaction-indicator compaction-indicator--fallback-cleared"
      : "compaction-indicator compaction-indicator--fallback";
  const icon = phase === "cleared" ? icons.check : icons.brain;
  return html`
    <div class=${className} role="status" aria-live="polite" title=${details}>
      ${icon} ${message}
    </div>
  `;
}

function renderSideResult(
  sideResult: ChatSideResult | null | undefined,
  onDismiss?: () => void,
): TemplateResult | typeof nothing {
  if (!sideResult) {
    return nothing;
  }
  return html`
    <section
      class=${`chat-side-result ${sideResult.isError ? "chat-side-result--error" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="BTW side result"
    >
      <div class="chat-side-result__header">
        <div class="chat-side-result__label-row">
          <span class="chat-side-result__label">BTW</span>
          <span class="chat-side-result__meta">Not saved to chat history</span>
        </div>
        <button
          class="btn chat-side-result__dismiss"
          type="button"
          aria-label="Dismiss BTW result"
          title="Dismiss"
          @click=${() => onDismiss?.()}
        >
          ${icons.x}
        </button>
      </div>
      <div class="chat-side-result__question">${sideResult.question}</div>
      <div class="chat-side-result__body" dir=${detectTextDirection(sideResult.text)}>
        ${unsafeHTML(toSanitizedMarkdownHtml(sideResult.text))}
      </div>
    </section>
  `;
}

function formatQueuedPromptText(item: ChatQueueItem): string {
  const text = item.text.trim();
  if (text) {
    return text;
  }
  const attachmentCount = item.attachments?.length ?? 0;
  return attachmentCount > 0 ? `Attachment prompt (${attachmentCount})` : "Queued prompt";
}

function renderQueuedPromptBubble(
  item: ChatQueueItem,
  position: number,
  props: ChatProps,
  requestUpdate: () => void,
) {
  const created = new Date(item.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const elapsed = formatElapsed(Date.now() - item.createdAt);
  const canEdit = !item.attachments?.length && !item.localCommandName;
  return html`
    <div class="chat-group user chat-group--queued">
      <div class="chat-avatar user">${icons.messageSquare}</div>
      <div class="chat-group-messages">
        <div class="chat-bubble chat-queued-prompt">
          <div class="chat-queued-prompt__meta">
            <span>Queued #${position}</span>
            <span>${created}</span>
            <span>${elapsed} elapsed</span>
            ${item.pendingRunId ? html`<span>run ${item.pendingRunId}</span>` : nothing}
          </div>
          <div class="chat-queued-prompt__text">${formatQueuedPromptText(item)}</div>
          <div class="chat-queued-prompt__actions">
            ${canEdit
              ? html`
                  <button
                    class="btn btn--xs"
                    type="button"
                    @click=${() => {
                      props.onQueueRemove(item.id);
                      props.onDraftChange(item.text);
                      requestUpdate();
                    }}
                  >
                    Edit
                  </button>
                `
              : nothing}
            <button
              class="btn btn--xs"
              type="button"
              aria-label="Cancel queued prompt"
              @click=${() => props.onQueueRemove(item.id)}
            >
              Cancel
            </button>
          </div>
        </div>
        <div class="chat-group-footer">
          <span class="chat-sender-name">You</span>
          <span class="chat-group-timestamp">Queued</span>
        </div>
      </div>
    </div>
  `;
}

function formatElapsed(durationMs: number): string {
  const safeMs = Math.max(0, durationMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function buildDiagnosticBundle(params: {
  props: ChatProps;
  activeSession: GatewaySessionRow | undefined;
  chatItems: Array<ChatItem | MessageGroup>;
}): string {
  const { props, activeSession, chatItems } = params;
  const activityItems = collectActivityItems(chatItems);
  const statusItem = collectRunStatusItems(chatItems)[0] ?? buildRunStatusItem(props);
  const bundle = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    session_key: props.sessionKey,
    session_id: activeSession?.sessionId ?? null,
    run_id: props.runId ?? statusItem?.runId ?? null,
    runtime_version: props.runtimeVersion ?? null,
    queue: {
      count: props.queue.length,
      ids: props.queue.map((item) => item.id).slice(0, 20),
    },
    run_status: statusItem
      ? {
          phase: statusItem.phase,
          started_at: statusItem.startedAt,
          elapsed_ms: Math.max(0, Date.now() - statusItem.startedAt),
          chips: statusItem.chips.map((chip) => chip.label),
        }
      : null,
    tools: {
      message_count: props.toolMessages.length,
      names: collectToolNames(props.toolMessages).slice(0, 20),
    },
    memory_activity: {
      count: activityItems.length,
      labels: activityItems.map((item) => item.label).slice(0, 20),
      chips: activityItems.flatMap((item) => item.chips.map((chip) => chip.label)).slice(0, 40),
    },
    host_operator: props.hostOperatorStatus
      ? {
          state: props.hostOperatorStatus.state,
          scopes: props.hostOperatorStatus.scopes ?? [],
          audit_id: props.hostOperatorStatus.auditId ?? null,
          audit_path: props.hostOperatorStatus.auditPath ?? null,
          reason: props.hostOperatorStatus.reason ?? null,
        }
      : null,
    messages: {
      count: props.messages.length,
      rendered_limit: CHAT_HISTORY_RENDER_LIMIT,
    },
    privacy: {
      raw_prompt_included: false,
      transcript_included: false,
      raw_tool_log_included: false,
      secrets_included: false,
      root_user_memory_content_included: false,
    },
  };
  return JSON.stringify(bundle, null, 2);
}

function renderDiagnosticBundleButton(bundle: string, label = "Copy diagnostic bundle") {
  return html`
    <button
      class="btn btn--xs operator-diagnostic-copy"
      type="button"
      title=${label}
      aria-label=${label}
      data-diagnostic-bundle=${bundle}
      @click=${async (event: Event) => {
        const btn = event.currentTarget as HTMLButtonElement | null;
        if (!btn) {
          return;
        }
        try {
          await navigator.clipboard.writeText(bundle);
          btn.dataset.copied = "1";
          btn.textContent = "Copied diagnostic";
          window.setTimeout(() => {
            if (btn.isConnected) {
              delete btn.dataset.copied;
              btn.textContent = label;
            }
          }, 1500);
        } catch {
          btn.dataset.error = "1";
        }
      }}
    >
      ${label}
    </button>
  `;
}

function renderRunStatusCard(
  item: Extract<ChatItem, { kind: "run-status" }>,
  props: ChatProps,
  diagnosticBundle: string,
) {
  const started = new Date(item.startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const elapsed = formatElapsed(Date.now() - item.startedAt);
  const canCancel = Boolean(props.canAbort && props.onAbort);
  return html`
    <div class="chat-run-status" role="status" aria-live="polite">
      <div class="chat-run-status__main">
        <span class="chat-run-status__spinner" aria-hidden="true">${icons.loader}</span>
        <span class="chat-run-status__title">Working...</span>
        <span class="chat-run-status__phase">${item.phase}</span>
        <span class="chat-run-status__time">${started}</span>
        <span class="chat-run-status__elapsed">${elapsed} elapsed</span>
        ${item.runId ? html`<span class="chat-run-status__run">run ${item.runId}</span>` : nothing}
      </div>
      ${item.chips.length
        ? html`
            <div class="chat-run-status__chips">
              ${item.chips.map(
                (chip) =>
                  html`<span class="chat-memory-chip chat-memory-chip--${chip.tone ?? "muted"}"
                    >${chip.label}</span
                  >`,
              )}
            </div>
          `
        : nothing}
      <div class="chat-run-status__actions">
        <button
          class="btn btn--xs"
          type="button"
          ?disabled=${!canCancel}
          title=${canCancel ? "Cancel current run" : "Cancel unavailable for this run"}
          @click=${() => props.onAbort?.()}
        >
          Cancel
        </button>
        <button
          class="btn btn--xs"
          type="button"
          disabled
          title="Retry requires durable run replay support"
        >
          Retry unavailable
        </button>
        ${renderDiagnosticBundleButton(diagnosticBundle)}
      </div>
    </div>
  `;
}

function isSafeActivityScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function formatActivityRecord(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (Array.isArray(entry)) {
      const safeItems = entry.filter(isSafeActivityScalar).map(String).slice(0, 8);
      return safeItems.length ? [`${key}=${safeItems.join(",")}`] : [];
    }
    if (entry && typeof entry === "object" && "count" in entry) {
      const count = (entry as { count?: unknown }).count;
      return typeof count === "number" ? [`${key}_count=${count}`] : [];
    }
    return isSafeActivityScalar(entry) ? [`${key}=${String(entry)}`] : [];
  });
}

function parseStructuredActivityMessage(
  message: unknown,
): Extract<ChatItem, { kind: "activity" }> | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const raw = message as Record<string, unknown>;
  const marker = raw.__openclaw as Record<string, unknown> | undefined;
  const markerKind = typeof marker?.kind === "string" ? marker.kind : "";
  if (markerKind !== "model_memory_activity" && markerKind !== "turn_activity") {
    return null;
  }
  if (!marker) {
    return null;
  }
  const normalized = normalizeMessage(message);
  const eventType =
    typeof marker.eventType === "string"
      ? marker.eventType
      : markerKind === "turn_activity"
        ? "turn_activity"
        : "memory_activity";
  const label =
    typeof marker.label === "string" && marker.label.trim()
      ? marker.label.trim()
      : eventType.replaceAll("_", " ");
  const ids = formatActivityRecord(marker.ids);
  const metrics = formatActivityRecord(marker.metrics);
  const labels = formatActivityRecord(marker.labels);
  const detail = [...ids, ...metrics, ...labels].join(" | ");
  const status = typeof marker.status === "string" ? marker.status.toLowerCase() : "";
  const tone =
    status === "failed" || status === "blocked"
      ? "warn"
      : status === "completed" || status === "accepted"
        ? "ok"
        : status === "skipped"
          ? "muted"
          : "muted";
  const chipLabel = eventType.replaceAll("_", " ");
  return {
    kind: "activity",
    key: `activity:${normalized.timestamp ?? Date.now()}:${eventType}:${detail}`,
    label,
    detail,
    timestamp:
      typeof marker.observedAt === "number"
        ? marker.observedAt
        : (normalized.timestamp ?? Date.now()),
    chips: [{ label: chipLabel, tone }],
  };
}

function parseLegacyMemoryActivityMessage(
  message: unknown,
): Extract<ChatItem, { kind: "activity" }> | null {
  const text = extractTextCached(message)?.trim() ?? "";
  if (!text.startsWith("[Memory Activity]")) {
    return null;
  }
  const normalized = normalizeMessage(message);
  const body = text.replace(/^\[Memory Activity\]\s*/, "");
  const parts = body
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const head = parts.shift() ?? "memory activity";
  const chips: Array<{ label: string; tone?: "muted" | "ok" | "warn" }> = [];
  const lowered = head.toLowerCase();
  if (lowered.includes("retrieval")) {
    chips.push({
      label: "retrieval checked",
      tone: lowered.includes("completed") ? "ok" : "muted",
    });
  }
  if (lowered.includes("capture")) {
    chips.push({
      label: lowered.includes("skipped") ? "capture skipped" : "capture checked",
      tone: lowered.includes("completed") ? "ok" : lowered.includes("failed") ? "warn" : "muted",
    });
  }
  if (lowered.includes("projection")) {
    chips.push({ label: "projection digest used", tone: "ok" });
  }
  const idParts = parts.filter((part) =>
    /\b(id|ids|count|request|result|memory|projection)\b/i.test(part),
  );
  const detail = idParts.length ? idParts.join(" | ") : parts.slice(0, 4).join(" | ");
  return {
    kind: "activity",
    key: `activity:${normalized.timestamp ?? Date.now()}:${head}:${detail}`,
    label: head,
    detail,
    timestamp: normalized.timestamp ?? Date.now(),
    chips,
  };
}

function parseMemoryActivityMessage(
  message: unknown,
): Extract<ChatItem, { kind: "activity" }> | null {
  return parseStructuredActivityMessage(message) ?? parseLegacyMemoryActivityMessage(message);
}

function renderMemoryActivityCard(item: Extract<ChatItem, { kind: "activity" }>) {
  const timestamp = new Date(item.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return html`
    <details class="chat-memory-activity chat-memory-activity--tool-like">
      <summary>
        <span class="chat-memory-activity__icon" aria-hidden="true">${icons.brain}</span>
        <span class="chat-memory-activity__label">${item.label}</span>
        <span class="chat-memory-activity__time">${timestamp}</span>
        ${item.chips.map(
          (chip) => html`<span class="chat-memory-chip chat-memory-chip--${chip.tone ?? "muted"}"
            >${chip.label}</span
          >`,
        )}
      </summary>
      ${item.detail
        ? html`<div class="chat-memory-activity__detail">${item.detail}</div>`
        : nothing}
    </details>
  `;
}

function collectActivityItems(
  items: Array<ChatItem | MessageGroup>,
): Array<Extract<ChatItem, { kind: "activity" }>> {
  return items.filter(
    (item): item is Extract<ChatItem, { kind: "activity" }> => item.kind === "activity",
  );
}

function collectRunStatusItems(
  items: Array<ChatItem | MessageGroup>,
): Array<Extract<ChatItem, { kind: "run-status" }>> {
  return items.filter(
    (item): item is Extract<ChatItem, { kind: "run-status" }> => item.kind === "run-status",
  );
}

function collectToolNames(toolMessages: unknown[]): string[] {
  const names = new Set<string>();
  for (let index = 0; index < toolMessages.length; index++) {
    for (const card of extractToolCards(toolMessages[index], `tool-${index}`)) {
      if (card.name.trim()) {
        names.add(card.name.trim());
      }
    }
    const raw = toolMessages[index] as Record<string, unknown>;
    const name =
      typeof raw.toolName === "string"
        ? raw.toolName
        : typeof raw.tool_name === "string"
          ? raw.tool_name
          : typeof raw.name === "string"
            ? raw.name
            : null;
    if (name?.trim()) {
      names.add(name.trim());
    }
  }
  return [...names];
}

function classifyEngineeringTool(name: string): string | null {
  const lowered = name.toLowerCase();
  if (/\bgit\b|git_/.test(lowered)) {
    return "git status";
  }
  if (/\b(pnpm|vitest|test)\b/.test(lowered)) {
    return "test/build";
  }
  if (/\b(build|tsgo|docker|compose)\b/.test(lowered)) {
    return "build/runtime";
  }
  return null;
}

function hostOperatorStateLabel(status: HostOperatorUiStatus | null | undefined): string {
  if (!status) {
    return "ordinary";
  }
  if (status.state === "read_only") {
    return "host-operator read-only";
  }
  if (status.state === "write_enabled") {
    return "host-operator write-enabled";
  }
  if (status.state === "exec_enabled") {
    return "host-operator exec-enabled";
  }
  if (status.state === "disabled") {
    return "host-operator disabled";
  }
  return "ordinary";
}

function renderOperatorExperiencePanel(params: {
  props: ChatProps;
  activeSession: GatewaySessionRow | undefined;
  chatItems: Array<ChatItem | MessageGroup>;
  diagnosticBundle: string;
  requestUpdate: () => void;
}) {
  const { props, activeSession, chatItems, diagnosticBundle, requestUpdate } = params;
  const expanded = getOperatorPanelExpanded(props.sessionKey);
  const activityItems = collectActivityItems(chatItems);
  const retrievalItems = activityItems.filter((item) =>
    /retrieval|pack|miss|memory_existed|empty/i.test(`${item.label} ${item.detail}`),
  );
  const projectionItems = activityItems.filter((item) =>
    /projection|artifact|digest/i.test(`${item.label} ${item.detail}`),
  );
  const toolNames = collectToolNames(props.toolMessages);
  const engineeringCards = toolNames
    .map((name) => ({ name, kind: classifyEngineeringTool(name) }))
    .filter((entry): entry is { name: string; kind: string } => Boolean(entry.kind));
  const sessions = props.sessions?.sessions?.slice(0, 5) ?? [];
  const hostStatus = props.hostOperatorStatus ?? {
    state: "ordinary" as const,
    reason: "host-operator status not loaded in this client view",
  };
  return html`
    <section class="operator-experience-panel" aria-label="Operator diagnostics">
      <button
        class="operator-experience-panel__toggle"
        type="button"
        aria-expanded=${String(expanded)}
        @click=${() => {
          operatorPanelExpandedBySession.set(props.sessionKey, !expanded);
          requestUpdate();
        }}
      >
        <span>Operator status</span>
        <span class="operator-mode-badge operator-mode-badge--${hostStatus.state}">
          ${hostOperatorStateLabel(hostStatus)}
        </span>
        <span class="operator-experience-panel__meta">
          ${props.queue.length} queued · ${activityItems.length} memory events ·
          ${props.toolMessages.length} tool events
        </span>
        <span class="collapse-chevron ${expanded ? "" : "collapse-chevron--collapsed"}"
          >${icons.chevronDown}</span
        >
      </button>
      ${expanded
        ? html`
            <div class="operator-experience-panel__grid">
              <article class="operator-card">
                <div class="operator-card__title">Host permissions</div>
                <div class="operator-card__body">
                  <div>${hostOperatorStateLabel(hostStatus)}</div>
                  <div>
                    Scopes: ${(hostStatus.scopes ?? ["live_repo", "operator_workspace"]).join(", ")}
                  </div>
                  ${hostStatus.auditId ? html`<div>Audit: ${hostStatus.auditId}</div>` : nothing}
                  ${hostStatus.reason ? html`<div>${hostStatus.reason}</div>` : nothing}
                </div>
              </article>

              <article class="operator-card">
                <div class="operator-card__title">Run history</div>
                <div class="operator-card__body">
                  ${sessions.length
                    ? sessions.map(
                        (session) => html`
                          <div class="operator-row">
                            <span>${session.key}</span>
                            <span
                              >${session.updatedAt
                                ? formatElapsed(Date.now() - session.updatedAt)
                                : "unknown"}
                              ago</span
                            >
                          </div>
                        `,
                      )
                    : html`<div>No session history loaded.</div>`}
                  ${activeSession?.sessionId
                    ? html`<div>Current session: ${activeSession.sessionId}</div>`
                    : nothing}
                </div>
              </article>

              <article class="operator-card">
                <div class="operator-card__title">Retrieval proof explorer</div>
                <div class="operator-card__body">
                  ${retrievalItems.length
                    ? retrievalItems
                        .slice(0, 5)
                        .map(
                          (item) =>
                            html`<div class="operator-row">
                              <span>${item.label}</span
                              ><span>${item.detail || "ids on expand"}</span>
                            </div>`,
                        )
                    : html`<div>No retrieval proof events in this visible thread.</div>`}
                </div>
              </article>

              <article class="operator-card">
                <div class="operator-card__title">Projection artifacts</div>
                <div class="operator-card__body">
                  ${projectionItems.length
                    ? projectionItems
                        .slice(0, 5)
                        .map(
                          (item) =>
                            html`<div class="operator-row">
                              <span>${item.label}</span
                              ><span>${item.detail || "digest metadata"}</span>
                            </div>`,
                        )
                    : html`<div>No projection artifact events in this visible thread.</div>`}
                </div>
              </article>

              <article class="operator-card">
                <div class="operator-card__title">Diff/test/build cards</div>
                <div class="operator-card__body">
                  ${engineeringCards.length
                    ? engineeringCards
                        .slice(0, 5)
                        .map(
                          (entry) =>
                            html`<div class="operator-row">
                              <span>${entry.kind}</span><span>${entry.name}</span>
                            </div>`,
                        )
                    : html`<div>No engineering command cards in this visible thread.</div>`}
                </div>
              </article>

              <article class="operator-card">
                <div class="operator-card__title">Diagnostic bundle</div>
                <div class="operator-card__body">
                  <div>
                    Redacted bundle excludes raw prompts, transcripts, raw tool logs, secrets, and
                    root memory content.
                  </div>
                  ${renderDiagnosticBundleButton(diagnosticBundle)}
                </div>
              </article>
            </div>
          `
        : nothing}
    </section>
  `;
}

function formatProactivityClass(messageClass: ProductProactivityQueueItem["messageClass"]): string {
  return messageClass === "operator_approved_follow_up_available"
    ? "Follow-up available"
    : "Suggestion available";
}

function formatInboxMessageClass(messageClass: ProactivityInboxItem["messageClass"]): string {
  if (messageClass === "autosend_simulation") {
    return "Auto-send simulation";
  }
  return formatProactivityClass(messageClass);
}

function renderPersonalAutoSendProductUx(props: ChatProps): TemplateResult | typeof nothing {
  const settings = props.personalAutoSendUx;
  if (!settings && !props.personalAutoSendUxLoading && !props.personalAutoSendUxError) {
    return nothing;
  }
  return html`
    <section class="personal-autosend-panel" aria-label="Personal auto-send settings">
      <div class="product-proactivity-panel__header">
        <div>
          <div class="product-proactivity-panel__eyebrow">Model Memory</div>
          <h3>Personal auto-send</h3>
        </div>
        <span class="product-proactivity-panel__count"
          >${settings?.mode.replace(/_/g, " ") ?? "loading"}</span
        >
      </div>
      ${props.personalAutoSendUxLoading
        ? html`<div class="product-proactivity-panel__empty">Loading auto-send settings...</div>`
        : nothing}
      ${props.personalAutoSendUxError
        ? html`<div class="callout danger">${props.personalAutoSendUxError}</div>`
        : nothing}
      ${settings
        ? html`
            <div class="personal-autosend-panel__grid">
              <div class="operator-row">
                <span>Current mode</span>
                <span>${settings.mode.replace(/_/g, " ")}</span>
              </div>
              <div class="operator-row">
                <span>Auto-send class</span>
                <span>${settings.allowedAutoSendClass}</span>
              </div>
              <div class="operator-row">
                <span>Manual-only</span>
                <span>${settings.manualOnlyMessageClasses.join(", ")}</span>
              </div>
              <div class="operator-row">
                <span>Kill switches</span>
                <span>${settings.killSwitchEnvVars.join(", ")}</span>
              </div>
            </div>
            <div class="product-proactivity-item__actions">
              <button
                class="btn btn--sm btn--ghost personal-autosend-disable"
                type="button"
                @click=${() => props.onPersonalAutoSendDisable?.()}
              >
                Disable / Return to Manual
              </button>
            </div>
          `
        : nothing}
    </section>
  `;
}

function renderProductProactivityQueue(props: ChatProps): TemplateResult | typeof nothing {
  const items = props.productProactivityQueue ?? [];
  if (!props.productProactivityLoading && !props.productProactivityError && items.length === 0) {
    return nothing;
  }
  return html`
    <section class="product-proactivity-panel" aria-label="Pending proactive suggestions">
      <div class="product-proactivity-panel__header">
        <div>
          <div class="product-proactivity-panel__eyebrow">Model Memory</div>
          <h3>Pending proactive suggestions</h3>
        </div>
        <span class="product-proactivity-panel__count"
          >${items.length} item${items.length === 1 ? "" : "s"}</span
        >
      </div>
      ${props.productProactivityLoading
        ? html`<div class="product-proactivity-panel__empty">Loading proactive queue...</div>`
        : nothing}
      ${props.productProactivityError
        ? html`<div class="callout danger">${props.productProactivityError}</div>`
        : nothing}
      ${items.length
        ? html`
            <div class="product-proactivity-panel__list">
              ${items.map((item) => {
                const canSend = item.status === "pending_review";
                return html`
                  <article
                    class="product-proactivity-item product-proactivity-item--${item.status}"
                  >
                    <div class="product-proactivity-item__main">
                      <div class="product-proactivity-item__meta">
                        <span>${formatProactivityClass(item.messageClass)}</span>
                        <span>${item.status.replace(/_/g, " ")}</span>
                        <span
                          >${item.noDarkDataStatus === "pass"
                            ? "no-dark-data pass"
                            : "blocked"}</span
                        >
                      </div>
                      <div class="product-proactivity-item__text">${item.boundedDisplayText}</div>
                      <details class="product-proactivity-item__details">
                        <summary>Why this appeared</summary>
                        <div class="operator-row">
                          <span>Sources</span>
                          <span>${item.sourceRefs.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Profiles</span>
                          <span>${item.sourceProfileIds.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Authority</span>
                          <span>${item.authorityTiers.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Hashes</span>
                          <span
                            >${item.contentHashes.slice(0, 2).join(", ") ||
                            item.proofHashes.slice(0, 2).join(", ")}</span
                          >
                        </div>
                        ${item.blockedReasonCodes.length
                          ? html`<div class="operator-row">
                              <span>Blocked</span>
                              <span>${item.blockedReasonCodes.join(", ")}</span>
                            </div>`
                          : nothing}
                      </details>
                    </div>
                    <div class="product-proactivity-item__actions">
                      <button
                        class="btn btn--sm"
                        type="button"
                        ?disabled=${!canSend}
                        @click=${() => props.onProductProactivityApproveSend?.(item.queueItemId)}
                      >
                        Approve & Send
                      </button>
                      <button
                        class="btn btn--sm btn--ghost"
                        type="button"
                        ?disabled=${item.status === "sent"}
                        @click=${() => props.onProductProactivityDismiss?.(item.queueItemId)}
                      >
                        Dismiss
                      </button>
                      <button
                        class="btn btn--sm btn--ghost"
                        type="button"
                        ?disabled=${item.status === "sent"}
                        @click=${() => props.onProductProactivitySnooze?.(item.queueItemId)}
                      >
                        Snooze
                      </button>
                    </div>
                  </article>
                `;
              })}
            </div>
          `
        : !props.productProactivityLoading
          ? html`<div class="product-proactivity-panel__empty">No pending suggestions.</div>`
          : nothing}
    </section>
  `;
}

function renderProductProactivityNotifications(props: ChatProps): TemplateResult | typeof nothing {
  const items = (props.productProactivityQueue ?? []).filter(
    (item) => item.status === "sent" || item.status === "approved_not_sent",
  );
  if (items.length === 0) {
    return nothing;
  }
  return html`
    <section class="proactivity-notification-stack" aria-label="Approved proactive messages">
      ${items.map(
        (item) => html`
          <article class="proactivity-notification" data-queue-item-id=${item.queueItemId}>
            <div class="proactivity-notification__body">
              <div class="proactivity-notification__eyebrow">Approved Model Memory suggestion</div>
              <div class="proactivity-notification__text">${item.boundedDisplayText}</div>
              <details class="proactivity-notification__details">
                <summary>Why this appeared</summary>
                <div class="operator-row">
                  <span>Sources</span>
                  <span>${item.sourceRefs.slice(0, 4).join(", ") || "missing"}</span>
                </div>
                <div class="operator-row">
                  <span>Profiles</span>
                  <span>${item.sourceProfileIds.slice(0, 4).join(", ") || "missing"}</span>
                </div>
                <div class="operator-row">
                  <span>Authority</span>
                  <span>${item.authorityTiers.slice(0, 4).join(", ") || "missing"}</span>
                </div>
                <div class="operator-row">
                  <span>Hashes</span>
                  <span
                    >${item.contentHashes.slice(0, 2).join(", ") ||
                    item.proofHashes.slice(0, 2).join(", ")}</span
                  >
                </div>
                <div class="operator-row">
                  <span>Safety</span>
                  <span>${item.noDarkDataStatus}; raw/private content excluded</span>
                </div>
              </details>
            </div>
            <div class="proactivity-notification__actions">
              <button
                class="btn btn--sm btn--ghost"
                type="button"
                @click=${() => props.onProductProactivityDismiss?.(item.queueItemId)}
              >
                Dismiss
              </button>
              <button
                class="btn btn--sm btn--ghost"
                type="button"
                @click=${() => props.onProductProactivitySnooze?.(item.queueItemId)}
              >
                Snooze
              </button>
            </div>
          </article>
        `,
      )}
    </section>
  `;
}

function renderProactivityInbox(props: ChatProps): TemplateResult | typeof nothing {
  const digest = props.proactivityInboxDigest;
  const items = digest?.items ?? [];
  if (!digest && !props.proactivityInboxLoading && !props.proactivityInboxError) {
    return nothing;
  }
  return html`
    <section class="proactivity-inbox product-proactivity-panel" aria-label="Proactivity Inbox">
      <div class="product-proactivity-panel__header">
        <div>
          <div class="product-proactivity-panel__eyebrow">Model Memory</div>
          <h3>Proactivity Inbox</h3>
        </div>
        <span class="product-proactivity-panel__count"
          >${items.length} item${items.length === 1 ? "" : "s"}</span
        >
      </div>
      ${props.proactivityInboxLoading
        ? html`<div class="product-proactivity-panel__empty">Loading proactivity inbox...</div>`
        : nothing}
      ${props.proactivityInboxError
        ? html`<div class="callout danger">${props.proactivityInboxError}</div>`
        : nothing}
      ${digest
        ? html`
            <div class="proactivity-inbox__filters" aria-label="Proactivity inbox filters">
              ${digest.filters.map(
                (filter) => html`
                  <span class="pill proactivity-inbox__filter" data-filter=${filter}>
                    ${filter.replace(/_/g, " ")} ${digest.counts[filter] ?? 0}
                  </span>
                `,
              )}
            </div>
            <div class="product-proactivity-panel__list">
              ${items.map(
                (item) => html`
                  <article
                    class="product-proactivity-item proactivity-inbox__item proactivity-inbox__item--${item.status}"
                  >
                    <div class="product-proactivity-item__main">
                      <div class="product-proactivity-item__meta">
                        <span>${formatInboxMessageClass(item.messageClass)}</span>
                        <span>${item.status.replace(/_/g, " ")}</span>
                        <span
                          >${item.filterTags.map((tag) => tag.replace(/_/g, " ")).join(", ")}</span
                        >
                      </div>
                      <div class="product-proactivity-item__text">${item.boundedDisplayText}</div>
                      <details class="product-proactivity-item__details">
                        <summary>Why this appeared</summary>
                        <p>${item.whyThisAppearedSummary}</p>
                        <div class="operator-row">
                          <span>Sources</span>
                          <span>${item.sourceRefs.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Profiles</span>
                          <span>${item.sourceProfileIds.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Authority</span>
                          <span>${item.authorityTiers.slice(0, 4).join(", ") || "missing"}</span>
                        </div>
                        <div class="operator-row">
                          <span>Hashes</span>
                          <span
                            >${item.contentHashes.slice(0, 2).join(", ") ||
                            item.proofHashes.slice(0, 2).join(", ")}</span
                          >
                        </div>
                        <div class="operator-row">
                          <span>Feedback</span>
                          <span
                            >useful ${item.feedbackSummary.usefulCount}, not useful
                            ${item.feedbackSummary.notUsefulCount}, repetitive
                            ${item.feedbackSummary.tooRepetitiveCount}, wrong context
                            ${item.feedbackSummary.wrongContextCount}, unsafe/private
                            ${item.feedbackSummary.unsafePrivateCount}</span
                          >
                        </div>
                        ${item.blockedReasonCodes.length
                          ? html`<div class="operator-row">
                              <span>Blocked</span>
                              <span>${item.blockedReasonCodes.join(", ")}</span>
                            </div>`
                          : nothing}
                        <div class="operator-row">
                          <span>Artifact</span>
                          <span>${item.sourceArtifactReportId}</span>
                        </div>
                      </details>
                    </div>
                  </article>
                `,
              )}
            </div>
          `
        : nothing}
    </section>
  `;
}

function buildRunStatusItem(props: ChatProps): Extract<ChatItem, { kind: "run-status" }> | null {
  const runActive = props.stream !== null || props.sending || props.canAbort === true;
  if (!runActive) {
    return null;
  }
  const hasTools = props.toolMessages.length > 0;
  const hasText = Boolean(props.stream?.trim());
  const phase = hasTools
    ? "using tools"
    : hasText
      ? "writing"
      : props.stream === null
        ? "running"
        : "retrieving memory";
  const chips: Array<{ label: string; tone?: "muted" | "ok" | "warn" }> = [
    { label: "memory activity visible on expand", tone: "muted" },
  ];
  if (hasTools) {
    chips.push({ label: "using tools", tone: "ok" });
  }
  return {
    kind: "run-status",
    key: `run-status:${props.sessionKey}:${props.streamStartedAt ?? "active"}`,
    phase,
    startedAt: props.streamStartedAt ?? Date.now(),
    runId: props.runId ?? null,
    chips,
  };
}

/**
 * Compact notice when context usage reaches 85%+.
 * Progressively shifts from amber (85%) to red (90%+).
 */
/** Parse a 6-digit CSS hex color string to [r, g, b] integer components. */
function parseHexRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    return null;
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

let cachedThemeNoticeColors: {
  warnHex: string;
  dangerHex: string;
  warnRgb: [number, number, number];
  dangerRgb: [number, number, number];
} | null = null;

function getThemeNoticeColors() {
  if (cachedThemeNoticeColors) {
    return cachedThemeNoticeColors;
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const warnHex = rootStyle.getPropertyValue("--warn").trim() || "#f59e0b";
  const dangerHex = rootStyle.getPropertyValue("--danger").trim() || "#ef4444";
  cachedThemeNoticeColors = {
    warnHex,
    dangerHex,
    warnRgb: parseHexRgb(warnHex) ?? [245, 158, 11],
    dangerRgb: parseHexRgb(dangerHex) ?? [239, 68, 68],
  };
  return cachedThemeNoticeColors;
}

function renderContextNotice(
  session: GatewaySessionRow | undefined,
  defaultContextTokens: number | null,
) {
  if (session?.totalTokensFresh === false) {
    return nothing;
  }
  const used = session?.totalTokens ?? 0;
  const limit = session?.contextTokens ?? defaultContextTokens ?? 0;
  if (!used || !limit) {
    return nothing;
  }
  const ratio = used / limit;
  if (ratio < 0.85) {
    return nothing;
  }
  const pct = Math.min(Math.round(ratio * 100), 100);
  // Read theme semantic tokens so color tracks the active theme (Dash, dark, light …)
  const { warnRgb, dangerRgb } = getThemeNoticeColors();
  const [wr, wg, wb] = warnRgb;
  const [dr, dg, db] = dangerRgb;
  // Blend from --warn at 85% usage to --danger at 95%+ usage
  const t = Math.min(Math.max((ratio - 0.85) / 0.1, 0), 1);
  const r = Math.round(wr + (dr - wr) * t);
  const g = Math.round(wg + (dg - wg) * t);
  const b = Math.round(wb + (db - wb) * t);
  const color = `rgb(${r}, ${g}, ${b})`;
  const bgOpacity = 0.08 + 0.08 * t;
  const bg = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
  return html`
    <div class="context-notice" role="status" style="--ctx-color:${color};--ctx-bg:${bg}">
      <svg
        class="context-notice__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>${pct}% context used</span>
      <span class="context-notice__detail"
        >${formatTokensCompact(used)} / ${formatTokensCompact(limit)}</span
      >
    </div>
  `;
}

/** Format token count compactly (e.g. 128000 → "128k"). */
function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }
  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }
  if (imageItems.length === 0) {
    return;
  }
  e.preventDefault();
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function handleFileSelect(e: Event, props: ChatProps) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of input.files) {
    if (!isSupportedChatAttachmentMimeType(file.type)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
  input.value = "";
}

function handleDrop(e: DragEvent, props: ChatProps) {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || !props.onAttachmentsChange) {
    return;
  }
  const current = props.attachments ?? [];
  const additions: ChatAttachment[] = [];
  let pending = 0;
  for (const file of files) {
    if (!isSupportedChatAttachmentMimeType(file.type)) {
      continue;
    }
    pending++;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      additions.push({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
      pending--;
      if (pending === 0) {
        props.onAttachmentsChange?.([...current, ...additions]);
      }
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps): TemplateResult | typeof nothing {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-attachments-preview">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment-thumb">
            <img src=${att.dataUrl} alt="Attachment preview" />
            <button
              class="chat-attachment-remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              &times;
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function resetSlashMenuState(): void {
  vs.slashMenuMode = "command";
  vs.slashMenuCommand = null;
  vs.slashMenuArgItems = [];
  vs.slashMenuItems = [];
}

function updateSlashMenu(value: string, requestUpdate: () => void): void {
  // Arg mode: /command <partial-arg>
  const argMatch = value.match(/^\/(\S+)\s(.*)$/);
  if (argMatch) {
    const cmdName = argMatch[1].toLowerCase();
    const argFilter = argMatch[2].toLowerCase();
    const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
    if (cmd?.argOptions?.length) {
      const filtered = argFilter
        ? cmd.argOptions.filter((opt) => opt.toLowerCase().startsWith(argFilter))
        : cmd.argOptions;
      if (filtered.length > 0) {
        vs.slashMenuMode = "args";
        vs.slashMenuCommand = cmd;
        vs.slashMenuArgItems = filtered;
        vs.slashMenuOpen = true;
        vs.slashMenuIndex = 0;
        vs.slashMenuItems = [];
        requestUpdate();
        return;
      }
    }
    vs.slashMenuOpen = false;
    resetSlashMenuState();
    requestUpdate();
    return;
  }

  // Command mode: /partial-command
  const match = value.match(/^\/(\S*)$/);
  if (match) {
    const items = getSlashCommandCompletions(match[1]);
    vs.slashMenuItems = items;
    vs.slashMenuOpen = items.length > 0;
    vs.slashMenuIndex = 0;
    vs.slashMenuMode = "command";
    vs.slashMenuCommand = null;
    vs.slashMenuArgItems = [];
  } else {
    vs.slashMenuOpen = false;
    resetSlashMenuState();
  }
  requestUpdate();
}

function selectSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Transition to arg picker when the command has fixed options
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();

  if (cmd.executeLocal && !cmd.args) {
    props.onDraftChange(`/${cmd.name}`);
    requestUpdate();
    props.onSend();
  } else {
    props.onDraftChange(`/${cmd.name} `);
    requestUpdate();
  }
}

function tabCompleteSlashCommand(
  cmd: SlashCommandDef,
  props: ChatProps,
  requestUpdate: () => void,
): void {
  // Tab: fill in the command text without executing
  if (cmd.argOptions?.length) {
    props.onDraftChange(`/${cmd.name} `);
    vs.slashMenuMode = "args";
    vs.slashMenuCommand = cmd;
    vs.slashMenuArgItems = cmd.argOptions;
    vs.slashMenuOpen = true;
    vs.slashMenuIndex = 0;
    vs.slashMenuItems = [];
    requestUpdate();
    return;
  }

  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(cmd.args ? `/${cmd.name} ` : `/${cmd.name}`);
  requestUpdate();
}

function selectSlashArg(
  arg: string,
  props: ChatProps,
  requestUpdate: () => void,
  execute: boolean,
): void {
  const cmdName = vs.slashMenuCommand?.name ?? "";
  vs.slashMenuOpen = false;
  resetSlashMenuState();
  props.onDraftChange(`/${cmdName} ${arg}`);
  requestUpdate();
  if (execute) {
    props.onSend();
  }
}

function tokenEstimate(draft: string): string | null {
  if (draft.length < 100) {
    return null;
  }
  return `~${Math.ceil(draft.length / 4)} tokens`;
}

/**
 * Export chat markdown - delegates to shared utility.
 */
function exportMarkdown(props: ChatProps): void {
  exportChatMarkdown(props.messages, props.assistantName);
}

const WELCOME_SUGGESTIONS = [
  "What can you do?",
  "Summarize my recent sessions",
  "Help me configure a channel",
  "Check system health",
];

function renderWelcomeState(props: ChatProps): TemplateResult {
  const name = props.assistantName || "Assistant";
  const avatar = resolveAgentAvatarUrl({
    identity: {
      avatar: props.assistantAvatar ?? undefined,
      avatarUrl: props.assistantAvatarUrl ?? undefined,
    },
  });
  const logoUrl = agentLogoUrl(props.basePath ?? "");

  return html`
    <div class="agent-chat__welcome" style="--agent-color: var(--accent)">
      <div class="agent-chat__welcome-glow"></div>
      ${avatar
        ? html`<img
            src=${avatar}
            alt=${name}
            style="width:56px; height:56px; border-radius:50%; object-fit:cover;"
          />`
        : html`<div class="agent-chat__avatar agent-chat__avatar--logo">
            <img src=${logoUrl} alt="OpenClaw" />
          </div>`}
      <h2>${name}</h2>
      <div class="agent-chat__badges">
        <span class="agent-chat__badge"><img src=${logoUrl} alt="" /> Ready to chat</span>
      </div>
      <p class="agent-chat__hint">Type a message below &middot; <kbd>/</kbd> for commands</p>
      <div class="agent-chat__suggestions">
        ${WELCOME_SUGGESTIONS.map(
          (text) => html`
            <button
              type="button"
              class="agent-chat__suggestion"
              @click=${() => {
                props.onDraftChange(text);
                props.onSend();
              }}
            >
              ${text}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderSearchBar(requestUpdate: () => void): TemplateResult | typeof nothing {
  if (!vs.searchOpen) {
    return nothing;
  }
  return html`
    <div class="agent-chat__search-bar">
      ${icons.search}
      <input
        type="text"
        placeholder="Search messages..."
        aria-label="Search messages"
        .value=${vs.searchQuery}
        @input=${(e: Event) => {
          vs.searchQuery = (e.target as HTMLInputElement).value;
          requestUpdate();
        }}
      />
      <button
        class="btn btn--ghost"
        aria-label="Close search"
        @click=${() => {
          vs.searchOpen = false;
          vs.searchQuery = "";
          requestUpdate();
        }}
      >
        ${icons.x}
      </button>
    </div>
  `;
}

function renderPinnedSection(
  props: ChatProps,
  pinned: PinnedMessages,
  requestUpdate: () => void,
): TemplateResult | typeof nothing {
  const messages = Array.isArray(props.messages) ? props.messages : [];
  const entries: Array<{ index: number; text: string; role: string }> = [];
  for (const idx of pinned.indices) {
    const msg = messages[idx] as Record<string, unknown> | undefined;
    if (!msg) {
      continue;
    }
    const text = getPinnedMessageSummary(msg);
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    entries.push({ index: idx, text, role });
  }
  if (entries.length === 0) {
    return nothing;
  }
  return html`
    <div class="agent-chat__pinned">
      <button
        class="agent-chat__pinned-toggle"
        @click=${() => {
          vs.pinnedExpanded = !vs.pinnedExpanded;
          requestUpdate();
        }}
      >
        ${icons.bookmark} ${entries.length} pinned
        <span class="collapse-chevron ${vs.pinnedExpanded ? "" : "collapse-chevron--collapsed"}"
          >${icons.chevronDown}</span
        >
      </button>
      ${vs.pinnedExpanded
        ? html`
            <div class="agent-chat__pinned-list">
              ${entries.map(
                ({ index, text, role }) => html`
                  <div class="agent-chat__pinned-item">
                    <span class="agent-chat__pinned-role"
                      >${role === "user" ? "You" : "Assistant"}</span
                    >
                    <span class="agent-chat__pinned-text"
                      >${text.slice(0, 100)}${text.length > 100 ? "..." : ""}</span
                    >
                    <button
                      class="btn btn--ghost"
                      @click=${() => {
                        pinned.unpin(index);
                        requestUpdate();
                      }}
                      title="Unpin"
                    >
                      ${icons.x}
                    </button>
                  </div>
                `,
              )}
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderSlashMenu(
  requestUpdate: () => void,
  props: ChatProps,
): TemplateResult | typeof nothing {
  if (!vs.slashMenuOpen) {
    return nothing;
  }

  // Arg-picker mode: show options for the selected command
  if (vs.slashMenuMode === "args" && vs.slashMenuCommand && vs.slashMenuArgItems.length > 0) {
    return html`
      <div class="slash-menu" role="listbox" aria-label="Command arguments">
        <div class="slash-menu-group">
          <div class="slash-menu-group__label">
            /${vs.slashMenuCommand.name} ${vs.slashMenuCommand.description}
          </div>
          ${vs.slashMenuArgItems.map(
            (arg, i) => html`
              <div
                class="slash-menu-item ${i === vs.slashMenuIndex ? "slash-menu-item--active" : ""}"
                role="option"
                aria-selected=${i === vs.slashMenuIndex}
                @click=${() => selectSlashArg(arg, props, requestUpdate, true)}
                @mouseenter=${() => {
                  vs.slashMenuIndex = i;
                  requestUpdate();
                }}
              >
                ${vs.slashMenuCommand?.icon
                  ? html`<span class="slash-menu-icon">${icons[vs.slashMenuCommand.icon]}</span>`
                  : nothing}
                <span class="slash-menu-name">${arg}</span>
                <span class="slash-menu-desc">/${vs.slashMenuCommand?.name} ${arg}</span>
              </div>
            `,
          )}
        </div>
        <div class="slash-menu-footer">
          <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> run <kbd>Esc</kbd> close
        </div>
      </div>
    `;
  }

  // Command mode: show grouped commands
  if (vs.slashMenuItems.length === 0) {
    return nothing;
  }

  const grouped = new Map<
    SlashCommandCategory,
    Array<{ cmd: SlashCommandDef; globalIdx: number }>
  >();
  for (let i = 0; i < vs.slashMenuItems.length; i++) {
    const cmd = vs.slashMenuItems[i];
    const cat = cmd.category ?? "session";
    let list = grouped.get(cat);
    if (!list) {
      list = [];
      grouped.set(cat, list);
    }
    list.push({ cmd, globalIdx: i });
  }

  const sections: TemplateResult[] = [];
  for (const [cat, entries] of grouped) {
    sections.push(html`
      <div class="slash-menu-group">
        <div class="slash-menu-group__label">${CATEGORY_LABELS[cat]}</div>
        ${entries.map(
          ({ cmd, globalIdx }) => html`
            <div
              class="slash-menu-item ${globalIdx === vs.slashMenuIndex
                ? "slash-menu-item--active"
                : ""}"
              role="option"
              aria-selected=${globalIdx === vs.slashMenuIndex}
              @click=${() => selectSlashCommand(cmd, props, requestUpdate)}
              @mouseenter=${() => {
                vs.slashMenuIndex = globalIdx;
                requestUpdate();
              }}
            >
              ${cmd.icon ? html`<span class="slash-menu-icon">${icons[cmd.icon]}</span>` : nothing}
              <span class="slash-menu-name">/${cmd.name}</span>
              ${cmd.args ? html`<span class="slash-menu-args">${cmd.args}</span>` : nothing}
              <span class="slash-menu-desc">${cmd.description}</span>
              ${cmd.argOptions?.length
                ? html`<span class="slash-menu-badge">${cmd.argOptions.length} options</span>`
                : cmd.executeLocal && !cmd.args
                  ? html` <span class="slash-menu-badge">instant</span> `
                  : nothing}
            </div>
          `,
        )}
      </div>
    `);
  }

  return html`
    <div class="slash-menu" role="listbox" aria-label="Slash commands">
      ${sections}
      <div class="slash-menu-footer">
        <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> fill <kbd>Enter</kbd> select <kbd>Esc</kbd> close
      </div>
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar:
      resolveAgentAvatarUrl({
        identity: {
          avatar: props.assistantAvatar ?? undefined,
          avatarUrl: props.assistantAvatarUrl ?? undefined,
        },
      }) ?? null,
  };
  const pinned = getPinnedMessages(props.sessionKey);
  const deleted = getDeletedMessages(props.sessionKey);
  const inputHistory = getInputHistory(props.sessionKey);
  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const tokens = tokenEstimate(props.draft);

  const placeholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : `Message ${props.assistantName || "agent"} (Enter to send)`
    : "Connect to the gateway to start chatting...";

  const requestUpdate = props.onRequestUpdate ?? (() => {});
  const getDraft = props.getDraft ?? (() => props.draft);

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);

  const handleCodeBlockCopy = (e: Event) => {
    const btn = (e.target as HTMLElement).closest(".code-block-copy");
    if (!btn) {
      return;
    }
    const code = (btn as HTMLElement).dataset.code ?? "";
    navigator.clipboard.writeText(code).then(
      () => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      },
      () => {},
    );
  };

  const chatItems = buildChatItems(props);
  syncToolCardExpansionState(props.sessionKey, chatItems, Boolean(props.autoExpandToolCalls));
  const expandedToolCards = getExpandedToolCards(props.sessionKey);
  const diagnosticBundle = buildDiagnosticBundle({ props, activeSession, chatItems });
  const toggleToolCardExpanded = (toolCardId: string) => {
    expandedToolCards.set(toolCardId, !expandedToolCards.get(toolCardId));
    requestUpdate();
  };
  const isEmpty = chatItems.length === 0 && !props.loading;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
      @click=${handleCodeBlockCopy}
    >
      <div class="chat-thread-inner">
        ${renderOperatorExperiencePanel({
          props,
          activeSession,
          chatItems,
          diagnosticBundle,
          requestUpdate,
        })}
        ${renderProductProactivityNotifications(props)} ${renderPersonalAutoSendProductUx(props)}
        ${renderProductProactivityQueue(props)} ${renderProactivityInbox(props)}
        ${props.loading
          ? html`
              <div class="chat-loading-skeleton" aria-label="Loading chat">
                <div class="chat-line assistant">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div
                        class="skeleton skeleton-line skeleton-line--medium"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line user" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div class="skeleton skeleton-line skeleton-line--medium"></div>
                    </div>
                  </div>
                </div>
                <div class="chat-line assistant" style="margin-top: 12px">
                  <div class="chat-msg">
                    <div class="chat-bubble">
                      <div
                        class="skeleton skeleton-line skeleton-line--long"
                        style="margin-bottom: 8px"
                      ></div>
                      <div class="skeleton skeleton-line skeleton-line--short"></div>
                    </div>
                  </div>
                </div>
              </div>
            `
          : nothing}
        ${isEmpty && !vs.searchOpen ? renderWelcomeState(props) : nothing}
        ${isEmpty && vs.searchOpen
          ? html` <div class="agent-chat__empty">No matching messages</div> `
          : nothing}
        ${repeat(
          chatItems,
          (item) => item.key,
          (item) => {
            if (item.kind === "divider") {
              return html`
                <div class="chat-divider" role="separator" data-ts=${String(item.timestamp)}>
                  <span class="chat-divider__line"></span>
                  <span class="chat-divider__label">${item.label}</span>
                  <span class="chat-divider__line"></span>
                </div>
              `;
            }
            if (item.kind === "reading-indicator") {
              return renderReadingIndicatorGroup(assistantIdentity, props.basePath);
            }
            if (item.kind === "run-status") {
              return renderRunStatusCard(item, props, diagnosticBundle);
            }
            if (item.kind === "queued-prompt") {
              return renderQueuedPromptBubble(
                item.item as ChatQueueItem,
                item.position,
                props,
                requestUpdate,
              );
            }
            if (item.kind === "activity") {
              return renderMemoryActivityCard(item);
            }
            if (item.kind === "stream") {
              return renderStreamingGroup(
                item.text,
                item.startedAt,
                props.onOpenSidebar,
                assistantIdentity,
                props.basePath,
              );
            }
            if (item.kind === "group") {
              if (deleted.has(item.key)) {
                return nothing;
              }
              return renderMessageGroup(item, {
                onOpenSidebar: props.onOpenSidebar,
                showReasoning,
                showToolCalls: props.showToolCalls,
                autoExpandToolCalls: Boolean(props.autoExpandToolCalls),
                isToolMessageExpanded: (messageId: string) =>
                  expandedToolCards.get(messageId) ?? false,
                onToggleToolMessageExpanded: (messageId: string) => {
                  expandedToolCards.set(messageId, !expandedToolCards.get(messageId));
                  requestUpdate();
                },
                isToolExpanded: (toolCardId: string) => expandedToolCards.get(toolCardId) ?? false,
                onToggleToolExpanded: toggleToolCardExpanded,
                onRequestUpdate: requestUpdate,
                assistantName: props.assistantName,
                assistantAvatar: assistantIdentity.avatar,
                basePath: props.basePath,
                localMediaPreviewRoots: props.localMediaPreviewRoots ?? [],
                assistantAttachmentAuthToken: props.assistantAttachmentAuthToken ?? null,
                canvasHostUrl: props.canvasHostUrl,
                embedSandboxMode: props.embedSandboxMode ?? "scripts",
                allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                contextWindow:
                  activeSession?.contextTokens ?? props.sessions?.defaults?.contextTokens ?? null,
                onDelete: () => {
                  deleted.delete(item.key);
                  requestUpdate();
                },
              });
            }
            return nothing;
          },
        )}
      </div>
    </div>
  `;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Slash menu navigation — arg mode
    if (vs.slashMenuOpen && vs.slashMenuMode === "args" && vs.slashMenuArgItems.length > 0) {
      const len = vs.slashMenuArgItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, false);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashArg(vs.slashMenuArgItems[vs.slashMenuIndex], props, requestUpdate, true);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    // Slash menu navigation — command mode
    if (vs.slashMenuOpen && vs.slashMenuItems.length > 0) {
      const len = vs.slashMenuItems.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex + 1) % len;
          requestUpdate();
          return;
        case "ArrowUp":
          e.preventDefault();
          vs.slashMenuIndex = (vs.slashMenuIndex - 1 + len) % len;
          requestUpdate();
          return;
        case "Tab":
          e.preventDefault();
          tabCompleteSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Enter":
          e.preventDefault();
          selectSlashCommand(vs.slashMenuItems[vs.slashMenuIndex], props, requestUpdate);
          return;
        case "Escape":
          e.preventDefault();
          vs.slashMenuOpen = false;
          resetSlashMenuState();
          requestUpdate();
          return;
      }
    }

    if (e.key === "Escape" && props.sideResult && !vs.searchOpen) {
      e.preventDefault();
      props.onDismissSideResult?.();
      return;
    }

    // Input history (only when input is empty)
    if (!props.draft.trim()) {
      if (e.key === "ArrowUp") {
        const prev = inputHistory.up();
        if (prev !== null) {
          e.preventDefault();
          props.onDraftChange(prev);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        const next = inputHistory.down();
        e.preventDefault();
        props.onDraftChange(next ?? "");
        return;
      }
    }

    // Cmd+F for search
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "f") {
      e.preventDefault();
      vs.searchOpen = !vs.searchOpen;
      if (!vs.searchOpen) {
        vs.searchQuery = "";
      }
      requestUpdate();
      return;
    }

    // Send on Enter (without shift)
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (!props.connected) {
        return;
      }
      e.preventDefault();
      if (canCompose) {
        if (props.draft.trim()) {
          inputHistory.push(props.draft);
        }
        props.onSend();
      }
    }
  };

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    adjustTextareaHeight(target);
    updateSlashMenu(target.value, requestUpdate);
    inputHistory.reset();
    props.onDraftChange(target.value);
  };

  return html`
    <section
      class="card chat"
      @drop=${(e: DragEvent) => handleDrop(e, props)}
      @dragover=${(e: DragEvent) => e.preventDefault()}
    >
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      ${props.focusMode
        ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
        : nothing}
      ${renderSearchBar(requestUpdate)} ${renderPinnedSection(props, pinned, requestUpdate)}

      <div class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}">
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${sidebarOpen
          ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  canvasHostUrl: props.canvasHostUrl,
                  embedSandboxMode: props.embedSandboxMode ?? "scripts",
                  allowExternalEmbedUrls: props.allowExternalEmbedUrls ?? false,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    if (props.sidebarContent.kind === "markdown") {
                      props.onOpenSidebar(
                        buildSidebarContent(`\`\`\`\n${props.sidebarContent.content}\n\`\`\``),
                      );
                      return;
                    }
                    if (props.sidebarContent.rawText?.trim()) {
                      props.onOpenSidebar(
                        buildSidebarContent(`\`\`\`json\n${props.sidebarContent.rawText}\n\`\`\``),
                      );
                    }
                  },
                })}
              </div>
            `
          : nothing}
      </div>

      ${renderSideResult(props.sideResult, props.onDismissSideResult)}
      ${renderFallbackIndicator(props.fallbackStatus)}
      ${renderCompactionIndicator(props.compactionStatus)}
      ${renderContextNotice(activeSession, props.sessions?.defaults?.contextTokens ?? null)}
      ${props.showNewMessages
        ? html`
            <button class="chat-new-messages" type="button" @click=${props.onScrollToBottom}>
              ${icons.arrowDown} New messages
            </button>
          `
        : nothing}

      <!-- Input bar -->
      <div class="agent-chat__input">
        ${renderSlashMenu(requestUpdate, props)} ${renderAttachmentPreview(props)}

        <input
          type="file"
          accept=${CHAT_ATTACHMENT_ACCEPT}
          multiple
          class="agent-chat__file-input"
          @change=${(e: Event) => handleFileSelect(e, props)}
        />

        ${vs.sttRecording && vs.sttInterimText
          ? html`<div class="agent-chat__stt-interim">${vs.sttInterimText}</div>`
          : nothing}

        <textarea
          ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
          .value=${props.draft}
          dir=${detectTextDirection(props.draft)}
          ?disabled=${!props.connected}
          @keydown=${handleKeyDown}
          @input=${handleInput}
          @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
          placeholder=${vs.sttRecording ? "Listening..." : placeholder}
          rows="1"
        ></textarea>

        <div class="agent-chat__toolbar">
          <div class="agent-chat__toolbar-left">
            <button
              class="agent-chat__input-btn"
              @click=${() => {
                document.querySelector<HTMLInputElement>(".agent-chat__file-input")?.click();
              }}
              title="Attach file"
              aria-label="Attach file"
              ?disabled=${!props.connected}
            >
              ${icons.paperclip}
            </button>

            ${isSttSupported()
              ? html`
                  <button
                    class="agent-chat__input-btn ${vs.sttRecording
                      ? "agent-chat__input-btn--recording"
                      : ""}"
                    @click=${() => {
                      if (vs.sttRecording) {
                        stopStt();
                        vs.sttRecording = false;
                        vs.sttInterimText = "";
                        requestUpdate();
                      } else {
                        const started = startStt({
                          onTranscript: (text, isFinal) => {
                            if (isFinal) {
                              const current = getDraft();
                              const sep = current && !current.endsWith(" ") ? " " : "";
                              props.onDraftChange(current + sep + text);
                              vs.sttInterimText = "";
                            } else {
                              vs.sttInterimText = text;
                            }
                            requestUpdate();
                          },
                          onStart: () => {
                            vs.sttRecording = true;
                            requestUpdate();
                          },
                          onEnd: () => {
                            vs.sttRecording = false;
                            vs.sttInterimText = "";
                            requestUpdate();
                          },
                          onError: () => {
                            vs.sttRecording = false;
                            vs.sttInterimText = "";
                            requestUpdate();
                          },
                        });
                        if (started) {
                          vs.sttRecording = true;
                          requestUpdate();
                        }
                      }
                    }}
                    title=${vs.sttRecording ? "Stop recording" : "Voice input"}
                    ?disabled=${!props.connected}
                  >
                    ${vs.sttRecording ? icons.micOff : icons.mic}
                  </button>
                `
              : nothing}
            ${tokens ? html`<span class="agent-chat__token-count">${tokens}</span>` : nothing}
          </div>

          <div class="agent-chat__toolbar-right">
            ${nothing /* search hidden for now */}
            ${canAbort
              ? nothing
              : html`
                  <button
                    class="btn btn--ghost"
                    @click=${props.onNewSession}
                    title="New session"
                    aria-label="New session"
                  >
                    ${icons.plus}
                  </button>
                `}
            <button
              class="btn btn--ghost"
              @click=${() => exportMarkdown(props)}
              title="Export"
              aria-label="Export chat"
              ?disabled=${props.messages.length === 0}
            >
              ${icons.download}
            </button>

            ${canAbort
              ? html`
                  <button
                    class="chat-send-btn chat-send-btn--stop"
                    @click=${props.onAbort}
                    title="Stop"
                    aria-label="Stop generating"
                  >
                    ${icons.stop}
                  </button>
                  <button
                    class="chat-send-btn"
                    @click=${() => {
                      if (props.draft.trim()) {
                        inputHistory.push(props.draft);
                      }
                      props.onSend();
                    }}
                    ?disabled=${!props.connected || !props.draft.trim()}
                    title="Queue"
                    aria-label="Queue message"
                  >
                    ${icons.send}
                  </button>
                `
              : html`
                  <button
                    class="chat-send-btn"
                    @click=${() => {
                      if (props.draft.trim()) {
                        inputHistory.push(props.draft);
                      }
                      props.onSend();
                    }}
                    ?disabled=${!props.connected || props.sending}
                    title=${isBusy ? "Queue" : "Send"}
                    aria-label=${isBusy ? "Queue message" : "Send message"}
                  >
                    ${icons.send}
                  </button>
                `}
          </div>
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const senderLabel = role.toLowerCase() === "user" ? (normalized.senderLabel ?? null) : null;
    const timestamp = normalized.timestamp || Date.now();

    if (
      !currentGroup ||
      currentGroup.role !== role ||
      (role.toLowerCase() === "user" && currentGroup.senderLabel !== senderLabel)
    ) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        senderLabel,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);
    const raw = msg as Record<string, unknown>;
    const marker = raw.__openclaw as Record<string, unknown> | undefined;
    if (marker && marker.kind === "compaction") {
      items.push({
        kind: "divider",
        key:
          typeof marker.id === "string"
            ? `divider:compaction:${marker.id}`
            : `divider:compaction:${normalized.timestamp}:${i}`,
        label: "Compaction",
        timestamp: normalized.timestamp ?? Date.now(),
      });
      continue;
    }

    const memoryActivity = parseMemoryActivityMessage(msg);
    if (memoryActivity) {
      if (
        !vs.searchOpen ||
        !vs.searchQuery.trim() ||
        memoryActivity.label.toLowerCase().includes(vs.searchQuery.trim().toLowerCase()) ||
        memoryActivity.detail.toLowerCase().includes(vs.searchQuery.trim().toLowerCase())
      ) {
        items.push(memoryActivity);
      }
      continue;
    }

    if (!props.showToolCalls && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    // Apply search filter if active
    if (vs.searchOpen && vs.searchQuery.trim() && !messageMatchesSearchQuery(msg, vs.searchQuery)) {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  for (let i = 0; i < props.queue.length; i++) {
    const queued = props.queue[i];
    items.push({
      kind: "queued-prompt",
      key: `queued:${queued.id}`,
      item: queued,
      position: i + 1,
    });
  }
  const liftedCanvasSources = tools
    .map((tool) => extractChatMessagePreview(tool))
    .filter((entry) => Boolean(entry)) as Array<{
    preview: Extract<NonNullable<ToolCard["preview"]>, { kind: "canvas" }>;
    text: string | null;
    timestamp: number | null;
  }>;
  for (const liftedCanvasSource of liftedCanvasSources) {
    const assistantIndex = findNearestAssistantMessageIndex(items, liftedCanvasSource.timestamp);
    if (assistantIndex == null) {
      continue;
    }
    const item = items[assistantIndex];
    if (!item || item.kind !== "message") {
      continue;
    }
    items[assistantIndex] = {
      ...item,
      message: appendCanvasBlockToAssistantMessage(
        item.message as Record<string, unknown>,
        liftedCanvasSource.preview,
        liftedCanvasSource.text,
      ),
    };
  }
  // Interleave stream segments and tool cards in order. Each segment
  // contains text that was streaming before the corresponding tool started.
  // This ensures correct visual ordering: text → tool → text → tool → ...
  const segments = props.streamSegments ?? [];
  const maxLen = Math.max(segments.length, tools.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < segments.length && segments[i].text.trim().length > 0) {
      items.push({
        kind: "stream" as const,
        key: `stream-seg:${props.sessionKey}:${i}`,
        text: segments[i].text,
        startedAt: segments[i].ts,
      });
    }
    if (i < tools.length && props.showToolCalls) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  const statusItem = buildRunStatusItem(props);
  if (statusItem) {
    items.push(statusItem);
  }
  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    const role = typeof m.role === "string" ? m.role : "unknown";
    const id = typeof m.id === "string" ? m.id : "";
    if (id) {
      return `tool:${role}:${toolCallId}:${id}`;
    }
    const messageId = typeof m.messageId === "string" ? m.messageId : "";
    if (messageId) {
      return `tool:${role}:${toolCallId}:${messageId}`;
    }
    const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
    if (timestamp != null) {
      return `tool:${role}:${toolCallId}:${timestamp}:${index}`;
    }
    return `tool:${role}:${toolCallId}:${index}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
