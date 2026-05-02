import { readStringValue } from "./string-coerce.js";

const PROACTIVITY_SOURCE_SUFFIX = /\s+Source:\s+(?:chat|gateway):\/\/\S+\.?$/giu;
const PROACTIVITY_SOURCE_LABEL = /\bSource:\s*/giu;
const PROACTIVITY_RAW_SOURCE_REF = /\b(?:chat|gateway):\/\/\S+/giu;
const PROACTIVITY_RAW_SOURCE_SCHEME = /\b(?:chat|gateway):\/\//giu;
const PROACTIVITY_FIELD_LABEL_PREFIX =
  /^(?:(?:title|why now|problem|what happens next|next step|proposed next step|suggested action|expected user value|expected value|evidence(?: summary)?)\s*:\s*)+/iu;
const PROACTIVITY_TIMESTAMP_PREFIX = /^(?:(?:system:\s*)?\[[^\]]+\]\s*)+|^(?:system:\s*)+/iu;
const PROACTIVITY_JSON_FENCE = /```json[\s\S]*?```/giu;
const PROACTIVITY_INLINE_JSON = /^\s*\{[\s\S]*\}\s*$/u;
const PROACTIVITY_MARKDOWN_FORMATTING = /[*_`]+/gu;
const PROACTIVITY_MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/gu;
const PROACTIVITY_SENDER_METADATA_PREFIX = /^\s*sender \(untrusted metadata\):\s*/iu;
const PROACTIVITY_MARKDOWN_HEADING_PREFIX = /^\s*#{1,6}\s*/u;
const PROACTIVITY_CONTROL_LINE_PATTERNS = [
  /^\s*read heartbeat\.md\b/iu,
  /^\s*heartbeat_ok\s*$/iu,
  /^\s*sender \(untrusted metadata\):/iu,
  /^\s*system:\s*/iu,
  /post-compaction context refresh/iu,
  /session was just compacted/iu,
  /source:\s*(?:chat|gateway):\/\//iu,
  /\bdisabled under rollback\b/iu,
  /\bcontrol-plane\b/iu,
  /\bactive session'?s planning state\b/iu,
];
const PROACTIVITY_OPERATIONAL_SNIPPET_PATTERNS = [
  /\bread heartbeat\.md\b/iu,
  /heartbeat_ok/iu,
  /heartbeatok/iu,
  /\bsender \(untrusted metadata\)\b/iu,
  /\bpost-compaction context refresh\b/iu,
  /\bsession was just compacted\b/iu,
  /\bsource:\s*(?:chat|gateway):\/\//iu,
  /\bdisabled under rollback\b/iu,
  /\bcontrol-plane\b/iu,
  /\bactive session'?s planning state\b/iu,
];
const PROACTIVITY_INTERNAL_WORKFLOW_PATTERNS = [
  /\bi found a proactive item\b/iu,
  /\bi found a(?:\s+\w+){0,4}\s+proactiv(?:e|ity)\s+item\b/iu,
  /\baction requested:\s*(?:plan this|investigate|open draft|snooze|dismiss|review)\b/iu,
  /\bstart a bounded plan this\b/iu,
  /\bcontext to use:\s*(?:heartbeat|chat|inbox|contextual)\b/iu,
  /\bproof marker:\b/iu,
  /\boperator phase \d+\b/iu,
  /\bstaged proposal\b/iu,
  /\bfor audit only\b/iu,
  /\bdo not execute(?: any action)?\b/iu,
  /\bcontrolled action expansion proof\b/iu,
  /\bcontrolled production\b/iu,
  /\bbounded plan\b/iu,
  /\bitem only\b/iu,
  /\bno code changes yet\b/iu,
  /\bwithout editing code yet\b/iu,
];
const PROACTIVITY_PROMPT_SCAFFOLD_PATTERNS = [
  /^\s*review\b/iu,
  /^\s*identify\b/iu,
  /^\s*give me\b/iu,
  /^\s*for each opportunity include\b/iu,
  /^\s*for every item\b/iu,
  /^\s*only include items\b/iu,
  /^\s*keep this grounded\b/iu,
  /^\s*what would help this user today\??\b/iu,
  /^\s*based on the current\b/iu,
  /^\s*we still seem to have\b/iu,
];
const PROACTIVITY_META_TITLE_PATTERNS = [
  /^\s*why this is the next fix\b/iu,
  /^\s*next concrete fix\b/iu,
  /^\s*runtime-authoritative assistant-output proactivity capture\b/iu,
  /^\s*heartbeat review cards?\b/iu,
  /^\s*action class\b/iu,
  /^\s*proof marker\b/iu,
  /^\s*staged proposal\b/iu,
];
const PROACTIVITY_GENERIC_LEAD_WORDS =
  /^(?:plan|investigate|review|draft|fix|check|validate|resolve|follow up|compare|audit|stabilize|document|ship|close|reduce|verify|implement|build|move|wire)\s+/iu;
const PROACTIVITY_GENERIC_FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "bounded",
  "concrete",
  "current",
  "for",
  "item",
  "items",
  "next",
  "only",
  "recent",
  "step",
  "steps",
  "the",
  "this",
]);

export function extractFirstTextBlock(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  const inline = readStringValue(content);
  if (inline !== undefined) {
    return inline;
  }
  if (!Array.isArray(content) || content.length === 0) {
    return undefined;
  }
  const first = content[0];
  if (!first || typeof first !== "object") {
    return undefined;
  }
  return readStringValue((first as { text?: unknown }).text);
}

function stripMarkdownFormatting(value: string): string {
  return value
    .replace(PROACTIVITY_MARKDOWN_LINK, "$1")
    .replace(PROACTIVITY_MARKDOWN_FORMATTING, "")
    .replace(/&nbsp;/giu, " ");
}

function removeOperationalPrefix(value: string): string {
  let current = value.trim();
  while (PROACTIVITY_TIMESTAMP_PREFIX.test(current)) {
    current = current.replace(PROACTIVITY_TIMESTAMP_PREFIX, "").trim();
  }
  while (PROACTIVITY_SENDER_METADATA_PREFIX.test(current)) {
    current = current.replace(PROACTIVITY_SENDER_METADATA_PREFIX, "").trim();
  }
  while (PROACTIVITY_FIELD_LABEL_PREFIX.test(current)) {
    current = current.replace(PROACTIVITY_FIELD_LABEL_PREFIX, "").trim();
  }
  return current;
}

export function isOperationalProactivityUserFacingText(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalized = stripMarkdownFormatting(value).replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return true;
  }
  return PROACTIVITY_OPERATIONAL_SNIPPET_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isInternalProactivityWorkflowText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = stripMarkdownFormatting(value).replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return false;
  }
  return PROACTIVITY_INTERNAL_WORKFLOW_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isPromptScaffoldProactivityText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = stripMarkdownFormatting(value).replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return false;
  }
  return PROACTIVITY_PROMPT_SCAFFOLD_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isMetaProactivityTitleText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = stripMarkdownFormatting(value).replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return false;
  }
  return PROACTIVITY_META_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function cleanProactivityUserFacingText(
  value: string | undefined,
  options?: {
    maxLength?: number;
    preserveLineBreaks?: boolean;
  },
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const preserveLineBreaks = options?.preserveLineBreaks ?? false;
  const maxLength = options?.maxLength ?? 220;
  const withoutJsonFences = value.replace(PROACTIVITY_JSON_FENCE, " ");
  const parts = withoutJsonFences
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => stripMarkdownFormatting(line))
    .map((line) => line.replace(/^[\s>#*-]*(?:\d+\.\s*)?/u, "").trim())
    .map((line) => line.replace(PROACTIVITY_MARKDOWN_HEADING_PREFIX, "").trim())
    .map((line) => removeOperationalPrefix(line))
    .map((line) =>
      line
        .replace(PROACTIVITY_SOURCE_SUFFIX, "")
        .replace(PROACTIVITY_RAW_SOURCE_REF, "")
        .replace(PROACTIVITY_RAW_SOURCE_SCHEME, "")
        .replace(PROACTIVITY_SOURCE_LABEL, ""),
    )
    .map((line) => line.replace(PROACTIVITY_SENDER_METADATA_PREFIX, "").trim())
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .map((line) => removeOperationalPrefix(line))
    .filter((line) => line.length > 0)
    .filter((line) => !PROACTIVITY_INLINE_JSON.test(line))
    .filter((line) => !PROACTIVITY_CONTROL_LINE_PATTERNS.some((pattern) => pattern.test(line)));
  if (parts.length === 0) {
    return undefined;
  }
  const joined = (preserveLineBreaks ? parts.join("\n") : parts.join(" "))
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s+/gu, preserveLineBreaks ? " " : " ")
    .trim();
  if (!joined || isOperationalProactivityUserFacingText(joined)) {
    return undefined;
  }
  if (joined.length <= maxLength) {
    return joined;
  }
  const clipped = joined.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const wordBoundary = clipped.lastIndexOf(" ");
  const bounded =
    wordBoundary >= Math.floor(maxLength * 0.55) ? clipped.slice(0, wordBoundary) : clipped;
  return `${bounded.replace(/[,\-:;]+$/u, "").trimEnd()}.`;
}

export function isMeaningfulProactivityUserFacingText(value: string | undefined): boolean {
  const cleaned = cleanProactivityUserFacingText(value, { maxLength: 400 });
  if (!cleaned) {
    return false;
  }
  const words = cleaned
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 3);
  return words.length >= 2;
}

export function buildProactivityUserFacingFocusKey(value: string | undefined): string {
  const cleaned = cleanProactivityUserFacingText(value, { maxLength: 400 });
  if (!cleaned) {
    return "";
  }
  const withoutLeadVerb = cleaned.replace(PROACTIVITY_GENERIC_LEAD_WORDS, "");
  const tokens = withoutLeadVerb
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3)
    .filter((token) => !PROACTIVITY_GENERIC_FILLER_WORDS.has(token))
    .slice(0, 8);
  return tokens.join(" ");
}

export type AssistantPhase = "commentary" | "final_answer";

export function normalizeAssistantPhase(value: unknown): AssistantPhase | undefined {
  return value === "commentary" || value === "final_answer" ? value : undefined;
}

export function parseAssistantTextSignature(
  value: unknown,
): { id?: string; phase?: AssistantPhase } | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  if (!value.startsWith("{")) {
    return { id: value };
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; phase?: unknown; v?: unknown };
    if (parsed.v !== 1) {
      return null;
    }
    return {
      ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
      ...(normalizeAssistantPhase(parsed.phase)
        ? { phase: normalizeAssistantPhase(parsed.phase) }
        : {}),
    };
  } catch {
    return null;
  }
}

export function encodeAssistantTextSignature(params: {
  id: string;
  phase?: AssistantPhase;
}): string {
  return JSON.stringify({
    v: 1,
    id: params.id,
    ...(params.phase ? { phase: params.phase } : {}),
  });
}

export function resolveAssistantMessagePhase(message: unknown): AssistantPhase | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const entry = message as { phase?: unknown; content?: unknown };
  const directPhase = normalizeAssistantPhase(entry.phase);
  if (directPhase) {
    return directPhase;
  }
  if (!Array.isArray(entry.content)) {
    return undefined;
  }
  const explicitPhases = new Set<AssistantPhase>();
  for (const block of entry.content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as { type?: unknown; textSignature?: unknown };
    if (record.type !== "text") {
      continue;
    }
    const phase = parseAssistantTextSignature(record.textSignature)?.phase;
    if (phase) {
      explicitPhases.add(phase);
    }
  }
  return explicitPhases.size === 1 ? [...explicitPhases][0] : undefined;
}

function hasExplicitAssistantTextPhases(content: unknown[]): boolean {
  return content.some((block) => {
    if (!block || typeof block !== "object") {
      return false;
    }
    const record = block as { type?: unknown; textSignature?: unknown };
    if (record.type !== "text") {
      return false;
    }
    return Boolean(parseAssistantTextSignature(record.textSignature)?.phase);
  });
}

export function extractAssistantTextForPhase(
  message: unknown,
  options?: {
    phase?: AssistantPhase;
    sanitizeText?: (text: string) => string;
    joinWith?: string;
  },
): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const entry = message as { text?: unknown; content?: unknown; phase?: unknown };
  const messagePhase = normalizeAssistantPhase(entry.phase);
  const phase = options?.phase;
  const shouldIncludeContent = (resolvedPhase?: AssistantPhase) => {
    if (phase) {
      return resolvedPhase === phase;
    }
    return resolvedPhase === undefined;
  };
  const sanitizeText = options?.sanitizeText;
  const joinWith = options?.joinWith ?? "\n";
  const sanitizeBlockText = (text: string) => (sanitizeText ? sanitizeText(text) : text);
  const normalizeJoinedText = (text: string) => {
    const normalized = text.trim();
    return normalized || undefined;
  };

  if (typeof entry.text === "string") {
    if (!shouldIncludeContent(messagePhase)) {
      return undefined;
    }
    return normalizeJoinedText(sanitizeBlockText(entry.text));
  }

  if (typeof entry.content === "string") {
    if (!shouldIncludeContent(messagePhase)) {
      return undefined;
    }
    return normalizeJoinedText(sanitizeBlockText(entry.content));
  }

  if (!Array.isArray(entry.content)) {
    return undefined;
  }

  const hasExplicitPhasedTextBlocks = hasExplicitAssistantTextPhases(entry.content);

  // Once explicit phased blocks exist, unphased extraction should not revive
  // legacy text from the same message.
  if (!phase && hasExplicitPhasedTextBlocks) {
    return undefined;
  }

  const parts = entry.content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return null;
      }
      const record = block as { type?: unknown; text?: unknown; textSignature?: unknown };
      if (record.type !== "text" || typeof record.text !== "string") {
        return null;
      }
      const signature = parseAssistantTextSignature(record.textSignature);
      const resolvedPhase =
        signature?.phase ?? (hasExplicitPhasedTextBlocks ? undefined : messagePhase);
      if (!shouldIncludeContent(resolvedPhase)) {
        return null;
      }
      const sanitized = sanitizeBlockText(record.text);
      return sanitized.trim() ? sanitized : null;
    })
    .filter((value): value is string => typeof value === "string");

  if (parts.length === 0) {
    return undefined;
  }
  return normalizeJoinedText(parts.join(joinWith));
}

export function extractAssistantVisibleText(message: unknown): string | undefined {
  const finalAnswerText = extractAssistantTextForPhase(message, { phase: "final_answer" });
  if (finalAnswerText) {
    return finalAnswerText;
  }
  return extractAssistantTextForPhase(message);
}

export function extractAssistantTextSignatureId(
  message: unknown,
  options?: { phase?: AssistantPhase },
): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const entry = message as { phase?: unknown; content?: unknown };
  if (!Array.isArray(entry.content)) {
    return undefined;
  }
  const requestedPhase = options?.phase;
  const messagePhase = normalizeAssistantPhase(entry.phase);
  const hasExplicitPhasedTextBlocks = hasExplicitAssistantTextPhases(entry.content);
  for (const block of entry.content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as { type?: unknown; textSignature?: unknown };
    if (record.type !== "text") {
      continue;
    }
    const parsed = parseAssistantTextSignature(record.textSignature);
    if (!parsed?.id) {
      continue;
    }
    if (!requestedPhase) {
      return parsed.id;
    }
    const resolvedPhase = parsed.phase ?? (hasExplicitPhasedTextBlocks ? undefined : messagePhase);
    if (resolvedPhase === requestedPhase) {
      return parsed.id;
    }
  }
  return undefined;
}
