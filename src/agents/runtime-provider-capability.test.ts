import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";

const codexModelsMock = vi.hoisted(() => ({
  listCodexAppServerModels: vi.fn(),
}));

vi.mock("../../extensions/codex/src/app-server/models.js", () => codexModelsMock);

import {
  AgentRuntimeProviderCapabilityNotReadyError,
  createAgentRuntimeProviderCapability,
} from "./runtime-provider-capability.js";

const originalLiveCapabilitySmoke = process.env.OPENCLAW_CODEX_PROVIDER_CAPABILITY_LIVE;

function makeRuntimeModel(input: {
  provider: string;
  api: string;
  id?: string;
}): ProviderRuntimeModel {
  return {
    id: input.id ?? "gpt-5.5",
    name: input.id ?? "gpt-5.5",
    provider: input.provider,
    api: input.api,
    input: ["text"],
    reasoning: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262_000,
    maxTokens: 128_000,
  } as ProviderRuntimeModel;
}

function makeCapabilityInput(input: { provider: string; api: string; model?: string }) {
  const model = input.model ?? "gpt-5.5";
  return {
    provider: input.provider,
    model,
    runtimeModel: makeRuntimeModel({ provider: input.provider, api: input.api, id: model }),
    catalogSnapshotId: "catalog:test",
    authContext: {
      credentialSourceClass:
        input.provider === "codex" ? "codex_app_server" : "runtime_auth_storage",
      syntheticAuthAvailable: input.provider === "codex",
    },
    runtimeRoots: {
      canonicalSourceRoot: "/repo",
      runtimeWorkspaceDir: "/runtime/workspace",
      transcriptRoot: "/runtime/transcripts",
      artifactRoot: "/runtime/artifacts",
    },
    toolPolicy: ["edit", "node_finish"],
    promptProfile: "execution-orchestrator",
    config: {},
  };
}

describe("createAgentRuntimeProviderCapability", () => {
  beforeEach(() => {
    process.env.OPENCLAW_CODEX_PROVIDER_CAPABILITY_LIVE = "1";
    codexModelsMock.listCodexAppServerModels.mockReset();
  });

  afterEach(() => {
    if (originalLiveCapabilitySmoke === undefined) {
      delete process.env.OPENCLAW_CODEX_PROVIDER_CAPABILITY_LIVE;
    } else {
      process.env.OPENCLAW_CODEX_PROVIDER_CAPABILITY_LIVE = originalLiveCapabilitySmoke;
    }
    codexModelsMock.listCodexAppServerModels.mockReset();
  });

  it("builds Codex app-server capability only after the executable provider path is usable", async () => {
    codexModelsMock.listCodexAppServerModels.mockResolvedValueOnce({
      models: [{ id: "gpt-5.5", model: "gpt-5.5" }],
    });

    const capability = await createAgentRuntimeProviderCapability(
      makeCapabilityInput({ provider: "codex", api: "openai-codex-responses" }),
    );

    expect(capability).toMatchObject({
      artifactKind: "openclaw.runtime_generation.provider_capability",
      capabilityId: "codex_app_server",
      provider: "codex",
      model: "gpt-5.5",
      transportKind: "codex_app_server",
      fallbackAllowed: false,
    });
    expect(codexModelsMock.listCodexAppServerModels).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
        sharedClient: true,
      }),
    );
  });

  it("fails RuntimeGeneration capability construction when Codex app-server auth is unusable", async () => {
    codexModelsMock.listCodexAppServerModels.mockRejectedValueOnce(
      new Error("Failed to extract accountId from token"),
    );

    try {
      await createAgentRuntimeProviderCapability(
        makeCapabilityInput({ provider: "codex", api: "openai-codex-responses" }),
      );
      throw new Error("Expected Codex capability construction to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRuntimeProviderCapabilityNotReadyError);
      expect(error).toMatchObject({
        name: "AgentRuntimeProviderCapabilityNotReadyError",
        code: "CODEX_ACCOUNT_TOKEN_INVALID",
        failedPhase: "provider_auth_or_transport_init",
        provider: "codex",
        model: "gpt-5.5",
        transportKind: "codex_app_server",
        catalogSnapshotId: "catalog:test",
      });
    }
  });

  it("keeps ordinary providers on the generic OpenClaw provider capability without Codex smoke", async () => {
    const capability = await createAgentRuntimeProviderCapability(
      makeCapabilityInput({ provider: "openrouter", api: "openai-responses", model: "kimi-k2.5" }),
    );

    expect(capability).toMatchObject({
      capabilityId: "generic_provider_runtime",
      provider: "openrouter",
      model: "kimi-k2.5",
      transportKind: "generic_provider_runtime",
      fallbackAllowed: true,
    });
    expect(codexModelsMock.listCodexAppServerModels).not.toHaveBeenCalled();
  });
});
