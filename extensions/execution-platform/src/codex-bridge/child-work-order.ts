import { createHash } from "node:crypto";
import type { WorkQueueChildActionInput } from "../work-queue/action-graph.ts";

export type ChildWorkOrderRetryPolicy = {
  maxAttempts: number;
  repairAllowed: boolean;
  escalationRoleId?: string;
};

export type ChildWorkOrder = {
  workOrderId: string;
  parentGraphId: string;
  parentNodeId?: string;
  roleId: string;
  objective: string;
  rationaleForCallingThisRole: string;
  targetRefs: string[];
  inputArtifactRefs: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  handoffTo: string[];
  retryPolicy: ChildWorkOrderRetryPolicy;
  splitPolicy: {
    allowed: boolean;
    maxChildPackets: number;
  };
  escalationPolicy: {
    escalationRoleId?: string;
    escalationWorkerRef?: string;
    reasonCodes: string[];
  };
  stopCondition: string;
  targetRefsUnavailableReason?: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ChildWorkOrderValidation = {
  valid: boolean;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
};

export type ContextScoutOutput = {
  roleId: "context_scout";
  relevantFiles: Array<{
    path: string;
    whyRelevant: string;
    keySymbolsOrFunctions: string[];
  }>;
  existingPatterns: string[];
  risks: string[];
  recommendedEditPoints: Array<{
    path: string;
    symbolOrRegion: string;
    reason: string;
  }>;
  validationSuggestions: string[];
  handoffSummaryForImplementation: string;
  confidence: number;
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ContextScoutOutputShapeValidation = {
  valid: boolean;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
};

export type OrchestratorDelegationReview = {
  artifactKind: "orchestrator_delegation_review";
  reviewedWorkOrderId: string;
  reviewedRoleId: string;
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  assessment: {
    answeredWorkOrder: boolean | null;
    specificEnoughForNextStep: boolean | null;
    missingInformation: string[];
    nextAction:
      | "accept_and_continue"
      | "handoff_to_implementation"
      | "ask_sharper_context_question"
      | "split_task"
      | "rerun_same_role"
      | "retry_same_worker"
      | "call_context_scout"
      | "call_test_engineer"
      | "call_reviewer"
      | "repair_from_validation"
      | "escalate"
      | "escalate_to_codex"
      | "human_decision"
      | "needs_review";
    reasoningSummary: string;
  };
  nextNodePlan: {
    roleId: string;
    objective: string;
    targetRefs: string[];
  } | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type OrchestratorDelegationReviewShapeValidation = {
  valid: boolean;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function bounded(value: string, max = 500): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function compactStrings(values: unknown, maxItems = 12, maxLength = 260): string[] {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => bounded(value, maxLength))
        .slice(0, maxItems)
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultObjectiveForRole(input: {
  roleId: string;
  taskTitle: string;
  parentObjectiveSummary: string;
}): string {
  if (input.roleId === "context_scout") {
    return `Find exact files, symbols, existing patterns, risks, and edit points needed for: ${input.parentObjectiveSummary}`;
  }
  if (input.roleId === "implementation_engineer") {
    return `Implement the smallest production-safe source/test/readback change for: ${input.parentObjectiveSummary}`;
  }
  if (input.roleId === "test_engineer") {
    return `Validate the implementation and classify any failure for: ${input.parentObjectiveSummary}`;
  }
  if (input.roleId === "reviewer") {
    return `Review runtime evidence, changed files, validation, and product fit for: ${input.parentObjectiveSummary}`;
  }
  if (input.roleId === "observability_scribe") {
    return `Produce owner-facing readback, limitations, and ELI5 progress for: ${input.parentObjectiveSummary}`;
  }
  return `${input.taskTitle}: ${input.parentObjectiveSummary}`;
}

function defaultExpectedOutput(roleId: string): string {
  if (roleId === "context_scout") {
    return "Concrete relevant files, symbols/functions, existing patterns, risks, recommended edit points, validation suggestions, and implementation handoff summary.";
  }
  if (roleId === "implementation_engineer") {
    return "Changed-file refs, patch/diff hash, validation refs, limitations, and concrete evidence that the scoped objective was implemented.";
  }
  if (roleId === "test_engineer") {
    return "Validation outcome, failure classification if any, repair recommendation, and validation refs.";
  }
  if (roleId === "reviewer") {
    return "Model-authored assessment of task fit, correctness, validation integrity, risks, and remaining work.";
  }
  if (roleId === "observability_scribe") {
    return "Human-readable owner readback with runtime refs, graph refs, tests, limitations, closeout, and ELI5 progress.";
  }
  return "Bounded role-specific output with evidence refs and limitations.";
}

function defaultAcceptanceCriteria(roleId: string, validationCommandRefs: string[]): string[] {
  const base = [
    "Output cites bounded evidence refs and does not store raw prompts, responses, provider logs, command logs, or secrets.",
    "Output is consumed by a downstream graph node or closeout evidence.",
  ];
  if (roleId === "context_scout") {
    return [
      "Names concrete files or records why target refs are unavailable.",
      "Identifies existing patterns or risks relevant to the objective.",
      "Includes a handoff summary for implementation.",
      ...base,
    ];
  }
  if (roleId === "implementation_engineer") {
    return [
      "Changes at least one approved target file unless it records a concrete blocker.",
      "Records changed-file refs and diff/patch evidence.",
      ...(validationCommandRefs.length > 0 ? ["Runs or hands off required validation refs."] : []),
      ...base,
    ];
  }
  if (roleId === "test_engineer") {
    return [
      "Runs or reviews required validation refs.",
      "Classifies failures without weakening target tests.",
      ...base,
    ];
  }
  return base;
}

export function createChildWorkOrder(input: {
  parentGraphId: string;
  parentNodeId?: string;
  roleId: string;
  taskTitle: string;
  parentObjectiveSummary: string;
  repoScopeRefs: string[];
  inputArtifactRefs: string[];
  validationCommandRefs: string[];
  handoffTo?: string[];
  targetRefs?: string[];
  objective?: string;
  rationaleForCallingThisRole?: string;
  expectedOutput?: string;
  acceptanceCriteria?: string[];
  stopCondition?: string;
  strictModelAuthored?: boolean;
}): ChildWorkOrder {
  const roleId = bounded(input.roleId, 120);
  const workOrderId = `child-work-order-${hash(
    [input.parentGraphId, input.parentNodeId ?? "", roleId, input.taskTitle].join(":"),
  )}`;
  const targetRefs = (input.targetRefs?.length ? input.targetRefs : input.repoScopeRefs)
    .map((ref) => bounded(ref, 260))
    .slice(0, 12);
  const strict = input.strictModelAuthored === true;
  const objective =
    input.objective ??
    (strict
      ? ""
      : defaultObjectiveForRole({
          roleId,
          taskTitle: input.taskTitle,
          parentObjectiveSummary: input.parentObjectiveSummary,
        }));
  const rationaleForCallingThisRole =
    input.rationaleForCallingThisRole ??
    (strict ? "" : `${roleId} is needed to produce ${defaultExpectedOutput(roleId)}`);
  const expectedOutput = input.expectedOutput ?? (strict ? "" : defaultExpectedOutput(roleId));
  const acceptanceCriteria =
    input.acceptanceCriteria?.length || strict
      ? (input.acceptanceCriteria ?? [])
      : defaultAcceptanceCriteria(roleId, input.validationCommandRefs);
  return {
    workOrderId,
    parentGraphId: input.parentGraphId,
    parentNodeId: input.parentNodeId,
    roleId,
    objective: bounded(objective, 1_000),
    rationaleForCallingThisRole: bounded(rationaleForCallingThisRole, 600),
    targetRefs,
    targetRefsUnavailableReason:
      targetRefs.length === 0
        ? "No structured target refs were available from scope policy."
        : undefined,
    inputArtifactRefs: input.inputArtifactRefs.slice(0, 20),
    expectedOutput: bounded(expectedOutput, 800),
    acceptanceCriteria: acceptanceCriteria.map((criterion) => bounded(criterion, 320)).slice(0, 10),
    handoffTo: (input.handoffTo?.length ? input.handoffTo : ["downstream_runtime_graph_node"])
      .map((target) => bounded(target, 120))
      .slice(0, 6),
    retryPolicy: {
      maxAttempts: roleId === "implementation_engineer" ? 3 : 2,
      repairAllowed: roleId === "implementation_engineer" || roleId === "test_engineer",
      escalationRoleId:
        roleId === "implementation_engineer" ? "codex_complex_implementation" : undefined,
    },
    splitPolicy: {
      allowed: roleId === "implementation_engineer" || roleId === "context_scout",
      maxChildPackets: roleId === "implementation_engineer" ? 5 : 3,
    },
    escalationPolicy: {
      escalationRoleId:
        roleId === "implementation_engineer" ? "codex_complex_implementation" : undefined,
      escalationWorkerRef:
        roleId === "implementation_engineer" ? "worker.codex.parity-runtime-adapter" : undefined,
      reasonCodes:
        roleId === "implementation_engineer"
          ? ["validation_failure", "provider_no_content", "task_too_broad"]
          : ["insufficient_role_output"],
    },
    stopCondition: bounded(
      input.stopCondition ?? "Expected output accepted by downstream graph evidence.",
      500,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function createChildWorkOrdersFromPlan(input: {
  graphId: string;
  orchestratorNodeId: string;
  parentObjectiveSummary: string;
  childTasks: WorkQueueChildActionInput[];
  repoScopeRefs: string[];
  inputArtifactRefs: string[];
  validationCommandRefs: string[];
}): ChildWorkOrder[] {
  return input.childTasks.map((task, index) => {
    const metadata = recordValue(task.metadata);
    const repoScopeRefs = compactStrings(metadata.repoScopeRefs);
    return createChildWorkOrder({
      parentGraphId: input.graphId,
      parentNodeId: input.orchestratorNodeId,
      roleId: task.assignedRole,
      taskTitle: task.title,
      parentObjectiveSummary: input.parentObjectiveSummary,
      repoScopeRefs: repoScopeRefs.length ? repoScopeRefs : input.repoScopeRefs,
      targetRefs: compactStrings(metadata.targetRefs),
      inputArtifactRefs: [
        ...input.inputArtifactRefs,
        ...compactStrings(task.evidenceRefs),
        ...(task.assignedRole === "test_engineer" ? input.validationCommandRefs : []),
      ].slice(0, 20),
      validationCommandRefs: input.validationCommandRefs,
      handoffTo: input.childTasks
        .filter((candidate) => candidate.dependencyActionIds?.includes(task.actionId ?? task.title))
        .map((candidate) => candidate.assignedRole)
        .slice(0, 6),
      objective: typeof metadata.objective === "string" ? metadata.objective : undefined,
      rationaleForCallingThisRole:
        typeof metadata.rationaleForCallingThisRole === "string"
          ? metadata.rationaleForCallingThisRole
          : undefined,
      expectedOutput:
        typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : undefined,
      acceptanceCriteria: compactStrings(metadata.acceptanceCriteria, 10, 320),
      stopCondition:
        index === input.childTasks.length - 1
          ? "Final role output feeds closeout evidence."
          : undefined,
      strictModelAuthored: true,
    });
  });
}

export function validateChildWorkOrder(workOrder: ChildWorkOrder): ChildWorkOrderValidation {
  const reasonCodes: string[] = [];
  if (workOrder.objective.length < 24) {
    reasonCodes.push("child_work_order_objective_missing_or_too_short");
  }
  if (workOrder.rationaleForCallingThisRole.length < 24) {
    reasonCodes.push("child_work_order_rationale_missing_or_too_short");
  }
  if (workOrder.targetRefs.length === 0 && !workOrder.targetRefsUnavailableReason) {
    reasonCodes.push("child_work_order_target_refs_missing");
  }
  if (workOrder.expectedOutput.length < 24) {
    reasonCodes.push("child_work_order_expected_output_missing_or_too_short");
  }
  if (workOrder.acceptanceCriteria.length === 0) {
    reasonCodes.push("child_work_order_acceptance_criteria_missing");
  }
  if (workOrder.handoffTo.length === 0) {
    reasonCodes.push("child_work_order_downstream_consumer_missing");
  }
  if (workOrder.retryPolicy.maxAttempts < 1 || workOrder.retryPolicy.maxAttempts > 6) {
    reasonCodes.push("child_work_order_retry_policy_out_of_bounds");
  }
  if (workOrder.splitPolicy.maxChildPackets < 1 || workOrder.splitPolicy.maxChildPackets > 12) {
    reasonCodes.push("child_work_order_split_policy_out_of_bounds");
  }
  if (workOrder.roleId === "implementation_engineer") {
    if (!workOrder.objective.toLowerCase().includes("edit") && workOrder.targetRefs.length === 0) {
      reasonCodes.push("child_work_order_implementation_exact_edit_objective_missing");
    }
    if (workOrder.targetRefs.length === 0) {
      reasonCodes.push("child_work_order_implementation_target_refs_missing");
    }
  }
  if (
    workOrder.roleId === "test_engineer" &&
    !workOrder.inputArtifactRefs.some((ref) => ref.includes("validation") || ref.includes("test"))
  ) {
    reasonCodes.push("child_work_order_test_engineer_validation_refs_missing");
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
  };
}

export function parseContextScoutOutput(input: {
  responseText: string | null;
  targetRefs: string[];
  validationCommandRefs: string[];
}): ContextScoutOutput {
  const source = input.responseText?.trim() ?? "";
  let parsed: Record<string, unknown> = {};
  if (source.includes("{")) {
    try {
      parsed = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      parsed = {};
    }
  }
  const relevantFilesSource = Array.isArray(parsed.relevantFiles) ? parsed.relevantFiles : [];
  const relevantFiles = relevantFilesSource
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      path:
        typeof item.path === "string"
          ? bounded(item.path, 260)
          : bounded(input.targetRefs[index] ?? input.targetRefs[0] ?? "unknown", 260),
      whyRelevant:
        typeof item.whyRelevant === "string"
          ? bounded(item.whyRelevant, 400)
          : "Relevant to the child work order target scope.",
      keySymbolsOrFunctions: compactStrings(item.keySymbolsOrFunctions, 8, 120),
    }))
    .slice(0, 12);
  if (relevantFiles.length === 0) {
    relevantFiles.push(
      ...input.targetRefs.slice(0, 5).map((ref) => ({
        path: ref,
        whyRelevant: "Target ref supplied by work order scope.",
        keySymbolsOrFunctions: [],
      })),
    );
  }
  return {
    roleId: "context_scout",
    relevantFiles,
    existingPatterns: compactStrings(parsed.existingPatterns, 10, 260),
    risks: compactStrings(parsed.risks, 10, 260),
    recommendedEditPoints: (Array.isArray(parsed.recommendedEditPoints)
      ? parsed.recommendedEditPoints
      : []
    )
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        path:
          typeof item.path === "string"
            ? bounded(item.path, 260)
            : (relevantFiles[index]?.path ?? relevantFiles[0]?.path ?? "unknown"),
        symbolOrRegion:
          typeof item.symbolOrRegion === "string"
            ? bounded(item.symbolOrRegion, 160)
            : "nearest matching implementation/test region",
        reason:
          typeof item.reason === "string" ? bounded(item.reason, 300) : "Relevant edit point.",
      }))
      .slice(0, 10),
    validationSuggestions: compactStrings(parsed.validationSuggestions, 8, 260).concat(
      input.validationCommandRefs.slice(0, 4),
    ),
    handoffSummaryForImplementation:
      typeof parsed.handoffSummaryForImplementation === "string"
        ? bounded(parsed.handoffSummaryForImplementation, 800)
        : `Use target refs ${input.targetRefs.slice(0, 4).join(", ")} and validate with ${input.validationCommandRefs.slice(0, 3).join(", ")}.`,
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.6,
    limitations: compactStrings(parsed.limitations, 8, 260),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function validateContextScoutOutputShape(
  output: ContextScoutOutput,
): ContextScoutOutputShapeValidation {
  const reasonCodes: string[] = [];
  if (output.relevantFiles.length === 0) {
    reasonCodes.push("context_scout_required_relevant_files_missing");
  }
  if (!output.handoffSummaryForImplementation.trim()) {
    reasonCodes.push("context_scout_required_handoff_summary_missing");
  }
  if (output.confidence < 0 || output.confidence > 1) {
    reasonCodes.push("context_scout_confidence_out_of_bounds");
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
  };
}

function nextAction(value: unknown): OrchestratorDelegationReview["assessment"]["nextAction"] {
  return value === "accept_and_continue" ||
    value === "handoff_to_implementation" ||
    value === "ask_sharper_context_question" ||
    value === "split_task" ||
    value === "rerun_same_role" ||
    value === "retry_same_worker" ||
    value === "call_context_scout" ||
    value === "call_test_engineer" ||
    value === "call_reviewer" ||
    value === "repair_from_validation" ||
    value === "escalate" ||
    value === "escalate_to_codex" ||
    value === "human_decision" ||
    value === "needs_review"
    ? value
    : "needs_review";
}

export function normalizeOrchestratorDelegationReview(input: {
  reviewedWorkOrderId: string;
  reviewedRoleId: string;
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  responseText: string | null;
}): OrchestratorDelegationReview {
  const source = input.responseText?.trim() ?? "";
  let parsed: Record<string, unknown> = {};
  if (source.includes("{")) {
    try {
      parsed = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      parsed = {};
    }
  }
  const assessment =
    parsed.assessment && typeof parsed.assessment === "object" && !Array.isArray(parsed.assessment)
      ? (parsed.assessment as Record<string, unknown>)
      : parsed;
  const nextNodePlan =
    parsed.nextNodePlan &&
    typeof parsed.nextNodePlan === "object" &&
    !Array.isArray(parsed.nextNodePlan)
      ? (parsed.nextNodePlan as Record<string, unknown>)
      : null;
  return {
    artifactKind: "orchestrator_delegation_review",
    reviewedWorkOrderId: input.reviewedWorkOrderId,
    reviewedRoleId: input.reviewedRoleId,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelRunRef: input.modelRunRef,
    assessment: {
      answeredWorkOrder:
        typeof assessment.answeredWorkOrder === "boolean" ? assessment.answeredWorkOrder : null,
      specificEnoughForNextStep:
        typeof assessment.specificEnoughForNextStep === "boolean"
          ? assessment.specificEnoughForNextStep
          : null,
      missingInformation: compactStrings(assessment.missingInformation, 8, 260),
      nextAction: nextAction(assessment.nextAction),
      reasoningSummary:
        typeof assessment.reasoningSummary === "string"
          ? bounded(assessment.reasoningSummary, 1_000)
          : "The orchestrator did not return a bounded delegation review summary.",
    },
    nextNodePlan: nextNodePlan
      ? {
          roleId:
            typeof nextNodePlan.roleId === "string"
              ? bounded(nextNodePlan.roleId, 120)
              : "implementation_engineer",
          objective:
            typeof nextNodePlan.objective === "string"
              ? bounded(nextNodePlan.objective, 1_000)
              : "Continue from the reviewed child output.",
          targetRefs: compactStrings(nextNodePlan.targetRefs, 12, 260),
        }
      : null,
    reasonCodes: compactStrings(parsed.reasonCodes, 12, 160),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function validateOrchestratorDelegationReviewShape(
  review: OrchestratorDelegationReview,
): OrchestratorDelegationReviewShapeValidation {
  const reasonCodes: string[] = [];
  if (!review.reviewedWorkOrderId.trim()) {
    reasonCodes.push("delegation_review_work_order_ref_missing");
  }
  if (!review.reviewedRoleId.trim()) {
    reasonCodes.push("delegation_review_role_ref_missing");
  }
  if (!review.assessment.reasoningSummary.trim()) {
    reasonCodes.push("delegation_review_reasoning_summary_missing");
  }
  if (review.assessment.answeredWorkOrder === null) {
    reasonCodes.push("delegation_review_answered_work_order_missing");
  }
  if (review.assessment.specificEnoughForNextStep === null) {
    reasonCodes.push("delegation_review_specific_enough_missing");
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
  };
}
