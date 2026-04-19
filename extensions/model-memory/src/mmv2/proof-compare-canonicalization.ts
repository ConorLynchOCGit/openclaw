import type { CanonicalCandidateBatch } from "./contracts.ts";
import {
  compareExpectedCollection,
  matchesSubset,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2CanonicalExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

export function compareCanonicalizationPhase(
  canonicalization: CanonicalCandidateBatch,
  expectation?: MmV2PhaseExpectation<MmV2CanonicalExpectation>,
): MmV2PhaseComparisonResult {
  return compareExpectedCollection({
    phase: "canonicalization",
    mode: expectation?.mode ?? "bounded",
    actual: canonicalization.canonical_candidates,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (candidate, expected) =>
      (expected.candidateId === undefined || candidate.candidate_id === expected.candidateId) &&
      (expected.canonicalTextIncludes === undefined ||
        candidate.canonical_text.includes(expected.canonicalTextIncludes)) &&
      (expected.unitType === undefined || candidate.unit_type === expected.unitType) &&
      (expected.kind === undefined || candidate.kind === expected.kind) &&
      (expected.artifactType === undefined || candidate.artifact_type === expected.artifactType) &&
      (expected.promotion === undefined || candidate.promotion === expected.promotion) &&
      (expected.sourceEvidenceQuote === undefined ||
        candidate.source.evidence_quote === expected.sourceEvidenceQuote) &&
      matchesSubset(candidate.payload, expected.payloadSubset),
    describeActual: (actualItem) => ({
      candidate_id: actualItem.candidate_id,
      canonical_text: actualItem.canonical_text,
      unit_type: actualItem.unit_type,
      kind: actualItem.kind,
      artifact_type: actualItem.artifact_type,
      source_evidence_quote: actualItem.source.evidence_quote,
      payload: actualItem.payload,
    }),
    describeExpected: (expected) => expected,
  });
}
