import type { RuntimeComparisonResult } from "./runtime-comparison.ts";

export function renderRuntimeComparisonReport(comparison: RuntimeComparisonResult): string {
  return [
    `matched identities: ${comparison.matchedIdentityKeys.length}`,
    `model-only identities: ${comparison.modelOnlyIdentityKeys.length}`,
    `legacy-only identities: ${comparison.legacyOnlyIdentityKeys.length}`,
    `duplicate decision delta: ${comparison.duplicateDecisionDelta}`,
    `supersession decision delta: ${comparison.supersessionDecisionDelta}`,
    `omission divergence: ${comparison.omissionDivergence ? "yes" : "no"}`,
  ].join("\n");
}
