import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { loadSessionStore } from "../config/sessions.js";
import { createOpenClawTools } from "./openclaw-tools.js";
import { isUpdatePlanToolEnabledForOpenClawTools } from "./openclaw-tools.registration.js";
import { createUpdatePlanTool } from "./tools/update-plan-tool.js";

describe("openclaw-tools update_plan gating", () => {
  it("keeps update_plan disabled by default", () => {
    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: {} as OpenClawConfig,
      }),
    ).toBe(false);
  });

  it("registers update_plan when explicitly enabled", () => {
    const config = {
      tools: {
        experimental: {
          planTool: true,
        },
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config,
      }),
    ).toBe(true);
    expect(createUpdatePlanTool().displaySummary).toBe("Track a short structured work plan.");
  });

  it("auto-enables update_plan for unconfigured GPT-5 openai runs", () => {
    // Criterion 1 of the GPT-5.4 parity gate ("no stalls after planning") is
    // universal, not opt-in. Unspecified executionContract on a supported
    // provider/model auto-activates strict-agentic so unconfigured installs
    // get the same behavior as explicit opt-in. Explicit "default" still
    // opts out (see "respects explicit default contract opt-out" below).
    const cfg = {
      agents: {
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(true);
    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai-codex",
        modelId: "gpt-5.4",
      }),
    ).toBe(true);
  });

  it("respects explicit default contract opt-out on GPT-5 runs", () => {
    // Users who explicitly set executionContract: "default" are saying they
    // want the old pre-parity-program behavior. Honor that opt-out.
    const cfg = {
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "default",
          },
        },
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(false);
  });

  it("does not auto-enable update_plan for non-openai providers even when unconfigured", () => {
    const cfg = {
      agents: {
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
      }),
    ).toBe(false);
    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-4.1",
      }),
    ).toBe(false);
  });

  it("auto-enables update_plan for strict-agentic GPT-5 agents", () => {
    const cfg = {
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "strict-agentic",
          },
        },
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(true);
  });

  it("does not auto-enable update_plan for unsupported providers or models", () => {
    const cfg = {
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "strict-agentic",
          },
        },
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "anthropic",
        modelId: "claude-sonnet-4-6",
      }),
    ).toBe(false);
    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-4.1",
      }),
    ).toBe(false);
  });

  it("lets explicit planTool false override strict-agentic auto-enable", () => {
    const cfg = {
      tools: {
        experimental: {
          planTool: false,
        },
      },
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "strict-agentic",
          },
        },
        list: [{ id: "main" }],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentSessionKey: "agent:main:main",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(false);
  });

  it("resolves strict-agentic gating from explicit agentId when no session key is available", () => {
    const cfg = {
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "default",
          },
        },
        list: [
          { id: "main" },
          {
            id: "research",
            embeddedPi: {
              executionContract: "strict-agentic",
            },
          },
        ],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentId: "research",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(true);
  });

  it("applies per-agent overrides without leaking the contract to other agents", () => {
    const cfg = {
      agents: {
        defaults: {
          embeddedPi: {
            executionContract: "strict-agentic",
          },
        },
        list: [
          {
            id: "main",
            embeddedPi: {
              executionContract: "default",
            },
          },
          {
            id: "research",
          },
        ],
      },
    } as OpenClawConfig;

    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentId: "main",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(false);
    expect(
      isUpdatePlanToolEnabledForOpenClawTools({
        config: cfg,
        agentId: "research",
        modelProvider: "openai",
        modelId: "gpt-5.4",
      }),
    ).toBe(true);
  });

  it("registers a session-owned update_plan that persists native todo state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-update-plan-registry-"));
    try {
      const sessionKey = "agent:execution-coding:node:nrun_registry";
      const storePath = path.join(root, "agents", "execution-coding", "sessions", "sessions.json");
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-registry", updatedAt: 1 },
        }),
        "utf8",
      );
      const cfg = {
        session: {
          store: path.join(root, "agents", "{agentId}", "sessions", "sessions.json"),
        },
        tools: {
          experimental: {
            planTool: true,
          },
        },
        agents: {
          list: [{ id: "execution-coding" }],
        },
      } as OpenClawConfig;

      const nativeTodoTools = createOpenClawTools({
        config: cfg,
        agentSessionKey: sessionKey,
        runId: "run-registry",
        disablePluginTools: true,
      });
      const updatePlan = nativeTodoTools.find((tool) => tool.name === "update_plan");
      const readTodo = nativeTodoTools.find((tool) => tool.name === "read_todo");

      expect(updatePlan).toBeTruthy();
      expect(readTodo).toBeTruthy();
      await updatePlan!.execute("call-registry", {
        plan: [{ step: "Persist through OpenClaw tool registry", status: "completed" }],
      });
      const readResult = await readTodo!.execute("call-read", {});

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.todo?.items).toEqual([
        {
          content: "Persist through OpenClaw tool registry",
          status: "completed",
          priority: "normal",
          position: 1,
        },
      ]);
      expect(readResult.details).toEqual(
        expect.objectContaining({
          status: "ok",
          sessionKey,
          itemCount: 1,
          completedCount: 1,
          inProgressCount: 0,
        }),
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
