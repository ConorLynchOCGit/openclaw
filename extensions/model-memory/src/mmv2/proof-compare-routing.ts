import type { CaptureRoutingBatch, SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  resolveSegmentText,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2PhaseExpectation, MmV2RoutingExpectation } from "./proof-corpus.ts";

export function compareRoutingPhase(
  routing: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
  expectation?: MmV2PhaseExpectation<MmV2RoutingExpectation>,
): MmV2PhaseComparisonResult {
  const actual = routing.routing_decisions.map((decision) => ({
    ...decision,
    segmentText: resolveSegmentText(segmented, decision.segment_id) ?? "",
  }));
  return compareExpectedCollection({
    phase: "routing",
    mode: expectation?.mode ?? "bounded",
    actual,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (candidate, expected) => {
      const expectedTemporaryAtomic = Boolean(
        expected.route === "atomic_candidate" &&
        expected.reasonCodesInclude?.includes("temporary_context"),
      );
      const directionallyCorrectTemporaryIgnore =
        expectedTemporaryAtomic &&
        candidate.route === "ignore" &&
        candidate.reason_codes.includes("temporary_context");

      return (
        (expected.segmentTextIncludes === undefined ||
          candidate.segmentText.includes(expected.segmentTextIncludes)) &&
        (expected.route === undefined ||
          candidate.route === expected.route ||
          directionallyCorrectTemporaryIgnore) &&
        (expected.evidenceQuote === undefined ||
          candidate.evidence_quote === expected.evidenceQuote) &&
        (expected.minConfidence === undefined || candidate.confidence >= expected.minConfidence) &&
        (expected.reasonCodesInclude === undefined ||
          expected.reasonCodesInclude.every((code) => candidate.reason_codes.includes(code)))
      );
    },
    describeActual: (actualItem) => ({
      segmentText: actualItem.segmentText,
      route: actualItem.route,
      reason_codes: actualItem.reason_codes,
      evidence_quote: actualItem.evidence_quote,
      confidence: actualItem.confidence,
    }),
    describeExpected: (expected) => expected,
  });
}
