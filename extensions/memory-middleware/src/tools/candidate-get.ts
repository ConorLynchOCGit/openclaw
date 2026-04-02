import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { CandidateGetInput, CandidateGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type CandidateGetRawParams = ToolRawParams;

const CandidateGetToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to inspect.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeCandidateGetInput(rawParams: CandidateGetRawParams): CandidateGetInput {
  return {
    candidateId: readRequiredString(rawParams, "candidateId"),
  };
}

export async function getCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateGetInput;
}): Promise<CandidateGetResult> {
  return params.runtime.candidateQuery.get(params.input);
}

export function createCandidateGetTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_get",
    label: "Memory Candidate Get",
    description:
      "Inspect one candidate-only memory row created through the memory middleware candidate submission seam.",
    parameters: CandidateGetToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateGetRawParams) {
      const input = normalizeCandidateGetInput(rawParams);
      const result = await getCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
