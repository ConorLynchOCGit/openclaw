import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type SkillCandidateSkillVetterHandoffRawParams = ToolRawParams;

const SkillCandidateSkillVetterHandoffToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Bounded skill-candidate id to inspect for a manual Skill Vetter handoff package.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateSkillVetterHandoffInput(
  rawParams: SkillCandidateSkillVetterHandoffRawParams,
): SkillCandidateSkillVetterHandoffInput {
  return {
    skillCandidateId: readRequiredString(rawParams, "skillCandidateId"),
  };
}

export async function planSkillCandidateSkillVetterHandoffFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateSkillVetterHandoffInput;
}): Promise<SkillCandidateSkillVetterHandoffResult> {
  return params.runtime.skillCandidateSkillVetterHandoff.plan(params.input);
}

export function createSkillCandidateSkillVetterHandoffTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_skill_vetter_handoff",
    label: "Memory Skill Candidate Skill Vetter Handoff",
    description:
      "Return a bounded manual Skill Vetter handoff package for an eligible skill candidate and procurement record without invoking Skill Vetter, installing skills, or changing approval state.",
    parameters: SkillCandidateSkillVetterHandoffToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateSkillVetterHandoffRawParams) {
      const input = normalizeSkillCandidateSkillVetterHandoffInput(rawParams);
      const result = await planSkillCandidateSkillVetterHandoffFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
