import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
export const LOCAL_DIR = path.join(ROOT_DIR, ".local");
export const LOCK_DIR = path.join(LOCAL_DIR, "gate-locks", "repo-heavy-task.lock");

export function nowIso() {
  return new Date().toISOString();
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function readRepoHeavyLock() {
  const metadataPath = path.join(LOCK_DIR, "metadata.json");
  if (!(await pathExists(metadataPath))) {
    return null;
  }
  try {
    const metadata = await readJson(metadataPath);
    return {
      ...metadata,
      active: isPidAlive(metadata?.pid),
    };
  } catch {
    return null;
  }
}

export async function acquireRepoHeavyLock(activeTask, options = {}) {
  const log = options.log ?? (() => {});
  await fs.mkdir(path.dirname(LOCK_DIR), { recursive: true });

  for (;;) {
    try {
      await fs.mkdir(LOCK_DIR);
      const metadata = {
        pid: process.pid,
        task: activeTask,
        startedAt: nowIso(),
        cwd: ROOT_DIR,
      };
      await fs.writeFile(
        path.join(LOCK_DIR, "metadata.json"),
        JSON.stringify(metadata, null, 2),
        "utf8",
      );
      return async () => {
        await fs.rm(LOCK_DIR, { recursive: true, force: true });
      };
    } catch (error) {
      if (!(error instanceof Error) || !String(error.message).includes("EEXIST")) {
        throw error;
      }

      const metadata = await readRepoHeavyLock();
      if (metadata?.active) {
        throw new Error(
          [
            `refusing to start ${activeTask} while another repo-heavy task is running`,
            `heldBy=${metadata.task ?? "unknown"}`,
            `pid=${String(metadata.pid ?? "unknown")}`,
            `startedAt=${metadata.startedAt ?? "unknown"}`,
          ].join(" "),
          { cause: error },
        );
      }

      log("removing stale repo-heavy-task lock");
      await fs.rm(LOCK_DIR, { recursive: true, force: true });
    }
  }
}
