import { describe, expect, it } from "vitest";
import { MMV2_DOCUMENT_PROOF_CASES, MMV2_ORDINARY_TURN_PROOF_CASES } from "./proof-corpus.ts";

describe("mmv2/proof-corpus", () => {
  it("defines per-phase expectations instead of final-output-only assertions", () => {
    const preferenceCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-001-preference-claim",
    );

    expect(preferenceCase).toBeDefined();
    expect(preferenceCase?.expected.segmentation?.items[0]).toMatchObject({
      exactText: "I prefer concise answers.",
      detectedShape: "paragraph",
    });
    expect(preferenceCase?.expected.routing?.items[0]).toMatchObject({
      segmentTextIncludes: "I prefer concise answers.",
      route: "atomic_candidate",
    });
    expect(preferenceCase?.expected.canonicalization?.items[0]).toMatchObject({
      canonicalTextIncludes: "prefers concise answers",
      kind: "claim",
    });
  });

  it("includes seeded-neighbor reconciliation cases for duplicate, supersede, merge, and conflict paths", () => {
    const duplicateCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-004-duplicate-seeded",
    );
    const preferenceChangeCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-005-preference-change-seeded",
    );
    const sourceRefMergeCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-006-source-ref-merge-seeded",
    );
    const conflictCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-007-scoped-conflict-seeded",
    );

    expect(duplicateCase?.seededNeighborsByCandidateId?.["candidate-duplicate-001"]).toHaveLength(
      1,
    );
    expect(preferenceChangeCase?.expected.reconciliation?.items[0]).toMatchObject({
      decision: "supersede_existing",
      supersedesMemoryIdsInclude: ["existing-pref-002"],
    });
    expect(sourceRefMergeCase?.expected.reconciliation?.items[0]).toMatchObject({
      decision: "merge_with_existing",
      targetMemoryIdsInclude: ["existing-source-ref-001"],
    });
    expect(conflictCase?.expected.reconciliation?.items[0]).toMatchObject({
      decision: "record_as_conflict",
      conflictType: "scope_narrowing",
    });
  });

  it("includes harder corpus cases with explicit write-simulation expectations", () => {
    const formattingDirectiveCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-008-formatting-directive",
    );
    const scopedPreferenceCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-012-scoped-preference-change",
    );
    const nearDuplicateSourceRefCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-013-near-duplicate-source-ref-conflict",
    );

    expect(formattingDirectiveCase?.expected.atomic?.items).toEqual([
      expect.objectContaining({ kind: "directive" }),
    ]);
    expect(scopedPreferenceCase?.expected.writeSimulation).toMatchObject({
      realisticDurableMemoryCount: 1,
      overstatementCount: 0,
    });
    expect(nearDuplicateSourceRefCase?.expected.writeSimulation?.candidates[0]).toMatchObject({
      disposition: "create_conflict_record",
      overstatesWrite: true,
    });
  });

  it("includes ordinary-turn evaluation-only coverage for core memory classes", () => {
    expect(MMV2_ORDINARY_TURN_PROOF_CASES.map((proofCase) => proofCase.id)).toEqual([
      "mmv2-turn-001-preference-claim",
      "mmv2-turn-002-durable-directive",
      "mmv2-turn-003-project-fact",
      "mmv2-turn-004-correction-supersede",
      "mmv2-turn-005-temporary-session-only-reject",
      "mmv2-turn-006-explicit-no-store-privacy-reject",
      "mmv2-turn-007-workspace-scoped-preference",
      "mmv2-turn-008-duplicate-prevention",
      "mmv2-turn-009-source-ref-merge",
      "mmv2-turn-010-scoped-conflict",
      "mmv2-turn-011-near-source-ref-conflict",
    ]);
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.every((proofCase) => proofCase.sourceKind === "ordinary_turn"),
    ).toBe(true);
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-004-correction-supersede",
      )?.expected.reconciliation?.items[0],
    ).toMatchObject({
      decision: "supersede_existing",
      supersedesMemoryIdsInclude: ["existing-pref-002"],
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-005-temporary-session-only-reject",
      )?.expected.admission?.items[0],
    ).toMatchObject({
      decision: "reject",
      reasonCodesInclude: ["temporary"],
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-006-explicit-no-store-privacy-reject",
      )?.expected.admission?.items[0],
    ).toMatchObject({
      decision: "reject",
      reasonCodesInclude: ["explicit_no_store", "privacy_opt_out", "sensitive"],
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-007-workspace-scoped-preference",
      )?.expected.reconciliation?.items[0],
    ).toMatchObject({
      decision: "insert_new",
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-008-duplicate-prevention",
      )?.expected.writeSimulation?.candidates[0],
    ).toMatchObject({
      disposition: "keep_existing_noop",
      createsNewDurableMemory: false,
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-009-source-ref-merge",
      )?.expected.reconciliation?.items[0],
    ).toMatchObject({
      decision: "merge_with_existing",
      targetMemoryIdsInclude: ["existing-source-ref-001"],
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-010-scoped-conflict",
      )?.expected.reconciliation?.items[0],
    ).toMatchObject({
      decision: "record_as_conflict",
      conflictType: "scope_narrowing",
    });
    expect(
      MMV2_ORDINARY_TURN_PROOF_CASES.find(
        (proofCase) => proofCase.id === "mmv2-turn-011-near-source-ref-conflict",
      )?.metadata?.tags,
    ).toContain("no-fuzzy-supersession");
    for (const proofCase of MMV2_ORDINARY_TURN_PROOF_CASES) {
      const admittedCandidateIds = new Set(
        proofCase.scripted.admission
          .filter((decision) => decision.decision === "admit")
          .map((decision) => decision.candidate_id),
      );
      for (const candidate of proofCase.scripted.canonicalization) {
        if (admittedCandidateIds.has(candidate.candidate_id)) {
          expect(candidate.sourceEvidenceQuote, proofCase.id).toBeTruthy();
        }
      }
    }
  });

  it("does not encode non-composite single-span cases that expect multiple top-level atomic memories", () => {
    for (const proofCase of MMV2_DOCUMENT_PROOF_CASES) {
      if (proofCase.scripted.composite.length > 0) {
        continue;
      }

      const candidatesBySourceSegment = new Map<string, number>();
      for (const candidate of proofCase.scripted.atomic) {
        const nextCount =
          (candidatesBySourceSegment.get(candidate.sourceSegmentTextIncludes) ?? 0) + 1;
        candidatesBySourceSegment.set(candidate.sourceSegmentTextIncludes, nextCount);
      }

      for (const [sourceSegmentTextIncludes, count] of candidatesBySourceSegment.entries()) {
        expect(
          count,
          `proof case ${proofCase.id} encodes ${count} atomic outputs for one routed span: ${sourceSegmentTextIncludes}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
