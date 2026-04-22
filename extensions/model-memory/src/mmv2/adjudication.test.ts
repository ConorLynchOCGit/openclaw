import { describe, expect, it } from "vitest";
import { buildAdjudicationEntries, renderAdjudicationMarkdown } from "./adjudication.ts";
import { MMV2_DOCUMENT_PROOF_CASES } from "./proof-corpus.ts";
import { runMmV2ProofCase } from "./proof-runner.ts";

describe("mmv2/adjudication", () => {
  it("renders failed cases into lightweight adjudication entries with placeholder labels", async () => {
    const proofCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (entry) => entry.id === "mmv2-doc-004-duplicate-seeded",
    )!;
    const result = await runMmV2ProofCase({
      ...proofCase,
      expected: {
        ...proofCase.expected,
        routing: {
          mode: "strict",
          exactCount: 1,
          items: [
            {
              segmentTextIncludes: "I prefer concise answers.",
              route: "composite_candidate",
            },
          ],
        },
      },
    });

    expect(result.pass).toBe(false);
    const entries = buildAdjudicationEntries({
      results: [result],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      caseId: proofCase.id,
      adjudicationLabel: "unreviewed",
    });

    const markdown = renderAdjudicationMarkdown(entries);
    expect(markdown).toContain("# MMV2 Adjudication Review");
    expect(markdown).toContain(proofCase.id);
    expect(markdown).toContain("Adjudication label: unreviewed");
  });
});
