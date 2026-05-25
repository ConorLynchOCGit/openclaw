#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildModelCallRuntimeToolDefinition,
  createModelCallRuntimeToolExecutor,
} from "../extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  MODEL_TASK_CLASSES,
  modelTaskPolicyFor,
  assertModelTaskPolicy,
} from "../extensions/execution-platform/src/model-tasks/model-task-classification.ts";

const artifactDir = path.resolve(".artifacts/execution-platform");
const artifactPath = path.join(artifactDir, "model-task-classification-proof.json");

const policies = MODEL_TASK_CLASSES.map((taskClass) => modelTaskPolicyFor(taskClass));
const resourceClassification = classifyModelTaskCall({
  taskClass: "resource_materialization",
  callSite: "proof.resource_materialization",
});
let resourceProviderBlocked = false;
try {
  assertModelTaskPolicy({
    classification: resourceClassification,
    providerCallRequested: true,
  });
} catch (error) {
  resourceProviderBlocked =
    error instanceof Error && error.message === "resource_materialization_provider_call_forbidden";
}

const modelTool = createModelCallRuntimeToolExecutor({
  async execute() {
    return {
      outputText: JSON.stringify({ proof: "ok" }),
      resolvedModelId: "qwen/qwen3-coder-next",
      usage: { promptTokens: 10, outputTokens: 3, cachedInputTokens: 0 },
    };
  },
});
const definition = buildModelCallRuntimeToolDefinition();
const modelCallResult = await modelTool.execute({
  definition,
  invocationId: "model-task-classification-proof",
  toolId: definition.toolId,
  toolVersion: definition.toolVersion,
  runtimeJobId: "proof-runtime-job",
  graphId: "proof-graph",
  nodeId: "proof-node",
  idempotencyScope: "model-task-classification-proof",
  idempotencyKey: "schema-normalization-model-call",
  inputSummary: "Run bounded model.call proof with schema_normalization task class.",
  metadata: {
    taskClass: "schema_normalization",
    callSite: "proof.schema_normalization_model_call",
    workflowId: "agent_team.coding",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  volatileInput: {
    contract: {
      contractName: "model_task_classification_proof",
      contractVersion: "v1",
      modelId: "qwen/qwen3-coder-next",
    },
    systemPrompt: "Return strict JSON.",
    userPrompt: "{}",
    responseFormat: "json",
  },
  rawPromptStored: false,
  rawResponseStored: false,
});

const proof = {
  artifactKind: "execution_platform.model_task_classification_proof",
  status:
    policies.length === MODEL_TASK_CLASSES.length &&
    resourceProviderBlocked &&
    modelCallResult.status === "succeeded"
      ? "passed"
      : "failed",
  policyCount: policies.length,
  taskClasses: MODEL_TASK_CLASSES,
  policies: policies.map((policy) => ({
    taskClass: policy.taskClass,
    modelPolicyRef: policy.modelPolicyRef,
    preferredModelRef: policy.preferredModelRef,
    providerPath: policy.providerPath,
    reasoningMode: policy.reasoningMode,
    parserMode: policy.parserMode,
    timeoutMs: policy.timeoutMs,
    softTimeoutMs: policy.softTimeoutMs,
    maxInputBytes: policy.maxInputBytes,
    maxOutputTokens: policy.maxOutputTokens,
    productionReadinessStatus: policy.productionReadinessStatus,
  })),
  resourceProviderBlocked,
  modelCallResultStatus: modelCallResult.status,
  modelCallMetadata: modelCallResult.metadata,
  telemetrySample: buildModelTaskTelemetryEnvelope({
    classification: classifyModelTaskCall({
      taskClass: "implementation_patch",
      callSite: "proof.implementation_patch",
    }),
    usageUnavailableReason: "proof_no_provider_call",
  }),
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
};

await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: proof.status, artifactPath }, null, 2));
if (proof.status !== "passed") {
  process.exitCode = 1;
}
