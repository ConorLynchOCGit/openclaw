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
