import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import "./test-helpers/fast-openclaw-tools.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveChannelGroupToolsPolicy } from "../config/group-policy.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createSessionConversationTestRegistry } from "../test-utils/session-conversation-registry.js";
import {
  createOpenClawCodingTools,
  filterToolsForExecutionScoutMode,
  __testing as piToolsTesting,
} from "./pi-tools.js";
import { resolveEffectiveToolPolicy } from "./pi-tools.policy.js";
import type { SandboxDockerConfig } from "./sandbox.js";
import type { SandboxFsBridge } from "./sandbox/fs-bridge.js";
import { createRestrictedAgentSandboxConfig } from "./test-helpers/sandbox-agent-config-fixtures.js";
import type { AnyAgentTool } from "./tools/common.js";

type ToolWithExecute = {
  execute: (toolCallId: string, args: unknown, signal?: AbortSignal) => Promise<unknown>;
};

describe("Agent-specific tool filtering", () => {
  beforeEach(() => {
    setActivePluginRegistry(createSessionConversationTestRegistry());
  });

  const sandboxFsBridgeStub: SandboxFsBridge = {
    resolvePath: () => ({
      hostPath: "/tmp/sandbox",
      relativePath: "",
      containerPath: "/workspace",
    }),
    readFile: async () => Buffer.from(""),
    writeFile: async () => {},
    mkdirp: async () => {},
    remove: async () => {},
    rename: async () => {},
    stat: async () => null,
  };

  function expectReadOnlyToolSet(toolNames: string[], extraDenied: string[] = []) {
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("write");
    expect(toolNames).not.toContain("apply_patch");
    for (const toolName of extraDenied) {
      expect(toolNames).not.toContain(toolName);
    }
  }

  async function withApplyPatchEscapeCase(
    opts: { workspaceOnly?: boolean },
    run: (params: {
      applyPatchTool: ToolWithExecute;
      escapedPath: string;
      patch: string;
    }) => Promise<void>,
  ) {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-pi-tools-"));
    const escapedPath = path.join(
      path.dirname(workspaceDir),
      `escaped-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    const relativeEscape = path.relative(workspaceDir, escapedPath);

    try {
      const cfg: OpenClawConfig = {
        tools: {
          allow: ["read", "write", "exec"],
          exec: {
            applyPatch: opts.workspaceOnly === false ? { workspaceOnly: false } : {},
          },
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:main:main",
        workspaceDir,
        agentDir: "/tmp/agent",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      });

      const applyPatchTool = tools.find((t) => t.name === "apply_patch");
      if (!applyPatchTool) {
        throw new Error("apply_patch tool missing");
      }

      const patch = `*** Begin Patch
*** Add File: ${relativeEscape}
+escaped
*** End Patch`;

      await run({
        applyPatchTool: applyPatchTool as unknown as ToolWithExecute,
        escapedPath,
        patch,
      });
    } finally {
      await fs.rm(escapedPath, { force: true });
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  }

  function createMainSessionTools(cfg: OpenClawConfig) {
    return createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
    });
  }

  function createMainAgentConfig(params: {
    tools: NonNullable<OpenClawConfig["tools"]>;
    agentTools?: NonNullable<NonNullable<OpenClawConfig["agents"]>["list"]>[number]["tools"];
  }): OpenClawConfig {
    return {
      tools: params.tools,
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            ...(params.agentTools ? { tools: params.agentTools } : {}),
          },
        ],
      },
    };
  }

  function createStubNodeTool(name: string): AnyAgentTool {
    return {
      name,
      label: name,
      description: `${name} test tool.`,
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [], details: { status: "ok", text: name } }),
    };
  }

  function readText(result: unknown): string {
    const content =
      result && typeof result === "object" && "content" in result
        ? (result as { content?: unknown }).content
        : undefined;
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
      .filter(Boolean)
      .join("\n");
  }

  it("should apply global tool policy when no agent-specific policy exists", () => {
    const cfg = createMainAgentConfig({
      tools: {
        allow: ["read", "write"],
        deny: ["bash"],
      },
    });
    const tools = createMainSessionTools(cfg);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("write");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("apply_patch");
  });

  it("includes native repo discovery tools in the coding tool surface", () => {
    const tools = createMainSessionTools({
      tools: {
        profile: "coding",
      },
    } as OpenClawConfig);

    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain("list");
    expect(toolNames).toContain("glob");
    expect(toolNames).toContain("grep");
    expect(toolNames).toContain("lsp");
  });

  it("includes runner-owned native runtime tools through the same policy-filtered coding surface", () => {
    const cfg = createMainAgentConfig({
      tools: {
        allow: ["read", "node_finish"],
      },
    });
    const nativeRuntimeTool: AnyAgentTool = {
      name: "node_finish",
      label: "Finish execution node",
      description: "Terminal node lifecycle tool.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [], details: { status: "accepted" } }),
    };

    const allowedTools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      nativeRuntimeTools: [nativeRuntimeTool],
    });
    expect(allowedTools.map((tool) => tool.name)).toContain("node_finish");

    const deniedTools = createOpenClawCodingTools({
      config: createMainAgentConfig({
        tools: {
          allow: ["read"],
        },
      }),
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      nativeRuntimeTools: [nativeRuntimeTool],
    });
    expect(deniedTools.map((tool) => tool.name)).not.toContain("node_finish");
  });

  it("filters executable node parent catalog to native task ownership tools", () => {
    const cfg = createMainAgentConfig({
      tools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "process",
          "write",
          "edit",
          "update_plan",
          "sessions_spawn",
          "sessions_yield",
          "subagents",
          "agents_list",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
      agentTools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "process",
          "write",
          "edit",
          "update_plan",
          "sessions_spawn",
          "sessions_yield",
          "subagents",
          "agents_list",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
    });
    const nativeRuntimeTools: AnyAgentTool[] = [
      createStubNodeTool("openclaw_resource_read"),
      createStubNodeTool("node_finish"),
    ];

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:node:nrun_test",
      agentId: "execution-coding",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      nativeRuntimeTools,
      nodeAgentNativeTaskMode: {
        enabled: true,
        allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
        mutationToolName: "edit",
        runChildTask: async () => ({
          status: "error",
          foreground: true,
          childSessionKey: "agent:execution-context-scout:subagent:test",
          runId: "run-test",
          waitStatus: "error",
          resultDeliveredToParentContext: false,
        }),
      },
      nodeAgentParentCrawlGuard: { enabled: true },
      allowGatewaySubagentBinding: true,
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "task",
        "update_plan",
        "read_todo",
        "edit",
        "read",
        "glob",
        "grep",
        "lsp",
        "node_finish",
      ]),
    );
    expect(toolNames).not.toEqual(expect.arrayContaining(["list"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["exec"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["process"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["write"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["sessions_spawn"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["sessions_yield"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["subagents"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["agents_list"]));
    expect(toolNames).not.toContain("apply_patch");
    expect(toolNames.indexOf("edit")).toBeLessThan(toolNames.indexOf("grep"));
    expect(toolNames.indexOf("lsp")).toBeLessThan(toolNames.indexOf("read"));
    expect(toolNames.indexOf("node_finish")).toBeLessThan(toolNames.indexOf("read"));
  });

  it("uses native-task catalog filtering, not parent crawl guard, as executable-node control plane", () => {
    const cfg = createMainAgentConfig({
      tools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "write",
          "edit",
          "update_plan",
          "read_todo",
          "sessions_spawn",
          "sessions_yield",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
      agentTools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "write",
          "edit",
          "update_plan",
          "read_todo",
          "sessions_spawn",
          "sessions_yield",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
    });
    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:node:nrun_native_task_control",
      agentId: "execution-coding",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      nativeRuntimeTools: [
        createStubNodeTool("openclaw_resource_read"),
        createStubNodeTool("node_finish"),
      ],
      nodeAgentNativeTaskMode: {
        enabled: true,
        allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
        mutationToolName: "edit",
        runChildTask: async () => ({
          status: "error",
          foreground: true,
          childSessionKey: "agent:execution-context-scout:subagent:test",
          runId: "run-test",
          waitStatus: "error",
          resultDeliveredToParentContext: false,
        }),
      },
      nodeAgentParentCrawlGuard: { enabled: true },
      allowGatewaySubagentBinding: true,
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "task",
        "update_plan",
        "read_todo",
        "edit",
        "read",
        "glob",
        "grep",
        "lsp",
        "node_finish",
      ]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining(["list", "exec", "write", "sessions_spawn", "sessions_yield"]),
    );
    expect(toolNames).not.toContain("apply_patch");
    expect(toolNames.indexOf("edit")).toBeLessThan(toolNames.indexOf("grep"));
    expect(toolNames.indexOf("lsp")).toBeLessThan(toolNames.indexOf("read"));
    expect(toolNames.indexOf("node_finish")).toBeLessThan(toolNames.indexOf("read"));
  });

  it("keeps only apply_patch when it is the configured executable-node mutation surface", () => {
    const cfg = createMainAgentConfig({
      tools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "write",
          "edit",
          "apply_patch",
          "update_plan",
          "read_todo",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
      agentTools: {
        allow: [
          "read",
          "list",
          "glob",
          "grep",
          "lsp",
          "exec",
          "write",
          "edit",
          "apply_patch",
          "update_plan",
          "read_todo",
          "task",
          "openclaw_resource_read",
          "node_finish",
        ],
      },
    });
    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:execution-coding:node:nrun_apply_patch",
      agentId: "execution-coding",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      modelProvider: "openai",
      modelId: "gpt-5.4",
      nativeRuntimeTools: [
        createStubNodeTool("openclaw_resource_read"),
        createStubNodeTool("node_finish"),
      ],
      nodeAgentNativeTaskMode: {
        enabled: true,
        allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
        mutationToolName: "apply_patch",
        runChildTask: async () => ({
          status: "error",
          foreground: true,
          childSessionKey: "agent:execution-context-scout:subagent:test",
          runId: "run-test",
          waitStatus: "error",
          resultDeliveredToParentContext: false,
        }),
      },
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "task",
        "update_plan",
        "read_todo",
        "apply_patch",
        "grep",
        "lsp",
        "node_finish",
      ]),
    );
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toEqual(expect.arrayContaining(["write"]));
    expect(toolNames).not.toEqual(expect.arrayContaining(["exec"]));
    expect(toolNames.indexOf("apply_patch")).toBeLessThan(toolNames.indexOf("grep"));
    expect(toolNames.indexOf("lsp")).toBeLessThan(toolNames.indexOf("grep"));
    expect(toolNames.indexOf("node_finish")).toBeLessThan(toolNames.indexOf("grep"));
  });

  it("filters execution context scout catalog to read and search tools only", () => {
    const broadTools = [
      "read",
      "list",
      "glob",
      "grep",
      "exec",
      "process",
      "write",
      "edit",
      "update_plan",
      "read_todo",
      "task",
      "openclaw_resource_read",
      "node_finish",
      "sessions_spawn",
      "sessions_yield",
      "subagents",
      "agents_list",
    ];
    const cfg: OpenClawConfig = {
      tools: { allow: broadTools },
      agents: {
        list: [
          {
            id: "execution-context-scout",
            workspace: "~/openclaw",
            tools: { allow: broadTools },
          },
        ],
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      agentId: "execution-context-scout",
      sessionKey: "agent:execution-context-scout:subagent:test",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      senderIsOwner: true,
      nativeRuntimeTools: [
        createStubNodeTool("openclaw_resource_read"),
        createStubNodeTool("node_finish"),
      ],
      extraTools: [
        createStubNodeTool("task"),
        createStubNodeTool("sessions_spawn"),
        createStubNodeTool("read_todo"),
      ],
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining(["read", "list", "glob", "grep", "openclaw_resource_read"]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        "exec",
        "process",
        "write",
        "edit",
        "update_plan",
        "read_todo",
        "task",
        "node_finish",
        "sessions_spawn",
        "sessions_yield",
        "subagents",
        "agents_list",
      ]),
    );
  });

  it("adds search-first tool reminders for execution context scout read and grep results", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-context-scout-tools-"));
    try {
      await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
      await fs.writeFile(
        path.join(workspaceDir, "src", "worker.ts"),
        [
          "export function buildWorkQueueExecutionReadModel() {",
          "  return 'frontier delta';",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
      const cfg: OpenClawConfig = {
        tools: { allow: ["read", "list", "glob", "grep"] },
        agents: {
          list: [
            {
              id: "execution-context-scout",
              workspace: workspaceDir,
              tools: { allow: ["read", "list", "glob", "grep"] },
            },
          ],
        },
      };
      const tools = createOpenClawCodingTools({
        config: cfg,
        agentId: "execution-context-scout",
        sessionKey: "agent:execution-context-scout:subagent:test",
        workspaceDir,
        agentDir: "/tmp/agent",
        senderIsOwner: true,
      });
      const read = tools.find((tool) => tool.name === "read");
      const grep = tools.find((tool) => tool.name === "grep");
      expect(read?.description).toContain("grep the file first instead of reading from line 1");
      expect(grep?.description).toContain("search known refs/keywords first");

      const grepResult = await grep?.execute("context-scout-grep", {
        query: "buildWorkQueueExecutionReadModel",
        path: "src/worker.ts",
      });
      expect(readText(grepResult)).toContain("<system-reminder>");
      expect(readText(grepResult)).toContain("read bounded windows around matched symbols");
      expect(readText(grepResult)).toContain("Do not switch to top-of-file read walking");

      const readResult = await read?.execute("context-scout-read", {
        path: "src/worker.ts",
        offset: 1,
        limit: 20,
      });
      expect(readText(readResult)).toContain("<system-reminder>");
      expect(readText(readResult)).toContain("mechanical handoff headings");
      expect(readText(readResult)).toContain("actual line-window excerpts");
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("filters execution validation scout catalog to read, search, and exec tools only", () => {
    const broadTools = [
      "read",
      "list",
      "glob",
      "grep",
      "exec",
      "process",
      "write",
      "edit",
      "update_plan",
      "read_todo",
      "task",
      "openclaw_resource_read",
      "node_finish",
      "sessions_spawn",
      "sessions_yield",
      "subagents",
      "agents_list",
    ];
    const cfg: OpenClawConfig = {
      tools: { allow: broadTools },
      agents: {
        list: [
          {
            id: "execution-validation-scout",
            workspace: "~/openclaw",
            tools: { allow: broadTools },
          },
        ],
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      agentId: "execution-validation-scout",
      sessionKey: "agent:execution-validation-scout:subagent:test",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      senderIsOwner: true,
      nativeRuntimeTools: [
        createStubNodeTool("openclaw_resource_read"),
        createStubNodeTool("node_finish"),
      ],
      extraTools: [
        createStubNodeTool("task"),
        createStubNodeTool("sessions_spawn"),
        createStubNodeTool("read_todo"),
      ],
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining(["read", "list", "glob", "grep", "exec", "openclaw_resource_read"]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        "process",
        "write",
        "edit",
        "update_plan",
        "read_todo",
        "task",
        "node_finish",
        "sessions_spawn",
        "sessions_yield",
        "subagents",
        "agents_list",
      ]),
    );
  });

  it("filters execution scout provider-effective bundle tools after native tool construction", () => {
    const tools = filterToolsForExecutionScoutMode({
      agentId: "execution-context-scout",
      tools: [
        createStubNodeTool("read"),
        createStubNodeTool("grep"),
        createStubNodeTool("model_context_bundle"),
        createStubNodeTool("task"),
        createStubNodeTool("node_finish"),
      ],
    });

    expect(tools.map((tool) => tool.name)).toEqual(["read", "grep"]);
  });

  it("keeps defensive legacy parent crawl guard quarantined outside native task mode", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-node-crawl-"));
    await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "src", "target.ts"),
      "export const target = true;\n",
    );
    const cfg = createMainAgentConfig({
      tools: {
        allow: ["read", "grep", "sessions_spawn"],
      },
      agentTools: {
        allow: ["read", "grep", "sessions_spawn"],
      },
    });

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:node:nrun_test",
      workspaceDir,
      agentDir: "/tmp/agent",
      nodeAgentParentCrawlGuard: { enabled: true },
      allowGatewaySubagentBinding: true,
    });
    const read = tools.find((tool) => tool.name === "read");
    const grep = tools.find((tool) => tool.name === "grep");
    const sessionsSpawn = tools.find((tool) => tool.name === "sessions_spawn");
    expect(read).toBeTruthy();
    expect(grep).toBeTruthy();
    expect(sessionsSpawn).toBeTruthy();

    await expect(
      read!.execute("read-window-before-scout", { path: "src/target.ts", offset: 0, limit: 20 }),
    ).resolves.toBeTruthy();
    await expect(
      read!.execute("read-whole-file-before-scout", { path: "src/target.ts" }),
    ).rejects.toThrow(/Parent repo mapping is disabled before scout delegation/i);
    await expect(
      grep!.execute("grep-before-scout", {
        query: "target",
        path: ".",
      }),
    ).rejects.toThrow(/Parent repo mapping is disabled before scout delegation/i);

    await sessionsSpawn!
      .execute("malformed-spawn-context-scout", {
        runtime: "subagent",
        agentId: "execution-context-scout",
        prompt: "Find target files.",
      })
      .catch(() => null);
    await expect(
      grep!.execute("grep-after-failed-scout", {
        query: "target",
        path: ".",
      }),
    ).rejects.toThrow(/Parent repo mapping is disabled before scout delegation/i);

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("keeps defensive legacy parent crawl guard unlock behavior quarantined outside native task mode", async () => {
    const grepTool: AnyAgentTool = {
      name: "grep",
      label: "grep",
      description: "Search files.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [], details: { status: "matched" } }),
    };
    const sessionsSpawnTool: AnyAgentTool = {
      name: "sessions_spawn",
      label: "sessions_spawn",
      description: "Spawn subagent.",
      parameters: { type: "object", properties: {} },
      execute: async () => ({
        content: [],
        details: {
          status: "accepted",
          childSessionKey: "agent:execution-context-scout:subagent:test",
        },
      }),
    };
    const [grep, sessionsSpawn] = piToolsTesting.wrapToolsWithNodeParentCrawlGuard({
      tools: [grepTool, sessionsSpawnTool],
      enabled: true,
      workspaceRoot: "/tmp/openclaw-node-crawl-guard-test",
    });

    await expect(
      grep.execute("grep-before-scout", {
        query: "target",
        path: ".",
      }),
    ).rejects.toThrow(/Parent repo mapping is disabled before scout delegation/i);
    await expect(
      sessionsSpawn.execute("spawn-context-scout", {
        agentId: "execution-context-scout",
      }),
    ).resolves.toBeTruthy();
    await expect(
      grep.execute("grep-after-accepted-scout", {
        query: "target",
        path: ".",
      }),
    ).resolves.toBeTruthy();
  });

  it("should keep global tool policy when agent only sets tools.elevated", () => {
    const cfg = createMainAgentConfig({
      tools: {
        deny: ["write"],
      },
      agentTools: {
        elevated: {
          enabled: true,
          allowFrom: { whatsapp: ["+15555550123"] },
        },
      },
    });
    const tools = createMainSessionTools(cfg);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("exec");
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("write");
    expect(toolNames).not.toContain("apply_patch");
  });

  it("should allow apply_patch for OpenAI models when write is allow-listed", () => {
    const cfg: OpenClawConfig = {
      tools: {
        allow: ["read", "write", "exec"],
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("exec");
    expect(toolNames).toContain("apply_patch");
  });

  it("should allow disabling apply_patch explicitly", () => {
    const cfg: OpenClawConfig = {
      tools: {
        allow: ["read", "write", "exec"],
        exec: {
          applyPatch: { enabled: false },
        },
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test",
      agentDir: "/tmp/agent",
      modelProvider: "openai",
      modelId: "gpt-5.4",
    });

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("exec");
    expect(toolNames).not.toContain("apply_patch");
  });

  it("defaults apply_patch to workspace-only (blocks traversal)", async () => {
    await withApplyPatchEscapeCase({}, async ({ applyPatchTool, escapedPath, patch }) => {
      await expect(applyPatchTool.execute("tc1", { input: patch })).rejects.toThrow(
        /Path escapes sandbox root/,
      );
      await expect(fs.readFile(escapedPath, "utf8")).rejects.toBeDefined();
    });
  });

  it("allows disabling apply_patch workspace-only via config (dangerous)", async () => {
    await withApplyPatchEscapeCase(
      { workspaceOnly: false },
      async ({ applyPatchTool, escapedPath, patch }) => {
        await applyPatchTool.execute("tc2", { input: patch });
        const contents = await fs.readFile(escapedPath, "utf8");
        expect(contents).toBe("escaped\n");
      },
    );
  });

  it("should apply agent-specific tool policy", () => {
    const cfg: OpenClawConfig = {
      tools: {
        allow: ["read", "write", "exec"],
        deny: [],
      },
      agents: {
        list: [
          {
            id: "restricted",
            workspace: "~/openclaw-restricted",
            tools: {
              allow: ["read"], // Agent override: only read
              deny: ["exec", "write", "edit"],
            },
          },
        ],
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:restricted:main",
      workspaceDir: "/tmp/test-restricted",
      agentDir: "/tmp/agent-restricted",
    });

    expectReadOnlyToolSet(
      tools.map((t) => t.name),
      ["edit"],
    );
  });

  it("should apply provider-specific tool policy", () => {
    const cfg: OpenClawConfig = {
      tools: {
        allow: ["read", "write", "exec"],
        byProvider: {
          "google-antigravity": {
            allow: ["read"],
          },
        },
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test-provider",
      agentDir: "/tmp/agent-provider",
      modelProvider: "google-antigravity",
      modelId: "claude-opus-4-6-thinking",
    });

    expectReadOnlyToolSet(tools.map((t) => t.name));
  });

  it("should apply provider-specific tool profile overrides", () => {
    const cfg: OpenClawConfig = {
      tools: {
        profile: "coding",
        byProvider: {
          "google-antigravity": {
            profile: "minimal",
          },
        },
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:main",
      workspaceDir: "/tmp/test-provider-profile",
      agentDir: "/tmp/agent-provider-profile",
      modelProvider: "google-antigravity",
      modelId: "claude-opus-4-6-thinking",
    });

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(["session_status"]);
  });

  it("should resolve different tool policies for different agents", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            workspace: "~/openclaw",
            // No tools restriction - all tools available
          },
          {
            id: "family",
            workspace: "~/openclaw-family",
            tools: {
              allow: ["read"],
              deny: ["exec", "write", "edit", "process"],
            },
          },
        ],
      },
    };

    // main agent: no override
    const mainPolicy = resolveEffectiveToolPolicy({
      config: cfg,
      sessionKey: "agent:main:main",
    });
    expect(mainPolicy.agentId).toBe("main");
    expect(mainPolicy.agentPolicy).toBeUndefined();

    // family agent: restricted
    const familyPolicy = resolveEffectiveToolPolicy({
      config: cfg,
      sessionKey: "agent:family:whatsapp:group:123",
    });
    expect(familyPolicy.agentId).toBe("family");
    expect(familyPolicy.agentPolicy).toEqual({
      allow: ["read"],
      deny: ["exec", "write", "edit", "process"],
    });
  });

  it("should resolve group tool policy overrides (group-specific beats wildcard)", () => {
    const cfg: OpenClawConfig = {
      channels: {
        whatsapp: {
          groups: {
            "*": {
              tools: { allow: ["read"] },
            },
            trusted: {
              tools: { allow: ["read", "exec"] },
            },
          },
        },
      },
    };

    expect(
      resolveChannelGroupToolsPolicy({ cfg, channel: "whatsapp", groupId: "trusted" }),
    ).toEqual({ allow: ["read", "exec"] });

    expect(
      resolveChannelGroupToolsPolicy({ cfg, channel: "whatsapp", groupId: "unknown" }),
    ).toEqual({ allow: ["read"] });
  });

  it("should apply per-sender tool policies for group tools", () => {
    const cfg: OpenClawConfig = {
      channels: {
        whatsapp: {
          groups: {
            "*": {
              tools: { allow: ["read"] },
              toolsBySender: {
                "id:alice": { allow: ["read", "exec"] },
              },
            },
          },
        },
      },
    };

    expect(
      resolveChannelGroupToolsPolicy({
        cfg,
        channel: "whatsapp",
        groupId: "family",
        senderId: "alice",
      }),
    ).toEqual({ allow: ["read", "exec"] });

    expect(
      resolveChannelGroupToolsPolicy({
        cfg,
        channel: "whatsapp",
        groupId: "family",
        senderId: "bob",
      }),
    ).toEqual({ allow: ["read"] });
  });

  it("should not let default sender policy override group tools", () => {
    const cfg: OpenClawConfig = {
      channels: {
        whatsapp: {
          groups: {
            "*": {
              toolsBySender: {
                "id:admin": { allow: ["read", "exec"] },
              },
            },
            locked: {
              tools: { allow: ["read"] },
            },
          },
        },
      },
    };

    expect(
      resolveChannelGroupToolsPolicy({
        cfg,
        channel: "whatsapp",
        groupId: "locked",
        senderId: "admin",
      }),
    ).toEqual({ allow: ["read"] });
  });

  it("should resolve telegram group tool policy for topic session keys", () => {
    const cfg: OpenClawConfig = {
      channels: {
        telegram: {
          groups: {
            "123": {
              tools: { allow: ["read"] },
            },
          },
        },
      },
    };

    expect(resolveChannelGroupToolsPolicy({ cfg, channel: "telegram", groupId: "123" })).toEqual({
      allow: ["read"],
    });
  });

  it("should resolve feishu group tool policy for sender-scoped session keys", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          groups: {
            oc_group_chat: {
              tools: { allow: ["read"] },
            },
          },
        },
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:feishu:group:oc_group_chat:topic:om_topic_root:sender:ou_topic_user",
      messageProvider: "feishu",
      workspaceDir: "/tmp/test-feishu-scoped-group",
      agentDir: "/tmp/agent-feishu",
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain("read");
    expect(names).not.toContain("exec");
  });

  it("should prefer scoped group candidates before wildcard tool policy", () => {
    const cfg: OpenClawConfig = {
      channels: {
        feishu: {
          groups: {
            "*": {
              tools: { allow: ["read", "exec"] },
            },
            oc_group_chat: {
              tools: { allow: ["read"] },
            },
          },
        },
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:main:feishu:group:oc_group_chat:topic:om_topic_root:sender:ou_topic_user",
      messageProvider: "feishu",
      workspaceDir: "/tmp/test-feishu-wildcard-group",
      agentDir: "/tmp/agent-feishu-wildcard",
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain("read");
    expect(names).not.toContain("exec");
  });

  it("should resolve inherited group tool policy for subagent parent groups", () => {
    const cfg: OpenClawConfig = {
      channels: {
        whatsapp: {
          groups: {
            trusted: {
              tools: { allow: ["read"] },
            },
          },
        },
      },
    };

    expect(
      resolveChannelGroupToolsPolicy({ cfg, channel: "whatsapp", groupId: "trusted" }),
    ).toEqual({ allow: ["read"] });
  });

  it("should apply global tool policy before agent-specific policy", () => {
    const cfg: OpenClawConfig = {
      tools: {
        deny: ["browser"], // Global deny
      },
      agents: {
        list: [
          {
            id: "work",
            workspace: "~/openclaw-work",
            tools: {
              deny: ["exec", "process"], // Agent deny (override)
            },
          },
        ],
      },
    };

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:work:slack:dm:user123",
      workspaceDir: "/tmp/test-work",
      agentDir: "/tmp/agent-work",
    });

    const toolNames = tools.map((t) => t.name);
    // Global policy still applies; agent policy further restricts
    expect(toolNames).not.toContain("browser");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("process");
    expect(toolNames).not.toContain("apply_patch");
  });

  it("should work with sandbox tools filtering", () => {
    const cfg = createRestrictedAgentSandboxConfig({
      agentTools: {
        allow: ["read"], // Agent further restricts to only read
        deny: ["exec", "write"],
      },
      globalSandboxTools: {
        allow: ["read", "write", "exec"], // Sandbox allows these
        deny: [],
      },
    });

    const tools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:restricted:main",
      workspaceDir: "/tmp/test-restricted",
      agentDir: "/tmp/agent-restricted",
      sandbox: {
        enabled: true,
        backendId: "docker",
        sessionKey: "agent:restricted:main",
        workspaceDir: "/tmp/sandbox",
        agentWorkspaceDir: "/tmp/test-restricted",
        workspaceAccess: "none",
        runtimeId: "test-container",
        runtimeLabel: "test-container",
        containerName: "test-container",
        containerWorkdir: "/workspace",
        docker: {
          image: "test-image",
          containerPrefix: "test-",
          workdir: "/workspace",
          readOnlyRoot: true,
          tmpfs: [],
          network: "none",
          capDrop: [],
        } satisfies SandboxDockerConfig,
        tools: {
          allow: ["read", "write", "exec"],
          deny: [],
        },
        fsBridge: sandboxFsBridgeStub,
        browserAllowHostControl: false,
      },
    });

    const toolNames = tools.map((t) => t.name);
    // Agent policy should be applied first, then sandbox
    // Agent allows only "read", sandbox allows ["read", "write", "exec"]
    // Result: only "read" (most restrictive wins)
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("write");
  });
});
