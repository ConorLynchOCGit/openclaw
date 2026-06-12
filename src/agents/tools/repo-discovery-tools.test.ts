import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { persistManagedToolOutputSync } from "../../config/sessions/managed-output.js";
import { createGlobTool, createGrepTool, createListTool } from "./repo-discovery-tools.js";

function readText(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("\n");
}

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
    expect(readText(result)).toContain("directory\tdocs");
    expect(readText(result)).not.toContain('"entries":');
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
    expect(readText(result)).toContain("src/agents/worker.ts");
    expect(readText(result)).not.toContain('"files":');
  });

  it("supports brace glob alternates like OpenCode include patterns", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "agents", "view.tsx"),
      "export const view = true;\n",
    );
    await fs.writeFile(path.join(workspaceRoot, "src", "agents", "style.css"), ".view {}\n");

    const globTool = createGlobTool({ workspaceRoot });
    const globResult = await globTool.execute("call-brace-glob", {
      pattern: "src/agents/*.{ts,tsx}",
    });

    expect(readText(globResult)).toContain("src/agents/worker.ts");
    expect(readText(globResult)).toContain("src/agents/view.tsx");
    expect(readText(globResult)).not.toContain("src/agents/style.css");

    const grepTool = createGrepTool({ workspaceRoot });
    const grepResult = await grepTool.execute("call-brace-grep", {
      query: "export",
      glob: "src/agents/*.{ts,tsx}",
    });

    expect(readText(grepResult)).toContain("src/agents/worker.ts:");
    expect(readText(grepResult)).toContain("src/agents/view.tsx:");
    expect(readText(grepResult)).not.toContain("src/agents/style.css:");
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
      regex: true,
      matchCount: 2,
      searchedFileCount: 2,
      truncated: false,
    });
    expect(JSON.stringify(result.details)).toContain("src/agents/worker.ts");
    expect(JSON.stringify(result.details)).toContain("docs/notes.md");
    expect(JSON.stringify(result.details)).not.toContain("node_modules");
    expect(JSON.stringify(result.details)).not.toContain(".openclaw/runtime");
    expect(JSON.stringify(result.details)).not.toContain("suggestedRead");
    expect(JSON.stringify(result.details)).not.toContain("suggestedReads");
    expect((result.details as { text?: string }).text).not.toContain("suggested_read");
    expect(readText(result)).toContain("src/agents/worker.ts:");
    expect(readText(result)).toContain("Line 2:");
    expect(readText(result)).not.toContain('"matches":');
  });

  it("treats grep queries as regex by default", async () => {
    await fs.mkdir(path.join(workspaceRoot, "tests"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "tests", "worker.test.ts"),
      "describe('worker', () => {\n  it('runs', () => {});\n});\n",
      "utf8",
    );

    const tool = createGrepTool({ workspaceRoot });
    const result = await tool.execute("call-regex-default", {
      query: "describe\\(|it\\(",
      path: "tests",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      regex: true,
      matchCount: 2,
    });
    expect((result.details as { text?: string }).text).toContain("tests/worker.test.ts:");
    expect((result.details as { text?: string }).text).toContain("Line 1:");
    expect((result.details as { text?: string }).text).toContain("Line 2:");
    expect(readText(result)).toContain("tests/worker.test.ts:");
  });

  it("supports explicit literal grep fallback", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "agents", "regex-literal.ts"),
      "const literal = 'a.b';\nconst regexMatch = 'axb';\n",
      "utf8",
    );

    const tool = createGrepTool({ workspaceRoot });
    const result = await tool.execute("call-literal-fallback", {
      query: "a.b",
      path: "src/agents/regex-literal.ts",
      regex: false,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      regex: false,
      matchCount: 1,
    });
    expect((result.details as { text?: string }).text).toContain("Line 1:");
    expect((result.details as { text?: string }).text).not.toContain("Line 2:");
    expect(readText(result)).toContain("Line 1:");
  });

  it("adds small source excerpts for file-scoped grep matches", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "agents", "exact.ts"),
      [
        "const beforeOne = true;",
        "const beforeTwo = true;",
        "export function targetSymbol() {",
        "  return beforeOne && beforeTwo;",
        "}",
        "const afterOne = true;",
      ].join("\n"),
      "utf8",
    );

    const tool = createGrepTool({ workspaceRoot });
    const result = await tool.execute("call-file-scoped-excerpt", {
      query: "targetSymbol",
      path: "src/agents/exact.ts",
    });
    const text = readText(result);

    expect(text).toContain("src/agents/exact.ts:");
    expect(text).toContain("  1: const beforeOne = true;");
    expect(text).toContain("  2: const beforeTwo = true;");
    expect(text).toContain("  Line 3: export function targetSymbol() {");
    expect(text).toContain("  4:   return beforeOne && beforeTwo;");
    expect(text).toContain("  5: }");
    expect(result.details).toMatchObject({
      matchCount: 1,
      matches: [
        {
          line: 3,
          contextBefore: [{ line: 1 }, { line: 2 }],
          contextAfter: [{ line: 4 }, { line: 5 }],
        },
      ],
    });
  });

  it("returns a bounded invalid-regex diagnostic with literal-search guidance", async () => {
    const tool = createGrepTool({ workspaceRoot });
    const result = await tool.execute("call-invalid-regex", {
      query: "buildWorkQueueExecutionReadModel(",
      glob: "**/*.ts",
    });

    expect(result.details).toMatchObject({
      status: "invalid_regex",
      query: "buildWorkQueueExecutionReadModel(",
      regex: true,
      suggestedRetry: {
        query: "buildWorkQueueExecutionReadModel(",
        regex: false,
      },
    });
    expect(JSON.stringify(result.details)).toContain("Retry the same query with regex:false");
    expect(readText(result)).toContain("Retry the same query with regex:false");
    expect(readText(result)).not.toContain('"invalid_regex"');
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
    expect(readText(globResult)).toContain("many/match-001.ts");

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
    expect(readText(grepResult)).toContain("Found 100 matches (more matches available)");
    expect(readText(grepResult)).toContain(
      "(Results truncated: showing 100 matches (20 hidden). Consider using a more specific path or pattern.)",
    );
  });

  it("searches the requested scope before capping returned grep matches", async () => {
    await fs.mkdir(path.join(workspaceRoot, "truncated"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "truncated", "a-first.ts"),
      "no signal here\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "truncated", "z-later.ts"),
      "export const targetSymbol = true;\n",
      "utf8",
    );

    const grepTool = createGrepTool({ workspaceRoot });
    const result = await grepTool.execute("call-grep-search-first", {
      query: "targetSymbol",
      path: "truncated",
    });

    expect(result.details).toMatchObject({
      status: "ok",
      matchCount: 1,
      searchedFileCount: 2,
      truncated: false,
    });
    expect((result.details as { text?: string }).text).toContain("truncated/z-later.ts:");
    expect((result.details as { text?: string }).text).toContain("Line 1:");
    expect((result.details as { text?: string }).text).not.toContain(
      "Search incomplete before match confidence.",
    );
    expect(JSON.stringify(result.details)).not.toContain("hiddenCandidateFileCount");
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

  it("greps exact managed-output saved paths through the normal grep tool", async () => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-grep-managed-state-"));
    const persisted = persistManagedToolOutputSync({
      stateRoot,
      sessionKey: "agent:execution-validation-scout:subagent:test",
      toolCallId: "call-managed-grep",
      toolName: "exec",
      text: ["setup ok", "error TS1234: target diagnostic", "done"].join("\n"),
      outputKind: "tool_result",
      now: Date.UTC(2026, 5, 8),
    });
    const grepTool = createGrepTool({ workspaceRoot, stateRoot });
    const result = await grepTool.execute("call-managed-output-grep", {
      query: "TS1234",
      path: persisted?.outputPath,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      matchCount: 1,
      searchedFileCount: 1,
      truncated: false,
    });
    expect(readText(result)).toContain(`${persisted?.outputPath}:`);
    expect(readText(result)).toContain("Line 2: error TS1234: target diagnostic");

    await fs.rm(stateRoot, { recursive: true, force: true });
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
