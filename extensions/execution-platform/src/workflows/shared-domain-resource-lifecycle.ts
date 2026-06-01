import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

export const SHARED_DOMAIN_RESOURCE_LIFECYCLE_SCHEMA_VERSION =
  "execution-platform.shared-domain-resource-lifecycle.v1" as const;

const stringList = (maxItems: number, maxChars = 220) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const SharedDomainProfileIdSchema = z.enum([
  "coding",
  "product_spec_planning",
  "architecture_red_team",
  "research",
  "docs",
  "human_decision",
  "generic",
]);
export type SharedDomainProfileId = z.infer<typeof SharedDomainProfileIdSchema>;

export const SharedDomainResourceKindSchema = z.enum([
  "artifact",
  "repo_file",
  "bounded_file_window",
  "symbol",
  "related_test",
  "validation_command",
  "validation_result",
  "diff",
  "target_snapshot",
  "source_prompt_section",
  "owner_constraint",
  "project_fact",
  "planning_framework_contract",
  "research_brief",
  "citation",
  "planning_capsule",
  "planning_capsule_revision",
  "action_graph_candidate",
  "compile_readiness_input",
  "human_decision_ref",
  "workflow_manifest_ref",
  "proof_artifact_ref",
  "closeout_ref",
  "memory_pack",
]);
export type SharedDomainResourceKind = z.infer<typeof SharedDomainResourceKindSchema>;

export const SharedDomainActionGateKindSchema = z.enum([
  "read_only_resource_gate",
  "source_edit_gate",
  "test_authoring_gate",
  "docs_update_gate",
  "validation_gate",
  "review_gate",
  "readback_gate",
  "planning_framework_contract_gate",
  "research_brief_gate",
  "planning_capsule_gate",
  "planning_capsule_revision_gate",
  "action_graph_proposal_gate",
  "compile_readiness_gate",
  "human_decision_gate",
  "closeout_gate",
]);
export type SharedDomainActionGateKind = z.infer<typeof SharedDomainActionGateKindSchema>;

export const SharedDomainWorkerActionToolIdSchema = z.enum([
  "worker.action.perform",
  "worker.edit.plan",
  "worker.validation.run_structural_default",
  "worker.validation.record_result",
  "worker.validation.request_repair",
  "worker.validation.record_blocker",
  "worker.escalation.request_high_capability",
  "worker.escalation.execute_high_capability",
  "worker.escalation.mark_unavailable",
  "worker.evidence.claim_from_validation",
  "mission.ledger.apply_evidence_claims",
  "planning.intent.record",
  "planning.framework_contract.record",
  "planning.research.request_brief",
  "planning.capsule.draft",
  "planning.capsule.revise",
  "planning.action_graph.propose",
  "planning.compile_readiness.evaluate",
  "planning.human_decision.request",
  "planning.closeout.summarize",
  "resource.ledger.report_relevant_resource",
  "resource.ledger.report_planning_action_point",
  "resource.ledger.recommend_domain_validation",
]);
export type SharedDomainWorkerActionToolId = z.infer<
  typeof SharedDomainWorkerActionToolIdSchema
>;

export const SharedDomainLifecycleProfileSchema = z
  .object({
    artifactKind: z.literal("shared_domain_lifecycle_profile"),
    schemaVersion: z.literal(SHARED_DOMAIN_RESOURCE_LIFECYCLE_SCHEMA_VERSION),
    profileId: SharedDomainProfileIdSchema,
    genericLifecycleOwner: z.literal("NodeLifecycleTransitionRunner"),
    runtimeSemanticJudgmentAllowed: z.literal(false),
    compatibilityFallbackAllowed: z.literal(false),
    resourceKinds: z.array(SharedDomainResourceKindSchema).min(1).max(40),
    actionGateKinds: z.array(SharedDomainActionGateKindSchema).min(1).max(24),
    workerActionToolIds: z.array(SharedDomainWorkerActionToolIdSchema).max(32),
    evidenceKinds: stringList(32, 180),
    requiredPacketKinds: stringList(24, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();
export type SharedDomainLifecycleProfile = z.infer<
  typeof SharedDomainLifecycleProfileSchema
>;

export type SharedDomainCapabilityTraits = {
  workflowId: string;
  roleClass: string;
  canInspectRepo: boolean;
  canEditSource: boolean;
  canWriteTests: boolean;
  canRunValidation: boolean;
  canDoWebResearch: boolean;
  canCreatePlanningCapsules: boolean;
  canProposeChildActions: boolean;
  canCompileRuntimeJobs: boolean;
  canRequestHumanInput: boolean;
  canReviewSecurityPrivacy: boolean;
};

function unique<T extends string>(values: Array<T | null | undefined>, max = 32): T[] {
  const seen = new Set<T>();
  const output: T[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

export function sharedDomainProfileIdForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): SharedDomainProfileId {
  if (input.workflowId === "agent_team.product_spec_planning") {
    return "product_spec_planning";
  }
  if (input.workflowId === "agent_team.architecture_red_team") {
    return "architecture_red_team";
  }
  if (input.workflowId === "agent_team.coding") {
    return input.roleClass === "docs" ? "docs" : "coding";
  }
  if (input.roleClass === "research" || input.canDoWebResearch) {
    return "research";
  }
  if (input.roleClass === "human" || input.canRequestHumanInput) {
    return "human_decision";
  }
  if (input.roleClass === "docs") {
    return "docs";
  }
  return "generic";
}

export function buildSharedDomainResourceLifecycleProfile(
  profileId: SharedDomainProfileId,
): SharedDomainLifecycleProfile {
  const profile = (() => {
    if (profileId === "coding") {
      return {
        resourceKinds: [
          "repo_file",
          "bounded_file_window",
          "symbol",
          "related_test",
          "validation_command",
          "validation_result",
          "diff",
          "target_snapshot",
          "memory_pack",
        ],
        actionGateKinds: [
          "source_edit_gate",
          "test_authoring_gate",
          "docs_update_gate",
          "validation_gate",
          "review_gate",
          "readback_gate",
          "closeout_gate",
        ],
        workerActionToolIds: [
          "worker.edit.plan",
          "worker.validation.run_structural_default",
          "worker.validation.record_result",
          "worker.validation.request_repair",
          "worker.escalation.request_high_capability",
          "worker.evidence.claim_from_validation",
          "mission.ledger.apply_evidence_claims",
        ],
        evidenceKinds: [
          "source_change",
          "test_validation",
          "review",
          "docs",
          "readback",
          "closeout",
          "resource_handoff",
        ],
        requiredPacketKinds: ["coding_resource_packet", "node_execution_packet"],
      };
    }
    if (profileId === "product_spec_planning") {
      return {
        resourceKinds: [
          "source_prompt_section",
          "owner_constraint",
          "project_fact",
          "planning_framework_contract",
          "research_brief",
          "citation",
          "planning_capsule",
          "planning_capsule_revision",
          "action_graph_candidate",
          "compile_readiness_input",
          "human_decision_ref",
          "workflow_manifest_ref",
          "proof_artifact_ref",
          "closeout_ref",
          "memory_pack",
        ],
        actionGateKinds: [
          "planning_framework_contract_gate",
          "research_brief_gate",
          "planning_capsule_gate",
          "planning_capsule_revision_gate",
          "action_graph_proposal_gate",
          "compile_readiness_gate",
          "human_decision_gate",
          "closeout_gate",
        ],
        workerActionToolIds: [
          "planning.intent.record",
          "planning.framework_contract.record",
          "planning.research.request_brief",
          "planning.capsule.draft",
          "planning.capsule.revise",
          "planning.action_graph.propose",
          "planning.compile_readiness.evaluate",
          "planning.human_decision.request",
          "planning.closeout.summarize",
          "resource.ledger.report_relevant_resource",
          "resource.ledger.report_planning_action_point",
          "resource.ledger.recommend_domain_validation",
        ],
        evidenceKinds: [
          "planning_intent",
          "planning_framework_contract",
          "research_brief",
          "planning_capsule",
          "planning_capsule_revision",
          "action_graph_proposal",
          "compile_readiness",
          "human_decision",
          "closeout",
          "resource_handoff",
        ],
        requiredPacketKinds: ["planning_domain_resource_packet", "node_execution_packet"],
      };
    }
    if (profileId === "architecture_red_team") {
      return {
        resourceKinds: [
          "repo_file",
          "bounded_file_window",
          "source_prompt_section",
          "project_fact",
          "planning_framework_contract",
          "research_brief",
          "planning_capsule",
          "action_graph_candidate",
          "proof_artifact_ref",
          "memory_pack",
        ],
        actionGateKinds: [
          "read_only_resource_gate",
          "research_brief_gate",
          "planning_capsule_gate",
          "action_graph_proposal_gate",
          "review_gate",
          "readback_gate",
          "closeout_gate",
        ],
        workerActionToolIds: [
          "planning.intent.record",
          "planning.framework_contract.record",
          "planning.research.request_brief",
          "planning.capsule.draft",
          "planning.action_graph.propose",
          "planning.closeout.summarize",
          "resource.ledger.report_relevant_resource",
          "resource.ledger.recommend_domain_validation",
        ],
        evidenceKinds: [
          "review",
          "planning_framework_contract",
          "research_brief",
          "planning_capsule",
          "action_graph_proposal",
          "readback",
        ],
        requiredPacketKinds: ["planning_domain_resource_packet", "node_execution_packet"],
      };
    }
    if (profileId === "research") {
      return {
        resourceKinds: ["research_brief", "citation", "source_prompt_section", "memory_pack"],
        actionGateKinds: ["research_brief_gate", "read_only_resource_gate"],
        workerActionToolIds: [
          "planning.research.request_brief",
          "resource.ledger.report_relevant_resource",
        ],
        evidenceKinds: ["research_brief", "resource_handoff"],
        requiredPacketKinds: ["domain_resource_packet"],
      };
    }
    if (profileId === "human_decision") {
      return {
        resourceKinds: ["human_decision_ref", "owner_constraint", "project_fact"],
        actionGateKinds: ["human_decision_gate"],
        workerActionToolIds: ["planning.human_decision.request"],
        evidenceKinds: ["human_decision"],
        requiredPacketKinds: ["domain_resource_packet"],
      };
    }
    if (profileId === "docs") {
      return {
        resourceKinds: [
          "repo_file",
          "bounded_file_window",
          "source_prompt_section",
          "workflow_manifest_ref",
          "validation_result",
        ],
        actionGateKinds: ["docs_update_gate", "validation_gate", "closeout_gate"],
        workerActionToolIds: [
          "worker.action.perform",
          "worker.validation.run_structural_default",
          "worker.evidence.claim_from_validation",
        ],
        evidenceKinds: ["docs", "validation_result", "resource_handoff"],
        requiredPacketKinds: ["domain_resource_packet", "node_execution_packet"],
      };
    }
    return {
      resourceKinds: ["artifact", "source_prompt_section", "memory_pack"],
      actionGateKinds: ["read_only_resource_gate"],
      workerActionToolIds: ["worker.action.perform", "resource.ledger.report_relevant_resource"],
      evidenceKinds: ["artifact", "resource_handoff"],
      requiredPacketKinds: ["domain_resource_packet"],
    };
  })();

  return SharedDomainLifecycleProfileSchema.parse({
    artifactKind: "shared_domain_lifecycle_profile",
    schemaVersion: SHARED_DOMAIN_RESOURCE_LIFECYCLE_SCHEMA_VERSION,
    profileId,
    genericLifecycleOwner: "NodeLifecycleTransitionRunner",
    runtimeSemanticJudgmentAllowed: false,
    compatibilityFallbackAllowed: false,
    ...profile,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function sharedDomainResourceKindsForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): SharedDomainResourceKind[] {
  const profile = buildSharedDomainResourceLifecycleProfile(
    sharedDomainProfileIdForCapabilityTraits(input),
  );
  const kinds: Array<SharedDomainResourceKind | null> = [...profile.resourceKinds];
  if (input.canInspectRepo) {
    kinds.push("repo_file", "bounded_file_window", "symbol");
  }
  if (input.canRunValidation || input.canWriteTests) {
    kinds.push("validation_command", "validation_result");
  }
  if (input.canEditSource || input.canWriteTests) {
    kinds.push("diff", "target_snapshot", "related_test");
  }
  if (input.canDoWebResearch) {
    kinds.push("research_brief", "citation");
  }
  if (input.canCreatePlanningCapsules) {
    kinds.push("planning_capsule", "planning_capsule_revision");
  }
  if (input.canProposeChildActions) {
    kinds.push("action_graph_candidate");
  }
  if (input.canRequestHumanInput || input.roleClass === "human") {
    kinds.push("human_decision_ref");
  }
  return unique(kinds, 40);
}

export function sharedDomainActionGateKindsForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): SharedDomainActionGateKind[] {
  const profile = buildSharedDomainResourceLifecycleProfile(
    sharedDomainProfileIdForCapabilityTraits(input),
  );
  const gates: Array<SharedDomainActionGateKind | null> = [];
  if (input.canEditSource) {
    gates.push("source_edit_gate");
  }
  if (input.canWriteTests) {
    gates.push("test_authoring_gate");
  }
  if (input.canRunValidation) {
    gates.push("validation_gate");
  }
  if (input.canDoWebResearch) {
    gates.push("research_brief_gate");
  }
  if (input.canCreatePlanningCapsules) {
    gates.push("planning_capsule_gate", "planning_capsule_revision_gate");
  }
  if (input.canProposeChildActions) {
    gates.push("action_graph_proposal_gate");
  }
  if (input.canRequestHumanInput || input.roleClass === "human") {
    gates.push("human_decision_gate");
  }
  if (input.roleClass === "closeout") {
    gates.push("closeout_gate");
  }
  if (input.roleClass === "review") {
    gates.push("review_gate");
  }
  if (input.roleClass === "observability") {
    gates.push("readback_gate");
  }
  return unique([...gates, ...profile.actionGateKinds], 24);
}

export function sharedDomainWorkerActionToolIdsForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): SharedDomainWorkerActionToolId[] {
  const tools: Array<SharedDomainWorkerActionToolId | null> = [];
  if (input.canEditSource || input.canWriteTests) {
    tools.push(
      "worker.edit.plan",
      "worker.validation.run_structural_default",
      "worker.validation.record_result",
      "worker.validation.request_repair",
      "worker.escalation.request_high_capability",
      "worker.evidence.claim_from_validation",
      "mission.ledger.apply_evidence_claims",
    );
  }
  if (input.canRunValidation && !input.canEditSource && !input.canWriteTests) {
    tools.push(
      "worker.validation.run_structural_default",
      "worker.validation.record_result",
      "worker.validation.request_repair",
      "worker.validation.record_blocker",
      "worker.evidence.claim_from_validation",
      "mission.ledger.apply_evidence_claims",
    );
  }
  if (input.canDoWebResearch && input.roleClass !== "orchestration") {
    tools.push("planning.research.request_brief");
  }
  if (input.workflowId === "agent_team.product_spec_planning" && input.roleClass === "planning") {
    tools.push("planning.framework_contract.record");
  }
  if (input.canCreatePlanningCapsules && input.roleClass !== "orchestration") {
    tools.push("planning.capsule.draft", "planning.capsule.revise");
  }
  if (input.canProposeChildActions && input.roleClass !== "orchestration") {
    tools.push("planning.action_graph.propose");
  }
  if ((input.canRequestHumanInput && input.roleClass !== "orchestration") || input.roleClass === "human") {
    tools.push("planning.human_decision.request");
  }
  if (input.roleClass === "closeout") {
    tools.push("planning.closeout.summarize");
  }
  if (input.roleClass === "planning" || input.roleClass === "research" || input.roleClass === "review") {
    tools.push("resource.ledger.report_relevant_resource", "resource.ledger.recommend_domain_validation");
  }
  if (tools.length === 0 && input.roleClass !== "orchestration") {
    tools.push("worker.action.perform");
  }
  return unique(tools, 32);
}

export function sharedDomainEvidenceKindsForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): string[] {
  const profile = buildSharedDomainResourceLifecycleProfile(
    sharedDomainProfileIdForCapabilityTraits(input),
  );
  return unique(
    [
      ...profile.evidenceKinds,
      input.canEditSource ? "source_change" : null,
      input.canWriteTests || input.canRunValidation ? "test_validation" : null,
      input.canDoWebResearch ? "research_brief" : null,
      input.workflowId === "agent_team.product_spec_planning" ? "planning_intent" : null,
      input.workflowId === "agent_team.product_spec_planning"
        ? "planning_framework_contract"
        : null,
      input.canCreatePlanningCapsules ? "planning_capsule" : null,
      input.canProposeChildActions ? "action_graph_proposal" : null,
      input.canRunValidation && input.workflowId === "agent_team.product_spec_planning"
        ? "compile_readiness"
        : null,
      input.canRequestHumanInput || input.roleClass === "human" ? "human_decision" : null,
      input.roleClass === "review" ? "review" : null,
      input.roleClass === "observability" ? "readback" : null,
      input.roleClass === "closeout" ? "closeout" : null,
    ],
    32,
  );
}

export function sharedDomainRequiredPacketKindsForCapabilityTraits(
  input: SharedDomainCapabilityTraits,
): string[] {
  const profile = buildSharedDomainResourceLifecycleProfile(
    sharedDomainProfileIdForCapabilityTraits(input),
  );
  return unique(
    [
      ...profile.requiredPacketKinds,
      input.canEditSource || input.canWriteTests ? "coding_resource_packet" : null,
      input.roleClass === "planning" ? "planning_domain_resource_packet" : null,
    ],
    24,
  );
}

export function validateSharedDomainLifecycleCapability(input: {
  capabilityId: string;
  workflowId: string;
  domainProfileId: string;
  canEditSource: boolean;
  canWriteTests: boolean;
  requiredSnapshotKinds: readonly string[];
  allowedLifecycleTransitions: readonly string[];
  domainResourceKinds: readonly string[];
  domainWorkerActionToolIds: readonly string[];
}): { valid: boolean; reasonCodes: string[]; rawPromptStored: false; rawResponseStored: false } {
  const reasonCodes: string[] = [];
  const parsedProfile = SharedDomainProfileIdSchema.safeParse(input.domainProfileId);
  if (!parsedProfile.success) {
    reasonCodes.push("shared_domain_lifecycle_profile_invalid");
  }
  const planningProfile = input.domainProfileId === "product_spec_planning";
  if (planningProfile && (input.canEditSource || input.canWriteTests)) {
    reasonCodes.push("shared_domain_planning_profile_must_not_grant_file_edit_traits");
  }
  if (
    planningProfile &&
    input.requiredSnapshotKinds.some((kind) =>
      ["target_file_snapshot", "target_snapshot"].includes(kind),
    )
  ) {
    reasonCodes.push("shared_domain_planning_profile_must_not_require_file_snapshots");
  }
  if (
    planningProfile &&
    input.domainWorkerActionToolIds.some((toolId) => toolId.startsWith("worker.edit."))
  ) {
    reasonCodes.push("shared_domain_planning_profile_must_not_expose_file_edit_tools");
  }
  if (
    planningProfile &&
    input.allowedLifecycleTransitions.some((toolId) => toolId.startsWith("worker.patch."))
  ) {
    reasonCodes.push("shared_domain_planning_profile_must_not_expose_patch_author_tools");
  }
  if (
    input.workflowId === "agent_team.coding" &&
    (input.canEditSource || input.canWriteTests) &&
    !input.domainWorkerActionToolIds.includes("worker.edit.plan")
  ) {
    reasonCodes.push("shared_domain_coding_edit_profile_missing_edit_plan_tool");
  }
  if (
    input.domainResourceKinds.some((kind) =>
      ["resource_fulfillment", "context_supply", "write_gate"].includes(kind),
    )
  ) {
    reasonCodes.push("shared_domain_retired_resource_kind_present");
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes:
      reasonCodes.length === 0
        ? ["shared_domain_lifecycle_capability_valid"]
        : [...new Set(reasonCodes)],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function sharedDomainLifecycleProfileManifestForMetadata(
  profile: SharedDomainLifecycleProfile,
): JsonValue {
  return {
    artifactKind: profile.artifactKind,
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    genericLifecycleOwner: profile.genericLifecycleOwner,
    resourceKindCount: profile.resourceKinds.length,
    actionGateKindCount: profile.actionGateKinds.length,
    workerActionToolCount: profile.workerActionToolIds.length,
    evidenceKindCount: profile.evidenceKinds.length,
    requiredPacketKindCount: profile.requiredPacketKinds.length,
    runtimeSemanticJudgmentAllowed: false,
    compatibilityFallbackAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
