import { z } from "zod";

export const ModelContractNameSchema = z.enum([
  "semantic_extraction",
  "semantic_collision_adjudication",
  "retrieval_request_interpretation",
  "retrieval_final_inclusion",
  "retrieval_reranking",
  "session_summary_generation",
  "candidate_review_trigger",
  "candidate_review_proposal",
  "phase2_proactivity_merge_adjudication",
]);

export type ModelContractName = z.infer<typeof ModelContractNameSchema>;

export const ModelContractMetadataSchema = z
  .object({
    contractName: ModelContractNameSchema,
    contractVersion: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
  })
  .strict();

export type ModelContractMetadata = z.infer<typeof ModelContractMetadataSchema>;

export const MODEL_CONTRACT_NAMES = ModelContractNameSchema.options;

export function createModelContractMetadata(input: ModelContractMetadata): ModelContractMetadata {
  return ModelContractMetadataSchema.parse(input);
}
