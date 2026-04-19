import { describe, expect, it } from "vitest";
import { MMV2_DOCUMENT_PROOF_CASES } from "./proof-corpus.ts";

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
});
