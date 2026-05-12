import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export const WORK_QUEUE_ACTION_KINDS = [
  "coding",
  "web_research",
  "docs_skills",
  "qa_test",
  "architecture_spec",
  "human_operator",
  "closeout",
] as const;

export type WorkQueueActionKind = (typeof WORK_QUEUE_ACTION_KINDS)[number];

export type WorkQueueChildActionInput = {
  actionId?: string;
  actionKind: WorkQueueActionKind;
  title: string;
  assignedRole: string;
  assignedWorkflow: string;
  dependencyActionIds?: string[];
  runtimeJobId?: string | null;
  graphNodeRef?: string | null;
  evidenceRefs?: string[];
  blockerReasonCodes?: string[];
  metadata?: JsonValue;
};

export type WorkQueueParentActionGraphInput = {
  parentWorkItemId?: string;
  ownerObjective: string;
  title: string;
  approvedPlanRefs: string[];
  graphId: string;
  finalCloseoutRef?: string | null;
  childActions: WorkQueueChildActionInput[];
  actorId?: string | null;
};

export type WorkQueueActionGraphReadback = {
  artifactKind: "work_queue_parent_child_action_graph_readback";
  parentWorkItemId: string;
  graphId: string;
  ownerObjectiveSummary: string;
  approvedPlanRefs: string[];
  finalCloseoutRef: string | null;
  childActions: Array<{
    workItemId: string;
    actionKind: WorkQueueActionKind;
    assignedRole: string;
    assignedWorkflow: string;
    dependencyWorkItemIds: string[];
    runtimeJobId: string | null;
    graphNodeRef: string | null;
    blockerReasonCodes: string[];
    evidenceRefs: string[];
  }>;
  dependencyEdges: Array<{
    workItemId: string;
    dependsOnWorkItemId: string;
    dependencyType: string;
  }>;
  planningStatusIsLifecycleState: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function bound(value: string, max = 1_200): string {
  return value.trim().slice(0, max);
}

function assertRefs(values: string[], name: string): void {
  if (values.length > 40) {
    throw new Error(`${name} exceeds 40 refs`);
  }
  for (const value of values) {
    if (typeof value !== "string" || value.length > 1_200) {
      throw new Error(`${name} contains invalid ref`);
    }
  }
}

function assertNoRawStorage(value: unknown, path = "metadata"): void {
  if (value === null || value === undefined || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoRawStorage(child, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      /raw(prompt|response|transcript|log|logs|provider|tool)|secret|hiddenReasoning/iu.test(key)
    ) {
      if (child !== false && child !== null && child !== undefined) {
        throw new Error(`raw storage field is not allowed at ${path}.${key}`);
      }
    }
    assertNoRawStorage(child, `${path}.${key}`);
  }
}

function actionMetadata(
  parentWorkItemId: string,
  graphId: string,
  action: WorkQueueChildActionInput,
): JsonValue {
  assertRefs(action.evidenceRefs ?? [], "action evidence refs");
  assertRefs(action.blockerReasonCodes ?? [], "action blocker reason codes");
  assertNoRawStorage(action.metadata);
  const baseMetadata =
    action.metadata && typeof action.metadata === "object" && !Array.isArray(action.metadata)
      ? action.metadata
      : {};
  return {
    ...baseMetadata,
    actionGraph: {
      parentWorkItemId,
      graphId,
      actionKind: action.actionKind,
      assignedRole: action.assignedRole,
      assignedWorkflow: action.assignedWorkflow,
      runtimeJobId: action.runtimeJobId ?? null,
      graphNodeRef: action.graphNodeRef ?? null,
      evidenceRefs: action.evidenceRefs ?? [],
      blockerReasonCodes: action.blockerReasonCodes ?? [],
      planningStatusIsLifecycleState: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
  } as JsonValue;
}

function readActionGraphMetadata(metadata: JsonValue): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const graph = (metadata as Record<string, unknown>).actionGraph;
  return graph && typeof graph === "object" && !Array.isArray(graph)
    ? (graph as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function validateActionGraphAcyclic(actions: WorkQueueChildActionInput[]): void {
  const ids = new Set(actions.map((action) => action.actionId ?? action.title));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(actions.map((action) => [action.actionId ?? action.title, action]));

  function visit(id: string): void {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new Error(`work_queue_action_graph_cycle:${id}`);
    }
    visiting.add(id);
    for (const dependencyId of byId.get(id)?.dependencyActionIds ?? []) {
      if (!ids.has(dependencyId)) {
        throw new Error(`work_queue_action_graph_missing_dependency:${dependencyId}`);
      }
      visit(dependencyId);
    }
    visiting.delete(id);
    visited.add(id);
  }

  actions.forEach((action) => visit(action.actionId ?? action.title));
}

export async function createWorkQueueParentChildActionGraph(input: {
  workQueue: WorkQueueRepository;
  graph: WorkQueueParentActionGraphInput;
}): Promise<WorkQueueActionGraphReadback> {
  validateActionGraphAcyclic(input.graph.childActions);
  assertRefs(input.graph.approvedPlanRefs, "approved plan refs");
  const parent = await input.workQueue.createWorkItem({
    workItemId: input.graph.parentWorkItemId,
    itemType: "runtime_work_graph_parent",
    title: input.graph.title,
    description: bound(input.graph.ownerObjective),
    actorId: input.graph.actorId,
    metadata: {
      actionGraph: {
        graphId: input.graph.graphId,
        ownerObjectiveSummary: bound(input.graph.ownerObjective),
        approvedPlanRefs: input.graph.approvedPlanRefs,
        finalCloseoutRef: input.graph.finalCloseoutRef ?? null,
        planningStatusIsLifecycleState: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    },
  });
  const actionIdToWorkItemId = new Map<string, string>();
  const childWorkItemIds: string[] = [];
  for (const action of input.graph.childActions) {
    const actionKey = action.actionId ?? action.title;
    const child = await input.workQueue.createWorkItem({
      workItemId: action.actionId,
      itemType: `runtime_work_graph_action.${action.actionKind}`,
      title: action.title,
      description: bound(`${action.actionKind}: ${action.assignedWorkflow}`),
      actorId: input.graph.actorId,
      metadata: actionMetadata(parent.workItemId, input.graph.graphId, action),
    });
    actionIdToWorkItemId.set(actionKey, child.workItemId);
    childWorkItemIds.push(child.workItemId);
    await input.workQueue.linkParentWorkflow({
      workItemId: child.workItemId,
      parentWorkflowId: parent.workItemId,
      parentWorkflowKind: "work_queue_parent_child_action_graph",
      metadata: {
        graphId: input.graph.graphId,
        parentWorkItemId: parent.workItemId,
        planningStatusIsLifecycleState: false,
      },
    });
    await input.workQueue.assignWorkItem({
      workItemId: child.workItemId,
      assigneeType: action.actionKind === "human_operator" ? "human" : "workflow",
      assigneeId: action.assignedWorkflow,
      role: action.assignedRole,
      metadata: { graphId: input.graph.graphId, actionKind: action.actionKind },
    });
  }
  for (const action of input.graph.childActions) {
    const childWorkItemId = actionIdToWorkItemId.get(action.actionId ?? action.title)!;
    for (const dependencyActionId of action.dependencyActionIds ?? []) {
      const dependencyWorkItemId = actionIdToWorkItemId.get(dependencyActionId);
      if (!dependencyWorkItemId) {
        throw new Error(`work_queue_action_graph_missing_dependency:${dependencyActionId}`);
      }
      await input.workQueue.addDependency({
        workItemId: childWorkItemId,
        dependsOnWorkItemId: dependencyWorkItemId,
        dependencyType: "action_depends_on",
        metadata: { graphId: input.graph.graphId },
      });
    }
  }
  await input.workQueue.updateWorkItemPlanningMetadata({
    workItemId: parent.workItemId,
    title: input.graph.title,
    description: bound(input.graph.ownerObjective),
    actorId: input.graph.actorId,
    metadata: {
      actionGraph: {
        graphId: input.graph.graphId,
        ownerObjectiveSummary: bound(input.graph.ownerObjective),
        approvedPlanRefs: input.graph.approvedPlanRefs,
        childWorkItemIds,
        finalCloseoutRef: input.graph.finalCloseoutRef ?? null,
        planningStatusIsLifecycleState: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    },
  });
  return readWorkQueueActionGraphReadback({
    workQueue: input.workQueue,
    parentWorkItemId: parent.workItemId,
  });
}

export async function readWorkQueueActionGraphReadback(input: {
  workQueue: WorkQueueRepository;
  parentWorkItemId: string;
}): Promise<WorkQueueActionGraphReadback> {
  const parentTruth = await input.workQueue.readWorkItemTruth(input.parentWorkItemId);
  if (!parentTruth) {
    throw new Error(`work_queue_parent_not_found:${input.parentWorkItemId}`);
  }
  const parentMetadata = readActionGraphMetadata(parentTruth.item.metadata);
  const childWorkItemIds = stringArray(parentMetadata.childWorkItemIds);
  const children = await Promise.all(
    childWorkItemIds.map((workItemId) => input.workQueue.readWorkItemTruth(workItemId)),
  );
  const childTruth = children.filter((truth): truth is NonNullable<typeof truth> => Boolean(truth));
  const childActions = childTruth.map((truth) => {
    const metadata = readActionGraphMetadata(truth.item.metadata);
    return {
      workItemId: truth.item.workItemId,
      actionKind: (metadata.actionKind as WorkQueueActionKind) ?? "coding",
      assignedRole:
        typeof metadata.assignedRole === "string" ? metadata.assignedRole : "unassigned",
      assignedWorkflow:
        typeof metadata.assignedWorkflow === "string" ? metadata.assignedWorkflow : "unknown",
      dependencyWorkItemIds: truth.dependencies.map((dependency) => dependency.dependsOnWorkItemId),
      runtimeJobId: typeof metadata.runtimeJobId === "string" ? metadata.runtimeJobId : null,
      graphNodeRef: typeof metadata.graphNodeRef === "string" ? metadata.graphNodeRef : null,
      blockerReasonCodes: stringArray(metadata.blockerReasonCodes),
      evidenceRefs: stringArray(metadata.evidenceRefs),
    };
  });
  return {
    artifactKind: "work_queue_parent_child_action_graph_readback",
    parentWorkItemId: input.parentWorkItemId,
    graphId: typeof parentMetadata.graphId === "string" ? parentMetadata.graphId : "unknown",
    ownerObjectiveSummary:
      typeof parentMetadata.ownerObjectiveSummary === "string"
        ? parentMetadata.ownerObjectiveSummary
        : "",
    approvedPlanRefs: stringArray(parentMetadata.approvedPlanRefs),
    finalCloseoutRef:
      typeof parentMetadata.finalCloseoutRef === "string" ? parentMetadata.finalCloseoutRef : null,
    childActions,
    dependencyEdges: childTruth.flatMap((truth) =>
      truth.dependencies.map((dependency) => ({
        workItemId: truth.item.workItemId,
        dependsOnWorkItemId: dependency.dependsOnWorkItemId,
        dependencyType: dependency.dependencyType,
      })),
    ),
    planningStatusIsLifecycleState: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
