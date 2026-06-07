import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isCompactionCheckpointSnapshotFileName } from "./artifacts.js";
import { loadSessionStore, updateSessionStore } from "./store.js";
import type { SessionCompactionCheckpoint, SessionEntry } from "./types.js";

export const DEFAULT_CHECKPOINT_CLEANUP_RETAINED_PER_SESSION = 5;
export const HARD_CHECKPOINT_CLEANUP_RETAINED_PER_SESSION = 25;

export type CompactionCheckpointCleanupFile = {
  path: string;
  canonicalPath: string;
  sizeBytes: number;
  reason: "unreferenced" | "over_retained";
};

export type CompactionCheckpointCleanupEntryUpdate = {
  sessionKey: string;
  beforeCount: number;
  afterCount: number;
  prunedCount: number;
  retainedCheckpoints: SessionCompactionCheckpoint[] | undefined;
};

export type CompactionCheckpointCleanupPlan = {
  sessionsDir: string;
  maxCheckpointsPerSession: number;
  checkpointFiles: number;
  checkpointBytes: number;
  referencedCheckpointFiles: number;
  referencedCheckpointBytes: number;
  retainedCheckpointFiles: number;
  retainedCheckpointBytes: number;
  unreferencedCheckpointFiles: number;
  unreferencedCheckpointBytes: number;
  overRetainedCheckpointFiles: number;
  overRetainedCheckpointBytes: number;
  filesToDelete: CompactionCheckpointCleanupFile[];
  entryUpdates: CompactionCheckpointCleanupEntryUpdate[];
};

export type ApplyCompactionCheckpointCleanupResult = {
  plan: CompactionCheckpointCleanupPlan;
  backupStorePath: string | null;
  deletedFiles: number;
  failedDeletes: Array<{ path: string; error: string }>;
};

type CheckpointFileStat = {
  path: string;
  canonicalPath: string;
  sizeBytes: number;
};

function canonicalizePathForComparison(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    return fsSync.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function normalizeRetainedCount(maxCheckpointsPerSession?: number): number {
  const raw =
    typeof maxCheckpointsPerSession === "number"
      ? maxCheckpointsPerSession
      : DEFAULT_CHECKPOINT_CLEANUP_RETAINED_PER_SESSION;
  return Math.min(Math.max(Math.trunc(raw), 0), HARD_CHECKPOINT_CLEANUP_RETAINED_PER_SESSION);
}

function isWithinDirectory(params: { dir: string; filePath: string }): boolean {
  const relative = path.relative(params.dir, params.filePath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function checkpointFilePath(checkpoint: SessionCompactionCheckpoint): string | null {
  const sessionFile = checkpoint.preCompaction?.sessionFile?.trim();
  return sessionFile ? canonicalizePathForComparison(sessionFile) : null;
}

async function readCheckpointFiles(sessionsDir: string): Promise<CheckpointFileStat[]> {
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const files: CheckpointFileStat[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isCompactionCheckpointSnapshotFileName(entry.name)) {
      continue;
    }
    const filePath = path.join(sessionsDir, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) {
      continue;
    }
    files.push({
      path: filePath,
      canonicalPath: canonicalizePathForComparison(filePath),
      sizeBytes: stat.size,
    });
  }
  return files;
}

function sumBytes(files: Iterable<Pick<CheckpointFileStat, "sizeBytes">>): number {
  let total = 0;
  for (const file of files) {
    total += file.sizeBytes;
  }
  return total;
}

export async function planCompactionCheckpointCleanup(params: {
  store: Record<string, SessionEntry>;
  sessionsDir: string;
  maxCheckpointsPerSession?: number;
}): Promise<CompactionCheckpointCleanupPlan> {
  const sessionsDir = canonicalizePathForComparison(params.sessionsDir);
  const maxCheckpointsPerSession = normalizeRetainedCount(params.maxCheckpointsPerSession);
  const files = await readCheckpointFiles(sessionsDir);
  const filesByCanonicalPath = new Map(files.map((file) => [file.canonicalPath, file]));
  const referenced = new Set<string>();
  const retained = new Set<string>();
  const entryUpdates: CompactionCheckpointCleanupEntryUpdate[] = [];

  for (const [sessionKey, entry] of Object.entries(params.store)) {
    const checkpoints = Array.isArray(entry.compactionCheckpoints)
      ? entry.compactionCheckpoints
      : [];
    if (checkpoints.length === 0) {
      continue;
    }
    for (const checkpoint of checkpoints) {
      const checkpointPath = checkpointFilePath(checkpoint);
      if (checkpointPath && isWithinDirectory({ dir: sessionsDir, filePath: checkpointPath })) {
        referenced.add(checkpointPath);
      }
    }
    const retainedCheckpoints =
      maxCheckpointsPerSession > 0 ? checkpoints.slice(-maxCheckpointsPerSession) : [];
    for (const checkpoint of retainedCheckpoints) {
      const checkpointPath = checkpointFilePath(checkpoint);
      if (checkpointPath && isWithinDirectory({ dir: sessionsDir, filePath: checkpointPath })) {
        retained.add(checkpointPath);
      }
    }
    if (retainedCheckpoints.length !== checkpoints.length) {
      entryUpdates.push({
        sessionKey,
        beforeCount: checkpoints.length,
        afterCount: retainedCheckpoints.length,
        prunedCount: checkpoints.length - retainedCheckpoints.length,
        retainedCheckpoints: retainedCheckpoints.length > 0 ? retainedCheckpoints : undefined,
      });
    }
  }

  const referencedFiles = [...referenced]
    .map((filePath) => filesByCanonicalPath.get(filePath))
    .filter((file): file is CheckpointFileStat => !!file);
  const retainedFiles = [...retained]
    .map((filePath) => filesByCanonicalPath.get(filePath))
    .filter((file): file is CheckpointFileStat => !!file);
  const filesToDelete: CompactionCheckpointCleanupFile[] = files
    .filter((file) => !retained.has(file.canonicalPath))
    .map(
      (file): CompactionCheckpointCleanupFile => ({
        ...file,
        reason: referenced.has(file.canonicalPath) ? "over_retained" : "unreferenced",
      }),
    )
    .toSorted((a, b) => a.path.localeCompare(b.path));
  const unreferencedFiles = filesToDelete.filter((file) => file.reason === "unreferenced");
  const overRetainedFiles = filesToDelete.filter((file) => file.reason === "over_retained");

  return {
    sessionsDir,
    maxCheckpointsPerSession,
    checkpointFiles: files.length,
    checkpointBytes: sumBytes(files),
    referencedCheckpointFiles: referencedFiles.length,
    referencedCheckpointBytes: sumBytes(referencedFiles),
    retainedCheckpointFiles: retainedFiles.length,
    retainedCheckpointBytes: sumBytes(retainedFiles),
    unreferencedCheckpointFiles: unreferencedFiles.length,
    unreferencedCheckpointBytes: sumBytes(unreferencedFiles),
    overRetainedCheckpointFiles: overRetainedFiles.length,
    overRetainedCheckpointBytes: sumBytes(overRetainedFiles),
    filesToDelete,
    entryUpdates,
  };
}

export async function planCompactionCheckpointCleanupFromStore(params: {
  storePath: string;
  sessionsDir?: string;
  maxCheckpointsPerSession?: number;
}): Promise<CompactionCheckpointCleanupPlan> {
  const store = loadSessionStore(params.storePath, { skipCache: true });
  return await planCompactionCheckpointCleanup({
    store,
    sessionsDir: params.sessionsDir ?? path.dirname(params.storePath),
    maxCheckpointsPerSession: params.maxCheckpointsPerSession,
  });
}

async function unlinkPlannedCheckpointFiles(
  filesToDelete: CompactionCheckpointCleanupFile[],
): Promise<{ deletedFiles: number; failedDeletes: Array<{ path: string; error: string }> }> {
  let deletedFiles = 0;
  const failedDeletes: Array<{ path: string; error: string }> = [];
  for (const file of filesToDelete) {
    try {
      await fs.unlink(file.path);
      deletedFiles += 1;
    } catch (error) {
      failedDeletes.push({
        path: file.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { deletedFiles, failedDeletes };
}

export async function applyCompactionCheckpointCleanup(params: {
  storePath: string;
  sessionsDir?: string;
  maxCheckpointsPerSession?: number;
  createBackup?: boolean;
  backupNowMs?: number;
}): Promise<ApplyCompactionCheckpointCleanupResult> {
  const sessionsDir = params.sessionsDir ?? path.dirname(params.storePath);
  const backupStorePath =
    params.createBackup === false
      ? null
      : `${params.storePath}.bak.${Math.trunc(params.backupNowMs ?? Date.now())}`;
  if (backupStorePath) {
    await fs.copyFile(params.storePath, backupStorePath);
  }

  const planHolder: { value?: CompactionCheckpointCleanupPlan } = {};
  await updateSessionStore(
    params.storePath,
    async (store) => {
      const plan = await planCompactionCheckpointCleanup({
        store,
        sessionsDir,
        maxCheckpointsPerSession: params.maxCheckpointsPerSession,
      });
      planHolder.value = plan;
      for (const update of plan.entryUpdates) {
        const entry = store[update.sessionKey];
        if (!entry) {
          continue;
        }
        store[update.sessionKey] = {
          ...entry,
          compactionCheckpoints: update.retainedCheckpoints,
        };
      }
    },
    { skipMaintenance: true },
  );
  const plan = planHolder.value;
  if (!plan) {
    throw new Error("compaction checkpoint cleanup plan was not produced");
  }
  const deleteResult = await unlinkPlannedCheckpointFiles(plan.filesToDelete);
  return {
    plan,
    backupStorePath,
    ...deleteResult,
  };
}
