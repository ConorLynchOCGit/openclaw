import type { StreamFn } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import { applyExtraParamsToAgent, resolveExtraParams } from "./pi-embedded-runner/extra-params.js";

describe("resolveExtraParams", () => {
  it("returns undefined with no model config", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "zai",
      modelId: "glm-4.7",
    });

    expect(result).toBeUndefined();
  });

  it("applies default runtime params for OpenAI GPT-5 models", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "openai",
      modelId: "gpt-5.4",
    });

    expect(result).toEqual({
      parallel_tool_calls: true,
      text_verbosity: "low",
      openaiWsWarmup: true,
    });
  });

  it("adds explicit OpenRouter Kimi implementation-worker runtime defaults", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      agentId: "execution-coding",
    });

    expect(result).toEqual({
      parallel_tool_calls: true,
      reasoning: { effort: "none", exclude: true },
      thinking: { type: "disabled" },
    });
  });

  it("does not add Kimi implementation-worker defaults to non-worker agents", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      agentId: "execution-context-scout",
    });

    expect(result).toBeUndefined();
  });

  it("returns params for exact provider/model key", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-4": {
                params: {
                  temperature: 0.7,
                  maxTokens: 2048,
                },
              },
            },
          },
        },
      },
      provider: "openai",
      modelId: "gpt-4",
    });

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 2048,
    });
  });

  it("ignores unrelated model entries", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-4": {
                params: {
                  temperature: 0.7,
                },
              },
            },
          },
        },
      },
      provider: "openai",
      modelId: "gpt-4.1-mini",
    });

    expect(result).toBeUndefined();
  });

  it("returns per-agent params when agentId matches", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          list: [
            {
              id: "risk-reviewer",
              params: { cacheRetention: "none" },
            },
          ],
        },
      },
      provider: "anthropic",
      modelId: "claude-opus-4-6",
      agentId: "risk-reviewer",
    });

    expect(result).toEqual({ cacheRetention: "none" });
  });

  it("merges per-agent params over global model defaults", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "anthropic/claude-opus-4-6": {
                params: {
                  temperature: 0.5,
                  cacheRetention: "long",
                },
              },
            },
          },
          list: [
            {
              id: "risk-reviewer",
              params: { cacheRetention: "none" },
            },
          ],
        },
      },
      provider: "anthropic",
      modelId: "claude-opus-4-6",
      agentId: "risk-reviewer",
    });

    expect(result).toEqual({
      temperature: 0.5,
      cacheRetention: "none",
    });
  });

  it("preserves higher-precedence agent parallelToolCalls override across alias styles", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-4.1": {
                params: {
                  parallel_tool_calls: true,
                },
              },
            },
          },
          list: [
            {
              id: "main",
              params: {
                parallelToolCalls: false,
              },
            },
          ],
        },
      },
      provider: "openai",
      modelId: "gpt-4.1",
      agentId: "main",
    });

    expect(result).toEqual({
      parallel_tool_calls: false,
    });
  });

  it("canonicalizes text verbosity alias styles with agent override precedence", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5.4": {
                params: {
                  text_verbosity: "high",
                },
              },
            },
          },
          list: [
            {
              id: "main",
              params: {
                textVerbosity: "low",
              },
            },
          ],
        },
      },
      provider: "openai",
      modelId: "gpt-5.4",
      agentId: "main",
    });

    expect(result).toEqual({
      openaiWsWarmup: true,
      parallel_tool_calls: true,
      text_verbosity: "low",
    });
  });

  it("ignores per-agent params when agentId does not match", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          list: [
            {
              id: "risk-reviewer",
              params: { cacheRetention: "none" },
            },
          ],
        },
      },
      provider: "anthropic",
      modelId: "claude-opus-4-6",
      agentId: "main",
    });

    expect(result).toBeUndefined();
  });

  it("injects Kimi reasoning disable and parallel tool calls into OpenRouter payloads", async () => {
    let capturedPayload: Record<string, unknown> | null = null;
    const model = {
      provider: "openrouter",
      id: "moonshotai/kimi-k2.6",
      api: "anthropic",
    } as ProviderRuntimeModel;
    const agent: { streamFn: StreamFn } = {
      streamFn: ((_model, _context, options) => {
        options?.onPayload?.({}, _model);
        return {
          async result() {
            return {};
          },
          [Symbol.asyncIterator]() {
            return (async function* () {})();
          },
        } as unknown as ReturnType<StreamFn>;
      }) as StreamFn,
    };
    applyExtraParamsToAgent(
      agent,
      undefined,
      "openrouter",
      "moonshotai/kimi-k2.6",
      undefined,
      undefined,
      "execution-coding",
      undefined,
      model,
    );

    const stream = agent.streamFn(model, {} as never, {
      onPayload: (payload) => {
        capturedPayload = payload as Record<string, unknown>;
      },
    }) as unknown as { result(): Promise<unknown> };
    await stream.result();

    expect(capturedPayload).toMatchObject({
      parallel_tool_calls: true,
      reasoning: { effort: "none", exclude: true },
      thinking: { type: "disabled" },
    });
  });
});
