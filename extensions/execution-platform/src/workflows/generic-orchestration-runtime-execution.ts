import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  GenericOrchestrationRuntime,
  GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
  genericOrchestrationRuntimeResultArtifactMetadata,
  type GenericOrchestrationRuntimeReadiness,
  type GenericOrchestrationRuntimeResult,
} from "./generic-orchestration-runtime.ts";
import {
  GENERIC_RUNTIME_SPINE_LIFECYCLE_ARTIFACT_TYPE,
  GENERIC_RUNTIME_SPINE_READINESS_ARTIFACT_TYPE,
  genericRuntimeSpineLifecycleArtifactMetadata,
  genericRuntimeSpineReadinessArtifactMetadata,
} from "./generic-runtime-spine.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import type {
  RuntimeWorkGraphNodeExecutor,
  RuntimeWorkGraphSchedulerOptions,
} from "./runtime-work-graph-scheduler.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import {
  WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
  workflowPluginResolutionArtifactMetadata,
  workflowPluginResolutionFor,
  type WorkflowPlugin,
} from "./workflow-plugin.ts";

type GenericRuntimeArtifactWriter = Pick<
  RuntimeJobRepository,
  "attachArtifact" | "attachRuntimeArtifactByContract"
>;

export type GenericOrchestrationRuntimeExecutionRefs = {
  workflowPluginRef: string;
  genericRuntimeReadinessRef: string;
  genericRuntimeSpineReadinessRef: string;
  workflowEngineReadinessRef: string;
  genericRuntimeResultRef: string;
  genericRuntimeSpineLifecycleRef: string | null;
  artifactRefs: string[];
};

export type GenericOrchestrationRuntimeExecutionResult = {
  result: GenericOrchestrationRuntimeResult;
  readiness: GenericOrchestrationRuntimeReadiness;
  refs: GenericOrchestrationRuntimeExecutionRefs;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export function genericOrchestrationRuntimeExecutionRefs(input: {
  runtimeJobId: string;
  workflowId: string;
  includeLifecycleRef?: boolean;
}): GenericOrchestrationRuntimeExecutionRefs {
  const genericRuntimeSpineLifecycleRef =
    input.includeLifecycleRef === false
      ? null
      : `runtime-job://${input.runtimeJobId}/execution/generic-runtime-spine/lifecycle/${input.workflowId}`;
  return {
    workflowPluginRef: `runtime-job://${input.runtimeJobId}/execution/workflow-plugin/${input.workflowId}`,
    genericRuntimeReadinessRef: `runtime-job://${input.runtimeJobId}/execution/generic-orchestration-runtime/readiness/${input.workflowId}`,
    genericRuntimeSpineReadinessRef: `runtime-job://${input.runtimeJobId}/execution/generic-runtime-spine/readiness/${input.workflowId}`,
    workflowEngineReadinessRef: `runtime-job://${input.runtimeJobId}/execution/runtime-workflow-graph-engine/${input.workflowId}`,
    genericRuntimeResultRef: `runtime-job://${input.runtimeJobId}/execution/generic-orchestration-runtime/result/${input.workflowId}`,
    genericRuntimeSpineLifecycleRef,
    artifactRefs: genericRuntimeSpineLifecycleRef ? [genericRuntimeSpineLifecycleRef] : [],
  };
}

export async function persistGenericRuntimeStartArtifacts(input: {
  runtimeJobs: GenericRuntimeArtifactWriter;
  runtimeJob: RuntimeJob;
  workflowId: string;
  definition: WorkflowDefinition;
  plugin: WorkflowPlugin;
  readiness: GenericOrchestrationRuntimeReadiness;
  refs?: GenericOrchestrationRuntimeExecutionRefs;
}): Promise<GenericOrchestrationRuntimeExecutionRefs> {
  const refs =
    input.refs ??
    genericOrchestrationRuntimeExecutionRefs({
      runtimeJobId: input.runtimeJob.jobId,
      workflowId: input.workflowId,
    });
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJob.jobId,
    artifactType: WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
    storageKind: "metadata",
    uri: refs.workflowPluginRef,
    contentType: "application/json",
    metadata: workflowPluginResolutionArtifactMetadata(
      workflowPluginResolutionFor({
        plugin: input.plugin,
        definition: input.definition,
      }),
    ),
  });
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJob.jobId,
    artifactType: "execution.generic_orchestration_runtime_readiness",
    storageKind: "metadata",
    uri: refs.genericRuntimeReadinessRef,
    contentType: "application/json",
    metadata: input.readiness as unknown as JsonValue,
  });
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJob.jobId,
    artifactType: GENERIC_RUNTIME_SPINE_READINESS_ARTIFACT_TYPE,
    storageKind: "metadata",
    uri: refs.genericRuntimeSpineReadinessRef,
    contentType: "application/json",
    metadata: genericRuntimeSpineReadinessArtifactMetadata(
      input.readiness.genericRuntimeSpineReadiness,
    ),
  });
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJob.jobId,
    artifactType: "execution.runtime_workflow_graph_engine_readiness",
    storageKind: "metadata",
    uri: refs.workflowEngineReadinessRef,
    contentType: "application/json",
    metadata: input.readiness.workflowEngineReadiness as unknown as JsonValue,
  });
  return refs;
}

export async function persistGenericRuntimeResultArtifacts(input: {
  runtimeJobs: GenericRuntimeArtifactWriter;
  runtimeJob: RuntimeJob;
  workflowId: string;
  result: GenericOrchestrationRuntimeResult;
  refs?: GenericOrchestrationRuntimeExecutionRefs;
}): Promise<GenericOrchestrationRuntimeExecutionRefs> {
  const refs =
    input.refs ??
    genericOrchestrationRuntimeExecutionRefs({
      runtimeJobId: input.runtimeJob.jobId,
      workflowId: input.workflowId,
      includeLifecycleRef: Boolean(input.result.genericRuntimeSpineLifecycle),
    });
  if (input.result.genericRuntimeSpineLifecycle && refs.genericRuntimeSpineLifecycleRef) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJob.jobId,
      artifactType: GENERIC_RUNTIME_SPINE_LIFECYCLE_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: refs.genericRuntimeSpineLifecycleRef,
      contentType: "application/json",
      metadata: genericRuntimeSpineLifecycleArtifactMetadata(
        input.result.genericRuntimeSpineLifecycle,
      ),
    });
  }
  await input.runtimeJobs.attachRuntimeArtifactByContract({
    jobId: input.runtimeJob.jobId,
    artifactType: GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
    uri: refs.genericRuntimeResultRef,
    contentType: "application/json",
    body: input.result as unknown as JsonValue,
    boundedSummary: `Generic orchestration runtime result ${input.result.status} for ${input.workflowId}.`,
    targetNodeIds: [
      ...(input.result.executedNodeIds ?? []),
      ...(input.result.addedNodeIds ?? []),
    ].slice(0, 40),
    resourcePacketKind: "generic_orchestration_runtime_result",
    readinessStatus: input.result.status,
    reasonCodes: [
      "generic_orchestration_runtime_result_persisted_by_contract",
      ...input.result.reasonCodes.slice(0, 20),
    ],
    metadata: genericOrchestrationRuntimeResultArtifactMetadata(input.result) as Record<
      string,
      JsonValue
    >,
  });
  return refs;
}

export async function runAndPersistGenericSchedulerGraph(input: {
  runtimeJobs: GenericRuntimeArtifactWriter;
  runtimeJob: RuntimeJob;
  workflowId: string;
  definition: WorkflowDefinition;
  plugin: WorkflowPlugin;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  graphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  availableRuntimeToolFamilies?: RuntimeToolFamily[];
  graphId: string;
  schedulerOptions: Omit<RuntimeWorkGraphSchedulerOptions, "graphs">;
  throwIfNotReady?: boolean;
}): Promise<GenericOrchestrationRuntimeExecutionResult> {
  const runtime = new GenericOrchestrationRuntime({
    graphs: input.graphs,
    runtimeToolKernel: input.runtimeToolKernel ?? null,
  });
  const readiness = runtime.evaluateReadiness({
    workflowId: input.workflowId,
    executors: input.executors,
    plugin: input.plugin,
    availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
  });
  const refs = await persistGenericRuntimeStartArtifacts({
    runtimeJobs: input.runtimeJobs,
    runtimeJob: input.runtimeJob,
    workflowId: input.workflowId,
    definition: input.definition,
    plugin: input.plugin,
    readiness,
  });
  if (input.throwIfNotReady !== false && !readiness.ready) {
    throw new Error(`generic_orchestration_runtime_not_ready:${readiness.reasonCodes.join(",")}`);
  }
  const result = await runtime.runSchedulerGraph({
    runtimeJob: input.runtimeJob,
    workflowId: input.workflowId,
    executors: input.executors,
    plugin: input.plugin,
    availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
    graphId: input.graphId,
    schedulerOptions: input.schedulerOptions,
  });
  await persistGenericRuntimeResultArtifacts({
    runtimeJobs: input.runtimeJobs,
    runtimeJob: input.runtimeJob,
    workflowId: input.workflowId,
    result,
    refs,
  });
  return {
    result,
    readiness,
    refs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
