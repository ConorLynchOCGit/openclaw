/**
 * Read-only subagent registry accessors.
 *
 * Combines persisted snapshots with in-memory live runs for UI, announce, control, and recovery paths.
 */
import { getAgentRunContext } from "../infra/agent-events.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import {
  buildLatestSubagentRunReadIndexFromRuns,
  buildSubagentRunReadIndexFromRuns,
  countActiveDescendantRunsFromRuns,
  getSubagentRunByChildSessionKeyFromRuns,
  listDescendantRunsForRequesterFromRuns,
  listRunsForControllerFromRuns,
  type LatestSubagentRunReadIndex,
  type SubagentRunReadIndex,
} from "./subagent-registry-queries.js";
import {
  getSubagentRunsSnapshotForChildSession,
  getSubagentRunsSnapshotForController,
  getSubagentRunsSnapshotForRead,
  onSubagentRegistryPersisted,
} from "./subagent-registry-state.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { compareSubagentRunGeneration } from "./subagent-run-generation.js";

export {
  getSubagentSessionRuntimeMs,
  getSubagentSessionStartedAt,
  resolveSubagentSessionStatus,
} from "./subagent-session-metrics.js";

/** Builds a reusable read index from the current persisted and in-memory run state. */
export function buildSubagentRunReadIndex(now = Date.now()): SubagentRunReadIndex {
  return buildSubagentRunReadIndexFromRuns({
    runs: getSubagentRunsSnapshotForRead(subagentRuns),
    inMemoryRuns: subagentRuns.values(),
    now,
  });
}

/** Builds an O(1) latest-run lookup from one persisted and in-memory snapshot. */
export function buildLatestSubagentRunReadIndex(): LatestSubagentRunReadIndex {
  return buildLatestSubagentRunReadIndexFromRuns(getSubagentRunsSnapshotForRead(subagentRuns));
}

/** Lists runs controlled by a session key. */
export function listSubagentRunsForController(controllerSessionKey: string): SubagentRunRecord[] {
  return listRunsForControllerFromRuns(
    getSubagentRunsSnapshotForController(subagentRuns, controllerSessionKey),
    controllerSessionKey,
  );
}

/** Counts active descendant runs for a requester/session tree. */
export function countActiveDescendantRuns(rootSessionKey: string): number {
  return countActiveDescendantRunsFromRuns(
    getSubagentRunsSnapshotForRead(subagentRuns),
    rootSessionKey,
  );
}

/** Lists descendant runs under a requester/session tree. */
export function listDescendantRunsForRequester(rootSessionKey: string): SubagentRunRecord[] {
  return listDescendantRunsForRequesterFromRuns(
    getSubagentRunsSnapshotForRead(subagentRuns),
    rootSessionKey,
  );
}

/** Returns whether a registry entry still has a live agent run context. */
export function isSubagentRunLive(
  entry: Pick<SubagentRunRecord, "runId" | "endedAt"> | null | undefined,
): boolean {
  if (!entry || typeof entry.endedAt === "number") {
    return false;
  }
  return Boolean(getAgentRunContext(entry.runId));
}

/** Returns the run to display for a child session, using live memory before snapshot state. */
export function getSessionDisplaySubagentRunByChildSessionKey(
  childSessionKey: string,
): SubagentRunRecord | null {
  const key = childSessionKey.trim();
  if (!key) {
    return null;
  }

  let latestInMemoryActive: SubagentRunRecord | null = null;
  let latestInMemoryEnded: SubagentRunRecord | null = null;
  for (const entry of subagentRuns.values()) {
    if (entry.childSessionKey !== key) {
      continue;
    }
    if (typeof entry.endedAt === "number") {
      if (!latestInMemoryEnded || compareSubagentRunGeneration(entry, latestInMemoryEnded) > 0) {
        latestInMemoryEnded = entry;
      }
      continue;
    }
    if (!latestInMemoryActive || compareSubagentRunGeneration(entry, latestInMemoryActive) > 0) {
      latestInMemoryActive = entry;
    }
  }

  if (latestInMemoryEnded || latestInMemoryActive) {
    // Fresh in-memory terminal state is more accurate than an older active snapshot row.
    if (
      latestInMemoryEnded &&
      (!latestInMemoryActive ||
        compareSubagentRunGeneration(latestInMemoryEnded, latestInMemoryActive) > 0)
    ) {
      return latestInMemoryEnded;
    }
    return latestInMemoryActive ?? latestInMemoryEnded;
  }

  return getSubagentRunByChildSessionKeyFromRuns(
    getSubagentRunsSnapshotForChildSession(subagentRuns, key),
    key,
  );
}

/** Returns the most recently created run for a child session from readable registry state. */
export function getLatestSubagentRunByChildSessionKey(
  childSessionKey: string,
): SubagentRunRecord | null {
  const key = childSessionKey.trim();
  if (!key) {
    return null;
  }

  let latest: SubagentRunRecord | null = null;
  for (const entry of getSubagentRunsSnapshotForChildSession(subagentRuns, key).values()) {
    if (entry.childSessionKey !== key) {
      continue;
    }
    if (!latest || compareSubagentRunGeneration(entry, latest) > 0) {
      latest = entry;
    }
  }

  return latest;
}

export type SettledSubagentCompletion = {
  runId: string;
  outcome: NonNullable<SubagentRunRecord["outcome"]>;
  endedAt: number;
  resultText: string | null;
};

type RelatedSubagentCompletionRead = {
  found: boolean;
  completion?: SettledSubagentCompletion;
};

function readRelatedSubagentCompletion(params: {
  taskRunId: string;
  childSessionKey: string;
}): RelatedSubagentCompletionRead {
  const taskRunId = params.taskRunId.trim();
  const childSessionKey = params.childSessionKey.trim();
  if (!taskRunId || !childSessionKey) {
    return { found: false };
  }

  let latest: SubagentRunRecord | undefined;
  for (const entry of getSubagentRunsSnapshotForChildSession(
    subagentRuns,
    childSessionKey,
  ).values()) {
    if (
      entry.childSessionKey !== childSessionKey ||
      (entry.runId !== taskRunId && entry.taskRunId !== taskRunId)
    ) {
      continue;
    }
    if (!latest || compareSubagentRunGeneration(entry, latest) > 0) {
      latest = entry;
    }
  }
  if (!latest) {
    return { found: false };
  }
  const completion = latest.completion;
  if (
    typeof latest.endedAt !== "number" ||
    !latest.outcome ||
    latest.pauseReason === "sessions_yield" ||
    (completion?.resultText === undefined && typeof completion?.capturedAt !== "number")
  ) {
    return { found: true };
  }
  return {
    found: true,
    completion: {
      runId: latest.runId,
      outcome: latest.outcome,
      endedAt: latest.endedAt,
      resultText: completion.resultText ?? null,
    },
  };
}

/**
 * Waits for the native registry's durable completion snapshot.
 *
 * Initial spawn registration is synchronous, so an absent related row denotes
 * a legacy/non-native caller and returns immediately. Registered runs settle
 * through the registry persistence event rather than polling chat history.
 */
export async function waitForSettledSubagentCompletion(params: {
  taskRunId: string;
  childSessionKey: string;
  signal?: AbortSignal;
}): Promise<SettledSubagentCompletion | null> {
  const initial = readRelatedSubagentCompletion(params);
  if (!initial.found || initial.completion) {
    return initial.completion ?? null;
  }
  if (params.signal?.aborted) {
    return null;
  }

  return await new Promise<SettledSubagentCompletion | null>((resolve) => {
    let settled = false;
    const finish = (value: SettledSubagentCompletion | null) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      params.signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const read = () => {
      const current = readRelatedSubagentCompletion(params);
      if (!current.found) {
        finish(null);
      } else if (current.completion) {
        finish(current.completion);
      }
    };
    const onAbort = () => finish(null);
    const unsubscribe = onSubagentRegistryPersisted(read);
    params.signal?.addEventListener("abort", onAbort, { once: true });
    read();
  });
}
