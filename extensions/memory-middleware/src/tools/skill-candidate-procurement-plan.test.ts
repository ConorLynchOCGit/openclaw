import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateProcurementPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateProcurementPlanTool,
  normalizeSkillCandidateProcurementPlanInput,
} from "./skill-candidate-procurement-plan.js";

function createProcurementPlanResult(): SkillCandidateProcurementPlanResult {
  return {
    accepted: true,
    status: "ok",
    skillCandidateId: "skill-candidate-1",
    skillCandidateStatus: "candidate",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_procurement_handoff", "remain_internal_skill_candidate_only"],
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "Skill Vetter must be invoked explicitly outside this advisory slice",
      "minimum vetting outputs must be recorded before lifecycle advancement",
      "installation remains blocked until procurement and policy gates pass",
    ],
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
        summary: "A reviewed reusable behavior candidate.",
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
        knownConcerns: ["no external package has been reviewed yet"],
        openQuestions: [
          "determine the packaging or source path for any future external skill candidate",
        ],
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
  };
}

function createRuntime() {
  return {
    skillCandidateProcurementPlan: {
      plan: vi.fn(async () => createProcurementPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate procurement plan tool", () => {
  it("normalizes a procurement-plan payload", () => {
    expect(
      normalizeSkillCandidateProcurementPlanInput({
        skillCandidateId: " skill-candidate-1 ",
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
    });
  });

  it("routes procurement planning through the bounded advisory seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateProcurementPlanTool({ runtime });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(runtime.skillCandidateProcurementPlan.plan).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createProcurementPlanResult(), null, 2),
        },
      ],
      details: createProcurementPlanResult(),
    });
  });

  it("surfaces ineligible procurement planning results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateProcurementPlanResult = {
      accepted: true,
      status: "ok",
      skillCandidateId: "skill-candidate-1",
      skillCandidateStatus: "candidate",
      eligible: false,
      possibleTargets: ["remain_internal_skill_candidate_only"],
      rationale: [
        "skill candidate is missing source procedure provenance",
        "procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
      ],
      requiredGates: ["recreate the skill candidate through the bounded procedure-to-skill path"],
    };
    runtime.skillCandidateProcurementPlan.plan = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateProcurementPlanTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateProcurementPlanInput({
        skillCandidateId: "   ",
      }),
    ).toThrow("skillCandidateId required");
  });
});
