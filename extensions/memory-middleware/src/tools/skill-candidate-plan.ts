import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { SkillCandidatePlanInput, SkillCandidatePlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type SkillCandidatePlanRawParams = ToolRawParams;

const SkillCandidatePlanToolSchema = Type.Object(
  {
    procedureId: Type.String({
      description: "Validated procedure id to inspect for advisory-only skill-candidate planning.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidatePlanInput(
  rawParams: SkillCandidatePlanRawParams,
): SkillCandidatePlanInput {
  return {
    procedureId: readRequiredString(rawParams, "procedureId"),
  };
}

export async function planSkillCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidatePlanInput;
}): Promise<SkillCandidatePlanResult> {
  return params.runtime.skillCandidatePlan.plan(params.input);
}

export function createSkillCandidatePlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_plan",
    label: "Memory Skill Candidate Plan",
    description:
      "Return advisory-only next-step skill-candidate planning targets for a validated procedure without creating skill candidates or downstream workflows.",
    parameters: SkillCandidatePlanToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidatePlanRawParams) {
      const input = normalizeSkillCandidatePlanInput(rawParams);
      const result = await planSkillCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
