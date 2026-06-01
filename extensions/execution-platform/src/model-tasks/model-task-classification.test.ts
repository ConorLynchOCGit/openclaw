import { describe, expect, it } from "vitest";
import { createModelCallRuntimeToolExecutor } from "./model-call-runtime-tool.ts";
import { buildModelCallRuntimeToolDefinition } from "./model-call-runtime-tool.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
  MODEL_TASK_CLASSES,
  modelContractBoundaryBindingFor,
  modelTaskPolicyFor,
  assertModelTaskPolicy,
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

  it("keeps runtime-owned resource materialization out of provider calls", () => {
    const classification = classifyModelTaskCall({
      taskClass: "resource_materialization",
      callSite: "implementation.compile_task_packet",
    });

    expect(classification.providerCallAllowed).toBe(false);
    expect(classification.selectedModelRef).toBeNull();
    expect(() => assertModelTaskPolicy({ classification, providerCallRequested: true })).toThrow(
      "resource_materialization_provider_call_forbidden",
    );
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
    const packetBinding = modelContractBoundaryBindingFor("obligation_semantic_content");
    expect(packetBinding).toMatchObject({
      boundaryId: "obligation_semantic_content",
      taskClass: "local_semantic_extraction",
      modelPolicyRef:
        "model-task-policy://local-semantic-extraction/qwen3-coder-next/obligation-semantic-content",
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      allowedToolFamily: "obligation.semantic_author",
      allowedOutputContractId: "obligation_semantic_brief",
      providerCallAllowed: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const materializationBinding = modelContractBoundaryBindingFor("resource_materialization");
    expect(materializationBinding).toMatchObject({
      taskClass: "resource_materialization",
      providerPath: "runtime_only",
      providerCallAllowed: false,
      allowedOutputContractId: "node_execution_packet",
    });

    const domainResourceSelectionBinding = modelContractBoundaryBindingFor(
      "domain_resource_selection",
    );
    expect(domainResourceSelectionBinding).toMatchObject({
      boundaryId: "domain_resource_selection",
      taskClass: "tool_selection",
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      allowedToolFamily: "resource.selection",
      allowedOutputContractId: "domain_resource_selection_packet",
      providerCallAllowed: true,
    });

    const contextNarrowingBinding = modelContractBoundaryBindingFor(
      "context_narrowing_selector",
    );
    expect(contextNarrowingBinding).toMatchObject({
      boundaryId: "context_narrowing_selector",
      taskClass: "tool_selection",
      preferredModelRef: "qwen/qwen3-coder-next",
      reasoningMode: "none",
      allowedToolFamily: "resource.scout.narrowing_selector",
      allowedOutputContractId: "resource_scout_exact_handle_tool_call",
      providerCallAllowed: true,
    });
  });

  it("preflights exact model-policy binding mismatches before provider calls", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "obligation.semantic_content",
    });

    const accepted = evaluateModelPolicyBindingPreflight({
      classification,
      actualAllowedToolFamily: "obligation.semantic_author",
      actualOutputContractId: "obligation_semantic_brief",
      actualOutputContractVersion: "v1",
      requestedInputBytes: 12_000,
      requestedTimeoutMs: 120_000,
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.modelPolicyBindingRef).toBe(
      "model-contract-boundary://obligation_semantic_content",
    );

    const blocked = evaluateModelPolicyBindingPreflight({
      classification,
      actualReasoningMode: "high",
      actualAllowedToolFamily: "scheduler.orchestrator_decision",
      actualOutputContractId: "runtime_work_graph_orchestrator_plan",
      requestedInputBytes: 40_000,
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
      callSite: "resource.scout.summary",
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
    expect(acceptedConcern.reasonCodes).toContain(
      "model_policy_provider_incident_owner_accepted",
    );
  });

  it("records policy exceptions without losing the semantic task class", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "obligation.gpt_rescue_author",
      overrideModelRef: "openai-codex/gpt-5.5",
      overrideReasonCode: "packet_author_rescue",
      overrideRationale: "Primary cheap lane failed to return usable content.",
    });

    expect(classification.taskClass).toBe("local_semantic_extraction");
    expect(classification.selectedModelRef).toBe("openai-codex/gpt-5.5");
    expect(classification.exception).toMatchObject({
      reasonCode: "packet_author_rescue",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(buildModelTaskTelemetryEnvelope({ classification })).toMatchObject({
      taskClass: "local_semantic_extraction",
      selectedModelRef: "openai-codex/gpt-5.5",
      rawPromptStored: false,
    });
  });

  it("applies call-site bounds for commitment packet semantic authoring without widening all local extraction calls", () => {
    const defaultClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "resource.scout.summary",
    });
    const packetClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "obligation.semantic_content",
    });

    expect(defaultClassification.timeoutMs).toBe(90_000);
    expect(defaultClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next",
    );
    expect(packetClassification.timeoutMs).toBe(180_000);
    expect(packetClassification.maxInputBytes).toBe(32_000);
    expect(packetClassification.maxOutputTokens).toBe(8_000);
    expect(packetClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next/obligation-semantic-content",
    );
    expect(packetClassification.reasonCodes).toContain(
      "model_task_call_site_bounds:obligation.semantic_content",
    );
    expect(packetClassification).toMatchObject({
      contractBoundaryId: "obligation_semantic_content",
      modelPolicyBindingRef: "model-contract-boundary://obligation_semantic_content",
      allowedToolFamily: "obligation.semantic_author",
      allowedOutputContractId: "obligation_semantic_brief",
    });
  });

  it("applies production mission-ledger bounds without widening ordinary local extraction", () => {
    const defaultClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "resource.scout.summary",
    });
    const missionLedgerClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "mission_ledger.production_single_pass",
    });

    expect(defaultClassification.timeoutMs).toBe(90_000);
    expect(defaultClassification.maxInputBytes).toBe(32_000);
    expect(missionLedgerClassification.timeoutMs).toBe(300_000);
    expect(missionLedgerClassification.softTimeoutMs).toBe(180_000);
    expect(missionLedgerClassification.maxInputBytes).toBe(64_000);
    expect(missionLedgerClassification.maxOutputTokens).toBe(8_000);
    expect(missionLedgerClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next/mission-ledger-production-single-pass",
    );
    expect(missionLedgerClassification.reasonCodes).toContain(
      "model_task_call_site_bounds:mission_ledger.production_single_pass",
    );

    const accepted = evaluateModelPolicyBindingPreflight({
      classification: missionLedgerClassification,
      requestedInputBytes: 31_001,
      requestedTimeoutMs: 300_000,
      requestedMaxOutputTokens: 8_000,
    });
    expect(accepted.accepted).toBe(true);
  });

  it("applies obligation graph authoring bounds without widening ordinary local extraction", () => {
    const defaultClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "resource.scout.summary",
    });
    const obligationClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "mission.obligation_graph_author",
    });

    expect(defaultClassification.timeoutMs).toBe(90_000);
    expect(obligationClassification.timeoutMs).toBe(120_000);
    expect(obligationClassification.softTimeoutMs).toBe(90_000);
    expect(obligationClassification.maxInputBytes).toBe(32_000);
    expect(obligationClassification.maxOutputTokens).toBe(8_000);
    expect(obligationClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next/mission-obligation-graph-author",
    );
    expect(obligationClassification.reasonCodes).toContain(
      "model_task_call_site_bounds:mission.obligation_graph_author",
    );

    const accepted = evaluateModelPolicyBindingPreflight({
      classification: obligationClassification,
      requestedInputBytes: 4_226,
      requestedTimeoutMs: 120_000,
      requestedMaxOutputTokens: 5_000,
    });
    expect(accepted.accepted).toBe(true);
  });

  it("preflights context narrowing as a first-class tool-selection boundary", () => {
    const classification = classifyModelTaskCall({
      taskClass: "tool_selection",
      callSite: "resource.scout.narrowing_selector",
    });

    expect(classification).toMatchObject({
      contractBoundaryId: "context_narrowing_selector",
      modelPolicyBindingRef: "model-contract-boundary://context_narrowing_selector",
      allowedToolFamily: "resource.scout.narrowing_selector",
      allowedOutputContractId: "resource_scout_exact_handle_tool_call",
      providerPath: "openrouter",
      reasoningMode: "none",
    });

    const accepted = evaluateModelPolicyBindingPreflight({
      classification,
      actualAllowedToolFamily: "resource.scout.narrowing_selector",
      actualOutputContractId: "resource_scout_exact_handle_tool_call",
      actualOutputContractVersion: "v1",
      requestedInputBytes: 12_653,
      requestedMaxOutputTokens: 2_400,
      requestedTimeoutMs: 60_000,
      proofMode: true,
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.reasonCodes).toContain("model_contract_boundary:context_narrowing_selector");
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
