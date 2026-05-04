import { z } from "zod";
import { createModelRoutePolicyForContract } from "../model-routing/policy.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import { ModelTaskContractRegistry } from "./registry.ts";
import type { ModelTaskContract, ModelTaskContractId } from "./types.ts";

const JsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
  ]),
);

const StructuredJsonInputSchema = z
  .object({
    task: z.string().min(1),
    input: z.record(z.string(), JsonSchema).default({}),
    instructions: z.string().min(1).optional(),
    constraints: z.array(z.string().min(1)).default([]),
  })
  .strict();

const StructuredJsonOutputSchema = z
  .object({
    result: JsonSchema,
    confidence: z.enum(["low", "medium", "high"]).optional(),
    evidence: z.array(z.string().min(1)).default([]),
  })
  .strict();

function structuredJsonContract(id: ModelTaskContractId, description: string): ModelTaskContract {
  return {
    id,
    description,
    inputSchema: StructuredJsonInputSchema,
    outputSchema: StructuredJsonOutputSchema,
    routePolicy: createModelRoutePolicyForContract(id),
    scorecard: {
      status: "placeholder",
      notes:
        "Slice 3 records deterministic scorecard/eval evidence only; live model evals are deferred.",
    },
  };
}

export const INITIAL_MODEL_TASK_CONTRACTS: ModelTaskContract[] = [
  structuredJsonContract(
    "model_memory.structured_json",
    "Structured JSON contract for future Model Memory model tasks.",
  ),
  structuredJsonContract(
    "retrieval.structured_json",
    "Structured JSON contract for future retrieval model tasks.",
  ),
  structuredJsonContract(
    "proactivity.structured_json",
    "Structured JSON contract for future proactivity model tasks.",
  ),
  structuredJsonContract(
    "skillifier.structured_json",
    "Structured JSON contract for future skillifier model tasks.",
  ),
  structuredJsonContract(
    "outcome_pack_review.structured_json",
    "Structured JSON contract for future outcome-pack review model tasks.",
  ),
];

export function createDefaultModelTaskContractRegistry(): ModelTaskContractRegistry {
  return new ModelTaskContractRegistry(INITIAL_MODEL_TASK_CONTRACTS);
}
