import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  DriftCheckExecuteInput,
  DriftCheckExecuteResult,
  DriftCheckExecuteSelection,
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

type MemoryDriftCheckExecuteRawParams = ToolRawParams;

const MemoryDriftCheckExecuteToolSchema = Type.Object(
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
            actionType: Type.Literal("drift_check_review"),
            affectedObjectIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);

function readOptionalApprovedDriftFindings(
  rawParams: MemoryDriftCheckExecuteRawParams,
): DriftCheckExecuteSelection[] | undefined {
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
    const actionType = (entry as Record<string, unknown>).actionType;
    if (actionType !== "drift_check_review") {
      throw new CandidateToolInputError("approvedFindings.actionType must be drift_check_review");
    }
    const affectedObjectIds = (entry as Record<string, unknown>).affectedObjectIds;
    if (!Array.isArray(affectedObjectIds) || affectedObjectIds.length === 0) {
      throw new CandidateToolInputError(
        "approvedFindings.affectedObjectIds must be a non-empty string array",
      );
    }
    return {
      actionType: "drift_check_review" as const,
      affectedObjectIds: affectedObjectIds.map((objectId) => {
        if (typeof objectId !== "string" || objectId.trim().length === 0) {
          throw new CandidateToolInputError(
            "approvedFindings.affectedObjectIds must contain only strings",
          );
        }
        return objectId.trim();
      }),
    };
  });
}

export function normalizeMemoryDriftCheckExecuteInput(params: {
  rawParams: MemoryDriftCheckExecuteRawParams;
  context?: OpenClawPluginToolContext;
}): DriftCheckExecuteInput {
  const projectId = readOptionalString(params.rawParams, "projectId");
  const includeValidatedProcedures = readOptionalBoolean(
    params.rawParams,
    "includeValidatedProcedures",
  );
  const limit = readOptionalNumber(params.rawParams, "limit");
  const maxFindings = readOptionalNumber(params.rawParams, "maxFindings");
  const reviewerAgentId =
    readOptionalString(params.rawParams, "reviewerAgentId") ?? params.context?.agentId;
  const approvedFindings = readOptionalApprovedDriftFindings(params.rawParams);

  return {
    ...(projectId ? { projectId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(approvedFindings ? { approvedFindings } : {}),
  };
}

export async function executeMemoryDriftCheckFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: DriftCheckExecuteInput;
}): Promise<DriftCheckExecuteResult> {
  return params.runtime.driftCheckExecution.execute(params.input);
}

export function createMemoryDriftCheckExecuteTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_drift_check_execute",
    label: "Memory Drift Check Execute",
    description:
      "Record conservative overdue drift-check review artifacts for durable memory or validated procedures without rewriting stored facts.",
    parameters: MemoryDriftCheckExecuteToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryDriftCheckExecuteRawParams) {
      const input = normalizeMemoryDriftCheckExecuteInput({
        rawParams,
        context: params.context,
      });
      const result = await executeMemoryDriftCheckFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
