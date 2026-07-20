import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { ReleasePrepareParamsSchema, ReleasePrepareResultSchema } from "./release.js";

describe("release preparation protocol", () => {
  it("accepts only a Coding task ID", () => {
    expect(Value.Check(ReleasePrepareParamsSchema, { codingTaskId: "task-123" })).toBe(true);
    expect(Value.Check(ReleasePrepareParamsSchema, { codingTaskId: "" })).toBe(false);
    expect(
      Value.Check(ReleasePrepareParamsSchema, {
        codingTaskId: "task-123",
        packagePath: "/tmp/release.tgz",
      }),
    ).toBe(false);
  });

  it("describes immediate service and accepted-result readback", () => {
    expect(
      Value.Check(ReleasePrepareResultSchema, {
        status: "started",
        operationId: "operation",
        unitName: "openclaw-release-prepare-operation.service",
      }),
    ).toBe(true);
    expect(
      Value.Check(ReleasePrepareResultSchema, {
        status: "accepted",
        operationId: "operation",
        unitName: "openclaw-release-prepare-operation.service",
        acceptedReleaseReceiptId: "receipt",
      }),
    ).toBe(true);
  });
});
