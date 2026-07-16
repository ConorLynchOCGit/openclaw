const X_SOURCE_TOOL_NAMES = new Set([
  "x_posts",
  "x_counts",
  "x_users",
  "x_timelines",
  "x_trends",
  "x_metrics",
]);

const MAX_PREVIEW_CHARS = 500;
const MAX_CITATIONS = 3;
const MAX_CITATION_CHARS = 180;
const MAX_REF_CHARS = 220;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function safeToken(value: unknown, maxChars = 80): string | undefined {
  const candidate = boundedString(value, maxChars);
  return candidate && /^[a-zA-Z0-9_.:/-]+$/u.test(candidate) ? candidate : undefined;
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeCitation(value: unknown): string | undefined {
  const candidate = boundedString(value, MAX_CITATION_CHARS);
  if (!candidate) {
    return undefined;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function toolResultDetails(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const result = record(data.result);
  return record(result?.details) ?? record(data.details) ?? result;
}

function append(parts: string[], label: string, value: unknown, maxChars = 80): void {
  const number = finiteNonNegativeNumber(value);
  if (number !== undefined) {
    parts.push(`${label}=${number}`);
    return;
  }
  const safe = safeToken(value, maxChars);
  if (safe) {
    parts.push(`${label}=${safe}`);
  }
}

function finish(parts: string[]): string {
  return boundedString(parts.join(" "), MAX_PREVIEW_CHARS) ?? "";
}

function xSearchPreview(details: Record<string, unknown>): string {
  const parts = ["x_search"];
  append(parts, "status", details.responseStatus ?? details.status);
  append(parts, "provider", details.provider);
  append(parts, "model", details.model, 96);

  const citations = Array.isArray(details.citations)
    ? details.citations
        .map((entry) => safeCitation(entry))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, MAX_CITATIONS)
    : [];
  const declaredCitationCount = finiteNonNegativeNumber(details.citationCount);
  parts.push(`citations=${declaredCitationCount ?? citations.length}`);

  const usage = record(details.usage);
  const totalTokens = finiteNonNegativeNumber(usage?.totalTokens);
  const costUsd = finiteNonNegativeNumber(usage?.costUsd);
  if (totalTokens !== undefined) {
    parts.push(`tokens=${totalTokens}`);
  }
  if (costUsd !== undefined) {
    parts.push(`costUsd=${costUsd}`);
  }
  if (citations.length > 0) {
    parts.push(`refs=${citations.join(",")}`);
  }
  return finish(parts);
}

function xSourcePreview(toolName: string, details: Record<string, unknown>): string {
  const parts = [toolName];
  append(parts, "status", details.status);
  append(parts, "operation", details.operation);
  append(parts, "purpose", details.purpose);
  append(parts, "method", details.method_version, 120);
  append(parts, "providerStatus", details.provider_status);

  const evidence = record(details.evidence);
  const ref = safeToken(evidence?.ref, MAX_REF_CHARS);
  const digest = safeToken(evidence?.digest, 80);
  if (ref) {
    parts.push(`evidence=${ref}`);
  }
  if (digest) {
    parts.push(`digest=${digest}`);
  }

  const resources = record(details.resources);
  const requests = finiteNonNegativeNumber(resources?.requests);
  const durationMs = finiteNonNegativeNumber(resources?.duration_ms);
  if (requests !== undefined) {
    parts.push(`requests=${requests}`);
  }
  if (durationMs !== undefined) {
    parts.push(`durationMs=${durationMs}`);
  }
  append(parts, "cost", record(details.cost)?.status);
  return finish(parts);
}

/**
 * Projects only structural, already-sanitized X evidence into normal session readback.
 * Provider content and arbitrary error fields intentionally never cross this boundary.
 */
export function formatBoundedToolEvidencePreview(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) {
    return undefined;
  }
  const toolName = safeToken(data.name ?? data.toolName ?? data.tool, 96);
  if (!toolName) {
    return undefined;
  }
  const details = toolResultDetails(data);
  if (!details) {
    return undefined;
  }
  if (toolName === "x_search") {
    return xSearchPreview(details);
  }
  if (X_SOURCE_TOOL_NAMES.has(toolName)) {
    return xSourcePreview(toolName, details);
  }
  return undefined;
}
