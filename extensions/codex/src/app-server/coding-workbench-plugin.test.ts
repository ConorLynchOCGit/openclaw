import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, ".agents/plugins/plugins/openclaw-coding-workbench");
const MCP_SERVER = path.join(PLUGIN_ROOT, "mcp/openclaw-repo-workbench.mjs");
const WORKBENCH_OPTIONS = { cwd: REPO_ROOT, env: {} };

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("OpenClaw Codex repo workbench plugin", () => {
  it("is declared as a project Codex MCP server with only read-only batched repo tools", async () => {
    const configToml = await fs.readFile(path.join(REPO_ROOT, ".codex/config.toml"), "utf8");
    const serverSource = await fs.readFile(MCP_SERVER, "utf8");
    const mcpJson = JSON.parse(await fs.readFile(path.join(PLUGIN_ROOT, ".mcp.json"), "utf8")) as {
      mcpServers: Record<
        string,
        {
          enabled_tools?: string[];
          required?: boolean;
          supports_parallel_tool_calls?: boolean;
        }
      >;
    };
    const workbenchServer = mcpJson.mcpServers.openclaw_repo_workbench;
    const enabledTools = workbenchServer?.enabled_tools ?? [];

    expect(configToml).toContain("[mcp_servers.openclaw_repo_workbench]");
    expect(configToml).toContain(
      'args = [".agents/plugins/plugins/openclaw-coding-workbench/mcp/openclaw-repo-workbench.mjs"]',
    );
    expect(configToml).toContain("required = true");
    expect(configToml).toContain("supports_parallel_tool_calls = true");
    expect(workbenchServer).toMatchObject({
      required: true,
      supports_parallel_tool_calls: true,
    });
    expect(configToml).toContain('  "artifact_view_image",');
    expect(serverSource).toContain(
      "Prefer these read-only batched tools for broad repository discovery",
    );
    expect(serverSource.match(/annotations: READ_ONLY_TOOL_ANNOTATIONS/gu)).toHaveLength(8);
    expect(serverSource).toContain("readOnlyHint: true");
    expect(serverSource).toContain("destructiveHint: false");
    expect(serverSource).toContain("idempotentHint: true");
    expect(serverSource).toContain("openWorldHint: false");
    expect(enabledTools.toSorted()).toEqual([
      "artifact_view_image",
      "git_inspect_many",
      "lsp_definition_typescript",
      "lsp_hover_typescript",
      "lsp_references_typescript",
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
        results: Array<{
          status: string;
          pattern?: string;
          path?: string;
          limits?: unknown;
          items?: Array<{ path?: string; line?: number; text?: string }>;
        }>;
      }>;
      repoReadMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{
          status: string;
          text?: string;
          returnedBytes?: number;
          file?: { bytes: number; sha256: string };
          selectedRange?: {
            startLine: number;
            endLine: number;
            bytes: number;
            sha256: string;
          };
        }>;
      }>;
      repoGlobMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        results: Array<{ status: string; files?: string[]; fileCount?: number; limits?: unknown }>;
      }>;
      gitInspectMany: (
        input: unknown,
        options: unknown,
      ) => Promise<{
        gitRootLabels?: Array<{ label: string; path: string }>;
        results: Array<{
          status: string;
          stdout?: string;
          repoRootLabel?: string;
          request?: unknown;
          limits?: unknown;
        }>;
      }>;
    };

    const search = await workbench.repoSearchMany(
      { queries: [{ pattern: "openclaw_repo_workbench", path: ".codex/config.toml" }] },
      WORKBENCH_OPTIONS,
    );
    const readPath = path.join(REPO_ROOT, "docs/agents/coding/codex-agents/README.md");
    const readData = await fs.readFile(readPath);
    const selected = readData.toString("utf8").split(/\r?\n/u).slice(0, 8).join("\n");
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
    expect(search.results[0]).toMatchObject({
      pattern: "openclaw_repo_workbench",
      path: ".codex/config.toml",
    });
    expect(search.results[0]?.limits).toMatchObject({ maxMatches: 20 });
    expect(search.results[0]?.items?.[0]).toMatchObject({
      path: ".codex/config.toml",
      line: expect.any(Number),
      text: expect.any(String),
    });
    expect(read.results[0]?.status).toBe("ok");
    expect(read.results[0]?.text).toContain("1: # Execution Coding Codex Agents");
    expect(read.results[0]?.returnedBytes).toEqual(expect.any(Number));
    expect(read.results[0]).toMatchObject({
      file: { bytes: readData.length, sha256: sha256(readData) },
      selectedRange: {
        startLine: 1,
        endLine: 8,
        bytes: Buffer.byteLength(selected, "utf8"),
        sha256: sha256(selected),
      },
    });
    expect(glob.results[0]?.files).toContain(".codex/agents/codex_reviewer.toml");
    expect(glob.results[0]?.fileCount).toBeGreaterThan(0);
    expect(glob.results[0]?.limits).toMatchObject({ maxResults: 20 });
    expect(git.gitRootLabels).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "workspace", path: "." })]),
    );
    expect(git.results[0]).toMatchObject({ status: "ok" });
    expect(git.results[0]).toMatchObject({
      repoRootLabel: "workspace",
      request: { kind: "status", path: ".codex/config.toml" },
      limits: { maxBytes: 48000 },
    });
  });
});
