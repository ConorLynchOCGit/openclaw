import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import { prepareModelAuthRuntime } from "./model-auth-runtime.js";

function makeModel(provider: string, id: string): ProviderRuntimeModel {
  return {
    id,
    name: id,
    provider,
    api: provider === "openrouter" ? "openai-completions" : "openai-codex-responses",
    baseUrl:
      provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272_000,
    maxTokens: 128_000,
  } as ProviderRuntimeModel;
}

function baseInput(overrides: { provider: string; modelId: string; modelRegistry: ModelRegistry }) {
  return {
    prompt: "Run the node.",
    provider: overrides.provider,
    modelId: overrides.modelId,
    agentDir: "/tmp/openclaw-agent",
    resolvedWorkspace: "/tmp/openclaw-workspace",
    sessionId: "session-1",
    nodeNativeWorkerRun: true,
    authStorage: {} as AuthStorage,
    modelRegistry: overrides.modelRegistry,
  };
}

describe("prepareModelAuthRuntime admitted model lookup", () => {
  it("admits openai-codex gpt-5.5 through the Codex app-server catalog alias", async () => {
    const codexModel = makeModel("codex", "gpt-5.5");
    const find = vi.fn((provider: string, modelId: string) =>
      provider === "codex" && modelId === "gpt-5.5" ? codexModel : null,
    );

    const result = await prepareModelAuthRuntime(
      baseInput({
        provider: "openai-codex",
        modelId: "gpt-5.5",
        modelRegistry: { find } as unknown as ModelRegistry,
      }),
    );

    expect(result.provider).toBe("codex");
    expect(result.modelId).toBe("gpt-5.5");
    expect(result.runtimeModel).toBe(codexModel);
    expect(find).toHaveBeenCalledWith("codex", "gpt-5.5");
  });

  it("uses an already-admitted runtime model without requiring registry lookup authority", async () => {
    const admitted = makeModel("codex", "gpt-5.5");
    const find = vi.fn(() => null);

    const result = await prepareModelAuthRuntime({
      ...baseInput({
        provider: "openai-codex",
        modelId: "gpt-5.5",
        modelRegistry: { find } as unknown as ModelRegistry,
      }),
      admittedRuntimeModel: admitted,
    });

    expect(result.provider).toBe("codex");
    expect(result.modelId).toBe("gpt-5.5");
    expect(result.runtimeModel).toBe(admitted);
    expect(find).not.toHaveBeenCalled();
  });

  it("admits OpenRouter models when the catalog stores the provider-prefixed id", async () => {
    const kimiModel = makeModel("openrouter", "openrouter/moonshotai/kimi-k2.6");
    const find = vi.fn((provider: string, modelId: string) =>
      provider === "openrouter" && modelId === "openrouter/moonshotai/kimi-k2.6" ? kimiModel : null,
    );

    const result = await prepareModelAuthRuntime(
      baseInput({
        provider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        modelRegistry: { find } as unknown as ModelRegistry,
      }),
    );

    expect(result.provider).toBe("openrouter");
    expect(result.modelId).toBe("openrouter/moonshotai/kimi-k2.6");
    expect(result.runtimeModel).toBe(kimiModel);
    expect(find).toHaveBeenCalledWith("openrouter", "openrouter/moonshotai/kimi-k2.6");
  });

  it("admits OpenRouter models when the request carries the provider-prefixed id", async () => {
    const kimiModel = makeModel("openrouter", "moonshotai/kimi-k2.6");
    const find = vi.fn((provider: string, modelId: string) =>
      provider === "openrouter" && modelId === "moonshotai/kimi-k2.6" ? kimiModel : null,
    );

    const result = await prepareModelAuthRuntime(
      baseInput({
        provider: "openrouter",
        modelId: "openrouter/moonshotai/kimi-k2.6",
        modelRegistry: { find } as unknown as ModelRegistry,
      }),
    );

    expect(result.provider).toBe("openrouter");
    expect(result.modelId).toBe("moonshotai/kimi-k2.6");
    expect(result.runtimeModel).toBe(kimiModel);
    expect(find).toHaveBeenCalledWith("openrouter", "moonshotai/kimi-k2.6");
  });
});
