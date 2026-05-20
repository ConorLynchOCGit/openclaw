import type { JsonValue } from "../runtime-job-repository.ts";
import {
  ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE,
  CODING_TEAM_ROLE_COVERAGE_PROFILE,
  PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE,
} from "./runtime-work-graph-scheduler.ts";
import {
  DEEP_COMPLETION_REVIEW_QUESTION,
  validateWorkflowDefinition,
  type WorkflowCompletionReviewPolicy,
  type WorkflowDefinition,
  type WorkflowDefinitionStatus,
} from "./workflow-definition.ts";
import { workflowEvidenceProfileForWorkflow } from "./workflow-evidence-profile.ts";
import {
  type WorkflowContextNeed,
  type WorkflowOrchestrationPolicy,
  type WorkflowPhase,
  type WorkflowRoleClass,
} from "./workflow-orchestration-policy.ts";

export const CANONICAL_WORKFLOW_RUNTIME_ENGINE_WORK_ITEM_ID =
  "openclaw-convergence.workflow-runtime-01-definition-registry";

function completionReviewPolicy(workflowId: string): WorkflowCompletionReviewPolicy {
  return {
    required: true,
    policyId: `${workflowId}.completion_review.v1`,
    reviewerRoleClass: "review",
    modelPolicyRef: "model-policy://workflow-completion-review/model-authored",
    requiredEvidenceClasses: [
      "runtime_graph",
      "scheduler_tool_trace",
      "worker_tool_trace",
      "validation",
      "review",
      "closeout",
      "work_queue_readback",
    ],
    allowedOutcomes: ["accepted", "needs_review", "failed"],
    deepCompletionQuestion: DEEP_COMPLETION_REVIEW_QUESTION,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function closeoutPolicy(): WorkflowDefinition["closeoutPolicy"] {
  return {
    closeoutRequired: true,
    modelAuthoredRequired: true,
    runtimeToolFamily: "closeout.generate",
    degradedCloseoutSuccessAllowed: false,
  };
}

const GENERIC_REQUIRED_PHASES: WorkflowPhase[] = [
  "mission_ledger",
  "commitment_packet_authoring",
  "context_supply",
  "work_breakdown",
  "capability_selection",
  "graph_compile",
  "structure_review",
  "graph_acceptance",
  "node_execution",
  "node_result_review",
  "repair_or_escalation",
  "validation",
  "readback",
  "closeout",
  "completion_review",
];

const DEFAULT_OPTIONAL_PHASES: WorkflowPhase[] = ["human_decision"];

function contextNeed(input: {
  workflowId: string;
  roleClass: WorkflowRoleClass;
  required: boolean;
  sourcePromptAccess?: WorkflowContextNeed["sourcePromptAccess"];
  repoContextAccess?: WorkflowContextNeed["repoContextAccess"];
  externalContextAccess?: WorkflowContextNeed["externalContextAccess"];
  reasonCode: string;
}): WorkflowContextNeed {
  return {
    contextNeedId: `${input.workflowId}.${input.roleClass}.context.v1`,
    roleClass: input.roleClass,
    required: input.required,
    sourcePromptAccess: input.sourcePromptAccess ?? "bounded_excerpt_request",
    repoContextAccess: input.repoContextAccess ?? "candidate_refs",
    externalContextAccess: input.externalContextAccess ?? "artifact_refs",
    handoffPacketRequired: true,
    reasonCodes: [input.reasonCode],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function sourcePromptPolicy(workflowId: string): WorkflowDefinition["sourcePromptPolicy"] {
  return {
    policyId: `${workflowId}.source_prompt.v1`,
    fullPromptVolatileInputAllowed: true,
    sourcePromptIndexRequired: true,
    boundedExcerptRequestsAllowed: true,
    rawPromptPersistenceAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function capabilityPolicy(workflowId: string): WorkflowDefinition["capabilityPolicy"] {
  return {
    policyId: `${workflowId}.capability_utility.v1`,
    cheapestSufficientWorkerRequired: true,
    contextDistributionValueRequired: true,
    roleSpecializationRequired: true,
    parallelismValueRequired: true,
    escalationCostRequired: true,
    expensiveBroadWorkerMonopolyBlocked: true,
    qualificationEvidenceRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function humanDecisionPolicy(workflowId: string): WorkflowDefinition["humanDecisionPolicy"] {
  return {
    policyId: `${workflowId}.human_decision.v1`,
    allowed: true,
    requiredWhenBlocked: true,
    boundedInputRefsOnly: true,
    resumeRequired: true,
    expirationRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function orchestrationPolicy(input: {
  workflowId: string;
  evidenceProfileId: string;
  requiredPhases: WorkflowPhase[];
  optionalPhases: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  optionalRoleClasses: WorkflowRoleClass[];
  allowedCapabilityIds: string[];
  contextNeeds: WorkflowContextNeed[];
  runtimeToolFamilies: WorkflowDefinition["runtimeToolFamilies"];
  complexWorkflow: boolean;
}): WorkflowOrchestrationPolicy {
  return {
    policyId: `${input.workflowId}.orchestration.v1`,
    workflowId: input.workflowId,
    complexWorkflow: input.complexWorkflow,
    requiredPhases: input.requiredPhases,
    optionalPhases: input.optionalPhases,
    requiredRoleClasses: input.requiredRoleClasses,
    optionalRoleClasses: input.optionalRoleClasses,
    allowedCapabilityIds: input.allowedCapabilityIds,
    contextNeeds: input.contextNeeds,
    sourcePromptPolicy: sourcePromptPolicy(input.workflowId),
    capabilityPolicy: capabilityPolicy(input.workflowId),
    humanDecisionPolicy: humanDecisionPolicy(input.workflowId),
    evidenceProfileId: input.evidenceProfileId,
    evidenceClassesByPhase: {
      mission_ledger: ["runtime_graph"],
      commitment_packet_authoring: ["runtime_graph"],
      context_supply: ["worker_tool_trace"],
      node_execution: ["worker_tool_trace"],
      validation: ["validation"],
      readback: ["work_queue_readback"],
      closeout: ["closeout"],
      completion_review: ["review"],
    },
    runtimeToolFamilies: input.runtimeToolFamilies,
    closeoutPolicyRef: `closeout-policy://${input.workflowId}/model-authored.v1`,
    finalizationPolicyRef: `finalization-policy://${input.workflowId}/evidence-first.v1`,
    readbackPolicyRef: `readback-policy://${input.workflowId}/owner-visible-runtime-graph.v1`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

function baseDefinition(input: {
  workflowId: string;
  displayName: string;
  workflowKind: WorkflowDefinition["workflowKind"];
  status: WorkflowDefinitionStatus;
  productionEnabled: boolean;
  schedulerBacked: boolean;
  compatibilityOnly?: boolean;
  roleCoverageProfileRef: string;
  capabilityProfileRefs: string[];
  allowedNodeKinds: string[];
  requiredNodeKinds: string[];
  nodeExecutorKeys: string[];
  runtimeToolFamilies?: WorkflowDefinition["runtimeToolFamilies"];
  requiredPhases?: WorkflowPhase[];
  optionalPhases?: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  optionalRoleClasses?: WorkflowRoleClass[];
  allowedCapabilityIds?: string[];
  contextNeeds: WorkflowContextNeed[];
  liveProofRequirements?: string[];
}): WorkflowDefinition {
  const evidenceProfile = workflowEvidenceProfileForWorkflow(input.workflowId);
  const runtimeToolFamilies = input.runtimeToolFamilies ?? [
    "scheduler.decompose_graph",
    "scheduler.select_next_node",
    "worker.invoke",
    "closeout.generate",
  ];
  const requiredPhases = input.requiredPhases ?? GENERIC_REQUIRED_PHASES;
  const optionalPhases = input.optionalPhases ?? DEFAULT_OPTIONAL_PHASES;
  const allowedCapabilityIds = input.allowedCapabilityIds ?? input.allowedNodeKinds;
  const workflowOrchestrationPolicy = orchestrationPolicy({
    workflowId: input.workflowId,
    evidenceProfileId: evidenceProfile.profileId,
    requiredPhases,
    optionalPhases,
    requiredRoleClasses: input.requiredRoleClasses,
    optionalRoleClasses: input.optionalRoleClasses ?? [],
    allowedCapabilityIds,
    contextNeeds: input.contextNeeds,
    runtimeToolFamilies,
    complexWorkflow: input.schedulerBacked,
  });
  return {
    definitionId: `workflow-definition.${input.workflowId}.v1`,
    workflowId: input.workflowId,
    displayName: input.displayName,
    workflowKind: input.workflowKind,
    status: input.status,
    productionEnabled: input.productionEnabled,
    schedulerBacked: input.schedulerBacked,
    compatibilityOnly: input.compatibilityOnly ?? false,
    inputContractRef: `workflow-contract://${input.workflowId}/input.v1`,
    missionLedgerProfileRef: `mission-ledger://${input.workflowId}/profile.v1`,
    roleCoverageProfileRef: input.roleCoverageProfileRef,
    capabilityProfileRefs: input.capabilityProfileRefs,
    allowedNodeKinds: input.allowedNodeKinds,
    requiredNodeKinds: input.requiredNodeKinds,
    nodeExecutorKeys: input.nodeExecutorKeys,
    runtimeToolFamilies,
    modelPolicyRef: `model-policy://${input.workflowId}/default.v1`,
    workerPolicyRef: `worker-policy://${input.workflowId}/default.v1`,
    evidenceProfileId: evidenceProfile.profileId,
    requiredPhases,
    optionalPhases,
    allowedCapabilityIds,
    requiredRoleClasses: input.requiredRoleClasses,
    optionalRoleClasses: input.optionalRoleClasses ?? [],
    contextNeeds: input.contextNeeds,
    sourcePromptPolicy: workflowOrchestrationPolicy.sourcePromptPolicy,
    capabilityPolicy: workflowOrchestrationPolicy.capabilityPolicy,
    humanDecisionPolicy: workflowOrchestrationPolicy.humanDecisionPolicy,
    orchestrationPolicy: workflowOrchestrationPolicy,
    closeoutPolicy: closeoutPolicy(),
    completionReviewPolicy: completionReviewPolicy(input.workflowId),
    humanTaskPolicyRef: `human-task-policy://${input.workflowId}/default.v1`,
    workQueueProjectionPolicyRef: `work-queue-projection://${input.workflowId}/default.v1`,
    liveProofRequirements: input.liveProofRequirements ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function buildCanonicalWorkflowDefinitions(): WorkflowDefinition[] {
  return [
    baseDefinition({
      workflowId: "agent_team.coding",
      displayName: "Coding Agent Team",
      workflowKind: "agent_team",
      status: "production_ready",
      productionEnabled: true,
      schedulerBacked: true,
      roleCoverageProfileRef: CODING_TEAM_ROLE_COVERAGE_PROFILE.profileId,
      capabilityProfileRefs: [
        "capability-profile://agent_team.coding/context-implementation-validation-review.v1",
      ],
      requiredRoleClasses: [
        "orchestrator",
        "context",
        "implementation",
        "qa",
        "review",
        "closeout",
      ],
      optionalRoleClasses: ["docs", "architecture", "human", "observability"],
      allowedCapabilityIds: [
        "context_scout",
        "implementation_standard",
        "implementation_complex",
        "validation",
        "test_review",
        "repair",
        "reviewer",
        "human_task",
        "closeout",
      ],
      contextNeeds: [
        contextNeed({
          workflowId: "agent_team.coding",
          roleClass: "context",
          required: true,
          repoContextAccess: "verified_file_refs",
          reasonCode: "coding_requires_repo_context_supply_chain",
        }),
        contextNeed({
          workflowId: "agent_team.coding",
          roleClass: "implementation",
          required: true,
          repoContextAccess: "verified_file_refs",
          reasonCode: "coding_requires_worker_ready_commitment_packets",
        }),
      ],
      allowedNodeKinds: [
        "orchestrator_plan",
        "context_scout",
        "implementation",
        "validation",
        "test_review",
        "repair",
        "reviewer",
        "security_review",
        "docs_update",
        "observability_readback",
        "human_task",
        "closeout",
      ],
      requiredNodeKinds: ["context_scout", "implementation", "validation", "reviewer", "closeout"],
      nodeExecutorKeys: [
        "kind:context_scout",
        "kind:implementation",
        "kind:validation",
        "kind:test_review",
        "kind:repair",
        "kind:reviewer",
        "kind:closeout",
        "role:context_scout",
        "role:implementation_engineer",
        "role:test_engineer",
        "role:reviewer",
        "role:observability_scribe",
      ],
      runtimeToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "scheduler.evaluate_node_result",
        "scheduler.repair_decision",
        "source_prompt.context",
        "context_scout.tool_loop",
        "code_intelligence.query",
        "worker.invoke",
        "model.call",
        "file_edit.propose",
        "file_edit.apply",
        "edit_transaction.lifecycle",
        "validation.run",
        "validation.review",
        "work_queue.project_event",
        "human_task.request",
        "human_task.resume",
        "closeout.generate",
        "closeout.finalize",
      ],
      liveProofRequirements: [
        "definition_resolution",
        "mission_ledger",
        "runtime_graph",
        "runtime_tool_traces",
        "workflow_evidence_profile",
        "completion_review",
        "model_authored_closeout",
      ],
    }),
    baseDefinition({
      workflowId: "agent_team.product_spec_planning",
      displayName: "Product And Spec Planning",
      workflowKind: "planning",
      status: "production_ready",
      productionEnabled: true,
      schedulerBacked: true,
      roleCoverageProfileRef: PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE.profileId,
      capabilityProfileRefs: ["capability-profile://agent_team.product_spec_planning/planning.v1"],
      requiredRoleClasses: ["orchestrator", "planning", "review", "closeout"],
      optionalRoleClasses: ["research", "human", "implementation", "observability"],
      allowedCapabilityIds: [
        "planning_orchestrator",
        "web_research",
        "planning_capsule",
        "action_graph_compile",
        "human_task",
        "reviewer",
        "closeout",
      ],
      contextNeeds: [
        contextNeed({
          workflowId: "agent_team.product_spec_planning",
          roleClass: "planning",
          required: true,
          repoContextAccess: "candidate_refs",
          externalContextAccess: "research_brief_refs",
          reasonCode: "planning_requires_source_prompt_and_project_context",
        }),
        contextNeed({
          workflowId: "agent_team.product_spec_planning",
          roleClass: "research",
          required: false,
          repoContextAccess: "none",
          externalContextAccess: "research_brief_refs",
          reasonCode: "planning_may_require_current_external_research",
        }),
      ],
      allowedNodeKinds: [
        "orchestrator_plan",
        "web_research",
        "planning_capsule",
        "human_task",
        "action_graph_compile",
        "reviewer",
        "closeout",
      ],
      requiredNodeKinds: ["orchestrator_plan", "planning_capsule", "closeout"],
      nodeExecutorKeys: [
        "role:orchestrator",
        "role:planning_orchestrator",
        "kind:orchestrator_plan",
        "kind:web_research",
        "kind:planning_capsule",
        "kind:human_task",
        "kind:action_graph_compile",
        "kind:compiler",
        "kind:closeout",
      ],
      runtimeToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "scheduler.evaluate_node_result",
        "scheduler.repair_decision",
        "worker.invoke",
        "model.call",
        "research.fetch",
        "validation.run",
        "human_task.request",
        "human_task.resume",
        "work_queue.project_event",
        "closeout.generate",
      ],
      liveProofRequirements: [
        "workflow_plugin_resolution",
        "planning_capsule",
        "research_brief_if_current_external_assumptions_needed",
        "action_graph_proposal",
        "compile_readiness",
        "human_decision_if_required",
        "model_authored_closeout",
      ],
    }),
    baseDefinition({
      workflowId: "agent_team.architecture_red_team",
      displayName: "Architecture Red-Team And Research Gate",
      workflowKind: "agent_team",
      status: "production_ready",
      productionEnabled: true,
      schedulerBacked: true,
      roleCoverageProfileRef: ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE.profileId,
      capabilityProfileRefs: [
        "capability-profile://agent_team.architecture_red_team/red-team-gate.v1",
      ],
      requiredRoleClasses: [
        "orchestrator",
        "planning",
        "research",
        "architecture",
        "review",
        "closeout",
      ],
      optionalRoleClasses: ["human", "observability"],
      allowedCapabilityIds: [
        "architecture_mapper",
        "assumption_extractor",
        "falsifiable_question_author",
        "narrow_web_researcher",
        "code_auditor",
        "model_contract_critic",
        "runtime_evidence_critic",
        "work_queue_planner",
        "final_recommendation_reviewer",
        "red_team_closeout",
      ],
      contextNeeds: [
        contextNeed({
          workflowId: "agent_team.architecture_red_team",
          roleClass: "architecture",
          required: true,
          repoContextAccess: "verified_file_refs",
          externalContextAccess: "artifact_refs",
          reasonCode: "architecture_red_team_requires_target_system_refs",
        }),
        contextNeed({
          workflowId: "agent_team.architecture_red_team",
          roleClass: "research",
          required: true,
          repoContextAccess: "candidate_refs",
          externalContextAccess: "research_brief_refs",
          reasonCode: "architecture_red_team_requires_narrow_research_refs",
        }),
        contextNeed({
          workflowId: "agent_team.architecture_red_team",
          roleClass: "review",
          required: true,
          repoContextAccess: "verified_file_refs",
          externalContextAccess: "artifact_refs",
          reasonCode: "architecture_red_team_requires_model_authored_final_review",
        }),
      ],
      allowedNodeKinds: [
        "architecture_spec",
        "reviewer",
        "planning_capsule",
        "web_research",
        "observability_readback",
        "action_graph_compile",
        "human_task",
        "closeout",
      ],
      requiredNodeKinds: [
        "architecture_spec",
        "reviewer",
        "web_research",
        "action_graph_compile",
        "closeout",
      ],
      nodeExecutorKeys: [
        "kind:architecture_spec",
        "kind:reviewer",
        "kind:planning_capsule",
        "kind:web_research",
        "kind:observability_readback",
        "kind:action_graph_compile",
        "kind:closeout",
      ],
      runtimeToolFamilies: [
        "scheduler.decompose_graph",
        "scheduler.select_next_node",
        "scheduler.evaluate_node_result",
        "scheduler.repair_decision",
        "worker.invoke",
        "model.call",
        "research.fetch",
        "validation.review",
        "work_queue.project_event",
        "closeout.generate",
        "closeout.finalize",
        "diagnostic.bounded",
      ],
      liveProofRequirements: [
        "architecture_boundary_map",
        "assumption_audit_matrix",
        "falsifiable_questions",
        "narrow_research_briefs",
        "code_gap_map",
        "risk_register",
        "proof_readiness_decision",
        "work_queue_readback",
        "model_authored_closeout",
      ],
    }),
    baseDefinition({
      workflowId: "single_agent.web_research",
      displayName: "Web Research Agent",
      workflowKind: "single_agent",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "single_agent.web_research.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://single_agent.web_research/research.v1"],
      requiredRoleClasses: ["research", "review", "closeout"],
      optionalRoleClasses: ["human", "observability"],
      allowedCapabilityIds: ["web_research", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "single_agent.web_research",
          roleClass: "research",
          required: true,
          repoContextAccess: "none",
          externalContextAccess: "research_brief_refs",
          reasonCode: "web_research_requires_bounded_research_brief_context",
        }),
      ],
      allowedNodeKinds: ["web_research", "reviewer", "closeout"],
      requiredNodeKinds: ["web_research", "closeout"],
      nodeExecutorKeys: ["capability:web_research", "kind:closeout"],
    }),
    baseDefinition({
      workflowId: "workflow.docs_skills",
      displayName: "Docs And Skills Workflow",
      workflowKind: "workflow",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "workflow.docs_skills.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://workflow.docs_skills/docs.v1"],
      requiredRoleClasses: ["docs", "qa", "review", "closeout"],
      optionalRoleClasses: ["context", "human", "observability"],
      allowedCapabilityIds: ["docs_update", "validation", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "workflow.docs_skills",
          roleClass: "docs",
          required: true,
          repoContextAccess: "candidate_refs",
          reasonCode: "docs_skills_requires_docs_context_and_validation_refs",
        }),
      ],
      allowedNodeKinds: ["docs_update", "reviewer", "validation", "closeout"],
      requiredNodeKinds: ["docs_update", "validation", "closeout"],
      nodeExecutorKeys: ["capability:docs_update", "kind:validation", "kind:closeout"],
    }),
    baseDefinition({
      workflowId: "workflow.qa_test",
      displayName: "QA/Test Workflow",
      workflowKind: "workflow",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "workflow.qa_test.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://workflow.qa_test/test.v1"],
      requiredRoleClasses: ["qa", "review", "closeout"],
      optionalRoleClasses: ["implementation", "human", "observability"],
      allowedCapabilityIds: ["validation", "test_review", "test_authoring", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "workflow.qa_test",
          roleClass: "qa",
          required: true,
          repoContextAccess: "candidate_refs",
          reasonCode: "qa_test_requires_validation_scope_and_artifact_refs",
        }),
      ],
      allowedNodeKinds: ["validation", "test_review", "test_authoring", "reviewer", "closeout"],
      requiredNodeKinds: ["validation", "reviewer", "closeout"],
      nodeExecutorKeys: ["kind:validation", "kind:test_review", "kind:reviewer", "kind:closeout"],
    }),
    baseDefinition({
      workflowId: "workflow.architecture",
      displayName: "Architecture/Spec Review",
      workflowKind: "workflow",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "workflow.architecture.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://workflow.architecture/review.v1"],
      requiredRoleClasses: ["architecture", "review", "closeout"],
      optionalRoleClasses: ["research", "human", "observability"],
      allowedCapabilityIds: ["architecture_spec", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "workflow.architecture",
          roleClass: "architecture",
          required: true,
          repoContextAccess: "candidate_refs",
          reasonCode: "architecture_requires_system_context_and_tradeoff_refs",
        }),
      ],
      allowedNodeKinds: ["architecture_spec", "reviewer", "closeout"],
      requiredNodeKinds: ["architecture_spec", "reviewer", "closeout"],
      nodeExecutorKeys: ["kind:architecture_spec", "kind:reviewer", "kind:closeout"],
    }),
    baseDefinition({
      workflowId: "workflow.design",
      displayName: "Design Workflow",
      workflowKind: "workflow",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "workflow.design.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://workflow.design/design.v1"],
      requiredRoleClasses: ["design", "review", "closeout"],
      optionalRoleClasses: ["research", "human", "observability"],
      allowedCapabilityIds: ["design_spec", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "workflow.design",
          roleClass: "design",
          required: true,
          repoContextAccess: "candidate_refs",
          reasonCode: "design_requires_product_context_and_visual_constraints",
        }),
      ],
      allowedNodeKinds: ["design_spec", "reviewer", "closeout"],
      requiredNodeKinds: ["design_spec", "reviewer", "closeout"],
      nodeExecutorKeys: ["kind:design_spec", "kind:reviewer", "kind:closeout"],
    }),
    baseDefinition({
      workflowId: "workflow.marketing",
      displayName: "Marketing Workflow",
      workflowKind: "workflow",
      status: "registered_needs_executor_migration",
      productionEnabled: false,
      schedulerBacked: true,
      roleCoverageProfileRef: "workflow.marketing.role_coverage.v1",
      capabilityProfileRefs: ["capability-profile://workflow.marketing/marketing.v1"],
      requiredRoleClasses: ["marketing", "review", "closeout"],
      optionalRoleClasses: ["research", "human", "observability"],
      allowedCapabilityIds: ["marketing_brief", "reviewer", "closeout"],
      contextNeeds: [
        contextNeed({
          workflowId: "workflow.marketing",
          roleClass: "marketing",
          required: true,
          repoContextAccess: "candidate_refs",
          externalContextAccess: "research_brief_refs",
          reasonCode: "marketing_requires_audience_context_and_research_refs",
        }),
      ],
      allowedNodeKinds: ["marketing_brief", "reviewer", "closeout"],
      requiredNodeKinds: ["marketing_brief", "reviewer", "closeout"],
      nodeExecutorKeys: ["kind:marketing_brief", "kind:reviewer", "kind:closeout"],
    }),
  ];
}

export type WorkflowDefinitionRegistrySummary = {
  artifactKind: "workflow_definition_registry_summary";
  definitionCount: number;
  productionReadyCount: number;
  migrationNeededCount: number;
  blockedCount: number;
  compatibilityOnlyCount: number;
  definitions: Array<{
    definitionId: string;
    workflowId: string;
    status: WorkflowDefinitionStatus;
    productionEnabled: boolean;
    schedulerBacked: boolean;
    evidenceProfileId: string;
    orchestrationPolicyId: string;
    requiredPhases: WorkflowPhase[];
    requiredRoleClasses: WorkflowRoleClass[];
    contextNeedCount: number;
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export class WorkflowDefinitionRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  constructor(definitions: WorkflowDefinition[] = buildCanonicalWorkflowDefinitions()) {
    for (const definition of definitions) {
      this.registerWorkflowDefinition(definition);
    }
  }

  registerWorkflowDefinition(definition: WorkflowDefinition): void {
    const validation = validateWorkflowDefinition(definition);
    if (!validation.valid) {
      throw new Error(
        `workflow_definition_invalid:${definition.workflowId}:${validation.reasonCodes.join(",")}`,
      );
    }
    if (this.definitions.has(definition.workflowId)) {
      throw new Error(`workflow_definition_duplicate:${definition.workflowId}`);
    }
    this.definitions.set(definition.workflowId, definition);
  }

  getWorkflowDefinition(workflowId: string | null | undefined): WorkflowDefinition | null {
    if (!workflowId) {
      return null;
    }
    return this.definitions.get(workflowId) ?? null;
  }

  requireWorkflowDefinition(workflowId: string): WorkflowDefinition {
    const definition = this.getWorkflowDefinition(workflowId);
    if (!definition) {
      throw new Error(`workflow_definition_missing:${workflowId}`);
    }
    return definition;
  }

  listWorkflowDefinitions(): WorkflowDefinition[] {
    return [...this.definitions.values()];
  }

  summarize(): WorkflowDefinitionRegistrySummary {
    const definitions = this.listWorkflowDefinitions();
    return {
      artifactKind: "workflow_definition_registry_summary",
      definitionCount: definitions.length,
      productionReadyCount: definitions.filter(
        (definition) => definition.status === "production_ready",
      ).length,
      migrationNeededCount: definitions.filter(
        (definition) => definition.status === "registered_needs_executor_migration",
      ).length,
      blockedCount: definitions.filter((definition) => definition.status === "blocked").length,
      compatibilityOnlyCount: definitions.filter((definition) => definition.compatibilityOnly)
        .length,
      definitions: definitions.map((definition) => ({
        definitionId: definition.definitionId,
        workflowId: definition.workflowId,
        status: definition.status,
        productionEnabled: definition.productionEnabled,
        schedulerBacked: definition.schedulerBacked,
        evidenceProfileId: definition.evidenceProfileId,
        orchestrationPolicyId: definition.orchestrationPolicy.policyId,
        requiredPhases: definition.requiredPhases,
        requiredRoleClasses: definition.requiredRoleClasses,
        contextNeedCount: definition.contextNeeds.length,
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
}

export const DEFAULT_WORKFLOW_DEFINITION_REGISTRY = new WorkflowDefinitionRegistry();

function buildCanonicalWorkflowDefinitionById(workflowId: string): WorkflowDefinition {
  const definition = buildCanonicalWorkflowDefinitions().find(
    (candidate) => candidate.workflowId === workflowId,
  );
  if (!definition) {
    throw new Error(`canonical_workflow_definition_missing:${workflowId}`);
  }
  return definition;
}

export function buildAgentTeamCodingWorkflowDefinition(): WorkflowDefinition {
  return buildCanonicalWorkflowDefinitionById("agent_team.coding");
}

export function buildProductSpecPlanningWorkflowDefinition(): WorkflowDefinition {
  return buildCanonicalWorkflowDefinitionById("agent_team.product_spec_planning");
}

export function buildArchitectureRedTeamWorkflowDefinition(): WorkflowDefinition {
  return buildCanonicalWorkflowDefinitionById("agent_team.architecture_red_team");
}

export function defaultWorkflowDefinitions(): Array<[string, () => WorkflowDefinition]> {
  return [
    ["agent_team.architecture_red_team", buildArchitectureRedTeamWorkflowDefinition],
    ["agent_team.coding", buildAgentTeamCodingWorkflowDefinition],
    ["agent_team.product_spec_planning", buildProductSpecPlanningWorkflowDefinition],
  ];
}

export function requireCanonicalWorkflowDefinition(workflowId: string): WorkflowDefinition {
  return DEFAULT_WORKFLOW_DEFINITION_REGISTRY.requireWorkflowDefinition(workflowId);
}

export function listCanonicalWorkflowDefinitions(): WorkflowDefinition[] {
  return DEFAULT_WORKFLOW_DEFINITION_REGISTRY.listWorkflowDefinitions();
}

export function summarizeCanonicalWorkflowDefinitionRegistry(): WorkflowDefinitionRegistrySummary {
  return DEFAULT_WORKFLOW_DEFINITION_REGISTRY.summarize();
}

export function workflowDefinitionRegistrySummaryMetadata(
  summary: WorkflowDefinitionRegistrySummary,
): JsonValue {
  return summary as unknown as JsonValue;
}
