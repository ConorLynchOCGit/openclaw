import { describe, expect, it } from "vitest";
import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "./agent-team-coding-plugin.ts";
import {
  genericOrchestrationRuntimeExecutionRefs,
  persistGenericRuntimeResultArtifacts,
  persistGenericRuntimeStartArtifacts,
} from "./generic-orchestration-runtime-execution.ts";
import { GenericOrchestrationRuntime } from "./generic-orchestration-runtime.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";

const runtimeJob: RuntimeJob = {
  jobId: "runtime-job-generic-runtime-execution",
  jobType: "executor.agent_team",
  queueName: "execution-platform",
  priority: 0,
  state: "running",
  payload: {},
  result: null,
  error: null,
  idempotencyScope: "test",
  idempotencyKey: "generic-runtime-execution",
  parentJobId: null,
  parentWorkflowId: null,
  workItemId: "work-item-generic-runtime-execution",
  attempts: 1,
  maxAttempts: 1,
  leaseTimeoutMs: 60_000,
  runTimeoutMs: 300_000,
  availableAt: new Date("2026-05-24T00:00:00.000Z"),
  deadlineAt: null,
  workerId: "worker-test",
  leaseId: "lease-test",
  leaseExpiresAt: null,
  startedAt: new Date("2026-05-24T00:00:00.000Z"),
  completedAt: null,
  canceledAt: null,
  cancellationReason: null,
  createdAt: new Date("2026-05-24T00:00:00.000Z"),
  updatedAt: new Date("2026-05-24T00:00:00.000Z"),
};

const executor: RuntimeWorkGraphNodeExecutor = {
  execute: async () => ({
    status: "succeeded",
    outputArtifactRefs: [],
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  }),
};

function codingExecutors(): Record<string, RuntimeWorkGraphNodeExecutor> {
  return {
    "kind:context_scout": executor,
    "kind:implementation": executor,
    "kind:validation": executor,
    "kind:test_review": executor,
    "kind:repair": executor,
    "kind:reviewer": executor,
    "kind:observability_readback": executor,
    "kind:human_task": executor,
    "kind:closeout": executor,
    "role:context_scout": executor,
    "role:implementation_engineer": executor,
    "role:test_engineer": executor,
    "role:reviewer": executor,
    "role:observability_scribe": executor,
  };
}

function artifactWriter() {
  const metadataArtifacts: Array<{
    artifactType: string;
    uri: string;
    metadata: JsonValue;
  }> = [];
  const payloadArtifacts: Array<{
    artifactType: string;
    uri: string;
    body: JsonValue;
    metadata: Record<string, JsonValue>;
  }> = [];
  return {
    metadataArtifacts,
    payloadArtifacts,
    runtimeJobs: {
      async attachArtifact(input: { artifactType: string; uri: string; metadata: JsonValue }) {
        metadataArtifacts.push({
          artifactType: input.artifactType,
          uri: input.uri,
          metadata: input.metadata,
        });
        return {} as never;
      },
      async attachRuntimeArtifactByContract(input: {
        artifactType: string;
        uri: string;
        body: JsonValue;
        metadata: Record<string, JsonValue>;
      }) {
        payloadArtifacts.push({
          artifactType: input.artifactType,
          uri: input.uri,
          body: input.body,
          metadata: input.metadata,
        });
        return {} as never;
      },
    },
  };
}

describe("generic orchestration runtime execution service", () => {
  it("persists workflow plugin and generic runtime readiness artifacts outside coding runner", async () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const executors = codingExecutors();
    const plugin = buildAgentTeamCodingWorkflowPlugin({ definition, executors });
    const runtime = new GenericOrchestrationRuntime({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });
    const readiness = runtime.evaluateReadiness({
      workflowId: "agent_team.coding",
      executors,
      plugin,
    });
    const writer = artifactWriter();

    const refs = await persistGenericRuntimeStartArtifacts({
      runtimeJobs: writer.runtimeJobs as never,
      runtimeJob,
      workflowId: "agent_team.coding",
      definition,
      plugin,
      readiness,
    });

    expect(refs).toMatchObject(
      genericOrchestrationRuntimeExecutionRefs({
        runtimeJobId: runtimeJob.jobId,
        workflowId: "agent_team.coding",
      }),
    );
    expect(writer.metadataArtifacts.map((artifact) => artifact.artifactType)).toEqual([
      "execution.workflow_plugin_resolution",
      "execution.generic_orchestration_runtime_readiness",
      "execution.generic_runtime_spine_readiness",
      "execution.runtime_workflow_graph_engine_readiness",
    ]);
    expect(writer.metadataArtifacts[0]?.metadata).toMatchObject({
      pluginId: "workflow-plugin.agent_team.coding.v1",
      degradedCloseoutSuccessAllowed: false,
    });
    expect(writer.metadataArtifacts[2]?.metadata).toMatchObject({
      artifactKind: "generic_runtime_spine_readiness",
      workflowId: "agent_team.coding",
      ready: true,
    });
  });

  it("persists lifecycle and bounded runtime result artifacts outside coding runner", async () => {
    const runtime = new GenericOrchestrationRuntime({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });
    const result = await runtime.run({
      runtimeJob,
      workflowId: "agent_team.coding",
      executors: codingExecutors(),
      runScheduler: async () => ({
        status: "succeeded",
        graphId: "graph-generic-runtime-execution",
        iterations: 1,
        executedNodeIds: ["node-a"],
        addedNodeIds: ["node-a"],
        decisionRefs: ["runtime-tool://scheduler/decision-a"],
        reasonCodes: ["scheduler_completed"],
        missionLedger: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    });
    const writer = artifactWriter();

    const refs = await persistGenericRuntimeResultArtifacts({
      runtimeJobs: writer.runtimeJobs as never,
      runtimeJob,
      workflowId: "agent_team.coding",
      result,
    });

    expect(refs.genericRuntimeSpineLifecycleRef).toBe(
      `runtime-job://${runtimeJob.jobId}/execution/generic-runtime-spine/lifecycle/agent_team.coding`,
    );
    expect(writer.metadataArtifacts.map((artifact) => artifact.artifactType)).toEqual([
      "execution.generic_runtime_spine_lifecycle",
    ]);
    expect(writer.payloadArtifacts).toHaveLength(1);
    expect(writer.payloadArtifacts[0]?.artifactType).toBe(
      "execution.generic_orchestration_runtime_result",
    );
    expect(writer.payloadArtifacts[0]?.metadata).toMatchObject({
      artifactKind: "generic_orchestration_runtime_result",
      schedulerResultStoredInline: false,
      status: "succeeded",
      graphId: "graph-generic-runtime-execution",
    });
  });
});
