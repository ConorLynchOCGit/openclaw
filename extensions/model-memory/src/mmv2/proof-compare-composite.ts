import type { CompositeExtractionBatch, SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  resolveSegmentText,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2CompositeExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

export function compareCompositePhase(
  composite: CompositeExtractionBatch,
  segmented: SegmentedIngestEvent,
  expectation?: MmV2PhaseExpectation<MmV2CompositeExpectation>,
): MmV2PhaseComparisonResult {
  const actual = composite.composite_candidates.map((candidate) => ({
    ...candidate,
    sourceSegmentText: resolveSegmentText(segmented, candidate.source_segment_id) ?? "",
  }));
  return compareExpectedCollection({
    phase: "composite",
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
      (expected.artifactType === undefined || candidate.artifact_type === expected.artifactType) &&
      (expected.title === undefined || candidate.title === expected.title) &&
      (expected.summaryIncludes === undefined ||
        candidate.summary.includes(expected.summaryIncludes)) &&
      (expected.componentCount === undefined ||
        candidate.components.length === expected.componentCount) &&
      (expected.componentRolesInclude === undefined ||
        expected.componentRolesInclude.every((role) =>
          candidate.components.some((component) => component.role === role),
        )) &&
      (expected.embeddedOnlyEvidenceQuotes === undefined ||
        expected.embeddedOnlyEvidenceQuotes.every((quote) =>
          candidate.components.some(
            (component) =>
              component.evidence_quote === quote && component.promotion === "embedded_only",
          ),
        )) &&
      (expected.promotedEvidenceQuotes === undefined ||
        expected.promotedEvidenceQuotes.every((quote) =>
          candidate.components.some(
            (component) =>
              component.evidence_quote === quote &&
              (component.promotion === "global" || component.promotion === "both"),
          ),
        )),
    describeActual: (actualItem) => ({
      candidate_id: actualItem.candidate_id,
      sourceSegmentText: actualItem.sourceSegmentText,
      artifact_type: actualItem.artifact_type,
      title: actualItem.title,
      summary: actualItem.summary,
      components: actualItem.components.map((component) => ({
        evidence_quote: component.evidence_quote,
        role: component.role,
        promotion: component.promotion,
      })),
    }),
    describeExpected: (expected) => expected,
  });
}
