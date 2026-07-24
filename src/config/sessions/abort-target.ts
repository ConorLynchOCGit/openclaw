import { formatErrorMessage } from "../../infra/errors.js";
import { resolveSessionStoreEntry } from "./store-entry.js";
import { loadSessionStore } from "./store-load.js";
import { updateSessionStore } from "./store.js";
import type { SessionEntry } from "./types.js";

export type SessionAbortTargetCutoff = {
  messageSid?: string;
  timestamp?: number;
};

export type SessionAbortTargetContext = {
  entry: SessionEntry;
  sessionKey: string;
};

export type SessionAbortTargetIdentity = SessionAbortTargetContext & {
  sessionId?: string;
};

export type SessionAbortTargetResult = SessionAbortTargetIdentity & {
  persisted: boolean;
  persistenceError?: string;
};

export type SessionAbortTargetScope = {
  agentId: string;
  sessionKey: string;
  storePath: string;
};

export function resolveSessionAbortTarget(
  scope: SessionAbortTargetScope,
): SessionAbortTargetIdentity | null {
  const store = loadSessionStore(scope.storePath);
  const resolved = resolveSessionStoreEntry({ store, sessionKey: scope.sessionKey });
  if (!resolved.existing) {
    return null;
  }
  return {
    entry: { ...resolved.existing },
    sessionId: resolved.existing.sessionId,
    sessionKey: resolved.normalizedKey,
  };
}

export async function markSessionAbortTarget(params: {
  resolveAbortCutoff?: (context: SessionAbortTargetContext) => SessionAbortTargetCutoff | undefined;
  scope: SessionAbortTargetScope;
  now?: () => number;
}): Promise<SessionAbortTargetResult | null> {
  let canPersistSingleEntry = false;
  let resolvedTarget: SessionAbortTargetResult | null = null;
  try {
    return await updateSessionStore(
      params.scope.storePath,
      (store) => {
        const resolved = resolveSessionStoreEntry({
          store,
          sessionKey: params.scope.sessionKey,
        });
        if (!resolved.existing) {
          return null;
        }
        const sessionKey = resolved.normalizedKey;
        resolvedTarget = {
          entry: { ...resolved.existing },
          persisted: false,
          sessionId: resolved.existing.sessionId,
          sessionKey,
        };
        const cutoff = params.resolveAbortCutoff?.({
          entry: { ...resolved.existing },
          sessionKey,
        });
        const entry = {
          ...resolved.existing,
          abortedLastRun: true,
          abortCutoffMessageSid: cutoff?.messageSid,
          abortCutoffTimestamp: cutoff?.timestamp,
          updatedAt: params.now?.() ?? Date.now(),
        };
        store[sessionKey] = entry;
        canPersistSingleEntry = resolved.legacyKeys.length === 0;
        for (const legacyKey of resolved.legacyKeys) {
          if (legacyKey !== sessionKey) {
            delete store[legacyKey];
          }
        }
        return {
          entry: { ...entry },
          persisted: true,
          sessionId: entry.sessionId,
          sessionKey,
        };
      },
      {
        resolveSingleEntryPersistence: (result) =>
          result && result.sessionKey && canPersistSingleEntry
            ? { sessionKey: result.sessionKey, entry: result.entry }
            : null,
        skipSaveWhenResult: (result) => result === null,
      },
    );
  } catch (error) {
    const fallbackTarget = resolvedTarget as unknown as SessionAbortTargetResult | null;
    if (fallbackTarget) {
      return {
        ...fallbackTarget,
        persistenceError: formatErrorMessage(error),
      };
    }
    throw error;
  }
}
