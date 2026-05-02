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
  const parts = value
    .replace(PROACTIVITY_JSON_FENCE, " ")
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
  const tokens = cleaned
    .replace(PROACTIVITY_GENERIC_LEAD_WORDS, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3)
    .filter((token) => !PROACTIVITY_GENERIC_FILLER_WORDS.has(token))
    .slice(0, 8);
  return tokens.join(" ");
}
