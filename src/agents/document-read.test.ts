import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDocumentReadSession,
  readDocumentChunk,
  startDocumentReadSession,
  verifyDocumentReadSession,
} from "./document-read.js";

const tempDirs: string[] = [];

async function makeWorkspace() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-document-read-"));
  tempDirs.push(workspace);
  await fs.mkdir(path.join(workspace, ".openclaw"), { recursive: true });
  return workspace;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("document read", () => {
  it("plans, reads, and verifies a text file with full line coverage", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/guide.md";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, relativePath),
      Array.from({ length: 7 }, (_, index) => `line-${index + 1}`).join("\n"),
      "utf8",
    );

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 3,
    });
    expect(session.fingerprint.chunkingMode).toBe("lines");
    expect(session.fingerprint.expectedChunkCount).toBe(3);

    const first = await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });
    expect(first.chunk.startLine).toBe(1);
    expect(first.chunk.endLine).toBe(3);
    expect(first.text).toContain("line-1");

    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });
    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });

    const verified = await verifyDocumentReadSession({
      rootDir: workspace,
      sessionId: session.sessionId,
    });
    expect(verified.status).toBe("complete");
    expect(verified.coverage?.allChunksAcquired).toBe(true);
    expect(verified.coverage?.complete).toBe(true);
    expect(verified.coverage?.verifiedFullHash).toBe(true);
  });

  it("marks verification incomplete when chunks are missing", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/missing.md";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, relativePath),
      Array.from({ length: 10 }, (_, index) => `row-${index + 1}`).join("\n"),
      "utf8",
    );

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 4,
    });
    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      chunkIndex: 0,
    });

    const verified = await verifyDocumentReadSession({
      rootDir: workspace,
      sessionId: session.sessionId,
    });
    expect(verified.status).toBe("incomplete");
    expect(verified.coverage?.missingChunkIndexes).toEqual([1, 2]);
  });

  it("falls back to byte chunking for very long lines", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/long-line.md";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, relativePath),
      `intro\n${"x".repeat(12_000)}\noutro\n`,
      "utf8",
    );

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 10,
      chunkBytes: 1024,
      maxLineBytes: 2048,
    });
    expect(session.fingerprint.chunkingMode).toBe("bytes");
    expect(session.fingerprint.expectedChunkCount).toBeGreaterThan(2);
  });

  it("detects mixed line endings and preserves persisted session state across calls", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/mixed.txt";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspace, relativePath), "a\r\nb\nc\rd", "utf8");

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 2,
    });
    expect(session.fingerprint.lineEnding).toBe("mixed");

    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });

    const persisted = await getDocumentReadSession({
      rootDir: workspace,
      sessionId: session.sessionId,
    });
    expect(persisted.acquiredChunkIndexes).toEqual([0]);
    expect(persisted.status).toBe("in_progress");
  });

  it("marks a session ready_to_verify after the last chunk is acquired but before verification", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/verify-gap.md";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, relativePath),
      Array.from({ length: 6 }, (_, index) => `entry-${index + 1}`).join("\n"),
      "utf8",
    );

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 2,
    });

    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });
    await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });
    const finalChunk = await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });

    expect(finalChunk.session.status).toBe("ready_to_verify");
    expect(finalChunk.session.coverage?.allChunksAcquired).toBe(true);
    expect(finalChunk.session.coverage?.verifiedFullHash).toBe(false);
    expect(finalChunk.session.coverage?.complete).toBe(false);
  });

  it("fails explicitly when the file changes during acquisition", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/changing.md";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspace, relativePath), "one\ntwo\nthree\nfour\n", "utf8");

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkLines: 2,
    });

    await fs.writeFile(path.join(workspace, relativePath), "one\ntwo\nthree\nfour\nfive\n", "utf8");

    await expect(
      readDocumentChunk({
        rootDir: workspace,
        sessionId: session.sessionId,
        nextMissing: true,
      }),
    ).rejects.toThrow(/stale/i);

    const failed = await getDocumentReadSession({
      rootDir: workspace,
      sessionId: session.sessionId,
    });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("file_changed");
  });

  it("uses byte chunking for non-utf8 input and marks chunk text as lossy", async () => {
    const workspace = await makeWorkspace();
    const relativePath = "docs/binary.txt";
    await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspace, relativePath), Buffer.from([0xff, 0xfe, 0xfd, 0x00]));

    const session = await startDocumentReadSession({
      rootDir: workspace,
      relativePath,
      chunkBytes: 2,
    });
    expect(session.fingerprint.encoding).toBe("binary");
    expect(session.fingerprint.chunkingMode).toBe("bytes");

    const chunk = await readDocumentChunk({
      rootDir: workspace,
      sessionId: session.sessionId,
      nextMissing: true,
    });
    expect(chunk.lossyUtf8).toBe(true);
  });
});
