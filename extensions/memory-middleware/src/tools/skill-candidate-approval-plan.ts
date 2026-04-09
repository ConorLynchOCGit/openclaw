import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateApprovalPlanInput,
  SkillCandidateApprovalPlanResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type SkillCandidateApprovalPlanRawParams = ToolRawParams;

const SkillCandidateApprovalPlanToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Bounded skill-candidate id to inspect for advisory-only approval and install planning.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateApprovalPlanInput(
  rawParams: SkillCandidateApprovalPlanRawParams,
): SkillCandidateApprovalPlanInput {
  return {
    skillCandidateId: readRequiredString(rawParams, "skillCandidateId"),
  };
}

export async function planSkillCandidateApprovalFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateApprovalPlanInput;
}): Promise<SkillCandidateApprovalPlanResult> {
  return params.runtime.skillCandidateApprovalPlan.plan(params.input);
}

export function createSkillCandidateApprovalPlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_approval_plan",
    label: "Memory Skill Candidate Approval Plan",
    description:
      "Return advisory-only approval and install planning guidance for a bounded skill candidate with recorded vetting results, without mutating approval state or installing skills.",
    parameters: SkillCandidateApprovalPlanToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateApprovalPlanRawParams) {
      const input = normalizeSkillCandidateApprovalPlanInput(rawParams);
      const result = await planSkillCandidateApprovalFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
