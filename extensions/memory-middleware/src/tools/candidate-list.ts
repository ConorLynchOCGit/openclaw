import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateListInput,
  type CandidateListResult,
  type CandidateSubmissionKind,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readCandidateKind,
  readOptionalNumber,
  readOptionalString,
  type ToolRawParams,
} from "./common.js";

type CandidateListRawParams = ToolRawParams;

function candidateKindSchema() {
  return Type.Unsafe<CandidateSubmissionKind>({
    type: "string",
    enum: [...CANDIDATE_SUBMISSION_KINDS],
    description: "Optional candidate kind filter: learning, correction, procedure, or improvement.",
  });
}

const CandidateListToolSchema = Type.Object(
  {
    kind: Type.Optional(candidateKindSchema()),
    sessionId: Type.Optional(Type.String({ description: "Optional session id filter." })),
    projectId: Type.Optional(Type.String({ description: "Optional project id filter." })),
    agentId: Type.Optional(Type.String({ description: "Optional agent id filter." })),
    limit: Type.Optional(
      Type.Number({
        description:
          "Optional maximum number of candidate rows to return. Defaults to 20, maximum 50.",
        minimum: 1,
        maximum: 50,
      }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeCandidateListInput(rawParams: CandidateListRawParams): CandidateListInput {
  const kind = rawParams.kind === undefined ? undefined : readCandidateKind(rawParams);
  const sessionId = readOptionalString(rawParams, "sessionId");
  const projectId = readOptionalString(rawParams, "projectId");
  const agentId = readOptionalString(rawParams, "agentId");
  const limit = readOptionalNumber(rawParams, "limit");

  return {
    ...(kind ? { kind } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export async function listCandidatesFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateListInput;
}): Promise<CandidateListResult> {
  return params.runtime.candidateQuery.list(params.input);
}

export function createCandidateListTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_list",
    label: "Memory Candidate List",
    description:
      "List candidate-only memory rows created through the memory middleware candidate submission seam.",
    parameters: CandidateListToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateListRawParams) {
      const input = normalizeCandidateListInput(rawParams);
      const result = await listCandidatesFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
