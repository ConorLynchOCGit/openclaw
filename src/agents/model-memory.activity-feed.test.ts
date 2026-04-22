import { describe, expect, it } from "vitest";
import {
  buildModelMemoryActivityFeedText,
  buildModelMemoryActivityTranscriptMessage,
  emitModelMemoryActivityFeedEvent,
  resolveModelMemoryActivityFeedSettings,
} from "./model-memory.activity-feed.js";

describe("model-memory activity feed", () => {
  it("uses explicit env/config kill switch and defaults to maximal detail", () => {
    expect(resolveModelMemoryActivityFeedSettings({ env: {} as NodeJS.ProcessEnv })).toEqual({
      enabled: false,
      level: "maximal",
    });
    expect(
      resolveModelMemoryActivityFeedSettings({
        env: {
          MODEL_MEMORY_ACTIVITY_FEED_ENABLED: "1",
          MODEL_MEMORY_ACTIVITY_FEED_LEVEL: "summary",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({ enabled: true, level: "summary" });
  });

  it("builds bounded activity text without raw prompts, transcripts, or tool logs", () => {
    const text = buildModelMemoryActivityFeedText({
      kind: "retrieval",
      status: "completed",
      safeLabels: {
        reason: "live_context",
        prompt: "raw prompt must not persist",
        transcript: "raw transcript must not persist",
        raw_tool_log: "raw tool log must not persist",
      },
      metrics: {
        candidates: 7,
        selected: 2,
        excluded: 5,
      },
      ids: {
        retrievalRequestId: "retrieval_request_123",
        selectedMemoryIds: ["memory_1", "memory_2"],
      },
    });

    expect(text).toContain("[Memory Activity] retrieval completed");
    expect(text).toContain("retrievalRequestId=retrieval_request_123");
    expect(text).toContain("selectedMemoryIds=memory_1,memory_2");
    expect(text).toContain("candidates=7");
    expect(text).not.toContain("raw prompt must not persist");
    expect(text).not.toContain("raw transcript must not persist");
    expect(text).not.toContain("raw tool log must not persist");
  });

  it("builds structured activity messages instead of assistant prose notes", () => {
    const message = buildModelMemoryActivityTranscriptMessage({
      kind: "retrieval",
      status: "completed",
      safeLabels: {
        reason: "live_context",
        prompt: "raw prompt must not persist",
        private_phrase: "private-token",
      },
      metrics: { candidates: 7, selected: 2 },
      ids: {
        retrievalRequestId: "retrieval_request_123",
        selectedMemoryIds: ["memory_1", "memory_2"],
      },
    });

    expect(message.content[0]?.text).toBe("Memory activity");
    expect(message.__openclaw.kind).toBe("model_memory_activity");
    expect(message.__openclaw.eventType).toBe("memory_retrieval_checked");
    expect(message.__openclaw.ids).toMatchObject({
      retrievalRequestId: ["retrieval_request_123"],
      selectedMemoryIds: ["memory_1", "memory_2"],
    });
    expect(JSON.stringify(message)).not.toContain("raw prompt must not persist");
    expect(JSON.stringify(message)).not.toContain("private-token");
    expect(JSON.stringify(message)).not.toContain("[Memory Activity]");
  });

  it("emits idempotent bounded structured transcript messages when enabled", async () => {
    const appended: Array<{ message?: unknown; idempotencyKey?: string }> = [];
    const result = await emitModelMemoryActivityFeedEvent(
      {
        kind: "tool_result_capture",
        status: "completed",
        sessionKey: "agent:main:test",
        sessionId: "session-1",
        agentId: "agent-1",
        stableId: "tool-call-1",
        safeLabels: { hook: "after_tool_call" },
        metrics: { memories: 1 },
        env: { MODEL_MEMORY_ACTIVITY_FEED_ENABLED: "1" } as NodeJS.ProcessEnv,
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
        kind: "model_memory_activity",
        eventType: "memory_written",
        labels: { hook: "after_tool_call" },
      },
    });
    expect(appended[0]?.idempotencyKey).toMatch(/^model-memory-activity:/u);
  });
});
