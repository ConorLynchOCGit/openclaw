import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateInstallHandoffResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateInstallHandoffTool,
  normalizeSkillCandidateInstallHandoffInput,
  planSkillCandidateInstallHandoffFromTool,
} from "./skill-candidate-install-handoff.js";

function createInstallHandoffResult(): SkillCandidateInstallHandoffResult {
  return {
    accepted: true,
    status: "ok",
    skillCandidateId: "skill-candidate-1",
    skillCandidateStatus: "approved_limited",
    approvedScope: "limited",
    approvalRecordId: "approval-record-1",
    procurementRecordId: "procurement-record-1",
    vettingResultRecordId: "vetting-record-1",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_manual_install_handoff", "remain_approved_internal_only"],
    rationale: [
      "bounded internal approval is recorded",
      "installation remains a separate explicit manual step even after bounded approval is recorded",
    ],
    requiredGates: [
      "manual installation remains a separate explicit action",
      "respect the recorded install guardrails during any later install review",
    ],
    remainingBlockers: [],
    installGuardrails: [
      "do not install any skill from this handoff alone",
      "keep installation as a separate explicit manual action",
    ],
    handoff: {
      approval: {
        approvalRecordId: "approval-record-1",
        eventName: "skill_candidate.approval",
        recordedAt: "2026-04-01T00:00:00.000Z",
        approvedScope: "limited",
      },
      source: {
        skillCandidateId: "skill-candidate-1",
        sourceProcedureId: "procedure-1",
        sourceCandidateId: "candidate-1",
        procurementRecordId: "procurement-record-1",
        vettingResultRecordId: "vetting-record-1",
        validationRunId: "validation-run-1",
      },
      rationale: ["bounded internal approval is recorded"],
      remainingBlockers: [],
      installGuardrails: [
        "do not install any skill from this handoff alone",
        "keep installation as a separate explicit manual action",
      ],
      manualSteps: ["treat this handoff as preparation only"],
    },
  };
}

function createRuntime() {
  return {
    skillCandidateInstallHandoff: {
      plan: vi.fn(async () => createInstallHandoffResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate install handoff tool", () => {
  it("normalizes an install-handoff payload", () => {
    expect(
      normalizeSkillCandidateInstallHandoffInput({
        skillCandidateId: " skill-candidate-1 ",
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
    });
  });

  it("routes planning through the advisory install-handoff seam", async () => {
    const runtime = createRuntime();
    const result = await planSkillCandidateInstallHandoffFromTool({
      runtime,
      input: {
        skillCandidateId: "skill-candidate-1",
      },
    });

    expect(runtime.skillCandidateInstallHandoff.plan).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
    });
    expect(result).toEqual(createInstallHandoffResult());
  });

  it("returns JSON tool output", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateInstallHandoffTool({ runtime });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createInstallHandoffResult(), null, 2),
        },
      ],
      details: createInstallHandoffResult(),
    });
  });

  it("surfaces internal-only outcomes without side effects", async () => {
    const runtime = createRuntime();
    const blocked: SkillCandidateInstallHandoffResult = {
      accepted: true,
      status: "ok",
      skillCandidateId: "skill-candidate-1",
      skillCandidateStatus: "approved_limited",
      approvedScope: "limited",
      eligible: false,
      possibleTargets: ["remain_approved_internal_only"],
      rationale: ["bounded approval record still carries unresolved blockers"],
      requiredGates: ["clear the remaining blockers before any separate manual install action"],
      remainingBlockers: ["install blocker remains"],
      installGuardrails: ["do not install any skill from this handoff alone"],
    };
    runtime.skillCandidateInstallHandoff.plan = vi.fn(async () => blocked);
    const tool = createSkillCandidateInstallHandoffTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(blocked);
  });

  it("rejects missing ids", () => {
    expect(() =>
      normalizeSkillCandidateInstallHandoffInput({
        skillCandidateId: "   ",
      }),
    ).toThrow("skillCandidateId required");
  });
});
