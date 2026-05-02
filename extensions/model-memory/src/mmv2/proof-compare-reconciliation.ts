import type { CanonicalCandidateBatch, ReconciliationDecision } from "./contracts.ts";
import {
  compareExpectedCollection,
  includesAll,
  normalizedTextIncludes,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2PhaseExpectation, MmV2ReconciliationExpectation } from "./proof-corpus.ts";

export function compareReconciliationPhase(
  reconciliation: ReconciliationDecision[],
  canonicalization: CanonicalCandidateBatch,
  expectation?: MmV2PhaseExpectation<MmV2ReconciliationExpectation>,
): MmV2PhaseComparisonResult {
  const canonicalById = new Map(
    canonicalization.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return compareExpectedCollection({
    phase: "reconciliation",
    mode: expectation?.mode ?? "bounded",
    actual: reconciliation,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (decision, expected) => {
      const canonicalText = canonicalById.get(decision.candidate_id)?.canonical_text ?? "";
      return (
        (expected.candidateCanonicalTextIncludes === undefined ||
          normalizedTextIncludes(canonicalText, expected.candidateCanonicalTextIncludes)) &&
        (expected.decision === undefined || decision.decision === expected.decision) &&
        (expected.conflictType === undefined || decision.conflict_type === expected.conflictType) &&
        (expected.targetMemoryIdsInclude === undefined ||
          includesAll(decision.target_memory_ids, expected.targetMemoryIdsInclude)) &&
        (expected.supersedesMemoryIdsInclude === undefined ||
          includesAll(decision.supersedes_memory_ids, expected.supersedesMemoryIdsInclude)) &&
        (expected.rationaleIncludes === undefined ||
          normalizedTextIncludes(decision.rationale, expected.rationaleIncludes))
      );
    },
    describeActual: (actualItem) => ({
      candidate_id: actualItem.candidate_id,
      decision: actualItem.decision,
      conflict_type: actualItem.conflict_type,
      target_memory_ids: actualItem.target_memory_ids,
      supersedes_memory_ids: actualItem.supersedes_memory_ids,
      rationale: actualItem.rationale,
    }),
    describeExpected: (expected) => expected,
  });
}
