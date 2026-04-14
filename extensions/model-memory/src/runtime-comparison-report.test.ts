import { describe, expect, it } from "vitest";
import { renderRuntimeComparisonReport } from "./runtime-comparison-report.ts";

describe("runtime comparison report", () => {
  it("renders deterministic divergence summaries", () => {
    const report = renderRuntimeComparisonReport({
      matchedIdentityKeys: ["id-001"],
      modelOnlyIdentityKeys: ["id-002"],
      legacyOnlyIdentityKeys: ["id-003"],
      duplicateDecisionDelta: 1,
      supersessionDecisionDelta: -1,
      omissionDivergence: false,
    });

    expect(report).toContain("matched identities: 1");
    expect(report).toContain("model-only identities: 1");
    expect(report).toContain("legacy-only identities: 1");
    expect(report).toContain("duplicate decision delta: 1");
    expect(report).toContain("supersession decision delta: -1");
  });
});
