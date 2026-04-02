import { describe, expect, it, vi } from "vitest";
import type { CandidateReviewResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createCandidateReviewTool, normalizeCandidateReviewInput } from "./candidate-review.js";

function createRecordedResult(
  outcome: "accepted" | "rejected" | "needs_revision",
): CandidateReviewResult {
  return {
    accepted: true,
    status: "recorded",
    candidateId: "candidate-1",
    outcome,
    reviewId: "review-1",
    memoryObjectStateChanged: outcome !== "accepted",
    reviewState:
      outcome === "accepted" ? "candidate" : outcome === "rejected" ? "rejected" : "corrected",
  };
}

function createRuntime() {
  return {
    candidateReview: {
      review: vi.fn(async () => createRecordedResult("accepted")),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate review tool", () => {
  it("normalizes review payloads with trusted context fallback", () => {
    expect(
      normalizeCandidateReviewInput({
        rawParams: {
          candidateId: " candidate-1 ",
          outcome: "accepted",
          metadata: { source: "unit-test" },
        },
        context: {
          agentId: "agent-ctx",
        },
      }),
    ).toEqual({
      candidateId: "candidate-1",
      outcome: "accepted",
      reviewerAgentId: "agent-ctx",
      metadata: { source: "unit-test" },
    });
  });

  it("routes review outcomes through the candidate review seam", async () => {
    const runtime = createRuntime();
    runtime.candidateReview.review = vi.fn(async () => createRecordedResult("needs_revision"));
    const tool = createCandidateReviewTool({
      runtime,
      context: {
        agentId: "agent-ctx",
      },
    });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
      outcome: "needs_revision",
      rationale: "Needs more evidence before review can proceed.",
      metadata: { source: "unit-test" },
    });

    expect(runtime.candidateReview.review).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      outcome: "needs_revision",
      rationale: "Needs more evidence before review can proceed.",
      reviewerAgentId: "agent-ctx",
      metadata: { source: "unit-test" },
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createRecordedResult("needs_revision"), null, 2),
        },
      ],
      details: createRecordedResult("needs_revision"),
    });
  });

  it("surfaces invalid-state review results without side effects", async () => {
    const runtime = createRuntime();
    runtime.candidateReview.review = vi.fn(async () => ({
      accepted: false as const,
      status: "invalid_state" as const,
      reason: "candidate review requires candidate state, found rejected",
    }));
    const tool = createCandidateReviewTool({ runtime });

    const result = await tool.execute("call-2", {
      candidateId: "candidate-1",
      outcome: "rejected",
      rationale: "Already reviewed.",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "invalid_state",
      reason: "candidate review requires candidate state, found rejected",
    });
  });

  it("rejects invalid review payloads", () => {
    expect(() =>
      normalizeCandidateReviewInput({
        rawParams: {
          candidateId: "candidate-1",
          outcome: "approve",
        },
      }),
    ).toThrow("outcome must be one of");

    expect(() =>
      normalizeCandidateReviewInput({
        rawParams: {
          candidateId: "candidate-1",
          outcome: "needs_revision",
        },
      }),
    ).toThrow("rationale required");
  });
});
