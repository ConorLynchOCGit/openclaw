import { describe, expect, it } from "vitest";
import { createDefaultModelTaskContractRegistry } from "./contracts.ts";
import {
  createModelTaskRoutePolicyFromRoster,
  resolveModelTaskRoster,
} from "./model-task-model-policy.ts";

describe("model-task model roster policy", () => {
  it("resolves GPT 5.4 for model-memory capture through policy-owned settings", () => {
    const decision = resolveModelTaskRoster({
      contractId: "model_memory.structured_json",
      preferredLane: "model_memory_capture",
    });

    expect(decision).toMatchObject({
      status: "resolved",
      selectedModelRef: "openai-codex/gpt-5.4",
      providerPath: "codex_app_server",
      providerCallMade: false,
      modelPromotionPerformed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(decision.settings?.maxOutputTokens).toBeGreaterThan(2_000);
  });

  it("resolves Kimi, DeepSeek V4 Flash, and DeepSeek V4 Pro for role-shaped lanes", () => {
    expect(
      resolveModelTaskRoster({
        contractId: "skillifier.structured_json",
        preferredLane: "implementation_engineer",
      }).selectedModelRef,
    ).toBe("moonshotai/kimi-k2.6");
    expect(
      resolveModelTaskRoster({
        contractId: "retrieval.structured_json",
        preferredLane: "retrieval_interpretation",
      }).selectedModelRef,
    ).toBe("deepseek/deepseek-v4-flash");
    expect(
      resolveModelTaskRoster({
        contractId: "outcome_pack_review.structured_json",
        preferredLane: "reviewer",
        requestedModelRef: "deepseek/deepseek-v4-pro",
      }).selectedModelRef,
    ).toBe("deepseek/deepseek-v4-pro");
  });

  it("records exact provider config blockers without provider calls", () => {
    const decision = resolveModelTaskRoster({
      contractId: "skillifier.structured_json",
      preferredLane: "implementation_engineer",
      providerSecrets: { openrouter: false },
    });

    expect(decision).toMatchObject({
      status: "blocked",
      selectedModelRef: null,
      providerCallMade: false,
    });
    expect(decision.reasonCodes).toContain("model_task_provider_config_missing:openrouter");
  });

  it("feeds default model-task contracts with roster-owned route policy", () => {
    const registry = createDefaultModelTaskContractRegistry();
    const contract = registry.require("retrieval.structured_json");
    const policy = createModelTaskRoutePolicyFromRoster({
      contractId: "retrieval.structured_json",
    });

    expect(contract.routePolicy.priority).toEqual(policy.priority);
    expect(contract.routePolicy.priority).toContain("deepseek/deepseek-v4-flash");
    expect(contract.routePolicy.approvedModels.map((candidate) => candidate.model)).toContain(
      "openai-codex/gpt-5.4-mini",
    );
  });

  it("resolves the explicit memory/runtime wiring contracts through middleware roster lanes", () => {
    const cases = [
      ["model_memory.capture_interpretation", "model_memory_capture_interpretation"],
      ["retrieval.request_interpretation", "retrieval_interpretation"],
      ["retrieval.final_inclusion_review", "retrieval_final_inclusion_review"],
      ["proactivity.opportunity_extraction", "proactivity"],
      ["proactivity.merge_adjudication", "proactivity_merge_adjudication"],
      ["closeout.opportunity_seed_extraction", "closeout_opportunity_seed_extraction"],
    ] as const;

    const registry = createDefaultModelTaskContractRegistry();
    for (const [contractId, expectedLane] of cases) {
      const contract = registry.require(contractId);
      const decision = resolveModelTaskRoster({ contractId });

      expect(contract.id).toBe(contractId);
      expect(decision.status).toBe("resolved");
      expect(decision.lane).toBe(expectedLane);
      expect(decision.providerCallMade).toBe(false);
      expect(decision.rawPromptStored).toBe(false);
      expect(decision.rawResponseStored).toBe(false);
      expect(decision.workQueueLifecycleMutated).toBe(false);
    }
  });
});
