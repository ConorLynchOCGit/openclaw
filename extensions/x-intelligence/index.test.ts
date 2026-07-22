import { describe, expect, it, vi } from "vitest";
import plugin, { resolveXResearchToolIdentityBlock } from "./index.js";

describe("X Intelligence admission hook identity guard", () => {
  it("fails closed for an admitted tool called by an unprofiled non-researcher", () => {
    expect(
      resolveXResearchToolIdentityBlock({
        toolName: "x_search",
        agentId: "main",
        researcherAgentId: "x-researcher",
      }),
    ).toEqual({ block: true, blockReason: "admission_identity_missing_or_unauthorized" });
  });

  it("registers the same fail-closed guard before any tool dispatch", async () => {
    type Hook = (
      event: Record<string, unknown>,
      context: Record<string, unknown>,
    ) => Promise<unknown>;
    const hooks = new Map<string, Hook>();
    let trustedPolicy: Hook | undefined;
    const values = new Map<string, unknown>();
    const store = {
      register: async (key: string, value: unknown) => void values.set(key, value),
      registerIfAbsent: async (key: string, value: unknown) => {
        if (values.has(key)) {
          return false;
        }
        values.set(key, value);
        return true;
      },
      update: async (key: string, update: (value: unknown) => unknown) => {
        const next = update(values.get(key));
        if (next === undefined) {
          return false;
        }
        values.set(key, next);
        return true;
      },
      lookup: async (key: string) => values.get(key),
      consume: async (key: string) => {
        const value = values.get(key);
        values.delete(key);
        return value;
      },
      delete: async (key: string) => values.delete(key),
      entries: async () => [...values].map(([key, value]) => ({ key, value, createdAt: 0 })),
      clear: async () => values.clear(),
    };
    const api = {
      pluginConfig: {},
      runtime: {
        state: { openKeyedStore: () => store },
        subagent: { run: vi.fn(), waitForRun: vi.fn() },
      },
      on: vi.fn((name: string, hook: Hook) => hooks.set(name, hook)),
      registerTrustedToolPolicy: vi.fn((policy: { evaluate: Hook }) => {
        trustedPolicy = policy.evaluate;
      }),
      registerGatewayMethod: vi.fn(),
      registerService: vi.fn(),
      registerTool: vi.fn(),
    };
    plugin.register(api as never);

    await expect(
      trustedPolicy?.(
        { toolName: "x_search", params: {}, runId: "run", toolCallId: "call" },
        { agentId: "main", sessionKey: "agent:main", sessionId: "session" },
      ),
    ).resolves.toEqual({
      block: true,
      blockReason: "admission_identity_missing_or_unauthorized",
    });
    await expect(
      hooks.get("before_agent_run")?.(
        { prompt: "research" },
        {
          runId: "run",
          sessionKey: "agent:x-researcher:main",
          sessionId: "session",
          agentId: "x-researcher",
          modelProviderId: "openrouter",
          modelId: "x-ai/grok-4.5",
          workspaceDir: "/tmp/x",
        },
      ),
    ).resolves.toEqual({ outcome: "block", reason: "admission_native_subagent_required" });
  });

  it("leaves unrelated tools and the configured researcher to the normal hook path", () => {
    expect(
      resolveXResearchToolIdentityBlock({
        toolName: "read",
        agentId: "main",
        researcherAgentId: "x-researcher",
      }),
    ).toBeUndefined();
    expect(
      resolveXResearchToolIdentityBlock({
        toolName: "x_posts",
        agentId: "x-researcher",
        researcherAgentId: "x-researcher",
      }),
    ).toBeUndefined();
  });
});
