import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { CandidateGetInput, CandidateReviewOutcome } from "../db/runtime.js";
import { readCanonicalMemoryIngestionCandidateFromMetadata } from "../memory-canonical-compat.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type CandidateReviewPromptRawParams = ToolRawParams;

const CandidateReviewPromptToolSchema = Type.Object(
  {
    candidateId: Type.String({
      description: "Candidate memory object id to turn into a conversational review prompt.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export type CandidateReviewPromptSuggestion = {
  userReply: string;
  mappedOutcome: CandidateReviewOutcome;
  note: string;
};

export type CandidateReviewPromptResult =
  | {
      accepted: true;
      status: "ok";
      candidateId: string;
      candidateKind: string;
      memoryKind: string;
      reviewState: string;
      content: string;
      canonicalSummary?: {
        kind?: string;
        subject?: string;
        statement?: string;
        captureClass?: string;
        captureCategory?: string;
      };
      conversationalReview: {
        question: string;
        instructions: string[];
        suggestedReplies: CandidateReviewPromptSuggestion[];
        reviewToolName: "memory_candidate_review";
      };
    }
  | {
      accepted: false;
      status: "disabled" | "not_configured" | "failed" | "not_found";
      reason: string;
    };

function buildSuggestedReplies(): CandidateReviewPromptSuggestion[] {
  return [
    {
      userReply: "Approve it.",
      mappedOutcome: "accepted",
      note: "Use when the candidate is correct and should keep influencing future behavior.",
    },
    {
      userReply: "Reject it because it is wrong or outdated.",
      mappedOutcome: "rejected",
      note: "Use when the candidate should not be kept as memory.",
    },
    {
      userReply: "Revise it to say <new text>.",
      mappedOutcome: "needs_revision",
      note: "Use when the idea is useful but the content needs to be corrected first.",
    },
  ];
}

export function normalizeCandidateReviewPromptInput(
  rawParams: CandidateReviewPromptRawParams,
): CandidateGetInput {
  return {
    candidateId: readRequiredString(rawParams, "candidateId"),
  };
}

export async function buildCandidateReviewPromptFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateGetInput;
}): Promise<CandidateReviewPromptResult> {
  const candidateResult = await params.runtime.candidateQuery.get(params.input);
  if (!candidateResult.accepted) {
    return candidateResult;
  }

  const candidate = candidateResult.candidate;
  const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(
    candidate.candidateMetadata,
  );
  const canonicalSummary =
    canonicalCandidate &&
    (canonicalCandidate.record.kind ||
      canonicalCandidate.record.subject ||
      canonicalCandidate.record.statement ||
      canonicalCandidate.compatibility.captureClass ||
      canonicalCandidate.record.compatibility.captureCategory)
      ? {
          ...(canonicalCandidate.record.kind ? { kind: canonicalCandidate.record.kind } : {}),
          ...(canonicalCandidate.record.subject
            ? { subject: canonicalCandidate.record.subject }
            : {}),
          ...(canonicalCandidate.record.statement
            ? { statement: canonicalCandidate.record.statement }
            : {}),
          ...(canonicalCandidate.compatibility.captureClass
            ? { captureClass: canonicalCandidate.compatibility.captureClass }
            : {}),
          ...(typeof canonicalCandidate.record.compatibility.captureCategory === "string"
            ? { captureCategory: canonicalCandidate.record.compatibility.captureCategory }
            : {}),
        }
      : undefined;

  return {
    accepted: true,
    status: "ok",
    candidateId: candidate.id,
    candidateKind: candidate.kind,
    memoryKind: candidate.memoryKind,
    reviewState: candidate.reviewState,
    content: candidate.content,
    ...(canonicalSummary ? { canonicalSummary } : {}),
    conversationalReview: {
      question:
        "Should I keep this candidate as memory, reject it, or revise it before keeping it?",
      instructions: [
        "Reply in natural language with approve, reject, or revise.",
        "If you want a revision, include the corrected wording in your reply.",
        "After your reply, route the outcome through memory_candidate_review.",
      ],
      suggestedReplies: buildSuggestedReplies(),
      reviewToolName: "memory_candidate_review",
    },
  };
}

export function createCandidateReviewPromptTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_review_prompt",
    label: "Memory Candidate Review Prompt",
    description:
      "Prepare a user-facing conversational review prompt for one candidate so an agent can ask the user to approve, reject, or revise it in chat.",
    parameters: CandidateReviewPromptToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateReviewPromptRawParams) {
      const input = normalizeCandidateReviewPromptInput(rawParams);
      const result = await buildCandidateReviewPromptFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
