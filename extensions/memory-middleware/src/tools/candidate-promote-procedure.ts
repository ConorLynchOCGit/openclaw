import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  CandidateProcedurePromotionInput,
  CandidateProcedurePromotionResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type CandidatePromoteProcedureRawParams = ToolRawParams;

const CandidatePromoteProcedureToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to promote into a bounded procedure draft.",
      minLength: 1,
    }),
    title: Type.Optional(
      Type.String({
        description: "Optional explicit title for the procedure draft.",
        minLength: 1,
      }),
    ),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this manual procedure-draft promotion.",
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

export function normalizeCandidateProcedurePromotionInput(params: {
  rawParams: CandidatePromoteProcedureRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateProcedurePromotionInput {
  const candidateId = readRequiredString(params.rawParams, "candidateId");
  const title = readOptionalString(params.rawParams, "title");
  const rationale = readOptionalString(params.rawParams, "rationale");
  const promoterAgentId =
    readOptionalString(params.rawParams, "promoterAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    candidateId,
    ...(title ? { title } : {}),
    ...(rationale ? { rationale } : {}),
    ...(promoterAgentId ? { promoterAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function promoteCandidateToProcedureDraftFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateProcedurePromotionInput;
}): Promise<CandidateProcedurePromotionResult> {
  return params.runtime.candidatePromotion.promoteToProcedureDraft(params.input);
}

export function createCandidatePromoteProcedureTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_promote_procedure",
    label: "Memory Candidate Promote Procedure",
    description:
      "Promote an eligible reviewed procedure candidate into a bounded procedure draft without validating it or creating skill candidates.",
    parameters: CandidatePromoteProcedureToolSchema,
    async execute(_toolCallId: string, rawParams: CandidatePromoteProcedureRawParams) {
      const input = normalizeCandidateProcedurePromotionInput({
        rawParams,
        context: params.context,
      });
      const result = await promoteCandidateToProcedureDraftFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
