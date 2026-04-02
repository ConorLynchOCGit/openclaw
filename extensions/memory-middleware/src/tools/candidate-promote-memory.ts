import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  CandidateMemoryPromotionInput,
  CandidateMemoryPromotionResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type CandidatePromoteMemoryRawParams = ToolRawParams;

const CandidatePromoteMemoryToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to promote into bounded durable memory.",
      minLength: 1,
    }),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this manual memory-promotion decision.",
        minLength: 1,
      }),
    ),
    promoterAgentId: Type.Optional(
      Type.String({
        description: "Optional promoter agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional promotion metadata." }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeCandidateMemoryPromotionInput(params: {
  rawParams: CandidatePromoteMemoryRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateMemoryPromotionInput {
  const candidateId = readRequiredString(params.rawParams, "candidateId");
  const rationale = readOptionalString(params.rawParams, "rationale");
  const promoterAgentId =
    readOptionalString(params.rawParams, "promoterAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    candidateId,
    ...(rationale ? { rationale } : {}),
    ...(promoterAgentId ? { promoterAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function promoteCandidateToMemoryFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateMemoryPromotionInput;
}): Promise<CandidateMemoryPromotionResult> {
  return params.runtime.candidatePromotion.promoteToMemory(params.input);
}

export function createCandidatePromoteMemoryTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_promote_memory",
    label: "Memory Candidate Promote Memory",
    description:
      "Promote an eligible reviewed candidate into bounded durable memory without creating procedures, skills, or automatic downstream workflows.",
    parameters: CandidatePromoteMemoryToolSchema,
    async execute(_toolCallId: string, rawParams: CandidatePromoteMemoryRawParams) {
      const input = normalizeCandidateMemoryPromotionInput({
        rawParams,
        context: params.context,
      });
      const result = await promoteCandidateToMemoryFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
