import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import type {
  RuntimeWorkGraphRoleCoverageProfile,
  RuntimeWorkGraphSchedulerOptions,
} from "./runtime-work-graph-scheduler.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type {
  WorkflowContextNeed,
  WorkflowPhase,
  WorkflowRoleClass,
} from "./workflow-orchestration-policy.ts";

export const WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE = "execution.workflow_plugin_resolution";

export type WorkflowPluginStatus =
  | "production_ready"
  | "registered_needs_executor_migration"
  | "blocked"
  | "test_only";

export type WorkflowPluginSchedulerPolicy = {
  requireMissionLedgerForExecutionWorkflow: boolean;
  requireCostAwareCapabilityPolicy: boolean;
  requireEvidenceClaimsForMissionLedger: boolean;
  requireSchedulerToolKernel: boolean;
  stagedSchedulerProtocolRequired: boolean;
  stagedGraphAcceptanceRequired: boolean;
  modelAuthoredWorkPacketsRequiredForComplexMission: boolean;
  freshContextSnapshotsRequiredForWorkerExecution: boolean;
  nodeExecutionPacketRequiredForWorkerExecution?: boolean;
  runtimeDerivedNodeEnvelopeRequired: boolean;
  runtimeDerivedExpectedEvidenceRequired: boolean;
  modelAuthoredStructureReviewRequired: boolean;
  firstNodeApprovalRequired: boolean;
  directImplementationFirstMovePolicy: "simple_only" | "never";
  broadImplementationFirstMoveAllowed: false;
  degradedCloseoutSuccessAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowPluginSchedulerOptions = Pick<
  RuntimeWorkGraphSchedulerOptions,
  | "requireMissionLedgerForExecutionWorkflow"
  | "requireCostAwareCapabilityPolicy"
  | "requireEvidenceClaimsForMissionLedger"
  | "requireSchedulerToolKernel"
  | "requireGenericStagedSchedulerProtocol"
  | "requireFreshContextSnapshotsForWorkerExecution"
  | "requireNodeExecutionPacketForWorkerExecution"
  | "deferCloseoutUntilExecutableGraphComplete"
  | "roleCoverageProfile"
  | "capabilityRegistrySummary"
  | "capabilityManifest"
  | "entryNodePolicy"
  | "maxParallelNodeExecutions"
>;

export type WorkflowPlugin = {
  artifactKind: "workflow_plugin";
  pluginId: string;
  workflowId: string;
  definitionId: string;
  displayName: string;
  status: WorkflowPluginStatus;
  productionEnabled: boolean;
  workflowDefinitionRef: string;
  orchestrationPolicyRef: string;
  roleCoverageProfile: RuntimeWorkGraphRoleCoverageProfile;
  capabilityProfileRefs: string[];
  requiredPhases: WorkflowPhase[];
  optionalPhases: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  optionalRoleClasses: WorkflowRoleClass[];
  contextNeeds: WorkflowContextNeed[];
  allowedNodeKinds: string[];
  requiredNodeKinds: string[];
  nodeExecutorKeys: string[];
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  runtimeToolFamilies: RuntimeToolFamily[];
  modelPolicyRef: string;
  workerPolicyRef: string;
  evidenceProfileId: string;
  readbackPolicyRef: string;
  closeoutPolicyRef: string;
  completionReviewPolicyRef: string;
  missionLedgerProfileRef: string;
  humanTaskPolicyRef: string;
  workQueueProjectionPolicyRef: string;
  liveProofRequirements: string[];
  schedulerPolicy: WorkflowPluginSchedulerPolicy;
  schedulerOptions: WorkflowPluginSchedulerOptions;
  validationExpectations: string[];
  readbackProjectionRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowPluginValidation = {
  artifactKind: "workflow_plugin_validation";
  pluginId: string | null;
  workflowId: string | null;
  definitionId: string | null;
  valid: boolean;
  reasonCodes: string[];
  missingExecutorKeys: string[];
  missingRuntimeToolFamilies: RuntimeToolFamily[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowPluginResolution = {
  artifactKind: "workflow_plugin_resolution";
  pluginId: string;
  workflowId: string;
  definitionId: string;
  status: WorkflowPluginStatus;
  productionEnabled: boolean;
  executorKeys: string[];
  runtimeToolFamilies: RuntimeToolFamily[];
  evidenceProfileId: string;
  orchestrationPolicyRef: string;
  requiredPhases: WorkflowPhase[];
  requiredRoleClasses: WorkflowRoleClass[];
  contextNeedCount: number;
  roleCoverageProfileId: string;
  completionReviewRequired: boolean;
  stagedSchedulerProtocolRequired: boolean;
  stagedGraphAcceptanceRequired: boolean;
  freshContextSnapshotsRequiredForWorkerExecution: boolean;
  nodeExecutionPacketRequiredForWorkerExecution: boolean;
  runtimeDerivedNodeEnvelopeRequired: boolean;
  runtimeDerivedExpectedEvidenceRequired: boolean;
  modelAuthoredStructureReviewRequired: boolean;
  firstNodeApprovalRequired: boolean;
  directImplementationFirstMovePolicy: string;
  degradedCloseoutSuccessAllowed: false;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function nonEmpty(values: readonly string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function validateWorkflowPlugin(input: {
  plugin: WorkflowPlugin;
  definition: WorkflowDefinition;
  availableRuntimeToolFamilies?: RuntimeToolFamily[];
}): WorkflowPluginValidation {
  const { plugin, definition } = input;
  const reasonCodes: string[] = [];
  if (!plugin.pluginId.trim()) {
    reasonCodes.push("workflow_plugin_id_missing");
  }
  if (plugin.workflowId !== definition.workflowId) {
    reasonCodes.push("workflow_plugin_definition_workflow_mismatch");
  }
  if (plugin.definitionId !== definition.definitionId) {
    reasonCodes.push("workflow_plugin_definition_id_mismatch");
  }
  if (plugin.rawPromptStored || plugin.rawResponseStored || plugin.rawLogsStored) {
    reasonCodes.push("workflow_plugin_raw_storage_rejected");
  }
  if (plugin.productionEnabled && plugin.status !== "production_ready") {
    reasonCodes.push("workflow_plugin_not_production_ready");
  }
  if (plugin.productionEnabled && !definition.productionEnabled) {
    reasonCodes.push("workflow_plugin_definition_not_production_enabled");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.requireSchedulerToolKernel) {
    reasonCodes.push("workflow_plugin_scheduler_tool_kernel_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.stagedSchedulerProtocolRequired) {
    reasonCodes.push("workflow_plugin_staged_scheduler_protocol_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.stagedGraphAcceptanceRequired) {
    reasonCodes.push("workflow_plugin_staged_graph_acceptance_required");
  }
  if (
    plugin.productionEnabled &&
    !plugin.schedulerPolicy.modelAuthoredWorkPacketsRequiredForComplexMission
  ) {
    reasonCodes.push("workflow_plugin_model_authored_work_packets_required");
  }
  if (
    plugin.productionEnabled &&
    !plugin.schedulerPolicy.freshContextSnapshotsRequiredForWorkerExecution
  ) {
    reasonCodes.push("workflow_plugin_fresh_context_snapshots_required");
  }
  if (
    plugin.productionEnabled &&
    plugin.schedulerPolicy.nodeExecutionPacketRequiredForWorkerExecution !== true
  ) {
    reasonCodes.push("workflow_plugin_node_execution_packet_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.runtimeDerivedNodeEnvelopeRequired) {
    reasonCodes.push("workflow_plugin_runtime_derived_node_envelope_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.runtimeDerivedExpectedEvidenceRequired) {
    reasonCodes.push("workflow_plugin_runtime_derived_expected_evidence_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.modelAuthoredStructureReviewRequired) {
    reasonCodes.push("workflow_plugin_model_authored_structure_review_required");
  }
  if (plugin.productionEnabled && !plugin.schedulerPolicy.firstNodeApprovalRequired) {
    reasonCodes.push("workflow_plugin_first_node_approval_required");
  }
  if (
    plugin.productionEnabled &&
    !["simple_only", "never"].includes(plugin.schedulerPolicy.directImplementationFirstMovePolicy)
  ) {
    reasonCodes.push("workflow_plugin_direct_implementation_first_move_policy_invalid");
  }
  if (plugin.productionEnabled && plugin.schedulerPolicy.degradedCloseoutSuccessAllowed) {
    reasonCodes.push("workflow_plugin_degraded_closeout_rejected");
  }
  if (plugin.productionEnabled && plugin.schedulerPolicy.broadImplementationFirstMoveAllowed) {
    reasonCodes.push("workflow_plugin_broad_first_implementation_rejected");
  }
  if (plugin.evidenceProfileId !== definition.evidenceProfileId) {
    reasonCodes.push("workflow_plugin_evidence_profile_mismatch");
  }
  if (
    plugin.orchestrationPolicyRef !==
    `workflow-orchestration-policy://${definition.orchestrationPolicy.policyId}`
  ) {
    reasonCodes.push("workflow_plugin_orchestration_policy_mismatch");
  }
  for (const roleClass of definition.requiredRoleClasses) {
    if (!plugin.requiredRoleClasses.includes(roleClass)) {
      reasonCodes.push(`workflow_plugin_required_role_missing:${roleClass}`);
    }
  }
  for (const phase of definition.requiredPhases) {
    if (!plugin.requiredPhases.includes(phase)) {
      reasonCodes.push(`workflow_plugin_required_phase_missing:${phase}`);
    }
  }
  if (!nonEmpty(plugin.nodeExecutorKeys)) {
    reasonCodes.push("workflow_plugin_executor_keys_missing");
  }
  const executorKeys = new Set(Object.keys(plugin.executors));
  const missingExecutorKeys = plugin.nodeExecutorKeys.filter((key) => !executorKeys.has(key));
  if (plugin.productionEnabled && missingExecutorKeys.length > 0) {
    reasonCodes.push("workflow_plugin_executor_coverage_missing");
  }
  const availableToolFamilies = new Set(input.availableRuntimeToolFamilies ?? []);
  const missingRuntimeToolFamilies =
    availableToolFamilies.size === 0
      ? []
      : plugin.runtimeToolFamilies.filter((family) => !availableToolFamilies.has(family));
  if (plugin.productionEnabled && missingRuntimeToolFamilies.length > 0) {
    reasonCodes.push("workflow_plugin_runtime_tool_family_coverage_missing");
  }
  return {
    artifactKind: "workflow_plugin_validation",
    pluginId: plugin.pluginId || null,
    workflowId: plugin.workflowId || null,
    definitionId: plugin.definitionId || null,
    valid: reasonCodes.length === 0,
    reasonCodes,
    missingExecutorKeys,
    missingRuntimeToolFamilies,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function workflowPluginResolutionFor(input: {
  plugin: WorkflowPlugin;
  definition: WorkflowDefinition;
}): WorkflowPluginResolution {
  const validation = validateWorkflowPlugin(input);
  return {
    artifactKind: "workflow_plugin_resolution",
    pluginId: input.plugin.pluginId,
    workflowId: input.plugin.workflowId,
    definitionId: input.plugin.definitionId,
    status: input.plugin.status,
    productionEnabled: input.plugin.productionEnabled,
    executorKeys: input.plugin.nodeExecutorKeys.slice(0, 40),
    runtimeToolFamilies: input.plugin.runtimeToolFamilies.slice(0, 20),
    evidenceProfileId: input.plugin.evidenceProfileId,
    orchestrationPolicyRef: input.plugin.orchestrationPolicyRef,
    requiredPhases: input.plugin.requiredPhases,
    requiredRoleClasses: input.plugin.requiredRoleClasses,
    contextNeedCount: input.plugin.contextNeeds.length,
    roleCoverageProfileId: input.plugin.roleCoverageProfile.profileId,
    completionReviewRequired: input.definition.completionReviewPolicy.required,
    stagedSchedulerProtocolRequired: input.plugin.schedulerPolicy.stagedSchedulerProtocolRequired,
    stagedGraphAcceptanceRequired: input.plugin.schedulerPolicy.stagedGraphAcceptanceRequired,
    freshContextSnapshotsRequiredForWorkerExecution:
      input.plugin.schedulerPolicy.freshContextSnapshotsRequiredForWorkerExecution,
    nodeExecutionPacketRequiredForWorkerExecution:
      input.plugin.schedulerPolicy.nodeExecutionPacketRequiredForWorkerExecution === true,
    runtimeDerivedNodeEnvelopeRequired:
      input.plugin.schedulerPolicy.runtimeDerivedNodeEnvelopeRequired,
    runtimeDerivedExpectedEvidenceRequired:
      input.plugin.schedulerPolicy.runtimeDerivedExpectedEvidenceRequired,
    modelAuthoredStructureReviewRequired:
      input.plugin.schedulerPolicy.modelAuthoredStructureReviewRequired,
    firstNodeApprovalRequired: input.plugin.schedulerPolicy.firstNodeApprovalRequired,
    directImplementationFirstMovePolicy:
      input.plugin.schedulerPolicy.directImplementationFirstMovePolicy,
    degradedCloseoutSuccessAllowed: false,
    reasonCodes: [
      "workflow_plugin_resolved",
      ...(validation.valid ? ["workflow_plugin_valid"] : validation.reasonCodes),
    ].slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function workflowPluginResolutionArtifactMetadata(
  resolution: WorkflowPluginResolution,
): JsonValue {
  return resolution as unknown as JsonValue;
}
