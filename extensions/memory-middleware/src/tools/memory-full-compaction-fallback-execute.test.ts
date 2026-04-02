import { describe, expect, it, vi } from "vitest";
import type { FullCompactionFallbackExecuteResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryFullCompactionFallbackExecuteTool,
  normalizeMemoryFullCompactionFallbackExecuteInput,
} from "./memory-full-compaction-fallback-execute.js";

function createAcceptedResult(): FullCompactionFallbackExecuteResult {
  return {
    accepted: true,
    status: "executed",
    sessionId: "session-1",
    agentId: "agent-1",
    plannerOutcome: "propose_full_compaction_fallback",
    sessionMemoryStatus: "missing",
    compactionEventId: "compaction-1",
    payload: {
      kind: "full_compaction_fallback",
      shouldSubstitute: true,
      substitutionText: "[full-fallback:abc123] bounded fallback artifact available",
      compactedText:
        "planner_outcome: propose_full_compaction_fallback\nsession_memory_status: missing",
      substrate: {
        plannerOutcome: "propose_full_compaction_fallback",
        sessionMemoryStatus: "missing",
        microcompactionRecommended: false,
        clearCandidateIds: [],
      },
      rationale: ["fresh sufficient session memory or a future full compaction implementation"],
    },
    rationale: [
      "bounded existing state was packaged into a deterministic full-fallback compaction artifact",
    ],
    requiredInputs: ["fresh sufficient session memory or a future full compaction implementation"],
    estimatedPromptTokens: 18000,
    estimatedPromptTokenThreshold: 12000,
  };
}

function createRuntime() {
  return {
    fullCompactionFallback: {
      execute: vi.fn(async () => createAcceptedResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory full compaction fallback execute tool", () => {
  it("normalizes a fallback-execution payload with trusted context fallbacks", () => {
    expect(
      normalizeMemoryFullCompactionFallbackExecuteInput({
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

  it("routes fallback execution through the dedicated runtime seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryFullCompactionFallbackExecuteTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
    });

    expect(runtime.fullCompactionFallback.execute).toHaveBeenCalledWith({
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
    });
    expect(result.details).toEqual(createAcceptedResult());
  });

  it("rejects missing agent context", () => {
    expect(() =>
      normalizeMemoryFullCompactionFallbackExecuteInput({
        rawParams: {
          sessionId: "session-1",
        },
      }),
    ).toThrow("agentId required");
  });
});
