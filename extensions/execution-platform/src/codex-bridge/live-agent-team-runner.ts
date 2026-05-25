import { sha256Text } from "../model-routing/model-run-accounting.ts";
import {
  createOpenRouterRetryEvidence,
  DEFAULT_OPENROUTER_RETRY_POLICY,
  openRouterRetryDelayMs,
  retryReasonForOpenRouter,
  shouldRetryOpenRouter,
  type OpenRouterRetryEvidence,
  type OpenRouterRetryPolicy,
  type OpenRouterRetryReasonCode,
} from "../model-routing/openrouter-retry-policy.ts";
import type { OpenRouterCatalogPricing } from "../model-routing/provider-usage-cost-normalizer.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  type ModelTaskClass,
} from "../model-tasks/model-task-classification.ts";
import {
  buildStructuredAdapterProviderProfile,
  classifyStructuredAdapterOutcome,
  structuredAdapterDiagnostics,
  structuredAdapterPreflight,
} from "../model-tasks/structured-tool-schema-adapter.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type AgentTeamModelClientResult = {
  status: "succeeded" | "failed" | "needs_review";
  responseText: string | null;
  responseHash: string | null;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
  } | null;
  catalogPricing?: OpenRouterCatalogPricing | null;
  retryEvidence?: OpenRouterRetryEvidence | null;
  providerResponseDiagnostics?: JsonValue | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
};

export type AgentTeamModelClient = {
  callRole(input: {
    roleId: AgentTeamRoleId;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    responseFormat?: "json_object";
    requestProfileOverride?: OpenRouterRoleModelRequestProfile;
    maxTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    taskClass?: ModelTaskClass;
    modelTaskCallSite?: string;
  }): Promise<AgentTeamModelClientResult>;
};

export type OpenRouterRoleModelRequestProfile = {
  responseFormatMode?: "native" | "prompt_only" | "auto";
  reasoningMode?: "exclude" | "omit" | "none";
  maxTokens?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenRouterAgentTeamModelClient implements AgentTeamModelClient {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      now?: () => Date;
      retryPolicy?: Partial<OpenRouterRetryPolicy>;
      catalogPricingByModelId?: Record<string, OpenRouterCatalogPricing>;
      requestProfilesByModelId?: Record<string, OpenRouterRoleModelRequestProfile>;
    },
  ) {}

  async callRole(input: {
    roleId: AgentTeamRoleId;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    responseFormat?: "json_object";
    requestProfileOverride?: OpenRouterRoleModelRequestProfile;
    maxTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    taskClass?: ModelTaskClass;
    modelTaskCallSite?: string;
  }): Promise<AgentTeamModelClientResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const policy = {
      ...DEFAULT_OPENROUTER_RETRY_POLICY,
      ...this.options.retryPolicy,
      ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
    };
    const requestProfile = {
      ...this.options.requestProfilesByModelId?.[input.modelId],
      ...input.requestProfileOverride,
    };
    const responseFormatMode = requestProfile.responseFormatMode ?? "auto";
    const reasoningMode = requestProfile.reasoningMode ?? "exclude";
    const promptHash = sha256Text(input.prompt);
    const classification = input.taskClass
      ? classifyModelTaskCall({
          taskClass: input.taskClass,
          callSite: input.modelTaskCallSite ?? `openrouter.role.${input.roleId}`,
          overrideModelRef: input.modelId,
          overrideReasonCode: "openrouter_role_model_explicit_model",
          overrideRationale:
            "OpenRouter role call selected the role/capability model for this task.",
        })
      : null;
    const adapterProfile = classification
      ? buildStructuredAdapterProviderProfile(classification)
      : null;
    const promptByteLength = Buffer.byteLength(input.prompt, "utf8");
    const preflight = adapterProfile
      ? structuredAdapterPreflight({
          profile: adapterProfile,
          inputBytes: promptByteLength,
          requestedMaxOutputTokens:
            input.maxTokens ?? requestProfile.maxTokens ?? adapterProfile.maxOutputTokens,
          requestedTimeoutMs: input.timeoutMs ?? adapterProfile.hardTimeoutMs,
        })
      : null;
    if (preflight && !preflight.accepted) {
      return {
        status: "needs_review",
        responseText: null,
        responseHash: null,
        usage: null,
        catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
        retryEvidence: null,
        providerResponseDiagnostics: {
          structuredAdapterProfile: adapterProfile as unknown as JsonValue,
          structuredAdapterPreflight: preflight as unknown as JsonValue,
          modelTaskClassification: classification as unknown as JsonValue,
          modelTaskTelemetry: classification
            ? buildModelTaskTelemetryEnvelope({
                classification,
                usage: null,
                usageUnavailableReason: "structured_adapter_preflight_blocked",
              })
            : null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        errorReasonCode: "structured_adapter_preflight_blocked",
        httpStatus: null,
      };
    }
    const modelCallSpanId = `openrouter:${input.modelCandidateId}:${promptHash.slice(0, 16)}:${Date.now().toString(36)}`;
    const attempts: OpenRouterRetryEvidence["attempts"] = [];
    let last: AgentTeamModelClientResult | null = null;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const responseFormatAllowed =
        Boolean(input.responseFormat) && responseFormatMode !== "prompt_only";
      const body = {
        model: input.modelId,
        messages: [
          {
            role: "user",
            content: input.prompt,
          },
        ],
        temperature: 0,
        max_tokens: input.maxTokens ?? requestProfile.maxTokens ?? 700,
        ...(responseFormatAllowed ? { response_format: { type: input.responseFormat } } : {}),
        ...(reasoningMode === "none"
          ? { reasoning: { effort: "none", exclude: true } }
          : reasoningMode === "omit"
            ? {}
            : { reasoning: { exclude: true } }),
      };
      const bodyRecord = body as Record<string, unknown>;
      const reasoningRecord =
        bodyRecord.reasoning && typeof bodyRecord.reasoning === "object"
          ? (bodyRecord.reasoning as Record<string, unknown>)
          : null;
      const requestProfileDiagnostics = {
        modelCallSpanId,
        modelRef: input.modelId,
        modelCandidateId: input.modelCandidateId,
        responseFormatMode,
        reasoningMode,
        maxTokens: body.max_tokens,
        timeoutMs: input.timeoutMs ?? policy.timeoutMs,
        maxAttempts: policy.maxAttempts,
        attempt,
        promptHash: `sha256:${promptHash}`,
        promptByteLength,
        structuredAdapterProfileRef: adapterProfile?.profileRef ?? null,
        hasResponseFormat: Boolean(bodyRecord.response_format),
        responseFormatType:
          bodyRecord.response_format && typeof bodyRecord.response_format === "object"
            ? (((bodyRecord.response_format as Record<string, unknown>).type as
                | string
                | undefined) ?? null)
            : null,
        hasReasoning: Boolean(reasoningRecord),
        reasoningEffort:
          reasoningRecord && typeof reasoningRecord.effort === "string"
            ? reasoningRecord.effort
            : null,
        reasoningExclude:
          reasoningRecord && typeof reasoningRecord.exclude === "boolean"
            ? reasoningRecord.exclude
            : null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies JsonValue;
      const started = this.options.now?.().getTime() ?? Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? policy.timeoutMs);
      try {
        const response = await fetchImpl(
          `${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.options.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://openclaw.local/execution-platform",
              "X-Title": "OpenClaw Execution Platform",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        const providerBody = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        const completed = this.options.now?.().getTime() ?? Date.now();
        const choice = Array.isArray(providerBody?.choices)
          ? (providerBody.choices[0] as Record<string, unknown> | undefined)
          : undefined;
        const choices = Array.isArray(providerBody?.choices)
          ? providerBody.choices
              .filter((item): item is Record<string, unknown> =>
                Boolean(item && typeof item === "object" && !Array.isArray(item)),
              )
              .slice(0, 16)
          : [];
        const message =
          choice && typeof choice === "object"
            ? (choice.message as Record<string, unknown> | undefined)
            : undefined;
        const content = typeof message?.content === "string" ? message.content : "";
        const finishReason =
          typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
        const usage =
          providerBody?.usage && typeof providerBody.usage === "object"
            ? (providerBody.usage as Record<string, unknown>)
            : {};
        const completionTokenDetails =
          usage.completion_tokens_details && typeof usage.completion_tokens_details === "object"
            ? (usage.completion_tokens_details as Record<string, unknown>)
            : {};
        const providerResponseDiagnostics = {
          modelCallSpanId,
          requestProfileDiagnostics,
          elapsedMs: Math.max(0, completed - started),
          timeoutMs: input.timeoutMs ?? policy.timeoutMs,
          abortFired: false,
          streamMode: false,
          finishReason,
          nativeFinishReason:
            typeof choice?.native_finish_reason === "string" ? choice.native_finish_reason : null,
          choiceCount: Array.isArray(providerBody?.choices) ? providerBody.choices.length : null,
          contentLengthByChoice: choices.map((item) => {
            const itemMessage =
              item.message && typeof item.message === "object" && !Array.isArray(item.message)
                ? (item.message as Record<string, unknown>)
                : {};
            return typeof itemMessage.content === "string" ? itemMessage.content.length : 0;
          }),
          toolCallCountByChoice: choices.map((item) => {
            const itemMessage =
              item.message && typeof item.message === "object" && !Array.isArray(item.message)
                ? (item.message as Record<string, unknown>)
                : {};
            return Array.isArray(itemMessage.tool_calls) ? itemMessage.tool_calls.length : 0;
          }),
          providerBodyKeys:
            providerBody && typeof providerBody === "object"
              ? Object.keys(providerBody).slice(0, 16)
              : [],
          errorKeys:
            providerBody?.error && typeof providerBody.error === "object"
              ? Object.keys(providerBody.error as Record<string, unknown>).slice(0, 12)
              : [],
          messageKeys:
            message && typeof message === "object" ? Object.keys(message).slice(0, 12) : [],
          contentType: message
            ? Array.isArray(message.content)
              ? "array"
              : typeof message.content
            : null,
          contentLength: content.length,
          reasoningTokenCount:
            typeof completionTokenDetails.reasoning_tokens === "number"
              ? completionTokenDetails.reasoning_tokens
              : null,
          completionTokenCount:
            typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
          providerUsage: {
            promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
            completionTokens:
              typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
            totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
            usageKeys: Object.keys(usage).slice(0, 16),
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue;
        const adapterDiagnostics =
          adapterProfile && classification
            ? structuredAdapterDiagnostics({
                profile: adapterProfile,
                attempt,
                httpStatus: response.status,
                latencyMs: Math.max(0, completed - started),
                content,
                finishReason,
                nativeFinishReason:
                  typeof choice?.native_finish_reason === "string"
                    ? choice.native_finish_reason
                    : null,
                errorReasonCode: response.ok && content.trim() ? null : "openrouter_no_content",
                inputBytes: promptByteLength,
                usage: {
                  inputTokenCount:
                    typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
                  outputTokenCount:
                    typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
                  totalTokenCount:
                    typeof usage.total_tokens === "number" ? usage.total_tokens : null,
                  estimatedCostUsd: typeof usage.cost === "number" ? usage.cost : null,
                },
              })
            : null;
        const adapterOutcome =
          adapterProfile && adapterDiagnostics
            ? classifyStructuredAdapterOutcome({
                profile: adapterProfile,
                diagnostics: adapterDiagnostics,
                parsedJsonValid: content.trim() ? null : false,
              })
            : null;
        const emptyReasonCode =
          response.ok && !content.trim() && finishReason === "length"
            ? "openrouter_no_content_finish_length"
            : "openrouter_no_content";
        const reasonCode = retryReasonForOpenRouter({
          httpStatus: response.status,
          errorReasonCode: response.ok
            ? content.trim()
              ? null
              : "openrouter_no_content"
            : response.status === 429
              ? "openrouter_http_429"
              : "openrouter_http_error",
          noContent: response.ok && !content.trim(),
        });
        const delay = shouldRetryOpenRouter({ attempt, reasonCode, policy })
          ? openRouterRetryDelayMs({ attempt, reasonCode, policy })
          : 0;
        attempts.push({
          attempt,
          reasonCode,
          httpStatus: response.status,
          cooldownMs: delay,
          latencyMs: Math.max(0, completed - started),
        });
        last = {
          status: response.ok && content.trim() ? "succeeded" : "needs_review",
          responseText: response.ok && content.trim() ? content : null,
          responseHash: response.ok && content.trim() ? sha256Text(content) : null,
          usage: {
            inputTokenCount: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
            outputTokenCount:
              typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
            totalTokenCount: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
            estimatedCostUsd: typeof usage.cost === "number" ? usage.cost : null,
          },
          catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
          providerResponseDiagnostics: {
            ...(providerResponseDiagnostics as Record<string, JsonValue>),
            structuredAdapterProfile: adapterProfile as unknown as JsonValue,
            structuredAdapterDiagnostics: adapterDiagnostics as unknown as JsonValue,
            structuredAdapterOutcome: adapterOutcome as unknown as JsonValue,
            modelTaskClassification: classification as unknown as JsonValue,
            modelTaskTelemetry: classification
              ? buildModelTaskTelemetryEnvelope({
                  classification,
                  usage: {
                    promptTokens:
                      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
                    outputTokens:
                      typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
                    cachedInputTokens: null,
                  },
                })
              : null,
          } satisfies JsonValue,
          httpStatus: response.status,
          errorReasonCode: response.ok
            ? content.trim()
              ? null
              : emptyReasonCode
            : response.status === 429
              ? "openrouter_http_429"
              : "openrouter_http_error",
        };
        if (!delay || last.status === "succeeded") {
          break;
        }
        await sleep(delay);
      } catch (error) {
        const completed = this.options.now?.().getTime() ?? Date.now();
        const reasonCode: OpenRouterRetryReasonCode =
          error instanceof Error && error.name === "AbortError"
            ? "openrouter_network_timeout"
            : "openrouter_network_error";
        const delay = shouldRetryOpenRouter({ attempt, reasonCode, policy })
          ? openRouterRetryDelayMs({ attempt, reasonCode, policy })
          : 0;
        attempts.push({
          attempt,
          reasonCode,
          httpStatus: null,
          cooldownMs: delay,
          latencyMs: Math.max(0, completed - started),
        });
        last = {
          status: "needs_review",
          responseText: null,
          responseHash: null,
          usage: null,
          catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
          providerResponseDiagnostics: {
            modelCallSpanId,
            requestProfileDiagnostics,
            errorKind: reasonCode,
            elapsedMs: Math.max(0, completed - started),
            timeoutMs: input.timeoutMs ?? policy.timeoutMs,
            abortFired: reasonCode === "openrouter_network_timeout",
            streamMode: false,
            providerBodyKeys: [],
            choiceCount: null,
            messageKeys: [],
            contentLength: null,
            contentLengthByChoice: [],
            toolCallCountByChoice: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          httpStatus: null,
          errorReasonCode: reasonCode,
        };
        if (!delay) {
          break;
        }
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
      }
    }
    const finalResult =
      last ??
      ({
        status: "needs_review",
        responseText: null,
        responseHash: null,
        usage: null,
        catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
        providerResponseDiagnostics: null,
        httpStatus: null,
        errorReasonCode: "openrouter_network_error",
      } satisfies AgentTeamModelClientResult);
    return {
      ...finalResult,
      retryEvidence: createOpenRouterRetryEvidence({
        modelId: input.modelId,
        finalStatus: finalResult.status,
        attempts,
      }),
    };
  }
}
