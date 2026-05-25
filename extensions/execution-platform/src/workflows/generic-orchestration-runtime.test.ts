import { describe, expect, it } from "vitest";
import type { RuntimeJob } from "../runtime-job-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "./agent-team-coding-plugin.ts";
import {
  GenericOrchestrationRuntime,
  GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
  genericOrchestrationRuntimeResultArtifactMetadata,
} from "./generic-orchestration-runtime.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";

const runtimeJob: RuntimeJob = {
  jobId: "runtime-job-generic-orchestration",
  jobType: "executor.agent_team",
  queueName: "execution-platform",
  priority: 0,
  state: "running",
  payload: {},
  result: null,
  error: null,
  idempotencyScope: "test",
  idempotencyKey: "generic-orchestration",
  parentJobId: null,
  parentWorkflowId: null,
  workItemId: "work-item-generic-orchestration",
  attempts: 1,
  maxAttempts: 1,
  leaseTimeoutMs: 60_000,
  runTimeoutMs: 300_000,
  availableAt: new Date("2026-05-17T00:00:00.000Z"),
  deadlineAt: null,
  workerId: "worker-test",
  leaseId: "lease-test",
  leaseExpiresAt: null,
  startedAt: new Date("2026-05-17T00:00:00.000Z"),
  completedAt: null,
  canceledAt: null,
  cancellationReason: null,
  createdAt: new Date("2026-05-17T00:00:00.000Z"),
  updatedAt: new Date("2026-05-17T00:00:00.000Z"),
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

describe("GenericOrchestrationRuntime", () => {
  it("executes scheduler-backed production workflows through a canonical runtime boundary", async () => {
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
        graphId: "graph-generic",
        iterations: 3,
        executedNodeIds: ["node-context", "node-implementation", "node-closeout"],
        addedNodeIds: ["node-context", "node-implementation", "node-closeout"],
        decisionRefs: [
          "runtime-tool://scheduler/decomposition",
          "runtime-tool://scheduler/closeout",
        ],
        reasonCodes: ["scheduler_completed"],
        missionLedger: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    });

    expect(result).toMatchObject({
      artifactKind: "generic_orchestration_runtime_result",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      status: "succeeded",
      graphId: "graph-generic",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(result.reasonCodes).toContain("generic_orchestration_runtime_scheduler_executed");
    expect(result.reasonCodes).toContain("generic_orchestration_runtime_graph_evidence_present");
  });

  it("stores generic runtime result as a bounded manifest instead of inline scheduler state", async () => {
    const runtime = new GenericOrchestrationRuntime({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });
    const result = await runtime.run({
      runtimeJob,
      workflowId: "agent_team.coding",
      executors: codingExecutors(),
      runScheduler: async () => ({
        status: "needs_review",
        graphId: "graph-large",
        iterations: 24,
        executedNodeIds: Array.from({ length: 150 }, (_, index) => `executed-${index}`),
        addedNodeIds: Array.from({ length: 150 }, (_, index) => `added-${index}`),
        decisionRefs: Array.from({ length: 150 }, (_, index) => `decision-${index}`),
        reasonCodes: Array.from({ length: 150 }, (_, index) => `reason-${index}`),
        missionLedger: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    });

    const metadata = genericOrchestrationRuntimeResultArtifactMetadata(result) as Record<
      string,
      unknown
    >;

    expect(metadata.schedulerResult).toBeUndefined();
    expect(metadata.schedulerResultStoredInline).toBe(false);
    expect((metadata.executedNodeIds as string[]).length).toBe(100);
    expect(metadata.executedNodeCount).toBe(150);
    expect((metadata.addedNodeIds as string[]).length).toBe(100);
    expect(metadata.addedNodeCount).toBe(150);
    expect((metadata.decisionRefs as string[]).length).toBe(100);
    expect(metadata.decisionRefCount).toBe(150);
    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThan(65_536);
  });

  it("does not call the scheduler when readiness fails", async () => {
    const runtime = new GenericOrchestrationRuntime({
      graphs: {} as never,
      runtimeToolKernel: null,
    });
    let schedulerCalled = false;

    const result = await runtime.run({
      runtimeJob,
      workflowId: "agent_team.coding",
      executors: {
        "kind:implementation": executor,
      },
      runScheduler: async () => {
        schedulerCalled = true;
        throw new Error("scheduler_should_not_run");
      },
    });

    expect(schedulerCalled).toBe(false);
    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("generic_orchestration_runtime_not_ready");
    expect(result.reasonCodes).toContain(
      "runtime_workflow_graph_engine_runtime_tool_kernel_missing",
    );
  });

  it("rejects scheduler success without graph execution evidence", async () => {
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
        graphId: "graph-empty",
        iterations: 1,
        executedNodeIds: [],
        addedNodeIds: [],
        decisionRefs: [],
        reasonCodes: ["scheduler_claimed_success_without_evidence"],
        missionLedger: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("generic_orchestration_runtime_graph_evidence_missing");
  });

  it("requires production scheduler graph options to opt into the generic staged protocol", async () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const executors = codingExecutors();
    const plugin = buildAgentTeamCodingWorkflowPlugin({ definition, executors });
    const runtime = new GenericOrchestrationRuntime({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const result = await runtime.runSchedulerGraph({
      runtimeJob,
      workflowId: "agent_team.coding",
      executors,
      plugin,
      graphId: "graph-generic",
      schedulerOptions: {
        orchestrator: {
          decide: async () => ({ decisionKind: "mark_needs_review" }),
        },
        executors,
        requireSchedulerToolKernel: true,
        requireMissionLedgerForExecutionWorkflow: true,
        requireCostAwareCapabilityPolicy: true,
        requireEvidenceClaimsForMissionLedger: true,
        roleCoverageProfile: plugin.schedulerOptions.roleCoverageProfile,
        capabilityManifest: plugin.schedulerOptions.capabilityManifest,
      },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain(
      "generic_orchestration_scheduler_option_staged_protocol_missing",
    );
  });
});
