import { describe, expect, it } from "vitest";
import type { RuntimeJob } from "../runtime-job-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "./agent-team-coding-plugin.ts";
import {
  GENERIC_RUNTIME_SPINE_ID,
  GenericRuntimeSpine,
  genericRuntimeSpineLifecycleArtifactMetadata,
  genericRuntimeSpineReadinessArtifactMetadata,
} from "./generic-runtime-spine.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";

const runtimeJob: RuntimeJob = {
  jobId: "runtime-job-generic-spine",
  jobType: "executor.agent_team",
  queueName: "execution-platform",
  priority: 0,
  state: "running",
  payload: {},
  result: null,
  error: null,
  idempotencyScope: "test",
  idempotencyKey: "generic-spine",
  parentJobId: null,
  parentWorkflowId: null,
  workItemId: "work-item-generic-spine",
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

describe("GenericRuntimeSpine", () => {
  it("accepts production coding readiness through the generic spine contract", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const executors = codingExecutors();
    const plugin = buildAgentTeamCodingWorkflowPlugin({ definition, executors });
    const spine = new GenericRuntimeSpine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = spine.evaluateReadiness({
      workflowId: "agent_team.coding",
      executors,
      plugin,
    });

    expect(readiness).toMatchObject({
      artifactKind: "generic_runtime_spine_readiness",
      spineId: GENERIC_RUNTIME_SPINE_ID,
      workflowId: "agent_team.coding",
      ready: true,
      schedulerPolicyReady: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(readiness.reasonCodes).toContain("generic_runtime_spine_readiness_evaluated");
    expect(genericRuntimeSpineReadinessArtifactMetadata(readiness)).toMatchObject({
      artifactKind: "generic_runtime_spine_readiness",
      ready: true,
      workflowId: "agent_team.coding",
    });
  });

  it("uses the same spine readiness path for a non-coding workflow negative lane", () => {
    const spine = new GenericRuntimeSpine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = spine.evaluateReadiness({
      workflowId: "workflow.docs_skills",
      executors: {
        "capability:docs_update": executor,
        "kind:validation": executor,
        "kind:closeout": executor,
      },
    });

    expect(readiness.workflowId).toBe("workflow.docs_skills");
    expect(readiness.ready).toBe(false);
    expect(readiness.workflowEngineReadiness.ready).toBe(false);
    expect(readiness.reasonCodes).toContain("workflow_plugin_missing");
    expect(readiness.reasonCodes).not.toContain("agent_team_coding");
    expect(readiness.rawPromptStored).toBe(false);
  });

  it("blocks production scheduler execution when staged runtime options are absent", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const executors = codingExecutors();
    const plugin = buildAgentTeamCodingWorkflowPlugin({ definition, executors });
    const spine = new GenericRuntimeSpine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = spine.evaluateSchedulerOptions({
      workflowId: "agent_team.coding",
      plugin,
      schedulerOptions: {
        orchestrator: {
          decide: async () => ({ decisionKind: "mark_needs_review" }),
        },
        executors,
        requireSchedulerToolKernel: true,
        requireMissionLedgerForExecutionWorkflow: true,
        requireCostAwareCapabilityPolicy: true,
        requireEvidenceClaimsForMissionLedger: true,
        capabilityManifest: plugin.schedulerOptions.capabilityManifest,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.reasonCodes).toContain(
      "generic_orchestration_scheduler_option_staged_protocol_missing",
    );
  });

  it("downgrades scheduler success without graph evidence before production closeout", () => {
    const spine = new GenericRuntimeSpine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const lifecycle = spine.evaluateSchedulerResult({
      runtimeJob,
      workflowId: "agent_team.coding",
      schedulerResult: {
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
      },
    });

    expect(lifecycle.status).toBe("needs_review");
    expect(lifecycle.graphEvidenceAccepted).toBe(false);
    expect(lifecycle.reasonCodes).toContain("generic_orchestration_runtime_graph_evidence_missing");
    expect(genericRuntimeSpineLifecycleArtifactMetadata(lifecycle)).toMatchObject({
      artifactKind: "generic_runtime_spine_lifecycle_evaluation",
      status: "needs_review",
      graphEvidenceAccepted: false,
    });
  });
});
