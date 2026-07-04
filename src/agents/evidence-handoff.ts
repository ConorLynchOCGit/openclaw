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
