import { describe, expect, it } from "vitest";
import { createModelCallRuntimeToolExecutor } from "./model-call-runtime-tool.ts";
import { buildModelCallRuntimeToolDefinition } from "./model-call-runtime-tool.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  MODEL_TASK_CLASSES,
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

  it("records policy exceptions without losing the semantic task class", () => {
    const classification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "commitment_packet.gpt_rescue_author",
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
      callSite: "context_scout.summary",
    });
    const packetClassification = classifyModelTaskCall({
      taskClass: "local_semantic_extraction",
      callSite: "commitment_packet.semantic_content",
    });

    expect(defaultClassification.timeoutMs).toBe(90_000);
    expect(defaultClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next",
    );
    expect(packetClassification.timeoutMs).toBe(180_000);
    expect(packetClassification.maxInputBytes).toBe(32_000);
    expect(packetClassification.maxOutputTokens).toBe(8_000);
    expect(packetClassification.modelPolicyRef).toBe(
      "model-task-policy://local-semantic-extraction/qwen3-coder-next/commitment-packet-semantic-content",
    );
    expect(packetClassification.reasonCodes).toContain(
      "model_task_call_site_bounds:commitment_packet.semantic_content",
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
