import { z } from "zod";
import type { ModelContractMetadata } from "./prompt-contracts.ts";
import { parseStructuredJsonCandidate } from "./structured-json.ts";

export const JsonModelResponseTransportSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("json_object"),
    })
    .strict(),
  z
    .object({
      type: z.literal("json_schema"),
      name: z.string().trim().min(1),
      strict: z.boolean().optional(),
      schema: z.unknown(),
    })
    .strict(),
]);

export type JsonModelResponseTransport = z.infer<typeof JsonModelResponseTransportSchema>;

export const JsonModelProviderOptionsSchema = z
  .object({
    requireParameters: z.boolean().optional(),
  })
  .strict();

export type JsonModelProviderOptions = z.infer<typeof JsonModelProviderOptionsSchema>;

export const JsonModelPromptCacheOptionsSchema = z
  .object({
    key: z.string().trim().min(1).optional(),
    retention: z.enum(["ephemeral", "short", "long"]).optional(),
  })
  .strict();

export type JsonModelPromptCacheOptions = z.infer<typeof JsonModelPromptCacheOptionsSchema>;

export const JsonModelReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export type JsonModelReasoningEffort = z.infer<typeof JsonModelReasoningEffortSchema>;

export const JsonModelExecutionResponseOptionsSchema = z
  .object({
    transport: JsonModelResponseTransportSchema.optional(),
    provider: JsonModelProviderOptionsSchema.optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    promptCache: JsonModelPromptCacheOptionsSchema.optional(),
    reasoningEffort: JsonModelReasoningEffortSchema.optional(),
    verbosity: z.enum(["low", "medium", "high"]).optional(),
    serviceTier: z.string().trim().min(1).optional(),
  })
  .strict();

export type JsonModelExecutionResponseOptions = z.infer<
  typeof JsonModelExecutionResponseOptionsSchema
>;

export const JsonModelExecutionRequestSchema = z
  .object({
    contract: z.object({
      contractName: z.string().trim().min(1),
      contractVersion: z.string().trim().min(1),
      modelId: z.string().trim().min(1),
    }),
    systemPrompt: z.string(),
    userPrompt: z.string(),
    responseFormat: z.literal("json"),
    responseOptions: JsonModelExecutionResponseOptionsSchema.optional(),
  })
  .strict();

export type JsonModelExecutionRequest = z.infer<typeof JsonModelExecutionRequestSchema>;

export const JsonModelExecutionResponseSchema = z
  .object({
    outputText: z.string().trim().min(1),
    resolvedModelId: z.string().trim().min(1).optional(),
    usage: z
      .object({
        promptTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
        cachedInputTokens: z.number().int().nonnegative().optional(),
        promptCacheKey: z.string().trim().min(1).optional(),
        prefixHash: z.string().trim().min(1).optional(),
        schemaHash: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type JsonModelExecutionResponse = z.infer<typeof JsonModelExecutionResponseSchema>;

export const JsonModelToolDefinitionSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    inputSchema: z.unknown(),
  })
  .strict();

export type JsonModelToolDefinition = z.infer<typeof JsonModelToolDefinitionSchema>;

export const JsonModelToolExecutionRequestSchema = JsonModelExecutionRequestSchema.extend({
  responseFormat: z.literal("json"),
  tools: z.array(JsonModelToolDefinitionSchema).min(1).max(16),
  requiredToolName: z.string().trim().min(1).optional(),
  allowedToolNames: z.array(z.string().trim().min(1)).min(1).max(16).optional(),
}).strict();

export type JsonModelToolExecutionRequest = z.infer<typeof JsonModelToolExecutionRequestSchema>;

export const JsonModelToolTurnExecutionRequestSchema = JsonModelToolExecutionRequestSchema.extend({
  maxAcceptedToolCalls: z.number().int().positive().max(64).optional(),
}).strict();

export type JsonModelToolTurnExecutionRequest = z.infer<
  typeof JsonModelToolTurnExecutionRequestSchema
>;

export const JsonModelToolTurnExecutionResponseSchema = z
  .object({
    toolCalls: z
      .array(
        z
          .object({
            toolName: z.string().trim().min(1),
            toolArguments: z.unknown(),
            callId: z.string().trim().min(1).nullable(),
          })
          .strict(),
      )
      .min(1),
    resolvedModelId: z.string().trim().min(1).optional(),
    outputText: z.string().trim().min(1).optional(),
    usage: JsonModelExecutionResponseSchema.shape.usage.optional(),
  })
  .strict();

export type JsonModelToolTurnExecutionResponse = z.infer<
  typeof JsonModelToolTurnExecutionResponseSchema
>;

export interface JsonModelExecutor {
  execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse>;
  executeTools?(
    request: JsonModelToolTurnExecutionRequest,
  ): Promise<JsonModelToolTurnExecutionResponse>;
}

export class JsonModelOutputError extends Error {
  constructor(
    message: string,
    readonly contract: ModelContractMetadata,
    readonly outputText: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "JsonModelOutputError";
  }
}

export function parseJsonModelOutput<T>(
  response: JsonModelExecutionResponse,
  contract: ModelContractMetadata,
  schema: z.ZodType<T>,
): T {
  let parsed: unknown;
  try {
    parsed = parseStructuredJsonCandidate(response.outputText);
  } catch (error) {
    throw new JsonModelOutputError(
      `invalid JSON model output for ${contract.contractName}`,
      contract,
      response.outputText,
      { cause: error },
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new JsonModelOutputError(
      `invalid structured output for ${contract.contractName}`,
      contract,
      response.outputText,
      { cause: result.error },
    );
  }
  return result.data;
}
