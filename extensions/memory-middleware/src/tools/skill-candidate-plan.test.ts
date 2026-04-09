import { describe, expect, it, vi } from "vitest";
import type { SkillCandidatePlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidatePlanTool,
  normalizeSkillCandidatePlanInput,
} from "./skill-candidate-plan.js";

function createPlanResult(): SkillCandidatePlanResult {
  return {
    accepted: true,
    status: "ok",
    procedureId: "procedure-1",
    procedureStatus: "validated",
    sourceCandidateId: "candidate-1",
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_skill_candidate", "remain_validated_procedure_only"],
    rationale: [
      "procedure is in validated state",
      "validated procedure preserves bounded candidate provenance and a passed validation run",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "skill-candidate creation requires an explicit write tool invocation",
      "procurement, review, and policy checks must pass before any future skill-candidate write",
    ],
  };
}

function createRuntime() {
  return {
    skillCandidatePlan: {
      plan: vi.fn(async () => createPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill-candidate plan tool", () => {
  it("normalizes a skill-candidate planning payload", () => {
    expect(
      normalizeSkillCandidatePlanInput({
        procedureId: " procedure-1 ",
      }),
    ).toEqual({
      procedureId: "procedure-1",
    });
  });

  it("routes skill-candidate planning requests through the planning seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidatePlanTool({ runtime });

    const result = await tool.execute("call-1", {
      procedureId: "procedure-1",
    });

    expect(runtime.skillCandidatePlan.plan).toHaveBeenCalledWith({
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

  it("surfaces ineligible planning results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidatePlanResult = {
      accepted: true,
      status: "ok",
      procedureId: "procedure-1",
      procedureStatus: "validated",
      eligible: false,
      possibleTargets: ["remain_validated_procedure_only"],
      rationale: [
        "validated procedure is missing source candidate provenance",
        "skill-candidate planning requires a procedure that preserves bounded candidate lineage",
      ],
      requiredGates: [
        "recreate the validated procedure through the bounded candidate-to-procedure path",
      ],
    };
    runtime.skillCandidatePlan.plan = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidatePlanTool({ runtime });

    const result = await tool.execute("call-2", {
      procedureId: "procedure-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing procedure ids", () => {
    expect(() =>
      normalizeSkillCandidatePlanInput({
        procedureId: "   ",
      }),
    ).toThrow("procedureId required");
  });
});
