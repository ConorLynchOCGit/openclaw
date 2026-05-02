import { describe, expect, it } from "vitest";
import {
  createModelContractMetadata,
  MODEL_CONTRACT_NAMES,
  ModelContractMetadataSchema,
} from "./prompt-contracts.ts";

describe("prompt-contracts", () => {
  it("exposes the supported contract names", () => {
    expect(MODEL_CONTRACT_NAMES).toEqual([
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
  });

  it("accepts valid contract metadata", () => {
    const metadata = createModelContractMetadata({
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
    });

    expect(metadata.contractName).toBe("semantic_extraction");
  });

  it("rejects missing contract metadata fields", () => {
    const result = ModelContractMetadataSchema.safeParse({
      contractName: "semantic_extraction",
      contractVersion: "",
      modelId: "model-001",
    });

    expect(result.success).toBe(false);
  });
});
