import { describe, expect, it } from "vitest";
import { OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES } from "./model-candidate-validation-plan.ts";
import { enforceModelRoster } from "./model-roster-enforcement.ts";
import { buildV4ProAllRoleEligibilityProof } from "./v4-pro-role-eligibility.ts";

const evidenceRefs = [
  ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
];

describe("model roster enforcement", () => {
  it("allows qualified Kimi 2.6 for implementation role", () => {
    const decision = enforceModelRoster({
      roleId: "implementation_engineer",
      requestedModelId: "moonshotai/kimi-k2.6",
      requestedAuthority: "implementation",
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      roleQualificationStatus: "qualified",
      evidenceRefs,
    });

    expect(decision).toMatchObject({
      allowed: true,
      status: "allowed",
      candidateId: "kimi-2-6-coding-candidate",
      noGlobalWinner: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("rejects DeepSeek V4 Pro while needs_review and keeps it separate from Flash", () => {
    const decision = enforceModelRoster({
      roleId: "context_scout",
      requestedModelId: "deepseek/deepseek-v4-pro",
      requestedAuthority: "observe",
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      roleTargetId: "context_scout",
      roleQualificationStatus: "needs_review",
      evidenceRefs,
    });
    const flash = enforceModelRoster({
      roleId: "implementation_engineer",
      requestedModelId: "deepseek/deepseek-v4-flash",
      requestedAuthority: "implementation",
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      roleQualificationStatus: "qualified",
      evidenceRefs,
    });

    expect(decision).toMatchObject({
      allowed: false,
      status: "needs_review",
      candidateId: "deepseek-v4-pro-coding-candidate",
    });
    expect(decision.reasonCodes).toContain("deepseek_v4_pro_not_role_qualified");
    expect(flash).toMatchObject({
      allowed: false,
      candidateId: "deepseek-v4-coding-candidate",
    });
    expect(flash.reasonCodes).toContain("deepseek_v4_flash_role_not_allowed");
  });

  it("rejects assist final acceptance, shadow implementation authority, missing evidence, and global replacement", () => {
    expect(
      enforceModelRoster({
        roleId: "security_privacy_reviewer",
        requestedModelId: "deepseek/deepseek-v4-pro",
        requestedAuthority: "final_acceptance",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleTargetId: "security_privacy_reviewer_assist",
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }).reasonCodes,
    ).toContain("assist_role_final_acceptance_not_allowed");

    expect(
      enforceModelRoster({
        roleId: "implementation_engineer",
        requestedModelId: "deepseek/deepseek-v4-pro",
        requestedAuthority: "implementation",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleTargetId: "implementation_engineer_shadow",
        roleQualificationStatus: "shadow_only",
        evidenceRefs,
      }).reasonCodes,
    ).toContain("shadow_implementation_authority_not_allowed");

    expect(
      enforceModelRoster({
        roleId: "test_engineer",
        requestedModelId: "deepseek/deepseek-v4-flash",
        requestedAuthority: "testing",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs: [],
        globalReplacementClaimed: true,
      }).reasonCodes,
    ).toEqual(
      expect.arrayContaining([
        "global_model_replacement_not_allowed",
        "model_roster_evidence_required",
      ]),
    );
  });

  it("accepts bounded operator override for V4 Pro needs_review but not high-blast-radius authority", () => {
    const override = enforceModelRoster({
      roleId: "context_scout",
      requestedModelId: "deepseek/deepseek-v4-pro",
      requestedAuthority: "observe",
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      roleTargetId: "context_scout",
      roleQualificationStatus: "needs_review",
      evidenceRefs,
      operatorOverride: {
        overrideId: "override-1",
        approvedBy: "operator",
        reason: "shadow resource scout only",
        evidenceRefs,
      },
    });
    const deploy = enforceModelRoster({
      roleId: "context_scout",
      requestedModelId: "deepseek/deepseek-v4-pro",
      requestedAuthority: "deploy",
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      roleTargetId: "context_scout",
      roleQualificationStatus: "qualified",
      evidenceRefs,
      operatorOverride: {
        overrideId: "override-2",
        approvedBy: "operator",
        reason: "not enough for deploy",
        evidenceRefs,
      },
    });

    expect(override).toMatchObject({ allowed: true, operatorOverrideApplied: true });
    expect(deploy).toMatchObject({ allowed: false, status: "blocked" });
    expect(deploy.reasonCodes).toContain("high_blast_radius_authority_not_allowed_by_model_roster");
  });

  it("records explicit V4 Pro eligibility for every team role without declaring a global winner", () => {
    const proof = buildV4ProAllRoleEligibilityProof([
      {
        roleId: "test_engineer",
        qualityPassed: true,
        costPassed: true,
        latencyPassed: true,
        reliabilityPassed: true,
        rollbackRef: "model-roster://agent_team.coding/test_engineer/rollback",
        evidenceRefs: ["artifact://test-engineer-eval"],
        preferred: true,
      },
      {
        roleId: "context_scout",
        qualityPassed: true,
        costPassed: true,
        latencyPassed: true,
        reliabilityPassed: true,
        rollbackRef: "model-roster://agent_team.coding/context_scout/rollback",
        evidenceRefs: ["artifact://context-scout-eval"],
        fallbackOnly: true,
      },
      {
        roleId: "implementation_engineer",
        qualityPassed: false,
        costPassed: true,
        latencyPassed: true,
        reliabilityPassed: true,
        rollbackRef: "model-roster://agent_team.coding/implementation_engineer/rollback",
        evidenceRefs: ["artifact://implementation-shadow-eval"],
      },
    ]);

    expect(proof.everyRoleExplicit).toBe(true);
    expect(proof.noGlobalWinner).toBe(true);
    expect(proof.rawPromptStored).toBe(false);
    expect(proof.promotedRoles).toEqual(["test_engineer"]);
    expect(proof.fallbackOnlyRoles).toEqual(["context_scout"]);
    expect(proof.needsReviewRoles).toEqual(
      expect.arrayContaining(["implementation_engineer", "orchestrator"]),
    );
  });
});
