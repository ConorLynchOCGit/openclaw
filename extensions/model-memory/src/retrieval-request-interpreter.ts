import { z } from "zod";
import type { CanonicalClass, Confidence, MemoryKind } from "./semantic-schema.ts";

export type RetrievalEnvelope = {
  queryText: string;
  requestPurpose: string;
  scope?: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  maxResults?: number;
};

export type RetrievalRequestPrompt = {
  contractName: "retrieval_request_interpretation";
  contractVersion: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  responseFormat: "json";
};

export type InterpretedRetrievalRequest = {
  goal: string;
  canonicalClasses: CanonicalClass[];
  kinds?: MemoryKind[];
  scopeConstraints?: Record<string, string>;
  subjectHints?: string[];
  contentHints?: string[];
  desiredResultCount: number;
  requestConfidence: Confidence;
};

export type RetrievalRequestInterpreterInput = {
  envelope: RetrievalEnvelope;
  prompt: RetrievalRequestPrompt;
};

export type RetrievalRequestInterpreterResult =
  | { action: "skip" }
  | { action: "retrieve"; request: InterpretedRetrievalRequest };

export interface RetrievalRequestInterpreter {
  interpret(input: RetrievalRequestInterpreterInput): Promise<RetrievalRequestInterpreterResult>;
}

const InterpretedRetrievalRequestSchema = z
  .object({
    goal: z.string().trim().min(1),
    canonicalClasses: z.array(z.enum(["user", "feedback", "project", "reference"])).default([]),
    kinds: z.array(z.enum(["preference", "fact", "rule", "procedure", "reference"])).optional(),
    scopeConstraints: z.record(z.string(), z.string().trim().min(1)).optional(),
    subjectHints: z.array(z.string().trim().min(1)).optional(),
    contentHints: z.array(z.string().trim().min(1)).optional(),
    desiredResultCount: z.number().int().min(1).max(20),
    requestConfidence: z.enum(["weak", "medium", "strong"]),
  })
  .strict();

export function buildRetrievalRequestPrompt(
  envelope: RetrievalEnvelope,
  modelId: string,
  contractVersion = "v1",
): RetrievalRequestPrompt {
  return {
    contractName: "retrieval_request_interpretation",
    contractVersion,
    modelId,
    systemPrompt: [
      "Interpret retrieval requests for model-memory.",
      "Return only structured retrieval intent.",
      "Use canonical classes and kinds only when supported by the query.",
      "Prefer broad filters over invented specifics.",
    ].join("\n"),
    userPrompt: JSON.stringify(
      {
        queryText: envelope.queryText,
        requestPurpose: envelope.requestPurpose,
        scope: envelope.scope ?? {},
        maxResults: envelope.maxResults ?? 5,
      },
      null,
      2,
    ),
    responseFormat: "json",
  };
}

export async function interpretRetrievalRequest(input: {
  envelope: RetrievalEnvelope;
  interpreter: RetrievalRequestInterpreter;
  modelId: string;
  contractVersion?: string;
}): Promise<RetrievalRequestInterpreterResult> {
  const prompt = buildRetrievalRequestPrompt(
    input.envelope,
    input.modelId,
    input.contractVersion ?? "v1",
  );
  const result = await input.interpreter.interpret({
    envelope: input.envelope,
    prompt,
  });
  if (result.action === "skip") {
    return result;
  }
  return {
    action: "retrieve",
    request: InterpretedRetrievalRequestSchema.parse(result.request),
  };
}
