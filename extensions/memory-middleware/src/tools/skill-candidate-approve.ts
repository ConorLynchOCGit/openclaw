import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateApproveInput,
  SkillCandidateApproveResult,
  SkillCandidateApprovalScope,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type SkillCandidateApproveRawParams = ToolRawParams;

const SkillCandidateApproveToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Bounded skill-candidate id to mark approved for limited or normal internal use.",
      minLength: 1,
    }),
    scope: Type.Union([Type.Literal("limited"), Type.Literal("normal")]),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this manual approval-state write.",
        minLength: 1,
      }),
    ),
    approverAgentId: Type.Optional(
      Type.String({
        description: "Optional approver agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional approval metadata." }),
    ),
  },
  { additionalProperties: false },
);

function readApprovalScope(rawParams: SkillCandidateApproveRawParams): SkillCandidateApprovalScope {
  const scope = readRequiredString(rawParams, "scope");
  if (scope !== "limited" && scope !== "normal") {
    throw new Error("scope must be one of: limited, normal");
  }
  return scope;
}

export function normalizeSkillCandidateApproveInput(params: {
  rawParams: SkillCandidateApproveRawParams;
  context?: OpenClawPluginToolContext;
}): SkillCandidateApproveInput {
  const skillCandidateId = readRequiredString(params.rawParams, "skillCandidateId");
  const scope = readApprovalScope(params.rawParams);
  const rationale = readOptionalString(params.rawParams, "rationale");
  const approverAgentId =
    readOptionalString(params.rawParams, "approverAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    skillCandidateId,
    scope,
    ...(rationale ? { rationale } : {}),
    ...(approverAgentId ? { approverAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function approveSkillCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateApproveInput;
}): Promise<SkillCandidateApproveResult> {
  return params.runtime.skillCandidateApproval.approve(params.input);
}

export function createSkillCandidateApproveTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_approve",
    label: "Memory Skill Candidate Approve",
    description:
      "Persist bounded internal approval state for an eligible skill candidate without installing skills or triggering downstream workflows.",
    parameters: SkillCandidateApproveToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateApproveRawParams) {
      const input = normalizeSkillCandidateApproveInput({
        rawParams,
        context: params.context,
      });
      const result = await approveSkillCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
