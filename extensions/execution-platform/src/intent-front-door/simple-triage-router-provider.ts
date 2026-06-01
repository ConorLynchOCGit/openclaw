import { createHash } from "node:crypto";
import {
  createOpenRouterRetryEvidence,
  DEFAULT_OPENROUTER_RETRY_POLICY,
  openRouterRetryDelayMs,
  retryReasonForOpenRouter,
  shouldRetryOpenRouter,
  type OpenRouterRetryEvidence,
  type OpenRouterRetryPolicy,
} from "../model-routing/openrouter-retry-policy.ts";
import type {
  LiveRouterModelPolicyDecision,
  LiveRouterReasoningEffort,
} from "./live-router-model-policy.ts";
import type { ProtocolPreGateResult, ProtocolPreGateSourceRoute } from "./protocol-pre-gate.ts";
import {
  createSimpleTriageRouterOutput,
  parseSimpleTriageRouterOutput,
  SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA,
  SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION,
  type SimpleTriageRouterOutput,
  type SimpleTriageRouterParseResult,
} from "./simple-triage-router-schema.ts";

export const SIMPLE_TRIAGE_ROUTER_PROVIDER_VERSION =
  "intent-front-door.simple-triage-router-provider.v1";
export const SIMPLE_TRIAGE_CHAT_ALLOW_MIN_CONFIDENCE = 0.75;

export type OrdinaryChatEligibilitySignals = {
  protocolAlreadyHandled: boolean;
  runtimeStatePresent: boolean;
  freshTargetAvailable: boolean;
  multipleActiveTargetsPresent: boolean;
  untrustedExternalContentPresent: boolean;
  pendingApprovalOrClarificationPresent: boolean;
  stateVersionMismatch: boolean;
  explicitUiControlOrStatusPayloadPresent: boolean;
};

export const DEFAULT_ORDINARY_CHAT_ELIGIBILITY_SIGNALS: OrdinaryChatEligibilitySignals = {
  protocolAlreadyHandled: false,
  runtimeStatePresent: false,
  freshTargetAvailable: false,
  multipleActiveTargetsPresent: false,
  untrustedExternalContentPresent: false,
  pendingApprovalOrClarificationPresent: false,
  stateVersionMismatch: false,
  explicitUiControlOrStatusPayloadPresent: false,
};

export function normalizeOrdinaryChatEligibilitySignals(
  input?: Partial<OrdinaryChatEligibilitySignals> | null,
): OrdinaryChatEligibilitySignals {
  return {
    ...DEFAULT_ORDINARY_CHAT_ELIGIBILITY_SIGNALS,
    ...input,
  };
}

export type SimpleTriageRouterRequest = {
  promptHash: string;
  volatilePromptText?: string;
  promptSummary: string;
  boundedConversationContextSummary: string;
  ordinaryChatEligibilitySignals?: Partial<OrdinaryChatEligibilitySignals> | null;
  protocolPreGateResult?: ProtocolPreGateResult | null;
  sourceRoute: ProtocolPreGateSourceRoute;
  requestId: string;
  sessionId?: string | null;
  routerModelPolicyRef: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type SimpleTriageModelClientRequest = {
  requestId: string;
  providerProfileRef: string;
  modelRef: string;
  routerPolicyRef: string;
  promptHash: string;
  promptSummary: string;
  volatilePromptText?: string;
  boundedConversationContextSummary: string;
  ordinaryChatEligibilitySignals: OrdinaryChatEligibilitySignals;
  protocolPreGateKind: string | null;
  sourceRoute: ProtocolPreGateSourceRoute;
  schemaVersion: typeof SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION;
  reasoningEffort?: LiveRouterReasoningEffort | null;
  speedPreference?: "throughput" | "latency" | null;
  maxTokens?: number | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type SimpleTriageModelClientResponse = {
  status: "succeeded" | "no_content" | "rate_limited" | "timeout" | "unavailable" | "failed";
  output: unknown;
  providerRef: string;
  modelRef: string;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  retryCount: number;
  retryEvidence?: OpenRouterRetryEvidence | null;
  responseHash: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export interface SimpleTriageModelClient {
  route(request: SimpleTriageModelClientRequest): Promise<SimpleTriageModelClientResponse>;
}

export interface SimpleTriageRouterProvider {
  route(request: SimpleTriageRouterRequest): Promise<SimpleTriageRouterProviderResponse>;
}

export type SimpleTriageRouterProviderResponse = {
  artifactKind: "simple_triage_router_provider_response";
  providerVersion: typeof SIMPLE_TRIAGE_ROUTER_PROVIDER_VERSION;
  parseResult: SimpleTriageRouterParseResult;
  output: SimpleTriageRouterOutput | null;
  providerRef: string | null;
  modelRef: string | null;
  routerModelPolicyRef: string;
  providerCallMade: boolean;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  retryCount: number;
  degradationState:
    | "healthy"
    | "degraded"
    | "rate_limited"
    | "schema_failure"
    | "blocked"
    | "fallback_only";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  runtimeJobsCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  modelPromotionPerformed: false;
};

export type OpenRouterSimpleTriageModelClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  retryPolicy?: Partial<OpenRouterRetryPolicy>;
};

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function buildSimpleTriageRouterSystemPrompt(): string {
  return [
    "You are the OpenClaw Intent Front Door ordinary-chat allow gate.",
    "Return only JSON matching SimpleTriageRouterOutput.",
    "Choose exactly one lane: chat_send, advanced_intent_front_door, or protocol_or_control_reject.",
    "chat_send is a narrow allow: choose it only when normal chat can safely answer without runtime state, workflow routing, authority, side-effect, target, untrusted-content, or raw-storage handling.",
    "advanced_intent_front_door means deeper review is needed; it does not mean execution is approved.",
    "Use the ordinaryChatEligibilitySignals only as input facts. Do not output them.",
    "If state, provenance, authority, side-effect, target, untrusted-content, policy, or raw-storage handling may be needed, choose advanced_intent_front_door.",
    "If you are uncertain whether ordinary chat is enough, choose advanced_intent_front_door.",
    "protocol_or_control_reject is only for malformed protocol/control input that arrives after ProtocolPreGate.",
    "Do not choose workflows, actions, authority, side effects, target refs, runtime jobs, latency, cost, provider status, retry metadata, schema validity, or storage behavior.",
    "SimpleTriageRouterOutput JSON schema follows. Obey it exactly:",
    JSON.stringify(SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA),
  ].join("\n");
}

function buildSimpleTriageRouterUserPayload(request: SimpleTriageModelClientRequest): string {
  return JSON.stringify({
    promptHash: request.promptHash,
    boundedPromptSummary: request.promptSummary,
    volatilePromptText: request.volatilePromptText ?? request.promptSummary,
    boundedConversationContextSummary: request.boundedConversationContextSummary,
    ordinaryChatEligibilitySignals: request.ordinaryChatEligibilitySignals,
    protocolPreGateKind: request.protocolPreGateKind,
    sourceRoute: request.sourceRoute,
    schemaVersion: request.schemaVersion,
    rawPromptStored: false,
    rawResponseStored: false,
  });
}

export function buildOpenRouterSimpleTriageRouterBody(request: SimpleTriageModelClientRequest) {
  return {
    model: request.modelRef,
    messages: [
      { role: "system", content: buildSimpleTriageRouterSystemPrompt() },
      { role: "user", content: buildSimpleTriageRouterUserPayload(request) },
    ],
    temperature: 0,
    max_tokens: request.maxTokens ?? 600,
    ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "SimpleTriageRouterOutput",
        strict: true,
        schema: SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA,
      },
    },
    provider: {
      require_parameters: true,
      ...(request.speedPreference ? { sort: request.speedPreference } : {}),
    },
  };
}

export class OpenRouterSimpleTriageModelClient implements SimpleTriageModelClient {
  constructor(private readonly options: OpenRouterSimpleTriageModelClientOptions) {}

  async route(request: SimpleTriageModelClientRequest): Promise<SimpleTriageModelClientResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const policy = { ...DEFAULT_OPENROUTER_RETRY_POLICY, ...this.options.retryPolicy };
    const attempts: OpenRouterRetryEvidence["attempts"] = [];
    let last: SimpleTriageModelClientResponse | null = null;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const started = this.options.now?.().getTime() ?? Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
      try {
        const response = await fetchImpl(
          `${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.options.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://openclaw.local/execution-platform",
              "X-Title": "OpenClaw Execution Platform Simple Triage Router",
            },
            body: JSON.stringify(buildOpenRouterSimpleTriageRouterBody(request)),
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
        const message =
          choice && typeof choice === "object"
            ? (choice.message as Record<string, unknown> | undefined)
            : undefined;
        const content = typeof message?.content === "string" ? message.content : "";
        const usage =
          providerBody?.usage && typeof providerBody.usage === "object"
            ? (providerBody.usage as Record<string, unknown>)
            : {};
        const reasonCode = retryReasonForOpenRouter({
          httpStatus: response.status,
          errorReasonCode: response.ok
            ? content.trim()
              ? null
              : "openrouter_no_content"
            : response.status === 429
              ? "openrouter_http_429"
              : response.status === 503
                ? "openrouter_http_503"
                : "openrouter_http_error",
          noContent: response.ok && !content.trim(),
          retryableHttpStatuses: policy.retryableHttpStatuses,
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
        const status: SimpleTriageModelClientResponse["status"] = response.ok
          ? content.trim()
            ? "succeeded"
            : "no_content"
          : response.status === 429
            ? "rate_limited"
            : "failed";
        last = {
          status,
          output: response.ok && content.trim() ? safeJsonParse(content) : null,
          providerRef: request.providerProfileRef,
          modelRef: request.modelRef,
          latencyMs: Math.max(0, completed - started),
          estimatedCostUsd: typeof usage.cost === "number" ? usage.cost : null,
          retryCount: attempt - 1,
          responseHash: response.ok && content.trim() ? sha256Text(content) : null,
          reasonCodes: [
            reasonCode,
            response.ok
              ? "simple_triage_provider_response_received"
              : `openrouter_http_${response.status}`,
          ].filter((reason): reason is string => Boolean(reason)),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
        if (!delay || last.status === "succeeded") {
          break;
        }
        await sleep(delay);
      } catch (error) {
        const completed = this.options.now?.().getTime() ?? Date.now();
        const reasonCode =
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
          status: reasonCode === "openrouter_network_timeout" ? "timeout" : "unavailable",
          output: null,
          providerRef: request.providerProfileRef,
          modelRef: request.modelRef,
          latencyMs: Math.max(0, completed - started),
          estimatedCostUsd: null,
          retryCount: attempt - 1,
          responseHash: null,
          reasonCodes: [reasonCode],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
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
        status: "unavailable",
        output: null,
        providerRef: request.providerProfileRef,
        modelRef: request.modelRef,
        latencyMs: null,
        estimatedCostUsd: null,
        retryCount: 0,
        responseHash: null,
        reasonCodes: ["simple_triage_provider_unavailable"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies SimpleTriageModelClientResponse);
    const retryEvidence = createOpenRouterRetryEvidence({
      modelId: request.modelRef,
      finalStatus: finalResult.status === "succeeded" ? "succeeded" : "needs_review",
      attempts,
    });
    return {
      ...finalResult,
      reasonCodes: [...new Set([...finalResult.reasonCodes, ...retryEvidence.retryReasonCodes])],
      retryEvidence,
    };
  }
}

export function buildSimpleTriageModelClientRequest(input: {
  policyDecision: LiveRouterModelPolicyDecision;
  routerRequest: SimpleTriageRouterRequest;
}): SimpleTriageModelClientRequest {
  return {
    requestId: input.routerRequest.requestId,
    providerProfileRef: input.policyDecision.providerProfileRef ?? "provider-profile://missing",
    modelRef:
      input.policyDecision.selectedModel?.model ??
      input.policyDecision.routerModelRef ??
      "model-route://missing",
    routerPolicyRef: input.policyDecision.routerPolicyRef ?? "router-policy://missing",
    promptHash: input.routerRequest.promptHash,
    promptSummary: input.routerRequest.promptSummary.slice(0, 500),
    volatilePromptText: input.routerRequest.volatilePromptText,
    boundedConversationContextSummary: input.routerRequest.boundedConversationContextSummary.slice(
      0,
      600,
    ),
    ordinaryChatEligibilitySignals: normalizeOrdinaryChatEligibilitySignals(
      input.routerRequest.ordinaryChatEligibilitySignals,
    ),
    protocolPreGateKind: input.routerRequest.protocolPreGateResult?.kind ?? null,
    sourceRoute: input.routerRequest.sourceRoute,
    schemaVersion: SIMPLE_TRIAGE_ROUTER_SCHEMA_VERSION,
    reasoningEffort: input.policyDecision.reasoningEffort,
    speedPreference: input.policyDecision.speedPreference,
    maxTokens: input.policyDecision.maxTokens,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export class LiveSimpleTriageRouterProvider implements SimpleTriageRouterProvider {
  constructor(
    private readonly options: {
      policyDecision: LiveRouterModelPolicyDecision;
      client: SimpleTriageModelClient;
    },
  ) {}

  async route(request: SimpleTriageRouterRequest): Promise<SimpleTriageRouterProviderResponse> {
    const policy = this.options.policyDecision;
    if (!policy.allowed) {
      return failAdvancedSimpleTriageResponse({
        request,
        policy,
        reasonCodes: policy.reasonCodes,
        providerCallMade: false,
      });
    }
    const clientRequest = buildSimpleTriageModelClientRequest({
      policyDecision: policy,
      routerRequest: request,
    });
    const response = await this.options.client.route(clientRequest);
    if (response.status !== "succeeded") {
      return failAdvancedSimpleTriageResponse({
        request,
        policy,
        reasonCodes: response.reasonCodes,
        providerCallMade: true,
        latencyMs: response.latencyMs,
        estimatedCostUsd: response.estimatedCostUsd,
        retryCount: response.retryCount,
        degradationState:
          response.status === "rate_limited"
            ? "rate_limited"
            : response.status === "no_content"
              ? "degraded"
              : "blocked",
      });
    }
    const parseResult = parseSimpleTriageRouterOutput(response.output);
    if (!parseResult.valid) {
      return failAdvancedSimpleTriageResponse({
        request,
        policy,
        reasonCodes: [
          "triage_not_proven_chat_fail_advanced",
          ...response.reasonCodes,
          ...parseResult.reasonCodes,
        ],
        providerCallMade: true,
        latencyMs: response.latencyMs,
        estimatedCostUsd: response.estimatedCostUsd,
        retryCount: response.retryCount,
        degradationState: "schema_failure",
        providerRef: response.providerRef,
        modelRef: response.modelRef,
      });
    }
    if (
      parseResult.output.lane === "chat_send" &&
      parseResult.output.confidence < SIMPLE_TRIAGE_CHAT_ALLOW_MIN_CONFIDENCE
    ) {
      return failAdvancedSimpleTriageResponse({
        request,
        policy,
        reasonCodes: [
          "triage_not_proven_chat_fail_advanced",
          "simple_triage_chat_confidence_below_allow_threshold",
          ...response.reasonCodes,
          ...parseResult.reasonCodes,
        ],
        providerCallMade: true,
        latencyMs: response.latencyMs,
        estimatedCostUsd: response.estimatedCostUsd,
        retryCount: response.retryCount,
        degradationState: "fallback_only",
        providerRef: response.providerRef,
        modelRef: response.modelRef,
      });
    }
    return {
      artifactKind: "simple_triage_router_provider_response",
      providerVersion: SIMPLE_TRIAGE_ROUTER_PROVIDER_VERSION,
      parseResult,
      output: parseResult.output,
      providerRef: response.providerRef,
      modelRef: response.modelRef,
      routerModelPolicyRef: policy.routerPolicyRef ?? request.routerModelPolicyRef,
      providerCallMade: true,
      latencyMs: response.latencyMs,
      estimatedCostUsd: response.estimatedCostUsd,
      retryCount: response.retryCount,
      degradationState: parseResult.valid ? "healthy" : "schema_failure",
      reasonCodes: [
        "simple_triage_router_provider_called",
        ...response.reasonCodes,
        ...parseResult.reasonCodes,
      ].slice(0, 40),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }
}

function failAdvancedSimpleTriageResponse(input: {
  request: SimpleTriageRouterRequest;
  policy: LiveRouterModelPolicyDecision;
  reasonCodes: string[];
  providerCallMade: boolean;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  retryCount?: number | null;
  degradationState?: SimpleTriageRouterProviderResponse["degradationState"];
  providerRef?: string | null;
  modelRef?: string | null;
}): SimpleTriageRouterProviderResponse {
  const output = createSimpleTriageRouterOutput({
    lane: "advanced_intent_front_door",
    confidence: 1,
    reasonCodes: ["triage_not_proven_chat_fail_advanced"],
    boundedRationale: "Ordinary chat was not proven; use advanced review.",
  });
  const parseResult = parseSimpleTriageRouterOutput(output);
  return {
    artifactKind: "simple_triage_router_provider_response",
    providerVersion: SIMPLE_TRIAGE_ROUTER_PROVIDER_VERSION,
    parseResult,
    output,
    providerRef: input.providerRef ?? input.policy.providerProfileRef,
    modelRef: input.modelRef ?? input.policy.routerModelRef,
    routerModelPolicyRef: input.policy.routerPolicyRef ?? input.request.routerModelPolicyRef,
    providerCallMade: input.providerCallMade,
    latencyMs: input.latencyMs ?? null,
    estimatedCostUsd: input.estimatedCostUsd ?? null,
    retryCount: input.retryCount ?? 0,
    degradationState: input.degradationState ?? "blocked",
    reasonCodes: [
      "triage_not_proven_chat_fail_advanced",
      ...input.reasonCodes,
      ...parseResult.reasonCodes,
    ].slice(0, 50),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  };
}
