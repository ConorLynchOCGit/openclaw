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
    await fs.mkdir(path.join(workspaceRoot, ".openclaw", "runtime", "sessions"), {
      recursive: true,
    });
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
    await fs.writeFile(
      path.join(workspaceRoot, ".openclaw", "runtime", "sessions", "session.jsonl"),
      "context scout should not appear in runtime state transcripts\n",
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
      offset: 1,
      totalEntries: 3,
      returnedEntries: 3,
      nextOffset: null,
      entries: [
        { path: ".openclaw", type: "directory" },
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
    expect(JSON.stringify(result.details)).not.toContain(".openclaw/runtime");
  });

  it("caps glob and grep outputs at the OpenCode-style 100 result limit", async () => {
    await fs.mkdir(path.join(workspaceRoot, "many"), { recursive: true });
    await Promise.all(
      Array.from({ length: 120 }, async (_unused, index) => {
        const label = String(index + 1).padStart(3, "0");
        await fs.writeFile(
          path.join(workspaceRoot, "many", `match-${label}.ts`),
          `export const match${label} = "opencode bounded result";\n`,
          "utf8",
        );
      }),
    );

    const globTool = createGlobTool({ workspaceRoot });
    const globResult = await globTool.execute("call-glob-cap", {
      pattern: "many/*.ts",
      maxResults: 500,
    });

    expect(globResult.details).toMatchObject({
      status: "ok",
      count: 100,
      truncated: true,
      hiddenCount: 20,
    });
    expect(JSON.stringify(globResult.details)).toContain(
      "Use a more specific path or glob pattern",
    );

    const grepTool = createGrepTool({ workspaceRoot });
    const grepResult = await grepTool.execute("call-grep-cap", {
      query: "opencode bounded result",
      path: "many",
      maxMatches: 500,
    });

    expect(grepResult.details).toMatchObject({
      status: "ok",
      matchCount: 100,
      truncated: true,
    });
    expect(JSON.stringify(grepResult.details)).toContain(
      "Use a more specific path, glob, or query",
    );
  });

  it("paginates directory list results with OpenCode-style continuation metadata", async () => {
    await fs.mkdir(path.join(workspaceRoot, "paged"), { recursive: true });
    await Promise.all(
      Array.from({ length: 5 }, async (_unused, index) => {
        await fs.writeFile(path.join(workspaceRoot, "paged", `entry-${index + 1}.txt`), "", "utf8");
      }),
    );

    const tool = createListTool({ workspaceRoot });
    const first = await tool.execute("call-list-page-1", {
      path: "paged",
      maxResults: 2,
    });
    expect(first.details).toMatchObject({
      status: "ok",
      path: "paged",
      offset: 1,
      totalEntries: 5,
      returnedEntries: 2,
      hiddenCount: 3,
      nextOffset: 3,
      truncated: true,
    });
    expect(JSON.stringify(first.details)).toContain("Use offset=3 to continue");

    const second = await tool.execute("call-list-page-2", {
      path: "paged",
      offset: 3,
      maxResults: 3,
    });
    expect(second.details).toMatchObject({
      status: "ok",
      path: "paged",
      offset: 3,
      totalEntries: 5,
      returnedEntries: 3,
      hiddenCount: 0,
      nextOffset: null,
      truncated: false,
    });
  });

  it("does not expose runtime state through default repo discovery", async () => {
    const listTool = createListTool({ workspaceRoot });
    const listResult = await listTool.execute("call-list", { path: ".openclaw", maxResults: 20 });
    expect(JSON.stringify(listResult.details)).not.toContain("runtime");

    const globTool = createGlobTool({ workspaceRoot });
    const globResult = await globTool.execute("call-glob", {
      pattern: "**/*.jsonl",
      maxResults: 20,
    });
    expect(globResult.details).toMatchObject({
      status: "ok",
      files: [],
      count: 0,
    });

    const grepTool = createGrepTool({ workspaceRoot });
    const grepResult = await grepTool.execute("call-grep", {
      query: "runtime state transcripts",
      glob: "**/*.*",
      maxMatches: 20,
    });
    expect(grepResult.details).toMatchObject({
      status: "ok",
      matchCount: 0,
    });
  });

  it("excludes the native Location.stateRoot even when it is not the default runtime path", async () => {
    const stateRoot = path.join(workspaceRoot, "state-home");
    await fs.mkdir(path.join(stateRoot, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(stateRoot, "sessions", "session.jsonl"),
      "context scout should not appear in alternate state root transcripts\n",
      "utf8",
    );

    const listTool = createListTool({ workspaceRoot, stateRoot });
    const listResult = await listTool.execute("call-list-state-root", {
      path: ".",
      maxResults: 20,
    });
    expect(JSON.stringify(listResult.details)).not.toContain("state-home");

    const globTool = createGlobTool({ workspaceRoot, stateRoot });
    const globResult = await globTool.execute("call-glob-state-root", {
      pattern: "**/*.jsonl",
      maxResults: 20,
    });
    expect(globResult.details).toMatchObject({
      status: "ok",
      files: [],
      count: 0,
    });

    const grepTool = createGrepTool({ workspaceRoot, stateRoot });
    const grepResult = await grepTool.execute("call-grep-state-root", {
      query: "alternate state root transcripts",
      glob: "**/*.*",
      maxMatches: 20,
    });
    expect(grepResult.details).toMatchObject({
      status: "ok",
      matchCount: 0,
    });
  });

  it("rejects paths outside the workspace root", async () => {
    const tool = createGrepTool({ workspaceRoot });

    await expect(tool.execute("call-1", { query: "secret", path: "../" })).rejects.toThrow(
      "path must stay within workspace root",
    );
  });
});
