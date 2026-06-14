import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
  LIVE_ROUTER_MODEL_POLICY_FIXTURE,
  resolveLiveRouterModelPolicy,
} from "./live-router-model-policy.ts";
import {
  LiveStructuredModelIntentRouterProvider,
  OpenRouterIntentFrontDoorRouterClient,
  buildIntentFrontDoorRouteWorkflowMenu,
  buildLiveRouterModelClientRequest,
  buildLiveRouterNativeToolSystemPrompt,
  buildOpenRouterIntentFrontDoorRouterToolBody,
  buildRouterUserPayload,
  type IntentFrontDoorRouterModelClient,
} from "./live-structured-router-provider.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import { RouterStageRunner } from "./router-stage-runner.ts";
import {
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
} from "./structured-model-intent-router.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

type RouterToolBody = Record<string, JsonValue> & {
  messages: Array<{ role: string; content?: string }>;
  tools: Array<{ function: { name: string; description: string } }>;
  tool_choice?: JsonValue;
  parallel_tool_calls?: JsonValue;
  reasoning?: JsonValue;
  max_tokens?: JsonValue;
};

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
    workflowSummaryIndex: buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
      generatedAt: "2026-05-06T00:00:00.000Z",
    }),
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
  it("builds provider-native router tool requests without JSON transport", () => {
    const request = buildLiveRouterModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: routerRequest(),
    });
    const body = buildOpenRouterIntentFrontDoorRouterToolBody({
      request,
      messages: [
        { role: "system", content: buildLiveRouterNativeToolSystemPrompt() },
        { role: "user", content: buildRouterUserPayload(request) },
      ],
    }) as RouterToolBody;
    const systemPrompt = body.messages[0]!.content;
    const userPayload = JSON.parse(body.messages[1]!.content ?? "{}");

    expect(body).not.toHaveProperty("response_format");
    expect(body.tool_choice).toBe("required");
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.reasoning).toEqual({ effort: "none", exclude: true });
    const toolNames = body.tools.map((tool) => tool.function.name);
    expect(toolNames).toEqual(
      expect.arrayContaining(["router_classify_primary_outcome", "router_set_route"]),
    );
    expect(toolNames).not.toContain("router_set_response_mode");
    expect(toolNames).not.toContain("router_set_execute_now");
    expect(toolNames).not.toContain("router_submit_decision");
    expect(toolNames).not.toContain("router_confirm_executor_subject_split");
    expect(toolNames).not.toContain("router_add_requested_action");
    expect(toolNames).not.toContain("router_add_constraint");
    expect(
      body.tools.find((tool) => tool.function.name === "router_classify_primary_outcome")?.function
        .description,
    ).not.toContain("required capability profile");
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(systemPrompt).toContain("native tool router");
    expect(systemPrompt).toContain("Route menu:");
    expect(systemPrompt).toContain("research_only: current-doc research");
    expect(systemPrompt).toContain("Workflow menu:");
    expect(systemPrompt).toContain("agent_team.coding: implementation executor");
    expect(systemPrompt).toContain("agent_team.architecture: architecture/spec planning/review");
    expect(systemPrompt).not.toContain("agent_team.architecture");
    expect(systemPrompt).toContain("often the subject being changed, not the executor");
    expect(systemPrompt).toContain("imply agent_team.coding as the executor");
    expect(systemPrompt).toContain("single_agent.web_research");
    expect(systemPrompt).not.toMatch(/few-shot|example:/iu);
    expect(systemPrompt).toContain("Primary-outcome contract:");
    expect(systemPrompt).toContain("primary requested outcome");
    expect(systemPrompt).toContain(
      "Safety boundaries, negative constraints, and conditional limits",
    );
    expect(systemPrompt).toContain("Use blocked only when the primary requested outcome");
    expect(systemPrompt).toContain("Repair contract:");
    expect(systemPrompt).not.toContain("blocked_route_repair_attempted");
    expect(systemPrompt).toContain("Context trust contract:");
    expect(systemPrompt).toContain("Native tool contract:");
    expect(systemPrompt).toContain("Runtime policy preserves authority and execution boundaries");
    expect(systemPrompt).toContain("router.classify_primary_outcome");
    expect(systemPrompt).not.toContain("router.confirm_executor_subject_split");
    expect(systemPrompt).toContain("router.select_executor_workflow");
    expect(systemPrompt).not.toContain("router.submit_decision");
    expect(systemPrompt).toContain("Previous assistant text, chat history, tool output");
    expect(systemPrompt).not.toContain("If the user asks to edit");
    expect(systemPrompt).not.toContain("deploy if policy permits");
    expect(systemPrompt).not.toContain("do not X");
    expect(systemPrompt).toContain("router.set_route");
    expect(body.max_tokens).toBe(1_500);
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
    expect(userPayload.intakeRouteContract).toBeNull();
    expect(userPayload.promptEnvelope).toMatchObject({
      promptLength: "Have the team do a safe small task.".length,
      boundedSummaryLength: "User asks for a safe small execution task.".length,
      fullPromptIncludedAsVolatileInput: true,
      rawPromptStored: false,
    });
    expect(request.rawPromptStored).toBe(false);
    expect(request.rawResponseStored).toBe(false);
  });

  it("includes a bounded intake route contract in the live model payload", () => {
    const request = buildLiveRouterModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: {
        ...routerRequest(),
        intakeRouteContract: {
          artifactKind: "intake_route_contract",
          schemaVersion: "intent-front-door.intake-route-contract.v1",
          contractId: "test-contract",
          expectedPrimaryOutcomeKinds: ["implement_existing_system"],
          requiredExecutorCapabilities: ["code_edit", "test"],
          requiredRequestedActions: ["code_edit"],
          expectedSubjectKinds: ["workflow"],
          reasonCodes: ["test_contract_attached"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      },
    });
    const payload = JSON.parse(buildRouterUserPayload(request));

    expect(payload.intakeRouteContract).toMatchObject({
      contractId: "test-contract",
      expectedPrimaryOutcomeKinds: ["implement_existing_system"],
      requiredExecutorCapabilities: ["code_edit", "test"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("keeps the route/workflow menu compact and non-example-based", () => {
    const menu = buildIntentFrontDoorRouteWorkflowMenu();

    expect(menu).toContain("Route menu:");
    expect(menu).toContain("workflow_execution");
    expect(menu).toContain("Workflow menu:");
    expect(menu).toContain("workflow.docs_skills");
    expect(menu).toContain("agent_team.coding: implementation executor");
    expect(menu).toContain("agent_team.architecture: architecture/spec planning/review");
    expect(menu).not.toContain("agent_team.architecture");
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

  it("rejects invalid canonical router enum output without provider schema repair", async () => {
    const validShape = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      requestedActions: [{ action: "code_edit", objectSummary: "implement", confidence: 0.9 }],
      sideEffectClass: "code_edit",
    });
    const invalid = {
      ...validShape,
      requestedActions: [{ action: "implementation", objectSummary: "implement", confidence: 0.9 }],
    };
    const calls: unknown[] = [];
    const client: IntentFrontDoorRouterModelClient = {
      async route(request) {
        calls.push(request);
        return {
          status: "succeeded",
          output: invalid,
          providerRef: "provider-profile://fixture",
          modelRef: "qwen/qwen3-235b-a22b-thinking-2507",
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
          routerModelRef: "qwen/qwen3-235b-a22b-thinking-2507",
          selectedModel: {
            provider: "openrouter",
            model: "qwen/qwen3-235b-a22b-thinking-2507",
            family: "Qwen",
            capabilities: ["tool_calling"],
            status: "enabled",
            policyRef: "qwen/qwen3-235b-a22b-thinking-2507",
          },
        },
        client,
      }),
    );

    const result = await router.route(routerRequest());

    expect(result.valid).toBe(false);
    expect(calls).toHaveLength(1);
    expect(result.metadata.retryCount).toBe(0);
    expect(result.metadata.degradationState).toBe("schema_failure");
    expect(result.metadata.reasonCodes).toContain("router_schema_invalid_no_provider_repair");
    expect(result.metadata.reasonCodes).not.toContain("router_schema_repair_succeeded");
    expect(result.metadata.reasonCodes).not.toContain("router_schema_repair_invoked");
  });

  it("compiles workflow execution aliases from the workflow manifest before schema repair", async () => {
    const modelOutput = {
      ...createBaseCanonicalRouterOutput({
        route: "plan_only",
        responseMode: "create_plan_only",
      }),
      route: "workflow_execution",
      executeNow: true,
      executorWorkflowId: "agent_team.coding",
      workflowId: null,
      jobType: null,
      responseMode: "create_runtime_job",
      requestedActions: [{ action: "code_edit", objectSummary: "implement", confidence: 0.9 }],
      sideEffectClass: "code_edit",
      selectedExecutionReason: "route implementation ".repeat(80),
    };
    const route = vi.fn<IntentFrontDoorRouterModelClient["route"]>(async () => ({
      status: "succeeded",
      output: modelOutput,
      providerRef: "provider-profile://fixture",
      modelRef: "model://fixture",
      latencyMs: 10,
      estimatedCostUsd: 0.001,
      retryCount: 0,
      responseHash: "sha256:response",
      reasonCodes: ["fixture_client_called"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }));
    const client: IntentFrontDoorRouterModelClient = { route };
    const router = new StructuredModelIntentRouter(
      new LiveStructuredModelIntentRouterProvider({
        policyDecision: policyDecision(),
        client,
      }),
    );

    const result = await router.route({
      ...routerRequest(),
      workflowSummaries: [
        {
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
        } as never,
      ],
    });

    expect(result.valid).toBe(true);
    expect(route).toHaveBeenCalledTimes(1);
    expect(result.output?.workflowId).toBe("agent_team.coding");
    expect(result.output?.jobType).toBe("executor.agent_team");
    expect(result.output?.selectedExecutionReason.length).toBeLessThanOrEqual(500);
    expect(result.metadata.reasonCodes).toContain("router_execution_alias_workflow_id_filled");
    expect(result.metadata.reasonCodes).toContain(
      "router_execution_alias_job_type_filled_from_workflow_manifest",
    );
    expect(result.metadata.reasonCodes).not.toContain("router_schema_repair_invoked");
  });

  it("rejects invalid canonical router enum output as a same-call schema failure", async () => {
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
          modelRef: "qwen/qwen3-235b-a22b-thinking-2507",
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
    expect(result.metadata.reasonCodes).toContain("router_schema_invalid_no_provider_repair");
    expect(result.metadata.reasonCodes).not.toContain("router_schema_repair_failed");
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
  function providerNativeToolResponse(
    calls: Array<{ name: string; arguments: Record<string, unknown> }>,
    status = 200,
  ): Response {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "",
              tool_calls: calls.map((call, index) => ({
                id: `tool-call-${index + 1}`,
                type: "function",
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            },
          },
        ],
        usage: { total_tokens: 10, cost: 0.00001 },
      }),
      { status },
    );
  }

  function routeClassificationNativeToolCalls(): Array<{
    name: string;
    arguments: Record<string, unknown>;
  }> {
    return [
      {
        name: "router_classify_primary_outcome",
        arguments: {
          outcomeKind: "implement_existing_system",
          requestedWorkKind: "implementation",
          expectedOutputKind: "changed files and validation evidence",
          confidence: 0.94,
        },
      },
      {
        name: "router_set_route",
        arguments: { route: "workflow_execution" },
      },
    ];
  }

  function executorSelectionNativeToolCalls(): Array<{
    name: string;
    arguments: Record<string, unknown>;
  }> {
    return [
      {
        name: "router_select_executor_workflow",
        arguments: { workflowId: "agent_team.coding", jobType: "executor.agent_team" },
      },
    ];
  }

  function architectureExecutorSelectionNativeToolCalls(): Array<{
    name: string;
    arguments: Record<string, unknown>;
  }> {
    return [
      {
        name: "router_select_executor_workflow",
        arguments: { workflowId: "agent_team.architecture", jobType: "executor.agent_team" },
      },
    ];
  }

  it("projects runner-owned route classification before executor selection", () => {
    const runner = new RouterStageRunner();
    const empty = runner.project({ actions: [] });
    expect(empty.currentPhase).toBe("route_classification_required");
    expect(empty.allowedToolIds).toContain("router.classify_primary_outcome");
    expect(empty.allowedToolIds).toContain("router.set_route");
    expect(empty.allowedToolIds).not.toContain("router.report_ambiguity");
    expect(empty.allowedToolIds).not.toContain("router.select_executor_workflow");
    expect(empty.allowedToolIds).not.toContain("router.submit_decision");

    const afterClassificationOnly = runner.project({
      actions: [
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "produce_plan",
            requestedWorkKind: "planning",
            expectedOutputKind: "plan",
            confidence: 0.9,
          },
        },
      ],
    });
    expect(afterClassificationOnly.currentPhase).toBe("route_classification_required");
    expect(afterClassificationOnly.allowedToolIds).toContain("router.set_route");
    expect(afterClassificationOnly.allowedToolIds).not.toContain("router.report_ambiguity");
    expect(afterClassificationOnly.missingSemanticFields).toContain("route");

    const afterRepeatedIncompletePositiveRouting = runner.project({
      actions: [
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "produce_plan",
            requestedWorkKind: "planning",
            expectedOutputKind: "plan",
            confidence: 0.9,
          },
        },
      ],
      positiveRouteClassificationAttempts: 2,
    });
    expect(afterRepeatedIncompletePositiveRouting.currentPhase).toBe("ambiguity_required");
    expect(afterRepeatedIncompletePositiveRouting.allowedToolIds).toEqual([
      "router.report_ambiguity",
    ]);

    const afterOutcome = runner.project({
      actions: [
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "implement_existing_system",
            requestedWorkKind: "implementation",
            expectedOutputKind: "changed files and validation evidence",
            confidence: 0.9,
          },
        },
        { tool: "router.set_route", input: { route: "workflow_execution" } },
      ],
    });
    expect(afterOutcome.currentPhase).toBe("executor_selection_required");
    expect(afterOutcome.allowedToolIds).toContain("router.select_executor_workflow");
    expect(afterOutcome.allowedToolIds).not.toContain("router.report_ambiguity");
    expect(afterOutcome.allowedToolIds).not.toContain("router.submit_decision");
  });

  it("never routes accepted workflow classification into ambiguity before executor selection", () => {
    const runner = new RouterStageRunner();
    const afterRepeatedWorkflowRoute = runner.project({
      actions: [
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "implement_existing_system",
            requestedWorkKind: "implementation",
            expectedOutputKind: "changed files and validation evidence",
            confidence: 0.92,
          },
        },
        { tool: "router.set_route", input: { route: "workflow_execution" } },
      ],
      positiveRouteClassificationAttempts: 12,
    });

    expect(afterRepeatedWorkflowRoute.currentPhase).toBe("executor_selection_required");
    expect(afterRepeatedWorkflowRoute.allowedToolIds).toEqual(["router.select_executor_workflow"]);
    expect(afterRepeatedWorkflowRoute.allowedToolIds).not.toContain("router.report_ambiguity");
    expect(afterRepeatedWorkflowRoute.missingSemanticFields).toEqual(["executorWorkflow"]);
  });

  it("bounds native router tool calls by runner phase with latest valid value winning", () => {
    const runner = new RouterStageRunner();
    const projection = runner.project({ actions: [] });
    const bounded = runner.boundToolCallsForProjection({
      projection,
      toolCalls: [
        {
          canonicalToolId: "router.set_route",
          input: { route: "not-a-route" },
        },
        {
          canonicalToolId: "router.set_route",
          input: { route: "chat_response" },
        },
        {
          canonicalToolId: "router.classify_primary_outcome",
          input: {
            outcomeKind: "produce_plan",
            requestedWorkKind: "planning",
            expectedOutputKind: "plan",
            confidence: 0.7,
          },
        },
        {
          canonicalToolId: "router.set_route",
          input: { route: "workflow_execution" },
        },
        {
          canonicalToolId: "router.select_executor_workflow",
          input: { workflowId: "agent_team.coding", jobType: "executor.agent_team" },
        },
      ],
    });

    expect(bounded.acceptedToolCalls).toEqual([
      {
        canonicalToolId: "router.classify_primary_outcome",
        input: {
          outcomeKind: "produce_plan",
          requestedWorkKind: "planning",
          expectedOutputKind: "plan",
          confidence: 0.7,
        },
      },
      {
        canonicalToolId: "router.set_route",
        input: { route: "workflow_execution" },
      },
    ]);
    expect(bounded.reasonCodes).toContain("router_stage_runner_owned_tool_acceptance");
    expect(bounded.reasonCodes).toContain("router_stage_phase_bounded_tool_calls");
    expect(bounded.reasonCodes).toContain("router_stage_extracted_tool_count:5");
    expect(bounded.reasonCodes).toContain("router_stage_accepted_tool_count:2");
    expect(bounded.reasonCodes).toContain("router_stage_rejected_tool_count:3");
    expect(bounded.reasonCodes).toContain("router_stage_invalid_tool_input:router.set_route");
    expect(bounded.reasonCodes).toContain(
      "router_stage_tool_not_allowed_rejected:router.select_executor_workflow",
    );
    expect(bounded.reasonCodes).toContain(
      "router_stage_duplicate_tool_call_deduped:router.set_route",
    );
  });

  function providerContentResponse(output: unknown, status = 200): Response {
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

  it("builds provider-enforced native tool requests for the live OpenRouter router", () => {
    const request = buildLiveRouterModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: routerRequest(),
    });
    const body = buildOpenRouterIntentFrontDoorRouterToolBody({
      request,
      messages: [{ role: "user", content: buildRouterUserPayload(request) }],
    }) as RouterToolBody;

    expect(body).not.toHaveProperty("response_format");
    expect(body.tool_choice).toBe("required");
    expect(body.parallel_tool_calls).toBe(true);
    expect(body.reasoning).toMatchObject({ effort: "none", exclude: true });
    expect(body).not.toHaveProperty("provider");
    expect(body.tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(["router_classify_primary_outcome"]),
    );
    expect(body.tools.map((tool) => tool.function.name)).not.toContain(
      "router_select_executor_workflow",
    );
    expect(body.tools.map((tool) => tool.function.name)).not.toContain("router_submit_decision");
  });

  it("performs live calls only through injected fetch and compiles native tool calls", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerNativeToolResponse(routeClassificationNativeToolCalls()))
      .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
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

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      responseMode: "create_runtime_job",
    });
    expect(response.reasonCodes).toContain("openrouter_native_tool_loop_succeeded");
    expect(response.reasonCodes).toContain("openrouter_native_tool_protocol_used");
    expect(response.reasonCodes).toContain("openrouter_native_tool_parallel_enabled");
    expect(response.reasonCodes).toContain(
      "openrouter_native_tool_provider_require_parameters_omitted",
    );
    expect(response.reasonCodes).toContain(
      "openrouter_native_tool_speed_preference_not_provider_forced:latency",
    );
    expect(response.reasonCodes).toContain("router_stage_runner_owned_tool_surface");
    expect(response.reasonCodes).toContain("router_stage_phase:route_classification_required");
    expect(response.reasonCodes).toContain("router_stage_phase:executor_selection_required");
    expect(response.reasonCodes).toContain(
      "router_stage_selected_tool:router.select_executor_workflow",
    );
    expect(response.reasonCodes).toContain(
      "router_stage_selected_executor_workflow:agent_team.coding",
    );
    expect(response.responseHash).toMatch(/^sha256:/u);
    expect(response.rawPromptStored).toBe(false);
    expect(response.rawResponseStored).toBe(false);
    expect(response.rawProviderLogStored).toBe(false);
  });

  it("runs a bounded native tool loop until runner accepts the compiled route", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerNativeToolResponse(routeClassificationNativeToolCalls()))
      .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
      maxNativeToolTurns: 6,
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    const firstBodyText = fetchImpl.mock.calls[0]?.[1]?.body;
    expect(typeof firstBodyText).toBe("string");
    const firstBody = JSON.parse(firstBodyText as string);
    expect(firstBody.messages.at(-1)?.role).toBe("user");
    expect(
      firstBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).toContain("router_classify_primary_outcome");
    expect(
      firstBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).not.toContain("router_select_executor_workflow");
    expect(
      firstBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).not.toContain("router_report_ambiguity");
    expect(
      firstBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).not.toContain("router_submit_decision");
    const secondBodyText = fetchImpl.mock.calls[1]?.[1]?.body;
    expect(typeof secondBodyText).toBe("string");
    const secondBody = JSON.parse(secondBodyText as string);
    expect(
      secondBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).toEqual(["router_select_executor_workflow"]);
  });

  it("dedupes provider parallel tool floods before appending router state or tool history", async () => {
    const duplicateRouteCalls = Array.from({ length: 50 }, (_, index) =>
      index % 2 === 0
        ? {
            name: "router_classify_primary_outcome",
            arguments: {
              outcomeKind: "produce_plan",
              requestedWorkKind: "planning",
              expectedOutputKind: "plan",
              confidence: 0.51,
            },
          }
        : {
            name: "router_set_route",
            arguments: { route: "chat_response" },
          },
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        providerNativeToolResponse([
          ...duplicateRouteCalls,
          ...routeClassificationNativeToolCalls(),
        ]),
      )
      .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
      maxNativeToolTurns: 4,
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
    });
    expect(response.reasonCodes).toContain("router_stage_extracted_tool_count:52");
    expect(response.reasonCodes).toContain("router_stage_accepted_tool_count:2");
    expect(response.reasonCodes).toContain("router_stage_rejected_tool_count:50");
    expect(response.reasonCodes).toContain(
      "router_stage_duplicate_tool_call_deduped:router.classify_primary_outcome",
    );
    expect(response.reasonCodes).toContain(
      "router_stage_duplicate_tool_call_deduped:router.set_route",
    );
    expect(response.reasonCodes).toContain("router_stage_accumulated_tool_count:3");
    expect(response.reasonCodes).not.toContain("router_stage_accumulated_tool_count:53");

    const secondBodyText = fetchImpl.mock.calls[1]?.[1]?.body;
    expect(typeof secondBodyText).toBe("string");
    const secondBody = JSON.parse(secondBodyText as string);
    const echoedToolMessages = secondBody.messages.filter(
      (message: { role?: string }) => message.role === "tool",
    );
    expect(echoedToolMessages).toHaveLength(2);
    expect(JSON.stringify(secondBody.messages)).toContain("router_stage_accepted_tool_count:2");
    expect(JSON.stringify(secondBody.messages)).not.toContain('accumulatedToolCallCount":53');
  });

  it("feeds executor capability mismatch diagnostics back through the runner-owned tool loop", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerNativeToolResponse(routeClassificationNativeToolCalls()))
      .mockResolvedValueOnce(
        providerNativeToolResponse(architectureExecutorSelectionNativeToolCalls()),
      )
      .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
      maxNativeToolTurns: 4,
    });
    const clientRequest = buildLiveRouterModelClientRequest({
      policyDecision: policyDecision(),
      routerRequest: routerRequest(),
    });
    clientRequest.workflowSummaries = buildWorkflowSummaryIndex(
      DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      {
        generatedAt: "2026-05-06T00:00:00.000Z",
      },
    ).summaries;

    const response = await client.route(clientRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
    });
    expect(response.reasonCodes).toContain(
      "router_stage_selected_executor_workflow:agent_team.architecture",
    );
    expect(response.reasonCodes).toContain(
      "router_stage_selected_executor_workflow:agent_team.coding",
    );
    const thirdBodyText = fetchImpl.mock.calls[2]?.[1]?.body;
    expect(typeof thirdBodyText).toBe("string");
    const thirdBody = JSON.parse(thirdBodyText as string);
    expect(JSON.stringify(thirdBody.messages)).toContain(
      "router_executor_primary_outcome_capability_mismatch",
    );
    expect(
      thirdBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).toEqual(["router_select_executor_workflow"]);
  });

  it("does not accept JSON content as completed OpenRouter router output", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerContentResponse({ routerActions: [] }, 200));
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
    expect(response.status).toBe("no_content");
    expect(response.output).toBeNull();
    expect(response.reasonCodes).toContain("openrouter_tool_call_missing");
  });

  it("retries missing tool calls once and stores bounded retry evidence", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerContentResponse("", 200))
      .mockResolvedValueOnce(providerNativeToolResponse(routeClassificationNativeToolCalls()))
      .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
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

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(response.status).toBe("succeeded");
    expect(response.retryCount).toBe(1);
    expect(response.reasonCodes).toContain("openrouter_tool_call_missing");
  });

  it("retries 429 and 503 once", async () => {
    for (const status of [429, 503]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(providerContentResponse({ error: "retryable" }, status))
        .mockResolvedValueOnce(providerNativeToolResponse(routeClassificationNativeToolCalls()))
        .mockResolvedValueOnce(providerNativeToolResponse(executorSelectionNativeToolCalls()));
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

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(response.status).toBe("succeeded");
      expect(response.retryCount).toBe(1);
    }
  });

  it("accepts a complete compiled route without requiring a ceremonial submit tool", async () => {
    const responses = [
      providerNativeToolResponse(routeClassificationNativeToolCalls()),
      providerNativeToolResponse(executorSelectionNativeToolCalls()),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () => responses.shift() ?? responses.at(-1)!);
    const client = new OpenRouterIntentFrontDoorRouterClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: { maxAttempts: 1, timeoutMs: 1_000 },
      maxNativeToolTurns: 4,
    });

    const response = await client.route(
      buildLiveRouterModelClientRequest({
        policyDecision: policyDecision(),
        routerRequest: routerRequest(),
      }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe("succeeded");
    expect(response.output).toMatchObject({ route: "workflow_execution" });
    expect(response.reasonCodes).toContain("router_native_tool_runtime_accepted_compiled_route");
    expect(response.reasonCodes).not.toContain(
      "router_native_tool_loop_max_turns_without_accepted_route",
    );
  });
});
