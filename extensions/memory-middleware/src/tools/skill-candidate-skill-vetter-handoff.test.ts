import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateSkillVetterHandoffResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateSkillVetterHandoffTool,
  normalizeSkillCandidateSkillVetterHandoffInput,
} from "./skill-candidate-skill-vetter-handoff.js";

function createSkillVetterHandoffResult(): SkillCandidateSkillVetterHandoffResult {
  return {
    accepted: true,
    status: "ok",
    skillCandidateId: "skill-candidate-1",
    skillCandidateStatus: "candidate",
    procurementRecordId: "procurement-record-1",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_skill_vetter_handoff", "remain_internal_only"],
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "a procurement record already preserves the structured handoff package for manual vetting",
    ],
    requiredGates: [
      "manual Skill Vetter invocation is still required",
      "manual Skill Vetter findings must be recorded before lifecycle advancement",
      "installation remains blocked until procurement, vetting, and policy gates pass",
    ],
    handoff: {
      procurementRecord: {
        procurementRecordId: "procurement-record-1",
        eventName: "skill_candidate.procurement_record",
        recordedAt: "2026-04-01T00:00:00.000Z",
      },
      handoff: {
        source: {
          sourceType: "bounded_internal_skill_candidate",
          skillCandidateId: "skill-candidate-1",
          sourceProcedureId: "procedure-1",
          sourceCandidateId: "candidate-1",
          sourceEventId: "event-1",
          validationRunId: "run-1",
        },
        scope: {
          name: "Bounded Skill Candidate",
          summary: "Validated procedure distilled into a bounded skill candidate.",
          intendedRole: "candidate_reusable_behavior",
          boundaries: ["bounded internal skill candidate only"],
          overlaps: ["candidate reusable behavior distilled from a validated procedure"],
        },
        permissionsRisk: {
          currentArtifactRisk: "bounded_internal_record_only",
          installRisk: "external_skill_not_reviewed",
          requiredChecks: [
            "review file, network, secret, and execution expectations during procurement",
          ],
        },
        suspiciousPatterns: {
          knownConcerns: ["Skill Vetter has not been invoked by this planning surface"],
          openQuestions: ["review the actual external implementation before installation"],
        },
        operationalFit: {
          roadmapRole: "skill_candidate",
          acceleratorOnly: true,
          canonicalMemorySubstrate: false,
          repoNativeLineagePreserved: true,
        },
        approvalRecommendation: {
          proposedLifecycleState: "under_review",
          installRecommendation: "do_not_install",
          blockers: ["Skill Vetter review has not been completed"],
        },
      },
      manualSkillVetterInputs: {
        source: {
          sourceType: "bounded_internal_skill_candidate",
          skillCandidateId: "skill-candidate-1",
          sourceProcedureId: "procedure-1",
          sourceCandidateId: "candidate-1",
          sourceEventId: "event-1",
          validationRunId: "run-1",
        },
        scope: {
          name: "Bounded Skill Candidate",
          summary: "Validated procedure distilled into a bounded skill candidate.",
          intendedRole: "candidate_reusable_behavior",
          boundaries: ["bounded internal skill candidate only"],
          overlaps: ["candidate reusable behavior distilled from a validated procedure"],
        },
        permissionsRisk: {
          currentArtifactRisk: "bounded_internal_record_only",
          installRisk: "external_skill_not_reviewed",
          requiredChecks: [
            "review file, network, secret, and execution expectations during procurement",
          ],
        },
        suspiciousPatterns: {
          knownConcerns: ["Skill Vetter has not been invoked by this planning surface"],
          openQuestions: ["review the actual external implementation before installation"],
        },
        operationalFit: {
          roadmapRole: "skill_candidate",
          acceleratorOnly: true,
          canonicalMemorySubstrate: false,
          repoNativeLineagePreserved: true,
        },
        approvalRecommendation: {
          proposedLifecycleState: "under_review",
          installRecommendation: "do_not_install",
          blockers: ["Skill Vetter review has not been completed"],
        },
      },
      manualSteps: [
        "run Skill Vetter manually against the actual external skill artifact or source path",
      ],
      installGuardrails: ["do not install any skill from this handoff package alone"],
    },
  };
}

function createRuntime() {
  return {
    skillCandidateSkillVetterHandoff: {
      plan: vi.fn(async () => createSkillVetterHandoffResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate Skill Vetter handoff tool", () => {
  it("normalizes a Skill Vetter handoff payload", () => {
    expect(
      normalizeSkillCandidateSkillVetterHandoffInput({
        skillCandidateId: " skill-candidate-1 ",
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
    });
  });

  it("routes Skill Vetter handoff planning through the bounded advisory seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(runtime.skillCandidateSkillVetterHandoff.plan).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createSkillVetterHandoffResult(), null, 2),
        },
      ],
      details: createSkillVetterHandoffResult(),
    });
  });

  it("surfaces ineligible Skill Vetter handoff results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateSkillVetterHandoffResult = {
      accepted: true,
      status: "ok",
      skillCandidateId: "skill-candidate-1",
      skillCandidateStatus: "candidate",
      eligible: false,
      possibleTargets: ["remain_internal_only"],
      rationale: [
        "skill candidate is missing an internal procurement record",
        "manual Skill Vetter handoff requires a persisted procurement record before review handoff",
      ],
      requiredGates: [
        "create a bounded procurement record before preparing manual Skill Vetter handoff",
      ],
    };
    runtime.skillCandidateSkillVetterHandoff.plan = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateSkillVetterHandoffTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateSkillVetterHandoffInput({
        skillCandidateId: "   ",
      }),
    ).toThrow("skillCandidateId required");
  });
});
