import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import type { PluginHookBeforeAgentStartResult } from "../plugins/types.js";
import type { AuthProfileStore } from "./auth-profiles.js";
import {
  ensureAuthProfileStore,
  resolveAuthProfileEligibility,
  resolveAuthProfileOrder,
} from "./auth-profiles.js";
import type { ContextWindowInfo } from "./context-window-guard.js";
import { FailoverError } from "./failover-error.js";
import { type ResolvedProviderAuth, shouldPreferExplicitConfigApiKeyAuth } from "./model-auth.js";
import { normalizeStaticProviderModelId } from "./model-ref-shared.js";
import { normalizeProviderId } from "./model-selection.js";
import { resolveModelAsync } from "./pi-embedded-runner/model.js";
import {
  resolveEffectiveRuntimeModel,
  resolveHookModelSelection,
} from "./pi-embedded-runner/run/setup.js";
import { discoverAuthStorage, discoverModels } from "./pi-model-discovery.js";

export type ApiKeyInfo = ResolvedProviderAuth;

export type PreparedModelAuthRuntime = {
  owner: "agent_runtime_core";
  provider: string;
  modelId: string;
  legacyBeforeAgentStartResult?: PluginHookBeforeAgentStartResult;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  modelRegistryStatus: "reused" | "discovered";
  runtimeModel: ProviderRuntimeModel;
  effectiveModel: ProviderRuntimeModel;
  ctxInfo: ContextWindowInfo;
  authStore: AuthProfileStore;
  authProfileCount: number;
  preferredProfileId?: string;
  lockedProfileId?: string;
  profileCandidates: Array<string | undefined>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type PrepareModelAuthRuntimeInput = {
  config?: OpenClawConfig;
  prompt: string;
  provider: string;
  modelId: string;
  agentDir: string;
  resolvedWorkspace: string;
  sessionId: string;
  sessionKey?: string | null;
  agentId?: string | null;
  messageProvider?: string | null;
  messageChannel?: string | null;
  trigger?: string;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  admittedRuntimeModel?: ProviderRuntimeModel;
  authProfileId?: string | null;
  authProfileIdSource?: string | null;
  nodeNativeWorkerRun: boolean;
};

function findAdmittedRuntimeModel(params: {
  modelRegistry: ModelRegistry;
  provider: string;
  modelId: string;
}): ProviderRuntimeModel | undefined {
  const providers = buildAdmittedProviderCandidates(params.provider);
  const modelIds = buildAdmittedModelIdCandidates({
    provider: params.provider,
    modelId: params.modelId,
  });
  for (const provider of providers) {
    for (const modelId of modelIds) {
      const model = params.modelRegistry.find(provider, modelId) as ProviderRuntimeModel | null;
      if (model) {
        return model;
      }
    }
  }
  return undefined;
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function buildAdmittedProviderCandidates(provider: string): string[] {
  const normalized = normalizeProviderId(provider);
  return uniqueNonEmpty([
    provider,
    normalized,
    normalized === "openai-codex" ? "codex" : undefined,
    normalized === "codex" ? "openai-codex" : undefined,
  ]);
}

function buildAdmittedModelIdCandidates(params: { provider: string; modelId: string }): string[] {
  const normalizedProvider = normalizeProviderId(params.provider);
  const rawModelId = params.modelId.trim();
  const normalizedModelId = normalizeStaticProviderModelId(normalizedProvider, rawModelId);
  const providerPrefix = `${normalizedProvider}/`;
  const strippedProviderPrefix =
    rawModelId.toLowerCase().startsWith(providerPrefix) && rawModelId.length > providerPrefix.length
      ? rawModelId.slice(providerPrefix.length)
      : undefined;
  const openRouterPrefixed =
    normalizedProvider === "openrouter" &&
    rawModelId &&
    !rawModelId.toLowerCase().startsWith("openrouter/")
      ? `openrouter/${rawModelId}`
      : undefined;
  const openRouterStripped =
    normalizedProvider === "openrouter" &&
    rawModelId.toLowerCase().startsWith("openrouter/") &&
    rawModelId.length > "openrouter/".length
      ? rawModelId.slice("openrouter/".length)
      : undefined;
  return uniqueNonEmpty([
    normalizedModelId,
    rawModelId,
    strippedProviderPrefix,
    openRouterPrefixed,
    openRouterStripped,
  ]);
}

export async function prepareModelAuthRuntime(
  input: PrepareModelAuthRuntimeInput,
): Promise<PreparedModelAuthRuntime> {
  const hookContext = {
    agentId: input.agentId ?? undefined,
    sessionKey: input.sessionKey ?? undefined,
    sessionId: input.sessionId,
    workspaceDir: input.resolvedWorkspace,
    modelProviderId: input.provider,
    modelId: input.modelId,
    messageProvider: input.messageProvider ?? undefined,
    trigger: input.trigger,
    channelId: input.messageChannel ?? input.messageProvider ?? undefined,
  };
  const hookSelection = await resolveHookModelSelection({
    prompt: input.prompt,
    provider: input.provider,
    modelId: input.modelId,
    hookRunner: getGlobalHookRunner(),
    hookContext,
  });
  const provider = hookSelection.provider;
  const modelId = hookSelection.modelId;
  if (input.nodeNativeWorkerRun && (!input.authStorage || !input.modelRegistry)) {
    throw new FailoverError(
      "Node-bound native worker launch requires admitted authStorage and modelRegistry; refusing worker-local provider discovery.",
      {
        reason: "unknown",
        provider,
        model: modelId,
      },
    );
  }
  const authStorage =
    input.authStorage ?? discoverAuthStorage(input.agentDir, { syncExternalCli: false });
  const modelRegistry = input.modelRegistry ?? discoverModels(authStorage, input.agentDir);
  const admittedRuntime = Boolean(input.authStorage && input.modelRegistry);
  const admittedRuntimeModel =
    input.admittedRuntimeModel ??
    (admittedRuntime ? findAdmittedRuntimeModel({ modelRegistry, provider, modelId }) : undefined);
  let runtimeModel: ProviderRuntimeModel | undefined = admittedRuntimeModel;
  let modelResolveError: string | undefined;
  if (!runtimeModel && admittedRuntime) {
    modelResolveError = `Unknown admitted model: ${provider}/${modelId}`;
  }
  if (!runtimeModel && !admittedRuntime) {
    const { model, error } = await resolveModelAsync(
      provider,
      modelId,
      input.agentDir,
      input.config,
      {
        authStorage,
        modelRegistry,
      },
    );
    runtimeModel = model as ProviderRuntimeModel | undefined;
    modelResolveError = error;
  }
  if (!runtimeModel) {
    throw new FailoverError(modelResolveError ?? `Unknown model: ${provider}/${modelId}`, {
      reason: "model_not_found",
      provider,
      model: modelId,
    });
  }
  const runtimeProvider = normalizeProviderId(runtimeModel.provider || provider);
  const runtimeModelId = runtimeModel.id || modelId;
  const resolvedRuntimeModel = resolveEffectiveRuntimeModel({
    cfg: input.config,
    provider: runtimeProvider,
    modelId: runtimeModelId,
    runtimeModel,
  });
  const shouldLoadAuthProfileStore = !admittedRuntime || Boolean(input.authProfileId?.trim());
  const authStore = shouldLoadAuthProfileStore
    ? ensureAuthProfileStore(input.agentDir, {
        allowKeychainPrompt: false,
        syncExternalCli: false,
      })
    : ({
        version: 1,
        profiles: {},
      } satisfies AuthProfileStore);
  const preferredProfileId = shouldLoadAuthProfileStore
    ? input.authProfileId?.trim() || undefined
    : undefined;
  let lockedProfileId = input.authProfileIdSource === "user" ? preferredProfileId : undefined;
  if (lockedProfileId) {
    const lockedProfile = authStore.profiles[lockedProfileId];
    if (!lockedProfile || normalizeProviderId(lockedProfile.provider) !== runtimeProvider) {
      lockedProfileId = undefined;
    }
  }
  if (lockedProfileId) {
    const eligibility = resolveAuthProfileEligibility({
      cfg: input.config,
      store: authStore,
      provider: runtimeProvider,
      profileId: lockedProfileId,
    });
    if (!eligibility.eligible) {
      throw new Error(
        `Auth profile "${lockedProfileId}" is not configured for ${runtimeProvider}.`,
      );
    }
  }
  const profileOrder = shouldPreferExplicitConfigApiKeyAuth(input.config, runtimeProvider)
    ? []
    : resolveAuthProfileOrder({
        cfg: input.config,
        store: authStore,
        provider: runtimeProvider,
        preferredProfile: preferredProfileId,
      });
  return {
    owner: "agent_runtime_core",
    provider: runtimeProvider,
    modelId: runtimeModelId,
    ...(hookSelection.legacyBeforeAgentStartResult
      ? { legacyBeforeAgentStartResult: hookSelection.legacyBeforeAgentStartResult }
      : {}),
    authStorage,
    modelRegistry,
    modelRegistryStatus: input.authStorage || input.modelRegistry ? "reused" : "discovered",
    runtimeModel,
    effectiveModel: resolvedRuntimeModel.effectiveModel,
    ctxInfo: resolvedRuntimeModel.ctxInfo,
    authStore,
    authProfileCount: Object.keys(authStore.profiles ?? {}).length,
    ...(preferredProfileId ? { preferredProfileId } : {}),
    ...(lockedProfileId ? { lockedProfileId } : {}),
    profileCandidates: lockedProfileId
      ? [lockedProfileId]
      : profileOrder.length > 0
        ? profileOrder
        : [undefined],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
