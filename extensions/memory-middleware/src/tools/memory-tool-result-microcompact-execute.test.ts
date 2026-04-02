import { describe, expect, it, vi } from "vitest";
import type { ToolResultMicrocompactExecuteResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryToolResultMicrocompactExecuteTool,
  normalizeMemoryToolResultMicrocompactExecuteInput,
} from "./memory-tool-result-microcompact-execute.js";

function createAcceptedExecuteResult(): ToolResultMicrocompactExecuteResult {
  return {
    accepted: true,
    status: "executed",
    sessionId: "session-1",
    compactionEventId: "compaction-1",
    clearedToolResultIds: ["tool-result-1"],
    preservedToolResultIds: ["tool-result-3", "tool-result-2"],
    requestedToolResultIds: ["tool-result-1"],
    clearCandidates: [
      {
        toolResultId: "tool-result-1",
        toolName: "memory_object_search_hybrid",
        previewText: "older preview",
        referenceToken: "tool_result:tool-result-1",
        sizeBytes: 4096,
        estimatedPreviewTokens: 20,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    ],
    skippedRequestedToolResultIds: [],
    estimatedPromptTokenThreshold: 12000,
  };
}

function createRuntime() {
  return {
    toolResultStore: {
      persist: vi.fn(),
      get: vi.fn(),
      planMicrocompaction: vi.fn(),
      executeMicrocompaction: vi.fn(async () => createAcceptedExecuteResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory tool result microcompact execute tool", () => {
  it("normalizes a microcompaction-execution payload", () => {
    expect(
      normalizeMemoryToolResultMicrocompactExecuteInput({
        rawParams: {
          clearToolResultIds: [" result-1 ", "result-2"],
          persistedCountThreshold: "7",
        },
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      agentId: "agent-1",
      clearToolResultIds: [" result-1 ", "result-2"],
      persistedCountThreshold: 7,
    });
  });

  it("routes execution through the tool-result store seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      clearToolResultIds: ["tool-result-1"],
    });

    expect(runtime.toolResultStore.executeMicrocompaction).toHaveBeenCalledWith({
      sessionId: "session-1",
      clearToolResultIds: ["tool-result-1"],
    });
    expect(result.details).toEqual(createAcceptedExecuteResult());
  });

  it("surfaces no-op execution cleanly", async () => {
    const runtime = createRuntime();
    runtime.toolResultStore.executeMicrocompaction = vi.fn(async () => ({
      accepted: true as const,
      status: "no_op" as const,
      sessionId: "session-1",
      clearedToolResultIds: [],
      preservedToolResultIds: ["tool-result-2", "tool-result-1"],
      clearCandidates: [],
      skippedRequestedToolResultIds: ["tool-result-missing"],
      estimatedPromptTokenThreshold: 12000,
    }));
    const tool = createMemoryToolResultMicrocompactExecuteTool({ runtime });

    const result = await tool.execute("call-2", {
      sessionId: "session-1",
      clearToolResultIds: ["tool-result-missing"],
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "no_op",
      sessionId: "session-1",
      clearedToolResultIds: [],
      preservedToolResultIds: ["tool-result-2", "tool-result-1"],
      clearCandidates: [],
      skippedRequestedToolResultIds: ["tool-result-missing"],
      estimatedPromptTokenThreshold: 12000,
    });
  });

  it("rejects missing session context", () => {
    expect(() =>
      normalizeMemoryToolResultMicrocompactExecuteInput({
        rawParams: {},
      }),
    ).toThrow("sessionId required");
  });
});
