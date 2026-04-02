import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  ConsolidationExecuteInput,
  ConsolidationExecuteResult,
  ConsolidationExecuteSelection,
  ConsolidationPlanActionType,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type MemoryConsolidationExecuteRawParams = ToolRawParams;

const ConsolidationActionTypeSchema = Type.Union([
  Type.Literal("duplicate_merge_review"),
  Type.Literal("contradiction_review"),
  Type.Literal("stale_superseded_review"),
  Type.Literal("drift_check_review"),
]);

const MemoryConsolidationExecuteToolSchema = Type.Object(
  {
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    includeValidatedProcedures: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    maxFindings: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    reviewerAgentId: Type.Optional(Type.String({ minLength: 1 })),
    approvedFindings: Type.Optional(
      Type.Array(
        Type.Object(
          {
            actionType: ConsolidationActionTypeSchema,
            affectedObjectIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);

function parseConsolidationActionType(value: unknown): ConsolidationPlanActionType {
  if (
    value === "duplicate_merge_review" ||
    value === "contradiction_review" ||
    value === "stale_superseded_review" ||
    value === "drift_check_review"
  ) {
    return value;
  }
  throw new CandidateToolInputError(
    "approvedFindings.actionType must be one of: duplicate_merge_review, contradiction_review, stale_superseded_review, drift_check_review",
  );
}

function readOptionalApprovedFindings(
  rawParams: MemoryConsolidationExecuteRawParams,
): ConsolidationExecuteSelection[] | undefined {
  const value = rawParams.approvedFindings;
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new CandidateToolInputError("approvedFindings must be an array");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CandidateToolInputError("approvedFindings entries must be objects");
    }
    const actionType = parseConsolidationActionType((entry as Record<string, unknown>).actionType);
    const affectedObjectIds = (entry as Record<string, unknown>).affectedObjectIds;
    if (!Array.isArray(affectedObjectIds) || affectedObjectIds.length === 0) {
      throw new CandidateToolInputError(
        "approvedFindings.affectedObjectIds must be a non-empty string array",
      );
    }
    const normalizedIds = affectedObjectIds.map((objectId) => {
      if (typeof objectId !== "string" || objectId.trim().length === 0) {
        throw new CandidateToolInputError(
          "approvedFindings.affectedObjectIds must contain only strings",
        );
      }
      return objectId.trim();
    });
    return {
      actionType,
      affectedObjectIds: normalizedIds,
    };
  });
}

export function normalizeMemoryConsolidationExecuteInput(params: {
  rawParams: MemoryConsolidationExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): ConsolidationExecuteInput {
  const projectId = readOptionalString(params.rawParams, "projectId");
  const includeValidatedProcedures = readOptionalBoolean(
    params.rawParams,
    "includeValidatedProcedures",
  );
  const limit = readOptionalNumber(params.rawParams, "limit");
  const maxFindings = readOptionalNumber(params.rawParams, "maxFindings");
  const reviewerAgentId =
    readOptionalString(params.rawParams, "reviewerAgentId") ?? params.context?.agentId;
  const approvedFindings = readOptionalApprovedFindings(params.rawParams);

  return {
    ...(projectId ? { projectId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(approvedFindings ? { approvedFindings } : {}),
  };
}

export async function executeMemoryConsolidationFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ConsolidationExecuteInput;
}): Promise<ConsolidationExecuteResult> {
  return params.runtime.consolidationExecution.execute(params.input);
}

export function createMemoryConsolidationExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_consolidation_execute",
    label: "Memory Consolidation Execute",
    description:
      "Execute only conservative consolidation actions for duplicate or superseded durable memory while leaving contradiction and drift findings advisory-only.",
    parameters: MemoryConsolidationExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryConsolidationExecuteRawParams) {
      const input = normalizeMemoryConsolidationExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemoryConsolidationFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
