import { describe, expect, it, vi } from "vitest";
import type { ToolResultPersistResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryToolResultPersistTool,
  normalizeMemoryToolResultPersistInput,
} from "./memory-tool-result-persist.js";

function createAcceptedPersistResult(): ToolResultPersistResult {
  return {
    accepted: true,
    status: "persisted",
    persisted: true,
    toolResultId: "tool-result-1",
    memoryEventId: "event-1",
    sessionId: "session-1",
    toolName: "memory_object_search_hybrid",
    contentType: "application/json",
    storageStatus: "persisted",
    sizeBytes: 8192,
    checksumSha256: "abc123",
    thresholdBytes: 4096,
    preview: {
      kind: "tool_result_preview",
      shouldSubstitute: true,
      previewText: "Preview text",
      substitutionText: "[tool-result:tool-result-1] Preview text",
      retrievalToolName: "memory_tool_result_get",
      retrievalArgs: {
        toolResultId: "tool-result-1",
      },
      referenceToken: "tool_result:tool-result-1",
      contentType: "application/json",
      sizeBytes: 8192,
      truncated: true,
      omittedBytes: 4096,
    },
  };
}

function createRuntime() {
  return {
    toolResultStore: {
      persist: vi.fn(async () => createAcceptedPersistResult()),
      get: vi.fn(),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory tool result persist tool", () => {
  it("normalizes a persist payload with trusted context fallbacks", () => {
    expect(
      normalizeMemoryToolResultPersistInput({
        rawParams: {
          toolName: " memory_object_search_hybrid ",
          payloadJson: { rows: 42, summary: "big result" },
          persistThresholdBytes: "8192",
          previewCharLimit: "320",
          forcePersist: true,
        },
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      toolName: "memory_object_search_hybrid",
      payloadJson: { rows: 42, summary: "big result" },
      agentId: "agent-1",
      persistThresholdBytes: 8192,
      previewCharLimit: 320,
      forcePersist: true,
    });
  });

  it("routes persistence through the tool-result store seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryToolResultPersistTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      toolName: "memory_object_search_hybrid",
      payloadText: "oversized tool result",
      forcePersist: true,
    });

    expect(runtime.toolResultStore.persist).toHaveBeenCalledWith({
      sessionId: "session-1",
      toolName: "memory_object_search_hybrid",
      payloadText: "oversized tool result",
      forcePersist: true,
    });
    expect(result.details).toEqual(createAcceptedPersistResult());
  });

  it("surfaces inline preview results without persistence errors", async () => {
    const runtime = createRuntime();
    runtime.toolResultStore.persist = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "inline",
          persisted: false as const,
          sessionId: "session-1",
          toolName: "memory_object_search_basic",
          contentType: "text/plain",
          sizeBytes: 120,
          thresholdBytes: 4096,
          preview: {
            kind: "tool_result_preview",
            shouldSubstitute: false,
            previewText: "small result",
            substitutionText: "small result",
            retrievalToolName: "memory_tool_result_get",
            contentType: "text/plain",
            sizeBytes: 120,
            truncated: false,
            omittedBytes: 0,
          },
        }) satisfies ToolResultPersistResult,
    );
    const tool = createMemoryToolResultPersistTool({ runtime });

    const result = await tool.execute("call-2", {
      sessionId: "session-1",
      toolName: "memory_object_search_basic",
      payloadText: "small result",
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "inline",
      persisted: false,
      sessionId: "session-1",
      toolName: "memory_object_search_basic",
      contentType: "text/plain",
      sizeBytes: 120,
      thresholdBytes: 4096,
      preview: {
        kind: "tool_result_preview",
        shouldSubstitute: false,
        previewText: "small result",
        substitutionText: "small result",
        retrievalToolName: "memory_tool_result_get",
        contentType: "text/plain",
        sizeBytes: 120,
        truncated: false,
        omittedBytes: 0,
      },
    });
  });

  it("rejects invalid persist payloads", () => {
    expect(() =>
      normalizeMemoryToolResultPersistInput({
        rawParams: {
          toolName: "memory_object_search_basic",
          payloadText: "text",
          payloadJson: { also: "json" },
        },
        context: {
          sessionId: "session-1",
        } as never,
      }),
    ).toThrow("exactly one of payloadText or payloadJson must be provided");

    expect(() =>
      normalizeMemoryToolResultPersistInput({
        rawParams: {
          toolName: "memory_object_search_basic",
          payloadText: "text",
        },
      }),
    ).toThrow("sessionId required");
  });
});
