import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  MemoryProactiveExecuteInput,
  MemoryProactiveExecuteResult,
  MemoryProactivePlanActionType,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
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
}): Promise<MemoryProactiveExecuteResult> {
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
      "Execute only the bounded proactive run_drift_check action by routing through the existing drift-check execution seam.",
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
