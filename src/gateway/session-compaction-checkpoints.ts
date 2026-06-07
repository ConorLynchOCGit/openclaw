import { randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { updateSessionStore } from "../config/sessions.js";
import type {
  SessionCompactionCheckpoint,
  SessionCompactionCheckpointReason,
  SessionEntry,
} from "../config/sessions.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveGatewaySessionStoreTarget } from "./session-utils.js";

const log = createSubsystemLogger("gateway/session-compaction-checkpoints");
export const DEFAULT_MAX_COMPACTION_CHECKPOINTS_PER_SESSION = 5;
export const HARD_MAX_COMPACTION_CHECKPOINTS_PER_SESSION = 25;

export type CapturedCompactionCheckpointSnapshot = {
  sessionId: string;
  sessionFile: string;
  leafId: string;
};

function trimSessionCheckpoints(
  checkpoints: SessionCompactionCheckpoint[] | undefined,
  maxCheckpoints = DEFAULT_MAX_COMPACTION_CHECKPOINTS_PER_SESSION,
): SessionCompactionCheckpoint[] | undefined {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return undefined;
  }
  const boundedMax = Math.min(
    Math.max(Math.trunc(maxCheckpoints), 0),
    HARD_MAX_COMPACTION_CHECKPOINTS_PER_SESSION,
  );
  if (boundedMax === 0) {
    return undefined;
  }
  return checkpoints.slice(-boundedMax);
}

function checkpointFileKey(checkpoint: SessionCompactionCheckpoint): string | undefined {
  const sessionFile = checkpoint.preCompaction?.sessionFile?.trim();
  return sessionFile ? path.resolve(sessionFile) : undefined;
}

function isGeneratedCompactionCheckpointFile(filePath: string): boolean {
  return /\.checkpoint\.[^/]+\.jsonl$/u.test(path.basename(filePath));
}

async function cleanupPrunedCompactionCheckpointFiles(
  checkpoints: SessionCompactionCheckpoint[],
): Promise<void> {
  for (const checkpoint of checkpoints) {
    const sessionFile = checkpointFileKey(checkpoint);
    if (!sessionFile || !isGeneratedCompactionCheckpointFile(sessionFile)) {
      continue;
    }
    try {
      await fs.unlink(sessionFile);
    } catch {
      // Best-effort cleanup; retention metadata has already been trimmed.
    }
  }
}

function sessionStoreCheckpoints(
  entry: Pick<SessionEntry, "compactionCheckpoints"> | undefined,
): SessionCompactionCheckpoint[] {
  return Array.isArray(entry?.compactionCheckpoints) ? [...entry.compactionCheckpoints] : [];
}

export function resolveSessionCompactionCheckpointReason(params: {
  trigger?: "budget" | "overflow" | "manual";
  timedOut?: boolean;
}): SessionCompactionCheckpointReason {
  if (params.trigger === "manual") {
    return "manual";
  }
  if (params.timedOut) {
    return "timeout-retry";
  }
  if (params.trigger === "overflow") {
    return "overflow-retry";
  }
  return "auto-threshold";
}

export function captureCompactionCheckpointSnapshot(params: {
  sessionManager: Pick<SessionManager, "getLeafId">;
  sessionFile: string;
}): CapturedCompactionCheckpointSnapshot | null {
  const getLeafId =
    params.sessionManager && typeof params.sessionManager.getLeafId === "function"
      ? params.sessionManager.getLeafId.bind(params.sessionManager)
      : null;
  const sessionFile = params.sessionFile.trim();
  if (!getLeafId || !sessionFile) {
    return null;
  }
  const leafId = getLeafId();
  if (!leafId) {
    return null;
  }
  const parsedSessionFile = path.parse(sessionFile);
  const snapshotFile = path.join(
    parsedSessionFile.dir,
    `${parsedSessionFile.name}.checkpoint.${randomUUID()}${parsedSessionFile.ext || ".jsonl"}`,
  );
  try {
    fsSync.copyFileSync(sessionFile, snapshotFile);
  } catch {
    return null;
  }
  let snapshotSession: SessionManager;
  try {
    snapshotSession = SessionManager.open(snapshotFile, path.dirname(snapshotFile));
  } catch {
    try {
      fsSync.unlinkSync(snapshotFile);
    } catch {
      // Best-effort cleanup if the copied transcript cannot be reopened.
    }
    return null;
  }
  const getSessionId =
    snapshotSession && typeof snapshotSession.getSessionId === "function"
      ? snapshotSession.getSessionId.bind(snapshotSession)
      : null;
  if (!getSessionId) {
    return null;
  }
  return {
    sessionId: getSessionId(),
    sessionFile: snapshotFile,
    leafId,
  };
}

export async function cleanupCompactionCheckpointSnapshot(
  snapshot: CapturedCompactionCheckpointSnapshot | null | undefined,
): Promise<void> {
  if (!snapshot?.sessionFile) {
    return;
  }
  try {
    await fs.unlink(snapshot.sessionFile);
  } catch {
    // Best-effort cleanup; retained snapshots are harmless and easier to debug.
  }
}

export async function persistSessionCompactionCheckpoint(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  sessionId: string;
  reason: SessionCompactionCheckpointReason;
  snapshot: CapturedCompactionCheckpointSnapshot;
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  postSessionFile?: string;
  postLeafId?: string;
  postEntryId?: string;
  createdAt?: number;
}): Promise<SessionCompactionCheckpoint | null> {
  const target = resolveGatewaySessionStoreTarget({
    cfg: params.cfg,
    key: params.sessionKey,
  });
  const maxCheckpoints =
    params.cfg.agents?.defaults?.compaction?.maxCheckpointsPerSession ??
    DEFAULT_MAX_COMPACTION_CHECKPOINTS_PER_SESSION;
  const createdAt = params.createdAt ?? Date.now();
  const checkpoint: SessionCompactionCheckpoint = {
    checkpointId: randomUUID(),
    sessionKey: target.canonicalKey,
    sessionId: params.sessionId,
    createdAt,
    reason: params.reason,
    ...(typeof params.tokensBefore === "number" ? { tokensBefore: params.tokensBefore } : {}),
    ...(typeof params.tokensAfter === "number" ? { tokensAfter: params.tokensAfter } : {}),
    ...(params.summary?.trim() ? { summary: params.summary.trim() } : {}),
    ...(params.firstKeptEntryId?.trim()
      ? { firstKeptEntryId: params.firstKeptEntryId.trim() }
      : {}),
    preCompaction: {
      sessionId: params.snapshot.sessionId,
      sessionFile: params.snapshot.sessionFile,
      leafId: params.snapshot.leafId,
    },
    postCompaction: {
      sessionId: params.sessionId,
      ...(params.postSessionFile?.trim() ? { sessionFile: params.postSessionFile.trim() } : {}),
      ...(params.postLeafId?.trim() ? { leafId: params.postLeafId.trim() } : {}),
      ...(params.postEntryId?.trim() ? { entryId: params.postEntryId.trim() } : {}),
    },
  };

  let stored = false;
  let prunedCheckpoints: SessionCompactionCheckpoint[] = [];
  await updateSessionStore(target.storePath, (store) => {
    const existing = store[target.canonicalKey];
    if (!existing?.sessionId) {
      return;
    }
    const checkpoints = sessionStoreCheckpoints(existing);
    checkpoints.push(checkpoint);
    const retained = trimSessionCheckpoints(checkpoints, maxCheckpoints);
    const retainedFiles = new Set((retained ?? []).map(checkpointFileKey).filter(Boolean));
    prunedCheckpoints = checkpoints.filter((candidate) => {
      const fileKey = checkpointFileKey(candidate);
      return fileKey ? !retainedFiles.has(fileKey) : false;
    });
    store[target.canonicalKey] = {
      ...existing,
      updatedAt: Math.max(existing.updatedAt ?? 0, createdAt),
      compactionCheckpoints: retained,
    };
    stored = true;
  });

  if (!stored) {
    log.warn("skipping compaction checkpoint persist: session not found", {
      sessionKey: params.sessionKey,
    });
    return null;
  }
  await cleanupPrunedCompactionCheckpointFiles(prunedCheckpoints);
  return checkpoint;
}

export function listSessionCompactionCheckpoints(
  entry: Pick<SessionEntry, "compactionCheckpoints"> | undefined,
): SessionCompactionCheckpoint[] {
  return sessionStoreCheckpoints(entry).toSorted((a, b) => b.createdAt - a.createdAt);
}

export function getSessionCompactionCheckpoint(params: {
  entry: Pick<SessionEntry, "compactionCheckpoints"> | undefined;
  checkpointId: string;
}): SessionCompactionCheckpoint | undefined {
  const checkpointId = params.checkpointId.trim();
  if (!checkpointId) {
    return undefined;
  }
  return listSessionCompactionCheckpoints(params.entry).find(
    (checkpoint) => checkpoint.checkpointId === checkpointId,
  );
}
