import { describe, expect, it, vi } from "vitest";
import type { JsonModelExecutor } from "../../../model-memory/src/model-execution.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
  LIVE_ROUTER_MODEL_POLICY_FIXTURE,
  resolveLiveRouterModelPolicy,
} from "./live-router-model-policy.ts";
import {
  CANONICAL_ROUTER_OUTPUT_JSON_SCHEMA,
  CodexAppServerIntentFrontDoorRouterClient,
  LiveStructuredModelIntentRouterProvider,
  OpenRouterIntentFrontDoorRouterClient,
  buildIntentFrontDoorRouteWorkflowMenu,
  buildLiveRouterModelClientRequest,
  buildOpenRouterIntentFrontDoorRouterBody,
  type IntentFrontDoorRouterModelClient,
} from "./live-structured-router-provider.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import {
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
} from "./structured-model-intent-router.ts";

function routerRequest() {
  return buildStructuredModelIntentRouterRequest({
    promptHash: "sha256:test",
    volatilePromptText: "Have the team do a safe small task.",
    promptSummary: "User asks for a safe small execution task.",
    conversationContext: buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      activeRuntimeJobs: [
        {
          runtimeJobId: "runtime-job-one",
          jobType: "executor.agent_team",
          queueName: "execution-platform",
          state: "running",
          workItemId: null,
          workflowId: "agent_team.coding",
          updatedAt: "2026-05-06T00:00:00.000Z",
          freshness: "fresh",
        },
      ],
      recentContextSummary: "bounded context",
      workflowRegistryVersion: "workflow-registry:test",
      reasonCodes: ["test_context"],
    }),
    routerModelPolicyRef: "router-policy://intent-front-door/live-router/fixture",
    sourceRoute: "ux",
    requestId: "request:test",
  });
}

function policyDecision() {
  return resolveLiveRouterModelPolicy({
    policy: LIVE_ROUTER_MODEL_POLICY_FIXTURE,
    candidates: [LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE],
    providerSecretConfigured: true,
  });
}

describe("LiveStructuredModelIntentRouterProvider", () => {
  it("builds strict structured-output requests for CanonicalRouterOutput", () => {
    const request = buildLiveRouterModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: routerRequest(),
    });
    const body = buildOpenRouterIntentFrontDoorRouterBody(request);
    const systemPrompt = body.messages[0]!.content;
    const userPayload = JSON.parse(body.messages[1]!.content);

    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "CanonicalRouterOutput", strict: true },
    });
    const jsonSchema =
      body.response_format.type === "json_schema" ? body.response_format.json_schema : undefined;
    expect(jsonSchema).toBeDefined();
    if (!jsonSchema) {
      throw new Error("expected json_schema response format");
    }
    expect(jsonSchema.schema).toBe(CANONICAL_ROUTER_OUTPUT_JSON_SCHEMA);
    expect(jsonSchema.schema.required).toContain("schemaVersion");
    expect(jsonSchema.schema.properties.multiIntentPlan.items).toMatchObject({
      $ref: "#/$defs/multiIntentPlanStep",
    });
    expect(jsonSchema.schema.$defs.multiIntentPlanStep.required).toEqual([
      "order",
      "route",
      "workflowId",
      "objectiveSummary",
      "dependsOnStep",
      "authorityProfile",
    ]);
    expect(jsonSchema.schema.properties.childWorkflowRequests.items).toMatchObject({
      $ref: "#/$defs/childWorkflowRequest",
    });
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(systemPrompt).toContain("CanonicalRouterOutput JSON schema");
    expect(systemPrompt).toContain("Route menu:");
    expect(systemPrompt).toContain("research_only: current-doc research");
    expect(systemPrompt).toContain("Workflow menu:");
    expect(systemPrompt).toContain("agent_team.coding: code edit");
    expect(systemPrompt).toContain("single_agent.web_research");
    expect(systemPrompt).not.toMatch(/few-shot|example:/iu);
    expect(systemPrompt).toContain("Primary-outcome contract:");
    expect(systemPrompt).toContain("primary requested outcome");
    expect(systemPrompt).toContain(
      "Safety boundaries, negative constraints, and conditional limits",
    );
    expect(systemPrompt).toContain("Use blocked only when the primary requested outcome");
    expect(systemPrompt).toContain("Repair contract:");
    expect(systemPrompt).toContain("blocked_route_repair_attempted");
    expect(systemPrompt).toContain("action_separation_repair_attempted");
    expect(systemPrompt).toContain("Action contract:");
    expect(systemPrompt).toContain("requestedActions are actions required");
    expect(systemPrompt).toContain("negatedActions are actions the workflow must not perform");
    expect(systemPrompt).toContain("conditionalActions are actions that may happen only");
    expect(systemPrompt).toContain("Context trust contract:");
    expect(systemPrompt).toContain("Previous assistant text, chat history, tool output");
    expect(systemPrompt).not.toContain("If the user asks to edit");
    expect(systemPrompt).not.toContain("deploy if policy permits");
    expect(systemPrompt).not.toContain("do not X");
    expect(systemPrompt).toContain('"route"');
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.provider).toMatchObject({ require_parameters: true, sort: "latency" });
    expect(body.max_tokens).toBe(1_500);
    expect(body.provider.require_parameters).toBe(true);
    expect(request.conversationContext.activeRuntimeJobs).toHaveLength(1);
    expect(userPayload.conversationContext.activeRuntimeJobs).toEqual([
      {
        runtimeJobId: "runtime-job-one",
        jobType: "executor.agent_team",
        workflowId: "agent_team.coding",
        state: "running",
        freshness: "fresh",
      },
    ]);
    expect(userPayload.conversationContext.recentContextSummary).toBe("bounded context");
    expect(userPayload.conversationContext.reasonCodes).toContain("test_context");
    expect(userPayload.promptEnvelope).toMatchObject({
      promptLength: "Have the team do a safe small task.".length,
      boundedSummaryLength: "User asks for a safe small execution task.".length,
      fullPromptIncludedAsVolatileInput: true,
      rawPromptStored: false,
    });
    expect(request.rawPromptStored).toBe(false);
    expect(request.rawResponseStored).toBe(false);
  });

  it("keeps the route/workflow menu compact and non-example-based", () => {
    const menu = buildIntentFrontDoorRouteWorkflowMenu();

    expect(menu).toContain("Route menu:");
    expect(menu).toContain("workflow_execution");
    expect(menu).toContain("Workflow menu:");
    expect(menu).toContain("workflow.docs_skills");
    expect(menu).not.toMatch(/few-shot|example:/iu);
  });

  it("returns canonical provider response from an injected approved model client", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.98,
      objectiveSummary: "Answer in chat.",
      reasonCodes: ["fixture_live_router_chat"],
    });
    const client: IntentFrontDoorRouterModelClient = {
      async route() {
        return {
          status: "succeeded",
          output,
          providerRef: "provider-profile://fixture",
          modelRef: "model://fixture",
          latencyMs: 42,
          estimatedCostUsd: 0.0001,
          retryCount: 0,
          responseHash: "sha256:response",
          reasonCodes: ["fixture_client_called"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: policyDecision(),
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.valid).toBe(true);
    expect(result.output?.route).toBe("chat_response");
    expect(result.metadata.providerCallMade).toBe(true);
    expect(result.metadata.runtimeJobCreated).toBe(false);
    expect(result.metadata.authorityGranted).toBe(false);
    expect(result.metadata.workQueueLifecycleMutationAllowed).toBe(false);
    expect(result.metadata.rawPromptStored).toBe(false);
    expect(result.metadata.rawResponseStored).toBe(false);
  });

  it("routes through the Codex app-server JSON executor without raw storage", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      executeNow: true,
      responseMode: "create_runtime_job",
      confidence: 0.94,
      objectiveSummary: "Route bounded coding work.",
      reasonCodes: ["fixture_codex_app_server_router"],
    });
    const execute = vi.fn(async (request) => {
      expect(request.contract).toMatchObject({
        contractName: "CanonicalRouterOutput",
        modelId: "openai-codex/gpt-5.5",
      });
      expect(request.systemPrompt).toContain("CanonicalRouterOutput JSON schema");
      expect(request.userPrompt).toContain("boundedPromptSummary");
      expect(request.responseOptions?.transport).toMatchObject({
        type: "json_schema",
        name: "CanonicalRouterOutput",
        strict: true,
      });
      expect(request.responseOptions?.reasoningEffort).toBe("medium");
      expect(request.responseOptions?.maxOutputTokens).toBe(4_000);
      return {
        outputText: JSON.stringify(output),
        resolvedModelId: "openai-codex/gpt-5.5",
      };
    });
    const client = new CodexAppServerIntentFrontDoorRouterClient({
      executor: { execute },
      now: (() => {
        const values = [1_000, 1_123];
        return () => new Date(values.shift() ?? 1_123);
      })(),
    });
    const request = buildLiveRouterModelClientRequest({
      policyDecision: {
        ...policyDecision(),
        selectedModel: {
          provider: "openai-codex",
          model: "openai-codex/gpt-5.5",
          family: "OpenAI-Codex",
          capabilities: ["structured_json", "json_schema"],
          status: "enabled",
          policyRef: "openai-codex/gpt-5.5",
        },
        routerModelRef: "openai-codex/gpt-5.5",
        reasoningEffort: "medium",
        maxTokens: 4_000,
      },
      routerRequest: routerRequest(),
    });

    const response = await client.route(request);

    expect(execute).toHaveBeenCalledOnce();
    expect(response.status).toBe("succeeded");
    expect(response.output).toEqual(output);
    expect(response.modelRef).toBe("openai-codex/gpt-5.5");
    expect(response.latencyMs).toBe(123);
    expect(response.reasonCodes).toContain("codex_app_server_router_response_received");
    expect(response.rawPromptStored).toBe(false);
    expect(response.rawResponseStored).toBe(false);
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("repairs invalid canonical router enum output with one bounded model turn", async () => {
    const repaired = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      requestedActions: [{ action: "code_edit", objectSummary: "implement", confidence: 0.9 }],
      sideEffectClass: "code_edit",
    });
    const invalid = {
      ...repaired,
      requestedActions: [{ action: "implementation", objectSummary: "implement", confidence: 0.9 }],
    };
    const calls: unknown[] = [];
    const client: IntentFrontDoorRouterModelClient = {
      async route(request) {
        calls.push(request);
        return {
          status: "succeeded",
          output: calls.length === 1 ? invalid : repaired,
          providerRef: "provider-profile://fixture",
          modelRef: "openai-codex/gpt-5.5",
          latencyMs: 10,
          estimatedCostUsd: 0.001,
          retryCount: 0,
          responseHash: `sha256:${calls.length}`,
          reasonCodes: [`fixture_client_called_${calls.length}`],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: {
          ...policyDecision(),
          routerModelRef: "openai-codex/gpt-5.5",
          selectedModel: {
            provider: "openai-codex",
            model: "openai-codex/gpt-5.5",
            family: "OpenAI-Codex",
            capabilities: ["structured_json", "json_schema"],
            status: "enabled",
            policyRef: "openai-codex/gpt-5.5",
          },
        },
        client,
      }),
    );

    const result = await router.route(routerRequest());
    const repairRequest = calls[1] as {
      schemaRepair?: { parseIssues?: unknown[]; allowedEnumValues?: { actions?: string[] } };
    };

    expect(result.valid).toBe(true);
    expect(result.output?.requestedActions[0]?.action).toBe("code_edit");
    expect(result.metadata.retryCount).toBe(1);
    expect(result.metadata.reasonCodes).toContain("router_schema_repair_succeeded");
    expect(repairRequest.schemaRepair?.parseIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "requestedActions.0.action",
        }),
      ]),
    );
    expect(repairRequest.schemaRepair?.allowedEnumValues?.actions).toContain("code_edit");
  });

  it("rejects invalid canonical router enum output when bounded repair also fails", async () => {
    const base = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      requestedActions: [{ action: "code_edit", objectSummary: "implement", confidence: 0.9 }],
      sideEffectClass: "code_edit",
    });
    const invalid = {
      ...base,
      requestedActions: [{ action: "implementation", objectSummary: "implement", confidence: 0.9 }],
    };
    const client: IntentFrontDoorRouterModelClient = {
      async route() {
        return {
          status: "succeeded",
          output: invalid,
          providerRef: "provider-profile://fixture",
          modelRef: "openai-codex/gpt-5.5",
          latencyMs: 10,
          estimatedCostUsd: 0.001,
          retryCount: 0,
          responseHash: "sha256:invalid",
          reasonCodes: ["fixture_client_called"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: policyDecision(),
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.valid).toBe(false);
    expect(result.metadata.degradationState).toBe("schema_failure");
    expect(result.metadata.reasonCodes).toContain("router_schema_repair_failed");
  });

  it("rejects raw-storage-flagged provider output through canonical schema", async () => {
    const client: IntentFrontDoorRouterModelClient = {
      async route() {
        return {
          status: "succeeded",
          output: {
            ...createBaseCanonicalRouterOutput({
              route: "chat_response",
              responseMode: "answer_in_chat",
            }),
            rawPromptStored: true,
          },
          providerRef: "provider-profile://fixture",
          modelRef: "model://fixture",
          latencyMs: 1,
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
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: policyDecision(),
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.valid).toBe(false);
    expect(result.metadata.degradationState).toBe("schema_failure");
    expect(result.metadata.runtimeJobCreated).toBe(false);
  });

  it("blocks missing policy without calling the live client", async () => {
    const client = { route: vi.fn() } satisfies IntentFrontDoorRouterModelClient;
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: resolveLiveRouterModelPolicy({ policy: null }),
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.output?.route).toBe("blocked");
    expect(result.metadata.providerCallMade).toBe(false);
    expect(client.route).not.toHaveBeenCalled();
    expect(result.metadata.reasonCodes).toContain("live_router_model_policy_missing");
  });

  it("maps provider no-content to blocked degradation without raw storage", async () => {
    const client: IntentFrontDoorRouterModelClient = {
      async route() {
        return {
          status: "no_content",
          output: null,
          providerRef: "provider-profile://fixture",
          modelRef: "model://fixture",
          latencyMs: 12,
          estimatedCostUsd: null,
          retryCount: 1,
          responseHash: null,
          reasonCodes: ["openrouter_no_content"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: policyDecision(),
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.output?.route).toBe("blocked");
    expect(result.metadata.degradationState).toBe("degraded");
    expect(result.metadata.providerCallMade).toBe(true);
    expect(result.metadata.rawPromptStored).toBe(false);
    expect(result.metadata.rawResponseStored).toBe(false);
  });
});

describe("OpenRouterIntentFrontDoorRouterClient", () => {
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

  it("performs live calls only through injected fetch in tests", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.99,
    });
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
            usage: { total_tokens: 10, cost: 0.00001 },
          }),
          { status: 200 },
        ),
    );
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({ route: "chat_response" });
    expect(response.responseHash).toMatch(/^sha256:/u);
    expect(response.rawPromptStored).toBe(false);
    expect(response.rawResponseStored).toBe(false);
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("retries no-content once and stores bounded retry evidence", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.99,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("", 200))
      .mockResolvedValueOnce(providerResponse(output, 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
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
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    expect(response.retryCount).toBe(1);
    expect(response.reasonCodes).toContain("openrouter_no_content");
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("falls back to JSON object response format when strict schema returns literal null", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      executeNow: true,
      responseMode: "create_runtime_job",
      confidence: 0.95,
      objectiveSummary: "Route coding-team work.",
      reasonCodes: ["fixture_json_object_fallback"],
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("null", 200))
      .mockResolvedValueOnce(providerResponse(output, 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: {
        maxAttempts: 1,
        timeoutMs: 1_000,
        baseDelayMs: 1,
        jitterMs: 0,
        rateLimitCooldownMs: 0,
      },
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );
    const firstBodyText = fetchImpl.mock.calls[0]?.[1]?.body;
    const secondBodyText = fetchImpl.mock.calls[1]?.[1]?.body;
    expect(typeof firstBodyText).toBe("string");
    expect(typeof secondBodyText).toBe("string");
    const firstBody = JSON.parse(firstBodyText as string);
    const secondBody = JSON.parse(secondBodyText as string);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(firstBody.response_format.type).toBe("json_schema");
    expect(secondBody.response_format.type).toBe("json_object");
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({ route: "workflow_execution" });
    expect(response.retryCount).toBe(1);
    expect(response.reasonCodes).toContain("router_provider_json_null_content");
    expect(response.reasonCodes).toContain("openrouter_json_object_fallback_used");
    expect(response.rawPromptStored).toBe(false);
    expect(response.rawResponseStored).toBe(false);
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("accepts canonical output wrapped in a structural output field", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.99,
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => providerResponse({ output }, 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(response.status).toBe("succeeded");
    expect(response.output).toEqual(output);
    expect(response.reasonCodes).toContain("router_provider_wrapped_output_unwrapped:output");
  });

  it("falls back to JSON object response format when strict schema content is not parseable", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      executeNow: true,
      responseMode: "create_runtime_job",
      confidence: 0.95,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("I cannot provide a JSON object.", 200))
      .mockResolvedValueOnce(providerResponse(output, 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: {
        maxAttempts: 1,
        timeoutMs: 1_000,
        baseDelayMs: 1,
        jitterMs: 0,
        rateLimitCooldownMs: 0,
      },
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );
    const secondBodyText = fetchImpl.mock.calls[1]?.[1]?.body;
    expect(typeof secondBodyText).toBe("string");
    const secondBody = JSON.parse(secondBodyText as string);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(secondBody.response_format.type).toBe("json_object");
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({ route: "workflow_execution" });
    expect(response.reasonCodes).toContain("router_provider_json_parse_failed");
    expect(response.reasonCodes).toContain("openrouter_json_object_fallback_used");
  });

  it("does not report succeeded when both response formats return unparseable content", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("I cannot provide a JSON object.", 200))
      .mockResolvedValueOnce(providerResponse("Still not JSON.", 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: {
        maxAttempts: 1,
        timeoutMs: 1_000,
        baseDelayMs: 1,
        jitterMs: 0,
        rateLimitCooldownMs: 0,
      },
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("no_content");
    expect(response.output).toBeNull();
    expect(response.reasonCodes).toContain("router_provider_json_parse_failed");
    expect(response.reasonCodes).toContain("openrouter_json_object_fallback_used");
  });

  it("does not report Codex app-server router succeeded when output cannot be parsed", async () => {
    const execute = vi.fn<JsonModelExecutor["execute"]>().mockResolvedValue({
      outputText: "not json",
      resolvedModelId: "openai-codex/gpt-5.5",
    });
    const client = new CodexAppServerIntentFrontDoorRouterClient({
      executor: { execute },
      requestTimeoutMs: 1_000,
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(response.status).toBe("no_content");
    expect(response.output).toBeNull();
    expect(response.reasonCodes).toContain("router_provider_json_parse_failed");
    expect(response.reasonCodes).toContain("codex_app_server_router_no_parseable_output");
  });

  it("retries 429 and 503 once", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.99,
    });
    for (const status of [429, 503]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(providerResponse({ error: "retryable" }, status))
        .mockResolvedValueOnce(providerResponse(output, 200));
      const client = new OpenRouterIntentFrontDoorRouterClient({
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
        buildLiveRouterModelClientRequest({
          policyDecision: policyDecision(),
          routerRequest: routerRequest(),
        }),
      );

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(response.status).toBe("succeeded");
      expect(response.retryCount).toBe(1);
    }
  });

  it("does not retry a completed response with invalid schema content", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse({ route: "not_canonical" }, 200));
    const client = new OpenRouterIntentFrontDoorRouterClient({
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
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe("succeeded");
    expect(response.retryCount).toBe(0);
    expect(response.output).toMatchObject({ route: "not_canonical" });
  });
});
