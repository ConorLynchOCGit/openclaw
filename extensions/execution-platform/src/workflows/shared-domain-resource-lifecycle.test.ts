import { describe, expect, it } from "vitest";
import {
  buildSharedDomainResourceLifecycleProfile,
  sharedDomainActionGateKindsForCapabilityTraits,
  sharedDomainEvidenceKindsForCapabilityTraits,
  sharedDomainProfileIdForCapabilityTraits,
  sharedDomainResourceKindsForCapabilityTraits,
  sharedDomainWorkerActionToolIdsForCapabilityTraits,
  validateSharedDomainLifecycleCapability,
} from "./shared-domain-resource-lifecycle.ts";

describe("shared domain resource lifecycle", () => {
  it("models coding and Product/Spec Planning as domain profiles over one lifecycle spine", () => {
    const coding = buildSharedDomainResourceLifecycleProfile("coding");
    const planning = buildSharedDomainResourceLifecycleProfile("product_spec_planning");

    expect(coding.genericLifecycleOwner).toBe("NodeLifecycleTransitionRunner");
    expect(planning.genericLifecycleOwner).toBe("NodeLifecycleTransitionRunner");
    expect(coding.compatibilityFallbackAllowed).toBe(false);
    expect(planning.compatibilityFallbackAllowed).toBe(false);
    expect(coding.resourceKinds).toEqual(
      expect.arrayContaining(["repo_file", "bounded_file_window", "target_snapshot"]),
    );
    expect(coding.workerActionToolIds).toEqual(
      expect.arrayContaining(["node.agent_session.invoke"]),
    );
    expect(coding.workerActionToolIds).not.toContain("worker.edit.plan");
    expect(coding.workerActionToolIds).not.toContain("worker.validation.run_structural_default");
    expect(planning.resourceKinds).toEqual(
      expect.arrayContaining([
        "source_prompt_section",
        "owner_constraint",
        "planning_framework_contract",
        "planning_capsule",
        "action_graph_candidate",
        "compile_readiness_input",
      ]),
    );
    expect(planning.workerActionToolIds).toEqual(
      expect.arrayContaining([
        "planning.capsule.draft",
        "planning.framework_contract.record",
        "planning.action_graph.propose",
        "planning.compile_readiness.evaluate",
      ]),
    );
    expect(planning.workerActionToolIds).not.toContain("worker.edit.plan");
  });

  it("derives planning capability traits without file edit gates or runtime semantic judgment", () => {
    const traits = {
      workflowId: "agent_team.product_spec_planning",
      roleClass: "planning",
      canInspectRepo: true,
      canEditSource: false,
      canWriteTests: false,
      canRunValidation: true,
      canDoWebResearch: false,
      canCreatePlanningCapsules: true,
      canProposeChildActions: true,
      canCompileRuntimeJobs: false,
      canRequestHumanInput: true,
      canReviewSecurityPrivacy: false,
    };

    expect(sharedDomainProfileIdForCapabilityTraits(traits)).toBe("product_spec_planning");
    expect(sharedDomainResourceKindsForCapabilityTraits(traits)).toEqual(
      expect.arrayContaining([
        "source_prompt_section",
        "planning_capsule",
        "action_graph_candidate",
        "validation_result",
        "human_decision_ref",
      ]),
    );
    expect(sharedDomainActionGateKindsForCapabilityTraits(traits)).toEqual(
      expect.arrayContaining([
        "planning_capsule_gate",
        "action_graph_proposal_gate",
        "validation_gate",
        "human_decision_gate",
      ]),
    );
    expect(sharedDomainWorkerActionToolIdsForCapabilityTraits(traits)).toEqual(
      expect.arrayContaining([
        "planning.capsule.draft",
        "planning.capsule.revise",
        "planning.action_graph.propose",
        "planning.human_decision.request",
      ]),
    );
    expect(sharedDomainEvidenceKindsForCapabilityTraits(traits)).toEqual(
      expect.arrayContaining([
        "planning_intent",
        "planning_framework_contract",
        "planning_capsule",
        "action_graph_proposal",
        "compile_readiness",
        "human_decision",
      ]),
    );
  });

  it("rejects planning profiles that smuggle coding edit or snapshot gates", () => {
    const validation = validateSharedDomainLifecycleCapability({
      capabilityId: "planning_capsule_draft",
      workflowId: "agent_team.product_spec_planning",
      domainProfileId: "product_spec_planning",
      canEditSource: false,
      canWriteTests: false,
      requiredSnapshotKinds: ["target_file_snapshot"],
      allowedLifecycleTransitions: ["worker.patch.force_author_from_plan"],
      domainResourceKinds: ["planning_capsule"],
      domainWorkerActionToolIds: ["worker.edit.plan"],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "shared_domain_planning_profile_must_not_require_file_snapshots",
        "shared_domain_planning_profile_must_not_expose_file_edit_tools",
        "shared_domain_planning_profile_must_not_expose_patch_author_tools",
      ]),
    );
  });
});
