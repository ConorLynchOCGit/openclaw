import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDocumentReadTool } from "./document-read-tool.js";

const tempDirs: string[] = [];

async function makeWorkspace() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-document-read-tool-"));
  tempDirs.push(workspace);
  await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
  return workspace;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("document_read tool", () => {
  it("starts a session, returns chunks, and verifies coverage", async () => {
    const workspace = await makeWorkspace();
    await fs.writeFile(
      path.join(workspace, "docs", "handbook.md"),
      Array.from({ length: 6 }, (_, index) => `section-${index + 1}`).join("\n"),
      "utf8",
    );
    const tool = createDocumentReadTool(workspace);

    const started = await tool.execute("call-start", {
      action: "start",
      path: "docs/handbook.md",
      chunkLines: 2,
    });
    const startDetails = started.details as {
      sessionId?: string;
      expectedChunkCount?: number;
      authoritativeState?: string;
    };
    expect(startDetails.sessionId).toBeTruthy();
    expect(startDetails.expectedChunkCount).toBe(3);
    expect(startDetails.authoritativeState).toBe("started");

    const sessionId = String(startDetails.sessionId);
    const firstChunk = await tool.execute("call-next", {
      action: "next",
      sessionId,
    });
    const firstChunkText =
      (firstChunk.content.find((entry) => entry.type === "text") as { text?: string } | undefined)
        ?.text ?? "";
    expect(firstChunkText).toContain("chunk 1/3");
    expect(firstChunkText).toContain("section-1");
    expect(firstChunk.details).toMatchObject({
      status: "chunk",
      authoritativeState: "in_progress",
      expectedChunkCount: 3,
      acquiredChunkCount: 1,
      missingChunkIndexes: [1, 2],
      verifiedFullHash: false,
      fileStillMatchesFingerprint: true,
      complete: false,
    });

    await tool.execute("call-next-2", { action: "next", sessionId });
    const finalChunk = await tool.execute("call-next-3", { action: "next", sessionId });
    expect(finalChunk.details).toMatchObject({
      status: "chunk",
      authoritativeState: "ready_to_verify",
      expectedChunkCount: 3,
      acquiredChunkCount: 3,
      missingChunkIndexes: [],
      verifiedFullHash: false,
      fileStillMatchesFingerprint: true,
      complete: false,
    });

    const status = await tool.execute("call-status", { action: "status", sessionId });
    expect(status.details).toMatchObject({
      status: "ready_to_verify",
      authoritativeState: "ready_to_verify",
    });

    const verified = await tool.execute("call-verify", { action: "verify", sessionId });
    expect(verified.details).toMatchObject({
      status: "complete",
      authoritativeState: "complete",
      coverage: {
        expectedChunkCount: 3,
        acquiredChunkCount: 3,
        missingChunkIndexes: [],
        allChunksAcquired: true,
        complete: true,
        verifiedFullHash: true,
        fileStillMatchesFingerprint: true,
      },
    });
  });
});
