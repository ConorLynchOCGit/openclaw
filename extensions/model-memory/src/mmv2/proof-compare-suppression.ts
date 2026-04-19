import type { AtomicExtractionBatch } from "./contracts.ts";
import {
  createPhaseMismatch,
  finalizePhaseResult,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2SuppressionExpectation } from "./proof-corpus.ts";

export function compareSuppressionPhase(
  rawAtomic: AtomicExtractionBatch,
  suppressedAtomic: AtomicExtractionBatch,
  expectation?: MmV2SuppressionExpectation,
): MmV2PhaseComparisonResult {
  const mismatches = [];
  const rawEvidence = rawAtomic.atomic_candidates.map((candidate) => candidate.evidence_quote);
  const keptEvidence = suppressedAtomic.atomic_candidates.map(
    (candidate) => candidate.evidence_quote,
  );
  const suppressedEvidence = rawEvidence.filter((quote) => !keptEvidence.includes(quote));

  if (expectation?.exactCount !== undefined && keptEvidence.length !== expectation.exactCount) {
    mismatches.push(
      createPhaseMismatch(
        "suppression",
        "count_mismatch",
        "Suppressed atomic candidate count did not match expectation.",
        { expectedCount: expectation.exactCount },
        { actualCount: keptEvidence.length },
      ),
    );
  }
  if (expectation?.keptEvidenceQuotes !== undefined) {
    for (const quote of expectation.keptEvidenceQuotes) {
      if (!keptEvidence.includes(quote)) {
        mismatches.push(
          createPhaseMismatch(
            "suppression",
            "missing_kept_quote",
            "Expected kept atomic evidence quote was not present after suppression.",
            quote,
            keptEvidence,
          ),
        );
      }
    }
  }
  if (expectation?.suppressedEvidenceQuotes !== undefined) {
    for (const quote of expectation.suppressedEvidenceQuotes) {
      if (!suppressedEvidence.includes(quote)) {
        mismatches.push(
          createPhaseMismatch(
            "suppression",
            "missing_suppressed_quote",
            "Expected suppressed atomic evidence quote was not removed.",
            quote,
            suppressedEvidence,
          ),
        );
      }
    }
  }

  return finalizePhaseResult({
    phase: "suppression",
    mismatches,
    actualCount: keptEvidence.length,
    expectedCount: expectation?.exactCount,
  });
}
