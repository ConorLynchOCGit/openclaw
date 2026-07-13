// OpenClaw Coding Workbench MCP tests cover bounded repo inspection helpers.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workbenchModulePath = path.resolve(
  ".agents/plugins/plugins/openclaw-coding-workbench/mcp/openclaw-repo-workbench.mjs",
);
const workbenchModuleUrl = pathToFileURL(workbenchModulePath).href;

type WorkbenchModule = {
  repoSearchMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    limits: {
      maxResponseBytes: number;
    };
    coverage: {
      requestedQueries: number;
      matchedQueries: number;
      returnedItems: number;
      omittedItems: number;
    };
    results: Array<{
      status: string;
      items?: Array<{
        path?: string;
        line?: number;
        character?: number;
        text?: string;
        context?: boolean;
      }>;
      error?: string;
      effectiveMaxMatches?: number;
      requestedMaxMatches?: number;
      maxMatchesClamped?: boolean;
      effectiveContextLines?: number;
      requestedContextLines?: number;
      contextLinesClamped?: boolean;
      responseTruncated?: boolean;
      omittedItems?: number;
      nextAction?: string;
    }>;
  }>;
  repoReadMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    limits: {
      maxResponseBytes: number;
    };
    results: Array<{
      status: string;
      path?: string;
      text?: string;
      error?: string;
      totalLines?: number;
      returnedStartLine?: number;
      returnedEndLine?: number;
      returnedBytes?: number;
      truncated?: boolean;
      nextStartLine?: number;
      effectiveMaxBytes?: number;
      requestedMaxBytes?: number;
      maxBytesClamped?: boolean;
    }>;
    omitted: Array<{
      path: string;
      nextStartLine: number;
      reason: string;
    }>;
    coverage: {
      requested: number;
      returned: number;
      truncated: number;
      errors: number;
      omitted: number;
    };
  }>;
  mcpResult(value: unknown): {
    structuredContent: unknown;
    content?: unknown;
  };
  repoGlobMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{
      status: string;
      files?: string[];
      effectiveMaxResults?: number;
      requestedMaxResults?: number;
      maxResultsClamped?: boolean;
    }>;
  }>;
  gitInspectMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    gitRoots?: string[];
    results: Array<{
      status: string;
      stdout?: string;
      repoRoot?: string;
      error?: string;
      effectiveMaxBytes?: number;
      requestedMaxBytes?: number;
      maxBytesClamped?: boolean;
    }>;
  }>;
  lspHoverTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    display?: string;
    error?: string;
  }>;
  lspDefinitionTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    projectMode?: string;
    projectFileCount?: number;
    lspPartial?: boolean;
    projectFileLimitReached?: boolean;
    effectiveMaxResults?: number;
    requestedMaxResults?: number;
    maxResultsClamped?: boolean;
    definitions?: Array<{ path?: string; line?: number; character?: number }>;
    error?: string;
  }>;
  lspReferencesTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    effectiveMaxResults?: number;
    requestedMaxResults?: number;
    maxResultsClamped?: boolean;
    references?: Array<{ path?: string; line?: number; character?: number }>;
    error?: string;
  }>;
};

let tempDirs: string[] = [];

async function loadWorkbench(): Promise<WorkbenchModule> {
  return (await import(workbenchModuleUrl)) as WorkbenchModule;
}

async function makeRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-"));
  tempDirs.push(tempDir);
  await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"fixture"}\n', "utf8");
  await fs.writeFile(path.join(tempDir, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "src", "alpha.ts"),
    ["export const alpha = 1;", "export const beta = alpha + 1;", ""].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "src", "gamma.ts"),
    ['import { alpha } from "./alpha.js";', "export const gamma = alpha + 2;", ""].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "src", "unrelated.ts"),
    "export const unrelated = 3;\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await execFileAsync("git", ["init"], { cwd: tempDir });
  await execFileAsync("git", ["add", "."], { cwd: tempDir });
  return tempDir;
}

async function makeWorkspaceWithNestedSource(): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-ws-"));
  tempDirs.push(workspace);
  await fs.mkdir(path.join(workspace, "business-ops"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, "business-ops", "brief.md"),
    "American Atomics proof surface\n",
    "utf8",
  );
  await fs.mkdir(path.join(workspace, "artifacts"), { recursive: true });
  await fs.writeFile(path.join(workspace, "artifacts", "trace.jsonl"), "{}\n", "utf8");
  const source = path.join(workspace, "src", "openclaw");
  await fs.mkdir(path.join(source, "src", "agents"), { recursive: true });
  await fs.writeFile(path.join(source, "package.json"), '{"name":"openclaw"}\n', "utf8");
  await fs.writeFile(path.join(source, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  await fs.writeFile(
    path.join(source, "src", "agents", "task-tool.ts"),
    "export const task = 1;\n",
  );
  await execFileAsync("git", ["init"], { cwd: workspace });
  await execFileAsync("git", ["add", "business-ops/brief.md"], { cwd: workspace });
  await execFileAsync("git", ["init"], { cwd: source });
  await execFileAsync("git", ["add", "."], { cwd: source });
  return workspace;
}

function optionsFor(repo: string) {
  return {
    cwd: repo,
    env: {
      ...process.env,
      OPENCLAW_REPO_WORKBENCH_ROOT: repo,
    },
  };
}

function workspaceOptionsFor(workspace: string) {
  return {
    cwd: workspace,
    env: {
      ...process.env,
      OPENCLAW_REPO_WORKBENCH_ROOT: workspace,
      OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT: path.join(workspace, "src", "openclaw"),
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("openclaw-coding-workbench MCP helpers", () => {
  it("reads multiple bounded file ranges and rejects path escapes", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const result = await workbench.repoReadMany(
      {
        files: [{ path: "src/alpha.ts", startLine: 1, endLine: 1 }, { path: "../outside.txt" }],
      },
      optionsFor(repo),
    );

    expect(result.results[0]).toMatchObject({
      status: "ok",
      text: "1: export const alpha = 1;",
      returnedStartLine: 1,
      returnedEndLine: 1,
      totalLines: 3,
    });
    expect(result.results[1]).toMatchObject({
      status: "error",
      error: expect.stringContaining("path escapes repository root"),
    });
  });

  it("clamps optimistic size and result hints instead of failing schema-style", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const read = await workbench.repoReadMany(
      {
        files: [{ path: "src/alpha.ts", maxBytes: 200_000 }],
      },
      optionsFor(repo),
    );
    const search = await workbench.repoSearchMany(
      {
        queries: [{ pattern: "alpha", path: "src", maxMatches: 2_000, contextLines: 8 }],
      },
      optionsFor(repo),
    );
    const glob = await workbench.repoGlobMany(
      {
        globs: [{ pattern: "src/**/*.ts", maxResults: 2_000 }],
      },
      optionsFor(repo),
    );
    const git = await workbench.gitInspectMany(
      {
        requests: [{ kind: "status", maxBytes: 200_000 }],
      },
      optionsFor(repo),
    );
    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/alpha.ts", line: 2, character: 21, maxResults: 2_000 },
      optionsFor(repo),
    );

    expect(read.results[0]).toMatchObject({
      status: "ok",
      requestedMaxBytes: 200_000,
      effectiveMaxBytes: 12_000,
      maxBytesClamped: true,
    });
    expect(search.results[0]).toMatchObject({
      status: "matched",
      requestedMaxMatches: 2_000,
      effectiveMaxMatches: 60,
      maxMatchesClamped: true,
      requestedContextLines: 8,
      effectiveContextLines: 5,
      contextLinesClamped: true,
    });
    expect(glob.results[0]).toMatchObject({
      status: "ok",
      requestedMaxResults: 2_000,
      effectiveMaxResults: 200,
      maxResultsClamped: true,
    });
    expect(git.results[0]).toMatchObject({
      status: "ok",
      requestedMaxBytes: 200_000,
      effectiveMaxBytes: 64_000,
      maxBytesClamped: true,
    });
    expect(definition).toMatchObject({
      status: "ok",
      requestedMaxResults: 2_000,
      effectiveMaxResults: 200,
      maxResultsClamped: true,
    });
  });

  it("caps aggregate read output, names omissions, and resumes exact line ranges", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    const files = [];
    const legacyBodies = [];
    for (let fileIndex = 0; fileIndex < 20; fileIndex += 1) {
      const relativePath = `src/bulk-${fileIndex}.md`;
      const body = Array.from(
        { length: 100 },
        (_, lineIndex) => `file ${fileIndex} line ${lineIndex + 1} ${"x".repeat(88)}`,
      ).join("\n");
      await fs.writeFile(path.join(repo, relativePath), `${body}\n`, "utf8");
      files.push({ path: relativePath, maxBytes: 200_000 });
      legacyBodies.push(body);
    }

    const read = await workbench.repoReadMany({ files }, optionsFor(repo));
    const serialized = JSON.stringify(read);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(read.limits.maxResponseBytes);
    expect(read.coverage.requested).toBe(20);
    expect(read.coverage.returned + read.coverage.errors + read.coverage.omitted).toBe(20);
    expect(read.coverage.truncated).toBeGreaterThan(0);
    expect(read.omitted.length).toBeGreaterThan(0);
    expect(read.omitted.every((item) => item.reason.includes("aggregate"))).toBe(true);
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain('"lineNumberedContent"');
    expect(serialized).not.toContain('"request"');

    const truncated = read.results.find(
      (item) => item.status === "ok" && item.truncated && item.nextStartLine,
    );
    expect(truncated).toBeDefined();
    const continuation = await workbench.repoReadMany(
      {
        files: [{ path: truncated?.path, startLine: truncated?.nextStartLine }],
      },
      optionsFor(repo),
    );
    expect(continuation.results[0]?.text).toMatch(
      new RegExp(`^${truncated?.nextStartLine}: `, "u"),
    );

    const toolResult = workbench.mcpResult(read);
    expect(toolResult).toEqual({ structuredContent: read });
    expect(toolResult.content).toBeUndefined();

    const legacyValue = {
      schemaVersion: "openclaw.repo_workbench.read_many.v1",
      root: repo,
      results: legacyBodies.map((content, index) => ({
        request: files[index],
        path: files[index]?.path,
        status: "ok",
        content,
        lineNumberedContent: content
          .split("\n")
          .map((line, lineIndex) => `${lineIndex + 1}: ${line}`)
          .join("\n"),
      })),
    };
    const legacyModelVisibleBytes = Buffer.byteLength(
      JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(legacyValue, null, 2) }],
        structuredContent: legacyValue,
      }),
      "utf8",
    );
    const currentModelVisibleBytes = Buffer.byteLength(JSON.stringify(toolResult), "utf8");
    expect(currentModelVisibleBytes).toBeLessThanOrEqual(legacyModelVisibleBytes * 0.3);
  });

  it("publishes an output schema and structured-only result over MCP", async () => {
    const repo = await makeRepo();
    const client = new Client({ name: "workbench-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [workbenchModulePath],
      cwd: repo,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? os.homedir(),
        OPENCLAW_REPO_WORKBENCH_ROOT: repo,
      },
    });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      const readTool = listed.tools.find((tool) => tool.name === "repo_read_many");
      const searchTool = listed.tools.find((tool) => tool.name === "repo_search_many");
      expect(readTool?.outputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          results: expect.any(Object),
          omitted: expect.any(Object),
          coverage: expect.any(Object),
        }),
      });
      expect(searchTool?.outputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          results: expect.any(Object),
          coverage: expect.any(Object),
        }),
      });

      const called = await client.callTool({
        name: "repo_read_many",
        arguments: { files: [{ path: "src/alpha.ts", startLine: 1, endLine: 1 }] },
      });
      expect(called.structuredContent).toMatchObject({
        schemaVersion: "openclaw.repo_workbench.read_many.v2",
        results: [expect.objectContaining({ text: "1: export const alpha = 1;" })],
      });
      expect(called.content).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("searches and globs in bounded batches", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      {
        queries: [
          { pattern: "alpha", path: "src", maxMatches: 5 },
          { pattern: "does-not-exist", path: "src", maxMatches: 5 },
        ],
      },
      optionsFor(repo),
    );
    const glob = await workbench.repoGlobMany(
      { globs: [{ pattern: "src/**/*.ts", maxResults: 10 }] },
      optionsFor(repo),
    );

    expect(search.results[0].status).toBe("matched");
    expect(search.results[0].items).toContainEqual(
      expect.objectContaining({
        path: "src/alpha.ts",
        line: 1,
        character: 14,
        text: "export const alpha = 1;",
      }),
    );
    expect(search.results[1].status).toBe("no_match");
    expect(JSON.stringify(search)).not.toContain('"matches"');
    expect(JSON.stringify(search)).not.toContain('"request"');
    expect(glob.results[0].status).toBe("ok");
    expect(glob.results[0].files).toHaveLength(3);
    expect(glob.results[0].files).toEqual(
      expect.arrayContaining(["src/alpha.ts", "src/gamma.ts", "src/unrelated.ts"]),
    );
  });

  it("reports bounded git status without mutating the repository", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "src", "beta.ts"), "export const beta = 2;\n", "utf8");
    const workbench = await loadWorkbench();

    const result = await workbench.gitInspectMany(
      {
        requests: [
          { kind: "status", maxBytes: 2000 },
          { kind: "changed_files", maxBytes: 2000 },
        ],
      },
      optionsFor(repo),
    );

    expect(result.results[0]).toMatchObject({
      status: "ok",
      stdout: expect.stringContaining("?? src/beta.ts"),
    });
    expect(result.results[1]).toMatchObject({
      status: "ok",
    });
  });

  it("searches the live workspace root while preserving nested source access", async () => {
    const workspace = await makeWorkspaceWithNestedSource();
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      {
        queries: [
          { pattern: "American Atomics", path: "business-ops", maxMatches: 5 },
          { pattern: "task", path: "src/openclaw/src/agents", maxMatches: 5 },
        ],
      },
      workspaceOptionsFor(workspace),
    );

    expect(search.results[0].status).toBe("matched");
    expect(search.results[0].items).toContainEqual(
      expect.objectContaining({ path: "business-ops/brief.md" }),
    );
    expect(search.results[1].status).toBe("matched");
    expect(search.results[1].items).toContainEqual(
      expect.objectContaining({ path: "src/openclaw/src/agents/task-tool.ts" }),
    );
  });

  it("caps aggregate search output without duplicating match bodies", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    for (let fileIndex = 0; fileIndex < 20; fileIndex += 1) {
      await fs.writeFile(
        path.join(repo, "src", `search-${fileIndex}.md`),
        Array.from(
          { length: 80 },
          (_, lineIndex) => `decision-anchor ${fileIndex}-${lineIndex} ${"x".repeat(70)}`,
        ).join("\n"),
        "utf8",
      );
    }

    const search = await workbench.repoSearchMany(
      {
        queries: Array.from({ length: 8 }, () => ({
          pattern: "decision-anchor",
          path: "src",
          maxMatches: 2_000,
          contextLines: 8,
        })),
      },
      optionsFor(repo),
    );
    const serialized = JSON.stringify(search);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(
      search.limits.maxResponseBytes,
    );
    expect(search.coverage.requestedQueries).toBe(8);
    expect(search.coverage.matchedQueries).toBe(8);
    expect(search.coverage.omittedItems).toBeGreaterThan(0);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responseTruncated: true,
          nextAction: "narrow_pattern_or_path",
        }),
      ]),
    );
    expect(serialized).not.toContain('"matches"');
    expect(serialized).not.toContain('"request"');
  });

  it("excludes runtime artifacts from read/search by default", async () => {
    const workspace = await makeWorkspaceWithNestedSource();
    const workbench = await loadWorkbench();

    const read = await workbench.repoReadMany(
      {
        files: [{ path: "artifacts/trace.jsonl" }],
      },
      workspaceOptionsFor(workspace),
    );
    const search = await workbench.repoSearchMany(
      {
        queries: [{ pattern: "{}", path: "artifacts", maxMatches: 5 }],
      },
      workspaceOptionsFor(workspace),
    );

    expect(read.results[0]).toMatchObject({
      status: "error",
      error: expect.stringContaining("excluded from workbench access"),
    });
    expect(search.results[0].status).toBe("error");
  });

  it("reports both workspace and nested source git roots by default", async () => {
    const workspace = await makeWorkspaceWithNestedSource();
    await fs.writeFile(path.join(workspace, "business-ops", "new.md"), "new\n", "utf8");
    await fs.writeFile(
      path.join(workspace, "src", "openclaw", "src", "agents", "new.ts"),
      "export const next = 2;\n",
      "utf8",
    );
    const workbench = await loadWorkbench();

    const result = await workbench.gitInspectMany(
      {
        requests: [{ kind: "status", maxBytes: 2000 }],
      },
      workspaceOptionsFor(workspace),
    );

    expect(result.gitRoots).toEqual([".", "src/openclaw"]);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ repoRoot: ".", status: "ok" }),
        expect.objectContaining({ repoRoot: "src/openclaw", status: "ok" }),
      ]),
    );
  });

  it("returns TypeScript hover, definition, and references through read-only LSP helpers", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const hover = await workbench.lspHoverTypescript(
      { file: "src/alpha.ts", line: 1, character: 14 },
      optionsFor(repo),
    );
    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/alpha.ts", line: 2, character: 21 },
      optionsFor(repo),
    );
    const references = await workbench.lspReferencesTypescript(
      { file: "src/alpha.ts", line: 1, character: 14, maxResults: 10 },
      optionsFor(repo),
    );

    expect(hover).toMatchObject({
      status: "ok",
      display: expect.stringContaining("alpha"),
    });
    expect(definition).toMatchObject({
      status: "ok",
      definitions: [expect.objectContaining({ path: "src/alpha.ts", line: 1 })],
    });
    expect(references.status).toBe("ok");
    expect(references.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/alpha.ts", line: 1 }),
        expect.objectContaining({ path: "src/alpha.ts", line: 2 }),
      ]),
    );
  });

  it("resolves cross-file definitions through a bounded TypeScript dependency closure", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    const options = optionsFor(repo);
    options.env.OPENCLAW_REPO_WORKBENCH_LSP_MAX_PROJECT_FILES = "2";

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/gamma.ts", line: 2, character: 22 },
      options,
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 2,
      lspPartial: true,
      projectFileLimitReached: false,
      definitions: [expect.objectContaining({ path: "src/alpha.ts", line: 1 })],
    });
  });

  it("stops TypeScript dependency traversal at the configured file budget", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "src", "chain-root.ts"),
      'import { middle } from "./chain-middle.js";\nexport const root = middle;\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(repo, "src", "chain-middle.ts"),
      'import { leaf } from "./chain-leaf.js";\nexport const middle = leaf;\n',
      "utf8",
    );
    await fs.writeFile(path.join(repo, "src", "chain-leaf.ts"), "export const leaf = 1;\n", "utf8");
    const workbench = await loadWorkbench();
    const options = optionsFor(repo);
    options.env.OPENCLAW_REPO_WORKBENCH_LSP_MAX_PROJECT_FILES = "2";

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/chain-root.ts", line: 2, character: 21 },
      options,
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 2,
      lspPartial: true,
      projectFileLimitReached: true,
      definitions: [expect.objectContaining({ path: "src/chain-middle.ts", line: 2 })],
    });
  });

  it("rejects TypeScript dependencies that escape the workspace through symlinks", async () => {
    const repo = await makeRepo();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-outside-"));
    tempDirs.push(outside);
    await fs.writeFile(path.join(outside, "outside.ts"), "export const outside = 1;\n", "utf8");
    await fs.symlink(path.join(outside, "outside.ts"), path.join(repo, "src", "linked.ts"));
    await fs.writeFile(
      path.join(repo, "src", "symlink-root.ts"),
      'import { outside } from "./linked.js";\nexport const root = outside;\n',
      "utf8",
    );
    const workbench = await loadWorkbench();

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/symlink-root.ts", line: 2, character: 21 },
      optionsFor(repo),
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 1,
      definitions: [expect.objectContaining({ path: "src/symlink-root.ts", line: 1 })],
    });
    expect(definition.definitions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining("outside") }),
      ]),
    );
  });

  it("rejects tsconfig inheritance outside the workspace", async () => {
    const repo = await makeRepo();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-config-"));
    tempDirs.push(outside);
    const externalConfig = path.join(outside, "tsconfig.external.json");
    await fs.writeFile(externalConfig, '{"compilerOptions":{"strict":true}}\n', "utf8");
    await fs.writeFile(
      path.join(repo, "tsconfig.json"),
      JSON.stringify({ extends: externalConfig, include: ["src/**/*.ts"] }) + "\n",
      "utf8",
    );
    const workbench = await loadWorkbench();

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/gamma.ts", line: 2, character: 22 },
      optionsFor(repo),
    );

    expect(definition).toMatchObject({
      status: "error",
      error: expect.stringContaining("tsconfig.external.json"),
    });
  });
});
