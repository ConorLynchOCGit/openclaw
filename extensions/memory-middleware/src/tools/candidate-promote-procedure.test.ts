import { describe, expect, it, vi } from "vitest";
import type { CandidateProcedurePromotionResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createCandidatePromoteProcedureTool,
  normalizeCandidateProcedurePromotionInput,
} from "./candidate-promote-procedure.js";

function createPromotionResult(): CandidateProcedurePromotionResult {
  return {
    accepted: true,
    status: "promoted",
    candidateId: "candidate-1",
    procedureId: "procedure-1",
    procedureStatus: "draft",
    sourceEventId: "event-1",
  };
}

function createRuntime() {
  return {
    candidatePromotion: {
      promoteToProcedureDraft: vi.fn(async () => createPromotionResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate promote-procedure tool", () => {
  it("normalizes a procedure promotion payload", () => {
    expect(
      normalizeCandidateProcedurePromotionInput({
        rawParams: {
          candidateId: " candidate-1 ",
          title: " Procedure Draft Title ",
          rationale: " accepted after manual review ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      candidateId: "candidate-1",
      title: "Procedure Draft Title",
      rationale: "accepted after manual review",
      promoterAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes procedure-promotion requests through the candidate promotion seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidatePromoteProcedureTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
      title: "Procedure Draft",
      rationale: "Manual procedure promotion approved.",
    });

    expect(runtime.candidatePromotion.promoteToProcedureDraft).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      title: "Procedure Draft",
      rationale: "Manual procedure promotion approved.",
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

  it("surfaces ineligible procedure-promotion results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: CandidateProcedurePromotionResult = {
      accepted: false,
      status: "ineligible",
      reason:
        "only accepted reviewed procedure candidates are eligible for bounded procedure promotion",
    };
    runtime.candidatePromotion.promoteToProcedureDraft = vi.fn(async () => ineligibleResult);
    const tool = createCandidatePromoteProcedureTool({ runtime });

    const result = await tool.execute("call-2", {
      candidateId: "candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing candidate ids", () => {
    expect(() =>
      normalizeCandidateProcedurePromotionInput({
        rawParams: {
          candidateId: "   ",
        },
      }),
    ).toThrow("candidateId required");
  });
});
