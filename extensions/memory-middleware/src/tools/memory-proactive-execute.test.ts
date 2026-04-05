import { describe, expect, it, vi } from "vitest";
import type {
  DriftCheckExecuteAcceptedResult,
  MemoryProactiveExecuteResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryProactiveExecuteTool,
  normalizeMemoryProactiveExecuteInput,
} from "./memory-proactive-execute.js";

function createDriftCheckResult(): DriftCheckExecuteAcceptedResult {
  return {
    accepted: true,
    status: "executed",
    executionMode: "approved_subset",
    reviewedFindingCount: 1,
    executedActionCount: 1,
    alreadyExecutedCount: 0,
    skippedFindingCount: 0,
    actions: [
      {
        actionType: "drift_check_review",
        status: "executed",
        affectedObjectId: "memory-1",
        affectedObjectType: "memory_object",
        driftCheckDueAt: "2026-03-01T00:00:00.000Z",
        eventId: "event-1",
        rationale: ["recorded bounded drift-check review state"],
      },
    ],
    rationale: ["1 bounded drift-check action recorded without rewriting stored facts"],
  };
}

function createRuntime() {
  return {
    proactiveExecution: {
      execute: vi.fn(
        async () =>
          ({
            accepted: true,
            status: "executed",
            actionType: "run_drift_check",
            executionSource: "derived_plan",
            affectedIds: ["memory-1"],
            rationale: [
              "bounded proactive execution derived the run_drift_check action from the current advisory planner result",
            ],
            driftCheckExecution: createDriftCheckResult(),
          }) satisfies MemoryProactiveExecuteResult,
      ),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory proactive-execute tool", () => {
  it("normalizes proactive-execution input with optional context defaults", () => {
    expect(
      normalizeMemoryProactiveExecuteInput({
        rawParams: {
          actionType: "run_drift_check",
          projectId: " project-1 ",
          maxActions: "3",
          affectedIds: [" memory-2 ", "memory-1", "memory-2"],
        },
        context: {
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      actionType: "run_drift_check",
      projectId: "project-1",
      maxActions: 3,
      affectedIds: ["memory-1", "memory-2"],
      reviewerAgentId: "agent-1",
    });
  });

  it("routes proactive execution through the proactive-execution seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-1", {
      actionType: "run_drift_check",
      projectId: "project-1",
    });

    expect(runtime.proactiveExecution.execute).toHaveBeenCalledWith({
      actionType: "run_drift_check",
      projectId: "project-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "run_drift_check",
    });
  });

  it("surfaces blocked non-drift proactive actions without mutation", async () => {
    const runtime = createRuntime();
    runtime.proactiveExecution.execute = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "blocked",
          actionType: "follow_up_candidate_review",
          executionSource: "explicit_selection",
          affectedIds: ["candidate-1"],
          rationale: [
            "proactive execution for follow_up_candidate_review is out of scope in this slice",
            "only the bounded run_drift_check action class may execute proactively",
          ],
        }) satisfies MemoryProactiveExecuteResult,
    );
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-2", {
      actionType: "follow_up_candidate_review",
      affectedIds: ["candidate-1"],
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "blocked",
      actionType: "follow_up_candidate_review",
      executionSource: "explicit_selection",
      affectedIds: ["candidate-1"],
      rationale: [
        "proactive execution for follow_up_candidate_review is out of scope in this slice",
        "only the bounded run_drift_check action class may execute proactively",
      ],
    });
  });

  it("rejects unknown proactive action types", () => {
    expect(() =>
      normalizeMemoryProactiveExecuteInput({
        rawParams: {
          actionType: "unknown_action",
        },
      }),
    ).toThrow("actionType must be one of:");
  });
});
