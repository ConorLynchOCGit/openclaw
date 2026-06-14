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
  it("models coding and architecture review as domain profiles over one lifecycle spine", () => {
    const coding = buildSharedDomainResourceLifecycleProfile("coding");
    const architecture = buildSharedDomainResourceLifecycleProfile("architecture_red_team");

    expect(coding.genericLifecycleOwner).toBe("NodeLifecycleTransitionRunner");
    expect(architecture.genericLifecycleOwner).toBe("NodeLifecycleTransitionRunner");
    expect(coding.compatibilityFallbackAllowed).toBe(false);
    expect(architecture.compatibilityFallbackAllowed).toBe(false);
    expect(coding.resourceKinds).toEqual(
      expect.arrayContaining(["repo_file", "bounded_file_window", "target_snapshot"]),
    );
    expect(coding.workerActionToolIds).toEqual(
      expect.arrayContaining(["node.agent_session.invoke"]),
    );
    expect(coding.workerActionToolIds).not.toContain("worker.edit.plan");
    expect(coding.workerActionToolIds).not.toContain("worker.validation.run_structural_default");
    expect(architecture.resourceKinds).toEqual(
      expect.arrayContaining([
        "source_prompt_section",
        "planning_framework_contract",
        "planning_capsule",
        "action_graph_candidate",
      ]),
    );
    expect(architecture.workerActionToolIds).toEqual(
      expect.arrayContaining([
        "planning.intent.record",
        "planning.capsule.draft",
        "planning.framework_contract.record",
        "planning.action_graph.propose",
        "planning.closeout.summarize",
      ]),
    );
    expect(architecture.workerActionToolIds).not.toContain("worker.edit.plan");
  });

  it("derives architecture planning traits without file edit gates or runtime semantic judgment", () => {
    const traits = {
      workflowId: "agent_team.architecture_red_team",
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

    expect(sharedDomainProfileIdForCapabilityTraits(traits)).toBe("architecture_red_team");
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
        "planning_framework_contract",
        "research_brief",
        "planning_capsule",
        "action_graph_proposal",
        "human_decision",
      ]),
    );
  });

  it("rejects coding capabilities that smuggle edit authority without native agent-session invocation", () => {
    const validation = validateSharedDomainLifecycleCapability({
      capabilityId: "implementation",
      workflowId: "agent_team.coding",
      domainProfileId: "coding",
      canEditSource: true,
      canWriteTests: false,
      requiredSnapshotKinds: ["target_file_snapshot"],
      allowedLifecycleTransitions: ["node.agent_session.invoke"],
      domainResourceKinds: ["repo_file", "diff"],
      domainWorkerActionToolIds: ["worker.edit.plan"],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "shared_domain_coding_edit_profile_missing_node_agent_session_invoke",
      ]),
    );
  });
});
