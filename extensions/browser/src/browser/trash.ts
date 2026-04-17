import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSecureToken } from "../infra/secure-random.js";
import { runExec } from "../process/exec.js";

function resolveUniqueTrashDestination(baseDir: string, baseName: string): string {
  let destination = path.join(baseDir, `${baseName}-${Date.now()}`);
  if (fs.existsSync(destination)) {
    destination = path.join(baseDir, `${baseName}-${Date.now()}-${generateSecureToken(6)}`);
  }
  return destination;
}

export async function movePathToTrash(targetPath: string): Promise<string> {
  try {
    await runExec("trash", [targetPath], { timeoutMs: 10_000 });
    return targetPath;
  } catch {
    const trashDir = path.join(os.homedir(), ".Trash");
    fs.mkdirSync(trashDir, { recursive: true });
    const base = path.basename(targetPath);
    const dest = resolveUniqueTrashDestination(trashDir, base);
    try {
      fs.renameSync(targetPath, dest);
      return dest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
        throw error;
      }
      // Mounted browser profiles can live on a different filesystem than ~/.Trash.
      // Fall back to a same-volume hidden trash dir so reset-profile stays reliable.
      const localTrashDir = path.join(path.dirname(targetPath), ".openclaw-trash");
      fs.mkdirSync(localTrashDir, { recursive: true });
      const localDest = resolveUniqueTrashDestination(localTrashDir, base);
      fs.renameSync(targetPath, localDest);
      return localDest;
    }
  }
}
