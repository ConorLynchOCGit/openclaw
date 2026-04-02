import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateVettingResultRecordResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateVettingResultRecordTool,
  normalizeSkillCandidateVettingResultRecordInput,
} from "./skill-candidate-vetting-result-record.js";

function createVettingResultRecordResult(): SkillCandidateVettingResultRecordResult {
  return {
    accepted: true,
    status: "created",
    skillCandidateId: "skill-candidate-1",
    procurementRecordId: "procurement-record-1",
    vettingResultRecordId: "vetting-record-1",
    decision: "approve_limited",
    skillCandidateStatus: "candidate",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    skillCandidateVettingResult: {
      create: vi.fn(async () => createVettingResultRecordResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate vetting result record tool", () => {
  it("normalizes a vetting-result payload", () => {
    expect(
      normalizeSkillCandidateVettingResultRecordInput({
        rawParams: {
          skillCandidateId: " skill-candidate-1 ",
          decision: "approve_limited",
          summary: " Manual review completed ",
          permissionsRisk: {
            level: "medium",
            notes: [" requires explicit file review "],
            requiredChecks: [" inspect runtime writes "],
          },
          suspiciousPatterns: {
            redFlags: [" no hidden network calls found "],
            unresolvedQuestions: [" confirm packaged entrypoint "],
          },
          operationalFit: {
            fit: "limited",
            notes: [" bounded use only "],
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
          },
          approvalRecommendation: {
            proposedLifecycleState: "approved_limited",
            installRecommendation: "manual_followup_required",
            blockers: [" manual install approval still required "],
          },
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
      decision: "approve_limited",
      summary: "Manual review completed",
      reviewerAgentId: "agent-1",
      permissionsRisk: {
        level: "medium",
        notes: ["requires explicit file review"],
        requiredChecks: ["inspect runtime writes"],
      },
      suspiciousPatterns: {
        redFlags: ["no hidden network calls found"],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded use only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: ["manual install approval still required"],
      },
      metadata: { source: "unit-test" },
    });
  });

  it("routes vetting-result creation through the bounded write seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateVettingResultRecordTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
      decision: "approve_limited",
      permissionsRisk: {
        level: "medium",
        notes: ["requires explicit file review"],
        requiredChecks: ["inspect runtime writes"],
      },
      suspiciousPatterns: {
        redFlags: ["no hidden network calls found"],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded use only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: ["manual install approval still required"],
      },
    });

    expect(runtime.skillCandidateVettingResult.create).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
      decision: "approve_limited",
      reviewerAgentId: "agent-1",
      permissionsRisk: {
        level: "medium",
        notes: ["requires explicit file review"],
        requiredChecks: ["inspect runtime writes"],
      },
      suspiciousPatterns: {
        redFlags: ["no hidden network calls found"],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "limited",
        notes: ["bounded use only"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "approved_limited",
        installRecommendation: "manual_followup_required",
        blockers: ["manual install approval still required"],
      },
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createVettingResultRecordResult(), null, 2),
        },
      ],
      details: createVettingResultRecordResult(),
    });
  });

  it("surfaces ineligible vetting-result results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateVettingResultRecordResult = {
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing an internal procurement record manual Skill Vetter handoff requires a persisted procurement record before review handoff",
    };
    runtime.skillCandidateVettingResult.create = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateVettingResultRecordTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
      decision: "defer",
      permissionsRisk: {
        level: "low",
        notes: ["none"],
        requiredChecks: ["manual review still required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "good",
        notes: ["roadmap-aligned"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateVettingResultRecordInput({
        rawParams: {
          skillCandidateId: "   ",
          decision: "defer",
          permissionsRisk: {
            level: "low",
            notes: ["none"],
            requiredChecks: ["manual review still required"],
          },
          suspiciousPatterns: {
            redFlags: [],
            unresolvedQuestions: ["confirm packaged entrypoint"],
          },
          operationalFit: {
            fit: "good",
            notes: ["roadmap-aligned"],
            acceleratorOnly: true,
            canonicalMemorySubstrate: false,
          },
          approvalRecommendation: {
            proposedLifecycleState: "under_review",
            installRecommendation: "do_not_install",
            blockers: ["manual review still open"],
          },
        },
      }),
    ).toThrow("skillCandidateId required");
  });
});
