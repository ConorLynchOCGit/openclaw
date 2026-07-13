/**
 * Session listing command.
 *
 * It loads one or more agent session stores, enriches rows with model/runtime
 * metadata, and emits JSON or fixed-width terminal tables.
 */
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import { isRich, theme } from "../../packages/terminal-core/src/theme.js";
import { readAcpSessionMetaForEntry } from "../acp/runtime/session-meta.js";
import { resolveModelAgentRuntimeMetadata } from "../agents/agent-runtime-metadata.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import { resolveRuntimePolicySessionKey } from "../auto-reply/reply/runtime-policy-session-key.js";
import { normalizeChatType } from "../channels/chat-type.js";
import { getRuntimeConfig } from "../config/config.js";
import { loadSessionStore, resolveSessionTotalTokens } from "../config/sessions.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { buildGatewaySessionDetailProjection } from "../gateway/session-detail.js";
import { resolveStoredSessionKeyForAgentStore } from "../gateway/session-store-key.js";
import {
  buildGatewaySessionRow,
  loadGatewaySessionRow,
  resolveGatewaySessionStoreTargetWithStore,
} from "../gateway/session-utils.js";
import type {
  GatewaySessionRow,
  SessionReadbackProvenance,
  SessionRunStatus,
} from "../gateway/session-utils.types.js";
import { info } from "../globals.js";
import { parseStrictPositiveInteger } from "../infra/parse-finite-number.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { type RuntimeEnv, writeRuntimeJson } from "../runtime.js";
import { classifySessionKind, type SessionKind } from "../sessions/classify-session-kind.js";
import { isAcpSessionKey } from "../sessions/session-key-utils.js";
import { createLazyImportLoader } from "../shared/lazy-promise.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import { resolveAgentRuntimeLabel } from "../status/agent-runtime-label.js";
import { resolveSessionStoreTargetsOrExit } from "./session-store-targets.js";
import {
  resolveSessionDisplayModelRef,
  resolveSessionDisplayDefaults,
} from "./sessions-display-model.js";
import {
  formatSessionAgeCell,
  formatSessionFlagsCell,
  formatSessionKeyCell,
  formatSessionModelCell,
  SESSION_AGE_PAD,
  SESSION_KEY_PAD,
  SESSION_MODEL_PAD,
  type SessionDisplayRow,
  toSessionDisplayRow,
} from "./sessions-table.js";

type SessionRow = SessionDisplayRow & {
  agentId: string;
  kind: SessionKind;
  agentRuntime: ReturnType<typeof resolveModelAgentRuntimeMetadata>;
  runtimeLabel: string;
  activityUpdatedAt: number | null;
  lastObservedActivityAt?: number | null;
  lastObservedActivitySource?: "own" | "direct-child" | "descendant";
  status?: SessionRunStatus | null;
  readbackProvenance?: SessionReadbackProvenance;
  /**
   * True only when the session has persisted ACP runtime metadata. Key-shape
   * alone is not sufficient because ACP bridge sessions (translator.ts) may
   * use ACP-shaped keys without ever writing `SessionAcpMeta` — those use the
   * normal configured model and must not be overlaid with the acpx sentinel.
   */
  acpRuntime: boolean;
};

const AGENT_PAD = 10;
const KIND_PAD = 11; // "spawn-child".length — longest kind label
const RUNTIME_PAD = 18;
const TOKENS_PAD = 20;
const DEFAULT_SESSIONS_LIMIT = 100;
const TOP_N_SELECTION_LIMIT = 200;
const contextLookupRuntimeLoader = createLazyImportLoader(() => import("../agents/context.js"));

const formatKTokens = (value: number) => `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;

function findSessionStoreMatch(
  store: Record<string, SessionEntry>,
  keys: readonly string[],
): { key: string; entry: SessionEntry } | undefined {
  let freshest: { key: string; entry: SessionEntry } | undefined;
  const candidates = new Set(keys.filter((key) => key.trim()));
  for (const key of keys) {
    const lower = key.toLowerCase();
    for (const [storeKey, entry] of Object.entries(store)) {
      if (storeKey.toLowerCase() === lower) {
        candidates.add(storeKey);
      }
      if (typeof entry.sessionId === "string" && entry.sessionId.toLowerCase() === lower) {
        candidates.add(storeKey);
      }
    }
  }
  for (const key of candidates) {
    const entry = store[key];
    if (!entry) {
      continue;
    }
    if (!freshest || (entry.updatedAt ?? 0) > (freshest.entry.updatedAt ?? 0)) {
      freshest = { key, entry };
    }
  }
  return freshest;
}

function resolveSessionShowTarget(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  store?: string;
  agent?: string;
}): {
  agentId: string;
  storePath: string;
  store: Record<string, SessionEntry>;
  storeKeys: string[];
} {
  if (params.store) {
    const store = loadSessionStore(params.store, { skipCache: true });
    const parsedAgentId = parseAgentSessionKey(params.sessionKey)?.agentId;
    return {
      agentId: params.agent ?? parsedAgentId ?? "main",
      storePath: params.store,
      store,
      storeKeys: [params.sessionKey],
    };
  }
  const target = resolveGatewaySessionStoreTargetWithStore({
    cfg: params.cfg,
    key: params.sessionKey,
    agentId: params.agent,
  });
  return {
    agentId: target.agentId,
    storePath: target.storePath,
    store: target.store,
    storeKeys: target.storeKeys,
  };
}

/**
 * Inline ACP model overlay — catalog #20.
 *
 * When a session ran via the ACP control plane (e.g. key =
 * `agent:copilot:acp:<uuid>` AND ACP metadata is persisted), the agent's
 * configured model is irrelevant: the actual model is selected inside the ACP
 * child process. We overlay a sentinel `{ provider: "acpx",
 * model: "<agentId>-acp" }` so the listing clearly signals "ACP runtime" and
 * does not mislead operators into thinking the configured model ran.
 *
 * Key-shape alone is not sufficient: ACP bridge sessions (translator.ts) also
 * use ACP-shaped keys but never persist `SessionAcpMeta` — they run the
 * normal configured model and must not receive the sentinel. The `acpRuntime`
 * flag is set at row-construction time from SQLite metadata.
 *
 * The resolver (`resolveSessionDisplayModelRef`) stays pure; this overlay
 * applies only at the emit sites in this file.
 *
 * NOTE: Will be replaced by a shared `applyAcpModelOverlay` helper from
 * `src/agents/acp-runtime-overlay.ts` once PR 2 lands.
 */
function applyAcpModelOverlayIfNeeded(
  modelRef: { provider: string; model: string },
  sessionKey: string,
  acpRuntime: boolean,
): { provider: string; model: string } {
  if (!acpRuntime || !isAcpSessionKey(sessionKey)) {
    return modelRef;
  }
  const agentId = parseAgentSessionKey(sessionKey)?.agentId ?? "acp";
  return { provider: "acpx", model: `${agentId}-acp` };
}

function sessionRowActivityUpdatedAt(row: Pick<SessionRow, "activityUpdatedAt" | "updatedAt">) {
  return row.activityUpdatedAt ?? row.updatedAt ?? 0;
}

function compareSessionRowsByUpdatedAt(a: SessionRow, b: SessionRow): number {
  return sessionRowActivityUpdatedAt(b) - sessionRowActivityUpdatedAt(a);
}

function selectNewestSessionRows(rows: SessionRow[], limit: number | undefined): SessionRow[] {
  if (limit === undefined) {
    return rows.toSorted(compareSessionRowsByUpdatedAt);
  }
  if (limit > TOP_N_SELECTION_LIMIT) {
    return rows.toSorted(compareSessionRowsByUpdatedAt).slice(0, limit);
  }
  // For small limits, keep only the top N rows without sorting the full store;
  // large limits use the simpler full sort above.
  const selected: SessionRow[] = [];
  for (const row of rows) {
    const insertAt = selected.findIndex(
      (candidate) => compareSessionRowsByUpdatedAt(row, candidate) < 0,
    );
    if (insertAt >= 0) {
      selected.splice(insertAt, 0, row);
      if (selected.length > limit) {
        selected.pop();
      }
    } else if (selected.length < limit) {
      selected.push(row);
    }
  }
  return selected;
}

function parseSessionsLimit(value: string | number | undefined): number | undefined | null {
  if (value === undefined) {
    return DEFAULT_SESSIONS_LIMIT;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === "all") {
      return undefined;
    }
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    return parseStrictPositiveInteger(trimmed) ?? null;
  }
  return Number.isInteger(value) && value > 0 ? value : null;
}

const colorByPct = (label: string, pct: number | null, rich: boolean) => {
  if (!rich || pct === null) {
    return label;
  }
  if (pct >= 95) {
    return theme.error(label);
  }
  if (pct >= 80) {
    return theme.warn(label);
  }
  if (pct >= 60) {
    return theme.success(label);
  }
  return theme.muted(label);
};

const formatTokensCell = (
  total: number | undefined,
  contextTokens: number | null,
  rich: boolean,
) => {
  if (total === undefined) {
    const ctxLabel = contextTokens ? formatKTokens(contextTokens) : "?";
    const label = `unknown/${ctxLabel} (?%)`;
    return rich ? theme.muted(label.padEnd(TOKENS_PAD)) : label.padEnd(TOKENS_PAD);
  }
  const totalLabel = formatKTokens(total);
  const ctxLabel = contextTokens ? formatKTokens(contextTokens) : "?";
  const pct = contextTokens ? Math.min(999, Math.round((total / contextTokens) * 100)) : null;
  const label = `${totalLabel}/${ctxLabel} (${pct ?? "?"}%)`;
  const padded = label.padEnd(TOKENS_PAD);
  return colorByPct(padded, pct, rich);
};

async function lookupContextTokensForDisplay(model: string): Promise<number | undefined> {
  const { lookupContextTokens } = await contextLookupRuntimeLoader.load();
  return lookupContextTokens(model, { allowAsyncLoad: false });
}

const formatKindCell = (kind: SessionRow["kind"], rich: boolean) => {
  const label = kind.padEnd(KIND_PAD);
  if (!rich) {
    return label;
  }
  if (kind === "group") {
    return theme.accentBright(label);
  }
  if (kind === "global") {
    return theme.warn(label);
  }
  if (kind === "direct") {
    return theme.accent(label);
  }
  return theme.muted(label);
};

function resolveSessionRuntimeLabel(params: {
  cfg: OpenClawConfig;
  entry: SessionEntry;
  agentRuntime: ReturnType<typeof resolveModelAgentRuntimeMetadata>;
  modelProvider: string;
  model: string;
  agentId: string;
  sessionKey: string;
}): string {
  const id = normalizeOptionalLowercaseString(params.agentRuntime.id);
  const resolvedHarness = id && id !== "openclaw" && id !== "auto" ? id : undefined;
  return resolveAgentRuntimeLabel({
    config: params.cfg,
    sessionEntry: params.entry,
    resolvedHarness,
    fallbackProvider: params.modelProvider,
  });
}

function formatRuntimeCell(runtimeLabel: string, rich: boolean): string {
  const label = runtimeLabel.padEnd(RUNTIME_PAD);
  return rich ? theme.info(label) : label;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 1)}...`;
}

function formatSessionActiveProgress(progress: ReadbackProgressProjection | undefined): string {
  if (!progress) {
    return "n/a";
  }
  const parts = [
    progress.source,
    progress.currentPhase ? `phase=${progress.currentPhase}` : undefined,
    progress.activeLabel,
    progress.sourceEventType,
    progress.sourceEventSeq !== undefined ? `seq=${progress.sourceEventSeq}` : undefined,
    progress.elapsedMs !== undefined && progress.elapsedMs !== null
      ? `elapsedMs=${progress.elapsedMs}`
      : undefined,
    progress.durationMs !== undefined && progress.durationMs !== null
      ? `durationMs=${progress.durationMs}`
      : undefined,
    progress.childRole ? `childRole=${progress.childRole}` : undefined,
    progress.childAgentPath
      ? `childAgentPath=${truncate(progress.childAgentPath, 120)}`
      : undefined,
    progress.childPhase ? `childPhase=${progress.childPhase}` : undefined,
    progress.spawnReason ? `spawnReason=${truncate(progress.spawnReason, 120)}` : undefined,
    progress.toolName ? `tool=${progress.toolName}` : undefined,
    progress.command ? `command=${truncate(progress.command, 120)}` : undefined,
    progress.exitCode !== undefined && progress.exitCode !== null
      ? `exitCode=${progress.exitCode}`
      : undefined,
    progress.validationClass ? `validation=${progress.validationClass}` : undefined,
    progress.outputSummary ? `output=${truncate(progress.outputSummary, 120)}` : undefined,
    progress.repairAction ? `repair=${truncate(progress.repairAction, 120)}` : undefined,
    progress.note ? `note=${truncate(progress.note, 120)}` : undefined,
    progress.pointer
      ? `pointer=${progress.pointer.kind}:${truncate(progress.pointer.ref, 120)}`
      : undefined,
  ];
  return parts.filter(Boolean).join(" ");
}

function toJsonSessionRow(row: SessionRow): Omit<SessionRow, "runtimeLabel"> {
  const { runtimeLabel, ...jsonRow } = row;
  void runtimeLabel;
  return jsonRow;
}

function stripChannelRecipientPrefix(
  value: string | undefined,
  channel: string | undefined,
): string | undefined {
  const raw = normalizeOptionalString(value);
  const normalizedChannel = normalizeOptionalLowercaseString(channel);
  if (!raw || !normalizedChannel) {
    return raw;
  }
  const prefix = `${normalizedChannel}:`;
  if (!raw.toLowerCase().startsWith(prefix)) {
    return raw;
  }
  const stripped = raw.slice(prefix.length);
  const topicMarkerIndex = stripped.toLowerCase().indexOf(":topic:");
  // Topic suffixes are routing detail, not the peer id used by runtime-policy
  // session-key display.
  return topicMarkerIndex >= 0 ? stripped.slice(0, topicMarkerIndex) : stripped;
}

function resolveDisplayRuntimePolicySessionKey(params: {
  cfg: OpenClawConfig;
  key: string;
  entry: SessionEntry;
}): string | undefined {
  const { cfg, entry, key } = params;
  const origin = entry.origin;
  const deliveryContext = entry.deliveryContext;
  const chatType = normalizeChatType(origin?.chatType ?? entry.chatType);
  if (chatType !== "direct") {
    return undefined;
  }

  const channel = normalizeOptionalString(
    origin?.provider ??
      deliveryContext?.channel ??
      entry.lastChannel ??
      entry.channel ??
      origin?.surface,
  );
  const to = normalizeOptionalString(origin?.to ?? deliveryContext?.to ?? entry.lastTo);
  const from = normalizeOptionalString(origin?.from);
  const nativeDirectUserId = normalizeOptionalString(origin?.nativeDirectUserId);
  const peerId =
    nativeDirectUserId ??
    stripChannelRecipientPrefix(to, channel) ??
    stripChannelRecipientPrefix(from, channel);

  // Direct-message runtime policy can route by native user id, stripped
  // recipient, or sender; expose the derived key when it differs from the row.
  const runtimePolicySessionKey = resolveRuntimePolicySessionKey({
    cfg,
    sessionKey: key,
    ctx: {
      SessionKey: key,
      Provider: channel,
      Surface: normalizeOptionalString(origin?.surface),
      AccountId: normalizeOptionalString(
        origin?.accountId ?? deliveryContext?.accountId ?? entry.lastAccountId,
      ),
      ChatType: chatType,
      NativeDirectUserId: nativeDirectUserId,
      SenderId: peerId,
      OriginatingTo: to,
      From: from,
      To: to,
    },
  });

  return runtimePolicySessionKey && runtimePolicySessionKey !== key
    ? runtimePolicySessionKey
    : undefined;
}

function sessionEntryActivityUpdatedAt(entry: SessionEntry | undefined): number {
  if (!entry) {
    return 0;
  }
  return Math.max(entry.updatedAt ?? 0, entry.startedAt ?? 0, entry.endedAt ?? 0);
}

function buildLineageActivityUpdatedAtBySessionKey(
  store: Record<string, SessionEntry>,
): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(store)) {
    if (!entry) {
      continue;
    }
    for (const parentKey of [entry.spawnedBy, entry.parentSessionKey]) {
      const parent = normalizeOptionalString(parentKey);
      if (!parent || parent === key) {
        continue;
      }
      const children = childrenByParent.get(parent);
      if (children) {
        if (!children.includes(key)) {
          children.push(key);
        }
      } else {
        childrenByParent.set(parent, [key]);
      }
    }
  }

  const activity = new Map<string, number>();
  const resolveDescendantActivity = (key: string, seen = new Set<string>()): number => {
    if (seen.has(key)) {
      return 0;
    }
    seen.add(key);
    let latest = 0;
    for (const childKey of childrenByParent.get(key) ?? []) {
      latest = Math.max(
        latest,
        sessionEntryActivityUpdatedAt(store[childKey]),
        resolveDescendantActivity(childKey, seen),
      );
    }
    return latest;
  };

  for (const key of Object.keys(store)) {
    const latest = resolveDescendantActivity(key);
    if (latest > 0) {
      activity.set(key, latest);
    }
  }
  return activity;
}

/** Shows one stored conversation session. */
export async function sessionsShowCommand(
  opts: {
    sessionKey: string;
    json?: boolean;
    store?: string;
    agent?: string;
  },
  runtime: RuntimeEnv,
) {
  const cfg = getRuntimeConfig();
  const target = opts.store
    ? resolveSessionShowTarget({
        cfg,
        sessionKey: opts.sessionKey,
        store: opts.store,
        agent: opts.agent,
      })
    : undefined;
  const row = target
    ? (() => {
        const match = findSessionStoreMatch(target.store, target.storeKeys);
        if (!match) {
          return null;
        }
        return buildGatewaySessionRow({
          cfg,
          storePath: target.storePath,
          store: target.store,
          key: match.key,
          entry: match.entry,
          agentId: target.agentId,
          includeDerivedTitles: true,
          includeLastMessage: true,
        });
      })()
    : loadGatewaySessionRow(opts.sessionKey, {
        cfg,
        ...(opts.agent ? { agentId: opts.agent } : {}),
        includeDerivedTitles: true,
        includeLastMessage: true,
      });
  const agentId =
    row?.agentId ??
    target?.agentId ??
    opts.agent ??
    parseAgentSessionKey(row?.key ?? opts.sessionKey)?.agentId ??
    "main";
  if (!row) {
    runtime.error(`Session not found: ${opts.sessionKey}`);
    runtime.exit(1);
    return;
  }
  const detailResult = buildGatewaySessionDetailProjection({
    row,
    requestedSessionKey: opts.sessionKey,
    agentId,
    ...(target?.storePath ? { path: target.storePath } : {}),
  });
  if (!detailResult.ok) {
    if (opts.json) {
      writeRuntimeJson(runtime, detailResult.error);
    } else {
      runtime.error(`Session identity unavailable for ${opts.sessionKey}.`);
    }
    runtime.exit(1);
    return;
  }
  const readback = detailResult.detail;
  const selectedActiveProgress = readback.activeProgress ?? null;

  if (opts.json) {
    writeRuntimeJson(runtime, {
      ...(target?.storePath ? { path: target.storePath } : {}),
      ...readback,
    });
    return;
  }

  const lines = [
    "Session:",
    `key: ${row.key}`,
    `agentId: ${agentId}`,
    `kind: ${row.kind}`,
    `status: ${readback.finality.status ?? "n/a"}`,
    `model: ${row.modelProvider ?? "n/a"}/${row.model ?? "n/a"}`,
    `runtime: ${row.agentRuntime?.id ?? "n/a"}`,
    `updatedAt: ${row.updatedAt ? new Date(row.updatedAt).toISOString() : "n/a"}`,
    `startedAt: ${row.startedAt ? new Date(row.startedAt).toISOString() : "n/a"}`,
    `endedAt: ${row.endedAt ? new Date(row.endedAt).toISOString() : "n/a"}`,
    `activeProgress: ${formatSessionActiveProgress(selectedActiveProgress ?? undefined)}`,
    `childSessions: ${(row.childSessions ?? []).length}`,
    `laneVerdict: ${row.laneVerdict ?? "n/a"}`,
    `toolPlanes: openclaw=${row.promptContext?.openclawDynamicTools?.count ?? 0}; codex=${
      row.promptContext?.codexNativeWorkbench?.active === true
        ? (row.promptContext.codexNativeWorkbench.mode ?? "active")
        : "inactive"
    }`,
    `codexMcpServers: ${row.promptContext?.codexMcpServers?.names.join(", ") || "none"}`,
    `codexCustomAgents: ${row.promptContext?.codexCustomAgents?.names.join(", ") || "none"}`,
    `usage: ${formatSessionUsage(row.usage)}`,
    `codexTeamUsage: ${formatCodexTeamUsage(row.codexTeamUsage)}`,
  ];
  for (const line of lines) {
    runtime.log(line);
  }
  for (const child of row.codexNativeChildRuns ?? []) {
    runtime.log(formatCodexNativeChildRun(child));
  }
}

function formatSessionUsage(usage: GatewaySessionRow["usage"]): string {
  if (!usage) {
    return "n/a";
  }
  return [
    `state=${usage.state}`,
    `runBasis=${usage.run?.basis ?? "n/a"}`,
    `input=${usage.run?.inputTokens ?? "unavailable"}`,
    `output=${usage.run?.outputTokens ?? "unavailable"}`,
    `contextBasis=${usage.context?.basis ?? "n/a"}`,
    `prompt=${usage.context?.promptTokens ?? "unavailable"}`,
    `window=${usage.context?.windowTokens ?? "unavailable"}`,
    `fresh=${usage.context?.fresh ?? false}`,
  ].join(" ");
}

function formatCodexTeamUsage(usage: GatewaySessionRow["codexTeamUsage"]): string {
  if (!usage) {
    return "n/a";
  }
  return [
    `basis=${usage.basis}`,
    `state=${usage.state}`,
    `children=${usage.childCount}`,
    `total=${usage.totalTokens ?? "unavailable"}`,
  ].join(" ");
}

function formatCodexNativeChildRun(
  child: NonNullable<GatewaySessionRow["codexNativeChildRuns"]>[number],
): string {
  const objective = child.objective?.replace(/\s+/gu, " ").trim().slice(0, 160) || "n/a";
  const contribution =
    (child.terminalSummary ?? child.progressSummary)?.replace(/\s+/gu, " ").trim().slice(0, 160) ??
    "n/a";
  return [
    "codexChild:",
    `role=${child.role ?? "n/a"}`,
    `status=${child.terminalOutcome ?? child.status ?? "n/a"}`,
    `objective=${JSON.stringify(objective)}`,
    `contribution=${JSON.stringify(contribution)}`,
    `ref=${child.finalRef ?? child.childThreadId ?? "n/a"}`,
  ].join(" ");
}

/** Lists sessions across selected stores with optional JSON output. */
export async function sessionsCommand(
  opts: {
    json?: boolean;
    store?: string;
    active?: string;
    agent?: string;
    allAgents?: boolean;
    limit?: string | number;
  },
  runtime: RuntimeEnv,
) {
  const aggregateAgents = opts.allAgents === true;
  const cfg = getRuntimeConfig();
  const displayDefaults = resolveSessionDisplayDefaults(cfg);
  const configuredContextTokens = cfg.agents?.defaults?.contextTokens;
  const configContextTokens =
    configuredContextTokens ??
    (await lookupContextTokensForDisplay(displayDefaults.model)) ??
    DEFAULT_CONTEXT_TOKENS;
  const targets = resolveSessionStoreTargetsOrExit({
    cfg,
    opts: {
      store: opts.store,
      agent: opts.agent,
      allAgents: opts.allAgents,
    },
    runtime,
  });
  if (!targets) {
    return;
  }

  let activeMinutes: number | undefined;
  if (opts.active !== undefined) {
    const parsed = parseStrictPositiveInteger(opts.active);
    if (parsed === undefined) {
      runtime.error("--active must be a positive number of minutes, for example --active 30.");
      runtime.exit(1);
      return;
    }
    activeMinutes = parsed;
  }

  const limit = parseSessionsLimit(opts.limit);
  if (limit === null) {
    runtime.error('--limit must be a positive integer or "all", for example --limit 25.');
    runtime.exit(1);
    return;
  }

  const allRows = targets.flatMap((target) => {
    const store = loadSessionStore(target.storePath);
    const lineageActivityUpdatedAtBySessionKey = buildLineageActivityUpdatedAtBySessionKey(store);
    return Object.entries(store)
      .map(([key, entry]) => {
        const row = toSessionDisplayRow(key, entry);
        const lineageActivityUpdatedAt = lineageActivityUpdatedAtBySessionKey.get(row.key) ?? null;
        const agentId = parseAgentSessionKey(row.key)?.agentId ?? target.agentId;
        const gatewayRow = buildGatewaySessionRow({
          cfg,
          storePath: target.storePath,
          store,
          key,
          entry,
          agentId,
          lightweightListRow: true,
          skipTranscriptUsageFallback: true,
        });
        const observedActivityUpdatedAt = Math.max(
          lineageActivityUpdatedAt ?? 0,
          gatewayRow.lastObservedActivityAt ?? 0,
        );
        return {
          key,
          entry,
          row,
          agentId,
          gatewayRow,
          lineageActivityUpdatedAt,
          observedActivityUpdatedAt,
        };
      })
      .filter(({ entry, observedActivityUpdatedAt }) => {
        if (activeMinutes === undefined) {
          return true;
        }
        const updatedAt = Math.max(entry?.updatedAt ?? 0, observedActivityUpdatedAt ?? 0);
        return typeof updatedAt === "number" && Date.now() - updatedAt <= activeMinutes * 60_000;
      })
      .map(({ entry, row, agentId, gatewayRow, observedActivityUpdatedAt }) => {
        const acpSessionKey = resolveStoredSessionKeyForAgentStore({
          cfg,
          agentId,
          sessionKey: row.key,
        });
        const acpMeta = readAcpSessionMetaForEntry({
          sessionKey: acpSessionKey,
          entry,
        });
        const acpRuntime = acpMeta != null;
        // ACP rows need stored-key metadata before model/runtime resolution so
        // bridge sessions and true ACP runtime sessions display differently.
        const modelRef = applyAcpModelOverlayIfNeeded(
          resolveSessionDisplayModelRef(cfg, row),
          acpSessionKey,
          acpRuntime,
        );
        const agentRuntime = resolveModelAgentRuntimeMetadata({
          cfg,
          agentId,
          provider: modelRef.provider,
          model: modelRef.model,
          sessionKey: acpSessionKey,
          acpRuntime,
          acpBackend: acpMeta?.backend,
        });
        return Object.assign({}, row, {
          agentId,
          acpRuntime,
          agentRuntime,
          kind: classifySessionKind(row.key, store[row.key]),
          activityUpdatedAt:
            observedActivityUpdatedAt && observedActivityUpdatedAt > (row.updatedAt ?? 0)
              ? observedActivityUpdatedAt
              : null,
          lastObservedActivityAt: gatewayRow.lastObservedActivityAt,
          lastObservedActivitySource: gatewayRow.lastObservedActivitySource,
          status: gatewayRow.status,
          readbackProvenance: gatewayRow.readbackProvenance,
          runtimePolicySessionKey: resolveDisplayRuntimePolicySessionKey({
            cfg,
            key: row.key,
            entry,
          }),
          runtimeLabel: resolveSessionRuntimeLabel({
            cfg,
            entry,
            agentRuntime,
            modelProvider: modelRef.provider,
            model: modelRef.model,
            agentId,
            sessionKey: row.key,
          }),
        });
      });
  });
  const totalCount = allRows.length;
  const rows = selectNewestSessionRows(allRows, limit);
  const hasMore = rows.length < totalCount;

  if (opts.json) {
    const multi = targets.length > 1;
    const aggregate = aggregateAgents || multi;
    writeRuntimeJson(runtime, {
      path: aggregate ? null : (targets[0]?.storePath ?? null),
      stores: aggregate
        ? targets.map((target) => ({
            agentId: target.agentId,
            path: target.storePath,
          }))
        : undefined,
      allAgents: aggregateAgents ? true : undefined,
      count: rows.length,
      totalCount,
      limitApplied: limit ?? null,
      hasMore,
      activeMinutes: activeMinutes ?? null,
      sessions: await Promise.all(
        rows.map(async (row) => {
          const r = toJsonSessionRow(row);
          const modelRef = applyAcpModelOverlayIfNeeded(
            resolveSessionDisplayModelRef(cfg, r),
            resolveStoredSessionKeyForAgentStore({
              cfg,
              agentId: row.agentId,
              sessionKey: r.key,
            }),
            row.acpRuntime,
          );
          return {
            ...r,
            totalTokens: resolveSessionTotalTokens(r) ?? null,
            totalTokensFresh:
              typeof r.totalTokens === "number" ? r.totalTokensFresh !== false : false,
            // Prefer row-level context tokens, then config/model lookup, so JSON
            // mirrors the terminal percentage calculation.
            contextTokens:
              r.contextTokens ??
              configuredContextTokens ??
              (await lookupContextTokensForDisplay(modelRef.model)) ??
              configContextTokens ??
              null,
            modelProvider: modelRef.provider,
            model: modelRef.model,
          };
        }),
      ),
    });
    return;
  }

  if (targets.length === 1 && !aggregateAgents) {
    runtime.log(info(`Session store: ${targets[0]?.storePath}`));
  } else {
    runtime.log(
      info(`Session stores: ${targets.length} (${targets.map((t) => t.agentId).join(", ")})`),
    );
  }
  runtime.log(
    info(
      hasMore && limit !== undefined
        ? `Sessions listed: ${rows.length} of ${totalCount} (limit ${limit})`
        : `Sessions listed: ${rows.length}`,
    ),
  );
  if (activeMinutes) {
    runtime.log(info(`Filtered to last ${activeMinutes} minute(s)`));
  }
  if (rows.length === 0) {
    runtime.log("No sessions found.");
    return;
  }

  const rich = isRich();
  const showAgentColumn = aggregateAgents || targets.length > 1;
  const header = [
    ...(showAgentColumn ? ["Agent".padEnd(AGENT_PAD)] : []),
    "Kind".padEnd(KIND_PAD),
    "Key".padEnd(SESSION_KEY_PAD),
    "Age".padEnd(SESSION_AGE_PAD),
    "Model".padEnd(SESSION_MODEL_PAD),
    "Runtime".padEnd(RUNTIME_PAD),
    "Tokens (ctx %)".padEnd(TOKENS_PAD),
    "Flags",
  ].join(" ");

  runtime.log(rich ? theme.heading(header) : header);

  for (const row of rows) {
    const model = applyAcpModelOverlayIfNeeded(
      resolveSessionDisplayModelRef(cfg, row),
      resolveStoredSessionKeyForAgentStore({
        cfg,
        agentId: row.agentId,
        sessionKey: row.key,
      }),
      row.acpRuntime,
    ).model;
    const contextTokens =
      row.contextTokens ??
      configuredContextTokens ??
      (await lookupContextTokensForDisplay(model)) ??
      configContextTokens;
    const total = resolveSessionTotalTokens(row);

    const line = [
      ...(showAgentColumn
        ? [rich ? theme.accentBright(row.agentId.padEnd(AGENT_PAD)) : row.agentId.padEnd(AGENT_PAD)]
        : []),
      formatKindCell(row.kind, rich),
      formatSessionKeyCell(row.key, rich),
      formatSessionAgeCell(row.activityUpdatedAt ?? row.updatedAt, rich),
      formatSessionModelCell(model, rich),
      formatRuntimeCell(row.runtimeLabel, rich),
      formatTokensCell(total, contextTokens ?? null, rich),
      formatSessionFlagsCell(row, rich),
    ].join(" ");

    runtime.log(line.trimEnd());
  }
}

export const testing = {
  parseSessionsLimit,
} as const;
export { testing as __testing };
