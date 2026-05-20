import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  filterRuntimeNodeCapabilityManifestForExecutors,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import {
  ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE,
  type RuntimeWorkGraphNodeExecutor,
} from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export const ARCHITECTURE_RED_TEAM_WORKFLOW_PLUGIN_ID =
  "workflow-plugin.agent_team.architecture_red_team.v1";

export const ARCHITECTURE_RED_TEAM_PLUGIN_EXECUTOR_KEYS = [
  "kind:architecture_spec",
  "kind:reviewer",
  "kind:planning_capsule",
  "kind:web_research",
  "kind:observability_readback",
  "kind:action_graph_compile",
  "kind:closeout",
] as const;

export const ARCHITECTURE_RED_TEAM_PLUGIN_RUNTIME_TOOL_FAMILIES: RuntimeToolFamily[] = [
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
];

export function buildArchitectureRedTeamWorkflowPlugin(input: {
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  definition?: WorkflowDefinition;
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  requireSchedulerToolKernel?: boolean;
}): WorkflowPlugin {
  const definition =
    input.definition ?? requireCanonicalWorkflowDefinition("agent_team.architecture_red_team");
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
    pluginId: ARCHITECTURE_RED_TEAM_WORKFLOW_PLUGIN_ID,
    workflowId: definition.workflowId,
    definitionId: definition.definitionId,
    displayName: "Architecture Red-Team And Research Gate",
    status: "production_ready",
    productionEnabled: true,
    workflowDefinitionRef: `workflow-definition://${definition.definitionId}`,
    orchestrationPolicyRef: `workflow-orchestration-policy://${definition.orchestrationPolicy.policyId}`,
    roleCoverageProfile: ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE,
    capabilityProfileRefs: definition.capabilityProfileRefs,
    requiredPhases: definition.requiredPhases,
    optionalPhases: definition.optionalPhases,
    requiredRoleClasses: definition.requiredRoleClasses,
    optionalRoleClasses: definition.optionalRoleClasses,
    contextNeeds: definition.contextNeeds,
    allowedNodeKinds: definition.allowedNodeKinds,
    requiredNodeKinds: definition.requiredNodeKinds,
    nodeExecutorKeys: [...ARCHITECTURE_RED_TEAM_PLUGIN_EXECUTOR_KEYS],
    executors: input.executors,
    runtimeToolFamilies: ARCHITECTURE_RED_TEAM_PLUGIN_RUNTIME_TOOL_FAMILIES,
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
      "architecture_boundary_map",
      "assumption_audit_matrix",
      "falsifiable_questions",
      "narrow_research_briefs",
      "code_gap_map",
      "risk_register",
      "proof_readiness_decision",
      "model_authored_final_review",
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
      runtimeDerivedNodeEnvelopeRequired: true,
      runtimeDerivedExpectedEvidenceRequired: true,
      modelAuthoredStructureReviewRequired: true,
      firstNodeApprovalRequired: true,
      directImplementationFirstMovePolicy: "never",
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
      roleCoverageProfile: ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE,
      capabilityRegistrySummary,
      capabilityManifest,
      maxParallelNodeExecutions: 4,
    },
    validationExpectations: [
      "boundary_map_present",
      "assumptions_are_falsifiable",
      "narrow_research_refs_present_for_level_2",
      "code_gap_map_refs_present_for_level_2",
      "p0_blockers_block_proof_without_owner_acceptance",
      "proof_readiness_decision_present",
      "model_authored_final_review_present",
    ],
    readbackProjectionRefs: [
      "work-queue-readback://architecture-red-team/gate-level",
      "work-queue-readback://architecture-red-team/target-proof",
      "work-queue-readback://architecture-red-team/risk-counts",
      "work-queue-readback://architecture-red-team/research-refs",
      "work-queue-readback://architecture-red-team/code-gap-refs",
      "work-queue-readback://architecture-red-team/proof-readiness",
      "work-queue-readback://active-graph-progress",
      "work-queue-readback://completion-review",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}
