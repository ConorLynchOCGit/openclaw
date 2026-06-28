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
