import { describe, expect, it } from "vitest";
import {
  MMV2_DOCUMENT_PROOF_CASES,
  MMV2_ORDINARY_TURN_PROOF_CASES,
  type MmV2DocumentProofCase,
} from "./proof-corpus.ts";
import { runMmV2ProofCase, runMmV2ProofCorpus } from "./proof-runner.ts";

describe("mmv2/proof-runner", () => {
  it("executes the MMV2 proof corpus through ingestDocumentV2Shadow", async () => {
    const result = await runMmV2ProofCorpus(MMV2_DOCUMENT_PROOF_CASES);

    expect(result.summary.totalCases).toBe(MMV2_DOCUMENT_PROOF_CASES.length);
    expect(result.summary.failedCases).toBe(0);
    expect(result.summary.scores.phaseCorrectness.ratio).toBe(1);
    expect(result.summary.scores.writePolicyRealism.ratio).toBe(1);
    expect(result.results.every((caseResult) => caseResult.pass)).toBe(true);
    expect(result.resultsWithRuns.every((caseResult) => caseResult.run !== undefined)).toBe(true);
    expect(
      result.resultsWithRuns.find(
        (caseResult) => caseResult.caseId === "mmv2-doc-005-preference-change-seeded",
      )?.run?.reconciliation[0],
    ).toMatchObject({
      decision: "supersede_existing",
      supersedes_memory_ids: ["existing-pref-002"],
    });
    expect(
      result.results.find((caseResult) => caseResult.caseId === "mmv2-doc-004-duplicate-seeded")
        ?.writeSimulation.candidates[0],
    ).toMatchObject({
      disposition: "keep_existing_noop",
      overstatesWrite: true,
    });
  });

  it("executes ordinary-turn MMV2 coverage through the ordinary-turn core without production writes", async () => {
    const result = await runMmV2ProofCorpus(MMV2_ORDINARY_TURN_PROOF_CASES);

    expect(result.summary.totalCases).toBe(MMV2_ORDINARY_TURN_PROOF_CASES.length);
    expect(result.summary.failedCases).toBe(0);
    expect(result.summary.scores.phaseCorrectness.ratio).toBe(1);
    expect(result.summary.scores.writePolicyRealism.ratio).toBe(1);
    expect(result.results.every((caseResult) => caseResult.pass)).toBe(true);
    expect(
      result.resultsWithRuns.find(
        (caseResult) => caseResult.caseId === "mmv2-turn-004-correction-supersede",
      )?.run?.reconciliation[0],
    ).toMatchObject({
      decision: "supersede_existing",
      supersedes_memory_ids: ["existing-pref-002"],
    });
    expect(
      result.results.find(
        (caseResult) => caseResult.caseId === "mmv2-turn-005-temporary-session-only-reject",
      )?.writeSimulation.candidates[0],
    ).toMatchObject({
      disposition: "reject",
      overstatesWrite: false,
    });
    expect(
      result.results.find(
        (caseResult) => caseResult.caseId === "mmv2-turn-006-explicit-no-store-privacy-reject",
      )?.writeSimulation.candidates[0],
    ).toMatchObject({
      disposition: "reject",
      createsNewDurableMemory: false,
      overstatesWrite: false,
    });
    expect(
      result.resultsWithRuns.find(
        (caseResult) => caseResult.caseId === "mmv2-turn-007-workspace-scoped-preference",
      )?.run?.canonicalization.canonical_candidates[0]?.scope,
    ).toMatchObject({
      project_id: "project-technical-design",
      applies_to: "current_project",
    });
  });

  it("reports phase mismatches at the failing phase instead of collapsing them into one opaque result", async () => {
    const baseCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-001-preference-claim",
    )!;
    const mismatchCase: MmV2DocumentProofCase = {
      ...baseCase,
      id: "mmv2-doc-mismatch-routing",
      expected: {
        ...baseCase.expected,
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
    };

    const result = await runMmV2ProofCase(mismatchCase);

    expect(result.status).toBe("comparison_failed");
    expect(result.failedPhases).toEqual(["routing"]);
    expect(result.failedChecks).toContain("routing");
    expect(
      result.phaseResults.find((phase) => phase.phase === "routing")?.mismatches[0],
    ).toMatchObject({
      phase: "routing",
      code: "missing_expected_item",
    });
  });

  it("continues and classifies invalid scripted cases as execution failures", async () => {
    const invalidCase: MmV2DocumentProofCase = {
      ...MMV2_DOCUMENT_PROOF_CASES[0],
      id: "mmv2-doc-invalid-scripted-case",
      scripted: {
        ...MMV2_DOCUMENT_PROOF_CASES[0].scripted,
        atomic: [
          {
            ...MMV2_DOCUMENT_PROOF_CASES[0].scripted.atomic[0],
            sourceSegmentTextIncludes: "this selector does not exist",
          },
        ],
      },
    };

    const result = await runMmV2ProofCase(invalidCase);

    expect(result.status).toBe("execution_failed");
    expect(result.pass).toBe(false);
    expect(result.error?.message).toContain("Unable to resolve segment by text selector");
  });
});
