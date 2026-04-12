import { describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";
import {
  runMemorySemanticGoldCorpusBenchmark,
  type MemorySemanticBenchmarkReport,
} from "./memory-live-benchmark.js";
import { evaluateMemorySemanticCalibration } from "./memory-semantic-calibration.js";
import type { MemorySemanticGoldCase } from "./memory-semantic-gold-corpus.js";
import { createScriptedMemorySemanticInterpreter } from "./memory-semantic-interpreter.test-helpers.js";

const config = resolveMemoryMiddlewareConfig({});

describe("memory live benchmark", () => {
  it("evaluates inline gold cases with a scripted interpreter", async () => {
    const cases: MemorySemanticGoldCase[] = [
      {
        id: "inline-identity",
        title: "inline identity",
        lane: "document_ingestion",
        source: {
          kind: "document",
          sourceId: "inline:identity",
          path: "benchmarks/inline-identity.md",
        },
        content: "plain english please\n\nremember this later maybe\n",
        expected: {
          exactCount: 1,
          categoryCounts: { response_style: 1 },
          requiredCandidates: [
            {
              id: "plain",
              category: "response_style",
              statementIncludes: ["plain english"],
              lineStart: 1,
            },
          ],
          forbiddenCandidates: [
            {
              reason: "filler should be omitted",
              statementIncludes: ["remember this later maybe"],
            },
          ],
          notes: [],
        },
      },
      {
        id: "inline-procedure",
        title: "inline procedure",
        lane: "ordinary_turn_capture",
        source: {
          kind: "transcript",
          sourceId: "inline:procedure",
          sessionKey: "inline-session",
        },
        text: [
          "Release Evidence Handoff Checklist:",
          "1. Capture the signed evidence bundle.",
          "2. Post the handoff note in the audit channel.",
        ].join("\n"),
        parentContext: [],
        expected: {
          exactCount: 1,
          categoryCounts: { recurring_procedure: 1 },
          requiredCandidates: [
            {
              id: "procedure",
              category: "recurring_procedure",
              statementIncludes: ["signed evidence bundle", "audit channel"],
            },
          ],
          forbiddenCandidates: [],
          notes: [],
        },
      },
    ];

    const interpreter = createScriptedMemorySemanticInterpreter((input) => {
      if (input.block.blockText.toLowerCase().includes("plain english")) {
        return {
          action: "candidate",
          semanticClass: "stable_user_preference",
          captureCategoryHint: "response_style",
          canonicalStatement: "Use plain English.",
          confidence: "strong",
          rationale: ["scripted test match"],
        };
      }
      if (input.block.headingPath.at(-1) === "Release Evidence Handoff Checklist") {
        return {
          action: "candidate",
          semanticClass: "reusable_procedure",
          captureCategoryHint: "recurring_procedure",
          canonicalProcedure: {
            name: "Release Evidence Handoff Checklist",
            steps: [
              "Capture the signed evidence bundle.",
              "Post the handoff note in the audit channel.",
            ],
          },
          confidence: "strong",
          rationale: ["scripted test match"],
        };
      }
      return {
        action: "ignore",
        semanticClass: "ignore",
        confidence: "weak",
        rationale: ["scripted test ignore"],
      };
    });

    const report = await runMemorySemanticGoldCorpusBenchmark({
      config,
      interpreter,
      cases,
    });

    expect(report.readiness.blockingIssueCount).toBe(0);
    expect(report.caseResults).toHaveLength(2);
    expect(report.caseResults.every((result) => result.pass)).toBe(true);
  });

  it("calibrates readiness from a benchmark report", () => {
    const report: MemorySemanticBenchmarkReport = {
      benchmarkCriteria: [],
      caseResults: [
        {
          benchmarkCase: {} as never,
          actual: { candidateCount: 1, categoryCounts: {}, candidates: [] },
          matchedCandidateIds: ["one"],
          issues: [],
          pass: true,
        },
        {
          benchmarkCase: {} as never,
          actual: { candidateCount: 1, categoryCounts: {}, candidates: [] },
          matchedCandidateIds: [],
          issues: [
            {
              severity: "blocking",
              code: "missing_candidate",
              message: "missing required candidate",
            },
          ],
          pass: false,
        },
      ],
      readiness: {
        blockingIssueCount: 1,
        minorIssueCount: 0,
        readyForRuntimeCutover: false,
      },
    };

    const calibration = evaluateMemorySemanticCalibration({
      report,
      thresholds: {
        minPassingCaseRate: 0.75,
        maxBlockingIssues: 0,
        maxMinorIssues: 0,
      },
    });

    expect(calibration.ready).toBe(false);
    expect(calibration.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("blocking issue count 1 exceeds threshold 0"),
      ]),
    );
  });
});
