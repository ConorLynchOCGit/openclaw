// Xai plugin module implements responses tool shared behavior.
import {
  normalizeOptionalString as trimString,
  uniqueStrings,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import type { XaiWebSearchResponse } from "./web-search-response.types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function extractUrlCitations(annotations: unknown): string[] {
  if (!Array.isArray(annotations)) {
    return [];
  }
  return annotations
    .filter(
      (annotation) =>
        isRecord(annotation) &&
        annotation.type === "url_citation" &&
        typeof annotation.url === "string",
    )
    .map((annotation) => annotation.url as string);
}

function extractCitationStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

const XAI_RESPONSES_BASE_URL = "https://api.x.ai/v1";
export const XAI_RESPONSES_ENDPOINT = `${XAI_RESPONSES_BASE_URL}/responses`;

export function resolveXaiResponsesEndpoint(baseUrl?: unknown): string {
  return `${(trimString(baseUrl) ?? XAI_RESPONSES_BASE_URL).replace(/\/+$/, "")}/responses`;
}

export function buildXaiResponsesToolBody(params: {
  model: string;
  inputText: string;
  tools: Array<Record<string, unknown>>;
  maxTurns?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  serviceTier?: "default" | "priority";
}): Record<string, unknown> {
  return {
    model: params.model,
    input: [{ role: "user", content: params.inputText }],
    tools: params.tools,
    store: false,
    ...(params.reasoningEffort ? { reasoning: { effort: params.reasoningEffort } } : {}),
    ...(params.maxTurns ? { max_turns: params.maxTurns } : {}),
    ...(params.serviceTier ? { service_tier: params.serviceTier } : {}),
  };
}

export function extractXaiWebSearchContent(data: XaiWebSearchResponse): {
  text: string | undefined;
  annotationCitations: string[];
} {
  let text: string | undefined;
  const annotationCitations: string[] = [];
  for (const output of data.output ?? []) {
    if (!isRecord(output)) {
      continue;
    }
    if (output.type === "message") {
      const content = Array.isArray(output.content) ? output.content : [];
      for (const block of content) {
        if (!isRecord(block)) {
          continue;
        }
        if (block.type === "output_text") {
          annotationCitations.push(...extractUrlCitations(block.annotations));
          if (!text && typeof block.text === "string" && block.text) {
            text = block.text;
          }
        }
      }
    }

    if (output.type === "output_text") {
      annotationCitations.push(...extractUrlCitations(output.annotations));
      if (!text && typeof output.text === "string" && output.text) {
        text = output.text;
      }
    }
  }

  return {
    text: text ?? (typeof data.output_text === "string" ? data.output_text : undefined),
    annotationCitations: uniqueStrings(annotationCitations),
  };
}

export function resolveXaiResponseTextAndCitations(data: XaiWebSearchResponse): {
  content: string;
  citations: string[];
} {
  const { text, annotationCitations } = extractXaiWebSearchContent(data);
  return {
    content: text ?? "No response",
    citations: uniqueStrings([...extractCitationStrings(data.citations), ...annotationCitations]),
  };
}

export function requireXaiResponseTextAndCitations(
  data: XaiWebSearchResponse,
  label: string,
): {
  content: string;
  citations: string[];
} {
  const { text, annotationCitations } = extractXaiWebSearchContent(data);
  if (!text) {
    throw new Error(`${label}: malformed JSON response`);
  }
  return {
    content: text,
    citations: uniqueStrings([...extractCitationStrings(data.citations), ...annotationCitations]),
  };
}

export function requireXaiResponseTextCitationsAndInline(
  data: XaiWebSearchResponse,
  label: string,
  inlineCitationsEnabled: boolean,
): {
  content: string;
  citations: string[];
  inlineCitations?: XaiWebSearchResponse["inline_citations"];
} {
  const { content, citations } = requireXaiResponseTextAndCitations(data, label);
  return {
    content,
    citations,
    inlineCitations:
      inlineCitationsEnabled && Array.isArray(data.inline_citations)
        ? data.inline_citations
        : undefined,
  };
}
