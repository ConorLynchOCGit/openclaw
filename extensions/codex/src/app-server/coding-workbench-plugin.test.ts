import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, ".agents/plugins/plugins/openclaw-coding-workbench");
const MCP_SERVER = path.join(PLUGIN_ROOT, "mcp/openclaw-repo-workbench.mjs");
const WORKBENCH_OPTIONS = { cwd: REPO_ROOT, env: {} };

describe("OpenClaw Codex repo workbench plugin", () => {
  it("is declared as a project Codex MCP server with only read-only batched repo tools", async () => {
    const configToml = await fs.readFile(path.join(REPO_ROOT, ".codex/config.toml"), "utf8");
    const mcpJson = JSON.parse(await fs.readFile(path.join(PLUGIN_ROOT, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, { enabled_tools?: string[] }>;
    };
    const enabledTools = mcpJson.mcpServers.openclaw_repo_workbench?.enabled_tools ?? [];

    expect(configToml).toContain("[mcp_servers.openclaw_repo_workbench]");
    expect(configToml).toContain(
      'args = [".agents/plugins/plugins/openclaw-coding-workbench/mcp/openclaw-repo-workbench.mjs"]',
    );
    expect(enabledTools.toSorted()).toEqual([
      "git_inspect_many",
      "repo_glob_many",
      "repo_read_many",
      "repo_search_many",
    ]);
    expect(enabledTools).not.toContain("validation_run_many");
  });

  it("exposes bounded read-only repo helpers without mutating source", async () => {
    const workbench = (await import(pathToFileURL(MCP_SERVER).href)) as {
      repoSearchMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{ status: string; matches?: string[] }>;
      }>;
      repoReadMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{ status: string; content?: string }>;
      }>;
      repoGlobMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{ status: string; files?: string[] }>;
      }>;
      gitInspectMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{ status: string; stdout?: string }>;
      }>;
    };

    const search = await workbench.repoSearchMany(
      { queries: [{ pattern: "openclaw_repo_workbench", path: ".codex/config.toml" }] },
      WORKBENCH_OPTIONS,
    );
    const read = await workbench.repoReadMany(
      { files: [{ path: "docs/agents/coding/codex-agents/README.md", endLine: 8 }] },
      WORKBENCH_OPTIONS,
    );
    const glob = await workbench.repoGlobMany(
      { globs: [{ pattern: "*.toml", path: ".codex/agents", maxResults: 20 }] },
      WORKBENCH_OPTIONS,
    );
    const git = await workbench.gitInspectMany(
      { requests: [{ kind: "status", path: ".codex/config.toml" }] },
      WORKBENCH_OPTIONS,
    );

    expect(search.results[0]?.status).toBe("matched");
    expect(read.results[0]?.status).toBe("ok");
    expect(read.results[0]?.content).toContain("Execution Coding Codex Agents");
    expect(glob.results[0]?.files).toContain(".codex/agents/codex_reviewer.toml");
    expect(git.results[0]).toMatchObject({ status: "ok" });
  });
});
