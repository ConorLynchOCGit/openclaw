import { describe, expect, it, vi } from "vitest";
import type { ToolResultGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryToolResultGetTool,
  normalizeMemoryToolResultGetInput,
} from "./memory-tool-result-get.js";

function createAcceptedGetResult(): ToolResultGetResult {
  return {
    accepted: true,
    status: "ok",
    toolResult: {
      id: "tool-result-1",
      sessionId: "session-1",
      toolName: "memory_object_search_hybrid",
      storageStatus: "persisted",
      contentType: "application/json",
      previewText: "Preview text",
      payloadJson: { rows: 42 },
      sizeBytes: 8192,
      checksumSha256: "abc123",
      memoryEventId: "event-1",
      metadata: {
        source: "tool-result-persist-tool",
      },
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  };
}

function createRuntime() {
  return {
    toolResultStore: {
      persist: vi.fn(),
      get: vi.fn(async () => createAcceptedGetResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory tool result get tool", () => {
  it("normalizes a persisted tool-result lookup payload", () => {
    expect(
      normalizeMemoryToolResultGetInput({
        toolResultId: " tool-result-1 ",
      }),
    ).toEqual({
      toolResultId: "tool-result-1",
    });
  });

  it("routes retrieval through the tool-result store seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryToolResultGetTool({ runtime });

    const result = await tool.execute("call-1", {
      toolResultId: "tool-result-1",
    });

    expect(runtime.toolResultStore.get).toHaveBeenCalledWith({
      toolResultId: "tool-result-1",
    });
    expect(result.details).toEqual(createAcceptedGetResult());
  });

  it("surfaces missing persisted tool results", async () => {
    const runtime = createRuntime();
    runtime.toolResultStore.get = vi.fn(async () => ({
      accepted: false as const,
      status: "not_found" as const,
      reason: "tool result not found",
    }));
    const tool = createMemoryToolResultGetTool({ runtime });

    const result = await tool.execute("call-2", {
      toolResultId: "missing-result",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "not_found",
      reason: "tool result not found",
    });
  });
});
