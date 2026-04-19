import type { AtomicExtractionBatch, SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  matchesSubset,
  resolveSegmentText,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2AtomicExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

export function compareAtomicPhase(
  atomic: AtomicExtractionBatch,
  segmented: SegmentedIngestEvent,
  expectation?: MmV2PhaseExpectation<MmV2AtomicExpectation>,
): MmV2PhaseComparisonResult {
  const actual = atomic.atomic_candidates.map((candidate) => ({
    ...candidate,
    sourceSegmentText: resolveSegmentText(segmented, candidate.source_segment_id) ?? "",
  }));
  return compareExpectedCollection({
    phase: "atomic",
    mode: expectation?.mode ?? "bounded",
    actual,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (candidate, expected) =>
      (expected.candidateId === undefined || candidate.candidate_id === expected.candidateId) &&
      (expected.sourceSegmentTextIncludes === undefined ||
        candidate.sourceSegmentText.includes(expected.sourceSegmentTextIncludes)) &&
      (expected.evidenceQuote === undefined ||
        candidate.evidence_quote === expected.evidenceQuote) &&
      (expected.kind === undefined || candidate.kind === expected.kind) &&
      (expected.normalizedStatement === undefined ||
        candidate.normalized_statement === expected.normalizedStatement) &&
      (expected.minConfidence === undefined || candidate.confidence >= expected.minConfidence) &&
      matchesSubset(candidate.payload, expected.payloadSubset),
    describeActual: (actualItem) => ({
      candidate_id: actualItem.candidate_id,
      sourceSegmentText: actualItem.sourceSegmentText,
      evidence_quote: actualItem.evidence_quote,
      kind: actualItem.kind,
      normalized_statement: actualItem.normalized_statement,
      payload: actualItem.payload,
    }),
    describeExpected: (expected) => expected,
  });
}
