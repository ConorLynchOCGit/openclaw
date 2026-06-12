import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export { createAsyncLock, readJsonFile, writeJsonAtomic } from "./json-files.js";
import { writeJsonAtomic } from "./json-files.js";

function getErrorCode(err: unknown): string | undefined {
  return err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
}

async function resolveTargetOwnership(
  filePath: string,
): Promise<{ uid: number; gid: number } | null> {
  try {
    const stat = await fs.stat(filePath);
    return { uid: stat.uid, gid: stat.gid };
  } catch (err) {
    if (getErrorCode(err) !== "ENOENT") {
      return null;
    }
  }

  try {
    const stat = await fs.stat(path.dirname(filePath));
    return { uid: stat.uid, gid: stat.gid };
  } catch {
    return null;
  }
}

export async function readPairingJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if (getErrorCode(err) === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function writePairingJsonAtomic(filePath: string, value: unknown) {
  const ownership = await resolveTargetOwnership(filePath);
  await writeJsonAtomic(filePath, value);
  if (!ownership) {
    return;
  }
  try {
    await fs.chown(filePath, ownership.uid, ownership.gid);
  } catch {
    // Non-root writers usually cannot chown. The normal runtime writer already
    // owns the file, so this is only needed for host-side repair/approval tools.
  }
}

export function resolvePairingPaths(baseDir: string | undefined, subdir: string) {
  const root = baseDir ?? resolveStateDir();
  const dir = path.join(root, subdir);
  return {
    dir,
    pendingPath: path.join(dir, "pending.json"),
    pairedPath: path.join(dir, "paired.json"),
  };
}

export function pruneExpiredPending<T extends { ts: number }>(
  pendingById: Record<string, T>,
  nowMs: number,
  ttlMs: number,
) {
  for (const [id, req] of Object.entries(pendingById)) {
    if (nowMs - req.ts > ttlMs) {
      delete pendingById[id];
    }
  }
}

export type PendingPairingRequestResult<TPending> = {
  status: "pending";
  request: TPending;
  created: boolean;
};

export async function reconcilePendingPairingRequests<
  TPending extends { requestId: string },
  TIncoming,
>(params: {
  pendingById: Record<string, TPending>;
  existing: readonly TPending[];
  incoming: TIncoming;
  canRefreshSingle: (existing: TPending, incoming: TIncoming) => boolean;
  refreshSingle: (existing: TPending, incoming: TIncoming) => TPending;
  buildReplacement: (params: { existing: readonly TPending[]; incoming: TIncoming }) => TPending;
  persist: () => Promise<void>;
}): Promise<PendingPairingRequestResult<TPending>> {
  if (
    params.existing.length === 1 &&
    params.canRefreshSingle(params.existing[0], params.incoming)
  ) {
    const refreshed = params.refreshSingle(params.existing[0], params.incoming);
    params.pendingById[refreshed.requestId] = refreshed;
    await params.persist();
    return { status: "pending", request: refreshed, created: false };
  }

  for (const existing of params.existing) {
    delete params.pendingById[existing.requestId];
  }

  const request = params.buildReplacement({
    existing: params.existing,
    incoming: params.incoming,
  });
  params.pendingById[request.requestId] = request;
  await params.persist();
  return { status: "pending", request, created: true };
}
