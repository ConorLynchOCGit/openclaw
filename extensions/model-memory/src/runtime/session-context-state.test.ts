import { describe, expect, it } from "vitest";
import { createSessionContextState, updateSessionContextState } from "./session-context-state.ts";

describe("session-context-state", () => {
  it("creates deterministic non-semantic session working state", () => {
    const state = createSessionContextState({
      sessionId: "session-001",
      agentId: "agent-main",
      activeProjectIds: ["project-002", "project-001", "project-001"],
      openLoops: ["loop-b", "loop-a"],
      unresolvedQuestions: ["question-b", "question-a"],
      activePlanState: { planId: "plan-001" },
      projectionVersions: { user: "v2", memory: "v1" },
    });

    expect(state.activeProjectIds).toEqual(["project-001", "project-002"]);
    expect(state.openLoops).toEqual(["loop-a", "loop-b"]);
    expect(state.unresolvedQuestions).toEqual(["question-a", "question-b"]);
    expect(state.compactionStatus).toBe("delegated");
  });

  it("updates state deterministically without inventing semantic categories", () => {
    const updated = updateSessionContextState(
      createSessionContextState({
        sessionId: "session-001",
        agentId: "agent-main",
      }),
      {
        activeProjectIds: ["project-003", "project-002"],
        compactionStatus: "dirty",
      },
    );

    expect(updated.activeProjectIds).toEqual(["project-002", "project-003"]);
    expect(updated.compactionStatus).toBe("dirty");
    expect(updated).not.toHaveProperty("canonicalClass");
    expect(updated).not.toHaveProperty("kind");
  });
});
