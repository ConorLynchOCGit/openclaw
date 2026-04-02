import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  ConsolidationExecuteSelection,
  MemoryBackgroundJobClass,
  MemoryBackgroundJobEnqueueInput,
  MemoryBackgroundJobEnqueueResult,
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

type MemoryBackgroundJobEnqueueRawParams = ToolRawParams;

const MemoryBackgroundJobEnqueueToolSchema = Type.Object(
  {
    jobClass: Type.String({
      description:
        "Bounded background job class to enqueue. Only proactive_plan, proactive_execute_run_drift_check, consolidation_plan, and consolidation_execute are supported in this slice.",
      minLength: 1,
    }),
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    sessionId: Type.Optional(Type.String({ minLength: 1 })),
    agentId: Type.Optional(Type.String({ minLength: 1 })),
    runAfter: Type.Optional(Type.String({ minLength: 1 })),
    maxAttempts: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
    maxActions: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    maxFindings: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    approvedFindings: Type.Optional(
      Type.Array(
        Type.Object(
          {
            actionType: Type.Union([
              Type.Literal("duplicate_merge_review"),
              Type.Literal("stale_superseded_review"),
            ]),
            affectedObjectIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    affectedIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
    reviewerAgentId: Type.Optional(Type.String({ minLength: 1 })),
    includeValidatedProcedures: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

function readBackgroundJobClass(
  rawParams: MemoryBackgroundJobEnqueueRawParams,
): MemoryBackgroundJobClass {
  const jobClass = readRequiredString(rawParams, "jobClass");
  if (
    jobClass !== "proactive_plan" &&
    jobClass !== "proactive_execute_run_drift_check" &&
    jobClass !== "consolidation_plan" &&
    jobClass !== "consolidation_execute"
  ) {
    throw new CandidateToolInputError(
      "jobClass must be one of: proactive_plan, proactive_execute_run_drift_check, consolidation_plan, consolidation_execute",
    );
  }
  return jobClass;
}

function normalizeApprovedFindings(
  rawParams: MemoryBackgroundJobEnqueueRawParams,
): ConsolidationExecuteSelection[] | undefined {
  const value = rawParams.approvedFindings;
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new CandidateToolInputError("approvedFindings must be an array");
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new CandidateToolInputError("approvedFindings entries must be objects");
      }
      const actionType = (entry as Record<string, unknown>).actionType;
      if (actionType !== "duplicate_merge_review" && actionType !== "stale_superseded_review") {
        throw new CandidateToolInputError(
          "approvedFindings.actionType must be one of: duplicate_merge_review, stale_superseded_review",
        );
      }
      const affectedObjectIds = (entry as Record<string, unknown>).affectedObjectIds;
      if (!Array.isArray(affectedObjectIds) || affectedObjectIds.length === 0) {
        throw new CandidateToolInputError(
          "approvedFindings.affectedObjectIds must be a non-empty string array",
        );
      }

      return {
        actionType,
        affectedObjectIds: [
          ...new Set(
            affectedObjectIds.map((objectId) => {
              if (typeof objectId !== "string" || objectId.trim().length === 0) {
                throw new CandidateToolInputError(
                  "approvedFindings.affectedObjectIds must contain only strings",
                );
              }
              return objectId.trim();
            }),
          ),
        ].sort((left, right) => left.localeCompare(right)),
      } satisfies ConsolidationExecuteSelection;
    })
    .sort((left, right) => {
      const actionDelta = left.actionType.localeCompare(right.actionType);
      if (actionDelta !== 0) {
        return actionDelta;
      }
      return left.affectedObjectIds.join(",").localeCompare(right.affectedObjectIds.join(","));
    });
}

function normalizeAffectedIds(
  rawParams: MemoryBackgroundJobEnqueueRawParams,
): string[] | undefined {
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

export function normalizeMemoryBackgroundJobEnqueueInput(params: {
  rawParams: MemoryBackgroundJobEnqueueRawParams;
  context?: OpenClawPluginToolContext;
}): MemoryBackgroundJobEnqueueInput {
  const jobClass = readBackgroundJobClass(params.rawParams);
  const projectId = readOptionalString(params.rawParams, "projectId");
  const sessionId = readOptionalString(params.rawParams, "sessionId") ?? params.context?.sessionId;
  const agentId = readOptionalString(params.rawParams, "agentId") ?? params.context?.agentId;
  const runAfter = readOptionalString(params.rawParams, "runAfter");
  const maxAttempts = readOptionalNumber(params.rawParams, "maxAttempts");
  const maxActions = readOptionalNumber(params.rawParams, "maxActions");
  const limit = readOptionalNumber(params.rawParams, "limit");
  const maxFindings = readOptionalNumber(params.rawParams, "maxFindings");
  const approvedFindings = normalizeApprovedFindings(params.rawParams);
  const affectedIds = normalizeAffectedIds(params.rawParams);
  const reviewerAgentId = readOptionalString(params.rawParams, "reviewerAgentId");
  const includeValidatedProcedures = readOptionalBoolean(
    params.rawParams,
    "includeValidatedProcedures",
  );

  return {
    jobClass,
    ...(projectId ? { projectId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(runAfter ? { runAfter } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(maxActions !== undefined ? { maxActions } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
    ...(approvedFindings ? { approvedFindings } : {}),
    ...(affectedIds ? { affectedIds } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
  };
}

export async function enqueueMemoryBackgroundJobFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryBackgroundJobEnqueueInput;
}): Promise<MemoryBackgroundJobEnqueueResult> {
  return params.runtime.backgroundJobs.enqueue(params.input);
}

export function createMemoryBackgroundJobEnqueueTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_background_job_enqueue",
    label: "Memory Background Job Enqueue",
    description:
      "Queue a bounded internal memory-middleware background job for advisory proactive planning, advisory consolidation planning, bounded safe consolidation execution, or bounded proactive drift-check execution.",
    parameters: MemoryBackgroundJobEnqueueToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryBackgroundJobEnqueueRawParams) {
      const input = normalizeMemoryBackgroundJobEnqueueInput({
        rawParams,
        context: params.context,
      });
      const result = await enqueueMemoryBackgroundJobFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
