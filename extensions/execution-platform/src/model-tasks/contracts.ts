import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import { createModelTaskRoutePolicyFromRoster } from "./model-task-model-policy.ts";
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
    routePolicy: createModelTaskRoutePolicyFromRoster({ contractId: id }),
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
    "model_memory.capture_interpretation",
    "Structured JSON contract for Model Memory capture interpretation through model-task middleware.",
  ),
  structuredJsonContract(
    "retrieval.structured_json",
    "Structured JSON contract for future retrieval model tasks.",
  ),
  structuredJsonContract(
    "retrieval.request_interpretation",
    "Structured JSON contract for retrieval request interpretation through model-task middleware.",
  ),
  structuredJsonContract(
    "retrieval.final_inclusion_review",
    "Structured JSON contract for retrieval final inclusion review through model-task middleware.",
  ),
  structuredJsonContract(
    "proactivity.structured_json",
    "Structured JSON contract for future proactivity model tasks.",
  ),
  structuredJsonContract(
    "proactivity.opportunity_extraction",
    "Structured JSON contract for proactivity opportunity extraction through model-task middleware.",
  ),
  structuredJsonContract(
    "proactivity.merge_adjudication",
    "Structured JSON contract for proactivity merge adjudication through model-task middleware.",
  ),
  structuredJsonContract(
    "skillifier.structured_json",
    "Structured JSON contract for future skillifier model tasks.",
  ),
  structuredJsonContract(
    "closeout.opportunity_seed_extraction",
    "Structured JSON contract for extracting Closeout Capsule opportunity seeds through model-task middleware.",
  ),
  structuredJsonContract(
    "outcome_pack_review.structured_json",
    "Structured JSON contract for future outcome-pack review model tasks.",
  ),
];

export function createDefaultModelTaskContractRegistry(): ModelTaskContractRegistry {
  return new ModelTaskContractRegistry(INITIAL_MODEL_TASK_CONTRACTS);
}

export { StructuredJsonInputSchema, StructuredJsonOutputSchema, structuredJsonContract };
