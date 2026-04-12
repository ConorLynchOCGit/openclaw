import { describe, expect, it } from "vitest";
import { MEMORY_SEMANTIC_GOLD_CORPUS } from "./memory-semantic-gold-corpus.js";

describe("memory semantic gold corpus", () => {
  it("covers both lanes, all major durable categories, and explicit omissions", () => {
    expect(MEMORY_SEMANTIC_GOLD_CORPUS.length).toBeGreaterThanOrEqual(6);

    const lanes = new Set(MEMORY_SEMANTIC_GOLD_CORPUS.map((entry) => entry.lane));
    expect(lanes).toEqual(new Set(["document_ingestion", "ordinary_turn_capture"]));

    const categories = new Set(
      MEMORY_SEMANTIC_GOLD_CORPUS.flatMap((entry) =>
        entry.expected.requiredCandidates.map((candidate) => candidate.category),
      ),
    );
    expect(categories).toEqual(
      new Set([
        "response_style",
        "project_fact",
        "project_rule",
        "recurring_procedure",
        "workflow_improvement",
        "reference_routing",
      ]),
    );

    expect(
      MEMORY_SEMANTIC_GOLD_CORPUS.some((entry) => entry.expected.forbiddenCandidates.length > 0),
    ).toBe(true);
  });

  it("keeps the real live document benchmark in the corpus", () => {
    expect(MEMORY_SEMANTIC_GOLD_CORPUS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "real_slice_workflow_doc",
          source: expect.objectContaining({
            kind: "document",
            path: "docs/help/slice-workflow.md",
          }),
          expected: expect.objectContaining({
            categoryMinimums: expect.objectContaining({
              recurring_procedure: expect.any(Number),
              workflow_improvement: expect.any(Number),
              reference_routing: expect.any(Number),
            }),
          }),
        }),
      ]),
    );
  });
});
