import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { SkillCandidateCreateInput, SkillCandidateCreateResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type SkillCandidateCreateRawParams = ToolRawParams;

const SkillCandidateCreateToolSchema = Type.Object(
  {
    procedureId: Type.String({
      description: "Validated procedure id to turn into a bounded skill-candidate record.",
      minLength: 1,
    }),
    name: Type.Optional(
      Type.String({
        description:
          "Optional bounded skill-candidate name. Defaults to the validated procedure title.",
        minLength: 1,
      }),
    ),
    summary: Type.Optional(
      Type.String({
        description:
          "Optional bounded skill-candidate summary. Defaults to the validated procedure body.",
        minLength: 1,
      }),
    ),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this manual skill-candidate creation.",
        minLength: 1,
      }),
    ),
    creatorAgentId: Type.Optional(
      Type.String({
        description: "Optional creator agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "Optional skill-candidate metadata." },
      ),
    ),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateCreateInput(params: {
  rawParams: SkillCandidateCreateRawParams;
  context?: OpenClawPluginToolContext;
}): SkillCandidateCreateInput {
  const procedureId = readRequiredString(params.rawParams, "procedureId");
  const name = readOptionalString(params.rawParams, "name");
  const summary = readOptionalString(params.rawParams, "summary");
  const rationale = readOptionalString(params.rawParams, "rationale");
  const creatorAgentId =
    readOptionalString(params.rawParams, "creatorAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    procedureId,
    ...(name ? { name } : {}),
    ...(summary ? { summary } : {}),
    ...(rationale ? { rationale } : {}),
    ...(creatorAgentId ? { creatorAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function createSkillCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateCreateInput;
}): Promise<SkillCandidateCreateResult> {
  return params.runtime.skillCandidate.create(params.input);
}

export function createSkillCandidateCreateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_create",
    label: "Memory Skill Candidate Create",
    description:
      "Create a bounded skill-candidate record from an eligible validated procedure without installing skills or triggering downstream workflows.",
    parameters: SkillCandidateCreateToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateCreateRawParams) {
      const input = normalizeSkillCandidateCreateInput({
        rawParams,
        context: params.context,
      });
      const result = await createSkillCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
