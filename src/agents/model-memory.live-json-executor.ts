import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, type OpenClawConfig } from "../config/config.js";
import type {
  ModelApi,
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "../config/types.models.js";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../plugin-sdk/model-memory.js";
import {
  classifyMemoryIngestionFailure,
  type MemoryIngestionFailureClass,
} from "../plugin-sdk/model-memory.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { resolveApiKeyForProvider } from "./model-auth.js";
import {
  createModelMemoryProviderScorecardStore,
  shouldRecordModelMemoryProviderScorecard,
  type ModelMemoryProviderScorecardStore,
} from "./model-memory.provider-scorecard.js";
import { normalizeProviderId, parseModelRef, type ModelRef } from "./model-selection.js";
import {
  buildOpenAICodexChatGptJsonCueText,
  isOpenAICodexChatGptBaseUrl,
  parseOpenAICodexChatGptSseResponse,
  readOpenAICodexChatGptSseText,
  resolveOpenAICodexChatGptResponsesUrl,
} from "./openai-codex-chatgpt-backend.js";
import { mapOpenAIReasoningEffortForModel } from "./openai-reasoning-compat.js";
import {
  normalizeOpenAIReasoningEffort,
  type OpenAIApiReasoningEffort,
} from "./openai-reasoning-effort.js";
import {
  applyOpenAIResponsesPayloadPolicy,
  resolveOpenAIResponsesPayloadPolicy,
} from "./openai-responses-payload-policy.js";
import {
  resolveProviderRequestPolicyConfig,
  sanitizeConfiguredModelProviderRequest,
} from "./provider-request-config.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const RESPONSES_PROVIDER_APIS = new Set<ModelApi>([
  "openai-responses",
  "openai-codex-responses",
  "azure-openai-responses",
]);

type FetchLike = typeof fetch;
type ResponseFormatMode = "json_object" | "json_schema";

type ResolvedAuth = {
  apiKey?: string;
  source: string;
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
  profileId?: string;
};

type AuthTraceFields = {
  authSource?: string;
  authMode?: ResolvedAuth["mode"];
  authProfileId?: string;
  authLane?: string;
};

export type ModelMemoryLiveExecutionFailureStage =
  | "request_time"
  | "provider_response"
  | "provider_parse";

export type ModelMemoryLiveExecutionTrace = {
  contractName: string;
  contractVersion: string;
  requestedModelId: string;
  provider: string;
  providerModel: string;
  providerApi?: ModelApi | "openai-completions";
  requestUrl: string;
  requestBody: Record<string, unknown>;
  responseFormatMode: ResponseFormatMode;
  httpStatus?: number;
  responseOk: boolean;
  responseBodyReceived: boolean;
  responseBodyExcerpt?: string;
  resolvedModelId?: string;
  outputTextExcerpt?: string;
  finishReason?: string;
  promptTokenCount?: number;
  outputTokenCount?: number;
  cachedInputTokenCount?: number;
  promptCacheKey?: string;
  promptCacheRetention?: string;
  prefixHash?: string;
  schemaHash?: string;
  authSource?: string;
  authMode?: ResolvedAuth["mode"];
  authProfileId?: string;
  authLane?: string;
  latencyMs?: number;
  failureStage?: ModelMemoryLiveExecutionFailureStage;
  failureClass?: MemoryIngestionFailureClass;
  errorMessage?: string;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const MODEL_MEMORY_REQUEST_TIMEOUT_ENV = "MODEL_MEMORY_REQUEST_TIMEOUT_MS";
const MODEL_MEMORY_REQUEST_SEED_ENV = "MODEL_MEMORY_REQUEST_SEED";
const MODEL_MEMORY_REQUEST_MAX_OUTPUT_TOKENS_ENV = "MODEL_MEMORY_REQUEST_MAX_OUTPUT_TOKENS";

export type ModelMemoryLiveJsonExecutorOptions = {
  config?: OpenClawConfig;
  agentDir?: string;
  defaultProvider?: string;
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
  requestSeed?: number;
  resolveAuth?: (provider: string, config: OpenClawConfig | undefined) => Promise<ResolvedAuth>;
  onTrace?: (trace: ModelMemoryLiveExecutionTrace) => void;
  scorecardStore?: ModelMemoryProviderScorecardStore | false;
};

export type ModelMemoryProviderPreflightResult = {
  ok: boolean;
  requestedModelId: string;
  provider: string;
  providerModel: string;
  providerApi?: ModelApi | "openai-completions";
  requestUrl: string;
  responseFormatMode: ResponseFormatMode;
  contractName?: string;
  contractVersion?: string;
  schemaName?: string;
  strictSchema?: boolean;
  authSource?: string;
  authMode?: ResolvedAuth["mode"];
  authProfileId?: string;
  authLane?: string;
  httpStatus?: number;
  resolvedModelId?: string;
  failureStage?: ModelMemoryLiveExecutionFailureStage;
  failureClass?: MemoryIngestionFailureClass;
  errorMessage?: string;
};

export type ModelMemoryProviderModelListResult = {
  ok: boolean;
  provider: string;
  requestUrl: string;
  authSource?: string;
  authMode?: ResolvedAuth["mode"];
  authProfileId?: string;
  authLane?: string;
  httpStatus?: number;
  modelIds: string[];
  models?: Array<{
    id: string;
    supportedParameters: string[];
    contextLength?: number;
    maxCompletionTokens?: number;
  }>;
  failureClass?: MemoryIngestionFailureClass;
  errorMessage?: string;
};

type OpenAICompatibleResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type OpenAIResponsesApiResponse = {
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type ResolvedProviderRoute = {
  provider: string;
  providerModel: string;
  providerApi: ModelApi | "openai-completions";
  baseUrl: string;
  requestUrl: string;
  usesResponsesApi: boolean;
  usesCodexChatGptBackend: boolean;
};

type ModelsJsonProviderCache = {
  path: string;
  mtimeMs: number;
  providers: Record<string, ModelProviderConfig> | undefined;
};

let modelsJsonProviderCache: ModelsJsonProviderCache | null = null;

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildAuthTraceFields(auth: ResolvedAuth): AuthTraceFields {
  const authSource = readTrimmedString(auth.source);
  const authProfileId = readTrimmedString(auth.profileId);
  const authLane = [authSource, auth.mode, authProfileId].filter(Boolean).join(":");
  return {
    authSource,
    authMode: auth.mode,
    authProfileId,
    authLane: authLane || undefined,
  };
}

function resolveRequestTimeoutMs(explicitTimeoutMs?: number): number {
  if (explicitTimeoutMs !== undefined) {
    return explicitTimeoutMs;
  }

  const envValue = readTrimmedString(process.env[MODEL_MEMORY_REQUEST_TIMEOUT_ENV]);
  if (!envValue) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function resolveRequestSeed(explicitRequestSeed?: number): number | undefined {
  if (explicitRequestSeed !== undefined) {
    return Number.isInteger(explicitRequestSeed) ? explicitRequestSeed : undefined;
  }

  const envValue = readTrimmedString(process.env[MODEL_MEMORY_REQUEST_SEED_ENV]);
  if (!envValue) {
    return undefined;
  }

  const parsed = Number.parseInt(envValue, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function resolveMaxOutputTokens(explicitMaxOutputTokens?: number): number {
  if (
    explicitMaxOutputTokens !== undefined &&
    Number.isInteger(explicitMaxOutputTokens) &&
    explicitMaxOutputTokens > 0
  ) {
    return explicitMaxOutputTokens;
  }

  const envValue = readTrimmedString(process.env[MODEL_MEMORY_REQUEST_MAX_OUTPUT_TOKENS_ENV]);
  if (!envValue) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }

  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OUTPUT_TOKENS;
}

function resolveProviderConfigEntry(
  config: OpenClawConfig | undefined,
  provider: string,
): ModelProviderConfig | undefined {
  const providers = config?.models?.providers ?? {};
  const direct = providers[provider];
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(provider);
  return (
    providers[normalized] ??
    Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1]
  );
}

function loadAgentModelsJsonProviders(
  agentDir?: string,
): Record<string, ModelProviderConfig> | undefined {
  const resolvedAgentDir = readTrimmedString(agentDir) ?? resolveOpenClawAgentDir();
  const modelsPath = path.join(resolvedAgentDir, "models.json");
  try {
    const stat = fs.statSync(modelsPath);
    if (
      !modelsJsonProviderCache ||
      modelsJsonProviderCache.path !== modelsPath ||
      modelsJsonProviderCache.mtimeMs !== stat.mtimeMs
    ) {
      const parsed = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as {
        providers?: Record<string, ModelProviderConfig>;
      };
      modelsJsonProviderCache = {
        path: modelsPath,
        mtimeMs: stat.mtimeMs,
        providers: parsed.providers,
      };
    }
    return modelsJsonProviderCache.providers;
  } catch {
    modelsJsonProviderCache = {
      path: modelsPath,
      mtimeMs: -1,
      providers: undefined,
    };
    return undefined;
  }
}

function resolveModelsJsonProviderConfigEntry(
  provider: string,
  agentDir?: string,
): ModelProviderConfig | undefined {
  const providers = loadAgentModelsJsonProviders(agentDir) ?? {};
  const direct = providers[provider];
  if (direct) {
    return direct;
  }
  const normalized = normalizeProviderId(provider);
  return (
    providers[normalized] ??
    Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1]
  );
}

function resolveRuntimeProviderConfigEntry(
  config: OpenClawConfig | undefined,
  provider: string,
  agentDir?: string,
): ModelProviderConfig | undefined {
  const configured = resolveProviderConfigEntry(config, provider);
  const modelsJsonProvider = resolveModelsJsonProviderConfigEntry(provider, agentDir);
  if (!modelsJsonProvider) {
    return configured;
  }
  if (!configured) {
    return modelsJsonProvider;
  }
  return {
    ...configured,
    ...modelsJsonProvider,
    auth: configured.auth ?? modelsJsonProvider.auth,
    apiKey: configured.apiKey ?? modelsJsonProvider.apiKey,
    headers: configured.headers ?? modelsJsonProvider.headers,
    models:
      Array.isArray(modelsJsonProvider.models) && modelsJsonProvider.models.length > 0
        ? modelsJsonProvider.models
        : configured.models,
  };
}

function buildProviderScopedConfig(
  config: OpenClawConfig | undefined,
  provider: string,
  agentDir?: string,
): OpenClawConfig | undefined {
  const providerConfig = resolveRuntimeProviderConfigEntry(config, provider, agentDir);
  if (!providerConfig) {
    return config;
  }
  return {
    ...config,
    models: {
      ...config?.models,
      providers: {
        ...config?.models?.providers,
        [provider]: providerConfig,
      },
    },
  } as OpenClawConfig;
}

function resolveProviderModelConfig(
  providerConfig: ModelProviderConfig | undefined,
  providerModel: string,
): ModelDefinitionConfig | undefined {
  if (!providerConfig?.models?.length) {
    return undefined;
  }
  const normalizedModel = providerModel.trim().toLowerCase();
  return providerConfig.models.find((entry) => {
    const modelId = readTrimmedString(entry.id);
    return modelId === providerModel || modelId?.trim().toLowerCase() === normalizedModel;
  });
}

function resolveProviderBaseUrl(
  config: OpenClawConfig | undefined,
  provider: string,
  providerApi?: ModelApi | "openai-completions",
): string {
  const configured = resolveProviderConfigEntry(config, provider)?.baseUrl;
  const override = readTrimmedString(configured);
  if (override) {
    return override.replace(/\/+$/, "");
  }
  if (provider === "openrouter") {
    return OPENROUTER_BASE_URL;
  }
  if (
    provider === "openai" ||
    provider === "openai-codex" ||
    providerApi === "openai-responses" ||
    providerApi === "openai-codex-responses" ||
    providerApi === "azure-openai-responses"
  ) {
    return OPENAI_BASE_URL;
  }
  throw new Error(`model-memory live executor does not support provider "${provider}"`);
}

function resolveProviderApi(
  config: OpenClawConfig | undefined,
  model: ModelRef,
  agentDir?: string,
): ModelApi | "openai-completions" {
  const providerConfig = resolveRuntimeProviderConfigEntry(config, model.provider, agentDir);
  const modelConfig = resolveProviderModelConfig(providerConfig, model.model);
  return modelConfig?.api ?? providerConfig?.api ?? "openai-completions";
}

function resolveProviderRoute(
  config: OpenClawConfig | undefined,
  model: ModelRef,
  agentDir?: string,
): ResolvedProviderRoute {
  const scopedConfig = buildProviderScopedConfig(config, model.provider, agentDir);
  const providerApi = resolveProviderApi(scopedConfig, model, agentDir);
  const baseUrl = resolveProviderBaseUrl(scopedConfig, model.provider, providerApi);
  const usesResponsesApi = RESPONSES_PROVIDER_APIS.has(providerApi);
  const usesCodexChatGptBackend =
    providerApi === "openai-codex-responses" && isOpenAICodexChatGptBaseUrl(baseUrl);
  return {
    provider: model.provider,
    providerModel: model.model,
    providerApi,
    baseUrl,
    requestUrl: usesCodexChatGptBackend
      ? resolveOpenAICodexChatGptResponsesUrl(baseUrl)
      : `${baseUrl}/${usesResponsesApi ? "responses" : "chat/completions"}`,
    usesResponsesApi,
    usesCodexChatGptBackend,
  };
}

function resolveResponseFormatMode(request: JsonModelExecutionRequest): ResponseFormatMode {
  return request.responseOptions?.transport?.type === "json_schema" ? "json_schema" : "json_object";
}

function buildResponseFormat(request: JsonModelExecutionRequest): Record<string, unknown> {
  const transport = request.responseOptions?.transport;
  if (!transport || transport.type === "json_object") {
    return { type: "json_object" };
  }

  return {
    type: "json_schema",
    json_schema: {
      name: transport.name,
      strict: transport.strict ?? true,
      schema: transport.schema,
    },
  };
}

function buildResponsesTextFormat(request: JsonModelExecutionRequest): Record<string, unknown> {
  const transport = request.responseOptions?.transport;
  if (!transport || transport.type === "json_object") {
    return { type: "json_object" };
  }

  return {
    type: "json_schema",
    name: transport.name,
    strict: transport.strict ?? true,
    schema: transport.schema,
  };
}

function buildProviderOptions(
  request: JsonModelExecutionRequest,
  provider: string,
): Record<string, unknown> | undefined {
  if (provider !== "openrouter") {
    return undefined;
  }
  if (request.responseOptions?.provider?.requireParameters !== true) {
    return undefined;
  }
  return { require_parameters: true };
}

function buildTemperatureOptions(
  request: JsonModelExecutionRequest,
  provider: string,
): Record<string, unknown> {
  if (provider === "openrouter" && request.responseOptions?.provider?.requireParameters === true) {
    return {};
  }
  return { temperature: 0 };
}

function buildPromptCacheOptions(
  request: JsonModelExecutionRequest,
  provider: string,
): Record<string, unknown> {
  if (provider === "openrouter" && request.responseOptions?.provider?.requireParameters === true) {
    return {};
  }
  const promptCache = request.responseOptions?.promptCache;
  return {
    ...(promptCache?.key ? { prompt_cache_key: promptCache.key } : {}),
    ...(promptCache?.retention ? { prompt_cache_retention: promptCache.retention } : {}),
  };
}

function buildModelPerformanceOptions(
  request: JsonModelExecutionRequest,
  provider: string,
): Record<string, unknown> {
  if (provider === "openrouter" && request.responseOptions?.provider?.requireParameters === true) {
    return request.responseOptions?.reasoningEffort
      ? {
          reasoning: {
            effort: request.responseOptions.reasoningEffort,
            exclude: true,
          },
        }
      : {};
  }
  return {
    ...(request.responseOptions?.reasoningEffort
      ? { reasoning_effort: request.responseOptions.reasoningEffort }
      : {}),
    ...(request.responseOptions?.verbosity ? { verbosity: request.responseOptions.verbosity } : {}),
    ...(request.responseOptions?.serviceTier
      ? { service_tier: request.responseOptions.serviceTier }
      : {}),
  };
}

function buildResponsesReasoningOptions(params: {
  provider: string;
  providerModel: string;
  reasoningEffort?: string;
}): Record<string, unknown> {
  const requested = readTrimmedString(params.reasoningEffort);
  if (!requested) {
    return {};
  }
  const mapped =
    mapOpenAIReasoningEffortForModel({
      model: {
        provider: params.provider,
        id: params.providerModel,
      },
      effort: requested,
    }) ?? requested;
  const normalized = normalizeOpenAIReasoningEffort(mapped) as OpenAIApiReasoningEffort;
  return {
    reasoning:
      normalized === "none"
        ? { effort: "none" }
        : {
            effort: normalized,
            summary: "auto",
          },
  };
}

function buildResponsesPromptCacheOptions(params: {
  request: JsonModelExecutionRequest;
  baseUrl: string;
}): Record<string, unknown> {
  const promptCache = params.request.responseOptions?.promptCache;
  if (!promptCache?.key) {
    return {};
  }
  return {
    prompt_cache_key: promptCache.key,
    ...(promptCache.retention === "long" && params.baseUrl.includes("api.openai.com")
      ? { prompt_cache_retention: "24h" }
      : {}),
  };
}

function buildResponsesRequestBody(params: {
  request: JsonModelExecutionRequest;
  route: ResolvedProviderRoute;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  includeSeed?: boolean;
}): Record<string, unknown> {
  if (params.route.usesCodexChatGptBackend) {
    return buildCodexChatGptResponsesRequestBody(params);
  }
  const text: Record<string, unknown> = {
    format: buildResponsesTextFormat(params.request),
    ...(params.request.responseOptions?.verbosity
      ? { verbosity: params.request.responseOptions.verbosity }
      : {}),
  };
  const requestBody: Record<string, unknown> = {
    model: params.route.providerModel,
    instructions: params.systemPrompt,
    input: params.userPrompt,
    text,
    max_output_tokens: params.maxOutputTokens,
    ...buildResponsesPromptCacheOptions({
      request: params.request,
      baseUrl: params.route.baseUrl,
    }),
    ...buildResponsesReasoningOptions({
      provider: params.route.provider,
      providerModel: params.route.providerModel,
      reasoningEffort: params.request.responseOptions?.reasoningEffort,
    }),
  };
  const payloadPolicy = resolveOpenAIResponsesPayloadPolicy(
    {
      api: params.route.providerApi === "openai-completions" ? undefined : params.route.providerApi,
      baseUrl: params.route.baseUrl,
      provider: params.route.provider,
    },
    {
      enablePromptCacheStripping: true,
      storeMode: "disable",
    },
  );
  if (params.request.responseOptions?.serviceTier && payloadPolicy.allowsServiceTier) {
    requestBody.service_tier = params.request.responseOptions.serviceTier;
  }
  applyOpenAIResponsesPayloadPolicy(requestBody, payloadPolicy);
  return requestBody;
}

function buildCodexChatGptResponsesRequestBody(params: {
  request: JsonModelExecutionRequest;
  route: ResolvedProviderRoute;
  systemPrompt: string;
  userPrompt: string;
}): Record<string, unknown> {
  return {
    model: params.route.providerModel,
    instructions: params.systemPrompt,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildCodexChatGptInputText(params.request, params.userPrompt),
          },
        ],
      },
    ],
    text: {
      format: buildResponsesTextFormat(params.request),
    },
    store: false,
    stream: true,
  };
}

function buildCodexChatGptInputText(
  request: JsonModelExecutionRequest,
  userPrompt: string,
): string {
  if (resolveResponseFormatMode(request) !== "json_object") {
    return userPrompt;
  }
  return buildOpenAICodexChatGptJsonCueText(userPrompt, "json_object");
}

function readResolvedHeaderMap(
  value: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  const next = Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [key, readTrimmedString(headerValue)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
  return Object.keys(next).length > 0 ? next : undefined;
}

function buildRequestHeaders(params: {
  auth: ResolvedAuth;
  route: ResolvedProviderRoute;
  config: OpenClawConfig | undefined;
  agentDir?: string;
}): Record<string, string> {
  const scopedConfig = buildProviderScopedConfig(
    params.config,
    params.route.provider,
    params.agentDir,
  );
  const providerConfig = resolveRuntimeProviderConfigEntry(
    scopedConfig,
    params.route.provider,
    params.agentDir,
  );
  const modelConfig = resolveProviderModelConfig(providerConfig, params.route.providerModel);
  const requestConfig = resolveProviderRequestPolicyConfig({
    provider: params.route.provider,
    api: params.route.providerApi === "openai-completions" ? undefined : params.route.providerApi,
    baseUrl: params.route.baseUrl,
    capability: "llm",
    transport: "http",
    providerHeaders: readResolvedHeaderMap(providerConfig?.headers),
    modelHeaders: readResolvedHeaderMap(modelConfig?.headers),
    callerHeaders: {
      Authorization: `Bearer ${params.auth.apiKey}`,
      "Content-Type": "application/json",
      ...(params.route.provider === "openrouter"
        ? {
            "HTTP-Referer": "https://openclaw.ai",
            "X-Title": "OpenClaw model-memory",
          }
        : {}),
    },
    precedence: "defaults-win",
    request: sanitizeConfiguredModelProviderRequest(providerConfig?.request),
    allowPrivateNetwork: providerConfig?.request?.allowPrivateNetwork === true,
  });
  return (
    requestConfig.headers ?? {
      Authorization: `Bearer ${params.auth.apiKey}`,
      "Content-Type": "application/json",
    }
  );
}

function resolveRequestModel(modelId: string, defaultProvider: string): ModelRef {
  const parsed = parseModelRef(modelId, defaultProvider);
  if (!parsed) {
    throw new Error(`invalid model ref for model-memory live execution: ${modelId}`);
  }
  return parsed;
}

function extractOutputText(response: OpenAICompatibleResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((entry) => entry.type === "text" && typeof entry.text === "string")
      .map((entry) => entry.text?.trim() ?? "")
      .filter((entry) => entry.length > 0)
      .join("\n");
    if (text.length > 0) {
      return text;
    }
  }
  throw new Error(response.error?.message ?? "missing text content in model response");
}

function extractResponsesOutputText(response: OpenAIResponsesApiResponse): string {
  const direct = readTrimmedString(response.output_text);
  if (direct) {
    return direct;
  }
  if (Array.isArray(response.output)) {
    const text = response.output
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter((part) => part.length > 0)
      .join("\n");
    if (text.length > 0) {
      return text;
    }
  }
  throw new Error(response.error?.message ?? "missing text content in model response");
}

function buildExcerpt(value: string | undefined, maxLength = 400): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildSchemaHash(request: JsonModelExecutionRequest): string | undefined {
  const transport = request.responseOptions?.transport;
  if (transport?.type !== "json_schema") {
    return undefined;
  }
  return sha256(JSON.stringify(transport.schema));
}

function strictObjectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function buildModelMemoryStrictPreflightRequests(
  modelId: string,
): JsonModelExecutionRequest[] {
  return [
    {
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "mmv2-capture-routing-v1",
        modelId,
      },
      systemPrompt: "preflight-only; not sent",
      userPrompt: "preflight-only; not sent",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "capture_routing_batch",
          strict: true,
          schema: strictObjectSchema(
            {
              schema_version: { type: "string" },
              routing_decisions: { type: "array", items: strictObjectSchema({}, []) },
            },
            ["schema_version", "routing_decisions"],
          ),
        },
        provider: { requireParameters: true },
        maxOutputTokens: 128,
      },
    },
    {
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "mmv2-atomic-extraction-v1",
        modelId,
      },
      systemPrompt: "preflight-only; not sent",
      userPrompt: "preflight-only; not sent",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "atomic_extraction_batch",
          strict: true,
          schema: strictObjectSchema(
            {
              schema_version: { type: "string" },
              candidates: { type: "array", items: strictObjectSchema({}, []) },
            },
            ["schema_version", "candidates"],
          ),
        },
        provider: { requireParameters: true },
        maxOutputTokens: 128,
      },
    },
    {
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "mmv2-canonicalization-v1",
        modelId,
      },
      systemPrompt: "preflight-only; not sent",
      userPrompt: "preflight-only; not sent",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "canonical_candidate_batch",
          strict: true,
          schema: strictObjectSchema(
            {
              schema_version: { type: "string" },
              canonical_candidates: { type: "array", items: strictObjectSchema({}, []) },
            },
            ["schema_version", "canonical_candidates"],
          ),
        },
        provider: { requireParameters: true },
        maxOutputTokens: 128,
      },
    },
    {
      contract: {
        contractName: "retrieval_request_interpretation",
        contractVersion: "v2",
        modelId,
      },
      systemPrompt: "preflight-only; not sent",
      userPrompt: "preflight-only; not sent",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "retrieval_request_interpretation",
          strict: true,
          schema: strictObjectSchema(
            {
              intent: { type: "string" },
              memory_pack_types: { type: "array", items: { type: "string" } },
            },
            ["intent", "memory_pack_types"],
          ),
        },
        provider: { requireParameters: true },
        maxOutputTokens: 128,
      },
    },
  ];
}

function buildTraceContentSummary(content: unknown): {
  content_sha256: string | null;
  content_chars: number;
} {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  return {
    content_sha256: text.length > 0 ? sha256(text) : null,
    content_chars: text.length,
  };
}

function buildTraceRequestItems(
  value: unknown,
  defaultRole = "user",
): Array<{
  role: string;
  content_sha256: string | null;
  content_chars: number;
}> {
  if (typeof value === "string") {
    return [{ role: defaultRole, ...buildTraceContentSummary(value) }];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { role: "unknown", content_sha256: null, content_chars: 0 };
    }
    const record = item as { role?: unknown; content?: unknown };
    return {
      role: typeof record.role === "string" ? record.role : defaultRole,
      ...buildTraceContentSummary(record.content ?? item),
    };
  });
}

function buildTraceRequestBody(requestBody: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...requestBody };
  if ("messages" in redacted) {
    redacted.messages = buildTraceRequestItems(redacted.messages, "user");
  }
  if ("instructions" in redacted) {
    redacted.instructions = buildTraceContentSummary(redacted.instructions);
  }
  if ("input" in redacted) {
    redacted.input = buildTraceRequestItems(redacted.input, "user");
  }
  return redacted;
}

function buildUsageTrace(
  payload: OpenAICompatibleResponse | OpenAIResponsesApiResponse,
  usesResponsesApi: boolean,
): {
  finishReason?: string;
  promptTokenCount?: number;
  outputTokenCount?: number;
  cachedInputTokenCount?: number;
} {
  if (usesResponsesApi) {
    const responsePayload = payload as OpenAIResponsesApiResponse;
    return {
      finishReason: undefined,
      promptTokenCount:
        typeof responsePayload.usage?.input_tokens === "number"
          ? responsePayload.usage.input_tokens
          : undefined,
      outputTokenCount:
        typeof responsePayload.usage?.output_tokens === "number"
          ? responsePayload.usage.output_tokens
          : undefined,
      cachedInputTokenCount:
        typeof responsePayload.usage?.input_tokens_details?.cached_tokens === "number"
          ? responsePayload.usage.input_tokens_details.cached_tokens
          : undefined,
    };
  }
  return {
    finishReason: readTrimmedString(
      (payload as OpenAICompatibleResponse).choices?.[0]?.finish_reason,
    ),
    promptTokenCount:
      typeof (payload as OpenAICompatibleResponse).usage?.prompt_tokens === "number"
        ? (payload as OpenAICompatibleResponse).usage?.prompt_tokens
        : undefined,
    outputTokenCount:
      typeof (payload as OpenAICompatibleResponse).usage?.completion_tokens === "number"
        ? (payload as OpenAICompatibleResponse).usage?.completion_tokens
        : undefined,
    cachedInputTokenCount:
      typeof (payload as OpenAICompatibleResponse).usage?.prompt_tokens_details?.cached_tokens ===
      "number"
        ? (payload as OpenAICompatibleResponse).usage?.prompt_tokens_details?.cached_tokens
        : undefined,
  };
}

function requestBodyUsesStrictSchema(requestBody: Record<string, unknown>): boolean {
  const responseFormat =
    typeof requestBody.response_format === "object" && requestBody.response_format !== null
      ? requestBody.response_format
      : typeof requestBody.text === "object" &&
          requestBody.text !== null &&
          typeof (requestBody.text as { format?: unknown }).format === "object" &&
          (requestBody.text as { format?: unknown }).format !== null
        ? (requestBody.text as { format: unknown }).format
        : undefined;
  return Boolean(
    responseFormat &&
    typeof responseFormat === "object" &&
    !Array.isArray(responseFormat) &&
    (responseFormat as { type?: unknown }).type === "json_schema",
  );
}

function readRequestBodySchemaName(requestBody: Record<string, unknown>): string | undefined {
  if (typeof requestBody.response_format === "object" && requestBody.response_format !== null) {
    return (requestBody.response_format as { json_schema?: { name?: string } }).json_schema?.name;
  }
  if (
    typeof requestBody.text === "object" &&
    requestBody.text !== null &&
    typeof (requestBody.text as { format?: unknown }).format === "object" &&
    (requestBody.text as { format?: unknown }).format !== null
  ) {
    return (requestBody.text as { format?: { name?: string } }).format?.name;
  }
  return undefined;
}

function readRequestBodyStrictSchema(requestBody: Record<string, unknown>): boolean {
  if (typeof requestBody.response_format === "object" && requestBody.response_format !== null) {
    return Boolean(
      (requestBody.response_format as { json_schema?: { strict?: boolean } }).json_schema?.strict,
    );
  }
  if (
    typeof requestBody.text === "object" &&
    requestBody.text !== null &&
    typeof (requestBody.text as { format?: unknown }).format === "object" &&
    (requestBody.text as { format?: unknown }).format !== null
  ) {
    return Boolean((requestBody.text as { format?: { strict?: boolean } }).format?.strict);
  }
  return false;
}

function parseErrorText(rawText: string): string {
  try {
    const json = JSON.parse(rawText) as {
      detail?: string;
      error?: {
        message?: string;
        metadata?: {
          raw?: string;
        };
      };
    };
    const directMessage = json.error?.message?.trim();
    const nestedRaw = json.error?.metadata?.raw;
    if (nestedRaw) {
      try {
        const nested = JSON.parse(nestedRaw) as { error?: { message?: string } };
        const nestedMessage = nested.error?.message?.trim();
        if (nestedMessage) {
          return nestedMessage;
        }
      } catch {
        // Keep the outer provider message when nested metadata.raw is not JSON.
      }
    }
    const detail = typeof json.detail === "string" ? json.detail.trim() : undefined;
    return directMessage ?? detail ?? JSON.stringify(json);
  } catch {
    return rawText;
  }
}

function parseProviderSuccessPayload(
  rawText: string,
  route: ResolvedProviderRoute,
): OpenAICompatibleResponse | OpenAIResponsesApiResponse {
  if (route.usesCodexChatGptBackend) {
    return parseOpenAICodexChatGptSseResponse(rawText);
  }
  return JSON.parse(rawText) as OpenAICompatibleResponse | OpenAIResponsesApiResponse;
}

async function readProviderResponseText(
  response: Response,
  route: ResolvedProviderRoute,
): Promise<string> {
  if (!route.usesCodexChatGptBackend || !response.body) {
    return await response.text();
  }
  return await readOpenAICodexChatGptSseText(response);
}

export class ModelMemoryLiveExecutionError extends Error {
  constructor(
    message: string,
    readonly trace: ModelMemoryLiveExecutionTrace,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ModelMemoryLiveExecutionError";
  }
}

export class OpenAICompatibleLiveJsonExecutor implements JsonModelExecutor {
  private readonly config: OpenClawConfig | undefined;
  private readonly agentDir: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultProvider: string;
  private readonly requestTimeoutMs: number;
  private readonly requestSeed?: number;
  private readonly resolveAuthImpl: NonNullable<ModelMemoryLiveJsonExecutorOptions["resolveAuth"]>;
  private readonly onTrace?: (trace: ModelMemoryLiveExecutionTrace) => void;
  private readonly scorecardStore?: ModelMemoryProviderScorecardStore;

  constructor(options: ModelMemoryLiveJsonExecutorOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.agentDir = readTrimmedString(options.agentDir) ?? resolveOpenClawAgentDir();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultProvider = options.defaultProvider ?? "openrouter";
    this.requestTimeoutMs = resolveRequestTimeoutMs(options.requestTimeoutMs);
    this.requestSeed = resolveRequestSeed(options.requestSeed);
    this.onTrace = options.onTrace;
    this.scorecardStore =
      options.scorecardStore === false
        ? undefined
        : (options.scorecardStore ??
          (shouldRecordModelMemoryProviderScorecard()
            ? createModelMemoryProviderScorecardStore()
            : undefined));
    this.resolveAuthImpl =
      options.resolveAuth ??
      ((provider, config) =>
        resolveApiKeyForProvider({
          provider,
          cfg: config,
          agentDir: this.agentDir,
        }));
  }

  getRequestTimeoutMs(): number {
    return this.requestTimeoutMs;
  }

  getRequestSeed(): number | undefined {
    return this.requestSeed;
  }

  private classifyProviderFailure(input: {
    strictSchema?: boolean;
    httpStatus?: number;
    failureStage?: ModelMemoryLiveExecutionFailureStage;
    errorMessage?: string;
  }): MemoryIngestionFailureClass | undefined {
    if (!input.failureStage && !input.httpStatus && !input.errorMessage) {
      return undefined;
    }
    if (
      input.httpStatus === 401 ||
      input.httpStatus === 403 ||
      /unauthorized|forbidden|invalid api key|incorrect api key|oauth|auth mismatch|credential/iu.test(
        input.errorMessage ?? "",
      )
    ) {
      return "provider_connection";
    }
    if (
      input.httpStatus === 402 ||
      (input.httpStatus === 429 &&
        /quota|billing|credit|insufficient_quota|payment/iu.test(input.errorMessage ?? ""))
    ) {
      return "provider_credit";
    }
    const failureClass = classifyMemoryIngestionFailure(input.errorMessage ?? "");
    if (
      input.strictSchema === true &&
      (input.httpStatus === 400 ||
        input.httpStatus === 404 ||
        input.httpStatus === 422 ||
        /schema|response_format|require_parameters|structured output|no endpoints|model id/iu.test(
          input.errorMessage ?? "",
        ))
    ) {
      return "provider_json_boundary";
    }
    if (failureClass !== "other") {
      return failureClass;
    }
    if (input.failureStage === "provider_parse") {
      return "provider_json_boundary";
    }
    if (input.failureStage === "provider_response") {
      return "provider_empty_response";
    }
    return failureClass;
  }

  private async recordScorecardEvent(input: {
    status: "success" | "failed";
    requestedModelId: string;
    provider: string;
    providerModel: string;
    resolvedModelId?: string;
    contractName?: string;
    contractVersion?: string;
    schemaName?: string;
    schemaHash?: string;
    strictSchema?: boolean;
    httpStatus?: number;
    failureClass?: MemoryIngestionFailureClass;
    failureStage?: string;
    latencyMs?: number;
    promptTokenCount?: number;
    outputTokenCount?: number;
    cachedInputTokenCount?: number;
    promptCacheKey?: string;
  }): Promise<void> {
    if (!this.scorecardStore) {
      return;
    }
    await this.scorecardStore
      .record({
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        status: input.status,
        requestedModelId: input.requestedModelId,
        provider: input.provider,
        providerModel: input.providerModel,
        resolvedModelId: input.resolvedModelId,
        contractName: input.contractName,
        contractVersion: input.contractVersion,
        schemaName: input.schemaName,
        schemaHash: input.schemaHash,
        strictSchema: input.strictSchema,
        httpStatus: input.httpStatus,
        failureClass: input.failureClass,
        failureStage: input.failureStage,
        latencyMs: input.latencyMs,
        promptTokenCount: input.promptTokenCount,
        outputTokenCount: input.outputTokenCount,
        cachedInputTokenCount: input.cachedInputTokenCount,
        promptCacheKey: input.promptCacheKey,
        cacheHit:
          input.promptCacheKey !== undefined && (input.cachedInputTokenCount ?? 0) > 0
            ? true
            : undefined,
        rawContentPersisted: false,
        containsPromptText: false,
        containsTranscript: false,
        containsRawToolLog: false,
      })
      .catch(() => undefined);
  }

  private async finishPreflightResult(
    result: ModelMemoryProviderPreflightResult,
    latencyMs: number,
    schemaHash?: string,
  ): Promise<ModelMemoryProviderPreflightResult> {
    const strictSchema = result.strictSchema === true;
    const failureClass = !result.ok
      ? this.classifyProviderFailure({
          strictSchema,
          httpStatus: result.httpStatus,
          failureStage: result.failureStage,
          errorMessage: result.errorMessage,
        })
      : undefined;
    const finished = failureClass ? { ...result, failureClass } : result;
    await this.recordScorecardEvent({
      status: finished.ok ? "success" : "failed",
      requestedModelId: finished.requestedModelId,
      provider: finished.provider,
      providerModel: finished.providerModel,
      resolvedModelId: finished.resolvedModelId,
      contractName: finished.contractName,
      contractVersion: finished.contractVersion,
      schemaName: finished.schemaName,
      schemaHash,
      strictSchema: finished.strictSchema,
      httpStatus: finished.httpStatus,
      failureClass: finished.failureClass,
      failureStage: finished.failureStage,
      latencyMs,
    });
    return finished;
  }

  private async recordTraceScorecard(trace: ModelMemoryLiveExecutionTrace): Promise<void> {
    const failureClass =
      trace.failureClass ??
      (trace.failureStage || trace.httpStatus
        ? this.classifyProviderFailure({
            strictSchema: requestBodyUsesStrictSchema(trace.requestBody),
            httpStatus: trace.httpStatus,
            failureStage: trace.failureStage,
            errorMessage: trace.errorMessage,
          })
        : undefined);
    await this.recordScorecardEvent({
      status: trace.failureStage ? "failed" : "success",
      requestedModelId: trace.requestedModelId,
      provider: trace.provider,
      providerModel: trace.providerModel,
      resolvedModelId: trace.resolvedModelId,
      contractName: trace.contractName,
      contractVersion: trace.contractVersion,
      schemaName: readRequestBodySchemaName(trace.requestBody),
      schemaHash: trace.schemaHash,
      strictSchema: readRequestBodyStrictSchema(trace.requestBody),
      httpStatus: trace.httpStatus,
      failureClass,
      failureStage: trace.failureStage,
      latencyMs: trace.latencyMs,
      promptTokenCount: trace.promptTokenCount,
      outputTokenCount: trace.outputTokenCount,
      cachedInputTokenCount: trace.cachedInputTokenCount,
      promptCacheKey: trace.promptCacheKey,
    });
  }

  async preflightModel(modelId: string): Promise<ModelMemoryProviderPreflightResult> {
    const startedAt = Date.now();
    const finish = (result: ModelMemoryProviderPreflightResult) =>
      this.finishPreflightResult(result, Date.now() - startedAt);
    const model = resolveRequestModel(modelId, this.defaultProvider);
    const scopedConfig = buildProviderScopedConfig(this.config, model.provider, this.agentDir);
    const route = resolveProviderRoute(scopedConfig, model, this.agentDir);
    const auth = await this.resolveAuthImpl(model.provider, scopedConfig);
    const requestUrl = route.requestUrl;
    const responseFormatMode: ResponseFormatMode = "json_object";

    if (!auth.apiKey) {
      return finish({
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        failureStage: "request_time",
        errorMessage: `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      });
    }

    const requestBody = route.usesResponsesApi
      ? buildResponsesRequestBody({
          request: {
            contract: {
              contractName: "preflight_model",
              contractVersion: "v1",
              modelId,
            },
            systemPrompt: "Return only compact JSON.",
            userPrompt: '{"ok":true}',
            responseFormat: "json",
          },
          route,
          systemPrompt: "Return only compact JSON.",
          userPrompt: '{"ok":true}',
          maxOutputTokens: 16,
        })
      : ({
          model: model.model,
          temperature: 0,
          max_tokens: 16,
          messages: [
            {
              role: "system",
              content: "Return only compact JSON.",
            },
            {
              role: "user",
              content: '{"ok":true}',
            },
          ],
          response_format: { type: "json_object" },
        } satisfies Record<string, unknown>);

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: buildRequestHeaders({
          auth,
          route,
          config: scopedConfig,
          agentDir: this.agentDir,
        }),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return finish({
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    const rawResponseText = await response.text();
    if (!response.ok) {
      return finish({
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        failureStage: "request_time",
        errorMessage: buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error",
      });
    }

    try {
      const payload = parseProviderSuccessPayload(rawResponseText, route);
      if (route.usesResponsesApi) {
        extractResponsesOutputText(payload as OpenAIResponsesApiResponse);
      } else {
        extractOutputText(payload as OpenAICompatibleResponse);
      }
      return finish({
        ok: true,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      });
    } catch (error) {
      return finish({
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async listProviderModels(provider: string): Promise<ModelMemoryProviderModelListResult> {
    const scopedConfig = buildProviderScopedConfig(this.config, provider, this.agentDir);
    const auth = await this.resolveAuthImpl(provider, scopedConfig);
    const baseUrl = resolveProviderBaseUrl(scopedConfig, provider);
    const requestUrl = `${baseUrl}/models`;

    if (!auth.apiKey) {
      return {
        ok: false,
        provider,
        requestUrl,
        ...buildAuthTraceFields(auth),
        modelIds: [],
        failureClass: "provider_connection",
        errorMessage: `model-memory model listing for provider "${provider}" requires an API key or OAuth token`,
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "GET",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          ...(provider === "openrouter"
            ? {
                "HTTP-Referer": "https://openclaw.ai",
                "X-Title": "OpenClaw model-memory",
              }
            : {}),
        },
      });
    } catch (error) {
      return {
        ok: false,
        provider,
        requestUrl,
        ...buildAuthTraceFields(auth),
        modelIds: [],
        failureClass: "provider_connection",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }

    const rawResponseText = await response.text();
    if (!response.ok) {
      const errorMessage =
        buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error";
      return {
        ok: false,
        provider,
        requestUrl,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        modelIds: [],
        failureClass: this.classifyProviderFailure({
          httpStatus: response.status,
          failureStage: "request_time",
          errorMessage,
        }),
        errorMessage,
      };
    }

    try {
      const payload = JSON.parse(rawResponseText) as {
        data?: Array<{
          id?: unknown;
          supported_parameters?: unknown;
          context_length?: unknown;
          top_provider?: { max_completion_tokens?: unknown };
        }>;
      };
      const models = (payload.data ?? [])
        .map((entry) => {
          const id = typeof entry.id === "string" ? entry.id : undefined;
          if (!id) {
            return undefined;
          }
          return {
            id,
            supportedParameters: Array.isArray(entry.supported_parameters)
              ? entry.supported_parameters.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
            contextLength:
              typeof entry.context_length === "number" ? entry.context_length : undefined,
            maxCompletionTokens:
              typeof entry.top_provider?.max_completion_tokens === "number"
                ? entry.top_provider.max_completion_tokens
                : undefined,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .toSorted((left, right) => left.id.localeCompare(right.id));
      return {
        ok: true,
        provider,
        requestUrl,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        modelIds: models.map((model) => model.id),
        models,
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        requestUrl,
        ...buildAuthTraceFields(auth),
        httpStatus: response.status,
        modelIds: [],
        failureClass: "provider_json_boundary",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async preflightContract(
    request: JsonModelExecutionRequest,
  ): Promise<ModelMemoryProviderPreflightResult> {
    const startedAt = Date.now();
    const finish = (result: ModelMemoryProviderPreflightResult) =>
      this.finishPreflightResult(result, Date.now() - startedAt, buildSchemaHash(request));
    const model = resolveRequestModel(request.contract.modelId, this.defaultProvider);
    const scopedConfig = buildProviderScopedConfig(this.config, model.provider, this.agentDir);
    const route = resolveProviderRoute(scopedConfig, model, this.agentDir);
    const auth = await this.resolveAuthImpl(model.provider, scopedConfig);
    const requestUrl = route.requestUrl;
    const responseFormatMode = resolveResponseFormatMode(request);
    const transport = request.responseOptions?.transport;

    if (!auth.apiKey) {
      return finish({
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        failureStage: "request_time",
        errorMessage: `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      });
    }

    const requestBody = route.usesResponsesApi
      ? buildResponsesRequestBody({
          request,
          route,
          systemPrompt:
            "Preflight this exact structured-output contract. Return one minimal valid JSON object for the provided response format.",
          userPrompt: '{"preflight":true}',
          maxOutputTokens: Math.min(
            resolveMaxOutputTokens(request.responseOptions?.maxOutputTokens),
            64,
          ),
        })
      : ({
          model: model.model,
          ...buildTemperatureOptions(request, model.provider),
          max_tokens: Math.min(
            resolveMaxOutputTokens(request.responseOptions?.maxOutputTokens),
            64,
          ),
          messages: [
            {
              role: "system",
              content:
                "Preflight this exact structured-output contract. Return one minimal valid JSON object for the provided response format.",
            },
            {
              role: "user",
              content: '{"preflight":true}',
            },
          ],
          response_format: buildResponseFormat(request),
          ...(buildProviderOptions(request, model.provider)
            ? { provider: buildProviderOptions(request, model.provider) }
            : {}),
          ...buildPromptCacheOptions(request, model.provider),
          ...buildModelPerformanceOptions(request, model.provider),
        } satisfies Record<string, unknown>);

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: buildRequestHeaders({
          auth,
          route,
          config: scopedConfig,
          agentDir: this.agentDir,
        }),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return finish({
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    const rawResponseText = await readProviderResponseText(response, route);
    if (!response.ok) {
      return finish({
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        failureStage: "request_time",
        errorMessage: buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error",
      });
    }

    try {
      const payload = parseProviderSuccessPayload(rawResponseText, route);
      if (route.usesResponsesApi) {
        extractResponsesOutputText(payload as OpenAIResponsesApiResponse);
      } else {
        extractOutputText(payload as OpenAICompatibleResponse);
      }
      return finish({
        ok: true,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      });
    } catch (error) {
      return finish({
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const startedAt = Date.now();
    const model = resolveRequestModel(request.contract.modelId, this.defaultProvider);
    const scopedConfig = buildProviderScopedConfig(this.config, model.provider, this.agentDir);
    const route = resolveProviderRoute(scopedConfig, model, this.agentDir);
    const auth = await this.resolveAuthImpl(model.provider, scopedConfig);
    if (!auth.apiKey) {
      throw new Error(
        `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      );
    }

    const requestUrl = route.requestUrl;
    const responseFormatMode = resolveResponseFormatMode(request);
    const requestBody = route.usesResponsesApi
      ? buildResponsesRequestBody({
          request,
          route,
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          maxOutputTokens: resolveMaxOutputTokens(request.responseOptions?.maxOutputTokens),
          includeSeed: this.requestSeed !== undefined,
        })
      : ({
          model: model.model,
          ...buildTemperatureOptions(request, model.provider),
          max_tokens: resolveMaxOutputTokens(request.responseOptions?.maxOutputTokens),
          ...(this.requestSeed !== undefined ? { seed: this.requestSeed } : {}),
          messages: [
            {
              role: "system",
              content: request.systemPrompt,
            },
            {
              role: "user",
              content: request.userPrompt,
            },
          ],
          response_format: buildResponseFormat(request),
          ...(buildProviderOptions(request, model.provider)
            ? { provider: buildProviderOptions(request, model.provider) }
            : {}),
          ...buildPromptCacheOptions(request, model.provider),
          ...buildModelPerformanceOptions(request, model.provider),
        } satisfies Record<string, unknown>);
    const prefixHash = sha256(request.systemPrompt);
    const schemaHash = buildSchemaHash(request);
    const promptCacheKey = request.responseOptions?.promptCache?.key;
    const promptCacheRetention = request.responseOptions?.promptCache?.retention;

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: buildRequestHeaders({
          auth,
          route,
          config: scopedConfig,
          agentDir: this.agentDir,
        }),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        latencyMs: Date.now() - startedAt,
        responseOk: false,
        responseBodyReceived: false,
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      trace.failureClass = this.classifyProviderFailure({
        strictSchema: requestBodyUsesStrictSchema(requestBody),
        failureStage: trace.failureStage,
        errorMessage: trace.errorMessage,
      });
      await this.recordTraceScorecard(trace);
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: request_time ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    const rawResponseText = await readProviderResponseText(response, route);
    const responseBodyExcerpt = buildExcerpt(rawResponseText);

    if (!response.ok) {
      const detail = buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error";
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        latencyMs: Date.now() - startedAt,
        httpStatus: response.status,
        responseOk: false,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        failureStage: "request_time",
        errorMessage: detail,
      };
      trace.failureClass = this.classifyProviderFailure({
        strictSchema: requestBodyUsesStrictSchema(requestBody),
        httpStatus: trace.httpStatus,
        failureStage: trace.failureStage,
        errorMessage: trace.errorMessage,
      });
      await this.recordTraceScorecard(trace);
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: ${response.status} ${detail}`,
        trace,
      );
    }

    let payload: OpenAICompatibleResponse | OpenAIResponsesApiResponse;
    try {
      payload = parseProviderSuccessPayload(rawResponseText, route);
    } catch (error) {
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        latencyMs: Date.now() - startedAt,
        httpStatus: response.status,
        responseOk: true,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        failureStage: "provider_parse",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      trace.failureClass = this.classifyProviderFailure({
        strictSchema: requestBodyUsesStrictSchema(requestBody),
        httpStatus: trace.httpStatus,
        failureStage: trace.failureStage,
        errorMessage: trace.errorMessage,
      });
      await this.recordTraceScorecard(trace);
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: provider_parse ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    let outputText: string;
    try {
      outputText = route.usesResponsesApi
        ? extractResponsesOutputText(payload as OpenAIResponsesApiResponse)
        : extractOutputText(payload as OpenAICompatibleResponse);
    } catch (error) {
      const usageTrace = buildUsageTrace(payload, route.usesResponsesApi);
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        providerApi: route.providerApi,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        responseFormatMode,
        ...buildAuthTraceFields(auth),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        latencyMs: Date.now() - startedAt,
        httpStatus: response.status,
        responseOk: true,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
        ...usageTrace,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      trace.failureClass = this.classifyProviderFailure({
        strictSchema: requestBodyUsesStrictSchema(requestBody),
        httpStatus: trace.httpStatus,
        failureStage: trace.failureStage,
        errorMessage: trace.errorMessage,
      });
      await this.recordTraceScorecard(trace);
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: provider_response ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    const usageTrace = buildUsageTrace(payload, route.usesResponsesApi);
    const trace: ModelMemoryLiveExecutionTrace = {
      contractName: request.contract.contractName,
      contractVersion: request.contract.contractVersion,
      requestedModelId: request.contract.modelId,
      provider: model.provider,
      providerModel: model.model,
      providerApi: route.providerApi,
      requestUrl,
      requestBody: buildTraceRequestBody(requestBody),
      responseFormatMode,
      ...buildAuthTraceFields(auth),
      prefixHash,
      schemaHash,
      promptCacheKey,
      promptCacheRetention,
      latencyMs: Date.now() - startedAt,
      httpStatus: response.status,
      responseOk: true,
      responseBodyReceived: rawResponseText.trim().length > 0,
      responseBodyExcerpt,
      resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      outputTextExcerpt: buildExcerpt(outputText),
      ...usageTrace,
    };
    await this.recordTraceScorecard(trace);
    this.onTrace?.(trace);

    const executionResponse: JsonModelExecutionResponse = {
      outputText,
      resolvedModelId: trace.resolvedModelId,
    };
    if (
      trace.promptTokenCount !== undefined ||
      trace.outputTokenCount !== undefined ||
      trace.cachedInputTokenCount !== undefined ||
      promptCacheKey !== undefined ||
      schemaHash !== undefined
    ) {
      executionResponse.usage = {
        promptTokens: trace.promptTokenCount,
        outputTokens: trace.outputTokenCount,
        cachedInputTokens: trace.cachedInputTokenCount,
        promptCacheKey,
        prefixHash,
        schemaHash,
      };
    }
    return executionResponse;
  }
}
