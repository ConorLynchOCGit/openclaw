import { normalizeIdentityText } from "../plugin-sdk/model-memory-legacy.js";

function normalizeCasePath(value: string): string {
  return value.replace(/\\/g, "/").trim();
}

function normalizeHeadingSegment(value: string): string {
  return normalizeIdentityText(value);
}

export function buildModelMemoryCaseIdentity(input: {
  sourcePath: string;
  identityKey: string;
  headingPath?: string[];
}): string {
  const sourcePath = normalizeCasePath(input.sourcePath);
  const headingPath = (input.headingPath ?? [])
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => normalizeHeadingSegment(segment));
  return [sourcePath, headingPath.join(">"), input.identityKey].join("::");
}

export function extractPrimaryHeadingPath(
  provenance: Array<Record<string, unknown>> | undefined,
): string[] {
  const firstHeadingPath = provenance?.find((entry) =>
    Array.isArray(entry.headingPath),
  )?.headingPath;
  return Array.isArray(firstHeadingPath)
    ? firstHeadingPath
        .map((segment) => String(segment).trim())
        .filter((segment) => segment.length > 0)
    : [];
}
