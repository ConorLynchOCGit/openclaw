import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryProactiveExecuteInput,
  MemoryProactiveExecuteResult,
  MemoryProactivePlanAction,
  MemoryProactivePlanActionType,
  MemoryProactivePlanResult,
  ProcedureValidationPlanResult,
  SkillCandidateProcurementPlanResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  buildCandidateReviewPromptFromTool,
  type CandidateReviewPromptResult,
} from "./candidate-review-prompt.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type MemoryProactiveExecuteRawParams = ToolRawParams;

const MemoryProactiveExecuteToolSchema = Type.Object(
  {
    actionType: Type.String({
      description:
        "Proactive action type to execute. Only run_drift_check is executable in this bounded slice.",
      minLength: 1,
    }),
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    maxActions: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    affectedIds: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
      }),
    ),
    reviewerAgentId: Type.Optional(Type.String({ minLength: 1 })),
    includeValidatedProcedures: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

function readProactiveExecuteActionType(
  rawParams: MemoryProactiveExecuteRawParams,
): MemoryProactivePlanActionType {
  const actionType = readRequiredString(rawParams, "actionType");
  if (
    actionType !== "follow_up_candidate_review" &&
    actionType !== "follow_up_procedure_validation" &&
    actionType !== "follow_up_skill_candidate_governance" &&
    actionType !== "revisit_stale_memory" &&
    actionType !== "run_drift_check" &&
    actionType !== "review_consolidation_findings" &&
    actionType !== "no_action"
  ) {
    throw new CandidateToolInputError(
      "actionType must be one of: follow_up_candidate_review, follow_up_procedure_validation, follow_up_skill_candidate_governance, revisit_stale_memory, run_drift_check, review_consolidation_findings, no_action",
    );
  }
  return actionType;
}

function normalizeAffectedIds(rawParams: MemoryProactiveExecuteRawParams): string[] | undefined {
  const affectedIds = readOptionalStringArray(rawParams, "affectedIds");
  if (!affectedIds) {
    return undefined;
  }

  const normalized = [...new Set(affectedIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (normalized.length === 0) {
    throw new CandidateToolInputError("affectedIds must contain at least one non-empty string");
  }
  return normalized.sort((left, right) => left.localeCompare(right));
}

type AcceptedCandidateReviewPrompt = Extract<CandidateReviewPromptResult, { accepted: true }>;
type AcceptedProcedureValidationPlan = Extract<ProcedureValidationPlanResult, { accepted: true }>;
type AcceptedSkillCandidateProcurementPlan = Extract<
  SkillCandidateProcurementPlanResult,
  { accepted: true }
>;

type ProactiveConversationalPrompt = {
  actionType:
    | "follow_up_candidate_review"
    | "follow_up_procedure_validation"
    | "follow_up_skill_candidate_governance";
  targetId: string;
  promptTitle: string;
  promptText: string;
  recommendedToolName: string;
  recommendedToolInput: Record<string, unknown>;
  rationale: string[];
  requiredGates?: string[];
  possibleTargets?: string[];
  eligible?: boolean;
};

type MemoryProactiveExecuteToolResult =
  | MemoryProactiveExecuteResult
  | {
      accepted: true;
      status: "executed" | "no_op";
      actionType:
        | "follow_up_candidate_review"
        | "follow_up_procedure_validation"
        | "follow_up_skill_candidate_governance";
      executionSource: "explicit_selection" | "derived_plan";
      affectedIds: string[];
      rationale: string[];
      candidateReviewPrompts?: AcceptedCandidateReviewPrompt[];
      conversationalPrompts?: ProactiveConversationalPrompt[];
    };

function findDerivedAction(
  plan: Extract<MemoryProactivePlanResult, { accepted: true }>,
  actionType:
    | "follow_up_candidate_review"
    | "follow_up_procedure_validation"
    | "follow_up_skill_candidate_governance",
) {
  return plan.actions.find((action) => action.actionType === actionType);
}

async function buildCandidateReviewPrompts(params: {
  runtime: MemoryMiddlewareRuntime;
  candidateIds: string[];
}): Promise<
  | { accepted: true; prompts: AcceptedCandidateReviewPrompt[] }
  | Extract<CandidateReviewPromptResult, { accepted: false }>
> {
  const prompts: AcceptedCandidateReviewPrompt[] = [];
  for (const candidateId of params.candidateIds) {
    const prompt = await buildCandidateReviewPromptFromTool({
      runtime: params.runtime,
      input: { candidateId },
    });
    if (!prompt.accepted) {
      return prompt;
    }
    prompts.push(prompt);
  }
  return {
    accepted: true,
    prompts,
  };
}

function mapCandidateReviewPromptsToConversationalPrompts(
  prompts: AcceptedCandidateReviewPrompt[],
): ProactiveConversationalPrompt[] {
  return prompts.map((prompt) => ({
    actionType: "follow_up_candidate_review",
    targetId: prompt.candidateId,
    promptTitle: "Candidate review follow-up",
    promptText: prompt.conversationalReview.question,
    recommendedToolName: prompt.conversationalReview.reviewToolName,
    recommendedToolInput: { candidateId: prompt.candidateId },
    rationale: prompt.conversationalReview.instructions,
  }));
}

function normalizeProactiveFollowUpFailure(
  actionType:
    | "follow_up_candidate_review"
    | "follow_up_procedure_validation"
    | "follow_up_skill_candidate_governance",
  status: "disabled" | "not_configured" | "failed" | "not_found",
  reason: string,
): Extract<MemoryProactiveExecuteResult, { accepted: false }> {
  return {
    accepted: false,
    status: status === "not_found" ? "failed" : status,
    actionType,
    reason,
  };
}

async function buildProcedureValidationPrompts(params: {
  runtime: MemoryMiddlewareRuntime;
  procedureIds: string[];
}): Promise<
  | {
      accepted: true;
      prompts: ProactiveConversationalPrompt[];
      plans: AcceptedProcedureValidationPlan[];
    }
  | Extract<ProcedureValidationPlanResult, { accepted: false }>
> {
  const prompts: ProactiveConversationalPrompt[] = [];
  const plans: AcceptedProcedureValidationPlan[] = [];
  for (const procedureId of params.procedureIds) {
    const plan = await params.runtime.procedureValidationPlan.plan({ procedureId });
    if (!plan.accepted) {
      return plan;
    }
    plans.push(plan);
    prompts.push({
      actionType: "follow_up_procedure_validation",
      targetId: procedureId,
      promptTitle: "Procedure validation follow-up",
      promptText: plan.eligible
        ? `I found a draft procedure that looks eligible for bounded validation. Do you want me to inspect validation planning for procedure ${procedureId} and continue if the plan still looks sound?`
        : `I found a draft procedure that may need follow-up before validation. Do you want me to inspect validation planning for procedure ${procedureId} and tell you what gates are still missing?`,
      recommendedToolName: "memory_procedure_validate_plan",
      recommendedToolInput: { procedureId },
      rationale: plan.rationale,
      requiredGates: plan.requiredGates,
      possibleTargets: plan.possibleTargets,
      eligible: plan.eligible,
    });
  }
  return { accepted: true, prompts, plans };
}

async function buildSkillGovernancePrompts(params: {
  runtime: MemoryMiddlewareRuntime;
  skillCandidateIds: string[];
}): Promise<
  | {
      accepted: true;
      prompts: ProactiveConversationalPrompt[];
      plans: AcceptedSkillCandidateProcurementPlan[];
    }
  | Extract<SkillCandidateProcurementPlanResult, { accepted: false }>
> {
  const prompts: ProactiveConversationalPrompt[] = [];
  const plans: AcceptedSkillCandidateProcurementPlan[] = [];
  for (const skillCandidateId of params.skillCandidateIds) {
    const plan = await params.runtime.skillCandidateProcurementPlan.plan({ skillCandidateId });
    if (!plan.accepted) {
      return plan;
    }
    plans.push(plan);
    prompts.push({
      actionType: "follow_up_skill_candidate_governance",
      targetId: skillCandidateId,
      promptTitle: "Skill governance follow-up",
      promptText: plan.eligible
        ? `I found a skill candidate that looks ready for the next bounded governance step. Do you want me to inspect procurement planning for skill candidate ${skillCandidateId} and summarize the remaining gates before any external review?`
        : `I found a skill candidate that still needs bounded governance follow-up. Do you want me to inspect procurement planning for skill candidate ${skillCandidateId} and show what is still blocking it?`,
      recommendedToolName: "memory_skill_candidate_procurement_plan",
      recommendedToolInput: { skillCandidateId },
      rationale: plan.rationale,
      requiredGates: plan.requiredGates,
      possibleTargets: plan.possibleTargets,
      eligible: plan.eligible,
    });
  }
  return { accepted: true, prompts, plans };
}

export function normalizeMemoryProactiveExecuteInput(params: {
  rawParams: MemoryProactiveExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): MemoryProactiveExecuteInput {
  const projectId = readOptionalString(params.rawParams, "projectId");
  const maxActions = readOptionalNumber(params.rawParams, "maxActions");
  const reviewerAgentId =
    readOptionalString(params.rawParams, "reviewerAgentId") ?? params.context?.agentId;
  const includeValidatedProcedures = readOptionalBoolean(
    params.rawParams,
    "includeValidatedProcedures",
  );
  const affectedIds = normalizeAffectedIds(params.rawParams);

  return {
    actionType: readProactiveExecuteActionType(params.rawParams),
    ...(projectId ? { projectId } : {}),
    ...(maxActions !== undefined ? { maxActions } : {}),
    ...(affectedIds ? { affectedIds } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
  };
}

export async function executeMemoryProactiveFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryProactiveExecuteInput;
}): Promise<MemoryProactiveExecuteToolResult> {
  if (params.input.actionType === "follow_up_candidate_review") {
    const explicitAffectedIds = params.input.affectedIds;
    if (explicitAffectedIds && explicitAffectedIds.length > 0) {
      const promptResult = await buildCandidateReviewPrompts({
        runtime: params.runtime,
        candidateIds: explicitAffectedIds,
      });
      if (!promptResult.accepted) {
        return {
          accepted: false,
          status: promptResult.status === "not_found" ? "failed" : promptResult.status,
          actionType: "follow_up_candidate_review",
          reason: promptResult.reason,
        };
      }
      return {
        accepted: true,
        status: "executed",
        actionType: "follow_up_candidate_review",
        executionSource: "explicit_selection",
        affectedIds: explicitAffectedIds,
        rationale: [
          "bounded proactive execution prepared conversational candidate review prompts for the explicit selection",
        ],
        candidateReviewPrompts: promptResult.prompts,
        conversationalPrompts: mapCandidateReviewPromptsToConversationalPrompts(
          promptResult.prompts,
        ),
      };
    }

    const plan = await params.runtime.proactivePlanning.plan({
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      ...(params.input.maxActions !== undefined ? { maxActions: params.input.maxActions } : {}),
    });
    if (!plan.accepted) {
      return {
        accepted: false,
        status: plan.status,
        actionType: "follow_up_candidate_review",
        reason: plan.reason,
      };
    }

    const derivedAction = findDerivedAction(plan, "follow_up_candidate_review");
    if (!derivedAction || derivedAction.affectedIds.length === 0) {
      return {
        accepted: true,
        status: "no_op",
        actionType: "follow_up_candidate_review",
        executionSource: "derived_plan",
        affectedIds: [],
        rationale: [
          "no conversational candidate-review follow-up is currently available from the proactive planner",
        ],
      };
    }

    const promptResult = await buildCandidateReviewPrompts({
      runtime: params.runtime,
      candidateIds: derivedAction.affectedIds,
    });
    if (!promptResult.accepted) {
      return {
        accepted: false,
        status: promptResult.status === "not_found" ? "failed" : promptResult.status,
        actionType: "follow_up_candidate_review",
        reason: promptResult.reason,
      };
    }
    return {
      accepted: true,
      status: "executed",
      actionType: "follow_up_candidate_review",
      executionSource: "derived_plan",
      affectedIds: derivedAction.affectedIds,
      rationale: [
        "bounded proactive execution derived conversational candidate review prompts from the current advisory planner result",
      ],
      candidateReviewPrompts: promptResult.prompts,
      conversationalPrompts: mapCandidateReviewPromptsToConversationalPrompts(promptResult.prompts),
    };
  }

  if (params.input.actionType === "follow_up_procedure_validation") {
    const explicitAffectedIds = params.input.affectedIds;
    if (explicitAffectedIds && explicitAffectedIds.length > 0) {
      const promptResult = await buildProcedureValidationPrompts({
        runtime: params.runtime,
        procedureIds: explicitAffectedIds,
      });
      if (!promptResult.accepted) {
        return normalizeProactiveFollowUpFailure(
          "follow_up_procedure_validation",
          promptResult.status,
          promptResult.reason,
        );
      }
      return {
        accepted: true,
        status: "executed",
        actionType: "follow_up_procedure_validation",
        executionSource: "explicit_selection",
        affectedIds: explicitAffectedIds,
        rationale: [
          "bounded proactive execution prepared conversational procedure-validation prompts for the explicit selection",
        ],
        conversationalPrompts: promptResult.prompts,
      };
    }

    const plan = await params.runtime.proactivePlanning.plan({
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      ...(params.input.maxActions !== undefined ? { maxActions: params.input.maxActions } : {}),
    });
    if (!plan.accepted) {
      return {
        accepted: false,
        status: plan.status,
        actionType: "follow_up_procedure_validation",
        reason: plan.reason,
      };
    }
    const derivedAction = findDerivedAction(plan, "follow_up_procedure_validation");
    if (!derivedAction || derivedAction.affectedIds.length === 0) {
      return {
        accepted: true,
        status: "no_op",
        actionType: "follow_up_procedure_validation",
        executionSource: "derived_plan",
        affectedIds: [],
        rationale: [
          "no conversational procedure-validation follow-up is currently available from the proactive planner",
        ],
      };
    }
    const promptResult = await buildProcedureValidationPrompts({
      runtime: params.runtime,
      procedureIds: derivedAction.affectedIds,
    });
    if (!promptResult.accepted) {
      return normalizeProactiveFollowUpFailure(
        "follow_up_procedure_validation",
        promptResult.status,
        promptResult.reason,
      );
    }
    return {
      accepted: true,
      status: "executed",
      actionType: "follow_up_procedure_validation",
      executionSource: "derived_plan",
      affectedIds: derivedAction.affectedIds,
      rationale: [
        "bounded proactive execution derived conversational procedure-validation prompts from the current advisory planner result",
      ],
      conversationalPrompts: promptResult.prompts,
    };
  }

  if (params.input.actionType === "follow_up_skill_candidate_governance") {
    const explicitAffectedIds = params.input.affectedIds;
    if (explicitAffectedIds && explicitAffectedIds.length > 0) {
      const promptResult = await buildSkillGovernancePrompts({
        runtime: params.runtime,
        skillCandidateIds: explicitAffectedIds,
      });
      if (!promptResult.accepted) {
        return normalizeProactiveFollowUpFailure(
          "follow_up_skill_candidate_governance",
          promptResult.status,
          promptResult.reason,
        );
      }
      return {
        accepted: true,
        status: "executed",
        actionType: "follow_up_skill_candidate_governance",
        executionSource: "explicit_selection",
        affectedIds: explicitAffectedIds,
        rationale: [
          "bounded proactive execution prepared conversational skill-governance prompts for the explicit selection",
        ],
        conversationalPrompts: promptResult.prompts,
      };
    }

    const plan = await params.runtime.proactivePlanning.plan({
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      ...(params.input.maxActions !== undefined ? { maxActions: params.input.maxActions } : {}),
    });
    if (!plan.accepted) {
      return {
        accepted: false,
        status: plan.status,
        actionType: "follow_up_skill_candidate_governance",
        reason: plan.reason,
      };
    }
    const derivedAction = findDerivedAction(plan, "follow_up_skill_candidate_governance");
    if (!derivedAction || derivedAction.affectedIds.length === 0) {
      return {
        accepted: true,
        status: "no_op",
        actionType: "follow_up_skill_candidate_governance",
        executionSource: "derived_plan",
        affectedIds: [],
        rationale: [
          "no conversational skill-governance follow-up is currently available from the proactive planner",
        ],
      };
    }
    const promptResult = await buildSkillGovernancePrompts({
      runtime: params.runtime,
      skillCandidateIds: derivedAction.affectedIds,
    });
    if (!promptResult.accepted) {
      return normalizeProactiveFollowUpFailure(
        "follow_up_skill_candidate_governance",
        promptResult.status,
        promptResult.reason,
      );
    }
    return {
      accepted: true,
      status: "executed",
      actionType: "follow_up_skill_candidate_governance",
      executionSource: "derived_plan",
      affectedIds: derivedAction.affectedIds,
      rationale: [
        "bounded proactive execution derived conversational skill-governance prompts from the current advisory planner result",
      ],
      conversationalPrompts: promptResult.prompts,
    };
  }

  return params.runtime.proactiveExecution.execute(params.input);
}

export function createMemoryProactiveExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_proactive_execute",
    label: "Memory Proactive Execute",
    description:
      "Execute bounded proactive actions by routing run_drift_check through the drift-check seam and turning candidate-review, procedure-validation, and skill-governance follow-up into conversational prompts.",
    parameters: MemoryProactiveExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryProactiveExecuteRawParams) {
      const input = normalizeMemoryProactiveExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemoryProactiveFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
