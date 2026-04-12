import fs from "node:fs/promises";
import type { MemoryMiddlewareConfig } from "./config.js";
import type { DocumentMemoryIngestionCategory } from "./document-memory-ingestion-types.js";
import {
  MEMORY_SEMANTIC_GOLD_CORPUS,
  type MemorySemanticGoldCase,
  type MemorySemanticGoldExpectedCandidate,
  type MemorySemanticGoldForbiddenCandidate,
} from "./memory-semantic-gold-corpus.js";
import type { MemorySemanticInterpreterPort } from "./memory-semantic-interpretation.js";
import {
  planNormalizedMemoryBlock,
  type PlannedNormalizedMemoryDecision,
} from "./memory-semantic-planner.js";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
  type MemoryProvenanceRegion,
  type NormalizedMemoryBlock,
} from "./memory-source-normalization.js";

export type MemorySemanticBenchmarkIssueSeverity = "blocking" | "minor";

export type MemorySemanticBenchmarkIssue = {
  severity: MemorySemanticBenchmarkIssueSeverity;
  code:
    | "count_mismatch"
    | "category_mismatch"
    | "missing_candidate"
    | "forbidden_capture"
    | "provenance_mismatch"
    | "dedupe_mismatch";
  message: string;
};

export type MemorySemanticBenchmarkCandidateSummary = {
  category: DocumentMemoryIngestionCategory;
  statement: string;
  provenance: MemoryProvenanceRegion;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  duplicateCount: number;
};

export type MemorySemanticBenchmarkCaseResult = {
  benchmarkCase: MemorySemanticGoldCase;
  actual: {
    candidateCount: number;
    categoryCounts: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    candidates: MemorySemanticBenchmarkCandidateSummary[];
  };
  matchedCandidateIds: string[];
  issues: MemorySemanticBenchmarkIssue[];
  pass: boolean;
};

export type MemorySemanticBenchmarkReport = {
  benchmarkCriteria: string[];
  caseResults: MemorySemanticBenchmarkCaseResult[];
  readiness: {
    blockingIssueCount: number;
    minorIssueCount: number;
    readyForRuntimeCutover: boolean;
  };
};

export const MEMORY_SEMANTIC_BENCHMARK_CRITERIA = [
  "Every required durable memory must be present with the right category and useful canonical wording.",
  "Forbidden filler or reference-only material must not be emitted as a candidate.",
  "Where counts are specified, candidate totals must stay within the expected exact or bounded range.",
  "Where category counts or minimums are specified, the planner must satisfy them without noisy overflow.",
  "Where provenance is expected, heading path and source line must still point to a useful source region.",
  "Duplicate semantic clutter should collapse to one winning candidate with duplicate evidence instead of surviving as separate captures.",
] as const;

type BenchmarkDeps = {
  readFile: typeof fs.readFile;
};

function includesAll(text: string, parts: string[]): boolean {
  const normalized = text.toLowerCase();
  return parts.every((part) => normalized.includes(part.toLowerCase()));
}

function buildCategoryCounts(
  candidates: MemorySemanticBenchmarkCandidateSummary[],
): Partial<Record<DocumentMemoryIngestionCategory, number>> {
  const counts: Partial<Record<DocumentMemoryIngestionCategory, number>> = {};
  for (const candidate of candidates) {
    counts[candidate.category] = (counts[candidate.category] ?? 0) + 1;
  }
  return counts;
}

async function loadCaseContent(
  benchmarkCase: MemorySemanticGoldCase,
  deps: BenchmarkDeps,
): Promise<string> {
  if (typeof benchmarkCase.content === "string") {
    return benchmarkCase.content;
  }
  if (benchmarkCase.source.kind !== "document" || !benchmarkCase.source.path) {
    throw new Error(`benchmark case ${benchmarkCase.id} does not provide inline content or a path`);
  }
  return deps.readFile(benchmarkCase.source.path, "utf8");
}

async function loadBenchmarkBlocks(
  benchmarkCase: MemorySemanticGoldCase,
  deps: BenchmarkDeps,
): Promise<NormalizedMemoryBlock[]> {
  if (benchmarkCase.lane === "document_ingestion") {
    const content = await loadCaseContent(benchmarkCase, deps);
    return normalizeDocumentMemorySource({
      source: benchmarkCase.source,
      content,
      maxBlockChars: 2_000,
      ...(benchmarkCase.projectScope ? { projectScope: benchmarkCase.projectScope } : {}),
    });
  }

  if (typeof benchmarkCase.text !== "string") {
    throw new Error(`turn benchmark case ${benchmarkCase.id} is missing transcript text`);
  }
  return normalizeTranscriptMemorySource({
    source: benchmarkCase.source,
    text: benchmarkCase.text,
    parentContext: benchmarkCase.parentContext ?? [],
    maxSegments: 8,
    ...(benchmarkCase.projectScope ? { projectScope: benchmarkCase.projectScope } : {}),
    ...(benchmarkCase.workflowScope ? { workflowScope: benchmarkCase.workflowScope } : {}),
  });
}

function summarizePlannedDecision(
  planned: PlannedNormalizedMemoryDecision,
  block: NormalizedMemoryBlock,
): MemorySemanticBenchmarkCandidateSummary | null {
  if (planned.validation.action !== "capture") {
    return null;
  }
  const resolved = planned.validation.resolved;
  const category =
    planned.validation.categoryOverride === "reference_routing"
      ? "reference_routing"
      : "captureCategory" in resolved
        ? resolved.captureCategory
        : resolved.familyId;
  return {
    category,
    statement: resolved.observedText,
    provenance: block.provenance,
    headingPath: block.headingPath,
    lineStart: block.provenance.lineStart ?? 0,
    lineEnd: block.provenance.lineEnd ?? block.provenance.lineStart ?? 0,
    duplicateCount: 0,
  };
}

function dedupeCandidateSummaries(
  candidates: MemorySemanticBenchmarkCandidateSummary[],
): MemorySemanticBenchmarkCandidateSummary[] {
  const deduped = new Map<string, MemorySemanticBenchmarkCandidateSummary>();
  for (const candidate of candidates) {
    const key = `${candidate.category}|${candidate.statement.trim().toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...candidate });
      continue;
    }
    existing.duplicateCount += 1;
    if (candidate.headingPath.length > existing.headingPath.length) {
      existing.headingPath = candidate.headingPath;
      existing.provenance = candidate.provenance;
    }
    if (candidate.lineStart && (!existing.lineStart || candidate.lineStart < existing.lineStart)) {
      existing.lineStart = candidate.lineStart;
    }
    if (candidate.lineEnd > existing.lineEnd) {
      existing.lineEnd = candidate.lineEnd;
    }
  }
  return [...deduped.values()];
}

function findMatchingCandidate(
  expected: MemorySemanticGoldExpectedCandidate,
  candidates: MemorySemanticBenchmarkCandidateSummary[],
  usedIndexes: Set<number>,
): { candidate: MemorySemanticBenchmarkCandidateSummary; index: number } | null {
  for (const [index, candidate] of candidates.entries()) {
    if (usedIndexes.has(index) || candidate.category !== expected.category) {
      continue;
    }
    if (!includesAll(candidate.statement, expected.statementIncludes)) {
      continue;
    }
    return { candidate, index };
  }
  return null;
}

function validateCounts(
  benchmarkCase: MemorySemanticGoldCase,
  candidates: MemorySemanticBenchmarkCandidateSummary[],
  issues: MemorySemanticBenchmarkIssue[],
) {
  const candidateCount = candidates.length;
  const expected = benchmarkCase.expected;
  if (typeof expected.exactCount === "number" && candidateCount !== expected.exactCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected exactly ${expected.exactCount} candidates but found ${candidateCount}`,
    });
  }
  if (typeof expected.minCount === "number" && candidateCount < expected.minCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected at least ${expected.minCount} candidates but found ${candidateCount}`,
    });
  }
  if (typeof expected.maxCount === "number" && candidateCount > expected.maxCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected at most ${expected.maxCount} candidates but found ${candidateCount}`,
    });
  }

  const categoryCounts = buildCategoryCounts(candidates);
  for (const [category, count] of Object.entries(expected.categoryCounts ?? {})) {
    if ((categoryCounts[category as DocumentMemoryIngestionCategory] ?? 0) !== count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected ${category} count ${count} but found ${
          categoryCounts[category as DocumentMemoryIngestionCategory] ?? 0
        }`,
      });
    }
  }
  for (const [category, count] of Object.entries(expected.categoryMinimums ?? {})) {
    if ((categoryCounts[category as DocumentMemoryIngestionCategory] ?? 0) < count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected at least ${count} ${category} candidates but found ${
          categoryCounts[category as DocumentMemoryIngestionCategory] ?? 0
        }`,
      });
    }
  }
}

function validateRequiredCandidates(
  benchmarkCase: MemorySemanticGoldCase,
  candidates: MemorySemanticBenchmarkCandidateSummary[],
  issues: MemorySemanticBenchmarkIssue[],
): string[] {
  const matchedCandidateIds: string[] = [];
  const usedIndexes = new Set<number>();
  for (const expected of benchmarkCase.expected.requiredCandidates) {
    const match = findMatchingCandidate(expected, candidates, usedIndexes);
    if (!match) {
      issues.push({
        severity: "blocking",
        code: "missing_candidate",
        message: `missing required ${expected.category} candidate ${expected.id}`,
      });
      continue;
    }
    usedIndexes.add(match.index);
    matchedCandidateIds.push(expected.id);

    if (
      expected.headingPath &&
      match.candidate.headingPath.join(" > ").toLowerCase() !==
        expected.headingPath.join(" > ").toLowerCase()
    ) {
      issues.push({
        severity: "minor",
        code: "provenance_mismatch",
        message: `candidate ${expected.id} heading path mismatch`,
      });
    }

    if (
      typeof expected.lineStart === "number" &&
      match.candidate.lineStart !== expected.lineStart &&
      !(expected.allowedLineStarts ?? []).includes(match.candidate.lineStart)
    ) {
      issues.push({
        severity: "minor",
        code: "provenance_mismatch",
        message: `candidate ${expected.id} lineStart mismatch`,
      });
    }

    if (
      typeof expected.duplicateCountAtLeast === "number" &&
      match.candidate.duplicateCount < expected.duplicateCountAtLeast
    ) {
      issues.push({
        severity: "minor",
        code: "dedupe_mismatch",
        message: `candidate ${expected.id} expected duplicateCount >= ${expected.duplicateCountAtLeast} but found ${match.candidate.duplicateCount}`,
      });
    }
  }
  return matchedCandidateIds;
}

function validateForbiddenCandidates(
  forbiddenCandidates: MemorySemanticGoldForbiddenCandidate[],
  candidates: MemorySemanticBenchmarkCandidateSummary[],
  issues: MemorySemanticBenchmarkIssue[],
) {
  for (const forbidden of forbiddenCandidates) {
    if (
      candidates.some((candidate) => includesAll(candidate.statement, forbidden.statementIncludes))
    ) {
      issues.push({
        severity: "blocking",
        code: "forbidden_capture",
        message: `${forbidden.reason}: ${forbidden.statementIncludes.join(", ")}`,
      });
    }
  }
}

export async function runMemorySemanticGoldCorpusBenchmark(params: {
  config: MemoryMiddlewareConfig;
  interpreter: MemorySemanticInterpreterPort;
  cases?: MemorySemanticGoldCase[];
  deps?: Partial<BenchmarkDeps>;
}): Promise<MemorySemanticBenchmarkReport> {
  const deps: BenchmarkDeps = {
    readFile: params.deps?.readFile ?? fs.readFile,
  };
  const cases = params.cases ?? MEMORY_SEMANTIC_GOLD_CORPUS;
  const caseResults: MemorySemanticBenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    const blocks = await loadBenchmarkBlocks(benchmarkCase, deps);
    const rawCandidates: MemorySemanticBenchmarkCandidateSummary[] = [];
    for (const block of blocks) {
      const planned = await planNormalizedMemoryBlock({
        config: params.config,
        lane: benchmarkCase.lane,
        block,
        interpreter: params.interpreter,
        ...(benchmarkCase.source.projectId ? { projectId: benchmarkCase.source.projectId } : {}),
      });
      if (!planned) {
        continue;
      }
      const summary = summarizePlannedDecision(planned, block);
      if (summary) {
        rawCandidates.push(summary);
      }
    }
    const candidates = dedupeCandidateSummaries(rawCandidates);
    const issues: MemorySemanticBenchmarkIssue[] = [];

    validateCounts(benchmarkCase, candidates, issues);
    const matchedCandidateIds = validateRequiredCandidates(benchmarkCase, candidates, issues);
    validateForbiddenCandidates(benchmarkCase.expected.forbiddenCandidates, candidates, issues);

    caseResults.push({
      benchmarkCase,
      actual: {
        candidateCount: candidates.length,
        categoryCounts: buildCategoryCounts(candidates),
        candidates,
      },
      matchedCandidateIds,
      issues,
      pass: issues.every((issue) => issue.severity !== "blocking"),
    });
  }

  const blockingIssueCount = caseResults.reduce(
    (count, result) =>
      count + result.issues.filter((issue) => issue.severity === "blocking").length,
    0,
  );
  const minorIssueCount = caseResults.reduce(
    (count, result) => count + result.issues.filter((issue) => issue.severity === "minor").length,
    0,
  );

  return {
    benchmarkCriteria: [...MEMORY_SEMANTIC_BENCHMARK_CRITERIA],
    caseResults,
    readiness: {
      blockingIssueCount,
      minorIssueCount,
      readyForRuntimeCutover: blockingIssueCount === 0,
    },
  };
}
