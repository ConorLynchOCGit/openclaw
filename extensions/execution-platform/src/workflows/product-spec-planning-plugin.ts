import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  filterRuntimeNodeCapabilityManifestForExecutors,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import {
  PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE,
  type RuntimeWorkGraphNodeExecutor,
} from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export const PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID =
  "workflow-plugin.agent_team.product_spec_planning.v1";

export const PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS = [
  "role:orchestrator",
  "role:planning_orchestrator",
  "kind:orchestrator_plan",
  "kind:web_research",
  "kind:planning_capsule",
  "kind:human_task",
  "kind:action_graph_compile",
  "kind:compiler",
  "kind:closeout",
] as const;

export const PRODUCT_SPEC_PLANNING_PLUGIN_RUNTIME_TOOL_FAMILIES: RuntimeToolFamily[] = [
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
];

export function buildProductSpecPlanningWorkflowPlugin(input: {
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  definition?: WorkflowDefinition;
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  requireSchedulerToolKernel?: boolean;
}): WorkflowPlugin {
  const definition =
    input.definition ?? requireCanonicalWorkflowDefinition("agent_team.product_spec_planning");
  const executableExecutorKeys = Object.keys(input.executors);
  const capabilityManifest =
    input.capabilityManifest ??
    filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys,
      workflowId: definition.workflowId,
    });
  const capabilityRegistrySummary = runtimeNodeCapabilityManifestForModel({
    executableExecutorKeys,
    workflowId: definition.workflowId,
  });
  return {
    artifactKind: "workflow_plugin",
    pluginId: PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID,
    workflowId: definition.workflowId,
    definitionId: definition.definitionId,
    displayName: "Product And Spec Planning",
    status: "production_ready",
    productionEnabled: true,
    workflowDefinitionRef: `workflow-definition://${definition.definitionId}`,
    orchestrationPolicyRef: `workflow-orchestration-policy://${definition.orchestrationPolicy.policyId}`,
    roleCoverageProfile: PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE,
    capabilityProfileRefs: definition.capabilityProfileRefs,
    requiredPhases: definition.requiredPhases,
    optionalPhases: definition.optionalPhases,
    requiredRoleClasses: definition.requiredRoleClasses,
    optionalRoleClasses: definition.optionalRoleClasses,
    contextNeeds: definition.contextNeeds,
    allowedNodeKinds: definition.allowedNodeKinds,
    requiredNodeKinds: definition.requiredNodeKinds,
    nodeExecutorKeys: [...PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS],
    executors: input.executors,
    runtimeToolFamilies: PRODUCT_SPEC_PLANNING_PLUGIN_RUNTIME_TOOL_FAMILIES,
    modelPolicyRef: definition.modelPolicyRef,
    workerPolicyRef: definition.workerPolicyRef,
    evidenceProfileId: definition.evidenceProfileId,
    readbackPolicyRef: definition.orchestrationPolicy.readbackPolicyRef,
    closeoutPolicyRef: `closeout-policy://${definition.workflowId}/model-authored.v1`,
    completionReviewPolicyRef: definition.completionReviewPolicy.policyId,
    missionLedgerProfileRef: definition.missionLedgerProfileRef,
    humanTaskPolicyRef: definition.humanTaskPolicyRef,
    workQueueProjectionPolicyRef: definition.workQueueProjectionPolicyRef,
    liveProofRequirements: [
      ...definition.liveProofRequirements,
      "workflow_plugin_resolution",
      "planning_orchestrator_first_node",
      "product_spec_executor_coverage",
      "proposal_only_compile_boundary",
      "plugin_readback",
    ],
    schedulerPolicy: {
      requireMissionLedgerForExecutionWorkflow: true,
      requireCostAwareCapabilityPolicy: true,
      requireEvidenceClaimsForMissionLedger: true,
      requireSchedulerToolKernel: input.requireSchedulerToolKernel ?? true,
      stagedSchedulerProtocolRequired: true,
      stagedGraphAcceptanceRequired: true,
      modelAuthoredWorkPacketsRequiredForComplexMission: true,
      freshContextSnapshotsRequiredForWorkerExecution: true,
      nodeExecutionPacketRequiredForWorkerExecution: true,
      runtimeDerivedNodeEnvelopeRequired: true,
      runtimeDerivedExpectedEvidenceRequired: true,
      modelAuthoredStructureReviewRequired: true,
      firstNodeApprovalRequired: true,
      directImplementationFirstMovePolicy: "simple_only",
      broadImplementationFirstMoveAllowed: false,
      degradedCloseoutSuccessAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    schedulerOptions: {
      requireMissionLedgerForExecutionWorkflow: true,
      requireCostAwareCapabilityPolicy: true,
      requireEvidenceClaimsForMissionLedger: true,
      requireSchedulerToolKernel: input.requireSchedulerToolKernel ?? true,
      requireGenericStagedSchedulerProtocol: true,
      requireFreshContextSnapshotsForWorkerExecution: true,
      requireNodeExecutionPacketForWorkerExecution: true,
      roleCoverageProfile: PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE,
      entryNodePolicy: definition.orchestrationPolicy.entryNodePolicy,
      capabilityRegistrySummary,
      capabilityManifest,
      maxParallelNodeExecutions: 4,
    },
    validationExpectations: [
      "planning_orchestrator_runs_first",
      "research_brief_bounded_when_used",
      "planning_capsule_lifecycle_validated",
      "human_decision_refs_bounded_when_required",
      "action_graph_proposal_validated",
      "compile_readiness_without_child_execution",
      "work_queue_readback_present",
      "model_authored_closeout_present",
      "completion_review_gate_accepted",
    ],
    readbackProjectionRefs: [
      "work-queue-readback://product-spec-planning/mode",
      "work-queue-readback://product-spec-planning/capsules",
      "work-queue-readback://product-spec-planning/research",
      "work-queue-readback://product-spec-planning/human-decisions",
      "work-queue-readback://product-spec-planning/action-graph-proposals",
      "work-queue-readback://product-spec-planning/compile-readiness",
      "work-queue-readback://active-graph-progress",
      "work-queue-readback://completion-review",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}
