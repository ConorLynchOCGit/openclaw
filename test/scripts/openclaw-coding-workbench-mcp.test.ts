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
    results: Array<{ status: string; matches?: string[]; error?: string }>;
  }>;
  repoReadMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{ status: string; content?: string; error?: string; totalLines?: number }>;
  }>;
  repoGlobMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{ status: string; files?: string[] }>;
  }>;
  gitInspectMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{ status: string; stdout?: string }>;
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

function optionsFor(repo: string) {
  return {
    cwd: repo,
    env: {
      ...process.env,
      OPENCLAW_REPO_WORKBENCH_ROOT: repo,
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
});
