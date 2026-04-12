import { describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";
import {
  summarizeHeuristicMemoryBlock,
  summarizeModelDrivenMemoryBlock,
} from "./memory-semantic-comparison.js";
import { createRuleBasedTestMemorySemanticInterpreter } from "./memory-semantic-interpreter.test-helpers.js";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
  type NormalizedMemoryBlock,
  type NormalizedTranscriptContextEntry,
} from "./memory-source-normalization.js";

const config = resolveMemoryMiddlewareConfig({});
const interpreter = createRuleBasedTestMemorySemanticInterpreter();

function selectPrimaryBlock(blocks: NormalizedMemoryBlock[]): NormalizedMemoryBlock {
  expect(blocks.length).toBeGreaterThan(0);
  return [...blocks].sort((left, right) => {
    if (left.listKind !== right.listKind) {
      return left.listKind === "none" ? 1 : -1;
    }
    if (right.blockText.length !== left.blockText.length) {
      return right.blockText.length - left.blockText.length;
    }
    return (left.provenance.lineStart ?? 0) - (right.provenance.lineStart ?? 0);
  })[0]!;
}

function createDocumentBlock(params: {
  sourceId: string;
  path: string;
  content: string;
  projectScope?: string;
}): NormalizedMemoryBlock {
  return selectPrimaryBlock(
    normalizeDocumentMemorySource({
      source: {
        kind: "document",
        sourceId: params.sourceId,
        path: params.path,
        sourceClass: "benchmark",
      },
      content: params.content,
      maxBlockChars: 2000,
      ...(params.projectScope ? { projectScope: params.projectScope } : {}),
    }),
  );
}

function createTranscriptBlock(params: {
  sourceId: string;
  text: string;
  parentContext?: NormalizedTranscriptContextEntry[];
}): NormalizedMemoryBlock {
  return selectPrimaryBlock(
    normalizeTranscriptMemorySource({
      source: {
        kind: "transcript",
        sourceId: params.sourceId,
        sessionKey: "comparison-session",
      },
      text: params.text,
      parentContext: params.parentContext ?? [],
      maxSegments: 1,
      timestamp: "2026-04-12T00:00:00.000Z",
    }),
  );
}

describe("memory semantic comparison", () => {
  it("keeps model-driven parity across equivalent document and transcript blocks", async () => {
    const documentProjectFact = createDocumentBlock({
      sourceId: "doc-project-fact",
      path: "benchmarks/project-fact.md",
      content: [
        "# Atlas Forge Operating Notes",
        "",
        "## Branches",
        "Default branch is atlas-main.",
      ].join("\n"),
      projectScope: "atlas forge",
    });
    const transcriptProjectFact = createTranscriptBlock({
      sourceId: "turn-project-fact",
      text: "Default branch is atlas-main.",
      parentContext: [
        {
          role: "system",
          text: "For project atlas forge, branch settings are under review.",
        },
      ],
    });

    const documentPreference = createDocumentBlock({
      sourceId: "doc-preference",
      path: "benchmarks/preference.md",
      content: ["# Personal defaults", "", "can you avoid jargon"].join("\n"),
    });
    const transcriptPreference = createTranscriptBlock({
      sourceId: "turn-preference",
      text: "can you avoid jargon",
    });

    const documentProcedure = createDocumentBlock({
      sourceId: "doc-procedure",
      path: "benchmarks/procedure.md",
      content: [
        "# Rollout",
        "",
        "## Release Evidence Handoff Checklist",
        "1. Capture the signed evidence bundle.",
        "2. Post the handoff note in the audit channel.",
      ].join("\n"),
    });
    const transcriptProcedure = createTranscriptBlock({
      sourceId: "turn-procedure",
      text: [
        "Release Evidence Handoff Checklist:",
        "1. Capture the signed evidence bundle.",
        "2. Post the handoff note in the audit channel.",
      ].join("\n"),
    });

    const [
      documentProjectFactSummary,
      transcriptProjectFactSummary,
      documentPreferenceSummary,
      transcriptPreferenceSummary,
      documentProcedureSummary,
      transcriptProcedureSummary,
    ] = await Promise.all([
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "document_ingestion",
        block: documentProjectFact,
        interpreter,
      }),
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "ordinary_turn_capture",
        block: transcriptProjectFact,
        interpreter,
      }),
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "document_ingestion",
        block: documentPreference,
        interpreter,
      }),
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "ordinary_turn_capture",
        block: transcriptPreference,
        interpreter,
      }),
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "document_ingestion",
        block: documentProcedure,
        interpreter,
      }),
      summarizeModelDrivenMemoryBlock({
        config,
        lane: "ordinary_turn_capture",
        block: transcriptProcedure,
        interpreter,
      }),
    ]);

    expect(documentProjectFactSummary).toMatchObject({
      category: "project_fact",
      statement: expect.stringContaining("atlas-main"),
    });
    expect(transcriptProjectFactSummary).toMatchObject({
      category: "project_fact",
      statement: expect.stringContaining("atlas-main"),
    });
    expect(documentProjectFactSummary?.statement).toBe(transcriptProjectFactSummary?.statement);

    expect(documentPreferenceSummary).toMatchObject({
      category: "response_style",
      statement: expect.stringContaining("plain English"),
    });
    expect(transcriptPreferenceSummary).toMatchObject({
      category: "response_style",
      statement: expect.stringContaining("plain English"),
    });
    expect(documentPreferenceSummary?.statement).toBe(transcriptPreferenceSummary?.statement);

    expect(documentProcedureSummary).toMatchObject({
      category: "recurring_procedure",
      subject: "Release Evidence Handoff Checklist",
      statement: expect.stringContaining("Capture the signed evidence bundle"),
    });
    expect(transcriptProcedureSummary).toMatchObject({
      category: "recurring_procedure",
      subject: "Release Evidence Handoff Checklist",
      statement: expect.stringContaining("Capture the signed evidence bundle"),
    });
    expect(documentProcedureSummary?.statement).toBe(transcriptProcedureSummary?.statement);
    expect(documentProcedureSummary?.subject).toBe(transcriptProcedureSummary?.subject);
  });

  it("shows the model-first path beating the legacy heuristic path on benchmarked weak cases", async () => {
    const cases = [
      {
        id: "stable_preference_paraphrase",
        lane: "document_ingestion" as const,
        block: createDocumentBlock({
          sourceId: "compare-preference",
          path: "benchmarks/preference.md",
          content: "# Personal defaults\n\ncan you avoid jargon\n",
        }),
        expectedCategory: "response_style",
        expectedStatementIncludes: ["plain English"],
      },
      {
        id: "durable_operator_docs_rule",
        lane: "document_ingestion" as const,
        block: createDocumentBlock({
          sourceId: "compare-docs-rule",
          path: "benchmarks/docs-rule.md",
          content: [
            "# Atlas Forge Operating Notes",
            "",
            "## Docs",
            "Update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
          ].join("\n"),
          projectScope: "atlas forge",
        }),
        expectedCategory: "project_rule",
        expectedStatementIncludes: ["english docs first", "docs i18n"],
      },
      {
        id: "reusable_procedure_pre_proof",
        lane: "document_ingestion" as const,
        block: createDocumentBlock({
          sourceId: "compare-pre-proof",
          path: "benchmarks/pre-proof.md",
          content: [
            "# Slice Landing Workflow",
            "",
            "## Pre-proof gate",
            "- Run the strongest targeted tests for the touched surface.",
            "- Add a broader owned-surface sweep only when the change crosses a shared boundary or the nearby tests are not enough.",
            "- Run the smallest honest validation tier: `pnpm check:fast` for docs/process-only work.",
            "- For the standardized repo-wide tiers, use: `pnpm gate:feature` `pnpm gate:integration` `pnpm gate:production`.",
          ].join("\n"),
        }),
        expectedCategory: "recurring_procedure",
        expectedStatementIncludes: ["strongest targeted tests", "pnpm gate:integration"],
      },
      {
        id: "project_fact_implicit_scope_turn",
        lane: "ordinary_turn_capture" as const,
        block: createTranscriptBlock({
          sourceId: "compare-turn-project-fact",
          text: "Default branch is atlas-main.",
          parentContext: [
            {
              role: "system",
              text: "For project atlas forge, branch settings are under review.",
            },
          ],
        }),
        expectedCategory: "project_fact",
        expectedStatementIncludes: ["atlas-main"],
      },
    ];

    let heuristicMisses = 0;

    for (const benchmarkCase of cases) {
      const [modelSummary, heuristicSummary] = await Promise.all([
        summarizeModelDrivenMemoryBlock({
          config,
          lane: benchmarkCase.lane,
          block: benchmarkCase.block,
          interpreter,
        }),
        summarizeHeuristicMemoryBlock({
          config,
          lane: benchmarkCase.lane,
          block: benchmarkCase.block,
        }),
      ]);

      expect(modelSummary?.category).toBe(benchmarkCase.expectedCategory);
      for (const part of benchmarkCase.expectedStatementIncludes) {
        expect(modelSummary?.statement.toLowerCase()).toContain(part.toLowerCase());
      }

      if (!heuristicSummary) {
        heuristicMisses += 1;
        continue;
      }

      const heuristicMatchedExpected =
        heuristicSummary.category === benchmarkCase.expectedCategory &&
        benchmarkCase.expectedStatementIncludes.every((part) =>
          heuristicSummary.statement.includes(part),
        );
      if (!heuristicMatchedExpected) {
        heuristicMisses += 1;
      }
    }

    expect(heuristicMisses).toBeGreaterThanOrEqual(3);
  });
});
