import { Type } from "@sinclair/typebox";
import { Client } from "pg";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import {
  CANDIDATE_SUBMISSION_KINDS,
  type CandidateSubmissionInput,
  type CandidateSubmissionKind,
  type CandidateSubmissionResult,
} from "../db/runtime.js";
import { parseAutoCaptureManagedCandidateContent } from "../ordinary-turn-auto-capture.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult as asJsonToolResultBase,
  readContextUuid,
  readCandidateKind as readCandidateKindBase,
  readOptionalObject,
  readOptionalString as readOptionalStringBase,
  readRequiredString as readRequiredStringBase,
  type ToolRawParams,
} from "./common.js";

type CandidateSubmitRawParams = ToolRawParams;

function candidateKindSchema() {
  return Type.Unsafe<CandidateSubmissionKind>({
    type: "string",
    enum: [...CANDIDATE_SUBMISSION_KINDS],
    description: "Candidate submission kind: learning, correction, procedure, or improvement.",
  });
}

const CandidateSubmitToolSchema = Type.Object(
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

export async function submitCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: CandidateSubmissionInput;
}): Promise<CandidateSubmissionResult> {
  if (params.input.kind === "learning") {
    const duplicate = await findExistingAutoCaptureManagedDuplicate({
      runtime: params.runtime,
      content: params.input.content,
    });
    if (duplicate) {
      return {
        accepted: false,
        status: "failed",
        kind: "learning",
        reason: `ordinary-turn auto-capture already created ${duplicate.reviewState} candidate ${duplicate.id}`,
      };
    }
  }
  switch (params.input.kind) {
    case "learning":
      return params.runtime.candidateIngress.submitLearning(params.input);
    case "correction":
      return params.runtime.candidateIngress.submitCorrectionSuggestion(params.input);
    case "procedure":
      return params.runtime.candidateIngress.submitProcedureSuggestion(params.input);
    case "improvement":
      return params.runtime.candidateIngress.submitImprovementNote(params.input);
  }
}

async function findExistingAutoCaptureManagedDuplicate(params: {
  runtime: MemoryMiddlewareRuntime;
  content: string;
}): Promise<{ id: string; reviewState: string } | null> {
  const parsed = parseAutoCaptureManagedCandidateContent(params.content);
  const databaseUrl = params.runtime.config.database.url;
  if (!parsed || !databaseUrl) {
    return null;
  }

  const schema = params.runtime.config.database.schema ?? "memory_middleware";
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query<{ id: string; review_state: string }>(
      `
        select id::text as id, review_state::text as review_state
        from "${schema}"."memory_objects"
        where (
          metadata->'candidateMetadata'->'autoCapture'->>'key' = $1
          or metadata->'autoCapture'->>'key' = $1
        )
          and review_state in ('candidate', 'approved', 'corrected')
        order by created_at desc
        limit 1
      `,
      [parsed.key],
    );
    const row = result.rows[0];
    return row ? { id: row.id, reviewState: row.review_state } : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

function asJsonToolResult(result: CandidateSubmissionResult) {
  return asJsonToolResultBase(result);
}

export function createCandidateSubmitTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_candidate_submit",
    label: "Memory Candidate Submit",
    description:
      "Submit candidate-only learnings, correction suggestions, procedure suggestions, or improvement notes into the memory middleware ingress seam without creating approved memory.",
    parameters: CandidateSubmitToolSchema,
    async execute(_toolCallId: string, rawParams: CandidateSubmitRawParams) {
      const input = normalizeCandidateSubmissionInput({
        rawParams,
        context: params.context,
      });
      const result = await submitCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
