import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const COPY_BUFFER_BYTES = 1024 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

export type PublishedReleaseObject = {
  sha256: string;
  byteSize: number;
  relativePath: string;
  filePath: string;
};

function validateFileName(fileName: string): void {
  if (
    !fileName ||
    fileName === "." ||
    fileName === ".." ||
    path.basename(fileName) !== fileName ||
    fileName.includes("\0")
  ) {
    throw new Error("release object filename is invalid");
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureRealDirectory(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`release store path must be a real directory: ${directory}`);
  }
}

async function ensureDirectoryChain(root: string, segments: readonly string[]): Promise<string> {
  await ensureRealDirectory(root);
  let current = root;
  for (const segment of segments) {
    validateFileName(segment);
    current = path.join(current, segment);
    try {
      await fs.mkdir(current, { mode: 0o700 });
      await fsyncDirectory(path.dirname(current));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    await ensureRealDirectory(current);
  }
  return current;
}

async function hashOpenFile(params: {
  handle: fs.FileHandle;
  maxBytes?: number;
  subject: string;
}): Promise<{ sha256: string; byteSize: number }> {
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let byteSize = 0;
  for (;;) {
    const { bytesRead } = await params.handle.read(buffer, 0, buffer.length, byteSize);
    if (bytesRead === 0) {
      break;
    }
    byteSize += bytesRead;
    if (params.maxBytes !== undefined && byteSize > params.maxBytes) {
      throw new Error(`${params.subject} exceeds the supported size`);
    }
    digest.update(buffer.subarray(0, bytesRead));
  }
  return { sha256: digest.digest("hex"), byteSize };
}

async function verifyPublishedFile(params: {
  filePath: string;
  expectedSha256: string;
  expectedByteSize: number;
}): Promise<void> {
  const handle = await fs.open(
    params.filePath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o222) !== 0 ||
      stat.size !== params.expectedByteSize
    ) {
      throw new Error("published release object has unsafe filesystem identity");
    }
    const actual = await hashOpenFile({ handle, subject: "published release object" });
    if (actual.byteSize !== params.expectedByteSize || actual.sha256 !== params.expectedSha256) {
      throw new Error("published release object does not match its content address");
    }
  } finally {
    await handle.close();
  }
}

async function copyOpenFile(params: {
  source: fs.FileHandle;
  target: fs.FileHandle;
  byteSize: number;
}): Promise<void> {
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let offset = 0;
  while (offset < params.byteSize) {
    const length = Math.min(buffer.length, params.byteSize - offset);
    const { bytesRead } = await params.source.read(buffer, 0, length, offset);
    if (bytesRead === 0) {
      throw new Error("release object source changed while it was copied");
    }
    await params.target.write(buffer.subarray(0, bytesRead), 0, bytesRead, offset);
    offset += bytesRead;
  }
}

async function publishOpenFile(params: {
  releaseStoreRoot: string;
  source: fs.FileHandle;
  sourceStat: Awaited<ReturnType<fs.FileHandle["stat"]>>;
  namespace: "artifacts" | "manifests" | "receipts";
  fileName: string;
  maxBytes?: number;
}): Promise<PublishedReleaseObject> {
  validateFileName(params.fileName);
  if (!params.sourceStat.isFile() || params.sourceStat.nlink !== 1) {
    throw new Error("release object source must be a single-link regular file");
  }
  const identity = await hashOpenFile({
    handle: params.source,
    ...(params.maxBytes === undefined ? {} : { maxBytes: params.maxBytes }),
    subject: "release object",
  });
  if (identity.byteSize !== params.sourceStat.size) {
    throw new Error("release object source size changed while it was read");
  }

  const root = path.resolve(params.releaseStoreRoot);
  const suffix = params.namespace === "artifacts" ? params.fileName : `${identity.sha256}.json`;
  const segments =
    params.namespace === "artifacts"
      ? [params.namespace, "sha256", identity.sha256]
      : [params.namespace, "sha256"];
  const destinationDir = await ensureDirectoryChain(root, segments);
  const destination = path.join(destinationDir, suffix);
  const relativePath = path.relative(root, destination);

  try {
    await verifyPublishedFile({
      filePath: destination,
      expectedSha256: identity.sha256,
      expectedByteSize: identity.byteSize,
    });
    return { ...identity, relativePath, filePath: destination };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = path.join(destinationDir, `.${suffix}.${process.pid}.${randomUUID()}.tmp`);
  const target = await fs.open(
    temporaryPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await copyOpenFile({ source: params.source, target, byteSize: identity.byteSize });
    await target.sync();
  } finally {
    await target.close();
  }
  try {
    const after = await params.source.stat();
    if (
      after.dev !== params.sourceStat.dev ||
      after.ino !== params.sourceStat.ino ||
      after.size !== params.sourceStat.size ||
      after.mtimeMs !== params.sourceStat.mtimeMs
    ) {
      throw new Error("release object source changed while it was published");
    }
    await fs.chmod(temporaryPath, 0o400);
    await fs.rename(temporaryPath, destination);
    await fsyncDirectory(destinationDir);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  await verifyPublishedFile({
    filePath: destination,
    expectedSha256: identity.sha256,
    expectedByteSize: identity.byteSize,
  });
  return { ...identity, relativePath, filePath: destination };
}

export async function publishReleaseArtifact(params: {
  releaseStoreRoot: string;
  sourcePath: string;
  fileName?: string;
}): Promise<PublishedReleaseObject> {
  const source = await fs.open(
    params.sourcePath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    return await publishOpenFile({
      releaseStoreRoot: params.releaseStoreRoot,
      source,
      sourceStat: await source.stat(),
      namespace: "artifacts",
      fileName: params.fileName ?? path.basename(params.sourcePath),
    });
  } finally {
    await source.close();
  }
}

export async function publishReleaseMetadata(params: {
  releaseStoreRoot: string;
  namespace: "manifests" | "receipts";
  bytes: Uint8Array;
}): Promise<PublishedReleaseObject> {
  if (params.bytes.byteLength === 0 || params.bytes.byteLength > MAX_METADATA_BYTES) {
    throw new Error("release metadata has an unsupported size");
  }
  const stagingRoot = await ensureDirectoryChain(path.resolve(params.releaseStoreRoot), [
    ".staging",
  ]);
  const temporaryPath = path.join(stagingRoot, `.metadata.${process.pid}.${randomUUID()}.tmp`);
  const handle = await fs.open(
    temporaryPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR,
    0o600,
  );
  try {
    await handle.writeFile(params.bytes);
    await handle.sync();
    return await publishOpenFile({
      releaseStoreRoot: params.releaseStoreRoot,
      source: handle,
      sourceStat: await handle.stat(),
      namespace: params.namespace,
      fileName: "metadata.json",
      maxBytes: MAX_METADATA_BYTES,
    });
  } finally {
    await handle.close();
    await fs.rm(temporaryPath, { force: true });
  }
}
