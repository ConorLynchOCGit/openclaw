import { describe, expect, it, vi } from "vitest";
import type { SessionMemoryGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemorySessionGetTool,
  normalizeMemorySessionGetInput,
} from "./memory-session-get.js";

function createAcceptedGetResult(): SessionMemoryGetResult {
  return {
    accepted: true,
    status: "ok",
    exists: true,
    sessionId: "session-1",
    agentId: "agent-1",
    stateKey: "session_memory",
    stateId: "state-1",
    lifecycle: "active",
    updateCount: 2,
    memory: {
      title: "Memory Middleware Session",
      currentState: "Implementing session memory",
      relevantFiles: ["extensions/memory-middleware/src/db/queries.ts"],
      commandsUsed: ["pnpm test -- ..."],
      errorsAndCorrections: [],
      decisionsMade: ["Use agent_state"],
      importantFactsLearned: ["Session memory stays deterministic"],
      keyResults: [],
      pendingTasks: ["Add docs"],
      worklog: ["Wired the runtime seam"],
    },
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:05:00.000Z",
  };
}

function createRuntime() {
  return {
    sessionMemory: {
      get: vi.fn(async () => createAcceptedGetResult()),
      update: vi.fn(),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory session get tool", () => {
  it("normalizes a session-memory get payload with trusted context fallbacks", () => {
    expect(
      normalizeMemorySessionGetInput({
        rawParams: {},
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      agentId: "agent-1",
    });
  });

  it("routes retrieval through the session-memory seam", async () => {
    const runtime = createRuntime();
    const tool = createMemorySessionGetTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      agentId: "agent-1",
    });

    expect(runtime.sessionMemory.get).toHaveBeenCalledWith({
      sessionId: "session-1",
      agentId: "agent-1",
    });
    expect(result.details).toEqual(createAcceptedGetResult());
  });

  it("rejects missing session context", () => {
    expect(() =>
      normalizeMemorySessionGetInput({
        rawParams: {
          agentId: "agent-1",
        },
      }),
    ).toThrow("sessionId required");
  });
});
