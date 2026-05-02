import type { SegmentedIngestEvent } from "./contracts.ts";

export type MmV2PhaseName =
  | "segmentation"
  | "routing"
  | "atomic"
  | "composite"
  | "suppression"
  | "canonicalization"
  | "admission"
  | "reconciliation"
  | "recording"
  | "audit";

export type MmV2PhaseMismatch = {
  phase: MmV2PhaseName;
  code: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

export type MmV2PhaseComparisonResult = {
  phase: MmV2PhaseName;
  pass: boolean;
  actualCount?: number;
  expectedCount?: number;
  mismatches: MmV2PhaseMismatch[];
};

export type MmV2ExpectationMode = "strict" | "bounded";

export function createPhaseMismatch(
  phase: MmV2PhaseName,
  code: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): MmV2PhaseMismatch {
  return {
    phase,
    code,
    message,
    expected,
    actual,
  };
}

export function finalizePhaseResult(input: {
  phase: MmV2PhaseName;
  mismatches: MmV2PhaseMismatch[];
  actualCount?: number;
  expectedCount?: number;
}): MmV2PhaseComparisonResult {
  return {
    phase: input.phase,
    pass: input.mismatches.length === 0,
    actualCount: input.actualCount,
    expectedCount: input.expectedCount,
    mismatches: input.mismatches,
  };
}

export function includesAll<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return expected.every((value) => actual.includes(value));
}

export function stripOrderedListPrefix(value: string): string {
  return value.replace(/^\s*\d+[.)]\s*/u, "").trim();
}

export function normalizeComparisonText(value: string): string {
  return stripOrderedListPrefix(value)
    .toLowerCase()
    .replace(/[_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s/]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizedTextIncludes(actual: string, expected: string): boolean {
  const normalizedActual = normalizeComparisonText(actual);
  const normalizedExpected = normalizeComparisonText(expected);
  if (!normalizedExpected) {
    return true;
  }
  const compactActual = normalizedActual.replace(/\s+/gu, "");
  const compactExpected = normalizedExpected.replace(/\s+/gu, "");
  if (
    normalizedActual === normalizedExpected ||
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual) ||
    compactActual === compactExpected ||
    compactActual.includes(compactExpected) ||
    compactExpected.includes(compactActual)
  ) {
    return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function matchesSubset(actual: unknown, expectedSubset: unknown): boolean {
  if (expectedSubset === undefined) {
    return true;
  }
  if (Array.isArray(expectedSubset)) {
    return (
      Array.isArray(actual) &&
      expectedSubset.every((item) => actual.some((candidate) => matchesSubset(candidate, item)))
    );
  }
  if (isPlainObject(expectedSubset)) {
    if (!isPlainObject(actual)) {
      return false;
    }
    return Object.entries(expectedSubset).every(([key, value]) =>
      matchesSubset(actual[key], value),
    );
  }
  return Object.is(actual, expectedSubset);
}

export function resolveSegmentText(
  segmented: SegmentedIngestEvent,
  segmentId: string,
): string | undefined {
  return segmented.segments.find((segment) => segment.segment_id === segmentId)?.text;
}

export function compareExpectedCollection<TActual, TExpected>(input: {
  phase: MmV2PhaseName;
  mode: MmV2ExpectationMode;
  actual: TActual[];
  expected: TExpected[];
  exactCount?: number;
  matches: (actual: TActual, expected: TExpected) => boolean;
  describeActual: (actual: TActual) => unknown;
  describeExpected: (expected: TExpected) => unknown;
}): MmV2PhaseComparisonResult {
  const mismatches: MmV2PhaseMismatch[] = [];
  const usedActualIndexes = new Set<number>();

  for (const expectedItem of input.expected) {
    const actualIndex = input.actual.findIndex(
      (actualItem, index) =>
        !usedActualIndexes.has(index) && input.matches(actualItem, expectedItem),
    );
    if (actualIndex === -1) {
      mismatches.push(
        createPhaseMismatch(
          input.phase,
          "missing_expected_item",
          `${input.phase} output did not contain an expected item`,
          input.describeExpected(expectedItem),
        ),
      );
      continue;
    }
    usedActualIndexes.add(actualIndex);
  }

  if (input.mode === "strict") {
    input.actual.forEach((actualItem, index) => {
      if (!usedActualIndexes.has(index)) {
        mismatches.push(
          createPhaseMismatch(
            input.phase,
            "unexpected_actual_item",
            `${input.phase} output contained an unexpected item`,
            undefined,
            input.describeActual(actualItem),
          ),
        );
      }
    });
  }

  const expectedCount =
    input.exactCount ?? (input.mode === "strict" ? input.expected.length : undefined);
  if (expectedCount !== undefined && input.actual.length !== expectedCount) {
    mismatches.push(
      createPhaseMismatch(
        input.phase,
        "count_mismatch",
        `${input.phase} count mismatch`,
        { expectedCount },
        { actualCount: input.actual.length },
      ),
    );
  }

  return finalizePhaseResult({
    phase: input.phase,
    mismatches,
    actualCount: input.actual.length,
    expectedCount,
  });
}
