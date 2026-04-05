import { describe, expect, it, vi } from "vitest";
import type { SessionMemoryCompactExecuteResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemorySessionCompactExecuteTool,
  normalizeMemorySessionCompactExecuteInput,
} from "./memory-session-compact-execute.js";

function createAcceptedResult(): SessionMemoryCompactExecuteResult {
  return {
    accepted: true,
    status: "executed",
    sessionId: "session-1",
    agentId: "agent-1",
    plannerOutcome: "use_session_memory",
    sessionMemoryStatus: "fresh_and_sufficient",
    sessionMemoryStateId: "state-1",
    sessionMemoryUpdatedAt: "2026-04-02T00:10:00.000Z",
    compactionEventId: "compaction-1",
    payload: {
      kind: "session_memory_compaction",
      shouldSubstitute: true,
      substitutionText: "[session-memory:state-1] Continue from bounded session memory",
      compactedText: "title: Continue from bounded session memory",
      fieldsIncluded: ["title", "current_state", "pending_tasks"],
      structuredMemory: {
        title: "Continue from bounded session memory",
        currentState: "Ready to proceed",
        relevantFiles: [],
        commandsUsed: [],
        errorsAndCorrections: [],
        decisionsMade: [],
        importantFactsLearned: [],
        keyResults: [],
        pendingTasks: ["Implement docs"],
        worklog: [],
      },
    },
    rationale: ["fresh sufficient session memory can serve as the bounded compaction substrate"],
    requiredInputs: [],
    estimatedPromptTokens: 18000,
    estimatedPromptTokenThreshold: 12000,
  };
}

function createRuntime() {
  return {
    sessionMemoryCompaction: {
      execute: vi.fn(async () => createAcceptedResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory session compact execute tool", () => {
  it("normalizes a session-memory compaction payload with trusted context fallbacks", () => {
    expect(
      normalizeMemorySessionCompactExecuteInput({
        rawParams: {
          estimatedPromptTokens: "18000",
          sessionMemoryStaleAfterSeconds: "1200",
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
      sessionMemoryStaleAfterSeconds: 1200,
    });
  });

  it("routes execution through the session-memory compaction seam", async () => {
    const runtime = createRuntime();
    const tool = createMemorySessionCompactExecuteTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });

    expect(runtime.sessionMemoryCompaction.execute).toHaveBeenCalledWith({
      sessionId: "session-1",
      agentId: "agent-1",
      estimatedPromptTokens: 18000,
      persistedCountThreshold: 10,
    });
    expect(result.details).toEqual(createAcceptedResult());
  });

  it("rejects missing session context", () => {
    expect(() =>
      normalizeMemorySessionCompactExecuteInput({
        rawParams: {
          agentId: "agent-1",
        },
      }),
    ).toThrow("sessionId required");
  });
});
