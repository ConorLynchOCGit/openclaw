import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  filterRuntimeNodeCapabilityManifestForExecutors,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import {
  CODING_TEAM_ROLE_COVERAGE_PROFILE,
  type RuntimeWorkGraphNodeExecutor,
} from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export const AGENT_TEAM_CODING_WORKFLOW_PLUGIN_ID = "workflow-plugin.agent_team.coding.v1";
export const CODING_TEAM_PLUGIN_EXTRACTION_WORK_ITEM_ID =
  "openclaw-convergence.workflow-runtime-02-coding-plugin-extraction";

export const AGENT_TEAM_CODING_PLUGIN_EXECUTOR_KEYS = [
  "kind:context_scout",
  "kind:implementation",
  "kind:validation",
  "kind:test_review",
  "kind:repair",
  "kind:reviewer",
  "kind:observability_readback",
  "kind:human_task",
  "kind:closeout",
  "role:context_scout",
  "role:implementation_engineer",
  "role:test_engineer",
  "role:reviewer",
  "role:observability_scribe",
] as const;

export const AGENT_TEAM_CODING_PLUGIN_RUNTIME_TOOL_FAMILIES: RuntimeToolFamily[] = [
  "scheduler.decompose_graph",
  "scheduler.select_next_node",
  "scheduler.evaluate_node_result",
  "scheduler.repair_decision",
  "node.resource_materialization",
  "worker.invoke",
  "coding.compound",
  "source_prompt.context",
  "context_scout.tool_loop",
  "code_intelligence.query",
  "file_edit.propose",
  "file_edit.apply",
  "edit_transaction.lifecycle",
  "validation.run",
  "model.call",
  "human_task.request",
  "human_task.resume",
  "work_queue.project_event",
  "closeout.generate",
];

export function buildAgentTeamCodingWorkflowPlugin(input: {
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  definition?: WorkflowDefinition;
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  requireSchedulerToolKernel?: boolean;
}): WorkflowPlugin {
  const definition = input.definition ?? requireCanonicalWorkflowDefinition("agent_team.coding");
  const capabilityManifest =
    input.capabilityManifest ??
    filterRuntimeNodeCapabilityManifestForExecutors({
      executableExecutorKeys: Object.keys(input.executors),
    });
  const capabilityRegistrySummary = runtimeNodeCapabilityManifestForModel({
    executableExecutorKeys: Object.keys(input.executors),
  });
  return {
    artifactKind: "workflow_plugin",
    pluginId: AGENT_TEAM_CODING_WORKFLOW_PLUGIN_ID,
    workflowId: definition.workflowId,
    definitionId: definition.definitionId,
    displayName: "Coding Agent Team",
    status: "production_ready",
    productionEnabled: true,
    workflowDefinitionRef: `workflow-definition://${definition.definitionId}`,
    orchestrationPolicyRef: `workflow-orchestration-policy://${definition.orchestrationPolicy.policyId}`,
    roleCoverageProfile: CODING_TEAM_ROLE_COVERAGE_PROFILE,
    capabilityProfileRefs: definition.capabilityProfileRefs,
    requiredPhases: definition.requiredPhases,
    optionalPhases: definition.optionalPhases,
    requiredRoleClasses: definition.requiredRoleClasses,
    optionalRoleClasses: definition.optionalRoleClasses,
    contextNeeds: definition.contextNeeds,
    allowedNodeKinds: definition.allowedNodeKinds,
    requiredNodeKinds: definition.requiredNodeKinds,
    nodeExecutorKeys: [...AGENT_TEAM_CODING_PLUGIN_EXECUTOR_KEYS],
    executors: input.executors,
    runtimeToolFamilies: AGENT_TEAM_CODING_PLUGIN_RUNTIME_TOOL_FAMILIES,
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
      "plugin_executor_coverage",
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
      deferCloseoutUntilExecutableGraphComplete: true,
      roleCoverageProfile: CODING_TEAM_ROLE_COVERAGE_PROFILE,
      capabilityRegistrySummary,
      capabilityManifest,
      maxParallelNodeExecutions: 12,
    },
    validationExpectations: [
      "mission_ledger_commitments_closed",
      "source_change_evidence_when_required",
      "validation_refs_present",
      "review_refs_present",
      "workflow_evidence_profile_accepted",
      "model_authored_closeout_present",
      "completion_review_gate_accepted",
    ],
    readbackProjectionRefs: [
      "work-queue-readback://workflow-definition",
      "work-queue-readback://workflow-plugin",
      "work-queue-readback://runtime-workflow-engine",
      "work-queue-readback://active-graph-progress",
      "work-queue-readback://completion-review",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}
