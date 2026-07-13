/**
 * Chat-history text helpers for session tools.
 *
 * Removes tool messages and extracts sanitized assistant-visible text from stored messages.
 */
import { extractAssistantTextForPhase } from "../../shared/chat-message-content.js";
import { sanitizeAssistantVisibleTextWithProfile } from "../../shared/text/assistant-visible-text.js";
import { sanitizeUserFacingText } from "../embedded-agent-helpers/sanitize-user-facing-text.js";

const INTERNAL_HISTORY_CONTENT_TYPES = new Set([
  "functionCall",
  "function_call",
  "reasoning",
  "redacted_thinking",
  "thinking",
  "toolCall",
  "toolResult",
  "tool_call",
  "tool_result",
  "tool_use",
]);

export function stripToolMessages(messages: unknown[]): unknown[] {
  return messages.flatMap((msg) => {
    if (!msg || typeof msg !== "object") {
      return [msg];
    }
    const entry = { ...(msg as Record<string, unknown>) };
    const role = entry.role;
    if (role === "toolResult" || role === "tool") {
      return [];
    }

    if (Array.isArray(entry.content)) {
      entry.content = entry.content.filter((block) => {
        if (!block || typeof block !== "object") {
          return true;
        }
        return !INTERNAL_HISTORY_CONTENT_TYPES.has(
          String((block as { type?: unknown }).type ?? ""),
        );
      });
    }
    for (const field of [
      "functionCall",
      "function_call",
      "partialJson",
      "reasoning",
      "thinking",
      "toolCalls",
      "tool_calls",
    ]) {
      delete entry[field];
    }

    const hasContent =
      (typeof entry.content === "string" && entry.content.length > 0) ||
      (Array.isArray(entry.content) && entry.content.length > 0) ||
      (typeof entry.text === "string" && entry.text.length > 0);
    return hasContent ? [entry] : [];
  });
}

/**
 * Sanitize text content to strip tool call markers and thinking tags.
 * This ensures user-facing text doesn't leak internal tool representations.
 */
export function sanitizeTextContent(text: string): string {
  return sanitizeAssistantVisibleTextWithProfile(text, "history");
}

export function extractAssistantText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  if ((message as { role?: unknown }).role !== "assistant") {
    return undefined;
  }
  const joined =
    extractAssistantTextForPhase(message, {
      phase: "final_answer",
      sanitizeText: sanitizeTextContent,
      joinWith: "",
    }) ??
    extractAssistantTextForPhase(message, {
      sanitizeText: sanitizeTextContent,
      joinWith: "",
    });
  const stopReason = (message as { stopReason?: unknown }).stopReason;
  // Gate on stopReason only — a non-error response with a stale/background errorMessage
  // should not have its content rewritten with error templates (#13935).
  const errorContext = stopReason === "error";

  return joined ? sanitizeUserFacingText(joined, { errorContext }) : undefined;
}
