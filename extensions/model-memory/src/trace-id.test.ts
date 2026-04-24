import { describe, expect, it } from "vitest";
import {
  buildOrdinaryTurnMemoryTraceId,
  buildToolResultMemoryTraceId,
  mergeMemoryTraceIds,
  readMemoryTraceIdFromScope,
  sanitizeMemoryTraceId,
} from "./trace-id.ts";

describe("model-memory trace ids", () => {
  it("builds deterministic safe trace ids for ordinary turns", () => {
    const first = buildOrdinaryTurnMemoryTraceId({
      sessionId: "session-001",
      sessionKey: "agent:main:main",
      agentId: "main",
      currentTurnText: "  What durable validation-report preferences already exist?  ",
    });
    const second = buildOrdinaryTurnMemoryTraceId({
      sessionId: "session-001",
      sessionKey: "agent:main:main",
      agentId: "main",
      currentTurnText: "What durable validation-report preferences already exist?",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^memory_trace_turn_[a-f0-9]{24}$/);
  });

  it("builds distinct tool-result trace ids from safe identifiers", () => {
    const traceId = buildToolResultMemoryTraceId({
      sessionId: "session-001",
      sessionKey: "agent:main:main",
      agentId: "main",
      runId: "run-001",
      toolCallId: "tool-call-001",
      hookName: "after_tool_call",
      toolName: "gateway_read",
    });

    expect(traceId).toMatch(/^memory_trace_tool_[a-f0-9]{24}$/);
    expect(
      buildOrdinaryTurnMemoryTraceId({
        sessionId: "session-001",
        sessionKey: "agent:main:main",
        agentId: "main",
        currentTurnText: "gateway_read",
      }),
    ).not.toBe(traceId);
  });

  it("sanitizes, merges, and reads trace ids from retrieval scope safely", () => {
    expect(
      mergeMemoryTraceIds(
        ["memory_trace_turn_aaaaaaaaaaaaaaaaaaaaaaaa", "invalid trace"],
        [
          "memory_trace_tool_bbbbbbbbbbbbbbbbbbbbbbbb",
          "memory_trace_turn_aaaaaaaaaaaaaaaaaaaaaaaa",
        ],
      ),
    ).toEqual([
      "memory_trace_turn_aaaaaaaaaaaaaaaaaaaaaaaa",
      "memory_trace_tool_bbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    expect(
      readMemoryTraceIdFromScope({
        memoryTraceId: "memory_trace_turn_cccccccccccccccccccccccc",
      }),
    ).toBe("memory_trace_turn_cccccccccccccccccccccccc");
    expect(sanitizeMemoryTraceId("not-safe")).toBeUndefined();
  });
});
