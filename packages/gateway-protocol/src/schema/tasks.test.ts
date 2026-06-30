import { Compile } from "typebox/compile";
import { describe, expect, it } from "vitest";
import { TaskSummarySchema } from "./tasks.js";

describe("TaskSummarySchema", () => {
  const validateTaskSummary = Compile(TaskSummarySchema);

  it("accepts bounded deliveryStatus readback", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "not_applicable",
      }),
    ).toBe(true);
  });

  it("accepts optional bounded active progress capsules", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "trajectory",
          ref: "session:child-1",
          currentPhase: "validation",
          activeLabel: "exec_command",
          observedAt: "2026-06-30T18:30:00.000Z",
          elapsedMs: 900,
          sourceEventType: "tool.call",
          sourceEventSeq: 14,
          note: "checking progress",
          pointer: {
            kind: "inspect-next",
            ref: "openclaw sessions tail --session-key agent:coding:subagent:child-1",
          },
          derivedBy: "readLatestTrajectoryProgressCapsule",
          bounded: true,
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded registry-derived active progress capsules", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "task-registry",
          ref: "task:task-1",
          currentPhase: "running",
          activeLabel: "codebase-researcher",
          observedAt: "2026-06-30T20:05:00.000Z",
          elapsedMs: 1200,
          note: "Task is active; richer session progress is not indexed yet.",
          pointer: {
            kind: "task",
            ref: "task-1",
            label: "task row",
          },
          derivedBy: "resolveTaskActiveProgressCapsule",
          bounded: true,
        },
      }),
    ).toBe(true);

    expect(
      validateTaskSummary.Check({
        id: "task-2",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "subagent-registry",
          ref: "subagent-run:run-child",
          currentPhase: "running",
          activeLabel: "planner",
          observedAt: "2026-06-30T20:06:00.000Z",
          elapsedMs: 1400,
          note: "Child run is active; session trajectory progress is not indexed yet.",
          pointer: {
            kind: "session",
            ref: "agent:planning:subagent:child",
            label: "child session",
          },
          derivedBy: "resolveTaskActiveProgressCapsule",
          bounded: true,
        },
      }),
    ).toBe(true);
  });

  it("requires closed deliveryStatus values", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "ignored",
      }),
    ).toBe(false);
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
      }),
    ).toBe(false);
  });
});
