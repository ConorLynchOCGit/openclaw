import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
// HARDENED: Scheduler selection is gated on synthesis quality.
// The scheduler MUST NOT select an implementation graph unless the
// commitment work packet has:
//   synthesisQualityReviewed === true
//   synthesisQualityGatePassed === true
//   synthesisValidationStrategy.length > 0
//   synthesisImplementationGroups.length > 0
//   AND at least one context source is not runtime_supplied with
//   runtimeSuppliedRefRejected === false.
// This ensures implementation graph selection depends on substantive
// accepted context, not merely runtime-supplied refs.
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolExecutor,
  RuntimeToolExecutorInput,
  RuntimeToolExecutorResult,
} from "../runtime-tool-call/runtime-tool-types.ts";
import {
  assertModelTaskPolicy,
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  isModelTaskClass,
  type ModelTaskClassification,
} from "./model-task-classification.ts";
import {
  buildStructuredAdapterProviderProfile,
  classifyStructuredAdapterOutcome,
  structuredAdapterDiagnostics,
  structuredAdapterPreflight,
  type StructuredAdapterOutcome,
  type StructuredAdapterPreflight,
} from "./structured-tool-schema-adapter.ts";

export const MODEL_CALL_RUNTIME_TOOL_ID = "model.call";
export const MODEL_CALL_RUNTIME_TOOL_VERSION = "v1";

export type ModelCallJsonExecutor = {
  execute(request: {
    contract: {
      contractName: string;
      contractVersion: string;
      modelId: string;
    };
    systemPrompt: string;
    userPrompt: string;
    responseFormat: "json";
    responseOptions?: {
      transport?: {
        type: "json_schema";
        name: string;
        strict: boolean;
        schema: unknown;
      };
      maxOutputTokens?: number;
      reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      verbosity?: "low" | "medium" | "high";
    };
  }): Promise<{
    outputText: string;
    resolvedModelId?: string;
    usage?: {
      promptTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
    };
  }>;
};

export type ModelCallVolatileInput = Parameters<ModelCallJsonExecutor["execute"]>[0] & {
  parseJsonOutput?: boolean;
  maxStructuredOutputBytes?: number;
};

export type ModelCallRuntimeToolMetadata = {
  artifactKind: "model_call_runtime_tool_metadata";
  modelTaskClassification: ModelTaskClassification;
  modelTaskTelemetry: JsonValue;
  modelRef: string;
  providerRef: string | null;
  responseHash: string;
  usage: {
    promptTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  } | null;
  structuredOutput?: JsonValue;
  structuredOutputHash?: string;
  structuredOutputStored: boolean;
  structuredAdapterProfileRef: string;
  structuredAdapterPreflight: StructuredAdapterPreflight;
  structuredAdapterOutcome?: StructuredAdapterOutcome;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function usageJson(
  usage: Awaited<ReturnType<ModelCallJsonExecutor["execute"]>>["usage"] | undefined,
): JsonValue | null {
  if (!usage) {
    return null;
  }
  return {
    promptTokens: usage.promptTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    cachedInputTokens: usage.cachedInputTokens ?? null,
  };
}

function requireModelCallVolatileInput(input: RuntimeToolExecutorInput): ModelCallVolatileInput {
  const value = input.volatileInput;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("model_call_volatile_input_missing");
  }
  const record = value as Record<string, unknown>;
  const contract = record.contract as Record<string, unknown> | undefined;
  if (
    !contract ||
    typeof contract.contractName !== "string" ||
    typeof contract.contractVersion !== "string" ||
    typeof contract.modelId !== "string" ||
    typeof record.systemPrompt !== "string" ||
    typeof record.userPrompt !== "string" ||
    record.responseFormat !== "json"
  ) {
    throw new Error("model_call_volatile_input_invalid");
  }
  return record as ModelCallVolatileInput;
}

function modelTaskClassificationFromMetadata(
  input: RuntimeToolExecutorInput,
  request: ModelCallVolatileInput,
): ModelTaskClassification {
  const metadata = jsonObject(input.metadata);
  const existing = jsonObject(metadata.modelTaskClassification);
  if (
    existing.artifactKind === "model_task_classification" &&
    isModelTaskClass(existing.taskClass)
  ) {
    return existing as unknown as ModelTaskClassification;
  }
  const taskClass = isModelTaskClass(metadata.taskClass) ? metadata.taskClass : null;
  if (!taskClass) {
    throw new Error("model_call_task_classification_missing");
  }
  return classifyModelTaskCall({
    taskClass,
    callSite:
      typeof metadata.callSite === "string" ? metadata.callSite : request.contract.contractName,
    workflowId: typeof metadata.workflowId === "string" ? metadata.workflowId : null,
    graphId: typeof metadata.graphId === "string" ? metadata.graphId : null,
    nodeId: typeof metadata.nodeId === "string" ? metadata.nodeId : null,
    runtimeJobId: typeof input.runtimeJobId === "string" ? input.runtimeJobId : null,
    overrideModelRef: request.contract.modelId,
    overridePolicyRef:
      typeof metadata.overridePolicyRef === "string" ? metadata.overridePolicyRef : null,
    overrideReasonCode:
      typeof metadata.overrideReasonCode === "string" ? metadata.overrideReasonCode : null,
    overrideRationale:
      typeof metadata.overrideRationale === "string" ? metadata.overrideRationale : null,
  });
}

function parseStructuredOutput(outputText: string): JsonValue {
  const trimmed = outputText.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```(?:json)?\s*/iu, "")
        .replace(/\s*```$/iu, "")
        .trim()
    : trimmed;
  return JSON.parse(jsonText) as JsonValue;
}

function boundedJsonBytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function buildModelCallRuntimeToolDefinition() {
  return buildRuntimeToolDefinition({
    toolId: MODEL_CALL_RUNTIME_TOOL_ID,
    toolVersion: MODEL_CALL_RUNTIME_TOOL_VERSION,
    toolFamily: "model.call",
    executorKey: "model-task.runtime-tool.model-call-json-executor",
    schemaRef: "runtime-tool://model-call/structured-json/v1",
    authorityClass: "read_only",
    defaultTimeoutMs: 240_000,
    enabled: true,
    metadata: {
      artifactKind: "model_call_runtime_tool_definition",
      volatilePromptInputRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
}

export function createModelCallRuntimeToolExecutor(
  executor: ModelCallJsonExecutor,
): RuntimeToolExecutor {
  return {
    async execute(input) {
      const request = requireModelCallVolatileInput(input);
      const classification = modelTaskClassificationFromMetadata(input, request);
      assertModelTaskPolicy({ classification, providerCallRequested: true });
      const adapterProfile = buildStructuredAdapterProviderProfile(classification);
      const inputBytes = Buffer.byteLength(
        `${request.systemPrompt}\n${request.userPrompt}`,
        "utf8",
      );
      const preflight = structuredAdapterPreflight({
        profile: adapterProfile,
        inputBytes,
        requestedMaxOutputTokens:
          request.responseOptions?.maxOutputTokens ?? classification.maxOutputTokens,
        requestedTimeoutMs: input.budget?.timeoutMs ?? classification.timeoutMs,
      });
      if (!preflight.accepted) {
        return {
          status: "needs_review",
          outputRef: `runtime-tool-output://${input.invocationId ?? input.idempotencyKey}/model-call/preflight-blocked`,
          outputHash: `sha256:${sha256(JSON.stringify(preflight))}`,
          outputSummary:
            preflight.blockingReason ??
            "Structured adapter preflight blocked the model call before provider invocation.",
          reasonCodes: preflight.reasonCodes,
          metadata: {
            modelTaskClassification: classification,
            modelTaskTelemetry: buildModelTaskTelemetryEnvelope({
              classification,
              usage: null,
              usageUnavailableReason: "structured_adapter_preflight_blocked",
            }),
            structuredAdapterProfile: adapterProfile,
            structuredAdapterPreflight: preflight,
            structuredOutputStored: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      const startedAt = Date.now();
      const response = await executor.execute(request);
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const modelRef = response.resolvedModelId ?? request.contract.modelId;
      const responseHash = sha256(response.outputText);
      const metadataBase = jsonObject(input.metadata);
      const usage = usageJson(response.usage);
      const metadata: ModelCallRuntimeToolMetadata = {
        artifactKind: "model_call_runtime_tool_metadata",
        modelTaskClassification: classification,
        modelTaskTelemetry: buildModelTaskTelemetryEnvelope({
          classification,
          usage,
        }),
        modelRef,
        providerRef: input.providerRef ?? null,
        responseHash,
        usage: response.usage ?? null,
        structuredOutputStored: false,
        structuredAdapterProfileRef: adapterProfile.profileRef,
        structuredAdapterPreflight: preflight,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
      const result: RuntimeToolExecutorResult = {
        status: "succeeded",
        outputRef: `runtime-tool-output://${input.invocationId ?? input.idempotencyKey}/model-call`,
        outputHash: `sha256:${responseHash}`,
        outputSummary: `Model call completed with ${modelRef}; raw provider response was not stored.`,
        reasonCodes: ["model_call_runtime_tool_completed"],
        metadata: {
          ...metadataBase,
          ...metadata,
          latencyMs,
          taskClass: classification.taskClass,
          modelPolicyRef: classification.modelPolicyRef,
          reasoningMode: classification.reasoningMode,
          parserMode: classification.parserMode,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
      if (request.parseJsonOutput ?? true) {
        let structuredOutput: JsonValue;
        try {
          structuredOutput = parseStructuredOutput(response.outputText);
        } catch {
          const diagnostics = structuredAdapterDiagnostics({
            profile: adapterProfile,
            attempt: 1,
            latencyMs,
            content: response.outputText,
            errorReasonCode: "model_call_json_parse_failed",
            inputBytes,
            usage: response.usage ?? null,
          });
          const outcome = classifyStructuredAdapterOutcome({
            profile: adapterProfile,
            diagnostics,
            parsedJsonValid: false,
            schemaIssuePaths: ["root"],
          });
          return {
            ...result,
            status: "needs_review",
            outputSummary: outcome.operatorSummary,
            reasonCodes: [...(result.reasonCodes ?? []), ...outcome.reasonCodes],
            metadata: {
              modelTaskClassification: classification as unknown as JsonValue,
              modelTaskTelemetry: buildModelTaskTelemetryEnvelope({
                classification,
                usage,
              }),
              taskClass: classification.taskClass,
              modelPolicyRef: classification.modelPolicyRef,
              reasoningMode: classification.reasoningMode,
              parserMode: classification.parserMode,
              structuredAdapterProfile: adapterProfile as unknown as JsonValue,
              structuredAdapterPreflight: preflight as unknown as JsonValue,
              structuredAdapterOutcome: outcome as unknown as JsonValue,
              structuredOutputStored: false,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as unknown as JsonValue,
          };
        }
        const maxStructuredOutputBytes = request.maxStructuredOutputBytes ?? 24_000;
        const outputBytes = boundedJsonBytes(structuredOutput);
        if (outputBytes > maxStructuredOutputBytes) {
          const diagnostics = structuredAdapterDiagnostics({
            profile: adapterProfile,
            attempt: 1,
            latencyMs,
            content: response.outputText,
            errorReasonCode: "model_call_structured_output_exceeds_bound",
            inputBytes,
            usage: response.usage ?? null,
          });
          const outcome = classifyStructuredAdapterOutcome({
            profile: adapterProfile,
            diagnostics,
            parsedJsonValid: true,
            schemaIssuePaths: ["structuredOutput"],
          });
          return {
            ...result,
            status: "needs_review",
            reasonCodes: [
              ...(result.reasonCodes ?? []),
              "model_call_structured_output_exceeds_bound",
            ],
            metadata: {
              modelTaskClassification: classification as unknown as JsonValue,
              modelTaskTelemetry: buildModelTaskTelemetryEnvelope({
                classification,
                usage,
              }),
              taskClass: classification.taskClass,
              modelPolicyRef: classification.modelPolicyRef,
              reasoningMode: classification.reasoningMode,
              parserMode: classification.parserMode,
              structuredAdapterProfile: adapterProfile as unknown as JsonValue,
              structuredAdapterPreflight: preflight as unknown as JsonValue,
              structuredAdapterOutcome: outcome as unknown as JsonValue,
              structuredOutputStored: false,
              structuredOutputBytes: outputBytes,
              maxStructuredOutputBytes,
            } as unknown as JsonValue,
          };
        }
        return {
          ...result,
          metadata: {
            ...jsonObject(result.metadata),
            structuredOutput,
            structuredOutputHash: `sha256:${sha256(JSON.stringify(structuredOutput))}`,
            structuredOutputStored: true,
            structuredOutputBytes: outputBytes,
          } as unknown as JsonValue,
        };
      }
      return result;
    },
  };
}

export function registerModelCallRuntimeTool(input: {
  registry: RuntimeToolRegistry;
  executor: ModelCallJsonExecutor;
}): void {
  input.registry.register(
    buildModelCallRuntimeToolDefinition(),
    createModelCallRuntimeToolExecutor(input.executor),
  );
}

export function structuredOutputFromModelCallResult(
  result: RuntimeToolExecutorResult | null,
): JsonValue | null {
  const metadata = jsonObject(result?.metadata);
  return metadata.structuredOutput ?? null;
}

export function modelCallMetadataFromResult(
  result: RuntimeToolExecutorResult | null,
): ModelCallRuntimeToolMetadata | null {
  const metadata = jsonObject(result?.metadata);
  return metadata.artifactKind === "model_call_runtime_tool_metadata"
    ? (metadata as ModelCallRuntimeToolMetadata)
    : null;
}
