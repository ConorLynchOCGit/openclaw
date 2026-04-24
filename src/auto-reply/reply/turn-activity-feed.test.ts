import { describe, expect, it } from "vitest";
import {
  buildTurnActivityFeedText,
  buildTurnActivityTranscriptMessage,
  emitTurnActivityFeedEvent,
} from "./turn-activity-feed.js";

describe("turn activity feed", () => {
  it("builds bounded turn activity text without raw prompt leakage", () => {
    const text = buildTurnActivityFeedText({
      eventType: "prompt_blocked",
      safeLabels: {
        reason: "handled_without_text",
        prompt: "raw prompt must not persist",
        tool_log: "raw tool log must not persist",
      },
      ids: {
        messageId: "msg_123",
      },
    });

    expect(text).toContain("[Turn Activity]");
    expect(text).toContain("prompt blocked");
    expect(text).toContain("reason=handled_without_text");
    expect(text).toContain("messageId=msg_123");
    expect(text).not.toContain("raw prompt must not persist");
    expect(text).not.toContain("raw tool log must not persist");
  });

  it("builds structured transcript messages for tool lifecycle activity", () => {
    const message = buildTurnActivityTranscriptMessage({
      eventType: "tool_completed",
      safeLabels: {
        tool: "memory_search",
        status: "ok",
      },
      ids: {
        toolCallId: "call_123",
      },
    });

    expect(message.content[0]?.text).toBe("Turn activity: tool completed: memory_search");
    expect(message.__openclaw).toMatchObject({
      kind: "turn_activity",
      eventType: "tool_completed",
      status: "completed",
      label: "tool completed: memory_search",
      ids: {
        toolCallId: ["call_123"],
      },
      labels: {
        status: "ok",
        tool: "memory_search",
      },
    });
    expect(JSON.stringify(message)).not.toContain("raw prompt");
  });

  it("emits idempotent turn activity transcript messages", async () => {
    const appended: Array<{ message?: unknown; idempotencyKey?: string }> = [];
    const result = await emitTurnActivityFeedEvent(
      {
        eventType: "model_started",
        sessionKey: "agent:main:test",
        agentId: "main",
        runId: "run_123",
        stableId: "run_123",
        safeLabels: {
          model: "gpt-5.4",
          provider: "openai-codex",
        },
      },
      {
        appendTranscript: async (params) => {
          appended.push({ message: params.message, idempotencyKey: params.idempotencyKey });
          return { ok: true, sessionFile: "/tmp/session.jsonl", messageId: "message-1" };
        },
      },
    );

    expect(result).toEqual({ emitted: true, messageId: "message-1" });
    expect(appended).toHaveLength(1);
    expect(appended[0]?.message).toMatchObject({
      role: "assistant",
      __openclaw: {
        kind: "turn_activity",
        eventType: "model_started",
        status: "started",
      },
    });
    expect(appended[0]?.idempotencyKey).toMatch(/^turn-activity:/u);
  });
});
