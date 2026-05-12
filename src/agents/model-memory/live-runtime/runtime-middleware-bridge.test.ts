import { describe, expect, it } from "vitest";
import {
  modelMemoryContractToModelTaskContractId,
  shouldUseModelMemoryRuntimeMiddleware,
} from "./runtime-middleware-bridge.js";

describe("model memory runtime middleware bridge", () => {
  it("maps Model Memory model contracts to Execution Platform model-task contracts", () => {
    expect(modelMemoryContractToModelTaskContractId("retrieval_request_interpretation")).toBe(
      "retrieval.request_interpretation",
    );
    expect(modelMemoryContractToModelTaskContractId("retrieval_final_inclusion")).toBe(
      "retrieval.final_inclusion_review",
    );
    expect(modelMemoryContractToModelTaskContractId("phase2_proactivity_merge_adjudication")).toBe(
      "proactivity.merge_adjudication",
    );
    expect(modelMemoryContractToModelTaskContractId("phase2_skillifier_report")).toBe(
      "skillifier.structured_json",
    );
    expect(modelMemoryContractToModelTaskContractId("mmv2_semantic_capture")).toBe(
      "model_memory.capture_interpretation",
    );
  });

  it("keeps unit tests from making live runtime middleware calls", () => {
    expect(
      shouldUseModelMemoryRuntimeMiddleware({
        VITEST: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      shouldUseModelMemoryRuntimeMiddleware({
        OPENCLAW_MODEL_MEMORY_RUNTIME_MIDDLEWARE_DISABLED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
