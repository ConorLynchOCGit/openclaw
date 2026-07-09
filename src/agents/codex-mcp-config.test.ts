// Covers conversion from OpenClaw bundle-MCP config into Codex app-server
// thread config patches.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCodexMcpServersConfig, loadCodexBundleMcpThreadConfig } from "./codex-mcp-config.js";

const mocks = vi.hoisted(() => ({
  bundleMcp: {
    config: {
      mcpServers: {},
    },
    diagnostics: [],
  },
}));

vi.mock("../plugins/bundle-mcp.js", () => ({
  loadEnabledBundleMcpConfig: () => mocks.bundleMcp,
}));

beforeEach(() => {
  mocks.bundleMcp = {
    config: {
      mcpServers: {},
    },
    diagnostics: [],
  };
});

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeOpenClawRepoFixture(options: { nested?: boolean } = {}): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-codex-mcp-"));
  tempDirs.push(workspaceDir);
  const repoRoot = options.nested ? path.join(workspaceDir, "src", "openclaw") : workspaceDir;
  const pluginRoot = path.join(
    repoRoot,
    ".agents",
    "plugins",
    "plugins",
    "openclaw-coding-workbench",
  );
  fs.mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, "mcp"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "package.json"), '{"name":"openclaw"}\n', "utf8");
  fs.writeFileSync(path.join(repoRoot, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  fs.writeFileSync(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    '{"name":"openclaw-coding-workbench","version":"0.1.0","description":"fixture"}\n',
    "utf8",
  );
  fs.writeFileSync(path.join(pluginRoot, "mcp", "openclaw-repo-workbench.mjs"), "\n", "utf8");
  return workspaceDir;
}

describe("buildCodexMcpServersConfig", () => {
  it("normalizes OpenClaw MCP servers into Codex app-server mcp_servers shape", () => {
    // Authorization is represented as Codex's bearer env var, while other env
    // placeholders become env_http_headers for per-thread substitution.
    expect(
      buildCodexMcpServersConfig({
        mcpServers: {
          openclaw: {
            type: "http",
            url: "http://127.0.0.1:23119/mcp",
            headers: {
              Authorization: "Bearer ${OPENCLAW_MCP_TOKEN}",
              "x-session-key": "${OPENCLAW_MCP_SESSION_KEY}",
              "x-static": "static-value",
            },
          },
        },
      }),
    ).toEqual({
      openclaw: {
        url: "http://127.0.0.1:23119/mcp",
        default_tools_approval_mode: "approve",
        bearer_token_env_var: "OPENCLAW_MCP_TOKEN",
        http_headers: {
          "x-static": "static-value",
        },
        env_http_headers: {
          "x-session-key": "OPENCLAW_MCP_SESSION_KEY",
        },
      },
    });
  });

  it("preserves Codex-specific MCP approval mode metadata", () => {
    expect(
      buildCodexMcpServersConfig({
        mcpServers: {
          search: {
            url: "https://mcp.example.com/mcp",
            codex: {
              defaultToolsApprovalMode: "prompt",
            },
          },
        },
      }),
    ).toEqual({
      search: {
        url: "https://mcp.example.com/mcp",
        default_tools_approval_mode: "prompt",
      },
    });
  });
});

describe("loadCodexBundleMcpThreadConfig", () => {
  it("loads enabled bundled MCP servers as a Codex thread config patch", () => {
    mocks.bundleMcp = {
      config: {
        mcpServers: {
          search: {
            type: "http",
            url: "https://mcp.example.com/mcp",
          },
        },
      },
      diagnostics: [],
    };

    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir: "/workspace",
      cfg: {
        plugins: {
          entries: {
            "bundle-probe": { enabled: true },
          },
        },
      },
    });

    expect(loaded.configPatch).toEqual({
      mcp_servers: {
        search: {
          url: "https://mcp.example.com/mcp",
        },
      },
    });
    expect(loaded.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("leaves user mcp.servers to the Codex user MCP projection path", () => {
    // User MCP config is projected elsewhere; this loader only injects bundled
    // MCP servers so the same server does not appear twice in Codex.
    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir: "/workspace",
      cfg: {
        mcp: {
          servers: {
            search: {
              transport: "streamable-http",
              url: "https://mcp.example.com/mcp",
            },
          },
        },
      },
      toolsEnabled: true,
    });

    expect(loaded.configPatch).toBeUndefined();
    expect(loaded.fingerprint).toBeUndefined();
    expect(loaded.evaluated).toBe(true);
  });

  it("returns an evaluated empty MCP config when no bundle MCP runtime is needed", () => {
    const cfg = {
      mcp: {
        servers: {
          search: {
            transport: "streamable-http",
            url: "https://mcp.example.com/mcp",
          },
        },
      },
    } as const;

    for (const params of [
      { toolsEnabled: false },
      { toolsEnabled: true, disableTools: true },
      { toolsEnabled: true, toolsAllow: [] },
      { toolsEnabled: true, toolsAllow: ["memory_search"] },
    ]) {
      const loaded = loadCodexBundleMcpThreadConfig({
        workspaceDir: "/workspace",
        cfg,
        ...params,
      });

      expect(loaded.configPatch).toBeUndefined();
      expect(loaded.fingerprint).toBeUndefined();
      expect(loaded.evaluated).toBe(true);
    }
  });

  it("omits the config patch when no MCP servers are configured", () => {
    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir: "/workspace",
      cfg: {},
      toolsEnabled: true,
    });

    expect(loaded.configPatch).toBeUndefined();
    expect(loaded.fingerprint).toBeUndefined();
    expect(loaded.evaluated).toBe(true);
  });

  it("projects a compatibility Coding workbench MCP server for coding agents without a .codex declaration", () => {
    const workspaceDir = makeOpenClawRepoFixture();

    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir,
      agentId: "coding",
      toolsEnabled: true,
      disableTools: true,
    });

    expect(loaded.configPatch?.mcp_servers.openclaw_repo_workbench).toMatchObject({
      command: "node",
      cwd: path.join(workspaceDir, ".agents", "plugins", "plugins", "openclaw-coding-workbench"),
      default_tools_approval_mode: "approve",
      enabled_tools: [
        "repo_search_many",
        "repo_read_many",
        "repo_glob_many",
        "git_inspect_many",
        "lsp_hover_typescript",
        "lsp_definition_typescript",
        "lsp_references_typescript",
      ],
      startup_timeout_sec: 10,
      tool_timeout_sec: 30,
    });
    expect(loaded.configPatch?.mcp_servers.openclaw_repo_workbench.args).toEqual([
      path.join(
        workspaceDir,
        ".agents",
        "plugins",
        "plugins",
        "openclaw-coding-workbench",
        "mcp",
        "openclaw-repo-workbench.mjs",
      ),
    ]);
    expect(loaded.configPatch?.mcp_servers.openclaw_repo_workbench.env).toEqual({
      OPENCLAW_REPO_WORKBENCH_ROOT: workspaceDir,
    });
    expect(loaded.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("projects the Coding workbench MCP server even when .codex/config.toml declares it", () => {
    const workspaceDir = makeOpenClawRepoFixture({ nested: true });
    fs.mkdirSync(path.join(workspaceDir, ".codex"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, ".codex", "config.toml"),
      [
        "[mcp_servers.openclaw_repo_workbench]",
        'command = "node"',
        'args = ["src/openclaw/.agents/plugins/plugins/openclaw-coding-workbench/mcp/openclaw-repo-workbench.mjs"]',
        "",
      ].join("\n"),
      "utf8",
    );

    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir,
      agentId: "coding",
      toolsEnabled: true,
      disableTools: true,
    });

    expect(loaded.configPatch?.mcp_servers.openclaw_repo_workbench).toMatchObject({
      command: "node",
      cwd: path.join(
        workspaceDir,
        "src",
        "openclaw",
        ".agents",
        "plugins",
        "plugins",
        "openclaw-coding-workbench",
      ),
      enabled_tools: [
        "repo_search_many",
        "repo_read_many",
        "repo_glob_many",
        "git_inspect_many",
        "lsp_hover_typescript",
        "lsp_definition_typescript",
        "lsp_references_typescript",
      ],
      env: {
        OPENCLAW_REPO_WORKBENCH_ROOT: workspaceDir,
        OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT: path.join(workspaceDir, "src", "openclaw"),
      },
    });
    expect(loaded.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.evaluated).toBe(true);
  });

  it("resolves the compatibility Coding workbench MCP server from the live runtime workspace layout", () => {
    const workspaceDir = makeOpenClawRepoFixture({ nested: true });

    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir,
      agentId: "coding",
      toolsEnabled: true,
      toolsAllow: [],
    });

    expect(loaded.configPatch?.mcp_servers.openclaw_repo_workbench).toMatchObject({
      cwd: path.join(
        workspaceDir,
        "src",
        "openclaw",
        ".agents",
        "plugins",
        "plugins",
        "openclaw-coding-workbench",
      ),
      env: {
        OPENCLAW_REPO_WORKBENCH_ROOT: workspaceDir,
        OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT: path.join(workspaceDir, "src", "openclaw"),
      },
    });
  });

  it("does not project the Coding workbench MCP server for non-coding agents", () => {
    const workspaceDir = makeOpenClawRepoFixture();

    const loaded = loadCodexBundleMcpThreadConfig({
      workspaceDir,
      agentId: "planning",
      toolsEnabled: true,
    });

    expect(loaded.configPatch).toBeUndefined();
    expect(loaded.fingerprint).toBeUndefined();
    expect(loaded.evaluated).toBe(true);
  });
});
