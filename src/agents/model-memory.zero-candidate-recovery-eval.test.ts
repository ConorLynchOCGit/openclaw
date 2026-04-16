import { describe, expect, it } from "vitest";
import {
  renderModelMemoryZeroCandidateRecoveryEvalMarkdown,
  type ModelMemoryZeroCandidateRecoveryEvalReport,
} from "./model-memory.zero-candidate-recovery-eval.ts";

describe("model-memory zero-candidate recovery eval", () => {
  it("renders the evaluation summary and case rows", () => {
    const report: ModelMemoryZeroCandidateRecoveryEvalReport = {
      generatedAt: "2026-04-15T00:00:00.000Z",
      duplicateAuditPath: "docs/projects/model-memory/evidence/duplicate-escape-audit.json",
      duplicateAuditGeneratedAt: "2026-04-15T00:00:00.000Z",
      duplicateReviewPath: "docs/projects/model-memory/evidence/duplicate-escape-review.json",
      duplicateReviewGeneratedAt: "2026-04-15T00:00:00.000Z",
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      modelId: "openrouter/openai/gpt-5.4-nano",
      sampleSize: 2,
      basketComposition: {
        known_legitimate_match: 1,
        legit_distinct_control: 1,
        ambiguity_control: 0,
      },
      candidateSourceComposition: {
        retained_structural: 1,
        raw_text_fallback: 0,
        none: 1,
      },
      cases: [
        {
          caseId: "case-1",
          caseIdentity: "AGENTS.md::rule_001",
          source: "AGENTS.md",
          kind: "rule",
          label: "known_legitimate_match",
          candidateSource: "retained_structural",
          historicalDecision: "write",
          selectedCandidateCount: 1,
          candidateSelectionMode: "top1_only",
          selectedCandidateObjectIds: ["memory-1"],
          selectedCandidateScores: [0.82],
          acceptableMatchObjectIds: ["memory-1"],
          modelDecision: {
            candidateId: "case-1",
            sameCoreMemory: "yes",
            matchedCandidateId: "candidate_1",
            deltaType: "non_additive",
          },
          finalRoute: "direct_attach_support",
          converted: true,
          falseMergeRisk: false,
          stayedContained: false,
        },
        {
          caseId: "case-2",
          caseIdentity: "docs/help/testing.md::fact_002",
          source: "docs/help/testing.md",
          kind: "fact",
          label: "legit_distinct_control",
          candidateSource: "none",
          historicalDecision: "write",
          selectedCandidateCount: 0,
          candidateSelectionMode: "none",
          selectedCandidateObjectIds: [],
          selectedCandidateScores: [],
          modelDecision: undefined,
          finalRoute: "no_candidates",
          converted: false,
          falseMergeRisk: false,
          stayedContained: false,
        },
      ],
      summary: {
        overallConversionRate: 1,
        recoveryRate: 1,
        falseMergeRate: 0,
        ambiguousRate: 0,
        retainedCandidateOnlySuccessRate: 1,
        zeroCandidateFallbackSuccessRate: 0,
        candidateCountDistribution: {
          "0": 1,
          "1": 1,
        },
        selectionModeDistribution: {
          none: 1,
          top1_only: 1,
        },
      },
    };

    const markdown = renderModelMemoryZeroCandidateRecoveryEvalMarkdown(report);

    expect(markdown).toContain("# Bounded Candidate Adjudication Evaluation");
    expect(markdown).toContain("Overall conversion rate: 100.0%");
    expect(markdown).toContain("Candidate source: retained_structural");
    expect(markdown).toContain("case-1");
    expect(markdown).toContain("Final route: direct_attach_support");
    expect(markdown).toContain("case-2");
    expect(markdown).toContain("Final route: no_candidates");
  });
});
