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

  it("drops procedure packs before retrieval packs when trimming semi-stable context", () => {
    const result = applyTrimPolicy(
      [
        {
          segmentType: "retrieval_pack",
          priority: "semi_stable",
          sourceKind: "context_artifact",
          text: "retrieval pack keep",
        },
        {
          segmentType: "procedure_pack",
          priority: "semi_stable",
          sourceKind: "context_artifact",
          text: "procedure pack drop",
        },
      ],
      3,
    );

    expect(result.pruningUsed).toBe(true);
    expect(result.segments.find((entry) => entry.segmentType === "procedure_pack")?.dropped).toBe(
      true,
    );
    expect(result.segments.find((entry) => entry.segmentType === "retrieval_pack")?.dropped).toBe(
      false,
    );
  });
});
