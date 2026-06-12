import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { persistManagedToolOutputSync } from "../config/sessions/managed-output.js";
import type { OpenClawLspService } from "./openclaw-lsp-service.js";
import { createOpenClawReadTool } from "./pi-tools.read.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

function readText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.find((part) => part.type === "text")?.text ?? "";
}

describe("openclaw read tool repo-canonical resolution", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await import("node:fs/promises").then(({ rm }) =>
          rm(dir, { recursive: true, force: true }),
        );
      }
    }
  });

  it("reads repo-canonical docs paths through the product_live import", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-canonical-"));
    tempDirs.push(workspaceRoot);
    const importDoc = path.join(
      workspaceRoot,
      "imports",
      "product_live",
      "content",
      "docs",
      "projects",
      "model-memory",
      "index.md",
    );
    await mkdir(path.dirname(importDoc), { recursive: true });
    await writeFile(importDoc, "# Canonical model-memory\n", "utf8");

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
    });
    const result = await tool.execute("read-docs", { path: "docs/projects/model-memory/index.md" });

    expect(readText(result as { content?: Array<{ type?: string; text?: string }> })).toContain(
      "# Canonical model-memory",
    );
  });

  it("maps baked /app skill paths back onto the canonical import surface", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-skills-"));
    tempDirs.push(workspaceRoot);
    const importSkill = path.join(
      workspaceRoot,
      "imports",
      "product_live",
      "content",
      "skills",
      "model-memory-deep-ingest",
      "SKILL.md",
    );
    await mkdir(path.dirname(importSkill), { recursive: true });
    await writeFile(importSkill, "# Deep ingest skill\n", "utf8");

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
    });
    const result = await tool.execute("read-skill", {
      path: "/app/skills/model-memory-deep-ingest/SKILL.md",
    });

    expect(readText(result as { content?: Array<{ type?: string; text?: string }> })).toContain(
      "# Deep ingest skill",
    );
  });

  it("adds nearby path suggestions when a repo-canonical read path is missing", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-suggest-"));
    tempDirs.push(workspaceRoot);
    const specsDir = path.join(
      workspaceRoot,
      "imports",
      "product_live",
      "content",
      "docs",
      "projects",
      "execution-platform",
      "specs",
    );
    await mkdir(specsDir, { recursive: true });
    await writeFile(
      path.join(specsDir, "openclaw-native-node-worker-agent-refactor.md"),
      "# Native worker agent refactor\n",
      "utf8",
    );
    await writeFile(
      path.join(specsDir, "openclaw-agentic-node-execution-quality-gates.md"),
      "# Quality gates\n",
      "utf8",
    );

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
    });

    await expect(
      tool.execute("read-missing-doc", {
        path: "docs/projects/execution-platform/specs/openclaw-native-node-execution.md",
      }),
    ).rejects.toThrow(
      /Did you mean one of these\?[\s\S]*openclaw-native-node-worker-agent-refactor\.md/u,
    );
  });

  it("returns a bounded EOF result with valid offset guidance instead of throwing", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-eof-"));
    tempDirs.push(workspaceRoot);
    await writeFile(
      path.join(workspaceRoot, "short.txt"),
      ["one", "two", "three"].join("\n"),
      "utf8",
    );

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
    });
    const result = await tool.execute("read-eof", { path: "short.txt", offset: 5000 });
    const text = readText(result as { content?: Array<{ type?: string; text?: string }> });
    const details = (result as { details?: Record<string, unknown> }).details;

    expect(text).toContain("Read reached end of file for short.txt");
    expect(text).toContain("requestedOffset: 5000");
    expect(text).toContain("totalLines: 3");
    expect(text).toContain("last valid offset is 3");
    expect(details).toMatchObject({
      status: "eof",
      path: "short.txt",
      requestedOffset: 5000,
      totalLines: 3,
      returnedLines: 0,
      truncated: false,
      nextOffset: null,
      validOffsetRange: {
        start: 1,
        end: 3,
      },
      suggestedOffset: 3,
    });
  });

  it("keeps repeated path-only large-file reads source-shaped like OpenCode", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-large-repeat-"));
    tempDirs.push(workspaceRoot);
    const filePath = path.join(workspaceRoot, "large.ts");
    const lines = Array.from(
      { length: 2205 },
      (_, index) => `export const line${index + 1} = ${index + 1};`,
    );
    await writeFile(filePath, lines.join("\n"), "utf8");

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
    });
    const first = await tool.execute("read-large-first", { path: "large.ts" });
    const firstText = readText(first as { content?: Array<{ type?: string; text?: string }> });
    expect(firstText).toContain("1: export const line1 = 1;");
    expect(firstText).toContain("1780: export const line1780 = 1780;");
    expect(firstText).toContain("Use offset=1781 to continue");
    expect(firstText).toContain(
      'Exact next read: read({"path":"large.ts","offset":1781,"limit":2000})',
    );

    const rebuiltTool = createOpenClawReadTool(
      createReadTool(workspaceRoot) as unknown as AnyAgentTool,
      {
        workspaceRoot,
      },
    );
    const repeated = await rebuiltTool.execute("read-large-repeat", { path: "large.ts" });
    const repeatedText = readText(
      repeated as { content?: Array<{ type?: string; text?: string }> },
    );
    expect((repeated as { isError?: boolean }).isError).not.toBe(true);
    expect(repeatedText).toContain("1: export const line1 = 1;");
    expect(repeatedText).toContain("1780: export const line1780 = 1780;");
    expect(repeatedText).toContain("Use offset=1781 to continue");
    expect(repeatedText).toContain(
      'Exact next read: read({"path":"large.ts","offset":1781,"limit":2000})',
    );
    expect(repeatedText).not.toContain("Path-only read already returned lines");

    const explicitWindow = await tool.execute("read-large-explicit", {
      path: "large.ts",
      offset: 1781,
      limit: 10,
    });
    const explicitText = readText(
      explicitWindow as { content?: Array<{ type?: string; text?: string }> },
    );
    expect(explicitText).toContain("1781: export const line1781 = 1781;");
    expect(explicitText).toContain("1790: export const line1790 = 1790;");
  });

  it("reads managed-output saved paths through the normal read tool", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-managed-workspace-"));
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-managed-state-"));
    tempDirs.push(workspaceRoot, stateRoot);
    const persisted = persistManagedToolOutputSync({
      stateRoot,
      sessionKey: "agent:execution-coding:session:test",
      toolCallId: "call-managed",
      toolName: "exec",
      text: ["alpha", "target line", "omega"].join("\n"),
      outputKind: "tool_result",
      now: Date.UTC(2026, 5, 8),
    });
    expect(persisted?.outputPath).toBeTruthy();

    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
      stateRoot,
    });
    const result = await tool.execute("read-managed-output-path", {
      path: persisted?.outputPath,
      offset: 2,
      limit: 1,
    });
    const text = readText(result as { content?: Array<{ type?: string; text?: string }> });
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    expect(text).toContain(`<path>${persisted?.outputPath}</path>`);
    expect(text).toContain("2: target line");
    expect(text).toContain("Showing lines 2-2 of 3");
    expect(text).toContain("Use offset=3 to continue");
    expect(text).toContain(
      `Exact next read: read({"path":"${persisted?.outputPath}","offset":3,"limit":2000})`,
    );
  });

  it("warms LSP state after successful source reads without changing read output", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-read-lsp-warm-"));
    tempDirs.push(workspaceRoot);
    await writeFile(path.join(workspaceRoot, "demo.ts"), "export const demo = 1;\n", "utf8");
    const touched: string[] = [];
    const lspService = {
      touchFile: async (filePath: string) => {
        touched.push(filePath);
      },
    } as unknown as OpenClawLspService;
    const tool = createOpenClawReadTool(createReadTool(workspaceRoot) as unknown as AnyAgentTool, {
      workspaceRoot,
      lspService,
    });

    const result = await tool.execute("read-demo", { path: "demo.ts" });
    const text = readText(result as { content?: Array<{ type?: string; text?: string }> });

    expect(text).toContain("1: export const demo = 1;");
    expect(text).not.toContain("LSP");
    expect(touched).toContain(path.join(workspaceRoot, "demo.ts"));
  });
});
