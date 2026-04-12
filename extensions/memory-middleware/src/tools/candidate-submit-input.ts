import { Type } from "@sinclair/typebox";
import type { OpenClawPluginToolContext } from "../../api.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateSubmissionInput,
  type CandidateSubmissionKind,
} from "../db/runtime.js";
import {
  readContextUuid,
  readCandidateKind as readCandidateKindBase,
  readOptionalObject,
  readOptionalString as readOptionalStringBase,
  readRequiredString as readRequiredStringBase,
  type ToolRawParams,
} from "./common.js";

export type CandidateSubmitRawParams = ToolRawParams;

function candidateKindSchema() {
  return Type.Unsafe<CandidateSubmissionKind>({
    type: "string",
    enum: [...CANDIDATE_SUBMISSION_KINDS],
    description: "Candidate submission kind: learning, correction, procedure, or improvement.",
  });
}

export const CandidateSubmitToolSchema = Type.Object(
  {
    kind: candidateKindSchema(),
    content: Type.String({
      description: "Candidate-only content to submit into the memory middleware seam.",
      minLength: 1,
    }),
    sessionId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware session UUID. Omit for ordinary live submissions unless you know the backing memory session row exists.",
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id." })),
    agentId: Type.Optional(
      Type.String({
        description:
          "Optional explicit memory-middleware agent UUID. Omit for ordinary live submissions unless you know the backing memory agent row exists.",
      }),
    ),
    metadata: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "Optional candidate metadata." }),
    ),
  },
  { additionalProperties: false },
);

function readRequiredString(params: CandidateSubmitRawParams, key: string): string {
  return readRequiredStringBase(params, key);
}

function readOptionalString(params: CandidateSubmitRawParams, key: string): string | undefined {
  return readOptionalStringBase(params, key);
}

function readCandidateKind(params: CandidateSubmitRawParams): CandidateSubmissionKind {
  return readCandidateKindBase(params);
}

function readOptionalMetadata(
  params: CandidateSubmitRawParams,
): Record<string, unknown> | undefined {
  return readOptionalObject(params, "metadata");
}

export function normalizeCandidateSubmissionInput(params: {
  rawParams: CandidateSubmitRawParams;
  context?: OpenClawPluginToolContext;
}): CandidateSubmissionInput {
  const sessionId = readContextUuid(readOptionalString(params.rawParams, "sessionId"));
  const projectId = readContextUuid(readOptionalString(params.rawParams, "projectId"));
  const agentId = readContextUuid(readOptionalString(params.rawParams, "agentId"));
  const metadata = readOptionalMetadata(params.rawParams);

  return {
    kind: readCandidateKind(params.rawParams),
    content: readRequiredString(params.rawParams, "content"),
    ...(sessionId ? { sessionId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(agentId ? { agentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}
