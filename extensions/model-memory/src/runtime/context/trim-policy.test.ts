import { describe, expect, it } from "vitest";
import { applyTrimPolicy } from "./trim-policy.ts";

describe("trim policy", () => {
  it("drops volatile tool results before lower-priority stable context", () => {
    const result = applyTrimPolicy(
      [
        {
          segmentType: "bootstrap",
          priority: "stable",
          sourceKind: "workspace_projection",
          text: "stable bootstrap text",
        },
        {
          segmentType: "tool_results",
          priority: "volatile",
          sourceKind: "tool",
          text: "tool results that should drop first",
        },
      ],
      3,
    );

    expect(result.pruningUsed).toBe(true);
    expect(result.segments.find((entry) => entry.segmentType === "tool_results")?.dropped).toBe(
      true,
    );
    expect(result.segments.find((entry) => entry.segmentType === "bootstrap")?.dropped).toBe(false);
  });
});
