import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkQueueActionKind, WorkQueueChildActionInput } from "../work-queue/action-graph.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { graphRef } from "../workflows/runtime-work-graph.ts";
import {
  normalizeOrchestratorDelegationReview,
  validateOrchestratorDelegationReviewShape,
  type ChildWorkOrder,
  type OrchestratorDelegationReview,
} from "./child-work-order.ts";

export const DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF = "openai-codex/gpt-5.5";
export const DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH = "codex_app_server";

export type DynamicCodingTeamModelClient = {
  runJson(input: {
    modelRef: string;
    providerPath: string;
    systemPrompt: string;
    userPayload: JsonValue;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type DynamicOrchestratorPolicy = {
  modelRef: string;
  providerPath: string;
  policyRef: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type DynamicCodingTeamOrchestratorInput = {
  graphId: string;
  ownerObjectiveSummary: string;
  repoScopeRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  allowedWorkflowIds: string[];
  allowHumanTasks: boolean;
};

export type DynamicCodingTeamOrchestratorPlan = {
  childTasks: WorkQueueChildActionInput[];
  rolePairings: Array<{ roleId: string; modelOrWorkerRef: string; reasonCodes: string[] }>;
  humanTasks: Array<{ title: string; requiredResponseShape: JsonValue; reasonCodes: string[] }>;
  dependencyGraph: Array<{ fromActionId: string; toActionId: string; edgeKind: string }>;
  validationPlan: string[];
  contextNeeds: string[];
  budgetPlan: {
    maxWallTimeMs: number;
    maxModelCalls: number;
    maxRepairAttempts: number;
    continuationAllowed: boolean;
  };
  stopConditions: string[];
  reasonCodes: string[];
};

export type DynamicCodingTeamOrchestratorResult = {
  artifactKind: "dynamic_coding_team_orchestrator_result";
  graphId: string;
  orchestratorNodeId: string;
  roleInvocationId: string;
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  policyRef: string;
  plan: DynamicCodingTeamOrchestratorPlan;
  deterministicValidation: {
    graphShapeValid: boolean;
    scopeValid: boolean;
    authorityValid: boolean;
    budgetValid: boolean;
    storageValid: boolean;
    semanticQualityJudgedByDeterministicCode: false;
    reasonCodes: string[];
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type DynamicCodingTeamDelegationReviewResult = {
  artifactKind: "dynamic_coding_team_delegation_review_result";
  graphId: string;
  reviewNodeId: string;
  roleInvocationId: string;
  reviewedNodeId: string;
  reviewedArtifactRefs: string[];
  review: OrchestratorDelegationReview;
  deterministicValidation: ReturnType<typeof validateOrchestratorDelegationReviewShape>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function systemPrompt(): string {
  return [
    "You are the OpenClaw dynamic coding-team orchestrator.",
    "Draft a bounded action graph for the requested coding-team work.",
    "Return strict JSON only. Do not include raw prompts, raw responses, logs, transcripts, secrets, or hidden reasoning.",
    "You must propose concrete child tasks, role pairings, human tasks when needed, dependencies, validation plan, context needs, budget plan, and stop conditions.",
    "Each child task metadata must include objective, rationaleForCallingThisRole, expectedOutput, acceptanceCriteria, targetRefs when known, and downstreamConsumer.",
    "Do not return generic tasks such as implement bounded change, validate implementation, or owner decision checkpoint.",
    "Do not grant authority, deploy, send outbound messages, promote models, mutate Work Queue lifecycle, or claim runtime success.",
  ].join("\n");
}

function delegationReviewSystemPrompt(): string {
  return [
    "You are the OpenClaw orchestrator reviewing a delegated child role result.",
    "Judge whether the child result answered the child work order and decide the next graph action.",
    "This is model judgment. Be specific and bounded.",
    "Return strict JSON only. Do not include raw prompts, raw responses, logs, transcripts, secrets, or hidden reasoning.",
    "Do not grant authority, deploy, send outbound messages, promote models, mutate Work Queue lifecycle, or claim runtime success.",
  ].join("\n");
}

function parseJsonObject(responseText: string | null): Record<string, unknown> {
  const text = responseText?.trim() ?? "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    text,
    fenced ?? "",
    text.includes("{") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 24)
    : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePlan(parsed: Record<string, unknown>, input: DynamicCodingTeamOrchestratorInput) {
  const childTasksSource = Array.isArray(parsed.childTasks) ? parsed.childTasks : [];
  const childTasks: WorkQueueChildActionInput[] = childTasksSource
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const actionKind =
        typeof item.actionKind === "string" &&
        [
          "coding",
          "web_research",
          "docs_skills",
          "qa_test",
          "architecture_spec",
          "human_operator",
          "closeout",
        ].includes(item.actionKind)
          ? (item.actionKind as WorkQueueActionKind)
          : index === 0
            ? "coding"
            : "qa_test";
      const assignedWorkflow =
        typeof item.assignedWorkflow === "string" ? item.assignedWorkflow : "agent_team.coding";
      return {
        actionId:
          typeof item.actionId === "string" ? item.actionId : `orchestrated-action-${index + 1}`,
        actionKind,
        title:
          typeof item.title === "string"
            ? item.title.slice(0, 220)
            : `${actionKind} action ${index + 1}`,
        assignedRole:
          typeof item.assignedRole === "string" ? item.assignedRole.slice(0, 120) : actionKind,
        assignedWorkflow,
        dependencyActionIds: stringArray(item.dependencyActionIds),
        evidenceRefs: stringArray(item.evidenceRefs),
        blockerReasonCodes: [],
        metadata: {
          ...recordValue(item.metadata),
          repoScopeRefs: input.repoScopeRefs,
          contextPackRefs: input.contextPackRefs,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      };
    })
    .slice(0, 12);
  const budget = (
    parsed.budgetPlan && typeof parsed.budgetPlan === "object" ? parsed.budgetPlan : {}
  ) as Record<string, unknown>;
  return {
    childTasks,
    rolePairings: (Array.isArray(parsed.rolePairings) ? parsed.rolePairings : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        roleId: typeof item.roleId === "string" ? item.roleId.slice(0, 120) : "unknown",
        modelOrWorkerRef:
          typeof item.modelOrWorkerRef === "string"
            ? item.modelOrWorkerRef.slice(0, 180)
            : "policy",
        reasonCodes: stringArray(item.reasonCodes),
      }))
      .slice(0, 16),
    humanTasks: (Array.isArray(parsed.humanTasks) ? parsed.humanTasks : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        title: typeof item.title === "string" ? item.title.slice(0, 220) : "Owner decision",
        requiredResponseShape:
          item.requiredResponseShape && typeof item.requiredResponseShape === "object"
            ? (item.requiredResponseShape as JsonValue)
            : { kind: "bounded_owner_decision" },
        reasonCodes: stringArray(item.reasonCodes),
      }))
      .slice(0, input.allowHumanTasks ? 4 : 0),
    dependencyGraph: (Array.isArray(parsed.dependencyGraph) ? parsed.dependencyGraph : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        fromActionId: typeof item.fromActionId === "string" ? item.fromActionId : "",
        toActionId: typeof item.toActionId === "string" ? item.toActionId : "",
        edgeKind: typeof item.edgeKind === "string" ? item.edgeKind : "depends_on",
      }))
      .slice(0, 24),
    validationPlan: stringArray(parsed.validationPlan)
      .concat(input.validationCommandRefs)
      .slice(0, 12),
    contextNeeds: stringArray(parsed.contextNeeds).slice(0, 12),
    budgetPlan: {
      maxWallTimeMs: numberValue(budget.maxWallTimeMs, 30 * 60 * 1000),
      maxModelCalls: numberValue(budget.maxModelCalls, 12),
      maxRepairAttempts: numberValue(budget.maxRepairAttempts, 2),
      continuationAllowed:
        typeof budget.continuationAllowed === "boolean" ? budget.continuationAllowed : true,
    },
    stopConditions: stringArray(parsed.stopConditions).slice(0, 12),
    reasonCodes: stringArray(parsed.reasonCodes).slice(0, 12),
  };
}

function validatePlan(
  plan: DynamicCodingTeamOrchestratorPlan,
  input: DynamicCodingTeamOrchestratorInput,
): DynamicCodingTeamOrchestratorResult["deterministicValidation"] {
  const reasonCodes: string[] = [];
  if (plan.childTasks.length === 0) {
    reasonCodes.push("orchestrator_child_tasks_missing");
  }
  if (plan.rolePairings.length === 0) {
    reasonCodes.push("orchestrator_role_pairings_missing");
  }
  if (
    plan.rolePairings.some(
      (pairing) => pairing.roleId === "unknown" || pairing.modelOrWorkerRef === "policy",
    )
  ) {
    reasonCodes.push("orchestrator_role_pairings_generic_or_invalid");
  }
  const actionIds = new Set(plan.childTasks.map((task) => task.actionId ?? task.title));
  for (const task of plan.childTasks) {
    const metadata = recordValue(task.metadata);
    if (typeof metadata.objective !== "string" || metadata.objective.trim().length < 24) {
      reasonCodes.push(`child_task_objective_missing:${task.actionId ?? task.title}`);
    }
    if (
      typeof metadata.rationaleForCallingThisRole !== "string" ||
      metadata.rationaleForCallingThisRole.trim().length < 24
    ) {
      reasonCodes.push(`child_task_rationale_missing:${task.actionId ?? task.title}`);
    }
    if (typeof metadata.expectedOutput !== "string" || metadata.expectedOutput.trim().length < 24) {
      reasonCodes.push(`child_task_expected_output_missing:${task.actionId ?? task.title}`);
    }
    if (!Array.isArray(metadata.acceptanceCriteria) || metadata.acceptanceCriteria.length === 0) {
      reasonCodes.push(`child_task_acceptance_criteria_missing:${task.actionId ?? task.title}`);
    }
    if (typeof metadata.downstreamConsumer !== "string" || !metadata.downstreamConsumer.trim()) {
      reasonCodes.push(`child_task_downstream_consumer_missing:${task.actionId ?? task.title}`);
    }
    if (!input.allowedWorkflowIds.includes(task.assignedWorkflow)) {
      reasonCodes.push(`workflow_not_allowed:${task.assignedWorkflow}`);
    }
    for (const dependency of task.dependencyActionIds ?? []) {
      if (!actionIds.has(dependency)) {
        reasonCodes.push(`missing_dependency:${dependency}`);
      }
    }
  }
  if (plan.budgetPlan.maxModelCalls > 30 || plan.budgetPlan.maxRepairAttempts > 6) {
    reasonCodes.push("budget_exceeds_policy");
  }
  return {
    graphShapeValid:
      !reasonCodes.includes("orchestrator_child_tasks_missing") &&
      !reasonCodes.includes("orchestrator_role_pairings_missing") &&
      !reasonCodes.includes("orchestrator_role_pairings_generic_or_invalid") &&
      reasonCodes.every(
        (code) => !code.startsWith("missing_dependency") && !code.startsWith("child_task_"),
      ),
    scopeValid: reasonCodes.every((code) => !code.startsWith("workflow_not_allowed")),
    authorityValid: true,
    budgetValid: !reasonCodes.includes("budget_exceeds_policy"),
    storageValid: true,
    semanticQualityJudgedByDeterministicCode: false,
    reasonCodes,
  };
}

export class DynamicCodingTeamOrchestrator {
  private readonly policy: DynamicOrchestratorPolicy;

  constructor(
    private readonly options: {
      graphs: RuntimeWorkGraphRepository;
      modelClient: DynamicCodingTeamModelClient;
      policy?: Partial<DynamicOrchestratorPolicy>;
    },
  ) {
    this.policy = {
      modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
      providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
      policyRef: "policy://runtime-work-graph/orchestrator/gpt-5.5-codex",
      maxOutputTokens: 6_000,
      timeoutMs: 600_000,
      ...options.policy,
    };
  }

  async plan(
    input: DynamicCodingTeamOrchestratorInput,
  ): Promise<DynamicCodingTeamOrchestratorResult> {
    const node = await this.options.graphs.addNode({
      graphId: input.graphId,
      nodeKind: "orchestrator_plan",
      assignedRole: "orchestrator",
      modelOrWorkerRef: this.policy.modelRef,
      nodeStatus: "running",
      metadata: {
        orchestratorFirstCalled: true,
        policyRef: this.policy.policyRef,
        ownerObjectiveHash: hash(input.ownerObjectiveSummary),
      },
    });
    const started = Date.now();
    let response = await this.options.modelClient.runJson({
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      systemPrompt: systemPrompt(),
      userPayload: {
        graphId: input.graphId,
        ownerObjectiveSummary: input.ownerObjectiveSummary,
        repoScopeRefs: input.repoScopeRefs,
        contextPackRefs: input.contextPackRefs,
        validationCommandRefs: input.validationCommandRefs,
        allowedWorkflowIds: input.allowedWorkflowIds,
        allowHumanTasks: input.allowHumanTasks,
        requiredChildTaskMetadata: [
          "objective",
          "rationaleForCallingThisRole",
          "expectedOutput",
          "acceptanceCriteria",
          "downstreamConsumer",
          "targetRefs",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      maxOutputTokens: this.policy.maxOutputTokens,
      timeoutMs: this.policy.timeoutMs,
    });
    let parsed = parseJsonObject(response.responseText);
    let plan = normalizePlan(parsed, input);
    let validation = validatePlan(plan, input);
    let repairAttempted = false;
    if (
      !(validation.graphShapeValid && validation.scopeValid && validation.budgetValid) &&
      validation.storageValid
    ) {
      repairAttempted = true;
      response = await this.options.modelClient.runJson({
        modelRef: this.policy.modelRef,
        providerPath: this.policy.providerPath,
        systemPrompt: [
          systemPrompt(),
          "Repair the previous graph. Do not return generic fallback tasks.",
          "Every child task must include concrete metadata fields and a downstream consumer.",
          "If the objective cannot be decomposed, return an empty childTasks array and reasonCodes explaining the blocker.",
        ].join("\n"),
        userPayload: {
          graphId: input.graphId,
          ownerObjectiveSummary: input.ownerObjectiveSummary,
          repoScopeRefs: input.repoScopeRefs,
          contextPackRefs: input.contextPackRefs,
          validationCommandRefs: input.validationCommandRefs,
          allowedWorkflowIds: input.allowedWorkflowIds,
          allowHumanTasks: input.allowHumanTasks,
          priorValidationReasonCodes: validation.reasonCodes.slice(0, 24),
          repairRequired: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        maxOutputTokens: this.policy.maxOutputTokens,
        timeoutMs: this.policy.timeoutMs,
      });
      parsed = parseJsonObject(response.responseText);
      plan = normalizePlan(parsed, input);
      validation = validatePlan(plan, input);
    }
    const roleInvocation = await this.options.graphs.recordRoleInvocation({
      graphId: input.graphId,
      nodeId: node.nodeId,
      roleId: "orchestrator",
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      transportKind: this.policy.providerPath,
      modelRunRef: response.modelRunRef,
      outputHash: response.responseHash,
      latencyMs: response.latencyMs || Date.now() - started,
      artifactRefs: [graphRef("node", node.nodeId)],
      budgetUsage: {
        maxOutputTokens: this.policy.maxOutputTokens,
        timeoutMs: this.policy.timeoutMs,
        repairAttempted,
      },
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus:
        validation.graphShapeValid && validation.scopeValid && validation.budgetValid
          ? "succeeded"
          : "needs_review",
      outputArtifactRefs: [graphRef("role-invocation", roleInvocation.invocationId)],
    });
    return {
      artifactKind: "dynamic_coding_team_orchestrator_result",
      graphId: input.graphId,
      orchestratorNodeId: node.nodeId,
      roleInvocationId: roleInvocation.invocationId,
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      modelRunRef: response.modelRunRef,
      policyRef: this.policy.policyRef,
      plan,
      deterministicValidation: validation,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async addContinuationNode(input: {
    graphId: string;
    afterNodeId: string;
    reasonCodes: string[];
    assignedRole: string;
  }): Promise<string> {
    const node = await this.options.graphs.addNode({
      graphId: input.graphId,
      nodeKind: "orchestrator_plan",
      assignedRole: input.assignedRole,
      modelOrWorkerRef: this.policy.modelRef,
      nodeStatus: "planned",
      metadata: { continuation: true, reasonCodes: input.reasonCodes },
    });
    await this.options.graphs.addEdge({
      graphId: input.graphId,
      fromNodeId: input.afterNodeId,
      toNodeId: node.nodeId,
      edgeKind: "continuation",
      reasonCodes: input.reasonCodes,
    });
    return node.nodeId;
  }

  async reviewDelegation(input: {
    graphId: string;
    reviewedNodeId: string;
    reviewedRoleId: string;
    workOrder: ChildWorkOrder;
    childOutputArtifactRefs: string[];
    childOutputSummary: string;
    downstreamRoleId?: string;
  }): Promise<DynamicCodingTeamDelegationReviewResult> {
    const node = await this.options.graphs.addNode({
      graphId: input.graphId,
      nodeKind: "orchestrator_plan",
      assignedRole: "orchestrator",
      modelOrWorkerRef: this.policy.modelRef,
      nodeStatus: "running",
      inputHandoffRefs: [
        `work-order://${input.workOrder.workOrderId}`,
        ...input.childOutputArtifactRefs,
      ].slice(0, 20),
      metadata: {
        delegationReview: true,
        reviewedWorkOrderId: input.workOrder.workOrderId,
        reviewedRoleId: input.reviewedRoleId,
        reviewedNodeId: input.reviewedNodeId,
      },
    });
    await this.options.graphs.addEdge({
      graphId: input.graphId,
      fromNodeId: input.reviewedNodeId,
      toNodeId: node.nodeId,
      edgeKind: "handoff",
      reasonCodes: ["child_output_to_orchestrator_delegation_review"],
      artifactRefs: input.childOutputArtifactRefs.slice(0, 12),
      metadata: { workOrderId: input.workOrder.workOrderId },
    });
    const started = Date.now();
    const response = await this.options.modelClient.runJson({
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      systemPrompt: delegationReviewSystemPrompt(),
      userPayload: {
        graphId: input.graphId,
        reviewedNodeId: input.reviewedNodeId,
        reviewedRoleId: input.reviewedRoleId,
        workOrder: input.workOrder,
        childOutputArtifactRefs: input.childOutputArtifactRefs.slice(0, 20),
        childOutputSummary: input.childOutputSummary.slice(0, 2_000),
        downstreamRoleId: input.downstreamRoleId ?? null,
        expectedShape: {
          assessment: {
            answeredWorkOrder: "boolean",
            specificEnoughForNextStep: "boolean",
            missingInformation: ["bounded string"],
            nextAction:
              "handoff_to_implementation | rerun_same_role | call_context_scout | call_test_engineer | escalate | human_decision | needs_review",
            reasoningSummary: "bounded string",
          },
          nextNodePlan: {
            roleId: "bounded role id",
            objective: "bounded next-node objective",
            targetRefs: ["bounded refs"],
          },
          reasonCodes: ["bounded reason code"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
      },
      maxOutputTokens: Math.min(3_000, this.policy.maxOutputTokens),
      timeoutMs: this.policy.timeoutMs,
    });
    const review = normalizeOrchestratorDelegationReview({
      reviewedWorkOrderId: input.workOrder.workOrderId,
      reviewedRoleId: input.reviewedRoleId,
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      modelRunRef: response.modelRunRef,
      responseText: response.responseText,
    });
    const validation = validateOrchestratorDelegationReviewShape(review);
    const roleInvocation = await this.options.graphs.recordRoleInvocation({
      graphId: input.graphId,
      nodeId: node.nodeId,
      roleId: "orchestrator",
      modelRef: this.policy.modelRef,
      providerPath: this.policy.providerPath,
      transportKind: this.policy.providerPath,
      modelRunRef: response.modelRunRef,
      outputHash: response.responseHash,
      latencyMs: response.latencyMs || Date.now() - started,
      artifactRefs: [graphRef("node", node.nodeId), ...input.childOutputArtifactRefs].slice(0, 12),
      budgetUsage: {
        maxOutputTokens: Math.min(3_000, this.policy.maxOutputTokens),
        timeoutMs: this.policy.timeoutMs,
      },
    });
    await this.options.graphs.updateNodeStatus({
      nodeId: node.nodeId,
      nodeStatus: validation.valid ? "succeeded" : "needs_review",
      outputArtifactRefs: [graphRef("role-invocation", roleInvocation.invocationId)],
    });
    return {
      artifactKind: "dynamic_coding_team_delegation_review_result",
      graphId: input.graphId,
      reviewNodeId: node.nodeId,
      roleInvocationId: roleInvocation.invocationId,
      reviewedNodeId: input.reviewedNodeId,
      reviewedArtifactRefs: input.childOutputArtifactRefs.slice(0, 20),
      review,
      deterministicValidation: validation,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
