import { describe, expect, it, vi } from "vitest";
import type { CompactionPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryCompactionPlanTool,
  normalizeMemoryCompactionPlanInput,
} from "./memory-compaction-plan.js";

function createAcceptedResult(): CompactionPlanResult {
  return {
    accepted: true,
    status: "ok",
    sessionId: "session-1",
    agentId: "agent-1",
    outcome: "use_microcompaction",
    rationale: ["persisted tool-result pressure exceeds bounded microcompaction thresholds"],
    requiredInputs: [],
    clearCandidates: [],
    microcompactionRecommended: true,
    sessionMemoryStatus: "fresh_and_sufficient",
    sessionMemoryExists: true,
    sessionMemorySufficient: true,
    sessionMemoryFresh: true,
    sessionMemoryUpdatedAt: "2026-04-02T00:00:00.000Z",
    estimatedPromptTokens: 18000,
    estimatedPromptTokenThreshold: 12000,
  };
}

function createRuntime() {
  return {
    compactionPlanning: {
      plan: vi.fn(async () => createAcceptedResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory compaction plan tool", () => {
  it("normalizes a compaction-plan payload with trusted context fallbacks", () => {
    expect(
      normalizeMemoryCompactionPlanInput({
        rawParams: {
          estimatedPromptTokens: "18000",
          sessionMemoryStaleAfterSeconds: "900",
        },
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
      sessionMemoryStaleAfterSeconds: 900,
    });
  });

  it("routes compaction planning through the compaction-planning seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryCompactionPlanTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
    });

    expect(runtime.compactionPlanning.plan).toHaveBeenCalledWith({
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
    });
    expect(result.details).toEqual(createAcceptedResult());
  });

  it("rejects missing agent context", () => {
    expect(() =>
      normalizeMemoryCompactionPlanInput({
        rawParams: {
          sessionId: "session-1",
        },
      }),
    ).toThrow("agentId required");
  });
});
