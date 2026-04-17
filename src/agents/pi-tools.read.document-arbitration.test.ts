import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wrapReadToolWithDocumentIngestArbitration } from "./pi-tools.read.js";
import type { AnyAgentTool } from "./tools/common.js";

function createMockReadTool(resultText: string): AnyAgentTool {
  return {
    name: "read",
    label: "read",
    description: "mock read",
    parameters: Type.Object({
      path: Type.String(),
      offset: Type.Optional(Type.Number()),
    }),
    execute: vi.fn(async () => ({
      content: [{ type: "text" as const, text: resultText }],
      details: {},
    })),
  } as unknown as AnyAgentTool;
}

function createMockIngestTool(execute?: AnyAgentTool["execute"]): AnyAgentTool {
  return {
    name: "model_memory_document_ingest",
    label: "Model Memory Document Ingest",
    description: "mock ingest",
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
    }),
    execute:
      execute ??
      (vi.fn(async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        details: { status: "completed" },
      })) as AnyAgentTool["execute"]),
  } as unknown as AnyAgentTool;
}

function readArbitrationDetails(result: unknown): Record<string, unknown> {
  const details = (result as { details?: Record<string, unknown> }).details ?? {};
  const arbitration = details.documentArbitration;
  if (!arbitration || typeof arbitration !== "object" || Array.isArray(arbitration)) {
    throw new Error("missing documentArbitration details");
  }
  return arbitration as Record<string, unknown>;
}

describe("wrapReadToolWithDocumentIngestArbitration", () => {
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("schedules deterministic auto-ingest after capped workspace reads", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-auto-ingest-"));
    cleanupDirs.push(tmpDir);
    const relativePath = "docs/projects/model-memory/roadmap.md";
    const absolutePath = path.join(tmpDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "# roadmap\nhello\n", "utf8");

    const ingestTool = createMockIngestTool();
    const wrapped = wrapReadToolWithDocumentIngestArbitration(
      createMockReadTool(
        "line-0001\n\n[Read output capped at 32KB for this call. Use offset=401 to continue.]",
      ),
      {
        workspaceRoot: tmpDir,
        ingestTool,
      },
    );

    const result = await wrapped.execute("call-auto-1", { path: relativePath });
    const arbitration = readArbitrationDetails(result);

    expect(arbitration.outcome).toBe("read_then_ingest");
    expect(arbitration.ingestStatus).toBe("scheduled");
    expect(arbitration.workspaceRelativePath).toBe(relativePath);
    expect(arbitration.projectId).toBe("model-memory");
    expect(arbitration.recordPath).toMatch(
      /^checkpoints\/model-memory\/auto-read-ingest\/model-memory-auto-read-[a-f0-9]{24}\.json$/,
    );

    await vi.waitFor(() => {
      expect(ingestTool.execute).toHaveBeenCalledTimes(1);
    });

    expect(ingestTool.execute).toHaveBeenCalledWith(
      expect.stringContaining("call-auto-1::auto_ingest"),
      expect.objectContaining({
        source: relativePath,
        resume: true,
        projectId: "model-memory",
      }),
    );
  });

  it("escalates the second read of the same document into ingest even without capped output", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-repeat-ingest-"));
    cleanupDirs.push(tmpDir);
    const relativePath = "docs/system/deployment.md";
    const absolutePath = path.join(tmpDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "deployment notes\n", "utf8");

    const ingestTool = createMockIngestTool();
    const wrapped = wrapReadToolWithDocumentIngestArbitration(
      createMockReadTool("deployment notes"),
      {
        workspaceRoot: tmpDir,
        ingestTool,
      },
    );

    const first = await wrapped.execute("call-repeat-1", { path: relativePath });
    expect(readArbitrationDetails(first)).toMatchObject({
      outcome: "read_only",
      ingestStatus: "skipped",
      skipReason: "no_auto_ingest_trigger",
    });

    const second = await wrapped.execute("call-repeat-2", { path: relativePath });
    const arbitration = readArbitrationDetails(second);
    expect(arbitration.outcome).toBe("read_then_ingest");
    expect(arbitration.triggers).toEqual(["repeated_read"]);

    await vi.waitFor(() => {
      expect(ingestTool.execute).toHaveBeenCalledTimes(1);
    });
  });

  it("reuses an in-flight auto-ingest instead of starting a duplicate run", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-dedupe-ingest-"));
    cleanupDirs.push(tmpDir);
    const relativePath = "docs/projects/deployment-topology/index.md";
    const absolutePath = path.join(tmpDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "deployment topology\n", "utf8");

    let resolveIngest: (() => void) | undefined;
    const ingestTool = createMockIngestTool(
      vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            resolveIngest = () => resolve();
          }).then(() => ({
            content: [{ type: "text" as const, text: "ok" }],
            details: { status: "completed" },
          })),
      ) as AnyAgentTool["execute"],
    );
    const wrapped = wrapReadToolWithDocumentIngestArbitration(
      createMockReadTool(
        "line-0001\n\n[Read output capped at 32KB for this call. Use offset=401 to continue.]",
      ),
      {
        workspaceRoot: tmpDir,
        ingestTool,
      },
    );

    const first = await wrapped.execute("call-dedupe-1", { path: relativePath });
    expect(readArbitrationDetails(first)).toMatchObject({
      outcome: "read_then_ingest",
      ingestStatus: "scheduled",
    });

    const second = await wrapped.execute("call-dedupe-2", { path: relativePath });
    expect(readArbitrationDetails(second)).toMatchObject({
      outcome: "reuse_existing_ingest",
      ingestStatus: "pending",
    });
    expect(ingestTool.execute).toHaveBeenCalledTimes(1);

    resolveIngest?.();
    await vi.waitFor(() => {
      const maybeResolved = readArbitrationDetails(second);
      expect(maybeResolved.outcome).toBe("reuse_existing_ingest");
    });
  });

  it("does not auto-ingest files outside the workspace root", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-outside-skip-"));
    cleanupDirs.push(tmpDir);
    const outsideFile = path.join(os.tmpdir(), "openclaw-read-outside-skip.txt");
    await fs.writeFile(outsideFile, "outside\n", "utf8");

    const ingestTool = createMockIngestTool();
    const wrapped = wrapReadToolWithDocumentIngestArbitration(createMockReadTool("outside"), {
      workspaceRoot: tmpDir,
      ingestTool,
    });

    const result = await wrapped.execute("call-outside-1", { path: outsideFile });
    expect(readArbitrationDetails(result)).toMatchObject({
      outcome: "read_only",
      ingestStatus: "skipped",
      skipReason: "outside_workspace",
    });
    expect(ingestTool.execute).not.toHaveBeenCalled();

    await fs.rm(outsideFile, { force: true });
  });
});
