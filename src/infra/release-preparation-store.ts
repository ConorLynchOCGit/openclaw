import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isLowerHex } from "../release-manifest.js";

const MAX_OPERATION_FILE_BYTES = 4 * 1024 * 1024;

export type ReleasePreparationOperationPaths = {
  operationRoot: string;
  admissionPath: string;
  resultPath: string;
  buildRoot: string;
};

function ensureWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`release preparation path escapes its operation root: ${candidate}`);
  }
}

export function deriveReleasePreparationOperationId(params: {
  codingTaskId: string;
  worktreeId: string;
  loadedReleaseManifestDigest: string;
}): string {
  return createHash("sha256")
    .update("openclaw.release.prepare.v1\0")
    .update(params.codingTaskId)
    .update("\0")
    .update(params.worktreeId)
    .update("\0")
    .update(params.loadedReleaseManifestDigest)
    .digest("hex");
}

export function resolveReleasePreparationOperationPaths(params: {
  releaseStoreRoot: string;
  operationId: string;
}): ReleasePreparationOperationPaths {
  if (!path.isAbsolute(params.releaseStoreRoot)) {
    throw new Error("release store root must be absolute");
  }
  if (!isLowerHex(params.operationId, 64)) {
    throw new Error("release preparation operation ID must be a lowercase SHA-256 digest");
  }
  const operationRoot = path.join(
    path.resolve(params.releaseStoreRoot),
    "operations",
    params.operationId,
  );
  return {
    operationRoot,
    admissionPath: path.join(operationRoot, "admission.json"),
    resultPath: path.join(operationRoot, "result.json"),
    buildRoot: path.join(operationRoot, "build"),
  };
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function ensureReleasePreparationOperationRoot(params: {
  releaseStoreRoot: string;
  paths: ReleasePreparationOperationPaths;
}): Promise<void> {
  const releaseStoreRoot = path.resolve(params.releaseStoreRoot);
  ensureWithinRoot(releaseStoreRoot, params.paths.operationRoot);
  await fs.mkdir(params.paths.operationRoot, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(params.paths.operationRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("release preparation operation root must be a real directory");
  }
}

export async function writeImmutableOperationJson(params: {
  operationRoot: string;
  filePath: string;
  value: unknown;
}): Promise<Buffer> {
  ensureWithinRoot(params.operationRoot, params.filePath);
  const bytes = Buffer.from(`${JSON.stringify(params.value, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_OPERATION_FILE_BYTES) {
    throw new Error("release preparation operation evidence exceeds the supported size");
  }
  try {
    const existing = await fs.readFile(params.filePath);
    if (!existing.equals(bytes)) {
      throw new Error(`immutable release preparation evidence already differs: ${params.filePath}`);
    }
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = path.join(
    path.dirname(params.filePath),
    `.${path.basename(params.filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await fs.open(
    temporaryPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.chmod(temporaryPath, 0o400);
    await fs.rename(temporaryPath, params.filePath);
    await fsyncDirectory(path.dirname(params.filePath));
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  return bytes;
}

export async function readOperationJson(filePath: string): Promise<unknown | null> {
  let handle;
  try {
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_OPERATION_FILE_BYTES) {
      throw new Error(`release preparation operation evidence is unsafe: ${filePath}`);
    }
    const bytes = await handle.readFile();
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally {
    await handle.close();
  }
}
