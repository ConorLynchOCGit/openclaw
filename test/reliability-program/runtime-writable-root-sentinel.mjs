import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

async function unlinkIfPresent(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function syncDirectory(directoryPath) {
  const handle = await fs.open(directoryPath, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function proveWritableRoot({ id, root, expectedUid, expectedGid, authority }) {
  if (!id || !path.isAbsolute(root) || !Array.isArray(authority) || authority.length === 0) {
    throw new Error(`invalid writable-root inventory row: ${id || "<missing-id>"}`);
  }

  const resolvedRoot = path.resolve(root);
  const realRoot = await fs.realpath(resolvedRoot);
  if (realRoot !== resolvedRoot) {
    throw new Error(`${id}: writable root must not be a symlink: ${root}`);
  }

  const owner = await fs.stat(realRoot);
  if (!owner.isDirectory()) {
    throw new Error(`${id}: writable root is not a directory: ${root}`);
  }
  if (owner.uid !== expectedUid || owner.gid !== expectedGid) {
    throw new Error(
      `${id}: owner mismatch for ${root}; expected ${expectedUid}:${expectedGid}, got ${owner.uid}:${owner.gid}`,
    );
  }
  if (process.getuid?.() !== expectedUid || process.getgid?.() !== expectedGid) {
    throw new Error(
      `${id}: proof must run as ${expectedUid}:${expectedGid}, got ${process.getuid?.()}:${process.getgid?.()}`,
    );
  }

  const nonce = `${process.pid}-${randomUUID()}`;
  const initialPath = path.join(realRoot, `.openclaw-write-proof-${nonce}.tmp`);
  const renamedPath = path.join(realRoot, `.openclaw-write-proof-${nonce}.done`);
  const payload = Buffer.from(`openclaw-writable-root-proof:${id}:${nonce}\n`, "utf8");
  const startedAt = new Date().toISOString();

  try {
    const file = await fs.open(
      initialPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    try {
      await file.writeFile(payload);
      await file.sync();
    } finally {
      await file.close();
    }

    await syncDirectory(realRoot);
    await fs.rename(initialPath, renamedPath);
    await syncDirectory(realRoot);

    const reread = await fs.readFile(renamedPath);
    if (!reread.equals(payload)) {
      throw new Error(`${id}: reread bytes differ after rename`);
    }

    await fs.unlink(renamedPath);
    await syncDirectory(realRoot);
    await fs.access(renamedPath).then(
      () => {
        throw new Error(`${id}: sentinel remained after delete`);
      },
      (error) => {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      },
    );

    return {
      id,
      root: realRoot,
      authority,
      owner: { uid: owner.uid, gid: owner.gid },
      mode: owner.mode & 0o7777,
      device: owner.dev,
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      cycle: ["create", "write", "fsync_file", "fsync_directory", "rename", "reread", "delete"],
      cleanupVerified: true,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } finally {
    await unlinkIfPresent(initialPath);
    await unlinkIfPresent(renamedPath);
  }
}

if (process.env.OPENCLAW_WRITABLE_ROOT_SENTINEL_RUN === "1") {
  const row = JSON.parse(process.env.OPENCLAW_WRITABLE_ROOT_ROW ?? "{}");
  const result = await proveWritableRoot(row);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
