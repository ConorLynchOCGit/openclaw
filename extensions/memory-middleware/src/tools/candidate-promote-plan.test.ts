import { describe, expect, it, vi } from "vitest";
import type { CandidatePromotionPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createCandidatePromotePlanTool,
  normalizeCandidatePromotionPlanInput,
} from "./candidate-promote-plan.js";

function createEligibleResult(): CandidatePromotionPlanResult {
  return {
    accepted: true,
    status: "ok",
    candidateId: "candidate-1",
    candidateKind: "learning",
    reviewState: "candidate",
    latestReviewOutcome: "accepted",
    eligible: true,
    possibleTargets: ["propose_memory_promotion", "remain_candidate_only"],
    rationale: [
      "candidate has an accepted review outcome",
      "this candidate kind can be considered for a future memory-promotion path",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "bounded memory promotion requires an explicit write tool invocation",
      "policy and review checks must pass before any future promotion write",
    ],
  };
}

function createRuntime() {
  return {
    candidatePromotionPlan: {
      plan: vi.fn(async () => createEligibleResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate promote-plan tool", () => {
  it("normalizes a promotion-planning payload", () => {
    expect(
      normalizeCandidatePromotionPlanInput({
        candidateId: " candidate-1 ",
      }),
    ).toEqual({
      candidateId: "candidate-1",
    });
  });

  it("routes planning requests through the candidate promotion-plan seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidatePromotePlanTool({ runtime });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
    });

    expect(runtime.candidatePromotionPlan.plan).toHaveBeenCalledWith({
      candidateId: "candidate-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createEligibleResult(), null, 2),
        },
      ],
      details: createEligibleResult(),
    });
  });

  it("surfaces ineligible planning results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: CandidatePromotionPlanResult = {
      accepted: true as const,
      status: "ok" as const,
      candidateId: "candidate-1",
      candidateKind: "procedure" as const,
      reviewState: "corrected" as const,
      latestReviewOutcome: "needs_revision" as const,
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: ["candidate has a needs-revision review outcome"],
      requiredGates: [
        "revise the candidate content",
        "record a fresh accepted review outcome before promotion planning",
      ],
    };
    runtime.candidatePromotionPlan.plan = vi.fn(async () => ineligibleResult);
    const tool = createCandidatePromotePlanTool({ runtime });

    const result = await tool.execute("call-2", {
      candidateId: "candidate-1",
    });

    expect(result.details).toEqual({
      ...ineligibleResult,
    });
  });

  it("rejects missing candidate ids", () => {
    expect(() =>
      normalizeCandidatePromotionPlanInput({
        candidateId: "   ",
      }),
    ).toThrow("candidateId required");
  });
});
