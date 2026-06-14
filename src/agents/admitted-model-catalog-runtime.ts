import { createHash } from "node:crypto";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { createConfigRuntimeEnv } from "../config/env-vars.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
import { DEFAULT_PROVIDER } from "./defaults.js";
import { normalizeStaticProviderModelId } from "./model-ref-shared.js";
import { normalizeProviderId, parseModelRef } from "./model-selection.js";
import { planOpenClawModelsJson } from "./models-config.plan.js";
import { resolveModelAsync } from "./pi-embedded-runner/model.js";

export type AdmittedModelRequestParameters = {
  reasoning: unknown;
  reasoningEffort: string | null;
  thinking: string | null;
  maxTokens: number | null;
  temperature: number | null;
  parallelToolCalls: boolean | null;
  toolChoice: string | null;
  contextWindowTokens: number | null;
};

export type AdmittedModelIdentity = {
  requestedRef: string;
  canonicalRef: string;
  provider: string;
  transport: string | null;
  modelId: string;
  catalogSnapshotId: string;
  resolutionSource: "admitted_catalog" | "provider_dynamic" | "provider_family_alias";
  request: AdmittedModelRequestParameters;
  runtimeModel: ProviderRuntimeModel;
};

export type AdmittedModelCatalogResolveInput = {
  config?: OpenClawConfig;
  agentDir: string;
  workspaceDir?: string | null;
  provider: string;
  modelId: string;
  authStorage: AuthStorage;
  modelRegistry?: ModelRegistry;
  modelRegistryAuthority?: "admitted_catalog" | "compatibility_sidecar";
  requestParams?: Record<string, unknown> | null;
  thinkingLevel?: string | null;
  catalogSnapshotId?: string | null;
  allowDynamicLookup?: boolean;
};

export type AdmittedModelCatalogRuntime = {
  modelRegistry: ModelRegistry;
  config: OpenClawConfig | undefined;
  providerCount: number;
  modelCount: number;
  catalogMaterialHash: string;
  modelsJsonAuthority: false;
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function requestedModelRef(provider: string, modelId: string): string {
  const trimmedModel = modelId.trim();
  const normalizedProvider = normalizeProviderId(provider);
  return trimmedModel.toLowerCase().startsWith(`${normalizedProvider}/`)
    ? trimmedModel
    : `${provider.trim()}/${trimmedModel}`;
}

function providerCandidates(provider: string): string[] {
  const normalized = normalizeProviderId(provider);
  return uniqueNonEmpty([
    normalized,
    provider,
    normalized === "openai-codex" ? "codex" : undefined,
    normalized === "codex" ? "openai-codex" : undefined,
  ]);
}

function modelCandidates(provider: string, modelId: string): string[] {
  const normalizedProvider = normalizeProviderId(provider);
  const raw = modelId.trim();
  const normalized = normalizeStaticProviderModelId(normalizedProvider, raw);
  const parsed = parseModelRef(raw, normalizedProvider);
  const strippedProviderPrefix =
    raw.toLowerCase().startsWith(`${normalizedProvider}/`) &&
    raw.length > normalizedProvider.length + 1
      ? raw.slice(normalizedProvider.length + 1)
      : undefined;
  const openRouterPrefixed =
    normalizedProvider === "openrouter" && raw && !raw.toLowerCase().startsWith("openrouter/")
      ? `openrouter/${raw}`
      : undefined;
  const openRouterStripped =
    normalizedProvider === "openrouter" && raw.toLowerCase().startsWith("openrouter/")
      ? raw.slice("openrouter/".length)
      : undefined;
  return uniqueNonEmpty([
    normalized,
    raw,
    parsed?.model,
    strippedProviderPrefix,
    openRouterPrefixed,
    openRouterStripped,
  ]);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function resolveRequestParameters(input: {
  requestParams?: Record<string, unknown> | null;
  thinkingLevel?: string | null;
  runtimeModel: ProviderRuntimeModel;
}): AdmittedModelRequestParameters {
  const params = input.requestParams ?? {};
  const reasoning = params.reasoning ?? null;
  const reasoningRecord = recordValue(reasoning);
  const reasoningEffort =
    stringValue(params.reasoning_effort) ??
    stringValue(params.reasoningEffort) ??
    stringValue(reasoningRecord?.effort);
  return {
    reasoning,
    reasoningEffort,
    thinking: stringValue(params.thinking) ?? input.thinkingLevel ?? null,
    maxTokens:
      finiteNumber(params.max_tokens) ??
      finiteNumber(params.maxTokens) ??
      finiteNumber(input.runtimeModel.maxTokens),
    temperature: finiteNumber(params.temperature),
    parallelToolCalls:
      booleanValue(params.parallel_tool_calls) ?? booleanValue(params.parallelToolCalls),
    toolChoice: stringValue(params.tool_choice) ?? stringValue(params.toolChoice),
    contextWindowTokens:
      finiteNumber((input.runtimeModel as { contextTokens?: unknown }).contextTokens) ??
      finiteNumber(input.runtimeModel.contextWindow),
  };
}

function getAllModels(modelRegistry: ModelRegistry): ProviderRuntimeModel[] {
  const all = (modelRegistry as { getAll?: () => Array<Model<Api>> }).getAll?.() ?? [];
  return all.map((entry) => entry as ProviderRuntimeModel);
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function getProviderModelConfigMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const providers = (value as { providers?: unknown }).providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return {};
  }
  return providers as Record<string, Record<string, unknown>>;
}

function collectAgentModelRefs(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  const record = recordValue(value);
  if (!record) {
    return [];
  }
  return uniqueNonEmpty([stringValue(record.primary), ...stringArrayValue(record.fallbacks)]);
}

function configuredModelRefs(config?: OpenClawConfig): Array<{
  ref: string;
  entry: Record<string, unknown> | null;
}> {
  const refs = new Map<string, { ref: string; entry: Record<string, unknown> | null }>();
  const add = (ref: string | null | undefined, entry?: Record<string, unknown> | null) => {
    const trimmed = ref?.trim();
    if (!trimmed) {
      return;
    }
    const parsed = parseModelRef(trimmed, DEFAULT_PROVIDER);
    const key = parsed ? `${parsed.provider}/${parsed.model}` : trimmed;
    if (!refs.has(key)) {
      refs.set(key, { ref: trimmed, entry: entry ?? null });
    }
  };

  for (const [ref, entry] of Object.entries(config?.agents?.defaults?.models ?? {})) {
    add(ref, recordValue(entry));
  }
  for (const ref of collectAgentModelRefs(config?.agents?.defaults?.model)) {
    add(ref);
  }
  for (const agent of config?.agents?.list ?? []) {
    for (const ref of collectAgentModelRefs(agent?.model)) {
      add(ref);
    }
  }
  return [...refs.values()];
}

function canonicalCatalogProvider(provider: string): string {
  const normalized = normalizeProviderId(provider);
  return normalized === "openai-codex" ? "codex" : normalized;
}

function configuredProviderDefaults(
  provider: string,
  modelId: string,
): {
  provider: string;
  api: ProviderRuntimeModel["api"];
  baseUrl?: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: ProviderRuntimeModel["input"];
  compat?: ProviderRuntimeModel["compat"];
} | null {
  const canonicalProvider = canonicalCatalogProvider(provider);
  if (canonicalProvider === "codex") {
    return {
      provider: "codex",
      api: "openai-codex-responses",
      baseUrl: "https://chatgpt.com/backend-api",
      contextWindow: 272_000,
      maxTokens: 128_000,
      reasoning: true,
      input: ["text", "image"],
      compat: {
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
      },
    };
  }
  if (canonicalProvider === "openrouter") {
    const lowerModelId = modelId.toLowerCase();
    return {
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      contextWindow: 262_000,
      maxTokens: 128_000,
      reasoning:
        lowerModelId.includes("kimi") ||
        lowerModelId.includes("qwen") ||
        lowerModelId.includes("grok") ||
        lowerModelId.includes("deepseek") ||
        lowerModelId.includes("claude") ||
        lowerModelId.includes("gpt-"),
      input: ["text"],
      compat: {
        supportsUsageInStreaming: true,
      },
    };
  }
  return null;
}

function runtimeModelFromConfiguredRef(input: {
  ref: string;
  entry: Record<string, unknown> | null;
}): ProviderRuntimeModel | null {
  const parsed = parseModelRef(input.ref, DEFAULT_PROVIDER);
  if (!parsed) {
    return null;
  }
  const defaults = configuredProviderDefaults(parsed.provider, parsed.model);
  if (!defaults) {
    return null;
  }
  const params = recordValue(input.entry?.params) ?? {};
  const contextWindow =
    finiteNumber(params.contextWindow) ??
    finiteNumber(params.context_window) ??
    defaults.contextWindow;
  const contextTokens =
    finiteNumber(params.contextTokens) ??
    finiteNumber(params.context_tokens) ??
    finiteNumber(params.contextWindowTokens) ??
    finiteNumber(params.context_window_tokens);
  const maxTokens =
    finiteNumber(params.maxTokens) ?? finiteNumber(params.max_tokens) ?? defaults.maxTokens;
  return sanitizeRuntimeModel({
    id: parsed.model,
    name: stringValue(input.entry?.alias) ?? parsed.model,
    provider: defaults.provider,
    api: defaults.api,
    baseUrl: defaults.baseUrl,
    reasoning: defaults.reasoning,
    input: defaults.input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    ...(contextTokens ? { contextTokens } : {}),
    maxTokens,
    ...(defaults.compat ? { compat: defaults.compat } : {}),
  } as ProviderRuntimeModel);
}

function addConfiguredModelsToProviders(input: {
  providers: Record<string, Record<string, unknown>>;
  config?: OpenClawConfig;
}): Record<string, Record<string, unknown>> {
  const next: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(input.providers).map(([provider, config]) => [provider, { ...config }]),
  );
  for (const configured of configuredModelRefs(input.config)) {
    const model = runtimeModelFromConfiguredRef(configured);
    if (!model) {
      continue;
    }
    const provider = canonicalCatalogProvider(model.provider);
    const existing = next[provider] ?? {};
    const existingModels = Array.isArray(existing.models)
      ? [...(existing.models as Record<string, unknown>[])]
      : [];
    if (!existingModels.some((entry) => stringValue(entry.id) === model.id)) {
      existingModels.push(model as unknown as Record<string, unknown>);
    }
    next[provider] = {
      ...existing,
      baseUrl: stringValue(existing.baseUrl) ?? model.baseUrl,
      api: stringValue(existing.api) ?? model.api,
      models: existingModels,
    };
  }
  return next;
}

function providerConfigModels(params: {
  provider: string;
  providerConfig: Record<string, unknown>;
}): ProviderRuntimeModel[] {
  const models = Array.isArray(params.providerConfig.models)
    ? (params.providerConfig.models as Record<string, unknown>[])
    : [];
  const providerApi =
    typeof params.providerConfig.api === "string" ? params.providerConfig.api : null;
  const providerBaseUrl =
    typeof params.providerConfig.baseUrl === "string" ? params.providerConfig.baseUrl : undefined;
  const providerCost =
    params.providerConfig.cost && typeof params.providerConfig.cost === "object"
      ? (params.providerConfig.cost as ProviderRuntimeModel["cost"])
      : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  return models
    .map((model): ProviderRuntimeModel | null => {
      const id = typeof model.id === "string" ? model.id.trim() : "";
      if (!id) {
        return null;
      }
      const api = typeof model.api === "string" ? model.api : providerApi;
      if (!api) {
        return null;
      }
      const contextWindow =
        typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow)
          ? model.contextWindow
          : 128_000;
      const maxTokens =
        typeof model.maxTokens === "number" && Number.isFinite(model.maxTokens)
          ? model.maxTokens
          : 16_384;
      return sanitizeRuntimeModel({
        id,
        name: typeof model.name === "string" && model.name.trim() ? model.name.trim() : id,
        provider: params.provider,
        api: api as ProviderRuntimeModel["api"],
        baseUrl:
          typeof model.baseUrl === "string" && model.baseUrl.trim()
            ? model.baseUrl.trim()
            : providerBaseUrl,
        reasoning: typeof model.reasoning === "boolean" ? model.reasoning : false,
        input: Array.isArray(model.input)
          ? (model.input as ProviderRuntimeModel["input"])
          : ["text"],
        cost:
          model.cost && typeof model.cost === "object"
            ? (model.cost as ProviderRuntimeModel["cost"])
            : providerCost,
        contextWindow,
        contextTokens:
          typeof model.contextTokens === "number" && Number.isFinite(model.contextTokens)
            ? model.contextTokens
            : undefined,
        maxTokens,
        compat: model.compat && typeof model.compat === "object" ? model.compat : undefined,
      } as ProviderRuntimeModel);
    })
    .filter((model): model is ProviderRuntimeModel => Boolean(model));
}

export function createAdmittedModelRegistryFromModels(input: {
  authStorage: AuthStorage;
  models: ProviderRuntimeModel[];
}): ModelRegistry {
  const uniqueModels = new Map<string, ProviderRuntimeModel>();
  for (const model of input.models) {
    const provider = normalizeProviderId(model.provider);
    const id = model.id?.trim();
    if (!provider || !id) {
      continue;
    }
    uniqueModels.set(`${provider}/${id}`, sanitizeRuntimeModel({ ...model, provider }));
  }
  const models = [...uniqueModels.values()];
  const registry = {
    getAll: () => [...models] as unknown as Array<Model<Api>>,
    getAvailable: () =>
      models.filter(
        (model) =>
          (input.authStorage as { hasAuth?: (provider: string) => boolean }).hasAuth?.(
            model.provider,
          ) ?? true,
      ) as unknown as Array<Model<Api>>,
    find: (provider: string, modelId: string) => {
      const normalizedProvider = normalizeProviderId(provider);
      const normalizedModelId = normalizeStaticProviderModelId(normalizedProvider, modelId);
      return (
        uniqueModels.get(`${normalizedProvider}/${normalizedModelId}`) ??
        uniqueModels.get(`${normalizedProvider}/${modelId.trim()}`)
      );
    },
    getError: () => undefined,
    refresh: () => {},
    hasConfiguredAuth: (model: ProviderRuntimeModel) =>
      (input.authStorage as { hasAuth?: (provider: string) => boolean }).hasAuth?.(
        model.provider,
      ) ?? true,
    getApiKeyAndHeaders: async (model: ProviderRuntimeModel) => {
      const apiKey = await (
        input.authStorage as {
          getApiKey?: (
            provider: string,
            options?: { includeFallback?: boolean },
          ) => Promise<string | undefined> | string | undefined;
        }
      ).getApiKey?.(model.provider, { includeFallback: false });
      return {
        ok: true,
        apiKey,
        headers: model.headers && typeof model.headers === "object" ? model.headers : undefined,
      };
    },
    getApiKeyForProvider: async (provider: string) =>
      await (
        input.authStorage as {
          getApiKey?: (
            provider: string,
            options?: { includeFallback?: boolean },
          ) => Promise<string | undefined> | string | undefined;
        }
      ).getApiKey?.(provider, { includeFallback: false }),
    isUsingOAuth: (model: ProviderRuntimeModel) =>
      (input.authStorage as { get?: (provider: string) => { type?: string } | undefined }).get?.(
        model.provider,
      )?.type === "oauth",
  };
  return registry as unknown as ModelRegistry;
}

function buildCatalogConfig(input: {
  config?: OpenClawConfig;
  providers: Record<string, Record<string, unknown>>;
}): OpenClawConfig | undefined {
  if (!input.config && Object.keys(input.providers).length === 0) {
    return undefined;
  }
  return {
    ...input.config,
    models: {
      ...input.config?.models,
      providers: {
        ...input.config?.models?.providers,
        ...input.providers,
      },
    },
  } as OpenClawConfig;
}

export async function createAdmittedModelCatalogRuntime(input: {
  config?: OpenClawConfig;
  agentDir: string;
  authStorage: AuthStorage;
  env?: NodeJS.ProcessEnv;
}): Promise<AdmittedModelCatalogRuntime> {
  const cfg = input.config ?? {};
  const env = createConfigRuntimeEnv(cfg, input.env ?? process.env);
  const plan = await planOpenClawModelsJson({
    cfg,
    sourceConfigForSecrets: input.config,
    agentDir: input.agentDir,
    env,
    existingRaw: "",
    existingParsed: null,
    discoverImplicitProviders: false,
  });
  const parsed =
    plan.action === "write" ? (JSON.parse(plan.contents) as unknown) : { providers: {} };
  const providers = addConfiguredModelsToProviders({
    providers: getProviderModelConfigMap(parsed),
    config: input.config,
  });
  const models = Object.entries(providers).flatMap(([provider, providerConfig]) =>
    providerConfigModels({ provider, providerConfig }),
  );
  const modelRegistry = createAdmittedModelRegistryFromModels({
    authStorage: input.authStorage,
    models,
  });
  const config = buildCatalogConfig({ config: input.config, providers });
  return {
    modelRegistry,
    config,
    providerCount: Object.keys(providers).length,
    modelCount: getAllModels(modelRegistry).length,
    catalogMaterialHash: sha256Json({ providers, modelCount: models.length }),
    modelsJsonAuthority: false,
  };
}

function sanitizeRuntimeModel(model: ProviderRuntimeModel): ProviderRuntimeModel {
  const source = model as ProviderRuntimeModel & {
    contextTokens?: number;
    compat?: unknown;
  };
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    input: Array.isArray(model.input) ? [...model.input] : ["text"],
    cost: model.cost,
    contextWindow: model.contextWindow,
    ...(typeof source.contextTokens === "number" ? { contextTokens: source.contextTokens } : {}),
    maxTokens: model.maxTokens,
    ...(source.compat && typeof source.compat === "object" ? { compat: source.compat } : {}),
  } as ProviderRuntimeModel;
}

export class AdmittedModelCatalogService {
  async resolve(input: AdmittedModelCatalogResolveInput): Promise<AdmittedModelIdentity> {
    const requestedRef = requestedModelRef(input.provider, input.modelId);
    const catalogSnapshotId = input.catalogSnapshotId?.trim() || "runtime-catalog:admitted";
    const admittedCatalog =
      input.modelRegistryAuthority === "admitted_catalog" && input.modelRegistry
        ? {
            modelRegistry: input.modelRegistry,
            config: input.config,
            providerCount: 0,
            modelCount: getAllModels(input.modelRegistry).length,
            catalogMaterialHash: "",
            modelsJsonAuthority: false as const,
          }
        : await createAdmittedModelCatalogRuntime({
            config: input.config,
            agentDir: input.agentDir,
            authStorage: input.authStorage,
          });
    const candidates = providerCandidates(input.provider).flatMap((provider) =>
      modelCandidates(provider, input.modelId).map((modelId) => ({ provider, modelId })),
    );
    for (const { provider, modelId } of candidates) {
      const registryModel = admittedCatalog.modelRegistry.find(
        provider,
        modelId,
      ) as ProviderRuntimeModel | null;
      if (!registryModel) {
        continue;
      }
      const admittedRuntimeModel = sanitizeRuntimeModel(registryModel);
      const normalizedProvider = normalizeProviderId(provider);
      const canonicalRef = `${normalizeProviderId(admittedRuntimeModel.provider || normalizedProvider)}/${admittedRuntimeModel.id || modelId}`;
      return {
        requestedRef,
        canonicalRef,
        provider: admittedRuntimeModel.provider || normalizedProvider,
        transport: typeof admittedRuntimeModel.api === "string" ? admittedRuntimeModel.api : null,
        modelId: admittedRuntimeModel.id || modelId,
        catalogSnapshotId,
        resolutionSource:
          normalizeProviderId(input.provider) !== normalizeProviderId(admittedRuntimeModel.provider)
            ? "provider_family_alias"
            : "admitted_catalog",
        request: resolveRequestParameters({
          requestParams: input.requestParams,
          thinkingLevel: input.thinkingLevel,
          runtimeModel: admittedRuntimeModel,
        }),
        runtimeModel: admittedRuntimeModel,
      };
    }
    if (input.allowDynamicLookup === false) {
      throw new Error(`Unknown admitted model in registry: ${requestedRef}`);
    }
    let lastError: string | null = null;
    for (const { provider, modelId } of candidates) {
      const resolved = await resolveModelAsync(
        provider,
        modelId,
        input.agentDir,
        admittedCatalog.config,
        {
          authStorage: input.authStorage,
          modelRegistry: admittedCatalog.modelRegistry,
          retryTransientProviderRuntimeMiss: true,
        },
      );
      const runtimeModel = resolved.model as ProviderRuntimeModel | undefined;
      if (!runtimeModel) {
        lastError = resolved.error ?? `Unknown admitted model: ${provider}/${modelId}`;
        continue;
      }
      const admittedRuntimeModel = sanitizeRuntimeModel(runtimeModel);
      const normalizedProvider = normalizeProviderId(provider);
      const canonicalRef = `${normalizeProviderId(admittedRuntimeModel.provider || normalizedProvider)}/${admittedRuntimeModel.id || modelId}`;
      return {
        requestedRef,
        canonicalRef,
        provider: admittedRuntimeModel.provider || normalizedProvider,
        transport: typeof admittedRuntimeModel.api === "string" ? admittedRuntimeModel.api : null,
        modelId: admittedRuntimeModel.id || modelId,
        catalogSnapshotId,
        resolutionSource:
          normalizeProviderId(input.provider) !== normalizeProviderId(admittedRuntimeModel.provider)
            ? "provider_family_alias"
            : "provider_dynamic",
        request: resolveRequestParameters({
          requestParams: input.requestParams,
          thinkingLevel: input.thinkingLevel,
          runtimeModel: admittedRuntimeModel,
        }),
        runtimeModel: admittedRuntimeModel,
      };
    }
    throw new Error(lastError ?? `Unknown admitted model: ${requestedRef}`);
  }
}
