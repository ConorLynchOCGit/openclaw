import { describe, expect, it } from "vitest";
import {
  renderZeroCandidateTextSearchDiagnosticMarkdown,
  type ZeroCandidateTextSearchDiagnosticReport,
} from "./model-memory.zero-candidate-text-search-diagnostic.ts";

describe("renderZeroCandidateTextSearchDiagnosticMarkdown", () => {
  it("renders summary metrics and case rows", () => {
    const report: ZeroCandidateTextSearchDiagnosticReport = {
      generatedAt: "2026-04-15T00:00:00.000Z",
      databaseMode: "full_corpus_proof_db",
      databaseName: "model_memory",
      tracePaths: ["trace-a.json"],
      similarityMethod: "normalized_search_text_jaccard",
      sampleSelectionPolicy: "manual_zero_candidate_subset_with_known_legitimate_prior_match",
      caveats: ["diagnostic only"],
      sampleSize: 1,
      cases: [
        {
          caseIdentity: "AGENTS.md::heading::rule_123",
          sourcePath: "AGENTS.md",
          kind: "rule",
          passLabel: "rerun_1",
          queryText: "rule text",
          payloadSummary: "Rule summary",
          rationale: "same durable claim",
          acceptableMatchObjectIds: ["obj-1"],
          acceptableMatchRanks: [2],
          bestAcceptableRank: 2,
          topWrongScore: 0.81,
          bestAcceptableScore: 0.76,
          scoreGapVsTopWrong: -0.05,
          hits: {
            top1: false,
            top5: true,
            top10: true,
            present: true,
          },
          topResults: [
            {
              memoryObjectId: "obj-wrong",
              sourcePath: "AGENTS.md",
              kind: "rule",
              lifecycleState: "active",
              identityKey: "rule_wrong",
              similarityScore: 0.81,
              payloadSummary: "Wrong summary",
            },
            {
              memoryObjectId: "obj-1",
              sourcePath: "AGENTS.md",
              kind: "rule",
              lifecycleState: "active",
              identityKey: "rule_ok",
              similarityScore: 0.76,
              payloadSummary: "Correct summary",
            },
          ],
        },
      ],
      summary: {
        top1HitRate: 0,
        top5HitRate: 1,
        top10HitRate: 1,
        medianBestAcceptableRank: 2,
        scoreGapVsTopWrong: {
          median: -0.05,
          minimum: -0.05,
          maximum: -0.05,
        },
        sourceBreakdown: {
          "AGENTS.md": 1,
        },
        kindBreakdown: {
          rule: 1,
        },
      },
    };

    const markdown = renderZeroCandidateTextSearchDiagnosticMarkdown(report);
    expect(markdown).toContain("# Zero-Candidate Text Search Diagnostic");
    expect(markdown).toContain("Top-5 hit rate: 100.0%");
    expect(markdown).toContain("AGENTS.md::heading::rule_123");
    expect(markdown).toContain("[acceptable] score=0.76 object=obj-1");
    expect(markdown).toContain("[wrong] score=0.81 object=obj-wrong");
  });
});
