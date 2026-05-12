import { createHash, randomUUID } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import { graphRef, type HumanTaskInvocation, type TeamGraphNode } from "./runtime-work-graph.ts";

export type CreateHumanOperatorTaskInput = {
  graphId: string;
  operatorId: string;
  promptSummary: string;
  requiredResponseShape: JsonValue;
  blockingNodeRefs: string[];
  deadlineAt?: Date | null;
  decisionRefs?: string[];
};

export type HumanOperatorTaskAdapterResult = {
  artifactKind: "human_operator_task_adapter_result";
  graphId: string;
  node: TeamGraphNode;
  humanTask: HumanTaskInvocation;
  workQueueReadbackState: "human_input_required";
  workflowPaused: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type ResumeHumanOperatorTaskResult = {
  artifactKind: "human_operator_task_resume_result";
  graphId: string;
  humanTask: HumanTaskInvocation;
  resumeAccepted: true;
  boundedResponseRef: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bound(value: string, max = 1_200): string {
  return value.trim().slice(0, max);
}

export class HumanOperatorTaskAdapter {
  constructor(private readonly graphRepository: RuntimeWorkGraphRepository) {}

  async createTask(input: CreateHumanOperatorTaskInput): Promise<HumanOperatorTaskAdapterResult> {
    const node = await this.graphRepository.addNode({
      graphId: input.graphId,
      nodeKind: "human_task",
      assignedRole: "human_operator",
      modelOrWorkerRef: "human/operator",
      nodeStatus: "waiting_for_human",
      outputArtifactRefs: [],
      metadata: {
        operatorId: input.operatorId,
        promptSummaryHash: hash(input.promptSummary),
        blockingNodeRefs: input.blockingNodeRefs,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    const humanTask = await this.graphRepository.createHumanTask({
      humanTaskId: `human-task-${randomUUID()}`,
      graphId: input.graphId,
      nodeId: node.nodeId,
      operatorId: input.operatorId,
      promptSummary: bound(input.promptSummary),
      requiredResponseShape: input.requiredResponseShape,
      deadlineAt: input.deadlineAt ?? null,
      blockingNodeRefs: input.blockingNodeRefs,
      resumeTokenHash: hash(`${input.graphId}:${node.nodeId}:${randomUUID()}`),
      decisionRefs: input.decisionRefs ?? [],
    });
    const updatedNode = await this.graphRepository.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: "waiting_for_human",
      humanTaskId: humanTask.humanTaskId,
      outputArtifactRefs: [graphRef("human-task", humanTask.humanTaskId)],
    });
    await this.graphRepository.addEdge({
      graphId: input.graphId,
      fromNodeId: null,
      toNodeId: updatedNode.nodeId,
      edgeKind: "human_wait",
      reasonCodes: ["human_operator_input_required"],
      artifactRefs: [graphRef("human-task", humanTask.humanTaskId), ...input.blockingNodeRefs],
    });
    return {
      artifactKind: "human_operator_task_adapter_result",
      graphId: input.graphId,
      node: updatedNode,
      humanTask,
      workQueueReadbackState: "human_input_required",
      workflowPaused: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async resumeTask(input: {
    graphId: string;
    humanTaskId: string;
    boundedResponseRef: string;
    decisionRefs?: string[];
  }): Promise<ResumeHumanOperatorTaskResult> {
    const humanTask = await this.graphRepository.resumeHumanTask({
      humanTaskId: input.humanTaskId,
      boundedResponseRef: input.boundedResponseRef,
      decisionRefs: input.decisionRefs ?? [],
    });
    await this.graphRepository.addEdge({
      graphId: input.graphId,
      fromNodeId: humanTask.nodeId,
      toNodeId: null,
      edgeKind: "human_resume",
      reasonCodes: ["human_operator_input_received"],
      artifactRefs: [input.boundedResponseRef],
    });
    if (humanTask.nodeId) {
      await this.graphRepository.updateNodeStatus({
        nodeId: humanTask.nodeId,
        nodeStatus: "succeeded",
        outputArtifactRefs: [input.boundedResponseRef],
      });
    }
    return {
      artifactKind: "human_operator_task_resume_result",
      graphId: input.graphId,
      humanTask,
      resumeAccepted: true,
      boundedResponseRef: input.boundedResponseRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
