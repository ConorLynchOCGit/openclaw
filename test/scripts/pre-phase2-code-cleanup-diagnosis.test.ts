import { describe, expect, it } from "vitest";
import {
  buildCodeCleanupDiagnosisReport,
  computePriorityScore,
  isProductionCodePath,
  renderCodeCleanupDiagnosisMarkdown,
} from "../../scripts/lib/pre-phase2-code-cleanup-diagnosis.ts";

describe("pre-phase2 code cleanup diagnosis helpers", () => {
  it("filters out obvious non-production paths", () => {
    expect(isProductionCodePath("src/agents/model-memory.live-runtime.ts")).toBe(true);
    expect(isProductionCodePath("extensions/model-memory/src/index.ts")).toBe(true);
    expect(isProductionCodePath("src/agents/model-memory.live-runtime.test.ts")).toBe(false);
    expect(isProductionCodePath("src/config/schema.base.generated.ts")).toBe(false);
    expect(isProductionCodePath("extensions/diffs/assets/viewer-runtime.js")).toBe(false);
  });

  it("prioritizes leverage and hotspot size over raw compatibility retention", () => {
    const score = computePriorityScore(
      {
        phase2Criticality: 5,
        leverage: 5,
        regressionRisk: 4,
        publicApiRisk: 4,
        extractionDifficulty: 3,
        rollbackEase: 4,
        testCoverageConfidence: 4,
      },
      {
        maxLines: 1_734,
        legacyMarkers: 10,
        fallbackMarkers: 2,
      },
    );
    expect(score).toBeGreaterThan(25);
  });

  it("renders a markdown summary from the live repo diagnosis", () => {
    const report = buildCodeCleanupDiagnosisReport({
      repoRoot: process.cwd(),
      artifactRoot: ".artifacts/refactor-prephase2/test/diagnosis",
      generatedAt: "2026-04-24T00:00:00.000Z",
    });
    const markdown = renderCodeCleanupDiagnosisMarkdown(report);
    expect(markdown).toContain("# Pre-Phase-2 Code Cleanup Diagnosis");
    expect(markdown).toContain("RC-001");
    expect(report.backlog.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["RC-001", "RC-002", "RC-003", "RC-004", "RC-005"]),
    );
  });
});
