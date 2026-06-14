import { describe, expect, it } from "vitest";
import { createModelCallRuntimeToolExecutor } from "./model-call-runtime-tool.ts";
import { buildModelCallRuntimeToolDefinition } from "./model-call-runtime-tool.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
  MODEL_CONTRACT_BOUNDARIES,
  MODEL_TASK_CLASSES,
  modelContractBoundaryBindingFor,
  modelTaskPolicyFor,
} from "./model-task-classification.ts";

describe("model task classification and utility policy", () => {
  it("maps every canonical task class to an explicit production policy", () => {
    for (const taskClass of MODEL_TASK_CLASSES) {
      const policy = modelTaskPolicyFor(taskClass);
      expect(policy.taskClass).toBe(taskClass);
      expect(policy.modelPolicyRef).toMatch(/^model-task-policy:\/\//u);
      expect(policy.productionReadinessStatus).toBe("production_primary");
      expect(policy.rawPromptStored).toBe(false);
      expect(policy.rawResponseStored).toBe(false);
    }
  });

  it("does not keep retired resource materialization as a model-task compatibility path", () => {
    expect(MODEL_TASK_CLASSES).not.toContain("resource_materialization");
    for (const boundaryId of [
      "context_narrowing_selector",
      "resource_requirement_compile",
      "context_scout_handoff",
      "domain_resource_selection",
      "resource_materialization",
      "requirement_map_native_tool",
    ]) {
      expect(MODEL_CONTRACT_BOUNDARIES).not.toContain(boundaryId);
    }
  });

  it("routes global reasoning, schema normalization, patching, validation, and closeout distinctly", () => {
    expect(modelTaskPolicyFor("global_reasoning")).toMatchObject({
      preferredModelRef: "openai-codex/gpt-5.5",
      reasoningMode: "xhigh",
      providerPath: "codex_app_server",
    });
    expect(modelTaskPolicyFor("schema_normalization")).toMatchObject({
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      parserMode: "field_patch_json",
    });
    expect(modelTaskPolicyFor("implementation_patch")).toMatchObject({
      preferredModelRef: "moonshotai/kimi-k2.6",
      reasoningMode: "none",
    });
    expect(modelTaskPolicyFor("validation_classification")).toMatchObject({
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
    });
    expect(modelTaskPolicyFor("closeout_judgment")).toMatchObject({
      preferredModelRef: "openai-codex/gpt-5.5",
      reasoningMode: "xhigh",
    });
  });

  it("binds exact contract boundaries to task class, model policy, and output contracts", () => {
    const sourcePromptBinding = modelContractBoundaryBindingFor(
      "source_prompt_excerpt_interpretation",
    );
    expect(sourcePromptBinding).toMatchObject({
      boundaryId: "source_prompt_excerpt_interpretation",
      taskClass: "local_semantic_extraction",
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      allowedToolFamily: "source_prompt.excerpt_interpretation",
      allowedOutputContractId: "source_prompt_excerpt_interpretation",
      providerCallAllowed: true,
    });
  });

  it("preflights exact model-policy binding mismatches before provider calls", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "source_prompt.excerpt_interpretation",
    });

    const accepted = evaluateModelPolicyBindingPreflight({
      classification,
      actualAllowedToolFamily: "source_prompt.excerpt_interpretation",
      actualOutputContractId: "source_prompt_excerpt_interpretation",
      actualOutputContractVersion: "v1",
      requestedInputBytes: 12_000,
      requestedTimeoutMs: 90_000,
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.modelPolicyBindingRef).toBe(
      "model-contract-boundary://source_prompt_excerpt_interpretation",
    );

    const blocked = evaluateModelPolicyBindingPreflight({
      classification,
      actualReasoningMode: "high",
      actualAllowedToolFamily: "scheduler.orchestrator_decision",
      actualOutputContractId: "runtime_work_graph_orchestrator_plan",
      requestedInputBytes: 100_000,
      requestedTimeoutMs: 240_000,
    });

    expect(blocked.accepted).toBe(false);
    expect(blocked.mismatches.map((mismatch) => mismatch.reasonCode)).toEqual(
      expect.arrayContaining([
        "model_policy_reasoning_mode_mismatch",
        "model_policy_allowed_tool_family_mismatch",
        "model_policy_output_contract_mismatch",
        "model_policy_timeout_exceeds_bound",
        "model_policy_input_exceeds_bound",
      ]),
    );
  });

  it("makes proof-mode rescue and escalation visible instead of silently clean", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "context.scout.summary",
    });

    const blocked = evaluateModelPolicyBindingPreflight({
      classification,
      proofMode: true,
      rescueCount: 1,
      escalationCount: 1,
      ownerAcceptedProviderIncident: false,
    });
    expect(blocked.accepted).toBe(false);
    expect(blocked.proofCleanliness).toMatchObject({
      state: "blocked",
      rescueCount: 1,
      escalationCount: 1,
      ownerAcceptedProviderIncident: false,
    });
    expect(blocked.reasonCodes).toContain("model_policy_rescue_requires_owner_acceptance");

    const acceptedConcern = evaluateModelPolicyBindingPreflight({
      classification,
      proofMode: true,
      rescueCount: 1,
      ownerAcceptedProviderIncident: true,
    });
    expect(acceptedConcern.accepted).toBe(true);
    expect(acceptedConcern.proofCleanliness.state).toBe("concern");
    expect(acceptedConcern.reasonCodes).toContain("model_policy_provider_incident_owner_accepted");
  });

  it("records policy exceptions without losing the semantic task class", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "source_prompt.rescue_author",
      overrideModelRef: "openai-codex/gpt-5.5",
      overrideReasonCode: "source_prompt_author_rescue",
      overrideRationale: "Primary cheap lane failed to return usable content.",
    });

    expect(classification.taskClass).toBe("local_semantic_extraction");
    expect(classification.selectedModelRef).toBe("openai-codex/gpt-5.5");
    expect(classification.exception).toMatchObject({
      reasonCode: "source_prompt_author_rescue",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(buildModelTaskTelemetryEnvelope({ classification })).toMatchObject({
      taskClass: "local_semantic_extraction",
      selectedModelRef: "openai-codex/gpt-5.5",
      rawPromptStored: false,
    });
  });

  it("does not keep retired context narrowing as a model-contract boundary", () => {
    const classification = classifyModelTaskCall({
      taskClass: "tool_selection",
      callSite: "resource.scout.narrowing_selector",
    });

    expect(classification).toMatchObject({
      contractBoundaryId: null,
      modelPolicyBindingRef: null,
      allowedToolFamily: null,
      allowedOutputContractId: null,
      providerPath: "openrouter",
      reasoningMode: "none",
    });
    expect(classification.reasonCodes).not.toContain(
      "model_contract_boundary:context_narrowing_selector",
    );
  });

  it("requires model.call invocations to carry task classification metadata", async () => {
    const executor = createModelCallRuntimeToolExecutor({
      async execute() {
        return {
          outputText: JSON.stringify({ ok: true }),
          resolvedModelId: "qwen/qwen3-coder-next",
          usage: { promptTokens: 12, outputTokens: 4 },
        };
      },
    });
    const definition = buildModelCallRuntimeToolDefinition();

    await expect(
      executor.execute({
        definition,
        invocationId: "inv-missing",
        toolId: definition.toolId,
        toolVersion: definition.toolVersion,
        idempotencyScope: "test",
        idempotencyKey: "missing",
        inputSummary: "Missing task class.",
        volatileInput: {
          contract: { contractName: "missing", contractVersion: "v1", modelId: "model" },
          systemPrompt: "system",
          userPrompt: "{}",
          responseFormat: "json",
        },
        rawPromptStored: false,
        rawResponseStored: false,
      }),
    ).rejects.toThrow("model_call_task_classification_missing");

    const result = await executor.execute({
      definition,
      invocationId: "inv-ok",
      toolId: definition.toolId,
      toolVersion: definition.toolVersion,
      runtimeJobId: "job-1",
      graphId: "graph-1",
      nodeId: "node-1",
      idempotencyScope: "test",
      idempotencyKey: "ok",
      inputSummary: "Schema normalize.",
      metadata: {
        taskClass: "schema_normalization",
        callSite: "test.schema_normalization",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      volatileInput: {
        contract: {
          contractName: "schema",
          contractVersion: "v1",
          modelId: "qwen/qwen3-coder-next",
        },
        systemPrompt: "system",
        userPrompt: "{}",
        responseFormat: "json",
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(result.status).toBe("succeeded");
    expect(result.metadata).toMatchObject({
      taskClass: "schema_normalization",
      modelPolicyRef: "model-task-policy://schema-normalization/qwen3-coder-next",
      reasoningMode: "none",
      structuredAdapterProfileRef: expect.stringContaining(
        "structured-adapter-profile://schema_normalization",
      ),
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("model.call terminalizes schema parse failures as field repair diagnostics", async () => {
    const executor = createModelCallRuntimeToolExecutor({
      async execute() {
        return {
          outputText: "not json",
          resolvedModelId: "qwen/qwen3-coder-next",
          usage: { promptTokens: 12, outputTokens: 4 },
        };
      },
    });
    const definition = buildModelCallRuntimeToolDefinition();

    const result = await executor.execute({
      definition,
      invocationId: "inv-parse-fail",
      toolId: definition.toolId,
      toolVersion: definition.toolVersion,
      idempotencyScope: "test",
      idempotencyKey: "parse-fail",
      inputSummary: "Schema normalize.",
      metadata: {
        taskClass: "schema_normalization",
        callSite: "test.schema_normalization.parse_fail",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      volatileInput: {
        contract: {
          contractName: "schema",
          contractVersion: "v1",
          modelId: "qwen/qwen3-coder-next",
        },
        systemPrompt: "system",
        userPrompt: "{}",
        responseFormat: "json",
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(result.status).toBe("needs_review");
    expect(result.metadata).toMatchObject({
      structuredOutputStored: false,
      structuredAdapterOutcome: {
        status: "needs_field_specific_schema_repair",
        schemaRepairRequired: true,
        missingFieldPaths: ["root"],
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("model.call preflight blocks oversized fast-model schema work before provider invocation", async () => {
    let providerCalls = 0;
    const executor = createModelCallRuntimeToolExecutor({
      async execute() {
        providerCalls += 1;
        return {
          outputText: JSON.stringify({ ok: true }),
          resolvedModelId: "qwen/qwen3-coder-next",
        };
      },
    });
    const definition = buildModelCallRuntimeToolDefinition();

    const result = await executor.execute({
      definition,
      invocationId: "inv-oversized",
      toolId: definition.toolId,
      toolVersion: definition.toolVersion,
      idempotencyScope: "test",
      idempotencyKey: "oversized",
      inputSummary: "Oversized schema normalization.",
      metadata: {
        taskClass: "schema_normalization",
        callSite: "test.schema_normalization.oversized",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      volatileInput: {
        contract: {
          contractName: "schema",
          contractVersion: "v1",
          modelId: "qwen/qwen3-coder-next",
        },
        systemPrompt: "system",
        userPrompt: "x".repeat(24_100),
        responseFormat: "json",
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(providerCalls).toBe(0);
    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("structured_adapter_input_exceeds_policy_bound");
    expect(result.metadata).toMatchObject({
      structuredAdapterPreflight: {
        accepted: false,
        inputBytes: expect.any(Number),
        rawPromptStored: false,
      },
      structuredOutputStored: false,
      rawResponseStored: false,
    });
  });
});
