import type { CompositeExtractionBatch, SegmentedIngestEvent } from "./contracts.ts";
import {
  compareExpectedCollection,
  normalizeComparisonText,
  normalizedTextIncludes,
  resolveSegmentText,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2CompositeExpectation, MmV2PhaseExpectation } from "./proof-corpus.ts";

function hasExplicitHeading(sourceText: string): boolean {
  const firstLine = sourceText.split("\n", 1)[0]?.trim() ?? "";
  return firstLine.length > 0 && !/^\d+[.)]\s/u.test(firstLine) && !/^[-*•]\s/u.test(firstLine);
}

function matchesComponentEvidence(
  component: { evidence_quote: string; content: string },
  expectedQuote: string,
): boolean {
  return (
    normalizedTextIncludes(component.evidence_quote, expectedQuote) ||
    normalizedTextIncludes(component.content, expectedQuote)
  );
}

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
      (expected.sourceSegmentTextIncludes === undefined ||
        candidate.sourceSegmentText.includes(expected.sourceSegmentTextIncludes)) &&
      (expected.evidenceQuote === undefined ||
        normalizeComparisonText(candidate.evidence_quote) ===
          normalizeComparisonText(expected.evidenceQuote)) &&
      (expected.artifactType === undefined || candidate.artifact_type === expected.artifactType) &&
      (expected.title === undefined ||
        !hasExplicitHeading(candidate.sourceSegmentText) ||
        candidate.title === expected.title) &&
      (expected.summaryIncludes === undefined ||
        normalizeComparisonText(candidate.summary).includes(
          normalizeComparisonText(expected.summaryIncludes),
        )) &&
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
              matchesComponentEvidence(component, quote) && component.promotion === "embedded_only",
          ),
        )) &&
      (expected.promotedEvidenceQuotes === undefined ||
        expected.promotedEvidenceQuotes.every((quote) =>
          candidate.components.some(
            (component) =>
              matchesComponentEvidence(component, quote) &&
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
        content: component.content,
        role: component.role,
        promotion: component.promotion,
      })),
    }),
    describeExpected: (expected) => expected,
  });
}
