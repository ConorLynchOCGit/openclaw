import { createHash } from "node:crypto";
import { loadConfig, type OpenClawConfig } from "../config/config.js";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../plugin-sdk/model-memory.js";
import { resolveApiKeyForProvider } from "./model-auth.js";
import { parseModelRef, type ModelRef } from "./model-selection.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type FetchLike = typeof fetch;

type ResolvedAuth = {
  apiKey?: string;
  source: string;
  mode: "api-key" | "oauth" | "token" | "aws-sdk";
  profileId?: string;
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
  requestUrl: string;
  requestBody: Record<string, unknown>;
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
  failureStage?: ModelMemoryLiveExecutionFailureStage;
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
};

export type ModelMemoryProviderPreflightResult = {
  ok: boolean;
  requestedModelId: string;
  provider: string;
  providerModel: string;
  requestUrl: string;
  contractName?: string;
  contractVersion?: string;
  schemaName?: string;
  strictSchema?: boolean;
  httpStatus?: number;
  resolvedModelId?: string;
  failureStage?: ModelMemoryLiveExecutionFailureStage;
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

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
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

function resolveProviderBaseUrl(config: OpenClawConfig | undefined, provider: string): string {
  const configured = config?.models?.providers?.[provider]?.baseUrl;
  const override = readTrimmedString(configured);
  if (override) {
    return override.replace(/\/+$/, "");
  }
  if (provider === "openrouter") {
    return OPENROUTER_BASE_URL;
  }
  if (provider === "openai" || provider === "openai-codex") {
    return OPENAI_BASE_URL;
  }
  throw new Error(`model-memory live executor does not support provider "${provider}"`);
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

function buildPromptCacheOptions(request: JsonModelExecutionRequest): Record<string, unknown> {
  const promptCache = request.responseOptions?.promptCache;
  return {
    ...(promptCache?.key ? { prompt_cache_key: promptCache.key } : {}),
    ...(promptCache?.retention ? { prompt_cache_retention: promptCache.retention } : {}),
  };
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

function buildTraceRequestBody(requestBody: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  return {
    ...requestBody,
    messages: messages.map((message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        return { role: "unknown", content_sha256: null, content_chars: 0 };
      }
      const record = message as { role?: unknown; content?: unknown };
      const content =
        typeof record.content === "string" ? record.content : JSON.stringify(record.content ?? "");
      return {
        role: typeof record.role === "string" ? record.role : "unknown",
        content_sha256: sha256(content),
        content_chars: content.length,
      };
    }),
  };
}

function buildUsageTrace(payload: OpenAICompatibleResponse): {
  finishReason?: string;
  promptTokenCount?: number;
  outputTokenCount?: number;
  cachedInputTokenCount?: number;
} {
  return {
    finishReason: readTrimmedString(payload.choices?.[0]?.finish_reason),
    promptTokenCount:
      typeof payload.usage?.prompt_tokens === "number" ? payload.usage.prompt_tokens : undefined,
    outputTokenCount:
      typeof payload.usage?.completion_tokens === "number"
        ? payload.usage.completion_tokens
        : undefined,
    cachedInputTokenCount:
      typeof payload.usage?.prompt_tokens_details?.cached_tokens === "number"
        ? payload.usage.prompt_tokens_details.cached_tokens
        : undefined,
  };
}

function parseErrorText(rawText: string): string {
  try {
    const json = JSON.parse(rawText) as {
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
    return directMessage ?? JSON.stringify(json);
  } catch {
    return rawText;
  }
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
  private readonly fetchImpl: FetchLike;
  private readonly defaultProvider: string;
  private readonly requestTimeoutMs: number;
  private readonly requestSeed?: number;
  private readonly resolveAuthImpl: NonNullable<ModelMemoryLiveJsonExecutorOptions["resolveAuth"]>;
  private readonly onTrace?: (trace: ModelMemoryLiveExecutionTrace) => void;

  constructor(options: ModelMemoryLiveJsonExecutorOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultProvider = options.defaultProvider ?? "openrouter";
    this.requestTimeoutMs = resolveRequestTimeoutMs(options.requestTimeoutMs);
    this.requestSeed = resolveRequestSeed(options.requestSeed);
    this.onTrace = options.onTrace;
    this.resolveAuthImpl =
      options.resolveAuth ??
      ((provider, config) =>
        resolveApiKeyForProvider({
          provider,
          cfg: config,
          agentDir: options.agentDir,
        }));
  }

  getRequestTimeoutMs(): number {
    return this.requestTimeoutMs;
  }

  getRequestSeed(): number | undefined {
    return this.requestSeed;
  }

  async preflightModel(modelId: string): Promise<ModelMemoryProviderPreflightResult> {
    const model = resolveRequestModel(modelId, this.defaultProvider);
    const auth = await this.resolveAuthImpl(model.provider, this.config);
    const baseUrl = resolveProviderBaseUrl(this.config, model.provider);
    const requestUrl = `${baseUrl}/chat/completions`;

    if (!auth.apiKey) {
      return {
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        failureStage: "request_time",
        errorMessage: `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      };
    }

    const requestBody = {
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
    } satisfies Record<string, unknown>;

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          "Content-Type": "application/json",
          ...(model.provider === "openrouter"
            ? {
                "HTTP-Referer": "https://openclaw.ai",
                "X-Title": "OpenClaw model-memory",
              }
            : {}),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return {
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }

    const rawResponseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        httpStatus: response.status,
        failureStage: "request_time",
        errorMessage: buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error",
      };
    }

    try {
      const payload = JSON.parse(rawResponseText) as OpenAICompatibleResponse;
      extractOutputText(payload);
      return {
        ok: true,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        httpStatus: response.status,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      };
    } catch (error) {
      return {
        ok: false,
        requestedModelId: modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        httpStatus: response.status,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async preflightContract(
    request: JsonModelExecutionRequest,
  ): Promise<ModelMemoryProviderPreflightResult> {
    const model = resolveRequestModel(request.contract.modelId, this.defaultProvider);
    const auth = await this.resolveAuthImpl(model.provider, this.config);
    const baseUrl = resolveProviderBaseUrl(this.config, model.provider);
    const requestUrl = `${baseUrl}/chat/completions`;
    const transport = request.responseOptions?.transport;

    if (!auth.apiKey) {
      return {
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        failureStage: "request_time",
        errorMessage: `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      };
    }

    const requestBody = {
      model: model.model,
      temperature: 0,
      max_tokens: Math.min(resolveMaxOutputTokens(request.responseOptions?.maxOutputTokens), 64),
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
      ...buildPromptCacheOptions(request),
    } satisfies Record<string, unknown>;

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          "Content-Type": "application/json",
          ...(model.provider === "openrouter"
            ? {
                "HTTP-Referer": "https://openclaw.ai",
                "X-Title": "OpenClaw model-memory",
              }
            : {}),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return {
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }

    const rawResponseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        failureStage: "request_time",
        errorMessage: buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error",
      };
    }

    try {
      const payload = JSON.parse(rawResponseText) as OpenAICompatibleResponse;
      extractOutputText(payload);
      return {
        ok: true,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      };
    } catch (error) {
      return {
        ok: false,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        schemaName: transport?.type === "json_schema" ? transport.name : undefined,
        strictSchema: transport?.type === "json_schema" ? (transport.strict ?? true) : false,
        httpStatus: response.status,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const model = resolveRequestModel(request.contract.modelId, this.defaultProvider);
    const auth = await this.resolveAuthImpl(model.provider, this.config);
    if (!auth.apiKey) {
      throw new Error(
        `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      );
    }

    const baseUrl = resolveProviderBaseUrl(this.config, model.provider);
    const requestUrl = `${baseUrl}/chat/completions`;
    const requestBody = {
      model: model.model,
      temperature: 0,
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
      ...buildPromptCacheOptions(request),
    } satisfies Record<string, unknown>;
    const prefixHash = sha256(request.systemPrompt);
    const schemaHash = buildSchemaHash(request);
    const promptCacheKey = request.responseOptions?.promptCache?.key;
    const promptCacheRetention = request.responseOptions?.promptCache?.retention;

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: "POST",
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          "Content-Type": "application/json",
          ...(model.provider === "openrouter"
            ? {
                "HTTP-Referer": "https://openclaw.ai",
                "X-Title": "OpenClaw model-memory",
              }
            : {}),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        responseOk: false,
        responseBodyReceived: false,
        failureStage: "request_time",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: request_time ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    const rawResponseText = await response.text();
    const responseBodyExcerpt = buildExcerpt(rawResponseText);

    if (!response.ok) {
      const detail = buildExcerpt(parseErrorText(rawResponseText)) ?? "provider returned error";
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        httpStatus: response.status,
        responseOk: false,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        failureStage: "request_time",
        errorMessage: detail,
      };
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: ${response.status} ${detail}`,
        trace,
      );
    }

    let payload: OpenAICompatibleResponse;
    try {
      payload = JSON.parse(rawResponseText) as OpenAICompatibleResponse;
    } catch (error) {
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        httpStatus: response.status,
        responseOk: true,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        failureStage: "provider_parse",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: provider_parse ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    let outputText: string;
    try {
      outputText = extractOutputText(payload);
    } catch (error) {
      const usageTrace = buildUsageTrace(payload);
      const trace: ModelMemoryLiveExecutionTrace = {
        contractName: request.contract.contractName,
        contractVersion: request.contract.contractVersion,
        requestedModelId: request.contract.modelId,
        provider: model.provider,
        providerModel: model.model,
        requestUrl,
        requestBody: buildTraceRequestBody(requestBody),
        prefixHash,
        schemaHash,
        promptCacheKey,
        promptCacheRetention,
        httpStatus: response.status,
        responseOk: true,
        responseBodyReceived: rawResponseText.trim().length > 0,
        responseBodyExcerpt,
        resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
        ...usageTrace,
        failureStage: "provider_response",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      this.onTrace?.(trace);
      throw new ModelMemoryLiveExecutionError(
        `model-memory live execution failed for ${model.provider}/${model.model}: provider_response ${trace.errorMessage}`,
        trace,
        { cause: error },
      );
    }

    const usageTrace = buildUsageTrace(payload);
    const trace: ModelMemoryLiveExecutionTrace = {
      contractName: request.contract.contractName,
      contractVersion: request.contract.contractVersion,
      requestedModelId: request.contract.modelId,
      provider: model.provider,
      providerModel: model.model,
      requestUrl,
      requestBody: buildTraceRequestBody(requestBody),
      prefixHash,
      schemaHash,
      promptCacheKey,
      promptCacheRetention,
      httpStatus: response.status,
      responseOk: true,
      responseBodyReceived: rawResponseText.trim().length > 0,
      responseBodyExcerpt,
      resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
      outputTextExcerpt: buildExcerpt(outputText),
      ...usageTrace,
    };
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
