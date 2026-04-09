import { describe, expect, it, vi } from "vitest";
import type { ProcedureValidationPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createProcedureValidatePlanTool,
  normalizeProcedureValidationPlanInput,
} from "./procedure-validate-plan.js";

function createPlanResult(): ProcedureValidationPlanResult {
  return {
    accepted: true,
    status: "ok",
    procedureId: "procedure-1",
    procedureStatus: "draft",
    sourceCandidateId: "candidate-1",
    latestCandidateReviewOutcome: "accepted",
    eligible: true,
    possibleTargets: ["propose_validated_procedure", "remain_draft_only"],
    rationale: [
      "procedure draft is backed by an accepted reviewed procedure candidate",
      "draft provenance includes both accepted-review and source-event linkage",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "validated-procedure writes require an explicit write tool invocation",
      "procedure-run evidence, policy checks, and review gates must pass before any future validation write",
    ],
  };
}

function createRuntime() {
  return {
    procedureValidationPlan: {
      plan: vi.fn(async () => createPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory procedure validate-plan tool", () => {
  it("normalizes a procedure validation planning payload", () => {
    expect(
      normalizeProcedureValidationPlanInput({
        procedureId: " procedure-1 ",
      }),
    ).toEqual({
      procedureId: "procedure-1",
    });
  });

  it("routes validation-planning requests through the procedure planning seam", async () => {
    const runtime = createRuntime();
    const tool = createProcedureValidatePlanTool({ runtime });

    const result = await tool.execute("call-1", {
      procedureId: "procedure-1",
    });

    expect(runtime.procedureValidationPlan.plan).toHaveBeenCalledWith({
      procedureId: "procedure-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createPlanResult(), null, 2),
        },
      ],
      details: createPlanResult(),
    });
  });

  it("surfaces ineligible validation-planning results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: ProcedureValidationPlanResult = {
      accepted: true,
      status: "ok",
      procedureId: "procedure-1",
      procedureStatus: "draft",
      eligible: false,
      possibleTargets: ["remain_draft_only"],
      rationale: [
        "procedure draft is missing candidate source-memory provenance",
        "validated-procedure planning requires a draft linked back to a reviewed procedure candidate",
      ],
      requiredGates: ["recreate or relink the draft through the bounded procedure-promotion path"],
    };
    runtime.procedureValidationPlan.plan = vi.fn(async () => ineligibleResult);
    const tool = createProcedureValidatePlanTool({ runtime });

    const result = await tool.execute("call-2", {
      procedureId: "procedure-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing procedure ids", () => {
    expect(() =>
      normalizeProcedureValidationPlanInput({
        procedureId: "   ",
      }),
    ).toThrow("procedureId required");
  });
});
