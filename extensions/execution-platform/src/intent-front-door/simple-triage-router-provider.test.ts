import { describe, expect, it, vi } from "vitest";
import {
  LIVE_ROUTER_MODEL_POLICY_FIXTURE,
  resolveLiveRouterModelPolicy,
} from "./live-router-model-policy.ts";
import {
  LiveSimpleTriageRouterProvider,
  OpenRouterSimpleTriageModelClient,
  buildOpenRouterSimpleTriageRouterBody,
  buildSimpleTriageModelClientRequest,
  type SimpleTriageModelClient,
} from "./simple-triage-router-provider.ts";
import {
  SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA,
  createSimpleTriageRouterOutput,
} from "./simple-triage-router-schema.ts";

function policyDecision() {
  return resolveLiveRouterModelPolicy({
    policy: {
      ...LIVE_ROUTER_MODEL_POLICY_FIXTURE,
      routerProviderProfile: {
        ...LIVE_ROUTER_MODEL_POLICY_FIXTURE.routerProviderProfile!,
        maxTokens: 600,
        reasoningEffort: "low",
        speedPreference: "latency",
      },
    },
    candidates: [
      {
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        family: "DeepSeek",
        capabilities: ["structured_json", "json_schema", "low_cost"],
        status: "enabled",
        policyRef: LIVE_ROUTER_MODEL_POLICY_FIXTURE.routerModelRef!,
      },
    ],
    providerSecretConfigured: true,
  });
}

function request() {
  return {
    promptHash: "sha256:triage-test",
    volatilePromptText: "bounded volatile text",
    promptSummary: "bounded prompt summary",
    boundedConversationContextSummary: "bounded context summary",
    protocolPreGateResult: null,
    sourceRoute: "ux" as const,
    requestId: "request:triage-test",
    sessionId: "session:triage-test",
    routerModelPolicyRef: "router-policy://triage-test",
    reasonCodes: ["triage_test"],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
  };
}

function providerResponse(output: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: typeof output === "string" ? output : JSON.stringify(output) } },
      ],
      usage: { total_tokens: 10, cost: 0.00001 },
    }),
    { status },
  );
}

describe("SimpleTriageRouterProvider", () => {
  it("builds a strict schema request for SimpleTriageRouterOutput only", () => {
    const clientRequest = buildSimpleTriageModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: request(),
    });
    const body = buildOpenRouterSimpleTriageRouterBody(clientRequest);
    const prompt = body.messages[0]!.content;

    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "SimpleTriageRouterOutput", strict: true },
    });
    expect(body.response_format.json_schema.schema).toBe(SIMPLE_TRIAGE_ROUTER_OUTPUT_JSON_SCHEMA);
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty("workflowId");
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty("latencyMs");
    expect(body.response_format.json_schema.schema.properties).not.toHaveProperty("providerRef");
    expect(prompt).toContain("ordinary-chat allow gate");
    expect(prompt).toContain("chat_send is a narrow allow");
    expect(prompt).toContain("If you are uncertain whether ordinary chat is enough");
    expect(prompt).toContain("Do not choose workflows, actions, authority, side effects");
    expect(prompt).toContain("latency, cost, provider status, retry metadata");
    expect(prompt).not.toContain("Have the team");
    expect(prompt).not.toContain("Deploy if policy permits");
    expect(prompt).not.toMatch(/few-shot|example:/iu);
    expect(JSON.parse(body.messages[1]!.content)).toMatchObject({
      ordinaryChatEligibilitySignals: {
        protocolAlreadyHandled: false,
        runtimeStatePresent: false,
        freshTargetAvailable: false,
        multipleActiveTargetsPresent: false,
        untrustedExternalContentPresent: false,
        pendingApprovalOrClarificationPresent: false,
        stateVersionMismatch: false,
        explicitUiControlOrStatusPayloadPresent: false,
      },
    });
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.provider).toMatchObject({ require_parameters: true, sort: "latency" });
    expect(body.max_tokens).toBe(600);
  });

  it("omits OpenRouter reasoning parameter when policy says reasoning none", () => {
    const clientRequest = buildSimpleTriageModelClientRequest({
      policyDecision: {
        ...policyDecision(),
        reasoningEffort: "none",
      },
      routerRequest: request(),
    });
    const body = buildOpenRouterSimpleTriageRouterBody(clientRequest);

    expect(body).not.toHaveProperty("reasoning");
    expect(body.provider).toMatchObject({ require_parameters: true });
  });

  it("adds provider metadata outside the model output", async () => {
    const output = createSimpleTriageRouterOutput({
      lane: "chat_send",
      confidence: 0.98,
      reasonCodes: ["safe_chat"],
      boundedRationale: "Normal chat can answer.",
    });
    const client: SimpleTriageModelClient = {
      async route() {
        return {
          status: "succeeded",
          output,
          providerRef: "provider-profile://fixture",
          modelRef: "deepseek/deepseek-v4-flash",
          latencyMs: 42,
          estimatedCostUsd: 0.00001,
          retryCount: 0,
          responseHash: "sha256:response",
          reasonCodes: ["fixture_client_called"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const provider = new LiveSimpleTriageRouterProvider({
      policyDecision: policyDecision(),
      client,
    });

    const response = await provider.route(request());

    expect(response.output?.lane).toBe("chat_send");
    expect(response.parseResult.valid).toBe(true);
    expect(response.providerRef).toBe("provider-profile://fixture");
    expect(response.modelRef).toBe("deepseek/deepseek-v4-flash");
    expect(response.latencyMs).toBe(42);
    expect(response.retryCount).toBe(0);
    expect(response.runtimeJobsCreated).toBe(false);
    expect(response.authorityGranted).toBe(false);
    expect(response.workQueueLifecycleMutated).toBe(false);
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("fails invalid and raw-storage outputs to advanced review", async () => {
    const client: SimpleTriageModelClient = {
      async route() {
        return {
          status: "succeeded",
          output: {
            ...createSimpleTriageRouterOutput({
              lane: "chat_send",
              confidence: 0.98,
              reasonCodes: ["safe_chat"],
              boundedRationale: "Normal chat can answer.",
            }),
            rawPromptStored: true,
          },
          providerRef: "provider-profile://fixture",
          modelRef: "deepseek/deepseek-v4-flash",
          latencyMs: 42,
          estimatedCostUsd: null,
          retryCount: 0,
          responseHash: "sha256:response",
          reasonCodes: ["fixture_client_called"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const provider = new LiveSimpleTriageRouterProvider({
      policyDecision: policyDecision(),
      client,
    });

    const response = await provider.route(request());

    expect(response.output?.lane).toBe("advanced_intent_front_door");
    expect(response.parseResult.valid).toBe(true);
    expect(response.degradationState).toBe("schema_failure");
    expect(response.reasonCodes).toContain("triage_not_proven_chat_fail_advanced");
    expect(response.reasonCodes).toContain("simple_triage_router_schema_invalid");
  });

  it("fails low-confidence chat_send to advanced review", async () => {
    const client: SimpleTriageModelClient = {
      async route() {
        return {
          status: "succeeded",
          output: createSimpleTriageRouterOutput({
            lane: "chat_send",
            confidence: 0.2,
            reasonCodes: ["low_confidence_chat"],
            boundedRationale: "Not enough confidence.",
          }),
          providerRef: "provider-profile://fixture",
          modelRef: "deepseek/deepseek-v4-flash",
          latencyMs: 42,
          estimatedCostUsd: null,
          retryCount: 0,
          responseHash: "sha256:response",
          reasonCodes: ["fixture_client_called"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const provider = new LiveSimpleTriageRouterProvider({
      policyDecision: policyDecision(),
      client,
    });

    const response = await provider.route(request());

    expect(response.output?.lane).toBe("advanced_intent_front_door");
    expect(response.degradationState).toBe("fallback_only");
    expect(response.reasonCodes).toContain("simple_triage_chat_confidence_below_allow_threshold");
  });

  it("fails no-content and unavailable provider states to advanced review", async () => {
    for (const status of ["no_content", "timeout", "unavailable", "rate_limited"] as const) {
      const client: SimpleTriageModelClient = {
        async route() {
          return {
            status,
            output: null,
            providerRef: "provider-profile://fixture",
            modelRef: "deepseek/deepseek-v4-flash",
            latencyMs: 42,
            estimatedCostUsd: null,
            retryCount: 1,
            responseHash: null,
            reasonCodes: [`fixture_${status}`],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        },
      };
      const provider = new LiveSimpleTriageRouterProvider({
        policyDecision: policyDecision(),
        client,
      });

      const response = await provider.route(request());

      expect(response.output?.lane).toBe("advanced_intent_front_door");
      expect(response.reasonCodes).toContain("triage_not_proven_chat_fail_advanced");
      expect(response.runtimeJobsCreated).toBe(false);
      expect(response.authorityGranted).toBe(false);
      expect(response.workQueueLifecycleMutated).toBe(false);
    }
  });

  it("blocks missing policy without calling the client", async () => {
    const client = { route: vi.fn() } satisfies SimpleTriageModelClient;
    const provider = new LiveSimpleTriageRouterProvider({
      policyDecision: resolveLiveRouterModelPolicy({ policy: null }),
      client,
    });

    const response = await provider.route(request());

    expect(response.output?.lane).toBe("advanced_intent_front_door");
    expect(response.providerCallMade).toBe(false);
    expect(client.route).not.toHaveBeenCalled();
    expect(response.reasonCodes).toContain("live_router_model_policy_missing");
  });

  it("records no-content retry metadata with injected fetch only", async () => {
    const output = createSimpleTriageRouterOutput({
      lane: "chat_send",
      confidence: 0.98,
      reasonCodes: ["safe_chat"],
      boundedRationale: "Normal chat can answer.",
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("", 200))
      .mockResolvedValueOnce(providerResponse(output, 200));
    const client = new OpenRouterSimpleTriageModelClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: {
        maxAttempts: 2,
        timeoutMs: 1_000,
        baseDelayMs: 1,
        jitterMs: 0,
        rateLimitCooldownMs: 0,
      },
    });

    const response = await client.route(
      buildSimpleTriageModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: request(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    expect(response.retryCount).toBe(1);
    expect(response.reasonCodes).toContain("openrouter_no_content");
    expect(response.rawProviderLogStored).toBe(false);
  });
});
