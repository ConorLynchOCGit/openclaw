import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGlobTool, createGrepTool, createListTool } from "./repo-discovery-tools.js";

describe("repo discovery tools", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-repo-discovery-"));
    await fs.mkdir(path.join(workspaceRoot, "src", "agents"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "node_modules", "ignored"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "agents", "worker.ts"),
      "export function runWorker() {\n  return 'context scout keyword';\n}\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "docs", "notes.md"),
      "# Notes\nThe worker validates context scout output.\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "node_modules", "ignored", "package.js"),
      "context scout should not appear here\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("lists bounded directory entries", async () => {
    const tool = createListTool({ workspaceRoot });
    const result = await tool.execute("call-1", { path: ".", maxResults: 20 });

    expect(result.details).toMatchObject({
      status: "ok",
      path: ".",
      entries: [
        { path: "docs", type: "directory" },
        { path: "src", type: "directory" },
      ],
      truncated: false,
    });
  });

  it("globs workspace files without crawling ignored dependency directories", async () => {
    const tool = createGlobTool({ workspaceRoot });
    const result = await tool.execute("call-1", { pattern: "**/*.ts", maxResults: 20 });

    expect(result.details).toMatchObject({
      status: "ok",
      files: ["src/agents/worker.ts"],
      count: 1,
      truncated: false,
    });
  });

  it("greps text and returns bounded file/line matches", async () => {
    const tool = createGrepTool({ workspaceRoot });
    const result = await tool.execute("call-1", {
      query: "context scout",
      glob: "**/*.*",
      maxMatches: 20,
      contextLines: 1,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      query: "context scout",
      matchCount: 2,
      searchedFileCount: 2,
      truncated: false,
    });
    expect(JSON.stringify(result.details)).toContain("src/agents/worker.ts");
    expect(JSON.stringify(result.details)).toContain("docs/notes.md");
    expect(JSON.stringify(result.details)).not.toContain("node_modules");
  });

  it("rejects paths outside the workspace root", async () => {
    const tool = createGrepTool({ workspaceRoot });

    await expect(tool.execute("call-1", { query: "secret", path: "../" })).rejects.toThrow(
      "path must stay within workspace root",
    );
  });
});
