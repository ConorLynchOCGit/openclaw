import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { estimatePrePromptTokens } from "../../context-engine/pressure/index.js";
import {
  estimateProviderVisibleContextBreakdown,
  TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE,
  CHARS_PER_TOKEN_ESTIMATE,
} from "./tool-result-char-estimator.js";

function message(params: Record<string, unknown>): AgentMessage {
  return params as unknown as AgentMessage;
}

describe("tool-result char estimator", () => {
  it("counts provider-visible tool text at normal text weight and excludes hidden details", () => {
    const sourceText = [
      "<path>src/example.ts</path>",
      "<type>file</type>",
      "<content>",
      "12: export const value = 1;",
      "</content>",
    ].join("\n");
    const messageWithoutDetails = message({
      role: "toolResult",
      toolCallId: "read_1",
      toolName: "read",
      content: [{ type: "text", text: sourceText }],
    });
    const messages = [
      message({
        role: "user",
        content: "make the edit",
      }),
      message({
        role: "toolResult",
        toolCallId: "read_1",
        toolName: "read",
        content: [{ type: "text", text: sourceText }],
        details: {
          hidden: "metadata ".repeat(1_000),
        },
      }),
    ];

    const estimatedTokens = estimatePrePromptTokens({
      messages,
      systemPrompt: "",
      prompt: "",
    });
    const estimatedTokensWithoutDetails = estimatePrePromptTokens({
      messages: [messages[0], messageWithoutDetails],
      systemPrompt: "",
      prompt: "",
    });
    const expectedChars = "make the edit".length + sourceText.length;
    const breakdown = estimateProviderVisibleContextBreakdown(messages);

    expect(TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE).toBe(CHARS_PER_TOKEN_ESTIMATE);
    expect(estimatedTokens).toBe(estimatedTokensWithoutDetails);
    expect(estimatedTokens).toBeGreaterThan(0);
    expect(breakdown.totalVisibleChars).toBe(expectedChars);
    expect(breakdown.toolResultTextChars).toBe(sourceText.length);
    expect(breakdown.likelySourceOrLocatorChars).toBe(sourceText.length);
    expect(breakdown.nonSourceVisibleChars).toBe("make the edit".length);
    expect(breakdown.strippedToolDetailsChars).toBeGreaterThan(0);
    expect(breakdown.toolResultWithDetailsCount).toBe(1);
  });
});
