import type { SessionSelectorVisibility } from "../config/sessions/types.js";

export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export type SessionKeyChatType = "direct" | "group" | "channel" | "unknown";

/**
 * Parse agent-scoped session keys in a canonical, case-insensitive way.
 * Returned values are normalized to lowercase for stable comparisons/routing.
 */
export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  if (parts[0] !== "agent") {
    return null;
  }
  const agentId = parts[1]?.trim();
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

/**
 * Best-effort chat-type extraction from session keys across canonical and legacy formats.
 */
export function deriveSessionChatType(sessionKey: string | undefined | null): SessionKeyChatType {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }
  const scoped = parseAgentSessionKey(raw)?.rest ?? raw;
  const tokens = new Set(scoped.split(":").filter(Boolean));
  if (tokens.has("group")) {
    return "group";
  }
  if (tokens.has("channel")) {
    return "channel";
  }
  if (tokens.has("direct") || tokens.has("dm")) {
    return "direct";
  }
  // Legacy Discord keys can be shaped like:
  // discord:<accountId>:guild-<guildId>:channel-<channelId>
  if (/^discord:(?:[^:]+:)?guild-[^:]+:channel-[^:]+$/.test(scoped)) {
    return "channel";
  }
  return "unknown";
}

export function isCronRunSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return false;
  }
  return /^cron:[^:]+:run:[^:]+$/.test(parsed.rest);
}

export function isCronSessionKey(sessionKey: string | undefined | null): boolean {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return false;
  }
  return parsed.rest.toLowerCase().startsWith("cron:");
}

const DEFAULT_VISIBLE_SESSION_KEYS = new Set([
  "agent:main:main",
  "agent:chief:main",
  "agent:chief:telegram:direct:7756506076",
  "agent:builder:main",
  "agent:x-manager:main",
  "agent:web-researcher:main",
  "agent:writer:main",
]);

export type SessionSelectorVisibilitySource = {
  selectorVisibility?: SessionSelectorVisibility | null;
  spawnedBy?: string | null;
  parentSessionKey?: string | null;
  subagentRole?: string | null;
  subagentControlScope?: string | null;
  channel?: string | null;
  lastChannel?: string | null;
  origin?: {
    provider?: string | null;
    surface?: string | null;
  } | null;
};

function resolveSessionTransportChannel(
  sessionKey: string,
  source?: SessionSelectorVisibilitySource | null,
): string | null {
  const parsed = parseAgentSessionKey(sessionKey);
  const raw = parsed?.rest ?? sessionKey.trim().toLowerCase();
  const parts = raw.split(":").filter(Boolean);
  const fromKey =
    parts.length >= 2 && (parts[1] === "direct" || parts[1] === "group" || parts[1] === "channel")
      ? (parts[0] ?? null)
      : null;
  const fromOrigin = source?.origin?.provider?.trim().toLowerCase();
  const fromChannel = source?.channel?.trim().toLowerCase();
  const fromLastChannel = source?.lastChannel?.trim().toLowerCase();
  return fromKey || fromOrigin || fromChannel || fromLastChannel || null;
}

export function isDefaultVisibleOperationalSessionKey(
  sessionKey: string | undefined | null,
): boolean {
  const normalized = (sessionKey ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return DEFAULT_VISIBLE_SESSION_KEYS.has(normalized);
}

export function resolveSessionSelectorVisibility(
  sessionKey: string | undefined | null,
  source?: SessionSelectorVisibilitySource | null,
): SessionSelectorVisibility {
  const normalized = (sessionKey ?? "").trim().toLowerCase();
  const explicitVisibility = source?.selectorVisibility;
  if (explicitVisibility === "show" || explicitVisibility === "hide") {
    return explicitVisibility;
  }
  if (!normalized) {
    return "hide";
  }
  if (isDefaultVisibleOperationalSessionKey(normalized)) {
    return "show";
  }
  if (normalized === "global" || normalized === "unknown") {
    return "hide";
  }
  if (isCronSessionKey(normalized)) {
    return "hide";
  }
  if (isSubagentSessionKey(normalized) || isAcpSessionKey(normalized)) {
    return "hide";
  }
  if (
    source?.spawnedBy?.trim() ||
    source?.parentSessionKey?.trim() ||
    source?.subagentRole?.trim() ||
    source?.subagentControlScope?.trim()
  ) {
    return "hide";
  }

  const parsed = parseAgentSessionKey(normalized);
  if (parsed?.rest === "main") {
    return "show";
  }

  const chatType = deriveSessionChatType(normalized);
  if (chatType === "direct" || chatType === "group" || chatType === "channel") {
    const channel = resolveSessionTransportChannel(normalized, source);
    if (!channel || channel === "unknown" || channel === "webchat") {
      return "hide";
    }
    return "show";
  }

  const rootToken = normalized.split(":").filter(Boolean)[0] ?? "";
  if (rootToken === "webchat" || rootToken === "unknown") {
    return "hide";
  }

  return "hide";
}

export function isDefaultHiddenUiSessionKey(
  sessionKey: string | undefined | null,
  source?: SessionSelectorVisibilitySource | null,
): boolean {
  return resolveSessionSelectorVisibility(sessionKey, source) === "hide";
}

export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return false;
  }
  if (raw.toLowerCase().startsWith("subagent:")) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("subagent:"));
}

export function getSubagentDepth(sessionKey: string | undefined | null): number {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return 0;
  }
  return raw.split(":subagent:").length - 1;
}

export function isAcpSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return false;
  }
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("acp:")) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("acp:"));
}

const THREAD_SESSION_MARKERS = [":thread:", ":topic:"];

export function resolveThreadParentSessionKey(
  sessionKey: string | undefined | null,
): string | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  let idx = -1;
  for (const marker of THREAD_SESSION_MARKERS) {
    const candidate = normalized.lastIndexOf(marker);
    if (candidate > idx) {
      idx = candidate;
    }
  }
  if (idx <= 0) {
    return null;
  }
  const parent = raw.slice(0, idx).trim();
  return parent ? parent : null;
}
