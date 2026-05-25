import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  GENERIC_RUNTIME_SPINE_ID,
  GenericRuntimeSpine,
  genericRuntimeSpineLifecycleArtifactMetadata,
  genericRuntimeSpineReadinessArtifactMetadata,
  type GenericRuntimeSpineLifecycleEvaluation,
  type GenericRuntimeSpineReadiness,
} from "./generic-runtime-spine.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import type {
  RuntimeWorkGraphNodeExecutor,
  RuntimeWorkGraphSchedulerOptions,
  RuntimeWorkGraphSchedulerResult,
} from "./runtime-work-graph-scheduler.ts";
import { RuntimeWorkGraphScheduler } from "./runtime-work-graph-scheduler.ts";
import { type WorkflowDefinitionRegistry } from "./workflow-definition-registry.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import { type WorkflowPluginRegistry } from "./workflow-plugin-registry.ts";
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
  genericRuntimeSpineReadiness: GenericRuntimeSpineReadiness;
  workflowEngineReadiness: GenericRuntimeSpineReadiness["workflowEngineReadiness"];
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
  genericRuntimeSpineLifecycle: GenericRuntimeSpineLifecycleEvaluation | null;
  schedulerResult: RuntimeWorkGraphSchedulerResult | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GenericOrchestrationRuntimeOptions = {
  registry?: WorkflowDefinitionRegistry;
  pluginRegistry?: WorkflowPluginRegistry;
  graphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
};

export class GenericOrchestrationRuntime {
  private readonly spine: GenericRuntimeSpine;

  constructor(private readonly options: GenericOrchestrationRuntimeOptions) {
    this.spine = new GenericRuntimeSpine({
      registry: options.registry,
      pluginRegistry: options.pluginRegistry,
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
    const genericRuntimeSpineReadiness = this.spine.evaluateReadiness(input);
    const workflowEngineReadiness = genericRuntimeSpineReadiness.workflowEngineReadiness;
    const reasonCodes = [
      "generic_orchestration_runtime_readiness_evaluated",
      `generic_runtime_spine:${GENERIC_RUNTIME_SPINE_ID}`,
      ...genericRuntimeSpineReadiness.reasonCodes,
    ];
    return {
      artifactKind: "generic_orchestration_runtime_readiness",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      workflowId: workflowEngineReadiness.workflowId,
      ready: genericRuntimeSpineReadiness.ready,
      genericRuntimeSpineReadiness,
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
    const definition = this.spine.requireDefinition(input.workflowId);
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
        genericRuntimeSpineLifecycle: null,
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
    const genericRuntimeSpineLifecycle = this.spine.evaluateSchedulerResult({
      runtimeJob: input.runtimeJob,
      workflowId: definition.workflowId,
      schedulerResult,
    });
    const reasonCodes = [
      "generic_orchestration_runtime_scheduler_executed",
      ...genericRuntimeSpineLifecycle.reasonCodes,
    ].slice(0, 80);

    return {
      artifactKind: "generic_orchestration_runtime_result",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      workflowId: definition.workflowId,
      runtimeJobId: input.runtimeJob.jobId,
      status: genericRuntimeSpineLifecycle.status,
      schedulerStatus: schedulerResult.status,
      graphId: schedulerResult.graphId,
      executedNodeIds: schedulerResult.executedNodeIds,
      addedNodeIds: schedulerResult.addedNodeIds,
      decisionRefs: schedulerResult.decisionRefs,
      reasonCodes,
      readiness,
      genericRuntimeSpineLifecycle,
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
    const schedulerOptionReadiness = this.spine.evaluateSchedulerOptions({
      workflowId: input.workflowId,
      plugin: input.plugin,
      schedulerOptions: input.schedulerOptions,
    });
    if (!schedulerOptionReadiness.ready) {
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
          ...schedulerOptionReadiness.reasonCodes,
        ],
        readiness,
        genericRuntimeSpineLifecycle: null,
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
  const schedulerResult = result.schedulerResult;
  const readiness = result.readiness;
  const workflowEngineReadiness = readiness.workflowEngineReadiness;
  return {
    artifactKind: "generic_orchestration_runtime_result",
    engineId: result.engineId,
    workflowId: result.workflowId,
    runtimeJobId: result.runtimeJobId,
    status: result.status,
    schedulerStatus: result.schedulerStatus,
    graphId: result.graphId,
    executedNodeIds: result.executedNodeIds.slice(0, 100),
    executedNodeCount: result.executedNodeIds.length,
    addedNodeIds: result.addedNodeIds.slice(0, 100),
    addedNodeCount: result.addedNodeIds.length,
    decisionRefs: result.decisionRefs.slice(0, 100),
    decisionRefCount: result.decisionRefs.length,
    reasonCodes: result.reasonCodes.slice(0, 80),
    readiness: {
      artifactKind: readiness.artifactKind,
      engineId: readiness.engineId,
      workflowId: readiness.workflowId,
      ready: readiness.ready,
      reasonCodes: readiness.reasonCodes.slice(0, 80),
      genericRuntimeSpineReadiness: genericRuntimeSpineReadinessArtifactMetadata(
        readiness.genericRuntimeSpineReadiness,
      ),
      workflowEngineReadiness: {
        artifactKind: workflowEngineReadiness.artifactKind,
        engineId: workflowEngineReadiness.engineId,
        workflowId: workflowEngineReadiness.workflowId,
        definitionId: workflowEngineReadiness.definitionId,
        pluginId: workflowEngineReadiness.pluginId,
        pluginReady: workflowEngineReadiness.pluginReady,
        ready: workflowEngineReadiness.ready,
        reasonCodes: workflowEngineReadiness.reasonCodes.slice(0, 80),
        missingExecutorKeys: workflowEngineReadiness.missingExecutorKeys.slice(0, 80),
        missingPluginExecutorKeys: workflowEngineReadiness.missingPluginExecutorKeys.slice(0, 80),
        missingRuntimeToolFamilies: workflowEngineReadiness.missingRuntimeToolFamilies.slice(0, 80),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
    schedulerResultSummary: schedulerResult
      ? {
          status: schedulerResult.status,
          graphId: schedulerResult.graphId,
          iterations: schedulerResult.iterations,
          executedNodeCount: schedulerResult.executedNodeIds.length,
          addedNodeCount: schedulerResult.addedNodeIds.length,
          decisionRefCount: schedulerResult.decisionRefs.length,
          reasonCodes: schedulerResult.reasonCodes.slice(0, 80),
          missionLedgerStatus: schedulerResult.missionLedger?.ledgerStatus ?? null,
          missionLedgerGate: schedulerResult.missionLedger?.missionGate ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        }
      : null,
    genericRuntimeSpineLifecycle: result.genericRuntimeSpineLifecycle
      ? genericRuntimeSpineLifecycleArtifactMetadata(result.genericRuntimeSpineLifecycle)
      : null,
    schedulerResultStoredInline: false,
    schedulerResultStoragePolicy:
      "bounded_manifest_only_full_scheduler_state_lives_in_runtime_graph_and_progress_artifacts",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  } satisfies JsonValue;
}
