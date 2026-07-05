/**
 * Evidence handoff metadata for agent-to-agent task results.
 *
 * These handoffs are not ordinary noisy tool output. They are deliberately
 * authored packets from a domain/source/review child to its parent. Generic
 * tool-output shrinking must not silently rewrite them; if they are too large
 * for the active model context, the session/context recovery path should own
 * compaction rather than losing the packet behind a transport cap.
 */
import { createHash } from "node:crypto";

export const EVIDENCE_HANDOFF_KINDS = [
  "tool_output",
  "context_pack",
  "review_packet",
  "domain_final",
  "implementation_closeout",
  "final_answer",
] as const;

export type EvidenceHandoffKind = (typeof EVIDENCE_HANDOFF_KINDS)[number];

const EVIDENCE_HANDOFF_KIND_SET = new Set<string>(EVIDENCE_HANDOFF_KINDS);

const SOURCE_AGENT_IDS = new Set([
  "codebase-researcher",
  "docs-standards-researcher",
  "researcher",
  "web-researcher",
  "x-researcher",
]);

export function normalizeEvidenceHandoffKind(value: unknown): EvidenceHandoffKind | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return EVIDENCE_HANDOFF_KIND_SET.has(value) ? (value as EvidenceHandoffKind) : undefined;
}

export function inferEvidenceHandoffKindForAgent(agentId: string): EvidenceHandoffKind {
  if (SOURCE_AGENT_IDS.has(agentId)) {
    return "context_pack";
  }
  if (agentId === "reviewer") {
    return "review_packet";
  }
  if (agentId === "coding") {
    return "implementation_closeout";
  }
  return "domain_final";
}

export function computeEvidenceContentDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type DomainFinalHandoff = {
  taskResult: string;
  contentDigest?: string;
  contentChars?: number;
  childSessionKey?: string;
  runId?: string;
  agentId?: string;
  deliveryState?: string;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function readXmlAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`);
  const match = re.exec(tag);
  const value = match?.[1]?.trim();
  return value ? decodeXmlText(value) : undefined;
}

export function extractLatestDomainFinalHandoffFromText(
  value: string | undefined | null,
): DomainFinalHandoff | null {
  if (!value || !value.includes('handoffKind="domain_final"')) {
    return null;
  }
  const taskRe = /(<task\b(?=[^>]*\bhandoffKind="domain_final")[^>]*>)([\s\S]*?)<\/task>/g;
  let latest: DomainFinalHandoff | null = null;
  for (const match of value.matchAll(taskRe)) {
    const taskTag = match[1] ?? "";
    const body = match[2] ?? "";
    const resultMatch = /<task_result>\s*([\s\S]*?)\s*<\/task_result>/.exec(body);
    const taskResult = decodeXmlText(resultMatch?.[1] ?? "").trim();
    if (!taskResult) {
      continue;
    }
    const contentCharsRaw = readXmlAttr(taskTag, "contentChars");
    const contentChars =
      contentCharsRaw && /^\d+$/.test(contentCharsRaw) ? Number(contentCharsRaw) : undefined;
    latest = {
      taskResult,
      ...(readXmlAttr(taskTag, "contentDigest")
        ? { contentDigest: readXmlAttr(taskTag, "contentDigest") }
        : {}),
      ...(contentChars !== undefined ? { contentChars } : {}),
      ...(readXmlAttr(taskTag, "id") ? { childSessionKey: readXmlAttr(taskTag, "id") } : {}),
      ...(readXmlAttr(taskTag, "runId") ? { runId: readXmlAttr(taskTag, "runId") } : {}),
      ...(readXmlAttr(taskTag, "agentId") ? { agentId: readXmlAttr(taskTag, "agentId") } : {}),
      ...(readXmlAttr(taskTag, "deliveryState")
        ? { deliveryState: readXmlAttr(taskTag, "deliveryState") }
        : {}),
    };
  }
  return latest;
}

export function includesEvidenceTruncationMarker(value: string): boolean {
  return (
    value.includes("...(truncated)...") ||
    value.includes("[chat.history omitted: message too large]") ||
    value.includes("chars truncated")
  );
}

export function isEvidenceHandoffDetails(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    normalizeEvidenceHandoffKind((value as { handoffKind?: unknown }).handoffKind),
  );
}

export function isEvidenceHandoffToolResultMessage(message: unknown): boolean {
  return Boolean(
    message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "toolResult" &&
    isEvidenceHandoffDetails((message as { details?: unknown }).details),
  );
}
