// Codex workbench capability tests cover observational app-server readback.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodexAppServerRpcError, type CodexAppServerClient } from "./client.js";
import type { JsonObject } from "./protocol.js";
import { buildCodexWorkbenchCapabilityReport } from "./workbench-capability.js";

describe("Codex workbench capability report", () => {
  it("records app-server inventory, project config, and custom agents", async () => {
    const workspaceDir = await makeWorkspace({
      sourceRoot: true,
      configToml: [
        "[features.multi_agent_v2]",
        "enabled = true",
        "max_concurrent_threads_per_session = 8",
        "hide_spawn_agent_metadata = false",
        "non_code_mode_only = true",
        'tool_namespace = "agents"',
        "",
      ].join("\n"),
      agents: {
        "codex_reviewer.toml": [
          'name = "codex_reviewer"',
          'description = "Reviews Codex-native implementation runs."',
          'developer_instructions = "Review the workbench behavior."',
          "",
        ].join("\n"),
        "project_explorer.toml": [
          'name = "project_explorer"',
          'description = "Maps project surfaces."',
          'developer_instructions = "Explore read-only."',
          "",
        ].join("\n"),
      },
    });
    const request = vi.fn(async (method: string, _params: JsonObject | undefined) => {
      if (method === "model/list") {
        return { data: [{ id: "gpt-5.5" }] };
      }
      if (method === "modelProvider/capabilities/read") {
        return {
          namespaceTools: true,
          imageGeneration: true,
          webSearch: true,
        };
      }
      if (method === "config/read") {
        return {
          config: {
            features: {
              code_mode: true,
              multi_agent_v2: {
                enabled: true,
                max_concurrent_threads_per_session: 8,
                hide_spawn_agent_metadata: false,
                non_code_mode_only: true,
                tool_namespace: "agents",
              },
            },
          },
          layers: [{ name: "global" }, { name: "project" }],
        };
      }
      if (method === "experimentalFeature/list") {
        return {
          data: [{ name: "parallel-tool-calls" }, { id: "native-agents" }],
        };
      }
      if (method === "mcpServerStatus/list") {
        return {
          data: [
            { name: "openai-docs", tools: { search: {} } },
            { name: "openclaw_repo_workbench", tools: { repo_search_many: {} } },
          ],
        };
      }
      if (method === "skills/list") {
        return {
          data: [
            {
              cwd: workspaceDir,
              skills: [
                {
                  name: "openai-docs",
                  description: "Docs",
                  path: "/skills/openai-docs/SKILL.md",
                  scope: "system",
                  enabled: true,
                },
              ],
              errors: [],
            },
          ],
        };
      }
      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "local",
              plugins: [{ id: "github", name: "GitHub", installed: true, enabled: true }],
            },
          ],
        };
      }
      if (method === "app/list") {
        return {
          data: [
            {
              id: "github-app",
              name: "GitHub",
              needsAuth: false,
              isAccessible: true,
              isEnabled: true,
              pluginDisplayNames: ["GitHub"],
            },
          ],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const client = makeClient({ request });

    const report = await buildCodexWorkbenchCapabilityReport({
      client,
      threadId: "thread-1",
      processCwd: "/app",
      cwd: workspaceDir,
      workspaceDir,
      appServerStart: {
        transport: "stdio",
        command: "codex",
        args: ["app-server"],
      },
      sandbox: "workspace-write",
      approvalPolicy: "never",
      codeModeConfigured: true,
      codeModeOnlyConfigured: true,
      openclawDynamicToolNames: [],
      timeoutMs: 1000,
    });

    expect(report.owner).toBe("codex_app_server");
    expect(report.appServer).toMatchObject({
      version: "0.140.0",
      transport: "stdio",
      command: "codex",
      argsCount: 1,
      initialized: true,
    });
    expect(report.thread).toMatchObject({
      threadId: "thread-1",
      processCwd: "/app",
      cwd: workspaceDir,
      workspaceDir,
      sandbox: "workspace-write",
      approvalPolicy: "never",
    });
    expect(report.codexWorkbench).toEqual({
      executionCwd: workspaceDir,
      workspaceRoot: workspaceDir,
      sourceRoot: path.join(workspaceDir, "src", "openclaw"),
      workbenchRoot: workspaceDir,
      pluginRoot: path.join(
        workspaceDir,
        "src",
        "openclaw",
        ".agents",
        "plugins",
        "plugins",
        "openclaw-coding-workbench",
      ),
      mcpServers: ["openai-docs", "openclaw_repo_workbench"],
    });
    expect(report.openclawDynamicTools).toEqual({ count: 0, names: [] });
    expect(report.codexNativeTools).toMatchObject({
      mode: "app-server-native",
      codeModeConfigured: true,
      codeModeOnlyConfigured: true,
      expectedSubagentTool: "spawn_agent",
    });
    expect(report.codexNativeTools.expectedModelVisibleItemTypes).toEqual([
      "commandExecution",
      "fileChange",
      "mcpToolCall",
      "webSearch",
    ]);
    expect(report.generatedSchemaMethods.map((entry) => entry.method)).toEqual(
      expect.arrayContaining([
        "fs/readFile",
        "fs/readDirectory",
        "fs/writeFile",
        "command/exec",
        "command/exec/write",
        "command/exec/terminate",
        "command/exec/resize",
        "fuzzyFileSearch",
        "mcpServer/tool/call",
        "modelProvider/capabilities/read",
        "config/read",
      ]),
    );
    expect(report.codexProjectConfig).toMatchObject({
      present: true,
      multiAgentVersion: "v2",
      maxConcurrentThreadsPerSession: 8,
      toolNamespace: "agents",
      spawnAgentMetadataVisible: true,
      directModelOnly: true,
    });
    expect(report.customAgents).toMatchObject({
      count: 2,
      names: ["codex_reviewer", "project_explorer"],
      files: ["codex_reviewer.toml", "project_explorer.toml"],
      hasCodexReviewer: true,
      hasCreativeQualityReviewer: false,
    });
    expect(report.controlMethods.modelList).toEqual({ status: "ok", count: 1 });
    expect(report.controlMethods.modelProviderCapabilitiesRead).toEqual({
      status: "ok",
      namespaceTools: true,
      imageGeneration: true,
      webSearch: true,
    });
    expect(report.controlMethods.configRead).toEqual({
      status: "ok",
      includeLayers: true,
      layerCount: 2,
      configKeyCount: 1,
      featureKeys: ["code_mode", "multi_agent_v2"],
      agentKeys: [],
    });
    expect(report.controlMethods.experimentalFeatureList).toEqual({
      status: "ok",
      count: 2,
      names: ["native-agents", "parallel-tool-calls"],
    });
    expect(report.controlMethods.mcpServerStatusList).toMatchObject({
      status: "ok",
      count: 2,
      names: ["openai-docs", "openclaw_repo_workbench"],
    });
    expect(report.controlMethods.skillsList).toMatchObject({
      status: "ok",
      count: 1,
      names: ["openai-docs"],
    });
    expect(report.controlMethods.pluginList).toMatchObject({
      status: "ok",
      count: 1,
      names: ["GitHub"],
    });
    expect(report.controlMethods.appList).toMatchObject({
      status: "ok",
      count: 1,
      names: ["GitHub"],
    });
    expect(report.nativeParallelToolCalls.status).toBe("not_proven");
    expect(request.mock.calls.map(([method]) => method).toSorted()).toEqual([
      "app/list",
      "config/read",
      "experimentalFeature/list",
      "mcpServerStatus/list",
      "model/list",
      "modelProvider/capabilities/read",
      "plugin/list",
      "skills/list",
    ]);
    expect(request.mock.calls.find(([method]) => method === "mcpServerStatus/list")?.[1]).toEqual({
      cursor: null,
      limit: 100,
      detail: "toolsAndAuthOnly",
      threadId: "thread-1",
    });
  });

  it("reports unsupported app-server methods without failing capability readback", async () => {
    const workspaceDir = await makeWorkspace({});
    const client = makeClient({
      request: async (method) => {
        throw new CodexAppServerRpcError({ code: -32601, message: "Method not found" }, method);
      },
    });

    const report = await buildCodexWorkbenchCapabilityReport({
      client,
      threadId: "thread-2",
      cwd: workspaceDir,
      workspaceDir,
      appServerStart: {
        transport: "stdio",
        command: "codex",
        args: ["app-server"],
      },
      codeModeConfigured: false,
      codeModeOnlyConfigured: false,
      openclawDynamicToolNames: ["read", "bash"],
    });

    expect(report.codexProjectConfig.present).toBe(false);
    expect(report.customAgents).toMatchObject({
      count: 0,
      names: [],
      files: [],
      hasCodexReviewer: false,
      hasCreativeQualityReviewer: false,
    });
    expect(report.openclawDynamicTools).toEqual({ count: 2, names: ["bash", "read"] });
    expect(report.controlMethods.modelList.status).toBe("unsupported");
    expect(report.controlMethods.modelProviderCapabilitiesRead.status).toBe("unsupported");
    expect(report.controlMethods.configRead.status).toBe("unsupported");
    expect(report.controlMethods.experimentalFeatureList.status).toBe("unsupported");
    expect(report.controlMethods.mcpServerStatusList.status).toBe("unsupported");
    expect(report.controlMethods.skillsList.status).toBe("unsupported");
    expect(report.controlMethods.pluginList.status).toBe("unsupported");
    expect(report.controlMethods.appList.status).toBe("unsupported");
  });

  it("does not let malformed successful control responses break observational readback", async () => {
    const workspaceDir = await makeWorkspace({});
    const client = makeClient({
      request: async () => ({}),
    });

    const report = await buildCodexWorkbenchCapabilityReport({
      client,
      threadId: "thread-malformed",
      cwd: workspaceDir,
      workspaceDir,
      appServerStart: {
        transport: "stdio",
        command: "codex",
        args: ["app-server"],
      },
      codeModeConfigured: true,
      codeModeOnlyConfigured: true,
      openclawDynamicToolNames: [],
    });

    expect(report.controlMethods.modelList).toEqual({ status: "ok", count: 0 });
    expect(report.controlMethods.mcpServerStatusList).toEqual({
      status: "ok",
      count: 0,
      names: [],
    });
    expect(report.controlMethods.skillsList).toEqual({ status: "ok", count: 0, names: [] });
    expect(report.controlMethods.pluginList).toEqual({ status: "ok", count: 0, names: [] });
    expect(report.controlMethods.appList).toEqual({ status: "ok", count: 0, names: [] });
  });
});

async function makeWorkspace(params: {
  configToml?: string;
  agents?: Record<string, string>;
  sourceRoot?: boolean;
}): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-workbench-"));
  if (params.configToml !== undefined) {
    await fs.mkdir(path.join(workspaceDir, ".codex"), { recursive: true });
    await fs.writeFile(path.join(workspaceDir, ".codex", "config.toml"), params.configToml);
  }
  if (params.agents) {
    const agentsDir = path.join(workspaceDir, ".codex", "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    await Promise.all(
      Object.entries(params.agents).map(([file, content]) =>
        fs.writeFile(path.join(agentsDir, file), content),
      ),
    );
  }
  if (params.sourceRoot) {
    await fs.mkdir(path.join(workspaceDir, "src", "openclaw"), { recursive: true });
  }
  return workspaceDir;
}

function makeClient(params: {
  request: (method: string, params: JsonObject | undefined) => Promise<unknown>;
}): CodexAppServerClient {
  return {
    getServerVersion: () => "0.140.0",
    request: params.request,
  } as unknown as CodexAppServerClient;
}
