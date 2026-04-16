import { describe, expect, it } from "vitest";
import {
  renderModelMemoryThesisHoleEvaluationMarkdown,
  runModelMemoryThesisHoleEvaluation,
} from "./model-memory.thesis-hole-evaluation.ts";

describe("model-memory thesis hole evaluation", () => {
  it("derives a mixed reevaluation from the current evidence surfaces", async () => {
    const report = await runModelMemoryThesisHoleEvaluation({
      agentsTracePath: "docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json",
      comparisonTracePaths: [
        "docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json",
        "docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json",
      ],
      duplicateAuditPath: "docs/projects/model-memory/evidence/duplicate-escape-audit.json",
      duplicateBenchmarkPath: "docs/projects/model-memory/evidence/duplicate-escape-benchmark.json",
      duplicateReviewPath: "docs/projects/model-memory/evidence/duplicate-escape-review.json",
      proofPhaseReportPath: "docs/projects/model-memory/evidence/proof-phase-report.json",
      supportOnlyRebuildDiffPath:
        "docs/projects/model-memory/evidence/support-only-rebuild-diff.json",
    });

    expect(report.baselineThesis.cutoverJudgment).toBe("not_ready_for_cutover");
    expect(report.holes).toHaveLength(10);
    expect(
      report.holes.find((hole) => hole.id === "hole_6_real_blocker_may_be_choice_not_recall")
        ?.effectOnThesis,
    ).toBe("reframes_thesis");
    expect(report.reevaluatedThesis.cutoverJudgment).toBe("not_ready_for_cutover");
    expect(report.reevaluatedThesis.conciseJudgment).toContain(
      "mixed recall-plus-batch-choice problem",
    );
  });

  it("renders markdown with the reevaluated thesis section", async () => {
    const report = await runModelMemoryThesisHoleEvaluation({
      agentsTracePath: "docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json",
      comparisonTracePaths: [
        "docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json",
      ],
      duplicateAuditPath: "docs/projects/model-memory/evidence/duplicate-escape-audit.json",
      duplicateBenchmarkPath: "docs/projects/model-memory/evidence/duplicate-escape-benchmark.json",
      duplicateReviewPath: "docs/projects/model-memory/evidence/duplicate-escape-review.json",
      proofPhaseReportPath: "docs/projects/model-memory/evidence/proof-phase-report.json",
      supportOnlyRebuildDiffPath:
        "docs/projects/model-memory/evidence/support-only-rebuild-diff.json",
    });

    const markdown = renderModelMemoryThesisHoleEvaluationMarkdown(report);
    expect(markdown).toContain("# Model Memory Thesis Hole Evaluation");
    expect(markdown).toContain("## Reevaluated Thesis");
    expect(markdown).toContain("hole_4_benchmark_and_review_diverge");
  });
});
