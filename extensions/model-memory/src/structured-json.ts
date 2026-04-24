export type ParsedStructuredJsonValue =
  | null
  | boolean
  | number
  | string
  | ParsedStructuredJsonValue[]
  | { [key: string]: ParsedStructuredJsonValue };

export function stripOuterJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

export function extractStructuredJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return text.trim();
}

export function parseStructuredJsonCandidate(text: string): unknown {
  return JSON.parse(extractStructuredJsonCandidate(stripOuterJsonCodeFence(text)));
}

export function tryParseFencedJsonBlock(text: string): ParsedStructuredJsonValue | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return null;
  }
  const lines = trimmed.split("\n");
  if (lines.length < 2) {
    return null;
  }
  const body = lines.slice(1, -1).join("\n").trim();
  try {
    return JSON.parse(body) as ParsedStructuredJsonValue;
  } catch {
    return null;
  }
}
