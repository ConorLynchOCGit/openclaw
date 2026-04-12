import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { finalizeAttemptTurnStage } from "./attempt.turn-finalization-stage.js";

function makeAgentMessage(message: {
  role: string;
  content: unknown;
  timestamp?: number;
}): AgentMessage {
  return {
    timestamp: message.timestamp ?? Date.now(),
    ...message,
  } as unknown as AgentMessage;
}

describe("finalizeAttemptTurnStage", () => {
  it("falls back to the pre-compaction snapshot and emits a cache-trace note on compaction timeout", async () => {
    const warn = vi.fn();
    const result = await finalizeAttemptTurnStage({
      sessionManager: {
        appendCustomEntry: vi.fn(),
      },
      timedOutDuringCompaction: true,
      getCompactionCount: () => 1,
      preCompactionSnapshot: [makeAgentMessage({ role: "assistant", content: "before" })],
      preCompactionSessionId: "session-before",
      currentMessages: [makeAgentMessage({ role: "assistant", content: "after" })],
      currentSessionId: "session-after",
      config: {},
      provider: "anthropic",
      modelId: "claude",
      modelApi: "anthropic",
      isCacheTtlEligibleProvider: () => true,
      promptError: null,
      promptErrorSource: null,
      runId: "run-1",
      sessionId: "session-live",
      isProbeSession: false,
      warn,
      aborted: false,
      yieldAborted: false,
      sessionFile: "/tmp/session.jsonl",
      prePromptMessageCount: 1,
      runMaintenance: async () => undefined,
    });

    expect(result.messagesSnapshot).toEqual([
      expect.objectContaining({ role: "assistant", content: "before" }),
    ]);
    expect(result.sessionIdUsed).toBe("session-before");
    expect(result.cacheTraceNote).toBe("compaction timeout");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("timed out during compaction runId=run-1"),
    );
  });

  it("persists prompt errors when compaction did not run", async () => {
    const appendCustomEntry = vi.fn();

    await finalizeAttemptTurnStage({
      sessionManager: {
        appendCustomEntry,
      },
      timedOutDuringCompaction: false,
      getCompactionCount: () => 0,
      preCompactionSnapshot: null,
      preCompactionSessionId: "session-before",
      currentMessages: [makeAgentMessage({ role: "assistant", content: "after" })],
      currentSessionId: "session-after",
      config: {},
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "responses",
      isCacheTtlEligibleProvider: () => true,
      promptError: new Error("prompt failed"),
      promptErrorSource: "prompt",
      runId: "run-2",
      sessionId: "session-live",
      isProbeSession: false,
      warn: vi.fn(),
      aborted: false,
      yieldAborted: false,
      sessionFile: "/tmp/session.jsonl",
      prePromptMessageCount: 1,
      runMaintenance: async () => undefined,
    });

    expect(appendCustomEntry).toHaveBeenCalledWith(
      "openclaw:prompt-error",
      expect.objectContaining({
        runId: "run-2",
        sessionId: "session-live",
        provider: "openai",
        model: "gpt-5.4",
        api: "responses",
        error: expect.stringContaining("prompt failed"),
      }),
    );
  });
});
