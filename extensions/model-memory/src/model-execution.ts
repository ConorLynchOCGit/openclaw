import { z } from "zod";
import type { ModelContractMetadata } from "./prompt-contracts.ts";

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

export interface JsonModelExecutor {
  execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse>;
}

function stripOuterJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractStructuredJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return text.trim();
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
  const normalizedOutputText = extractStructuredJsonCandidate(
    stripOuterJsonCodeFence(response.outputText),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedOutputText);
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
