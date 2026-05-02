import type { AdmissionDecisionBatch, CanonicalCandidateBatch } from "./contracts.ts";
import {
  compareExpectedCollection,
  includesAll,
  normalizedTextIncludes,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2AdmissionExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

export function compareAdmissionPhase(
  admission: AdmissionDecisionBatch,
  canonicalization: CanonicalCandidateBatch,
  expectation?: MmV2PhaseExpectation<MmV2AdmissionExpectation>,
): MmV2PhaseComparisonResult {
  const canonicalById = new Map(
    canonicalization.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return compareExpectedCollection({
    phase: "admission",
    mode: expectation?.mode ?? "bounded",
    actual: admission.decisions,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (decision, expected) => {
      const canonicalText = canonicalById.get(decision.candidate_id)?.canonical_text ?? "";
      return (
        (expected.canonicalTextIncludes === undefined ||
          normalizedTextIncludes(canonicalText, expected.canonicalTextIncludes)) &&
        (expected.decision === undefined || decision.decision === expected.decision) &&
        (expected.requiresReconciliation === undefined ||
          decision.requires_reconciliation === expected.requiresReconciliation) &&
        (expected.reasonCodesInclude === undefined ||
          includesAll(decision.reason_codes, expected.reasonCodesInclude)) &&
        (expected.minScores === undefined ||
          Object.entries(expected.minScores).every(
            ([key, value]) =>
              typeof value === "number" &&
              decision.scores[key as keyof typeof decision.scores] >= value,
          ))
      );
    },
    describeActual: (actualItem) => ({
      candidate_id: actualItem.candidate_id,
      decision: actualItem.decision,
      requires_reconciliation: actualItem.requires_reconciliation,
      reason_codes: actualItem.reason_codes,
      scores: actualItem.scores,
    }),
    describeExpected: (expected) => expected,
  });
}
