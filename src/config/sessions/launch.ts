import crypto from "node:crypto";
import { loadSessionStore, resolveSessionStoreEntry, updateSessionStore } from "./store.js";
import type {
  SessionEntry,
  SessionLaunchEvent,
  SessionLaunchRequiredSource,
  SessionLaunchResolvedLocation,
  SessionLaunchState,
  SessionLaunchToolCatalogEntry,
} from "./types.js";
import { mergeSessionEntry } from "./types.js";

export type SessionLaunchInput = {
  sessionKey: string;
  agentId: string;
  runId: string;
  nodeRunId?: string;
  parentSessionKey?: string | null;
  parentToolCallId?: string | null;
  admissionStatus: "accepted" | "blocked";
  blockerKind?: string | null;
  provider?: string;
  model?: string;
  cwd?: string;
  resolvedLocation?: SessionLaunchResolvedLocation;
  sourceIdentity?: string | null;
  workspaceIdentity?: string | null;
  reasoningLevel?: string;
  thinkingLevel?: string;
  promptHash?: string | null;
  submittedPromptHash?: string | null;
  promptHashMatched?: boolean | null;
  requiredSources?: readonly SessionLaunchRequiredSource[];
  toolCatalogRef?: string | null;
  effectiveToolNames?: readonly string[];
  toolCatalogSummary?: readonly SessionLaunchToolCatalogEntry[];
  allowedChildAgentIds?: readonly string[];
  blockers?: readonly string[];
  reasonCodes?: readonly string[];
};

export type SessionLaunchUpdateResult =
  | {
      persisted: true;
      sessionKey: string;
      launchRef: string;
      launchEventRef: string;
      launch: SessionLaunchState;
      event: SessionLaunchEvent;
    }
  | {
      persisted: false;
      sessionKey: string;
      launchRef: string;
      reason: "missing_session";
    };

const SESSION_LAUNCH_SCHEMA_VERSION = 1 as const;
const SESSION_LAUNCH_HISTORY_LIMIT = 20;

export function buildSessionLaunchRef(sessionKey: string): string {
  return `openclaw-session-launch://${encodeURIComponent(sessionKey.trim())}`;
}

export function buildSessionLaunchEventRef(params: {
  sessionKey: string;
  eventId: string;
}): string {
  return `${buildSessionLaunchRef(params.sessionKey)}/${encodeURIComponent(params.eventId.trim())}`;
}

function boundedStrings(values: readonly string[] | undefined, limit = 100): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
  ).slice(0, limit);
}

function normalizeRequiredSource(source: SessionLaunchRequiredSource): SessionLaunchRequiredSource {
  return {
    id: source.id.trim(),
    bytes: Math.max(0, Math.floor(source.bytes)),
    truncated: source.truncated,
    ...(Object.prototype.hasOwnProperty.call(source, "hash")
      ? { hash: source.hash?.trim() || null }
      : {}),
  };
}

function normalizeRequiredSources(
  sources: readonly SessionLaunchRequiredSource[] | undefined,
): SessionLaunchRequiredSource[] {
  return (sources ?? [])
    .map(normalizeRequiredSource)
    .filter((source) => source.id.length > 0)
    .slice(0, 100);
}

function normalizeToolCatalogEntry(
  entry: SessionLaunchToolCatalogEntry,
): SessionLaunchToolCatalogEntry {
  return {
    name: entry.name.trim(),
    descriptionHash: entry.descriptionHash.trim(),
    descriptionBytes: Math.max(0, Math.floor(entry.descriptionBytes)),
    parametersHash: entry.parametersHash.trim(),
    parametersBytes: Math.max(0, Math.floor(entry.parametersBytes)),
  };
}

function normalizeToolCatalogSummary(
  entries: readonly SessionLaunchToolCatalogEntry[] | undefined,
): SessionLaunchToolCatalogEntry[] {
  return (entries ?? [])
    .map(normalizeToolCatalogEntry)
    .filter(
      (entry) =>
        entry.name.length > 0 &&
        entry.descriptionHash.length > 0 &&
        entry.parametersHash.length > 0,
    )
    .slice(0, 100);
}

function normalizeResolvedLocation(
  location: SessionLaunchResolvedLocation | undefined,
): SessionLaunchResolvedLocation | undefined {
  if (!location) {
    return undefined;
  }
  const normalizeRoot = (
    root: SessionLaunchResolvedLocation["sourceRoot"],
  ): SessionLaunchResolvedLocation["sourceRoot"] | undefined => {
    if (!root) {
      return undefined;
    }
    const rootPath = root.path.trim();
    if (!rootPath) {
      return undefined;
    }
    return {
      path: rootPath,
      authorityClass: root.authorityClass,
      writable: root.writable,
    };
  };
  const resolved: SessionLaunchResolvedLocation = {
    ...(normalizeRoot(location.sourceRoot)
      ? { sourceRoot: normalizeRoot(location.sourceRoot) }
      : {}),
    ...(normalizeRoot(location.workspaceRoot)
      ? { workspaceRoot: normalizeRoot(location.workspaceRoot) }
      : {}),
    ...(normalizeRoot(location.stateRoot) ? { stateRoot: normalizeRoot(location.stateRoot) } : {}),
  };
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function normalizeExistingHistory(value: unknown): SessionLaunchEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is SessionLaunchEvent => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        record.type === "session.launch" &&
        typeof record.eventId === "string" &&
        typeof record.emittedAt === "number" &&
        typeof record.sessionKey === "string" &&
        typeof record.agentId === "string" &&
        typeof record.runId === "string"
      );
    })
    .slice(-SESSION_LAUNCH_HISTORY_LIMIT);
}

function isSessionLaunchState(value: unknown): value is SessionLaunchState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === SESSION_LAUNCH_SCHEMA_VERSION &&
    typeof record.sessionKey === "string" &&
    typeof record.updatedAt === "number" &&
    Boolean(record.latestEvent) &&
    Array.isArray(record.history)
  );
}

function buildLaunchEvent(params: SessionLaunchInput & { emittedAt: number }): SessionLaunchEvent {
  const sessionKey = params.sessionKey.trim();
  const agentId = params.agentId.trim();
  const runId = params.runId.trim();
  const requiredSources = normalizeRequiredSources(params.requiredSources);
  const effectiveToolNames = boundedStrings(params.effectiveToolNames);
  const toolCatalogSummary = normalizeToolCatalogSummary(params.toolCatalogSummary);
  const allowedChildAgentIds = boundedStrings(params.allowedChildAgentIds);
  const blockers = boundedStrings(params.blockers);
  const reasonCodes = boundedStrings(params.reasonCodes, 200);
  const resolvedLocation = normalizeResolvedLocation(params.resolvedLocation);
  const eventHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sessionKey,
        agentId,
        runId,
        parentSessionKey: params.parentSessionKey ?? null,
        parentToolCallId: params.parentToolCallId ?? null,
        emittedAt: params.emittedAt,
        admissionStatus: params.admissionStatus,
        blockerKind: params.blockerKind ?? null,
        promptHash: params.promptHash ?? null,
        submittedPromptHash: params.submittedPromptHash ?? null,
        resolvedLocation,
        sourceIdentity: params.sourceIdentity ?? null,
        workspaceIdentity: params.workspaceIdentity ?? null,
        requiredSources,
        effectiveToolNames,
        toolCatalogSummary,
        allowedChildAgentIds,
        blockers,
        reasonCodes,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    eventId: `session_launch_${eventHash}`,
    type: "session.launch",
    emittedAt: params.emittedAt,
    sessionKey,
    agentId,
    runId,
    ...(params.nodeRunId?.trim() ? { nodeRunId: params.nodeRunId.trim() } : {}),
    ...(params.parentSessionKey?.trim()
      ? { parentSessionKey: params.parentSessionKey.trim() }
      : {}),
    ...(params.parentToolCallId?.trim()
      ? { parentToolCallId: params.parentToolCallId.trim() }
      : {}),
    admissionStatus: params.admissionStatus,
    blockerKind: params.blockerKind ?? null,
    ...(params.provider?.trim() ? { provider: params.provider.trim() } : {}),
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    ...(params.cwd?.trim() ? { cwd: params.cwd.trim() } : {}),
    ...(resolvedLocation ? { resolvedLocation } : {}),
    ...(Object.prototype.hasOwnProperty.call(params, "sourceIdentity")
      ? { sourceIdentity: params.sourceIdentity?.trim() || null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(params, "workspaceIdentity")
      ? { workspaceIdentity: params.workspaceIdentity?.trim() || null }
      : {}),
    ...(params.reasoningLevel?.trim() ? { reasoningLevel: params.reasoningLevel.trim() } : {}),
    ...(params.thinkingLevel?.trim() ? { thinkingLevel: params.thinkingLevel.trim() } : {}),
    ...(Object.prototype.hasOwnProperty.call(params, "promptHash")
      ? { promptHash: params.promptHash?.trim() || null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(params, "submittedPromptHash")
      ? { submittedPromptHash: params.submittedPromptHash?.trim() || null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(params, "promptHashMatched")
      ? { promptHashMatched: params.promptHashMatched ?? null }
      : {}),
    requiredSources,
    toolCatalogRef: params.toolCatalogRef?.trim() || null,
    effectiveToolNames,
    ...(toolCatalogSummary.length > 0 ? { toolCatalogSummary } : {}),
    allowedChildAgentIds,
    blockers,
    reasonCodes,
  };
}

export function readSessionLaunch(params: {
  storePath: string;
  sessionKey: string;
}): SessionLaunchState | null {
  try {
    const store = loadSessionStore(params.storePath, { skipCache: true });
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
    const launch = resolved.existing?.launch;
    return isSessionLaunchState(launch) ? launch : null;
  } catch {
    return null;
  }
}

export async function updateSessionLaunch(params: {
  storePath: string;
  input: SessionLaunchInput;
  createIfMissing?: boolean;
  now?: number;
}): Promise<SessionLaunchUpdateResult> {
  const sessionKey = params.input.sessionKey.trim();
  const launchRef = buildSessionLaunchRef(sessionKey);
  const emittedAt = params.now ?? Date.now();
  const createIfMissing = params.createIfMissing ?? true;
  const event = buildLaunchEvent({ ...params.input, emittedAt });
  let launch: SessionLaunchState | null = null;
  const updated = await updateSessionStore(params.storePath, async (store) => {
    const resolved = resolveSessionStoreEntry({ store, sessionKey });
    const existing = resolved.existing;
    if (!existing && !createIfMissing) {
      return null;
    }
    const previousHistory = normalizeExistingHistory(existing?.launch?.history);
    launch = {
      schemaVersion: SESSION_LAUNCH_SCHEMA_VERSION,
      sessionKey,
      updatedAt: emittedAt,
      latestEvent: event,
      history: [...previousHistory, event].slice(-SESSION_LAUNCH_HISTORY_LIMIT),
    };
    const patch: Partial<SessionEntry> = {
      sessionId: existing?.sessionId ?? `launch_${event.eventId}`,
      updatedAt: emittedAt,
      launch,
    };
    const next = mergeSessionEntry(existing, patch);
    store[resolved.normalizedKey] = next;
    for (const legacyKey of resolved.legacyKeys) {
      delete store[legacyKey];
    }
    return next;
  });

  if (!updated || !launch) {
    return {
      persisted: false,
      sessionKey,
      launchRef,
      reason: "missing_session",
    };
  }

  return {
    persisted: true,
    sessionKey,
    launchRef,
    launchEventRef: buildSessionLaunchEventRef({ sessionKey, eventId: event.eventId }),
    launch,
    event,
  };
}
