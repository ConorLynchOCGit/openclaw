import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  WorkQueueChildActionInput,
  WorkQueueParentActionGraphInput,
} from "../work-queue/action-graph.ts";
import {
  createWorkQueueParentChildActionGraph,
  validateActionGraphAcyclic,
} from "../work-queue/action-graph.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { HumanOperatorTaskAdapter } from "./human-operator-task-adapter.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import { graphRef } from "./runtime-work-graph.ts";

export type PlanToRuntimeCompilerPolicy = {
  allowedWorkflowIds: string[];
  allowedRepoScopeRefs: string[];
  authoritySnapshotRef: string;
  authorityAllowsRuntimeCreation: boolean;
  modelPolicyRef: string;
  maxRuntimeJobs: number;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type PlanToRuntimeCompilerInput = {
  parent: Omit<WorkQueueParentActionGraphInput, "childActions">;
  childActions: WorkQueueChildActionInput[];
  workflowPolicy: PlanToRuntimeCompilerPolicy;
  ownerConstraints: {
    operatorId: string;
    budgetRef: string;
    contextPackRefs: string[];
  };
};

export type PlanToRuntimeCompilerResult = {
  artifactKind: "plan_to_runtime_compiler_result";
  graphId: string;
  parentWorkItemId: string;
  runtimeJobIds: string[];
  humanTaskIds: string[];
  graphNodeRefs: string[];
  workQueueChildItemIds: string[];
  validationExpectationRefs: string[];
  closeoutRequired: true;
  blocked: false;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type PlanToRuntimeCompilerBlockedResult = {
  artifactKind: "plan_to_runtime_compiler_result";
  graphId: string;
  parentWorkItemId: null;
  runtimeJobIds: [];
  humanTaskIds: [];
  graphNodeRefs: [];
  workQueueChildItemIds: [];
  validationExpectationRefs: [];
  closeoutRequired: true;
  blocked: true;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type PlanToRuntimeCompilerOutput =
  | PlanToRuntimeCompilerResult
  | PlanToRuntimeCompilerBlockedResult;

function blocked(graphId: string, reasonCodes: string[]): PlanToRuntimeCompilerBlockedResult {
  return {
    artifactKind: "plan_to_runtime_compiler_result",
    graphId,
    parentWorkItemId: null,
    runtimeJobIds: [],
    humanTaskIds: [],
    graphNodeRefs: [],
    workQueueChildItemIds: [],
    validationExpectationRefs: [],
    closeoutRequired: true,
    blocked: true,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function validateCompilerInput(input: PlanToRuntimeCompilerInput): string[] {
  const reasonCodes: string[] = [];
  try {
    validateActionGraphAcyclic(input.childActions);
  } catch (error) {
    reasonCodes.push(error instanceof Error ? error.message : "invalid_dependency_graph");
  }
  if (!input.workflowPolicy.authorityAllowsRuntimeCreation) {
    reasonCodes.push("compile_blocked_authority_snapshot");
  }
  if (input.childActions.length > input.workflowPolicy.maxRuntimeJobs) {
    reasonCodes.push("compile_blocked_runtime_job_budget");
  }
  for (const action of input.childActions) {
    if (!input.workflowPolicy.allowedWorkflowIds.includes(action.assignedWorkflow)) {
      reasonCodes.push(`compile_blocked_workflow:${action.assignedWorkflow}`);
    }
    const repoScopeRef =
      action.metadata && typeof action.metadata === "object" && !Array.isArray(action.metadata)
        ? (action.metadata as Record<string, unknown>).repoScopeRef
        : null;
    if (
      typeof repoScopeRef === "string" &&
      !input.workflowPolicy.allowedRepoScopeRefs.includes(repoScopeRef)
    ) {
      reasonCodes.push(`compile_blocked_repo_scope:${repoScopeRef}`);
    }
  }
  return reasonCodes;
}

export class PlanToRuntimeCompiler {
  private readonly humanTasks: HumanOperatorTaskAdapter;

  constructor(
    private readonly input: {
      workQueue: WorkQueueRepository;
      runtimeJobs: RuntimeJobRepository;
      graphs: RuntimeWorkGraphRepository;
    },
  ) {
    this.humanTasks = new HumanOperatorTaskAdapter(input.graphs);
  }

  async compile(input: PlanToRuntimeCompilerInput): Promise<PlanToRuntimeCompilerOutput> {
    const graphId = input.parent.graphId;
    const reasonCodes = validateCompilerInput(input);
    if (reasonCodes.length > 0) {
      return blocked(graphId, reasonCodes);
    }
    const existingGraph = await this.input.graphs.readGraphSnapshot(graphId);
    const graph =
      existingGraph?.graph ??
      (await this.input.graphs.createGraph({
        graphId,
        workflowId: "runtime_work_graph.multi_action",
        orchestratorModelRef: "policy://runtime-work-graph/orchestrator",
        graphStatus: "running",
        metadata: {
          authoritySnapshotRef: input.workflowPolicy.authoritySnapshotRef,
          modelPolicyRef: input.workflowPolicy.modelPolicyRef,
          budgetRef: input.ownerConstraints.budgetRef,
          contextPackRefs: input.ownerConstraints.contextPackRefs,
        },
      }));
    const parentReadback = await createWorkQueueParentChildActionGraph({
      workQueue: this.input.workQueue,
      graph: {
        ...input.parent,
        graphId: graph.graphId,
        childActions: input.childActions,
      },
    });
    const runtimeJobIds: string[] = [];
    const humanTaskIds: string[] = [];
    const graphNodeRefs: string[] = [];
    for (const [index, action] of input.childActions.entries()) {
      const child = parentReadback.childActions[index] ?? null;
      if (action.actionKind === "human_operator") {
        const human = await this.humanTasks.createTask({
          graphId,
          operatorId: input.ownerConstraints.operatorId,
          promptSummary: action.title,
          requiredResponseShape: { kind: "bounded_owner_decision", rawResponseStored: false },
          blockingNodeRefs: action.dependencyActionIds ?? [],
          decisionRefs: action.evidenceRefs ?? [],
        });
        humanTaskIds.push(human.humanTask.humanTaskId);
        graphNodeRefs.push(graphRef("node", human.node.nodeId));
        continue;
      }
      const node = await this.input.graphs.addNode({
        graphId,
        nodeKind:
          action.actionKind === "qa_test"
            ? "validation"
            : action.actionKind === "docs_skills"
              ? "docs_update"
              : action.actionKind === "architecture_spec"
                ? "reviewer"
                : "implementation",
        assignedRole: action.assignedRole,
        modelOrWorkerRef: action.assignedWorkflow,
        nodeStatus: "planned",
        inputHandoffRefs: action.dependencyActionIds ?? [],
        metadata: {
          actionKind: action.actionKind,
          childWorkItemId: child?.workItemId ?? null,
          contextPackRefs: input.ownerConstraints.contextPackRefs,
        },
      });
      const job = await this.input.runtimeJobs.enqueueJob({
        jobType: "executor.runtime_work_graph_action",
        queueName: "runtime-work-graph",
        payload: {
          graphId,
          nodeId: node.nodeId,
          actionKind: action.actionKind,
          assignedWorkflow: action.assignedWorkflow,
          childWorkItemId: child?.workItemId ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
        parentWorkflowId: graphId,
        workItemId: child?.workItemId ?? null,
        idempotencyScope: "runtime-work-graph-action",
        idempotencyKey: `${graphId}:${node.nodeId}`,
        leaseTimeoutMs: 120_000,
        runTimeoutMs: 30 * 60 * 1000,
      });
      await this.input.graphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "planned",
        outputArtifactRefs: [graphRef("runtime-job", job.jobId)],
      });
      if (child) {
        await this.input.workQueue.updateWorkItemPlanningMetadata({
          workItemId: child.workItemId,
          title: action.title,
          description: `${action.actionKind}: ${action.assignedWorkflow}`,
          metadata: {
            actionGraph: {
              parentWorkItemId: parentReadback.parentWorkItemId,
              graphId,
              actionKind: action.actionKind,
              assignedRole: action.assignedRole,
              assignedWorkflow: action.assignedWorkflow,
              runtimeJobId: job.jobId,
              graphNodeRef: graphRef("node", node.nodeId),
              evidenceRefs: action.evidenceRefs ?? [],
              blockerReasonCodes: action.blockerReasonCodes ?? [],
              planningStatusIsLifecycleState: false,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            },
          },
        });
      }
      runtimeJobIds.push(job.jobId);
      graphNodeRefs.push(graphRef("node", node.nodeId));
    }
    return {
      artifactKind: "plan_to_runtime_compiler_result",
      graphId,
      parentWorkItemId: parentReadback.parentWorkItemId,
      runtimeJobIds,
      humanTaskIds,
      graphNodeRefs,
      workQueueChildItemIds: parentReadback.childActions.map((action) => action.workItemId),
      validationExpectationRefs: input.childActions.flatMap((action) => action.evidenceRefs ?? []),
      closeoutRequired: true,
      blocked: false,
      reasonCodes: ["compiled_runtime_work_graph_actions"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
