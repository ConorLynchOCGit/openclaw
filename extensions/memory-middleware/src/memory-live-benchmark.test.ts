import { describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";
import {
  runMemorySemanticGoldCorpusBenchmark,
  type MemorySemanticBenchmarkReport,
} from "./memory-live-benchmark.js";
import { evaluateMemorySemanticCalibration } from "./memory-semantic-calibration.js";
import type { MemorySemanticGoldCase } from "./memory-semantic-gold-corpus.js";
import { createReplayMemorySemanticInterpreter } from "./memory-semantic-interpreter.test-helpers.js";

const config = resolveMemoryMiddlewareConfig({});

describe("memory live benchmark", () => {
  it("evaluates inline gold cases through the cheap replay lane", async () => {
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
          classCounts: { user: 1 },
          compatibilityCategoryCounts: { response_style: 1 },
          requiredObjects: [
            {
              id: "plain",
              canonicalClass: "user",
              kind: "preference",
              compatibilityCategory: "response_style",
              subjectIncludes: ["response language"],
              instructionIncludes: ["plain english"],
              lineStart: 1,
            },
          ],
          forbiddenObjects: [
            {
              reason: "filler should be omitted",
              instructionIncludes: ["remember this later maybe"],
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
          classCounts: { feedback: 1 },
          compatibilityCategoryCounts: { recurring_procedure: 1 },
          requiredObjects: [
            {
              id: "procedure",
              canonicalClass: "feedback",
              kind: "procedure",
              compatibilityCategory: "recurring_procedure",
              procedure: {
                titleIncludes: ["release evidence handoff checklist"],
                stepIncludes: ["signed evidence bundle", "audit channel"],
                exactStepCount: 2,
              },
            },
          ],
          forbiddenObjects: [],
          notes: [],
        },
      },
    ];

    const interpreter = createReplayMemorySemanticInterpreter([
      {
        sourceId: "inline:identity",
        windowTextIncludes: ["plain english please"],
        result: (input) => ({
          action: "capture",
          objects: [
            {
              kind: "preference",
              operation: "capture",
              subject: "response language",
              instruction: "use plain English",
              durability: "durable",
              confidence: "strong",
              rationale: ["replayed preference capture"],
              provenanceSpans: [{ blockIds: input.window.blocks.map((block) => block.id) }],
            },
          ],
        }),
      },
      {
        sourceId: "inline:procedure",
        headingPath: ["Release Evidence Handoff Checklist"],
        result: (input) => ({
          action: "capture",
          objects: [
            {
              kind: "procedure",
              title: "Release Evidence Handoff Checklist",
              steps: [
                "Capture the signed evidence bundle.",
                "Post the handoff note in the audit channel.",
              ],
              durability: "durable",
              confidence: "strong",
              rationale: ["replayed procedure capture"],
              provenanceSpans: [{ blockIds: input.window.blocks.map((block) => block.id) }],
            },
          ],
        }),
      },
    ]);

    const report = await runMemorySemanticGoldCorpusBenchmark({
      config,
      interpreter,
      cases,
    });

    expect(report.readiness.blockingIssueCount).toBe(0);
    expect(report.execution.caseCount).toBe(2);
    expect(report.execution.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.execution.promptVersions.length).toBeGreaterThan(0);
    expect(report.caseResults).toHaveLength(2);
    expect(report.caseResults.every((result) => result.pass)).toBe(true);
  });

  it("surfaces benchmark mismatches from model-owned project-fact outputs", async () => {
    const cases: MemorySemanticGoldCase[] = [
      {
        id: "inline-validator-overreach",
        title: "inline validator overreach",
        lane: "document_ingestion",
        source: {
          kind: "document",
          sourceId: "inline:validator-overreach",
          path: "benchmarks/inline-validator-overreach.md",
          projectId: "atlas-forge",
        },
        content: "# Branches\n\nDefault branch is atlas-main.\n",
        projectScope: "atlas forge",
        expected: {
          exactCount: 1,
          classCounts: { project: 1 },
          compatibilityCategoryCounts: { project_fact: 1 },
          requiredObjects: [
            {
              id: "default_branch",
              canonicalClass: "project",
              kind: "project_fact",
              compatibilityCategory: "project_fact",
              subjectIncludes: ["default branch"],
              valueIncludes: ["atlas-main"],
              forbidEvidencePrefixes: ["deterministic_"],
            },
          ],
          forbiddenObjects: [],
          notes: [],
        },
      },
    ];

    const interpreter = createReplayMemorySemanticInterpreter([
      {
        sourceId: "inline:validator-overreach",
        result: (input) => ({
          action: "capture",
          objects: [
            {
              kind: "project_fact",
              subject: "default branch",
              value: "atlas-main",
              factFieldKey: "default_branch",
              scope: {
                projectScope: "atlas forge",
                contextualDependencies: [],
              },
              durability: "durable",
              confidence: "strong",
              rationale: ["replayed project fact"],
              provenanceSpans: [{ blockIds: input.window.blocks.map((block) => block.id) }],
            },
          ],
        }),
      },
    ]);

    const report = await runMemorySemanticGoldCorpusBenchmark({
      config,
      interpreter,
      cases,
    });

    expect(report.readiness.blockingIssueCount).toBe(0);
    expect(report.caseResults[0]?.issues).toEqual([]);
    expect(report.caseResults[0]?.matchedObjectIds).toEqual(["default_branch"]);
    expect(report.caseResults[0]?.pass).toBe(true);
  });

  it("calibrates readiness from a benchmark report", () => {
    const report: MemorySemanticBenchmarkReport = {
      benchmarkCriteria: [],
      execution: {
        startedAt: "2026-04-12T00:00:00.000Z",
        finishedAt: "2026-04-12T00:00:01.000Z",
        durationMs: 1_000,
        generatedAt: "2026-04-12T00:00:00.000Z",
        caseCount: 2,
        modelIds: ["test/model"],
        promptVersions: ["memory-semantic-v5"],
      },
      caseResults: [
        {
          benchmarkCase: {} as never,
          actual: {
            objectCount: 1,
            classCounts: {},
            compatibilityCategoryCounts: {},
            objects: [],
          },
          matchedObjectIds: ["one"],
          issues: [],
          pass: true,
        },
        {
          benchmarkCase: {} as never,
          actual: {
            objectCount: 1,
            classCounts: {},
            compatibilityCategoryCounts: {},
            objects: [],
          },
          matchedObjectIds: [],
          issues: [
            {
              severity: "blocking",
              code: "missing_candidate",
              message: "missing required object",
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
