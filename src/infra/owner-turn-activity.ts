import { resolveGlobalSingleton } from "../shared/global-singleton.js";

export const OWNER_TURN_ACTIVITY_DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export type OwnerTurnActivityRecord = {
  sessionKey: string;
  baseSessionKey: string;
  runId: string;
  source: "chat_send" | "execution_submit" | "test";
  reason: string;
  startedAtMs: number;
  expiresAtMs: number;
};

type OwnerTurnActivityState = {
  bySessionKey: Map<string, OwnerTurnActivityRecord>;
  byRunId: Map<string, OwnerTurnActivityRecord>;
};

const OWNER_TURN_ACTIVITY_STATE_KEY = Symbol.for("openclaw.ownerTurnActivityState");

function getState(): OwnerTurnActivityState {
  return resolveGlobalSingleton<OwnerTurnActivityState>(OWNER_TURN_ACTIVITY_STATE_KEY, () => ({
    bySessionKey: new Map(),
    byRunId: new Map(),
  }));
}

function normalizeKey(value: string): string {
  return value.trim();
}

export function resolveOwnerTurnBaseSessionKey(sessionKey: string): string {
  return normalizeKey(sessionKey).replace(/(?::heartbeat)+$/u, "");
}

function pruneExpired(nowMs: number): void {
  const state = getState();
  for (const [runId, record] of state.byRunId.entries()) {
    if (record.expiresAtMs > nowMs) {
      continue;
    }
    state.byRunId.delete(runId);
    const current = state.bySessionKey.get(record.sessionKey);
    if (current?.runId === runId) {
      state.bySessionKey.delete(record.sessionKey);
    }
    const baseCurrent = state.bySessionKey.get(record.baseSessionKey);
    if (baseCurrent?.runId === runId) {
      state.bySessionKey.delete(record.baseSessionKey);
    }
  }
}

export function markOwnerTurnActive(params: {
  sessionKey: string;
  runId: string;
  source?: OwnerTurnActivityRecord["source"];
  reason?: string;
  nowMs?: number;
  ttlMs?: number;
}): OwnerTurnActivityRecord {
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = params.ttlMs ?? OWNER_TURN_ACTIVITY_DEFAULT_TTL_MS;
  const sessionKey = normalizeKey(params.sessionKey);
  const record: OwnerTurnActivityRecord = {
    sessionKey,
    baseSessionKey: resolveOwnerTurnBaseSessionKey(sessionKey),
    runId: params.runId,
    source: params.source ?? "chat_send",
    reason: params.reason ?? "owner_turn_in_flight",
    startedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
  };
  const state = getState();
  pruneExpired(nowMs);
  state.byRunId.set(record.runId, record);
  state.bySessionKey.set(record.sessionKey, record);
  state.bySessionKey.set(record.baseSessionKey, record);
  return record;
}

export function clearOwnerTurnActivity(params: { runId?: string; sessionKey?: string }): boolean {
  const state = getState();
  const record =
    (params.runId ? state.byRunId.get(params.runId) : undefined) ??
    (params.sessionKey ? state.bySessionKey.get(normalizeKey(params.sessionKey)) : undefined) ??
    (params.sessionKey
      ? state.bySessionKey.get(resolveOwnerTurnBaseSessionKey(params.sessionKey))
      : undefined);
  if (!record) {
    return false;
  }
  state.byRunId.delete(record.runId);
  const current = state.bySessionKey.get(record.sessionKey);
  if (current?.runId === record.runId) {
    state.bySessionKey.delete(record.sessionKey);
  }
  const baseCurrent = state.bySessionKey.get(record.baseSessionKey);
  if (baseCurrent?.runId === record.runId) {
    state.bySessionKey.delete(record.baseSessionKey);
  }
  return true;
}

export function getActiveOwnerTurnForSession(
  sessionKey: string,
  nowMs = Date.now(),
): OwnerTurnActivityRecord | null {
  pruneExpired(nowMs);
  const state = getState();
  const normalized = normalizeKey(sessionKey);
  const record =
    state.bySessionKey.get(normalized) ??
    state.bySessionKey.get(resolveOwnerTurnBaseSessionKey(normalized)) ??
    null;
  if (!record || record.expiresAtMs <= nowMs) {
    return null;
  }
  return record;
}

export function isOwnerTurnActiveForSession(sessionKey: string, nowMs = Date.now()): boolean {
  return getActiveOwnerTurnForSession(sessionKey, nowMs) !== null;
}

export function resetOwnerTurnActivityForTest(): void {
  const state = getState();
  state.byRunId.clear();
  state.bySessionKey.clear();
}
