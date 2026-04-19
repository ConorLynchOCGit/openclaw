import type { SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2PhaseExpectation, MmV2SegmentExpectation } from "./proof-corpus.ts";

export function compareSegmentationPhase(
  segmented: SegmentedIngestEvent,
  expectation?: MmV2PhaseExpectation<MmV2SegmentExpectation>,
): MmV2PhaseComparisonResult {
  return compareExpectedCollection({
    phase: "segmentation",
    mode: expectation?.mode ?? "bounded",
    actual: segmented.segments,
    expected: expectation?.items ?? [],
    exactCount: expectation?.exactCount,
    matches: (actual, expected) =>
      (expected.exactText === undefined || actual.text === expected.exactText) &&
      (expected.textIncludes === undefined || actual.text.includes(expected.textIncludes)) &&
      (expected.detectedShape === undefined || actual.detected_shape === expected.detectedShape) &&
      (expected.startChar === undefined || actual.start_char === expected.startChar) &&
      (expected.endChar === undefined || actual.end_char === expected.endChar) &&
      (expected.localContextBeforeIncludes === undefined ||
        actual.local_context_before.includes(expected.localContextBeforeIncludes)) &&
      (expected.localContextAfterIncludes === undefined ||
        actual.local_context_after.includes(expected.localContextAfterIncludes)),
    describeActual: (actual) => ({
      text: actual.text,
      detected_shape: actual.detected_shape,
      start_char: actual.start_char,
      end_char: actual.end_char,
    }),
    describeExpected: (expected) => expected,
  });
}
