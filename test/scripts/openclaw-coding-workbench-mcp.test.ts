// OpenClaw Coding Workbench MCP tests cover bounded repo inspection helpers.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workbenchModuleUrl = pathToFileURL(
  path.resolve(".agents/plugins/plugins/openclaw-coding-workbench/mcp/openclaw-repo-workbench.mjs"),
).href;

type WorkbenchModule = {
  repoSearchMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{
      status: string;
      matches?: string[];
      error?: string;
      effectiveMaxMatches?: number;
      requestedMaxMatches?: number;
      maxMatchesClamped?: boolean;
    }>;
  }>;
  repoReadMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{
      status: string;
      content?: string;
      error?: string;
      totalLines?: number;
      effectiveMaxBytes?: number;
      requestedMaxBytes?: number;
      maxBytesClamped?: boolean;
    }>;
  }>;
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
      content: "export const alpha = 1;",
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
        queries: [{ pattern: "alpha", path: "src", maxMatches: 2_000 }],
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
      effectiveMaxBytes: 80_000,
      maxBytesClamped: true,
    });
    expect(search.results[0]).toMatchObject({
      status: "matched",
      requestedMaxMatches: 2_000,
      effectiveMaxMatches: 200,
      maxMatchesClamped: true,
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
    expect(search.results[0].matches?.join("\n")).toContain("alpha.ts");
    expect(search.results[1].status).toBe("no_match");
    expect(glob.results[0]).toMatchObject({
      status: "ok",
      files: ["src/alpha.ts"],
    });
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
    expect(search.results[0].matches?.join("\n")).toContain("business-ops/brief.md");
    expect(search.results[1].status).toBe("matched");
    expect(search.results[1].matches?.join("\n")).toContain("src/openclaw/src/agents/task-tool.ts");
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
});
