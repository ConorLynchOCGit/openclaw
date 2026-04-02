import { describe, expect, it, vi } from "vitest";
import type { SessionMemoryUpdateResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemorySessionUpdateTool,
  normalizeMemorySessionUpdateInput,
} from "./memory-session-update.js";

function createAcceptedUpdateResult(): SessionMemoryUpdateResult {
  return {
    accepted: true,
    status: "updated",
    sessionId: "session-1",
    agentId: "agent-1",
    stateKey: "session_memory",
    stateId: "state-1",
    lifecycle: "active",
    updateCount: 2,
    memory: {
      title: "Memory Middleware Session",
      currentState: "Implementing session memory",
      taskSpecification: "Add bounded session-memory get and update tools.",
      relevantFiles: ["extensions/memory-middleware/src/db/queries.ts"],
      commandsUsed: ["pnpm build"],
      errorsAndCorrections: [],
      decisionsMade: ["Use agent_state"],
      importantFactsLearned: ["agent_state already exists"],
      keyResults: ["Wired query layer"],
      pendingTasks: ["Add docs"],
      worklog: ["Added session-memory ports"],
    },
    updateReason: "progress checkpoint",
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:05:00.000Z",
  };
}

function createRuntime() {
  return {
    sessionMemory: {
      get: vi.fn(),
      update: vi.fn(async () => createAcceptedUpdateResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory session update tool", () => {
  it("normalizes a session-memory update payload with trusted context fallbacks", () => {
    expect(
      normalizeMemorySessionUpdateInput({
        rawParams: {
          title: " Session memory ",
          relevantFiles: [" a.ts ", "b.ts"],
          updateReason: " checkpoint ",
          metadata: {
            source: "test",
          },
        },
        context: {
          sessionId: "session-1",
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      sessionId: "session-1",
      agentId: "agent-1",
      title: "Session memory",
      relevantFiles: [" a.ts ", "b.ts"],
      updateReason: "checkpoint",
      metadata: {
        source: "test",
      },
    });
  });

  it("routes updates through the session-memory seam", async () => {
    const runtime = createRuntime();
    const tool = createMemorySessionUpdateTool({ runtime });

    const result = await tool.execute("call-1", {
      sessionId: "session-1",
      agentId: "agent-1",
      currentState: "Implementing session memory",
      pendingTasks: ["Add tests"],
    });

    expect(runtime.sessionMemory.update).toHaveBeenCalledWith({
      sessionId: "session-1",
      agentId: "agent-1",
      currentState: "Implementing session memory",
      pendingTasks: ["Add tests"],
    });
    expect(result.details).toEqual(createAcceptedUpdateResult());
  });

  it("rejects missing agent context", () => {
    expect(() =>
      normalizeMemorySessionUpdateInput({
        rawParams: {
          sessionId: "session-1",
          title: "Session memory",
        },
      }),
    ).toThrow("agentId required");
  });
});
