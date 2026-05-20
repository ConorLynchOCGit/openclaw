import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import type {
  RuntimeWorkGraphNodeExecutor,
  RuntimeWorkGraphSchedulerOptions,
  RuntimeWorkGraphSchedulerResult,
} from "./runtime-work-graph-scheduler.ts";
import { RuntimeWorkGraphScheduler } from "./runtime-work-graph-scheduler.ts";
import {
  RuntimeWorkflowGraphEngine,
  type RuntimeWorkflowGraphEngineReadiness,
} from "./runtime-workflow-graph-engine.ts";
import {
  DEFAULT_WORKFLOW_DEFINITION_REGISTRY,
  type WorkflowDefinitionRegistry,
} from "./workflow-definition-registry.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import {
  DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
  type WorkflowPluginRegistry,
} from "./workflow-plugin-registry.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export const GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID = "generic-orchestration-runtime-engine.v1";

export const GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE =
  "execution.generic_orchestration_runtime_result";

export type GenericOrchestrationRuntimeStatus =
  | "succeeded"
  | "needs_review"
  | "failed"
  | "waiting_for_human"
  | "canceled";

export type GenericOrchestrationRuntimeReadiness = {
  artifactKind: "generic_orchestration_runtime_readiness";
  engineId: typeof GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID;
  workflowId: string;
  ready: boolean;
  workflowEngineReadiness: RuntimeWorkflowGraphEngineReadiness;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GenericOrchestrationRuntimeRunnerContext = {
  runtimeJob: RuntimeJob;
  workflowId: string;
  definition: WorkflowDefinition;
  plugin: WorkflowPlugin | null;
  readiness: GenericOrchestrationRuntimeReadiness;
};

export type GenericOrchestrationRuntimeRunInput = {
  runtimeJob: RuntimeJob;
  workflowId: string;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  plugin?: WorkflowPlugin | null;
  availableRuntimeToolFamilies?: RuntimeToolFamily[];
  runScheduler: (
    context: GenericOrchestrationRuntimeRunnerContext,
  ) => Promise<RuntimeWorkGraphSchedulerResult>;
};

export type GenericOrchestrationRuntimeSchedulerGraphInput = Omit<
  GenericOrchestrationRuntimeRunInput,
  "runScheduler"
> & {
  graphId: string;
  schedulerOptions: Omit<RuntimeWorkGraphSchedulerOptions, "graphs">;
};

export type GenericOrchestrationRuntimeResult = {
  artifactKind: "generic_orchestration_runtime_result";
  engineId: typeof GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID;
  workflowId: string;
  runtimeJobId: string;
  status: GenericOrchestrationRuntimeStatus;
  schedulerStatus: RuntimeWorkGraphSchedulerResult["status"] | null;
  graphId: string | null;
  executedNodeIds: string[];
  addedNodeIds: string[];
  decisionRefs: string[];
  reasonCodes: string[];
  readiness: GenericOrchestrationRuntimeReadiness;
  schedulerResult: RuntimeWorkGraphSchedulerResult | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function schedulerPolicyReasonCodes(plugin: WorkflowPlugin | null): string[] {
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

function schedulerOptionsReasonCodes(input: {
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
  return reasonCodes;
}

export type GenericOrchestrationRuntimeOptions = {
  registry?: WorkflowDefinitionRegistry;
  pluginRegistry?: WorkflowPluginRegistry;
  graphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
};

function hasAcceptedGraphEvidence(result: RuntimeWorkGraphSchedulerResult): boolean {
  return (
    result.graphId.trim().length > 0 &&
    (result.executedNodeIds.length > 0 ||
      result.addedNodeIds.length > 0 ||
      result.decisionRefs.length > 0)
  );
}

function statusFromSchedulerResult(
  result: RuntimeWorkGraphSchedulerResult,
): GenericOrchestrationRuntimeStatus {
  if (result.status === "waiting_for_human") {
    return "waiting_for_human";
  }
  if (result.status === "failed") {
    return "failed";
  }
  if (result.status === "succeeded" && hasAcceptedGraphEvidence(result)) {
    return "succeeded";
  }
  return "needs_review";
}

export class GenericOrchestrationRuntime {
  private readonly workflowEngine: RuntimeWorkflowGraphEngine;

  constructor(private readonly options: GenericOrchestrationRuntimeOptions) {
    this.workflowEngine = new RuntimeWorkflowGraphEngine({
      registry: options.registry ?? DEFAULT_WORKFLOW_DEFINITION_REGISTRY,
      pluginRegistry: options.pluginRegistry ?? DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
      graphs: options.graphs,
      runtimeToolKernel: options.runtimeToolKernel ?? null,
    });
  }

  evaluateReadiness(input: {
    workflowId: string;
    executors: Record<string, RuntimeWorkGraphNodeExecutor>;
    plugin?: WorkflowPlugin | null;
    availableRuntimeToolFamilies?: RuntimeToolFamily[];
  }): GenericOrchestrationRuntimeReadiness {
    const workflowEngineReadiness = this.workflowEngine.evaluateReadiness(input);
    const reasonCodes = [
      "generic_orchestration_runtime_readiness_evaluated",
      ...workflowEngineReadiness.reasonCodes,
      ...schedulerPolicyReasonCodes(input.plugin ?? null),
    ];
    return {
      artifactKind: "generic_orchestration_runtime_readiness",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      workflowId: workflowEngineReadiness.workflowId,
      ready:
        workflowEngineReadiness.ready &&
        schedulerPolicyReasonCodes(input.plugin ?? null).length === 0,
      workflowEngineReadiness,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async run(
    input: GenericOrchestrationRuntimeRunInput,
  ): Promise<GenericOrchestrationRuntimeResult> {
    const definition = this.workflowEngine.requireDefinition(input.workflowId);
    const readiness = this.evaluateReadiness({
      workflowId: input.workflowId,
      executors: input.executors,
      plugin: input.plugin,
      availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
    });
    if (!readiness.ready) {
      return {
        artifactKind: "generic_orchestration_runtime_result",
        engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
        workflowId: definition.workflowId,
        runtimeJobId: input.runtimeJob.jobId,
        status: "needs_review",
        schedulerStatus: null,
        graphId: null,
        executedNodeIds: [],
        addedNodeIds: [],
        decisionRefs: [],
        reasonCodes: ["generic_orchestration_runtime_not_ready", ...readiness.reasonCodes].slice(
          0,
          60,
        ),
        readiness,
        schedulerResult: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }

    const schedulerResult = await input.runScheduler({
      runtimeJob: input.runtimeJob,
      workflowId: definition.workflowId,
      definition,
      plugin: input.plugin ?? null,
      readiness,
    });
    const graphEvidenceAccepted = hasAcceptedGraphEvidence(schedulerResult);
    const status = statusFromSchedulerResult(schedulerResult);
    const reasonCodes = [
      "generic_orchestration_runtime_scheduler_executed",
      ...schedulerResult.reasonCodes,
      ...(graphEvidenceAccepted ? ["generic_orchestration_runtime_graph_evidence_present"] : []),
      ...(schedulerResult.status === "succeeded" && !graphEvidenceAccepted
        ? ["generic_orchestration_runtime_graph_evidence_missing"]
        : []),
    ].slice(0, 80);

    return {
      artifactKind: "generic_orchestration_runtime_result",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      workflowId: definition.workflowId,
      runtimeJobId: input.runtimeJob.jobId,
      status,
      schedulerStatus: schedulerResult.status,
      graphId: schedulerResult.graphId,
      executedNodeIds: schedulerResult.executedNodeIds,
      addedNodeIds: schedulerResult.addedNodeIds,
      decisionRefs: schedulerResult.decisionRefs,
      reasonCodes,
      readiness,
      schedulerResult,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async runSchedulerGraph(
    input: GenericOrchestrationRuntimeSchedulerGraphInput,
  ): Promise<GenericOrchestrationRuntimeResult> {
    const schedulerOptionReasonCodes = schedulerOptionsReasonCodes({
      plugin: input.plugin,
      schedulerOptions: input.schedulerOptions,
    });
    if (schedulerOptionReasonCodes.length > 0) {
      const readiness = this.evaluateReadiness({
        workflowId: input.workflowId,
        executors: input.executors,
        plugin: input.plugin,
        availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
      });
      return {
        artifactKind: "generic_orchestration_runtime_result",
        engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
        workflowId: input.workflowId,
        runtimeJobId: input.runtimeJob.jobId,
        status: "needs_review",
        schedulerStatus: null,
        graphId: input.graphId,
        executedNodeIds: [],
        addedNodeIds: [],
        decisionRefs: [],
        reasonCodes: [
          "generic_orchestration_runtime_scheduler_options_not_ready",
          ...schedulerOptionReasonCodes,
        ],
        readiness,
        schedulerResult: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    return await this.run({
      runtimeJob: input.runtimeJob,
      workflowId: input.workflowId,
      executors: input.executors,
      plugin: input.plugin,
      availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
      runScheduler: async () => {
        const scheduler = new RuntimeWorkGraphScheduler({
          graphs: this.options.graphs,
          ...input.schedulerOptions,
        });
        return await scheduler.run(input.graphId);
      },
    });
  }
}

export function genericOrchestrationRuntimeResultArtifactMetadata(
  result: GenericOrchestrationRuntimeResult,
): JsonValue {
  return result as unknown as JsonValue;
}
