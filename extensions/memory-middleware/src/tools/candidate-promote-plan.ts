import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { CandidatePromotionPlanInput, CandidatePromotionPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type CandidatePromotePlanRawParams = ToolRawParams;

const CandidatePromotePlanToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to assess for advisory-only promotion planning.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeCandidatePromotionPlanInput(
  rawParams: CandidatePromotePlanRawParams,
): CandidatePromotionPlanInput {
  return {
    candidateId: readRequiredString(rawParams, "candidateId"),
  };
}

export async function planCandidatePromotionFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidatePromotionPlanInput;
}): Promise<CandidatePromotionPlanResult> {
  return params.runtime.candidatePromotionPlan.plan(params.input);
}

export function createCandidatePromotePlanTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_promote_plan",
    label: "Memory Candidate Promote Plan",
    description:
      "Return advisory-only next-step promotion targets for a reviewed candidate without creating approved memory, procedures, or skills.",
    parameters: CandidatePromotePlanToolSchema,
    async execute(_toolCallId: string, rawParams: CandidatePromotePlanRawParams) {
      const input = normalizeCandidatePromotionPlanInput(rawParams);
      const result = await planCandidatePromotionFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
