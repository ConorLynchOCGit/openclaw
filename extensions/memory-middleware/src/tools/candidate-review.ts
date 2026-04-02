import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import {
  CANDIDATE_REVIEW_OUTCOMES,
  type CandidateReviewInput,
  type CandidateReviewOutcome,
  type CandidateReviewResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  CandidateToolInputError,
  asJsonToolResult,
  readCandidateReviewOutcome,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type CandidateReviewRawParams = ToolRawParams;

function candidateReviewOutcomeSchema() {
  return Type.Unsafe<CandidateReviewOutcome>({
    type: "string",
    enum: [...CANDIDATE_REVIEW_OUTCOMES],
    description: "Candidate review outcome: accepted, rejected, or needs_revision.",
  });
}

const CandidateReviewToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to review.",
      minLength: 1,
    }),
    outcome: candidateReviewOutcomeSchema(),
    rationale: Type.Optional(
      Type.String({
        description: "Optional rationale. Required for rejected and needs_revision outcomes.",
        minLength: 1,
      }),
    ),
    reviewerAgentId: Type.Optional(
      Type.String({
        description: "Optional reviewer agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional review metadata." }),
    ),
  },
  { additionalProperties: false },
);

export function normalizeCandidateReviewInput(params: {
  rawParams: CandidateReviewRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateReviewInput {
  const candidateId = readRequiredString(params.rawParams, "candidateId");
  const outcome = readCandidateReviewOutcome(params.rawParams);
  const rationale = readOptionalString(params.rawParams, "rationale");

  if ((outcome === "rejected" || outcome === "needs_revision") && !rationale) {
    throw new CandidateToolInputError(
      "rationale required for rejected and needs_revision outcomes",
    );
  }

  const reviewerAgentId =
    readOptionalString(params.rawParams, "reviewerAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    candidateId,
    outcome,
    ...(rationale ? { rationale } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function reviewCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateReviewInput;
}): Promise<CandidateReviewResult> {
  return params.runtime.candidateReview.review(params.input);
}

export function createCandidateReviewTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_review",
    label: "Memory Candidate Review",
    description:
      "Record bounded candidate review outcomes without promoting candidates into approved memory.",
    parameters: CandidateReviewToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateReviewRawParams) {
      const input = normalizeCandidateReviewInput({
        rawParams,
        context: params.context,
      });
      const result = await reviewCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
