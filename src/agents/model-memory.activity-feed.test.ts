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

    expect(message.content[0]?.text).toContain("[Memory Activity] retrieval completed");
    expect(message.__openclaw.kind).toBe("model_memory_activity");
    expect(message.__openclaw.eventType).toBe("memory_retrieval_checked");
    expect(message.__openclaw.ids).toMatchObject({
      retrievalRequestId: ["retrieval_request_123"],
      selectedMemoryIds: ["memory_1", "memory_2"],
    });
    expect(JSON.stringify(message)).not.toContain("raw prompt must not persist");
    expect(JSON.stringify(message)).not.toContain("private-token");
    expect(message.content[0]?.text).toContain("[Memory Activity]");
  });

  it("builds capture job activity events with safe ids and failure classes only", () => {
    const message = buildModelMemoryActivityTranscriptMessage({
      kind: "ordinary_turn_capture",
      status: "failed",
      eventType: "capture_failed",
      safeLabels: {
        failureClass: "timeout",
        stage: "persistence_boundary",
        message: "raw prompt-like error text must not persist",
      },
      ids: {
        captureJobId: "capture_job_abc123",
        sourceId: "source_1",
      },
      metrics: {
        latencyMs: 1200,
        retryCount: 0,
      },
    });

    expect(message.__openclaw.eventType).toBe("capture_failed");
    expect(message.__openclaw.ids).toMatchObject({
      captureJobId: ["capture_job_abc123"],
      sourceId: ["source_1"],
    });
    expect(message.__openclaw.labels).toEqual({
      failureClass: "timeout",
      stage: "persistence_boundary",
    });
    expect(JSON.stringify(message)).not.toContain("raw prompt-like error text");
  });

  it("makes retrieval-unavailable and no-durable-candidate states explicit in visible content", () => {
    const retrievalUnavailable = buildModelMemoryActivityTranscriptMessage({
      kind: "retrieval",
      status: "failed",
      eventType: "retrieval_unavailable",
      safeLabels: {
        purpose: "live_context_injection",
        reason: "retrieval_unavailable",
      },
    });
    const noDurableCandidate = buildModelMemoryActivityTranscriptMessage({
      kind: "ordinary_turn_capture",
      status: "skipped",
      eventType: "capture_skipped",
      safeLabels: {
        stage: "no_durable_candidate",
      },
    });

    expect(retrievalUnavailable.content[0]?.text).toContain("retrieval failed");
    expect(retrievalUnavailable.content[0]?.text).toContain("reason=retrieval_unavailable");
    expect(noDurableCandidate.content[0]?.text).toContain("ordinary turn capture skipped");
    expect(noDurableCandidate.content[0]?.text).toContain("stage=no_durable_candidate");
  });

  it("supports retry-scheduled capture job activity without raw retry payloads", () => {
    const message = buildModelMemoryActivityTranscriptMessage({
      kind: "ordinary_turn_capture",
      status: "scheduled",
      eventType: "capture_retry_scheduled",
      safeLabels: {
        failureClass: "provider_empty_response",
        stage: "execution",
        content: "raw replay content must not persist",
      },
      ids: {
        captureJobId: "capture_job_retry",
      },
      metrics: {
        retryCount: 1,
      },
    });

    expect(message.__openclaw.eventType).toBe("capture_retry_scheduled");
    expect(message.__openclaw.ids).toMatchObject({
      captureJobId: ["capture_job_retry"],
    });
    expect(message.__openclaw.labels).toEqual({
      failureClass: "provider_empty_response",
      stage: "execution",
    });
    expect(JSON.stringify(message)).not.toContain("raw replay content");
  });

  it("supports runtime dirty/rebuild activity with safe ids only", () => {
    const message = buildModelMemoryActivityTranscriptMessage({
      kind: "ordinary_turn_capture",
      status: "deferred",
      eventType: "runtime_dirty_marked",
      safeLabels: {
        reason: "ordinary_turn_capture_written",
        schedulerReason: "deferred",
        prompt: "raw prompt must not persist",
      },
      ids: {
        dirtyId: "runtime_dirty_001",
        captureJobId: "capture_job_001",
        memoryIds: ["memory-1", "memory-2"],
      },
      metrics: {
        writeCountSinceLastRebuild: 2,
      },
    });

    expect(message.__openclaw.eventType).toBe("runtime_dirty_marked");
    expect(message.__openclaw.ids).toMatchObject({
      dirtyId: ["runtime_dirty_001"],
      captureJobId: ["capture_job_001"],
      memoryIds: ["memory-1", "memory-2"],
    });
    expect(message.__openclaw.labels).toEqual({
      reason: "ordinary_turn_capture_written",
      schedulerReason: "deferred",
    });
    expect(JSON.stringify(message)).not.toContain("raw prompt must not persist");
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

  it("suppresses routine tool-result skip events from the visible transcript feed", async () => {
    const appended: Array<{ message?: unknown; idempotencyKey?: string }> = [];
    const result = await emitModelMemoryActivityFeedEvent(
      {
        kind: "tool_result_capture",
        status: "skipped",
        sessionKey: "agent:main:test",
        sessionId: "session-1",
        agentId: "agent-1",
        stableId: "tool-call-1",
        safeLabels: { hook: "after_tool_call", reason: "disabled", tool: "read" },
        env: { MODEL_MEMORY_ACTIVITY_FEED_ENABLED: "1" } as NodeJS.ProcessEnv,
      },
      {
        appendTranscript: async (params) => {
          appended.push({ message: params.message, idempotencyKey: params.idempotencyKey });
          return { ok: true, sessionFile: "/tmp/session.jsonl", messageId: "message-1" };
        },
      },
    );

    expect(result).toEqual({ emitted: false, reason: "routine_tool_result_skip" });
    expect(appended).toHaveLength(0);
  });
});
