import { describe, expect, it, vi } from "vitest";
import type { CandidateMemoryPromotionResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createCandidatePromoteMemoryTool,
  normalizeCandidateMemoryPromotionInput,
} from "./candidate-promote-memory.js";

function createPromotionResult(): CandidateMemoryPromotionResult {
  return {
    accepted: true,
    status: "promoted",
    candidateId: "candidate-1",
    promotedMemoryObjectId: "memory-1",
    promotedMemoryKind: "project",
    promotedReviewState: "approved",
    sourceEventId: "event-1",
  };
}

function createRuntime() {
  return {
    candidatePromotion: {
      promoteToMemory: vi.fn(async () => createPromotionResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate promote-memory tool", () => {
  it("normalizes a promotion payload", () => {
    expect(
      normalizeCandidateMemoryPromotionInput({
        rawParams: {
          candidateId: " candidate-1 ",
          rationale: " accepted after manual review ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      candidateId: "candidate-1",
      rationale: "accepted after manual review",
      promoterAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes memory-promotion requests through the candidate promotion seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidatePromoteMemoryTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
      rationale: "Manual memory promotion approved.",
    });

    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      rationale: "Manual memory promotion approved.",
      promoterAgentId: "agent-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createPromotionResult(), null, 2),
        },
      ],
      details: createPromotionResult(),
    });
  });

  it("surfaces ineligible promotion results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: CandidateMemoryPromotionResult = {
      accepted: false,
      status: "ineligible",
      reason: "procedure candidates are not eligible for bounded memory promotion",
    };
    runtime.candidatePromotion.promoteToMemory = vi.fn(async () => ineligibleResult);
    const tool = createCandidatePromoteMemoryTool({ runtime });

    const result = await tool.execute("call-2", {
      candidateId: "candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing candidate ids", () => {
    expect(() =>
      normalizeCandidateMemoryPromotionInput({
        rawParams: {
          candidateId: "   ",
        },
      }),
    ).toThrow("candidateId required");
  });
});
