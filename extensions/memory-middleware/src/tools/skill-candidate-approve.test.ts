import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateApproveResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  approveSkillCandidateFromTool,
  createSkillCandidateApproveTool,
  normalizeSkillCandidateApproveInput,
} from "./skill-candidate-approve.js";

function createApprovalResult(): SkillCandidateApproveResult {
  return {
    accepted: true,
    status: "approved",
    skillCandidateId: "skill-candidate-1",
    approvalRecordId: "approval-record-1",
    approvedScope: "limited",
    skillCandidateStatus: "approved_limited",
    procurementRecordId: "procurement-record-1",
    vettingResultRecordId: "vetting-record-1",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    skillCandidateApproval: {
      approve: vi.fn(async () => createApprovalResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate approve tool", () => {
  it("normalizes an approval payload", () => {
    expect(
      normalizeSkillCandidateApproveInput({
        rawParams: {
          skillCandidateId: " skill-candidate-1 ",
          scope: " limited ",
          rationale: " bounded approval ",
        },
        context: {
          agentId: "agent-1",
          sessionId: "session-1",
        },
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
      scope: "limited",
      rationale: "bounded approval",
      approverAgentId: "agent-1",
    });
  });

  it("routes approval through the bounded write seam", async () => {
    const runtime = createRuntime();
    const result = await approveSkillCandidateFromTool({
      runtime,
      input: {
        skillCandidateId: "skill-candidate-1",
        scope: "limited",
      },
    });

    expect(runtime.skillCandidateApproval.approve).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
      scope: "limited",
    });
    expect(result).toEqual(createApprovalResult());
  });

  it("exposes approval results as JSON tool output", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateApproveTool({ runtime });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
      scope: "limited",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createApprovalResult(), null, 2),
        },
      ],
      details: createApprovalResult(),
    });
  });

  it("surfaces blocked approval writes without side effects", async () => {
    const runtime = createRuntime();
    const blockedResult: SkillCandidateApproveResult = {
      accepted: false,
      status: "ineligible",
      reason:
        "approval planning requires a recorded manual vetting result before any later approval consideration",
    };
    runtime.skillCandidateApproval.approve = vi.fn(async () => blockedResult);
    const tool = createSkillCandidateApproveTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
      scope: "normal",
    });

    expect(result.details).toEqual(blockedResult);
  });

  it("rejects missing ids and invalid scopes", () => {
    expect(() =>
      normalizeSkillCandidateApproveInput({
        rawParams: {
          skillCandidateId: "   ",
          scope: "limited",
        },
      }),
    ).toThrow("skillCandidateId required");

    expect(() =>
      normalizeSkillCandidateApproveInput({
        rawParams: {
          skillCandidateId: "skill-candidate-1",
          scope: "full",
        },
      }),
    ).toThrow("scope must be one of: limited, normal");
  });
});
