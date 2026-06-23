/**
 * Subagent list builder.
 *
 * Combines live registry runs and persisted session metadata for sessions_list/subagents views.
 */
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { resolveSubagentLabel, sortSubagentRuns } from "../auto-reply/reply/subagents-utils.js";
import { resolveStorePath } from "../config/sessions/paths.js";
import { loadSessionStore } from "../config/sessions/store-load.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { parseAgentSessionKey, type ParsedAgentSessionKey } from "../routing/session-key.js";
import {
  formatDurationCompact,
  formatTokenUsageDisplay,
  resolveTotalTokens,
  truncateLine,
} from "../shared/subagents-format.js";
import { resolveModelDisplayName, resolveModelDisplayRef } from "./model-selection-display.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import {
  countActiveDescendantRunsFromRuns,
  countPendingDescendantRunsFromRuns,
} from "./subagent-registry-queries.js";
import {
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
} from "./subagent-registry-read.js";
import { getSubagentRunsSnapshotForRead } from "./subagent-registry-state.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import {
  hasSubagentRunEnded,
  isLiveUnendedSubagentRun,
  shouldKeepSubagentRunChildLink,
} from "./subagent-run-liveness.js";

type SubagentListItem = {
  index: number;
  line: string;
  runId: string;
  sessionKey: string;
  taskName?: string;
  label: string;
  task: string;
  status: string;
  pendingDescendants: number;
  runtime: string;
  runtimeMs: number;
  childSessions?: string[];
  model?: string;
  totalTokens?: number;
  startedAt?: number;
  endedAt?: number;
  completion?: SubagentListCompletion;
};

type SubagentListCompletion = {
  status: "complete" | "partial" | "failed" | "degraded";
  resultText?: string;
  resultPreview?: string;
  fullResultRef?: string;
  resultArtifactRefs?: string[];
  deliveryStatus?: string;
  delivered?: boolean;
  capturedAt?: number;
};

type BuiltSubagentList = {
  total: number;
  active: SubagentListItem[];
  recent: SubagentListItem[];
  text: string;
};

type SessionEntryResolution = {
  storePath: string;
  entry: SessionEntry | undefined;
};

function resolveStorePathForKey(cfg: OpenClawConfig, parsed?: ParsedAgentSessionKey | null) {
  return resolveStorePath(cfg.session?.store, {
    agentId: parsed?.agentId,
  });
}

/** Resolve persisted session metadata for a session key, caching per store path. */
export function resolveSessionEntryForKey(params: {
  cfg: OpenClawConfig;
  key: string;
  cache: Map<string, Record<string, SessionEntry>>;
}): SessionEntryResolution {
  const parsed = parseAgentSessionKey(params.key);
  const storePath = resolveStorePathForKey(params.cfg, parsed);
  let store = params.cache.get(storePath);
  if (!store) {
    store = loadSessionStore(storePath);
    params.cache.set(storePath, store);
  }
  return {
    storePath,
    entry: store[params.key],
  };
}

/** Build child-session indexes from the latest run associated with each child key. */
export function buildLatestSubagentRunIndex(
  runs: Map<string, SubagentRunRecord>,
  options?: { now?: number },
) {
  const now = options?.now ?? Date.now();
  const latestByChildSessionKey = new Map<string, SubagentRunRecord>();
  for (const entry of runs.values()) {
    const childSessionKey = entry.childSessionKey?.trim();
    if (!childSessionKey) {
      continue;
    }
    const existing = latestByChildSessionKey.get(childSessionKey);
    if (!existing || entry.createdAt > existing.createdAt) {
      latestByChildSessionKey.set(childSessionKey, entry);
    }
  }

  const childSessionsByController = new Map<string, string[]>();
  for (const [childSessionKey, entry] of latestByChildSessionKey.entries()) {
    const controllerSessionKey =
      entry.controllerSessionKey?.trim() || entry.requesterSessionKey?.trim();
    if (!controllerSessionKey) {
      continue;
    }
    if (
      !shouldKeepSubagentRunChildLink(entry, {
        activeDescendants: countActiveDescendantRunsFromRuns(runs, childSessionKey),
        now,
      })
    ) {
      // Completed child links age out unless active descendants still depend on
      // the controller relationship.
      continue;
    }
    const existing = childSessionsByController.get(controllerSessionKey);
    if (existing) {
      existing.push(childSessionKey);
      continue;
    }
    childSessionsByController.set(controllerSessionKey, [childSessionKey]);
  }
  for (const [controllerSessionKey, childSessions] of childSessionsByController) {
    childSessionsByController.set(controllerSessionKey, childSessions.toSorted());
  }

  return {
    latestByChildSessionKey,
    childSessionsByController,
  };
}

/** Create a cached descendant counter for repeated list rendering checks. */
export function createPendingDescendantCounter(runsSnapshot?: Map<string, SubagentRunRecord>) {
  const pendingDescendantCache = new Map<string, number>();
  return (sessionKey: string) => {
    if (pendingDescendantCache.has(sessionKey)) {
      return pendingDescendantCache.get(sessionKey) ?? 0;
    }
    const snapshot = runsSnapshot ?? getSubagentRunsSnapshotForRead(subagentRuns);
    const pending = Math.max(0, countPendingDescendantRunsFromRuns(snapshot, sessionKey));
    pendingDescendantCache.set(sessionKey, pending);
    return pending;
  };
}

/** Return whether a run should be shown in the active subagent section. */
export function isActiveSubagentRun(
  entry: SubagentRunRecord,
  pendingDescendantCount: (sessionKey: string) => number,
) {
  return isLiveUnendedSubagentRun(entry) || pendingDescendantCount(entry.childSessionKey) > 0;
}

function resolveRunStatus(entry: SubagentRunRecord, options?: { pendingDescendants?: number }) {
  const pendingDescendants = Math.max(0, options?.pendingDescendants ?? 0);
  if (pendingDescendants > 0) {
    const childLabel = pendingDescendants === 1 ? "child" : "children";
    return `active (waiting on ${pendingDescendants} ${childLabel})`;
  }
  if (!hasSubagentRunEnded(entry)) {
    return "running";
  }
  const status = entry.outcome?.status ?? "done";
  if (status === "ok") {
    return "done";
  }
  if (status === "error") {
    return "failed";
  }
  return status;
}

function normalizeOptionalText(value?: string | null) {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizeOptionalString(value?: string) {
  const text = value?.trim();
  return text ? text : undefined;
}

function dedupeStrings(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = normalizeOptionalString(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    out.push(text);
  }
  return out;
}

function resolveCompletionResultText(entry: SubagentRunRecord) {
  return (
    normalizeOptionalText(entry.completion?.resultText) ??
    normalizeOptionalText(entry.completion?.fallbackResultText) ??
    normalizeOptionalText(entry.delivery?.payload?.frozenResultText) ??
    normalizeOptionalText(entry.delivery?.payload?.fallbackFrozenResultText)
  );
}

function resolveCompletionCapturedAt(entry: SubagentRunRecord) {
  return entry.completion?.capturedAt ?? entry.completion?.fallbackCapturedAt;
}

function resolveCompletionFullResultRef(entry: SubagentRunRecord) {
  return (
    normalizeOptionalString(entry.completion?.fullResultRef) ??
    normalizeOptionalString(entry.delivery?.payload?.fullResultRef)
  );
}

function resolveCompletionArtifactRefs(entry: SubagentRunRecord) {
  return dedupeStrings([
    ...(entry.completion?.resultArtifactRefs ?? []),
    ...(entry.delivery?.payload?.resultArtifactRefs ?? []),
  ]);
}

function resolveCompletionStatus(entry: SubagentRunRecord, resultText?: string) {
  const outcomeStatus = entry.outcome?.status;
  if (outcomeStatus === "ok") {
    return "complete" as const;
  }
  if (outcomeStatus === "error") {
    return resultText ? ("partial" as const) : ("failed" as const);
  }
  if (outcomeStatus === "timeout") {
    return resultText ? ("partial" as const) : ("degraded" as const);
  }
  return resultText ? ("partial" as const) : ("degraded" as const);
}

function buildCompletionView(entry: SubagentRunRecord): SubagentListCompletion | undefined {
  const resultText = resolveCompletionResultText(entry);
  const fullResultRef = resolveCompletionFullResultRef(entry);
  const resultArtifactRefs = resolveCompletionArtifactRefs(entry);
  const deliveryStatus = entry.delivery?.status;
  const hasCompletionSignal =
    Boolean(resultText) ||
    Boolean(fullResultRef) ||
    resultArtifactRefs.length > 0 ||
    Boolean(entry.completion) ||
    Boolean(deliveryStatus) ||
    hasSubagentRunEnded(entry);
  if (!hasCompletionSignal) {
    return undefined;
  }
  const capturedAt = resolveCompletionCapturedAt(entry);
  const view: SubagentListCompletion = {
    status: resolveCompletionStatus(entry, resultText),
    ...(resultText
      ? {
          resultText,
          resultPreview: truncateLine(resultText.replace(/\s+/g, " "), 240),
        }
      : {}),
    ...(fullResultRef ? { fullResultRef } : {}),
    ...(resultArtifactRefs.length > 0 ? { resultArtifactRefs } : {}),
    ...(deliveryStatus ? { deliveryStatus } : {}),
    ...(deliveryStatus === "delivered" ? { delivered: true } : {}),
    ...(capturedAt ? { capturedAt } : {}),
  };
  return view;
}

function resolveModelRef(entry?: SessionEntry, fallbackModel?: string) {
  return resolveModelDisplayRef({
    runtimeProvider: entry?.modelProvider,
    runtimeModel: entry?.model,
    overrideProvider: entry?.providerOverride,
    overrideModel: entry?.modelOverride,
    fallbackModel,
  });
}

function resolveModelDisplay(entry?: SessionEntry, fallbackModel?: string) {
  return resolveModelDisplayName({
    runtimeProvider: entry?.modelProvider,
    runtimeModel: entry?.model,
    overrideProvider: entry?.providerOverride,
    overrideModel: entry?.modelOverride,
    fallbackModel,
  });
}

function buildListText(params: {
  active: Array<{ line: string }>;
  recent: Array<{ line: string }>;
  recentMinutes: number;
}) {
  const lines: string[] = [];
  lines.push("active subagents:");
  if (params.active.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...params.active.map((entry) => entry.line));
  }
  lines.push("");
  lines.push(`recent (last ${params.recentMinutes}m):`);
  if (params.recent.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...params.recent.map((entry) => entry.line));
  }
  return lines.join("\n");
}

/** Build structured and text views for active and recent subagent runs. */
export function buildSubagentList(params: {
  cfg: OpenClawConfig;
  runs: SubagentRunRecord[];
  recentMinutes: number;
  taskMaxChars?: number;
}): BuiltSubagentList {
  const now = Date.now();
  const recentCutoff = now - params.recentMinutes * 60_000;
  const dedupedRuns: SubagentRunRecord[] = [];
  const seenChildSessionKeys = new Set<string>();
  for (const entry of sortSubagentRuns(params.runs)) {
    if (seenChildSessionKeys.has(entry.childSessionKey)) {
      continue;
    }
    // Multiple records can point at one child session after steering or retry;
    // the sorted first entry is the display authority.
    seenChildSessionKeys.add(entry.childSessionKey);
    dedupedRuns.push(entry);
  }
  const cache = new Map<string, Record<string, SessionEntry>>();
  const snapshot = getSubagentRunsSnapshotForRead(subagentRuns);
  const { childSessionsByController } = buildLatestSubagentRunIndex(snapshot);
  const pendingDescendantCount = createPendingDescendantCounter(snapshot);
  let index = 1;
  const buildListEntry = (entry: SubagentRunRecord, runtimeMs: number) => {
    const sessionEntry = resolveSessionEntryForKey({
      cfg: params.cfg,
      key: entry.childSessionKey,
      cache,
    }).entry;
    const totalTokens = resolveTotalTokens(sessionEntry);
    const usageText = formatTokenUsageDisplay(sessionEntry);
    const pendingDescendants = pendingDescendantCount(entry.childSessionKey);
    const status = resolveRunStatus(entry, {
      pendingDescendants,
    });
    const childSessions = childSessionsByController.get(entry.childSessionKey) ?? [];
    const completion = buildCompletionView(entry);
    const runtime = formatDurationCompact(runtimeMs) ?? "n/a";
    const label = truncateLine(resolveSubagentLabel(entry), 48);
    const task = truncateLine(entry.task.trim(), params.taskMaxChars ?? 72);
    const taskName = entry.taskName?.trim();
    const taskNamePrefix = taskName ? `${taskName}: ` : "";
    const line = `${index}. ${taskNamePrefix}${label} (${resolveModelDisplay(sessionEntry, entry.model)}, ${runtime}${usageText ? `, ${usageText}` : ""}) ${status}${normalizeLowercaseStringOrEmpty(task) !== normalizeLowercaseStringOrEmpty(label) ? ` - ${task}` : ""}`;
    const view: SubagentListItem = {
      index,
      line,
      runId: entry.runId,
      sessionKey: entry.childSessionKey,
      ...(taskName ? { taskName } : {}),
      label,
      task,
      status,
      pendingDescendants,
      runtime,
      runtimeMs,
      ...(childSessions.length > 0 ? { childSessions } : {}),
      ...(completion ? { completion } : {}),
      model: resolveModelRef(sessionEntry, entry.model),
      totalTokens,
      startedAt: getSubagentSessionStartedAt(entry),
      ...(entry.endedAt ? { endedAt: entry.endedAt } : {}),
    };
    index += 1;
    return view;
  };
  const active = dedupedRuns
    .filter((entry) => isActiveSubagentRun(entry, pendingDescendantCount))
    .map((entry) => buildListEntry(entry, getSubagentSessionRuntimeMs(entry, now) ?? 0));
  const recent = dedupedRuns
    .filter(
      (entry) =>
        !isActiveSubagentRun(entry, pendingDescendantCount) &&
        Boolean(entry.endedAt) &&
        (entry.endedAt ?? 0) >= recentCutoff,
    )
    .map((entry) =>
      buildListEntry(entry, getSubagentSessionRuntimeMs(entry, entry.endedAt ?? now) ?? 0),
    );
  return {
    total: dedupedRuns.length,
    active,
    recent,
    text: buildListText({ active, recent, recentMinutes: params.recentMinutes }),
  };
}
