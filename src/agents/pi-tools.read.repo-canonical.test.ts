import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
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
});
