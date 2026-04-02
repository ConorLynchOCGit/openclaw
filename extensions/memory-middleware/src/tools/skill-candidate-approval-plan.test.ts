import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateApprovalPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateApprovalPlanTool,
  normalizeSkillCandidateApprovalPlanInput,
} from "./skill-candidate-approval-plan.js";

function createApprovalPlanResult(): SkillCandidateApprovalPlanResult {
  return {
    accepted: true,
    status: "ok",
    skillCandidateId: "skill-candidate-1",
    skillCandidateStatus: "candidate",
    procurementRecordId: "procurement-record-1",
    vettingResultRecordId: "vetting-record-1",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
    latestValidationRunOutcome: "passed",
    latestVettingDecision: "approve_limited",
    eligible: true,
    possibleTargets: ["propose_approved_for_limited_use", "remain_internal_only"],
    rationale: [
      "manual vetting result supports bounded limited approval planning",
      "installation remains separate and guarded even when limited approval is proposed",
    ],
    requiredGates: [
      "manual approval-state mutation requires an explicit later write slice",
      "installation still requires a separate explicit action and policy confirmation",
    ],
    installGuardrails: [
      "do not install any skill from this planning result alone",
      "keep the skill candidate in accelerator-only scope",
    ],
    remainingBlockers: [],
  };
}

function createRuntime() {
  return {
    skillCandidateApprovalPlan: {
      plan: vi.fn(async () => createApprovalPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate approval plan tool", () => {
  it("normalizes an approval-plan payload", () => {
    expect(
      normalizeSkillCandidateApprovalPlanInput({
        skillCandidateId: " skill-candidate-1 ",
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
    });
  });

  it("routes approval planning through the bounded advisory seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateApprovalPlanTool({ runtime });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(runtime.skillCandidateApprovalPlan.plan).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createApprovalPlanResult(), null, 2),
        },
      ],
      details: createApprovalPlanResult(),
    });
  });

  it("surfaces blocked approval planning results without side effects", async () => {
    const runtime = createRuntime();
    const blockedResult: SkillCandidateApprovalPlanResult = {
      accepted: true,
      status: "ok",
      skillCandidateId: "skill-candidate-1",
      skillCandidateStatus: "candidate",
      procurementRecordId: "procurement-record-1",
      eligible: false,
      possibleTargets: ["remain_blocked"],
      rationale: [
        "manual vetting result keeps this skill candidate blocked",
        "approval or installation planning cannot proceed while blockers remain",
      ],
      requiredGates: ["resolve the remaining blockers before any approval-state mutation slice"],
      installGuardrails: ["do not install any skill from this planning result alone"],
      remainingBlockers: ["manual install approval remains out of scope for this slice"],
    };
    runtime.skillCandidateApprovalPlan.plan = vi.fn(async () => blockedResult);
    const tool = createSkillCandidateApprovalPlanTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(blockedResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateApprovalPlanInput({
        skillCandidateId: "   ",
      }),
    ).toThrow("skillCandidateId required");
  });
});
