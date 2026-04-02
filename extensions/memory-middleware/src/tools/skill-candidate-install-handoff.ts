import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateInstallHandoffInput,
  SkillCandidateInstallHandoffResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type SkillCandidateInstallHandoffRawParams = ToolRawParams;

const SkillCandidateInstallHandoffToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Approved bounded skill-candidate id to inspect for a separate manual install handoff.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateInstallHandoffInput(
  rawParams: SkillCandidateInstallHandoffRawParams,
): SkillCandidateInstallHandoffInput {
  return {
    skillCandidateId: readRequiredString(rawParams, "skillCandidateId"),
  };
}

export async function planSkillCandidateInstallHandoffFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateInstallHandoffInput;
}): Promise<SkillCandidateInstallHandoffResult> {
  return params.runtime.skillCandidateInstallHandoff.plan(params.input);
}

export function createSkillCandidateInstallHandoffTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_install_handoff",
    label: "Memory Skill Candidate Install Handoff",
    description:
      "Return advisory-only manual install handoff guidance for an approved bounded skill candidate without installing anything.",
    parameters: SkillCandidateInstallHandoffToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateInstallHandoffRawParams) {
      const input = normalizeSkillCandidateInstallHandoffInput(rawParams);
      const result = await planSkillCandidateInstallHandoffFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
