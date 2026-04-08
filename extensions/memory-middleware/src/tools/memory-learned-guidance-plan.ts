import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  LearnedGuidanceAdvisoryPlanningInput,
  LearnedGuidanceAdvisoryPlanningResult,
} from "../learned-guidance-advisory-planning.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalNumber,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type MemoryLearnedGuidancePlanRawParams = ToolRawParams;

const MemoryLearnedGuidancePlanToolSchema = Type.Object(
  {
    query: Type.String({
      description:
        "The current repo-operating ask to inspect for approved workflow guidance that may be relevant right now.",
      minLength: 1,
    }),
    projectId: Type.Optional(
      Type.String({
        description: "Optional project id to keep learned-guidance planning project-scoped.",
      }),
    ),
    maxSuggestions: Type.Optional(
      Type.Number({
        description: "Maximum number of advisory-only learned-guidance suggestions to return.",
        minimum: 1,
        maximum: 10,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeMemoryLearnedGuidancePlanInput(
  rawParams: MemoryLearnedGuidancePlanRawParams,
): LearnedGuidanceAdvisoryPlanningInput {
  const projectId = readOptionalString(rawParams, "projectId");
  const maxSuggestions = readOptionalNumber(rawParams, "maxSuggestions");

  return {
    query: readRequiredString(rawParams, "query"),
    ...(projectId ? { projectId } : {}),
    ...(maxSuggestions !== undefined ? { maxSuggestions } : {}),
  };
}

export async function planLearnedGuidanceFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: LearnedGuidanceAdvisoryPlanningInput;
  context?: OpenClawPluginToolContext;
}): Promise<LearnedGuidanceAdvisoryPlanningResult> {
  return params.runtime.learnedGuidanceAdvisoryPlanning.plan(params.input);
}

export function createMemoryLearnedGuidancePlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_learned_guidance_plan",
    label: "Memory Learned Guidance Plan",
    description:
      "Read approved workflow-guidance memory through the normal approved retrieval path and return bounded advisory-only inline suggestions without writing memory or executing actions.",
    parameters: MemoryLearnedGuidancePlanToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryLearnedGuidancePlanRawParams) {
      const input = normalizeMemoryLearnedGuidancePlanInput(rawParams);
      const result = await planLearnedGuidanceFromTool({
        runtime: params.runtime,
        input,
        context: params.context,
      });
      return asJsonToolResult(result);
    },
  };
}
