import { loadConfig, type OpenClawConfig } from "../config/config.js";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../plugin-sdk/model-memory-runtime.js";
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

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MODEL_MEMORY_REQUEST_TIMEOUT_ENV = "MODEL_MEMORY_REQUEST_TIMEOUT_MS";
const MODEL_MEMORY_REQUEST_SEED_ENV = "MODEL_MEMORY_REQUEST_SEED";

export type ModelMemoryLiveJsonExecutorOptions = {
  config?: OpenClawConfig;
  agentDir?: string;
  defaultProvider?: string;
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
  requestSeed?: number;
  resolveAuth?: (provider: string, config: OpenClawConfig | undefined) => Promise<ResolvedAuth>;
};

type OpenAICompatibleResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
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

async function parseErrorText(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? JSON.stringify(json);
  } catch {
    return await response.text();
  }
}

export class OpenAICompatibleLiveJsonExecutor implements JsonModelExecutor {
  private readonly config: OpenClawConfig | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly defaultProvider: string;
  private readonly requestTimeoutMs: number;
  private readonly requestSeed?: number;
  private readonly resolveAuthImpl: NonNullable<ModelMemoryLiveJsonExecutorOptions["resolveAuth"]>;

  constructor(options: ModelMemoryLiveJsonExecutorOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultProvider = options.defaultProvider ?? "openrouter";
    this.requestTimeoutMs = resolveRequestTimeoutMs(options.requestTimeoutMs);
    this.requestSeed = resolveRequestSeed(options.requestSeed);
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

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const model = resolveRequestModel(request.contract.modelId, this.defaultProvider);
    const auth = await this.resolveAuthImpl(model.provider, this.config);
    if (!auth.apiKey) {
      throw new Error(
        `model-memory live execution for provider "${model.provider}" requires an API key or OAuth token`,
      );
    }

    const baseUrl = resolveProviderBaseUrl(this.config, model.provider);
    const response = await this.fetchImpl(`${baseUrl}/chat/completions`, {
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
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
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
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const detail = await parseErrorText(response);
      throw new Error(
        `model-memory live execution failed for ${model.provider}/${model.model}: ${response.status} ${detail}`,
      );
    }

    const payload = (await response.json()) as OpenAICompatibleResponse;
    return {
      outputText: extractOutputText(payload),
      resolvedModelId: readTrimmedString(payload.model) ?? `${model.provider}/${model.model}`,
    };
  }
}
