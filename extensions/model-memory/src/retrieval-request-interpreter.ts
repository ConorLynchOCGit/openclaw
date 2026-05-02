import { z } from "zod";
import { normalizeRetrievalText } from "./runtime/retrieval/text-normalization.ts";
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

const BROAD_RETRIEVAL_PURPOSES = new Set([
  "operator_help",
  "workflow_guidance",
  "reference_lookup",
  "architecture_lookup",
]);

const RETRIEVAL_SCOPE_CONSTRAINT_KEYS = new Set([
  "tenantId",
  "userId",
  "userScope",
  "projectId",
  "projectScope",
  "workspaceId",
  "workflowScope",
  "canonicalClass",
  "kind",
]);

const RETRIEVAL_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "consult",
  "could",
  "from",
  "have",
  "help",
  "into",
  "that",
  "their",
  "them",
  "what",
  "where",
  "which",
  "should",
  "with",
  "would",
]);

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

function normalizeScopeConstraints(
  scope: Record<string, unknown> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scope ?? {}).flatMap(([key, value]) => {
      if (!RETRIEVAL_SCOPE_CONSTRAINT_KEYS.has(key)) {
        return [];
      }
      if (typeof value !== "string") {
        return [];
      }
      const normalized = normalizeRetrievalText(value);
      return normalized.length > 0 ? [[key, normalized] as const] : [];
    }),
  );
}

function uniqueSignificantTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens = text
    .split(/[^a-z0-9]+/i)
    .map((token) => normalizeRetrievalText(token))
    .filter(
      (token) => token.length >= 4 && !RETRIEVAL_STOPWORDS.has(token) && !/^\d+$/.test(token),
    );
  const deduped: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    deduped.push(token);
  }
  return deduped.slice(0, 8);
}

function filterHintsToQuerySurface(
  hints: string[] | undefined,
  queryTokens: Set<string>,
): string[] {
  if (!hints?.length) {
    return [];
  }

  return hints.filter((hint) => {
    const hintTokens = uniqueSignificantTokens(hint);
    if (hintTokens.length === 0) {
      return false;
    }
    return hintTokens.some((token) => queryTokens.has(token));
  });
}

function mergeHints(...hintLists: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const hintList of hintLists) {
    for (const hint of hintList ?? []) {
      const normalized = normalizeRetrievalText(hint);
      if (normalized.length === 0 || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(hint);
    }
  }
  return merged.length > 0 ? merged : undefined;
}

function isBroadRetrievalEnvelope(envelope: RetrievalEnvelope): boolean {
  return (
    BROAD_RETRIEVAL_PURPOSES.has(envelope.requestPurpose) &&
    Object.keys(normalizeScopeConstraints(envelope.scope)).length === 0
  );
}

function shouldUseBroadTypeRecall(envelope: RetrievalEnvelope): boolean {
  return envelope.requestPurpose === "live_context_injection" || isBroadRetrievalEnvelope(envelope);
}

export function buildLexicalBaselineRetrievalRequest(
  envelope: RetrievalEnvelope,
): InterpretedRetrievalRequest {
  const hints = uniqueSignificantTokens(envelope.queryText);
  return {
    goal: envelope.queryText,
    canonicalClasses: [],
    kinds: undefined,
    scopeConstraints: normalizeScopeConstraints(envelope.scope),
    subjectHints: hints,
    contentHints: hints,
    desiredResultCount: envelope.maxResults ?? 5,
    requestConfidence: "weak",
  };
}

export function harmonizeInterpretedRetrievalRequest(input: {
  envelope: RetrievalEnvelope;
  request: InterpretedRetrievalRequest;
}): {
  request: InterpretedRetrievalRequest;
  modified: boolean;
  rationale: string[];
} {
  const baseline = buildLexicalBaselineRetrievalRequest(input.envelope);
  const queryTokens = new Set(uniqueSignificantTokens(input.envelope.queryText));
  const filteredSubjectHints = filterHintsToQuerySurface(input.request.subjectHints, queryTokens);
  const filteredContentHints = filterHintsToQuerySurface(input.request.contentHints, queryTokens);
  const broadEnvelope = isBroadRetrievalEnvelope(input.envelope);
  const broadTypeRecall = shouldUseBroadTypeRecall(input.envelope);
  const harmonizedRequest: InterpretedRetrievalRequest = {
    goal: input.request.goal,
    canonicalClasses: broadTypeRecall ? [] : input.request.canonicalClasses,
    kinds: broadTypeRecall ? undefined : input.request.kinds,
    scopeConstraints:
      Object.keys(input.request.scopeConstraints ?? {}).length > 0
        ? normalizeScopeConstraints(input.request.scopeConstraints)
        : baseline.scopeConstraints,
    subjectHints: broadEnvelope
      ? baseline.subjectHints
      : mergeHints(baseline.subjectHints, filteredSubjectHints),
    contentHints: broadEnvelope
      ? baseline.contentHints
      : mergeHints(baseline.contentHints, filteredContentHints),
    desiredResultCount: Math.max(input.request.desiredResultCount, baseline.desiredResultCount),
    requestConfidence: broadEnvelope ? "weak" : input.request.requestConfidence,
  };

  const rationale: string[] = [];
  if (broadTypeRecall && input.request.canonicalClasses.length > 0) {
    rationale.push("broad_query_cleared_canonical_classes");
  }
  if (broadTypeRecall && input.request.kinds?.length) {
    rationale.push("broad_query_cleared_kinds");
  }
  if (harmonizedRequest.desiredResultCount !== input.request.desiredResultCount) {
    rationale.push("raised_desired_result_count_to_envelope_max");
  }
  if ((filteredSubjectHints.length ?? 0) !== (input.request.subjectHints?.length ?? 0)) {
    rationale.push("subject_hints_filtered_to_query_surface");
  }
  if ((filteredContentHints.length ?? 0) !== (input.request.contentHints?.length ?? 0)) {
    rationale.push("content_hints_filtered_to_query_surface");
  }
  if (broadEnvelope && input.request.subjectHints?.length) {
    rationale.push("broad_query_reset_subject_hints_to_baseline");
  }
  if (broadEnvelope && input.request.contentHints?.length) {
    rationale.push("broad_query_reset_content_hints_to_baseline");
  }

  return {
    request: harmonizedRequest,
    modified: JSON.stringify(harmonizedRequest) !== JSON.stringify(input.request),
    rationale,
  };
}

export function buildRetrievalRequestPrompt(
  envelope: RetrievalEnvelope,
  modelId: string,
  contractVersion = "v2",
): RetrievalRequestPrompt {
  return {
    contractName: "retrieval_request_interpretation",
    contractVersion,
    modelId,
    systemPrompt: [
      "Interpret retrieval requests for model-memory.",
      "Return only valid JSON for structured retrieval intent.",
      "Return exactly one of these JSON shapes and no other top-level shape:",
      `{"action":"skip"}`,
      `{"action":"retrieve","request":{"goal":"...","canonicalClasses":["user"|"feedback"|"project"|"reference"],"kinds":["preference"|"fact"|"rule"|"procedure"|"reference"],"scopeConstraints":{"key":"value"},"subjectHints":["..."],"contentHints":["..."],"desiredResultCount":1,"requestConfidence":"weak"|"medium"|"strong"}}`,
      "Use skip only when the query clearly cannot benefit from stored memory or reference knowledge.",
      "For documentation lookup, workflow guidance, architecture lookup, operator help, or project/reference questions, prefer retrieve.",
      "Do not return fields like intent, queryText, requestPurpose, scope, or maxResults at the top level.",
      "Use canonical classes and kinds only when supported by the query.",
      "Prefer broad filters over invented specifics.",
      "For broad documentation, planning, workflow, architecture, or reference questions, keep canonicalClasses empty unless the query explicitly names a required class.",
      "For those broad questions, omit kinds unless the query explicitly asks for a kind-specific answer.",
      "Do not shrink desiredResultCount below the provided maxResults unless the query itself clearly asks for a smaller bounded answer.",
      "Do not invent abstract hints like strategy, framework, checklist, or best practices unless those ideas are present in the query text.",
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
    if (input.envelope.requestPurpose === "live_context_injection") {
      return {
        action: "retrieve",
        request: buildLexicalBaselineRetrievalRequest(input.envelope),
      };
    }
    return result;
  }
  const harmonized = harmonizeInterpretedRetrievalRequest({
    envelope: input.envelope,
    request: InterpretedRetrievalRequestSchema.parse(result.request),
  });
  return {
    action: "retrieve",
    request: harmonized.request,
  };
}
