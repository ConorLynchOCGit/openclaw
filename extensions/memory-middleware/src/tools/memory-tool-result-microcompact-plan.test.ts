import { describe, expect, it, vi } from "vitest";
import type { ToolResultMicrocompactPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryToolResultMicrocompactPlanTool,
  normalizeMemoryToolResultMicrocompactPlanInput,
} from "./memory-tool-result-microcompact-plan.js";

function createAcceptedPlanResult(): ToolResultMicrocompactPlanResult {
  return {
    accepted: true,
    status: "ok",
    sessionId: "session-1",
    shouldCompact: true,
    recommendedAction: "clear_persisted_previews",
    triggers: ["persisted_count_threshold"],
    rationale: ["persisted tool-result count 4 exceeds threshold 3"],
    persistedResultCount: 4,
    recentFloorCount: 2,
    preservedToolResultIds: ["tool-result-4", "tool-result-3"],
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
    estimatedPromptTokenThreshold: 12000,
  };
}

function createRuntime() {
  return {
    toolResultStore: {
      persist: vi.fn(),
      get: vi.fn(),
      planMicrocompaction: vi.fn(async () => createAcceptedPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory tool result microcompact plan tool", () => {
  it("normalizes a microcompaction-planning payload", () => {
    expect(
      normalizeMemoryToolResultMicrocompactPlanInput({
        rawParams: {
          idleGapSeconds: "1200",
          persistedCountThreshold: "7",
          estimatedPromptTokens: "18000",
          estimatedPromptTokenThreshold: "12000",
          recentFloorCount: "3",
          maxClearCount: "4",
        },
        context: {
          sessionId: "session-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      idleGapSeconds: 1200,
      persistedCountThreshold: 7,
      estimatedPromptTokens: 18000,
      estimatedPromptTokenThreshold: 12000,
      recentFloorCount: 3,
      maxClearCount: 4,
    });
  });

  it("routes planning through the tool-result store seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryToolResultMicrocompactPlanTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      persistedCountThreshold: 3,
      recentFloorCount: 2,
    });

    expect(runtime.toolResultStore.planMicrocompaction).toHaveBeenCalledWith({
      sessionId: "session-1",
      persistedCountThreshold: 3,
      recentFloorCount: 2,
    });
    expect(result.details).toEqual(createAcceptedPlanResult());
  });

  it("surfaces no-op plans cleanly", async () => {
    const runtime = createRuntime();
    runtime.toolResultStore.planMicrocompaction = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      sessionId: "session-1",
      shouldCompact: false,
      recommendedAction: "none" as const,
      triggers: [],
      rationale: [
        "persisted tool-result previews remain within bounded microcompaction thresholds",
      ],
      persistedResultCount: 2,
      recentFloorCount: 2,
      preservedToolResultIds: ["tool-result-2", "tool-result-1"],
      clearCandidates: [],
      estimatedPromptTokenThreshold: 12000,
    }));
    const tool = createMemoryToolResultMicrocompactPlanTool({ runtime });

    const result = await tool.execute("call-2", {
      sessionId: "session-1",
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      sessionId: "session-1",
      shouldCompact: false,
      recommendedAction: "none",
      triggers: [],
      rationale: [
        "persisted tool-result previews remain within bounded microcompaction thresholds",
      ],
      persistedResultCount: 2,
      recentFloorCount: 2,
      preservedToolResultIds: ["tool-result-2", "tool-result-1"],
      clearCandidates: [],
      estimatedPromptTokenThreshold: 12000,
    });
  });

  it("rejects missing session context", () => {
    expect(() =>
      normalizeMemoryToolResultMicrocompactPlanInput({
        rawParams: {},
      }),
    ).toThrow("sessionId required");
  });
});
