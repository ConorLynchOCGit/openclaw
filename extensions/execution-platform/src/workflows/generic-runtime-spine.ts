import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import type {
  RuntimeWorkGraphNodeExecutor,
  RuntimeWorkGraphSchedulerOptions,
  RuntimeWorkGraphSchedulerResult,
} from "./runtime-work-graph-scheduler.ts";
import {
  RuntimeWorkflowGraphEngine,
  type RuntimeWorkflowGraphEngineReadiness,
} from "./runtime-workflow-graph-engine.ts";
import {
  DEFAULT_WORKFLOW_DEFINITION_REGISTRY,
  type WorkflowDefinitionRegistry,
} from "./workflow-definition-registry.ts";
import {
  DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
  type WorkflowPluginRegistry,
} from "./workflow-plugin-registry.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export const GENERIC_RUNTIME_SPINE_ID = "generic-runtime-spine.v1";

export const GENERIC_RUNTIME_SPINE_READINESS_ARTIFACT_TYPE =
  "execution.generic_runtime_spine_readiness";

export const GENERIC_RUNTIME_SPINE_LIFECYCLE_ARTIFACT_TYPE =
  "execution.generic_runtime_spine_lifecycle";

export type GenericRuntimeSpineStatus =
  | "succeeded"
  | "needs_review"
  | "failed"
  | "waiting_for_human"
  | "canceled";

export type GenericRuntimeSpineReadiness = {
  artifactKind: "generic_runtime_spine_readiness";
  spineId: typeof GENERIC_RUNTIME_SPINE_ID;
  workflowId: string;
  ready: boolean;
  workflowEngineReadiness: RuntimeWorkflowGraphEngineReadiness;
  schedulerPolicyReady: boolean;
  schedulerPolicyReasonCodes: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GenericRuntimeSpineSchedulerOptionReadiness = {
  artifactKind: "generic_runtime_spine_scheduler_option_readiness";
  spineId: typeof GENERIC_RUNTIME_SPINE_ID;
  workflowId: string;
  ready: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GenericRuntimeSpineLifecycleEvaluation = {
  artifactKind: "generic_runtime_spine_lifecycle_evaluation";
  spineId: typeof GENERIC_RUNTIME_SPINE_ID;
  workflowId: string;
  runtimeJobId: string;
  status: GenericRuntimeSpineStatus;
  schedulerStatus: RuntimeWorkGraphSchedulerResult["status"] | null;
  graphId: string | null;
  graphEvidenceAccepted: boolean;
  executedNodeIds: string[];
  addedNodeIds: string[];
  decisionRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GenericRuntimeSpineOptions = {
  registry?: WorkflowDefinitionRegistry;
  pluginRegistry?: WorkflowPluginRegistry;
  graphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
};

export function genericRuntimeSpineSchedulerPolicyReasonCodes(
  plugin: WorkflowPlugin | null,
): string[] {
  if (!plugin?.productionEnabled) {
    return [];
  }
  const reasonCodes: string[] = [];
  if (!plugin.schedulerPolicy.stagedSchedulerProtocolRequired) {
    reasonCodes.push("generic_orchestration_staged_scheduler_protocol_required");
  }
  if (!plugin.schedulerPolicy.stagedGraphAcceptanceRequired) {
    reasonCodes.push("generic_orchestration_staged_graph_acceptance_required");
  }
  if (!plugin.schedulerPolicy.runtimeDerivedNodeEnvelopeRequired) {
    reasonCodes.push("generic_orchestration_runtime_derived_node_envelope_required");
  }
  if (!plugin.schedulerPolicy.runtimeDerivedExpectedEvidenceRequired) {
    reasonCodes.push("generic_orchestration_runtime_derived_expected_evidence_required");
  }
  if (!plugin.schedulerPolicy.modelAuthoredStructureReviewRequired) {
    reasonCodes.push("generic_orchestration_model_authored_structure_review_required");
  }
  if (!plugin.schedulerPolicy.firstNodeApprovalRequired) {
    reasonCodes.push("generic_orchestration_first_node_approval_required");
  }
  return reasonCodes;
}

export function genericRuntimeSpineSchedulerOptionsReasonCodes(input: {
  plugin: WorkflowPlugin | null | undefined;
  schedulerOptions: Omit<RuntimeWorkGraphSchedulerOptions, "graphs">;
}): string[] {
  if (!input.plugin?.productionEnabled) {
    return [];
  }
  const reasonCodes: string[] = [];
  if (
    input.plugin.schedulerPolicy.stagedSchedulerProtocolRequired &&
    input.schedulerOptions.requireGenericStagedSchedulerProtocol !== true
  ) {
    reasonCodes.push("generic_orchestration_scheduler_option_staged_protocol_missing");
  }
  if (
    input.plugin.schedulerPolicy.modelAuthoredWorkPacketsRequiredForComplexMission &&
    input.schedulerOptions.requireModelAuthoredCommitmentWorkPacketsForComplexMission !== true
  ) {
    reasonCodes.push("generic_orchestration_scheduler_option_work_packets_missing");
  }
  if (
    input.plugin.schedulerPolicy.nodeExecutionPacketRequiredForWorkerExecution === true &&
    input.schedulerOptions.requireNodeExecutionPacketForWorkerExecution !== true
  ) {
    reasonCodes.push("generic_orchestration_scheduler_option_node_execution_packet_missing");
  }
  return reasonCodes;
}

export function genericRuntimeSpineHasAcceptedGraphEvidence(
  result: RuntimeWorkGraphSchedulerResult,
): boolean {
  return (
    result.graphId.trim().length > 0 &&
    (result.executedNodeIds.length > 0 ||
      result.addedNodeIds.length > 0 ||
      result.decisionRefs.length > 0)
  );
}

export function genericRuntimeSpineStatusFromSchedulerResult(
  result: RuntimeWorkGraphSchedulerResult,
): GenericRuntimeSpineStatus {
  if (result.status === "waiting_for_human") {
    return "waiting_for_human";
  }
  if (result.status === "failed") {
    return "failed";
  }
  if (result.status === "succeeded" && genericRuntimeSpineHasAcceptedGraphEvidence(result)) {
    return "succeeded";
  }
  return "needs_review";
}

export class GenericRuntimeSpine {
  private readonly workflowEngine: RuntimeWorkflowGraphEngine;

  constructor(private readonly options: GenericRuntimeSpineOptions) {
    this.workflowEngine = new RuntimeWorkflowGraphEngine({
      registry: options.registry ?? DEFAULT_WORKFLOW_DEFINITION_REGISTRY,
      pluginRegistry: options.pluginRegistry ?? DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
      graphs: options.graphs,
      runtimeToolKernel: options.runtimeToolKernel ?? null,
    });
  }

  requireDefinition(workflowId: string) {
    return this.workflowEngine.requireDefinition(workflowId);
  }

  evaluateReadiness(input: {
    workflowId: string;
    executors: Record<string, RuntimeWorkGraphNodeExecutor>;
    plugin?: WorkflowPlugin | null;
    availableRuntimeToolFamilies?: RuntimeToolFamily[];
  }): GenericRuntimeSpineReadiness {
    const workflowEngineReadiness = this.workflowEngine.evaluateReadiness(input);
    const schedulerPolicyReasonCodes = genericRuntimeSpineSchedulerPolicyReasonCodes(
      input.plugin ?? null,
    );
    const reasonCodes = [
      "generic_runtime_spine_readiness_evaluated",
      ...workflowEngineReadiness.reasonCodes,
      ...schedulerPolicyReasonCodes,
    ];
    return {
      artifactKind: "generic_runtime_spine_readiness",
      spineId: GENERIC_RUNTIME_SPINE_ID,
      workflowId: workflowEngineReadiness.workflowId,
      ready: workflowEngineReadiness.ready && schedulerPolicyReasonCodes.length === 0,
      workflowEngineReadiness,
      schedulerPolicyReady: schedulerPolicyReasonCodes.length === 0,
      schedulerPolicyReasonCodes,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  evaluateSchedulerOptions(input: {
    workflowId: string;
    plugin: WorkflowPlugin | null | undefined;
    schedulerOptions: Omit<RuntimeWorkGraphSchedulerOptions, "graphs">;
  }): GenericRuntimeSpineSchedulerOptionReadiness {
    const reasonCodes = genericRuntimeSpineSchedulerOptionsReasonCodes(input);
    return {
      artifactKind: "generic_runtime_spine_scheduler_option_readiness",
      spineId: GENERIC_RUNTIME_SPINE_ID,
      workflowId: input.workflowId,
      ready: reasonCodes.length === 0,
      reasonCodes: reasonCodes.length
        ? ["generic_runtime_spine_scheduler_options_not_ready", ...reasonCodes]
        : ["generic_runtime_spine_scheduler_options_ready"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  evaluateSchedulerResult(input: {
    runtimeJob: RuntimeJob;
    workflowId: string;
    schedulerResult: RuntimeWorkGraphSchedulerResult;
  }): GenericRuntimeSpineLifecycleEvaluation {
    const graphEvidenceAccepted = genericRuntimeSpineHasAcceptedGraphEvidence(
      input.schedulerResult,
    );
    const status = genericRuntimeSpineStatusFromSchedulerResult(input.schedulerResult);
    const reasonCodes = [
      "generic_runtime_spine_scheduler_result_evaluated",
      ...input.schedulerResult.reasonCodes,
      ...(graphEvidenceAccepted ? ["generic_orchestration_runtime_graph_evidence_present"] : []),
      ...(input.schedulerResult.status === "succeeded" && !graphEvidenceAccepted
        ? ["generic_orchestration_runtime_graph_evidence_missing"]
        : []),
    ].slice(0, 80);
    return {
      artifactKind: "generic_runtime_spine_lifecycle_evaluation",
      spineId: GENERIC_RUNTIME_SPINE_ID,
      workflowId: input.workflowId,
      runtimeJobId: input.runtimeJob.jobId,
      status,
      schedulerStatus: input.schedulerResult.status,
      graphId: input.schedulerResult.graphId,
      graphEvidenceAccepted,
      executedNodeIds: input.schedulerResult.executedNodeIds,
      addedNodeIds: input.schedulerResult.addedNodeIds,
      decisionRefs: input.schedulerResult.decisionRefs,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}

export function genericRuntimeSpineReadinessArtifactMetadata(
  readiness: GenericRuntimeSpineReadiness,
): JsonValue {
  return {
    artifactKind: readiness.artifactKind,
    spineId: readiness.spineId,
    workflowId: readiness.workflowId,
    ready: readiness.ready,
    schedulerPolicyReady: readiness.schedulerPolicyReady,
    schedulerPolicyReasonCodes: readiness.schedulerPolicyReasonCodes.slice(0, 80),
    reasonCodes: readiness.reasonCodes.slice(0, 80),
    workflowEngineReadiness: {
      artifactKind: readiness.workflowEngineReadiness.artifactKind,
      engineId: readiness.workflowEngineReadiness.engineId,
      workflowId: readiness.workflowEngineReadiness.workflowId,
      definitionId: readiness.workflowEngineReadiness.definitionId,
      pluginId: readiness.workflowEngineReadiness.pluginId,
      pluginReady: readiness.workflowEngineReadiness.pluginReady,
      ready: readiness.workflowEngineReadiness.ready,
      reasonCodes: readiness.workflowEngineReadiness.reasonCodes.slice(0, 80),
      missingExecutorKeys: readiness.workflowEngineReadiness.missingExecutorKeys.slice(0, 80),
      missingPluginExecutorKeys: readiness.workflowEngineReadiness.missingPluginExecutorKeys.slice(
        0,
        80,
      ),
      missingRuntimeToolFamilies:
        readiness.workflowEngineReadiness.missingRuntimeToolFamilies.slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  } satisfies JsonValue;
}

export function genericRuntimeSpineLifecycleArtifactMetadata(
  lifecycle: GenericRuntimeSpineLifecycleEvaluation,
): JsonValue {
  return {
    artifactKind: lifecycle.artifactKind,
    spineId: lifecycle.spineId,
    workflowId: lifecycle.workflowId,
    runtimeJobId: lifecycle.runtimeJobId,
    status: lifecycle.status,
    schedulerStatus: lifecycle.schedulerStatus,
    graphId: lifecycle.graphId,
    graphEvidenceAccepted: lifecycle.graphEvidenceAccepted,
    executedNodeIds: lifecycle.executedNodeIds.slice(0, 100),
    executedNodeCount: lifecycle.executedNodeIds.length,
    addedNodeIds: lifecycle.addedNodeIds.slice(0, 100),
    addedNodeCount: lifecycle.addedNodeIds.length,
    decisionRefs: lifecycle.decisionRefs.slice(0, 100),
    decisionRefCount: lifecycle.decisionRefs.length,
    reasonCodes: lifecycle.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  } satisfies JsonValue;
}
