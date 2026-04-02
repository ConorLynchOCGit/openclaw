import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateProcurementPlanInput,
  SkillCandidateProcurementPlanResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type SkillCandidateProcurementPlanRawParams = ToolRawParams;

const SkillCandidateProcurementPlanToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Bounded skill-candidate id to inspect for advisory-only procurement handoff planning.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateProcurementPlanInput(
  rawParams: SkillCandidateProcurementPlanRawParams,
): SkillCandidateProcurementPlanInput {
  return {
    skillCandidateId: readRequiredString(rawParams, "skillCandidateId"),
  };
}

export async function planSkillCandidateProcurementFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateProcurementPlanInput;
}): Promise<SkillCandidateProcurementPlanResult> {
  return params.runtime.skillCandidateProcurementPlan.plan(params.input);
}

export function createSkillCandidateProcurementPlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_procurement_plan",
    label: "Memory Skill Candidate Procurement Plan",
    description:
      "Return advisory-only procurement handoff guidance for a bounded skill candidate without invoking Skill Vetter, installing skills, or triggering downstream workflows.",
    parameters: SkillCandidateProcurementPlanToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateProcurementPlanRawParams) {
      const input = normalizeSkillCandidateProcurementPlanInput(rawParams);
      const result = await planSkillCandidateProcurementFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
