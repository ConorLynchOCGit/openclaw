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
      const startedAt = Date.now();
      const response = await executor.execute(request);
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const modelRef = response.resolvedModelId ?? request.contract.modelId;
      const responseHash = sha256(response.outputText);
      const metadataBase = jsonObject(input.metadata);
      const metadata: ModelCallRuntimeToolMetadata = {
        artifactKind: "model_call_runtime_tool_metadata",
        modelRef,
        providerRef: input.providerRef ?? null,
        responseHash,
        usage: response.usage ?? null,
        structuredOutputStored: false,
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
        const structuredOutput = parseStructuredOutput(response.outputText);
        const maxStructuredOutputBytes = request.maxStructuredOutputBytes ?? 24_000;
        const outputBytes = boundedJsonBytes(structuredOutput);
        if (outputBytes > maxStructuredOutputBytes) {
          return {
            ...result,
            status: "needs_review",
            reasonCodes: [
              ...(result.reasonCodes ?? []),
              "model_call_structured_output_exceeds_bound",
            ],
            metadata: {
              ...(result.metadata as Record<string, JsonValue>),
              structuredOutputStored: false,
              structuredOutputBytes: outputBytes,
              maxStructuredOutputBytes,
            },
          };
        }
        return {
          ...result,
          metadata: {
            ...(result.metadata as Record<string, JsonValue>),
            structuredOutput,
            structuredOutputHash: `sha256:${sha256(JSON.stringify(structuredOutput))}`,
            structuredOutputStored: true,
            structuredOutputBytes: outputBytes,
          },
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
