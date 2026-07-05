/** Child-result metadata for agent-to-agent task results. */
import { createHash } from "node:crypto";

export function computeChildResultContentDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function includesChildResultTruncationMarker(value: string): boolean {
  return (
    value.includes("...(truncated)...") ||
    value.includes("[chat.history omitted: message too large]") ||
    value.includes("chars truncated")
  );
}

export function isChildResultDetails(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && (value as { childResult?: unknown }).childResult === true,
  );
}

export function isChildResultToolResultMessage(message: unknown): boolean {
  return Boolean(
    message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "toolResult" &&
    isChildResultDetails((message as { details?: unknown }).details),
  );
}
