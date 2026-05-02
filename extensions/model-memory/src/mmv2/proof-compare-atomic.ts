import type { AtomicExtractionBatch, SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  matchesSubset,
  normalizeComparisonText,
  resolveSegmentText,
  normalizedTextIncludes,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2AtomicExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

function matchesAtomicPayload(
  candidate: AtomicExtractionBatch["atomic_candidates"][number],
  expected: MmV2AtomicExpectation,
): boolean {
  if (expected.payloadSubset === undefined) {
    return true;
  }
  if (matchesSubset(candidate.payload, expected.payloadSubset)) {
    return true;
  }
  if (
    candidate.kind === "directive" &&
    expected.payloadSubset &&
    typeof expected.payloadSubset === "object" &&
    !Array.isArray(expected.payloadSubset)
  ) {
    const payload = candidate.payload as Record<string, unknown>;
    const expectedAction = expected.payloadSubset.action;
    const expectedTrigger = expected.payloadSubset.trigger;
    const actionMatches =
      typeof expectedAction !== "string" ||
      (typeof payload.action === "string" &&
        normalizedTextIncludes(payload.action, expectedAction));
    const triggerMatches =
      typeof expectedTrigger !== "string" ||
      (typeof payload.trigger === "string" &&
        normalizedTextIncludes(payload.trigger, expectedTrigger));
    const remainingSubset = Object.fromEntries(
      Object.entries(expected.payloadSubset).filter(
        ([key]) => key !== "action" && key !== "trigger",
      ),
    );
    return actionMatches && triggerMatches && matchesSubset(candidate.payload, remainingSubset);
  }
  if (
    candidate.kind === "source_ref" &&
    expected.payloadSubset &&
    typeof expected.payloadSubset === "object" &&
    !Array.isArray(expected.payloadSubset)
  ) {
    const payload = candidate.payload as Record<string, unknown>;
    if (
      typeof expected.payloadSubset.locator === "string" &&
      payload.locator === expected.payloadSubset.locator
    ) {
      const remainingSubset = Object.fromEntries(
        Object.entries(expected.payloadSubset).filter(([key]) => key !== "locator"),
      );
      return matchesSubset(candidate.payload, remainingSubset);
    }
  }
  return false;
}

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
      (expected.sourceSegmentTextIncludes === undefined ||
        candidate.sourceSegmentText.includes(expected.sourceSegmentTextIncludes)) &&
      (expected.evidenceQuote === undefined ||
        normalizeComparisonText(candidate.evidence_quote) ===
          normalizeComparisonText(expected.evidenceQuote)) &&
      (expected.kind === undefined || candidate.kind === expected.kind) &&
      (expected.normalizedStatement === undefined ||
        normalizedTextIncludes(candidate.normalized_statement, expected.normalizedStatement)) &&
      (expected.minConfidence === undefined || candidate.confidence >= expected.minConfidence) &&
      matchesAtomicPayload(candidate, expected),
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
