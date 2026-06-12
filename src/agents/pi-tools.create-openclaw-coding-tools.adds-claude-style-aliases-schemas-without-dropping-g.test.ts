import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import { createOpenClawReadTool, createSandboxedReadTool } from "./pi-tools.read.js";
import { createHostSandboxFsBridge } from "./test-helpers/host-sandbox-fs-bridge.js";

function extractToolText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const textBlock = content.find((block) => {
    return (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    );
  }) as { text?: string } | undefined;
  return textBlock?.text ?? "";
}

describe("createOpenClawCodingTools read behavior", () => {
  it("applies sandbox path guards to canonical path", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sbx-"));
    const outsidePath = path.join(os.tmpdir(), "openclaw-outside.txt");
    await fs.writeFile(outsidePath, "outside", "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
      });
      await expect(readTool.execute("sandbox-1", { path: outsidePath })).rejects.toThrow(
        /sandbox root/i,
      );
    } finally {
      await fs.rm(outsidePath, { force: true });
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("bounds implicit read output even when context window budget is large", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-bounded-"));
    const filePath = path.join(tmpDir, "big.txt");
    const lines = Array.from(
      { length: 5000 },
      (_unused, i) => `line-${String(i + 1).padStart(4, "0")}`,
    );
    await fs.writeFile(filePath, lines.join("\n"), "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
        modelContextWindowTokens: 200_000,
      });
      const result = await readTool.execute("read-autopage-1", { path: "big.txt" });
      const text = extractToolText(result);
      expect(text).toContain("<path>big.txt</path>");
      expect(text).toContain("<type>file</type>");
      expect(text).toContain("<content>");
      expect(text).toContain("line-0001");
      expect(text).toContain("1: line-0001");
      expect(text).toContain("line-2000");
      expect(text).toContain("2000: line-2000");
      expect(text).not.toContain("line-2001");
      expect(text).not.toContain("line-5000");
      expect(text).not.toContain("Read output capped at");
      expect(text).toContain("[3000 more lines in file. nextOffset=2001.]");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("adds OpenCode-style read window metadata for bounded continuation", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-metadata-"));
    const filePath = path.join(tmpDir, "short.txt");
    await fs.writeFile(filePath, ["one", "two", "three", "four", "five"].join("\n"), "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
      });
      const result = await readTool.execute("read-metadata-1", {
        path: "short.txt",
        offset: 2,
        limit: 2,
      });
      const text = extractToolText(result);
      const details = (result as { details?: { read?: Record<string, unknown> } }).details;
      expect(text).toContain("<path>short.txt</path>");
      expect(text).toContain("2: two");
      expect(text).toContain("3: three");
      expect(text).not.toContain("1: one");
      expect(details?.read).toMatchObject({
        type: "file",
        lineStart: 2,
        lineEnd: 3,
        totalLines: 5,
        returnedLines: 2,
        truncated: true,
        truncatedBy: "lines",
        nextOffset: 4,
        validOffsetRange: {
          start: 1,
          end: 5,
        },
        suggestedOffset: 4,
        maxBytes: 50 * 1024,
      });
      expect(typeof details?.read?.bytesRead).toBe("number");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns OpenCode-style directory pagination metadata through read", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-dir-"));
    await fs.mkdir(path.join(tmpDir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "a.txt"), "a", "utf8");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "b", "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
      });
      const result = await readTool.execute("read-dir-1", { path: ".", limit: 2 });
      const text = extractToolText(result);
      const details = (result as { details?: { read?: Record<string, unknown> } }).details;

      expect(text).toContain("<type>directory</type>");
      expect(text).toContain("<entries>");
      expect(text).toContain("a.txt");
      expect(text).toContain("b.txt");
      expect(text).toContain("Use offset=3 to continue");
      expect(details?.read).toMatchObject({
        type: "directory",
        offset: 1,
        limit: 2,
        entryStart: 1,
        entryEnd: 2,
        totalEntries: 3,
        returnedEntries: 2,
        truncated: true,
        nextOffset: 3,
        validOffsetRange: {
          start: 1,
          end: 3,
        },
        suggestedOffset: 3,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("adds capped continuation guidance when explicit read output reaches byte budget", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-cap-"));
    const filePath = path.join(tmpDir, "huge.txt");
    const lines = Array.from(
      { length: 600 },
      (_unused, i) =>
        `line-${String(i + 1).padStart(4, "0")}-${"abcdefghijklmnopqrstuvwxyz".repeat(20)}`,
    );
    await fs.writeFile(filePath, lines.join("\n"), "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
      });
      const result = await readTool.execute("read-cap-1", { path: "huge.txt", limit: 600 });
      const text = extractToolText(result);
      expect(text).toContain("line-0001");
      expect(text).toMatch(/50(?:\.0)?KB|50 KB/u);
      expect(text).toMatch(/nextOffset=\d+/u);
      expect(text).not.toContain("line-0600");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("bases capped implicit read continuation on the returned window instead of a guessed page size", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-read-short-cap-"));
    const filePath = path.join(tmpDir, "long-lines.txt");
    const lines = Array.from(
      { length: 1357 },
      (_unused, i) =>
        `line-${String(i + 1).padStart(4, "0")}-${"abcdefghijklmnopqrstuvwxyz".repeat(20)}`,
    );
    await fs.writeFile(filePath, lines.join("\n"), "utf8");
    try {
      const readTool = createSandboxedReadTool({
        root: tmpDir,
        bridge: createHostSandboxFsBridge(tmpDir),
      });
      const result = await readTool.execute("read-short-cap-1", { path: "long-lines.txt" });
      const text = extractToolText(result);
      const continuation = /nextOffset=(\d+)/u.exec(text);
      expect(continuation).not.toBeNull();
      expect(Number(continuation?.[1])).toBeGreaterThan(1);
      expect(Number(continuation?.[1])).toBeLessThanOrEqual(lines.length);
      expect(text).not.toContain("Use offset=2001 to continue");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("strips truncation.content details from read results while preserving other fields", async () => {
    const readResult: AgentToolResult<unknown> = {
      content: [{ type: "text" as const, text: "line-0001" }],
      details: {
        truncation: {
          truncated: true,
          outputLines: 1,
          firstLineExceedsLimit: false,
          content: "hidden duplicate payload",
        },
      },
    };
    const baseRead: AgentTool = {
      name: "read",
      label: "read",
      description: "test read",
      parameters: Type.Object({
        path: Type.String(),
        offset: Type.Optional(Type.Number()),
        limit: Type.Optional(Type.Number()),
      }),
      execute: vi.fn(async () => readResult),
    };

    const wrapped = createOpenClawReadTool(
      baseRead as unknown as Parameters<typeof createOpenClawReadTool>[0],
    );
    const result = await wrapped.execute("read-strip-1", { path: "demo.txt", limit: 1 });

    const details = (result as { details?: { truncation?: Record<string, unknown> } }).details;
    expect(details?.truncation).toMatchObject({
      truncated: true,
      outputLines: 1,
      firstLineExceedsLimit: false,
    });
    expect(details?.truncation).not.toHaveProperty("content");
  });
});
