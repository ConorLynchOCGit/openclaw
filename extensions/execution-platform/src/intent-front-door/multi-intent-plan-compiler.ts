import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import type { IntentValidationDecision } from "./intent-validator.ts";
import type { CanonicalMultiIntentPlanStep, CanonicalRouterOutput } from "./router-schema.ts";

export const MULTI_INTENT_PLAN_COMPILER_VERSION = "intent-front-door.multi-intent-plan-compiler.v1";

export type CompiledMultiIntentPlanStep = {
  order: number;
  route: CanonicalMultiIntentPlanStep["route"];
  workflowId: string | null;
  objectiveSummary: string;
  dependsOnStep: number | null;
  authorityProfile: string | null;
  sideEffectful: boolean;
  separateValidationRequired: boolean;
  conditionalPolicyProofRequired: boolean;
  status: "ready_for_validation" | "held_for_policy_proof" | "blocked" | "needs_review";
  reasonCodes: string[];
};

export type MultiIntentPlanCompileDecision = {
  artifactKind: "front_door_multi_intent_plan_compile_decision";
  compilerVersion: typeof MULTI_INTENT_PLAN_COMPILER_VERSION;
  outcome: "compiled" | "blocked" | "needs_review";
  parentWorkflowId: string | null;
  steps: CompiledMultiIntentPlanStep[];
  reasonCodes: string[];
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type MultiIntentPlanCompilerInput = {
  routerOutput: CanonicalRouterOutput;
  validation: IntentValidationDecision;
  workflowContracts: ExecutionWorkflowContract[];
  authorityProofRefsByStep?: Record<number, string[]>;
  conditionalPolicyProofByStep?: Record<number, boolean>;
  workQueueLifecycleMutationRequested?: boolean;
};

const KNOWN_STEP_ROUTES = new Set<CanonicalMultiIntentPlanStep["route"]>([
  "chat_response",
  "plan_only",
  "workflow_execution",
  "research_only",
  "work_queue_control",
  "approval_required",
]);

const SIDE_EFFECTFUL_STEP_ROUTES = new Set<CanonicalMultiIntentPlanStep["route"]>([
  "workflow_execution",
  "research_only",
  "work_queue_control",
  "approval_required",
]);

export function compileMultiIntentPlan(
  input: MultiIntentPlanCompilerInput,
): MultiIntentPlanCompileDecision {
  const reasonCodes: string[] = [];
  if (input.routerOutput.rawPromptStored || input.routerOutput.rawResponseStored) {
    reasonCodes.push("raw_storage_flags_rejected");
  }
  if (input.workQueueLifecycleMutationRequested) {
    reasonCodes.push("work_queue_lifecycle_mutation_rejected");
  }
  if (input.routerOutput.route !== "multi_workflow_plan") {
    reasonCodes.push("route_is_not_multi_workflow_plan");
  }
  if (input.validation.outcome !== "accepted" || !input.validation.accepted) {
    reasonCodes.push(`validation_not_accepted:${input.validation.outcome}`);
  }

  const steps = compileSteps(input, reasonCodes);
  const hasBlockedStep = steps.some((step) => step.status === "blocked");
  const hasNeedsReviewStep = steps.some((step) => step.status === "needs_review");
  const outcome =
    reasonCodes.length > 0 || hasBlockedStep
      ? "blocked"
      : hasNeedsReviewStep
        ? "needs_review"
        : "compiled";

  return {
    artifactKind: "front_door_multi_intent_plan_compile_decision",
    compilerVersion: MULTI_INTENT_PLAN_COMPILER_VERSION,
    outcome,
    parentWorkflowId: input.routerOutput.workflowId,
    steps,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 50),
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function compileSteps(
  input: MultiIntentPlanCompilerInput,
  globalReasonCodes: string[],
): CompiledMultiIntentPlanStep[] {
  const steps = input.routerOutput.multiIntentPlan;
  const orders = new Set<number>();
  const compiled: CompiledMultiIntentPlanStep[] = [];
  const workflowIds = new Set(input.workflowContracts.map((workflow) => workflow.workflowId));

  for (const step of steps.toSorted((left, right) => left.order - right.order)) {
    const reasonCodes: string[] = [];
    if (orders.has(step.order)) {
      reasonCodes.push("duplicate_step_order");
      globalReasonCodes.push("duplicate_step_order");
    }
    orders.add(step.order);
    if (!KNOWN_STEP_ROUTES.has(step.route)) {
      reasonCodes.push("unknown_step_route");
      globalReasonCodes.push("unknown_step_route");
    }
    if (
      step.dependsOnStep !== null &&
      !steps.some((candidate) => candidate.order === step.dependsOnStep)
    ) {
      reasonCodes.push("missing_dependency_step");
      globalReasonCodes.push("missing_dependency_step");
    }
    if (step.dependsOnStep === step.order) {
      reasonCodes.push("cyclic_dependency_step");
      globalReasonCodes.push("cyclic_dependency_step");
    }
    if (
      (step.route === "workflow_execution" || step.route === "research_only") &&
      (!step.workflowId || !workflowIds.has(step.workflowId))
    ) {
      reasonCodes.push("workflow_step_not_registered");
      globalReasonCodes.push("workflow_step_not_registered");
    }
    const sideEffectful = SIDE_EFFECTFUL_STEP_ROUTES.has(step.route);
    if (sideEffectful && !step.authorityProfile) {
      reasonCodes.push("side_effectful_step_missing_authority_profile");
      globalReasonCodes.push("side_effectful_step_missing_authority_profile");
    }
    const conditionalPolicyProofRequired =
      step.route === "approval_required" ||
      Boolean(step.authorityProfile && step.authorityProfile.includes("deploy"));
    const conditionalProofSatisfied =
      input.conditionalPolicyProofByStep?.[step.order] === true ||
      input.authorityProofRefsByStep?.[step.order]?.length;
    if (conditionalPolicyProofRequired && !conditionalProofSatisfied) {
      reasonCodes.push("conditional_step_held_for_policy_proof");
    }
    const missingAuthorityProof =
      sideEffectful &&
      !conditionalPolicyProofRequired &&
      !input.authorityProofRefsByStep?.[step.order]?.length;
    if (missingAuthorityProof) {
      reasonCodes.push("side_effectful_step_requires_separate_validation");
    }
    compiled.push({
      order: step.order,
      route: step.route,
      workflowId: step.workflowId,
      objectiveSummary: boundText(step.objectiveSummary, 600),
      dependsOnStep: step.dependsOnStep,
      authorityProfile: step.authorityProfile,
      sideEffectful,
      separateValidationRequired: sideEffectful,
      conditionalPolicyProofRequired,
      status: reasonCodes.some((reason) =>
        [
          "duplicate_step_order",
          "unknown_step_route",
          "missing_dependency_step",
          "cyclic_dependency_step",
          "workflow_step_not_registered",
          "side_effectful_step_missing_authority_profile",
        ].includes(reason),
      )
        ? "blocked"
        : conditionalPolicyProofRequired && !conditionalProofSatisfied
          ? "held_for_policy_proof"
          : missingAuthorityProof
            ? "needs_review"
            : "ready_for_validation",
      reasonCodes: [...new Set(reasonCodes)],
    });
  }

  if (hasCycle(steps)) {
    globalReasonCodes.push("cyclic_dependency_graph");
    return compiled.map((step) =>
      step.dependsOnStep === null
        ? step
        : {
            ...step,
            status: "blocked",
            reasonCodes: [...new Set([...step.reasonCodes, "cyclic_dependency_graph"])],
          },
    );
  }

  return compiled;
}

function hasCycle(steps: CanonicalMultiIntentPlanStep[]): boolean {
  const dependencies = new Map(steps.map((step) => [step.order, step.dependsOnStep]));
  for (const step of steps) {
    const seen = new Set<number>();
    let current: number | null = step.order;
    while (current !== null) {
      if (seen.has(current)) {
        return true;
      }
      seen.add(current);
      current = dependencies.get(current) ?? null;
    }
  }
  return false;
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
