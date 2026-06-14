import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import { AdmittedModelCatalogService } from "./admitted-model-catalog-runtime.js";
import { resolveModelAsync } from "./pi-embedded-runner/model.js";

vi.mock("./pi-embedded-runner/model.js", () => ({
  resolveModelAsync: vi.fn(async () => ({
    model: null,
    error: "dynamic lookup should not run for registry hits",
  })),
}));

vi.mock("./models-config.plan.js", () => ({
  planOpenClawModelsJson: vi.fn(async () => ({ action: "skip" })),
}));

function makeModel(provider: string, id: string): ProviderRuntimeModel {
  return {
    id,
    name: id,
    provider,
    api: provider === "codex" ? "openai-codex-responses" : "openai-completions",
    baseUrl:
      provider === "codex" ? "https://chatgpt.com/backend-api" : "https://openrouter.ai/api/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262_000,
    maxTokens: 128_000,
  } as ProviderRuntimeModel;
}

describe("AdmittedModelCatalogService", () => {
  it("uses admitted catalog registry authority for provider-family aliases without dynamic lookup", async () => {
    const model = makeModel("codex", "gpt-5.5");
    const find = vi.fn((provider: string, modelId: string) =>
      provider === "codex" && modelId === "gpt-5.5" ? model : null,
    );

    const admitted = await new AdmittedModelCatalogService().resolve({
      agentDir: "/tmp/openclaw-agent",
      provider: "openai-codex",
      modelId: "gpt-5.5",
      authStorage: {} as AuthStorage,
      modelRegistry: { find } as unknown as ModelRegistry,
      modelRegistryAuthority: "admitted_catalog",
      requestParams: { reasoning_effort: "xhigh", parallel_tool_calls: true },
      thinkingLevel: "xhigh",
      catalogSnapshotId: "catalog:test",
    });

    expect(admitted).toMatchObject({
      requestedRef: "openai-codex/gpt-5.5",
      canonicalRef: "codex/gpt-5.5",
      provider: "codex",
      modelId: "gpt-5.5",
      resolutionSource: "provider_family_alias",
      request: {
        reasoningEffort: "xhigh",
        thinking: "xhigh",
        parallelToolCalls: true,
        contextWindowTokens: 262_000,
      },
    });
    expect(find).toHaveBeenCalledWith("codex", "gpt-5.5");
    expect(resolveModelAsync).not.toHaveBeenCalled();
  });

  it("does not accept an unmarked compatibility registry as native admission authority", async () => {
    const model = makeModel("stale-sidecar", "only-in-models-json");
    const find = vi.fn((provider: string, modelId: string) =>
      provider === "stale-sidecar" && modelId === "only-in-models-json" ? model : null,
    );

    await expect(
      new AdmittedModelCatalogService().resolve({
        agentDir: "/tmp/openclaw-agent",
        provider: "stale-sidecar",
        modelId: "only-in-models-json",
        authStorage: {} as AuthStorage,
        modelRegistry: { find } as unknown as ModelRegistry,
        allowDynamicLookup: false,
      }),
    ).rejects.toThrow("Unknown admitted model in registry: stale-sidecar/only-in-models-json");

    expect(find).not.toHaveBeenCalled();
  });
});
