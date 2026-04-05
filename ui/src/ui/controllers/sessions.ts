import {
  isCronSessionKey,
  isDefaultHiddenUiSessionKey,
} from "../../../../src/sessions/session-key-utils.js";
import { toNumber } from "../format.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import type { SessionsListResult } from "../types.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

export type SessionsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
};

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

type SessionSelectionState = SessionsState & {
  sessionKey?: string;
  settings?: UiSettings;
  hello?: { snapshot?: { sessionDefaults?: SessionDefaultsSnapshot } } | null;
  applySettings?: (next: UiSettings) => void;
};

function isVisibleByDefault(row: SessionsListResult["sessions"][number]): boolean {
  if (row.kind === "global" || row.kind === "unknown") {
    return false;
  }
  if (isCronSessionKey(row.key)) {
    return false;
  }
  return !isDefaultHiddenUiSessionKey(row.key, row);
}

function normalizeActiveSessionSelection(
  state: SessionSelectionState,
  result: SessionsListResult,
): void {
  const current = state.sessionKey?.trim();
  const settings = state.settings;
  const applySettings = state.applySettings;
  if (!current || !settings || typeof applySettings !== "function") {
    return;
  }

  const rows = result.sessions ?? [];
  const currentRow = rows.find((row) => row.key === current);
  const currentHidden =
    (currentRow && !isVisibleByDefault(currentRow)) ||
    (!currentRow && isDefaultHiddenUiSessionKey(current));
  if (!currentHidden) {
    return;
  }

  const defaults = state.hello?.snapshot?.sessionDefaults;
  const preferredVisible = [
    defaults?.mainSessionKey?.trim(),
    rows.find((row) => row.key === settings.lastActiveSessionKey.trim() && isVisibleByDefault(row))
      ?.key,
    rows.find((row) => row.key === settings.sessionKey.trim() && isVisibleByDefault(row))?.key,
    rows.find((row) => row.key === "agent:main:main" && isVisibleByDefault(row))?.key,
    rows.find((row) => row.key === "main" && isVisibleByDefault(row))?.key,
    rows.find((row) => isVisibleByDefault(row))?.key,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!preferredVisible || preferredVisible === current) {
    return;
  }

  state.sessionKey = preferredVisible;
  applySettings({
    ...settings,
    sessionKey: preferredVisible,
    lastActiveSessionKey: preferredVisible,
  });
}

export async function subscribeSessions(state: SessionsState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("sessions.subscribe", {});
  } catch (err) {
    state.sessionsError = String(err);
  }
}

export async function loadSessions(
  state: SessionsState,
  overrides?: {
    activeMinutes?: number;
    limit?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.sessionsLoading) {
    return;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const includeGlobal = overrides?.includeGlobal ?? state.sessionsIncludeGlobal;
    const includeUnknown = overrides?.includeUnknown ?? state.sessionsIncludeUnknown;
    const activeMinutes = overrides?.activeMinutes ?? toNumber(state.sessionsFilterActive, 0);
    const limit = overrides?.limit ?? toNumber(state.sessionsFilterLimit, 0);
    const params: Record<string, unknown> = {
      includeGlobal,
      includeUnknown,
    };
    if (activeMinutes > 0) {
      params.activeMinutes = activeMinutes;
    }
    if (limit > 0) {
      params.limit = limit;
    }
    const res = await state.client.request<SessionsListResult | undefined>("sessions.list", params);
    if (res) {
      state.sessionsResult = res;
      normalizeActiveSessionSelection(state as SessionSelectionState, res);
    }
  } catch (err) {
    if (isMissingOperatorReadScopeError(err)) {
      state.sessionsResult = null;
      state.sessionsError = formatMissingOperatorReadScopeMessage("sessions");
    } else {
      state.sessionsError = String(err);
    }
  } finally {
    state.sessionsLoading = false;
  }
}

export async function patchSession(
  state: SessionsState,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    fastMode?: boolean | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  const params: Record<string, unknown> = { key };
  if ("label" in patch) {
    params.label = patch.label;
  }
  if ("thinkingLevel" in patch) {
    params.thinkingLevel = patch.thinkingLevel;
  }
  if ("fastMode" in patch) {
    params.fastMode = patch.fastMode;
  }
  if ("verboseLevel" in patch) {
    params.verboseLevel = patch.verboseLevel;
  }
  if ("reasoningLevel" in patch) {
    params.reasoningLevel = patch.reasoningLevel;
  }
  try {
    await state.client.request("sessions.patch", params);
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}

export async function deleteSessionsAndRefresh(
  state: SessionsState,
  keys: string[],
): Promise<string[]> {
  if (!state.client || !state.connected || keys.length === 0) {
    return [];
  }
  if (state.sessionsLoading) {
    return [];
  }
  const noun = keys.length === 1 ? "session" : "sessions";
  const confirmed = window.confirm(
    `Delete ${keys.length} ${noun}?\n\nThis will delete the session entries and archive their transcripts.`,
  );
  if (!confirmed) {
    return [];
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  const deleted: string[] = [];
  const deleteErrors: string[] = [];
  try {
    for (const key of keys) {
      try {
        await state.client.request("sessions.delete", { key, deleteTranscript: true });
        deleted.push(key);
      } catch (err) {
        deleteErrors.push(String(err));
      }
    }
  } finally {
    state.sessionsLoading = false;
  }
  if (deleted.length > 0) {
    await loadSessions(state);
  }
  if (deleteErrors.length > 0) {
    state.sessionsError = deleteErrors.join("; ");
  }
  return deleted;
}
