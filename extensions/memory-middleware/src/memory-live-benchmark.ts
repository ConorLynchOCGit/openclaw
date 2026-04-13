import fs from "node:fs/promises";
import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  CanonicalMemoryClassCountMap,
  DocumentMemoryIngestionCategory,
} from "./document-memory-ingestion-types.js";
import { resolveDocumentMemoryIngestionCategoryForSemanticObject } from "./document-memory-ingestion-types.js";
import {
  MEMORY_SEMANTIC_GOLD_CORPUS,
  type MemorySemanticGoldCase,
  type MemorySemanticGoldExpectedObject,
  type MemorySemanticGoldForbiddenObject,
} from "./memory-semantic-gold-corpus.js";
import type {
  MemoryCanonicalClass,
  MemorySemanticObject,
} from "./memory-semantic-interpretation.js";
import { resolveCanonicalMemoryClassForSemanticObject } from "./memory-semantic-interpretation.js";
import type { MemorySemanticInterpreterPort } from "./memory-semantic-interpretation.js";
import { buildMemorySemanticObjectIdentity } from "./memory-semantic-object-identity.js";
import {
  planNormalizedMemorySourceWindow,
  type PlannedMemorySemanticCapture,
} from "./memory-semantic-planner.js";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
  type MemoryProvenanceRegion,
} from "./memory-source-normalization.js";
import {
  buildMemorySourceWindows,
  type NormalizedMemorySourceWindow,
} from "./memory-source-windowing.js";

export type MemorySemanticBenchmarkIssueSeverity = "blocking" | "minor";

export type MemorySemanticBenchmarkIssue = {
  severity: MemorySemanticBenchmarkIssueSeverity;
  code:
    | "count_mismatch"
    | "category_mismatch"
    | "missing_candidate"
    | "object_mismatch"
    | "interpreter_failure"
    | "evidence_mismatch"
    | "forbidden_capture"
    | "provenance_mismatch"
    | "dedupe_mismatch";
  message: string;
};

export type MemorySemanticBenchmarkObjectSummary = {
  canonicalClass: MemoryCanonicalClass;
  kind: MemorySemanticObject["kind"];
  compatibilityCategory: DocumentMemoryIngestionCategory;
  subjectKey: string;
  clusterKey: string;
  dedupeKey: string;
  object: MemorySemanticObject;
  evidence: string[];
  reviewMode: string;
  provenance: MemoryProvenanceRegion;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  duplicateCount: number;
};

export type MemorySemanticBenchmarkCaseResult = {
  benchmarkCase: MemorySemanticGoldCase;
  actual: {
    objectCount: number;
    classCounts: CanonicalMemoryClassCountMap;
    compatibilityCategoryCounts: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    objects: MemorySemanticBenchmarkObjectSummary[];
  };
  matchedObjectIds: string[];
  issues: MemorySemanticBenchmarkIssue[];
  pass: boolean;
};

export type MemorySemanticBenchmarkReport = {
  benchmarkCriteria: string[];
  execution: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    generatedAt: string;
    caseCount: number;
    modelIds: string[];
    promptVersions: string[];
  };
  caseResults: MemorySemanticBenchmarkCaseResult[];
  readiness: {
    blockingIssueCount: number;
    minorIssueCount: number;
    readyForRuntimeCutover: boolean;
  };
};

export const MEMORY_SEMANTIC_BENCHMARK_CRITERIA = [
  "Every required durable memory object must be present with the right kind, structured payload, and scope.",
  "Forbidden filler or reference-only material must not be emitted as a durable semantic object.",
  "Where counts are specified, object totals must stay within the expected exact or bounded range.",
  "Where compatibility projection counts or minimums are specified, the planner must satisfy them without noisy overflow.",
  "Structured procedures should match on reusable procedure shape, not only loose rendered text.",
  "Expected scope, routing, and validator-evidence constraints must match the semantic object that survives validation.",
  "Where provenance is expected, heading path and source line must still point to a useful source region.",
  "Duplicate semantic clutter should collapse to one winning object with duplicate evidence instead of surviving as separate captures.",
] as const;

type BenchmarkDeps = {
  readFile: typeof fs.readFile;
};

function reportBenchmarkProgress(message: string) {
  if (process.env.OPENCLAW_MEMORY_BENCHMARK_PROGRESS === "1") {
    process.stderr.write(`[memory-benchmark] ${message}\n`);
  }
}

function normalizeBenchmarkText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`"'()[\]{}:;,.!?/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAll(text: string, parts: string[]): boolean {
  const normalized = normalizeBenchmarkText(text);
  return parts.every((part) => normalized.includes(normalizeBenchmarkText(part)));
}

function includesNone(text: string, parts: string[] | undefined): boolean {
  if (!parts || parts.length === 0) {
    return true;
  }
  const normalized = normalizeBenchmarkText(text);
  return parts.every((part) => !normalized.includes(normalizeBenchmarkText(part)));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return String(error);
}

function buildCompatibilityCategoryCounts(
  objects: MemorySemanticBenchmarkObjectSummary[],
): Partial<Record<DocumentMemoryIngestionCategory, number>> {
  const counts: Partial<Record<DocumentMemoryIngestionCategory, number>> = {};
  for (const object of objects) {
    counts[object.compatibilityCategory] = (counts[object.compatibilityCategory] ?? 0) + 1;
  }
  return counts;
}

function buildClassCounts(
  objects: MemorySemanticBenchmarkObjectSummary[],
): CanonicalMemoryClassCountMap {
  const counts: CanonicalMemoryClassCountMap = {};
  for (const object of objects) {
    counts[object.canonicalClass] = (counts[object.canonicalClass] ?? 0) + 1;
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

async function loadBenchmarkWindows(
  benchmarkCase: MemorySemanticGoldCase,
  deps: BenchmarkDeps,
): Promise<NormalizedMemorySourceWindow[]> {
  if (benchmarkCase.lane === "document_ingestion") {
    const content = await loadCaseContent(benchmarkCase, deps);
    const blocks = normalizeDocumentMemorySource({
      source: benchmarkCase.source,
      content,
      maxBlockChars: 2_000,
      ...(benchmarkCase.projectScope ? { projectScope: benchmarkCase.projectScope } : {}),
    });
    return buildMemorySourceWindows({
      blocks,
      maxWindowChars: 4_000,
      maxBlocksPerWindow: 6,
    });
  }

  if (typeof benchmarkCase.text !== "string") {
    throw new Error(`turn benchmark case ${benchmarkCase.id} is missing transcript text`);
  }
  const blocks = normalizeTranscriptMemorySource({
    source: benchmarkCase.source,
    text: benchmarkCase.text,
    parentContext: benchmarkCase.parentContext ?? [],
    maxSegments: 8,
    ...(benchmarkCase.projectScope ? { projectScope: benchmarkCase.projectScope } : {}),
    ...(benchmarkCase.workflowScope ? { workflowScope: benchmarkCase.workflowScope } : {}),
  });
  return buildMemorySourceWindows({
    blocks,
    maxWindowChars: 2_400,
    maxBlocksPerWindow: 6,
  });
}

function summarizePlannedDecision(
  capture: PlannedMemorySemanticCapture,
): MemorySemanticBenchmarkObjectSummary | null {
  if (capture.materialized.action !== "capture") {
    return null;
  }
  const firstBlock = capture.validated.supportingBlocks[0];
  const headingPath = firstBlock?.headingPath ?? [];
  const provenance = firstBlock?.provenance ?? capture.validated.supportingBlocks[0]?.provenance;
  if (!provenance) {
    return null;
  }
  const identity = buildMemorySemanticObjectIdentity(capture.materialized.object);
  return {
    canonicalClass: resolveCanonicalMemoryClassForSemanticObject(capture.materialized.object),
    kind: capture.materialized.object.kind,
    compatibilityCategory: resolveDocumentMemoryIngestionCategoryForSemanticObject(
      capture.materialized.object,
    ),
    subjectKey: identity.subjectKey,
    clusterKey: identity.clusterKey,
    dedupeKey: identity.dedupeKey,
    object: capture.materialized.object,
    evidence: [...capture.validated.evidence],
    reviewMode: capture.validated.reviewMode,
    provenance,
    headingPath,
    lineStart: provenance.lineStart ?? 0,
    lineEnd: provenance.lineEnd ?? provenance.lineStart ?? 0,
    duplicateCount: 0,
  };
}

function buildObjectDedupeKey(summary: MemorySemanticBenchmarkObjectSummary): string {
  return summary.dedupeKey;
}

function dedupeObjectSummaries(
  objects: MemorySemanticBenchmarkObjectSummary[],
): MemorySemanticBenchmarkObjectSummary[] {
  const deduped = new Map<string, MemorySemanticBenchmarkObjectSummary>();
  for (const object of objects) {
    const key = buildObjectDedupeKey(object);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...object });
      continue;
    }
    existing.duplicateCount += 1;
    if (object.headingPath.length > existing.headingPath.length) {
      existing.headingPath = object.headingPath;
      existing.provenance = object.provenance;
    }
    if (object.lineStart && (!existing.lineStart || object.lineStart < existing.lineStart)) {
      existing.lineStart = object.lineStart;
    }
    if (object.lineEnd > existing.lineEnd) {
      existing.lineEnd = object.lineEnd;
    }
  }
  return [...deduped.values()];
}

function matchesExpectedProcedure(
  expected: NonNullable<MemorySemanticGoldExpectedObject["procedure"]>,
  object: Extract<MemorySemanticObject, { kind: "procedure" }>,
): string[] {
  const reasons: string[] = [];
  if (expected.titleIncludes && !includesAll(object.title, expected.titleIncludes)) {
    reasons.push("procedure title mismatch");
  }
  if (expected.stepIncludes && !includesAll(object.steps.join("\n"), expected.stepIncludes)) {
    reasons.push("procedure steps mismatch");
  }
  if (
    typeof expected.exactStepCount === "number" &&
    object.steps.length !== expected.exactStepCount
  ) {
    reasons.push(`procedure step count ${object.steps.length} != ${expected.exactStepCount}`);
  }
  return reasons;
}

function buildObjectMismatchReasons(
  expected: MemorySemanticGoldExpectedObject,
  summary: MemorySemanticBenchmarkObjectSummary,
): string[] {
  const reasons: string[] = [];
  if (summary.kind !== expected.kind) {
    reasons.push(`kind ${summary.kind} != ${expected.kind}`);
  }
  if (expected.canonicalClass && summary.canonicalClass !== expected.canonicalClass) {
    reasons.push(`canonicalClass ${summary.canonicalClass} != ${expected.canonicalClass}`);
  }
  if (
    expected.compatibilityCategory &&
    summary.compatibilityCategory !== expected.compatibilityCategory
  ) {
    reasons.push(
      `compatibilityCategory ${summary.compatibilityCategory} != ${expected.compatibilityCategory}`,
    );
  }
  const object = summary.object;
  const subjectText =
    "subject" in object && typeof object.subject === "string" ? object.subject : "";
  if (expected.subjectIncludes && !includesAll(subjectText, expected.subjectIncludes)) {
    reasons.push(`subject mismatch for ${expected.id}`);
  }
  if ("scope" in object && expected.projectScope) {
    if (
      normalizeBenchmarkText(object.scope?.projectScope ?? "") !==
      normalizeBenchmarkText(expected.projectScope)
    ) {
      reasons.push(`project scope mismatch for ${expected.id}`);
    }
  }
  if (
    object.kind === "correction" &&
    expected.correctionKind &&
    object.correctionKind !== expected.correctionKind
  ) {
    reasons.push(`correction kind mismatch for ${expected.id}`);
  }
  if (
    object.kind === "preference" &&
    expected.preferenceProfile &&
    object.preferenceProfile !== expected.preferenceProfile
  ) {
    reasons.push(`preference profile mismatch for ${expected.id}`);
  }
  if (
    object.kind === "preference" &&
    expected.instructionIncludes &&
    !includesAll(object.instruction, expected.instructionIncludes)
  ) {
    reasons.push(`instruction mismatch for ${expected.id}`);
  }
  if (
    object.kind === "project_fact" &&
    expected.factFieldKey &&
    object.factFieldKey !== expected.factFieldKey
  ) {
    reasons.push(`fact field key mismatch for ${expected.id}`);
  }
  if (
    object.kind === "project_fact" &&
    expected.valueIncludes &&
    !includesAll(object.value, expected.valueIncludes)
  ) {
    reasons.push(`value mismatch for ${expected.id}`);
  }
  if (
    object.kind === "correction" &&
    expected.workflowProfile &&
    object.workflowProfile !== expected.workflowProfile
  ) {
    reasons.push(`workflow profile mismatch for ${expected.id}`);
  }
  if (
    object.kind === "correction" &&
    expected.recommendedActionIncludes &&
    !includesAll(object.recommendedAction ?? "", expected.recommendedActionIncludes)
  ) {
    reasons.push(`recommended action mismatch for ${expected.id}`);
  }
  if (
    object.kind === "correction" &&
    expected.avoidActionIncludes &&
    !includesAll(object.avoidAction ?? "", expected.avoidActionIncludes)
  ) {
    reasons.push(`avoid action mismatch for ${expected.id}`);
  }
  if (
    object.kind === "correction" &&
    expected.neededCapabilityIncludes &&
    !includesAll(object.neededCapability ?? "", expected.neededCapabilityIncludes)
  ) {
    reasons.push(`needed capability mismatch for ${expected.id}`);
  }
  if (
    object.kind === "correction" &&
    expected.rationaleTextIncludes &&
    !includesAll(object.rationaleText ?? "", expected.rationaleTextIncludes)
  ) {
    reasons.push(`rationale text mismatch for ${expected.id}`);
  }
  if (
    object.kind === "routing" &&
    expected.taskIncludes &&
    !includesAll(object.task, expected.taskIncludes)
  ) {
    reasons.push(`routing task mismatch for ${expected.id}`);
  }
  if (
    object.kind === "routing" &&
    expected.primaryResourceIncludes &&
    !includesAll(object.primaryResource, expected.primaryResourceIncludes)
  ) {
    reasons.push(`routing primary resource mismatch for ${expected.id}`);
  }
  if (
    object.kind === "routing" &&
    expected.companionResourceIncludes &&
    !includesAll((object.companionResources ?? []).join("\n"), expected.companionResourceIncludes)
  ) {
    reasons.push(`routing companion resource mismatch for ${expected.id}`);
  }
  if (expected.guidancePattern) {
    const actualGuidance = object.kind === "correction" ? object.guidancePattern : undefined;
    if (
      normalizeBenchmarkText(actualGuidance ?? "") !==
      normalizeBenchmarkText(expected.guidancePattern)
    ) {
      reasons.push(`guidance pattern mismatch for ${expected.id}`);
    }
  }
  if (expected.procedure) {
    if (object.kind !== "procedure") {
      reasons.push(`expected reusable procedure shape for ${expected.id}`);
    } else {
      if (expected.procedureKey && object.procedureKey !== expected.procedureKey) {
        reasons.push(`procedure key mismatch for ${expected.id}`);
      }
      reasons.push(...matchesExpectedProcedure(expected.procedure, object));
    }
  }
  if (
    expected.forbidEvidencePrefixes &&
    summary.evidence.some((entry) =>
      expected.forbidEvidencePrefixes?.some((prefix) => entry.startsWith(prefix)),
    )
  ) {
    reasons.push(`forbidden validation evidence present for ${expected.id}`);
  }
  if (
    expected.requireEvidencePrefixes &&
    !expected.requireEvidencePrefixes.every((prefix) =>
      summary.evidence.some((entry) => entry.startsWith(prefix)),
    )
  ) {
    reasons.push(`required validation evidence missing for ${expected.id}`);
  }
  return reasons;
}

function findMatchingObject(params: {
  expected: MemorySemanticGoldExpectedObject;
  objects: MemorySemanticBenchmarkObjectSummary[];
  usedIndexes: Set<number>;
}):
  | { kind: "match"; object: MemorySemanticBenchmarkObjectSummary; index: number }
  | {
      kind: "near_miss";
      object: MemorySemanticBenchmarkObjectSummary;
      index: number;
      reasons: string[];
    }
  | null {
  let nearest: {
    object: MemorySemanticBenchmarkObjectSummary;
    index: number;
    reasons: string[];
  } | null = null;
  for (const [index, object] of params.objects.entries()) {
    if (params.usedIndexes.has(index)) {
      continue;
    }
    const reasons = buildObjectMismatchReasons(params.expected, object);
    if (reasons.length === 0) {
      return { kind: "match", object, index };
    }
    if (!nearest || reasons.length < nearest.reasons.length) {
      nearest = { object, index, reasons };
    }
  }
  return nearest ? { kind: "near_miss", ...nearest } : null;
}

function forbiddenObjectMatched(
  forbidden: MemorySemanticGoldForbiddenObject,
  summary: MemorySemanticBenchmarkObjectSummary,
): boolean {
  if (forbidden.kind && summary.kind !== forbidden.kind) {
    return false;
  }
  if (forbidden.canonicalClass && summary.canonicalClass !== forbidden.canonicalClass) {
    return false;
  }
  if (
    forbidden.compatibilityCategory &&
    summary.compatibilityCategory !== forbidden.compatibilityCategory
  ) {
    return false;
  }
  const object = summary.object;
  const subjectText =
    "subject" in object && typeof object.subject === "string" ? object.subject : "";
  if (forbidden.subjectIncludes && !includesAll(subjectText, forbidden.subjectIncludes)) {
    return false;
  }
  if (
    forbidden.instructionIncludes &&
    (object.kind !== "preference" ||
      !includesAll(object.instruction, forbidden.instructionIncludes))
  ) {
    return false;
  }
  if (
    forbidden.valueIncludes &&
    !includesAll(object.kind === "project_fact" ? object.value : "", forbidden.valueIncludes)
  ) {
    return false;
  }
  if (
    forbidden.taskIncludes &&
    !includesAll(object.kind === "routing" ? object.task : "", forbidden.taskIncludes)
  ) {
    return false;
  }
  if (
    forbidden.primaryResourceIncludes &&
    !includesAll(
      object.kind === "routing" ? object.primaryResource : "",
      forbidden.primaryResourceIncludes,
    )
  ) {
    return false;
  }
  if (
    forbidden.recommendedActionIncludes &&
    !includesAll(
      object.kind === "correction" ? (object.recommendedAction ?? "") : "",
      forbidden.recommendedActionIncludes,
    )
  ) {
    return false;
  }
  if (
    forbidden.avoidActionIncludes &&
    !includesAll(
      object.kind === "correction" ? (object.avoidAction ?? "") : "",
      forbidden.avoidActionIncludes,
    )
  ) {
    return false;
  }
  return Boolean(
    forbidden.subjectIncludes ||
    forbidden.instructionIncludes ||
    forbidden.valueIncludes ||
    forbidden.taskIncludes ||
    forbidden.primaryResourceIncludes ||
    forbidden.recommendedActionIncludes ||
    forbidden.avoidActionIncludes,
  );
}

function validateCounts(
  benchmarkCase: MemorySemanticGoldCase,
  objects: MemorySemanticBenchmarkObjectSummary[],
  issues: MemorySemanticBenchmarkIssue[],
) {
  const candidateCount = objects.length;
  const expected = benchmarkCase.expected;
  if (typeof expected.exactCount === "number" && candidateCount !== expected.exactCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected exactly ${expected.exactCount} objects but found ${candidateCount}`,
    });
  }
  if (typeof expected.minCount === "number" && candidateCount < expected.minCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected at least ${expected.minCount} objects but found ${candidateCount}`,
    });
  }
  if (typeof expected.maxCount === "number" && candidateCount > expected.maxCount) {
    issues.push({
      severity: "blocking",
      code: "count_mismatch",
      message: `expected at most ${expected.maxCount} objects but found ${candidateCount}`,
    });
  }

  const compatibilityCategoryCounts = buildCompatibilityCategoryCounts(objects);
  const classCounts = buildClassCounts(objects);
  for (const [canonicalClass, count] of Object.entries(expected.classCounts ?? {})) {
    if ((classCounts[canonicalClass as MemoryCanonicalClass] ?? 0) !== count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected ${canonicalClass} class count ${count} but found ${
          classCounts[canonicalClass as MemoryCanonicalClass] ?? 0
        }`,
      });
    }
  }
  for (const [canonicalClass, count] of Object.entries(expected.classMinimums ?? {})) {
    if ((classCounts[canonicalClass as MemoryCanonicalClass] ?? 0) < count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected at least ${count} ${canonicalClass} objects but found ${
          classCounts[canonicalClass as MemoryCanonicalClass] ?? 0
        }`,
      });
    }
  }
  for (const [category, count] of Object.entries(expected.compatibilityCategoryCounts ?? {})) {
    if ((compatibilityCategoryCounts[category as DocumentMemoryIngestionCategory] ?? 0) !== count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected ${category} count ${count} but found ${
          compatibilityCategoryCounts[category as DocumentMemoryIngestionCategory] ?? 0
        }`,
      });
    }
  }
  for (const [category, count] of Object.entries(expected.compatibilityCategoryMinimums ?? {})) {
    if ((compatibilityCategoryCounts[category as DocumentMemoryIngestionCategory] ?? 0) < count) {
      issues.push({
        severity: "blocking",
        code: "category_mismatch",
        message: `expected at least ${count} ${category} objects but found ${
          compatibilityCategoryCounts[category as DocumentMemoryIngestionCategory] ?? 0
        }`,
      });
    }
  }
}

function validateRequiredObjects(
  benchmarkCase: MemorySemanticGoldCase,
  objects: MemorySemanticBenchmarkObjectSummary[],
  issues: MemorySemanticBenchmarkIssue[],
): string[] {
  const matchedObjectIds: string[] = [];
  const usedIndexes = new Set<number>();
  for (const expected of benchmarkCase.expected.requiredObjects) {
    const match = findMatchingObject({ expected, objects, usedIndexes });
    if (!match) {
      issues.push({
        severity: "blocking",
        code: "missing_candidate",
        message: `missing required ${expected.kind} object ${expected.id}`,
      });
      continue;
    }
    if (match.kind === "near_miss") {
      issues.push({
        severity: "blocking",
        code: match.reasons.some((reason) => reason.includes("validation evidence"))
          ? "evidence_mismatch"
          : "object_mismatch",
        message: `object ${expected.id} near miss: ${match.reasons.join("; ")}`,
      });
      continue;
    }
    usedIndexes.add(match.index);
    matchedObjectIds.push(expected.id);

    if (
      expected.headingPath &&
      match.object.headingPath.join(" > ").toLowerCase() !==
        expected.headingPath.join(" > ").toLowerCase()
    ) {
      issues.push({
        severity: "minor",
        code: "provenance_mismatch",
        message: `object ${expected.id} heading path mismatch`,
      });
    }

    if (
      typeof expected.lineStart === "number" &&
      match.object.lineStart !== expected.lineStart &&
      !(expected.allowedLineStarts ?? []).includes(match.object.lineStart)
    ) {
      issues.push({
        severity: "minor",
        code: "provenance_mismatch",
        message: `object ${expected.id} lineStart mismatch`,
      });
    }

    if (
      typeof expected.duplicateCountAtLeast === "number" &&
      match.object.duplicateCount < expected.duplicateCountAtLeast
    ) {
      issues.push({
        severity: "minor",
        code: "dedupe_mismatch",
        message: `object ${expected.id} expected duplicateCount >= ${expected.duplicateCountAtLeast} but found ${match.object.duplicateCount}`,
      });
    }
  }
  return matchedObjectIds;
}

function validateForbiddenObjects(
  forbiddenObjects: MemorySemanticGoldForbiddenObject[],
  objects: MemorySemanticBenchmarkObjectSummary[],
  issues: MemorySemanticBenchmarkIssue[],
) {
  for (const forbidden of forbiddenObjects) {
    if (objects.some((object) => forbiddenObjectMatched(forbidden, object))) {
      issues.push({
        severity: "blocking",
        code: "forbidden_capture",
        message: `${forbidden.reason}`,
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
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const deps: BenchmarkDeps = {
    readFile: params.deps?.readFile ?? fs.readFile,
  };
  const cases = params.cases ?? MEMORY_SEMANTIC_GOLD_CORPUS;
  const caseResults: MemorySemanticBenchmarkCaseResult[] = [];
  const modelIds = new Set<string>();
  const promptVersions = new Set<string>();

  for (const benchmarkCase of cases) {
    reportBenchmarkProgress(`case ${benchmarkCase.id}: loading`);
    const windows = await loadBenchmarkWindows(benchmarkCase, deps);
    reportBenchmarkProgress(`case ${benchmarkCase.id}: loaded ${windows.length} windows`);
    const rawObjects: MemorySemanticBenchmarkObjectSummary[] = [];
    const issues: MemorySemanticBenchmarkIssue[] = [];
    for (const window of windows) {
      reportBenchmarkProgress(
        `case ${benchmarkCase.id}: planning window ${window.provenance.segmentIndex ?? "?"}/${windows.length}`,
      );
      let planned;
      try {
        planned = await planNormalizedMemorySourceWindow({
          config: params.config,
          lane: benchmarkCase.lane,
          window,
          interpreter: params.interpreter,
          ...(benchmarkCase.source.projectId ? { projectId: benchmarkCase.source.projectId } : {}),
        });
      } catch (error) {
        issues.push({
          severity: "blocking",
          code: "interpreter_failure",
          message: `window ${window.id} failed: ${describeError(error)}`,
        });
        continue;
      }
      if (!planned) {
        continue;
      }
      modelIds.add(planned.modelId);
      promptVersions.add(planned.promptVersion);
      for (const capture of planned.captures) {
        const summary = summarizePlannedDecision(capture);
        if (summary) {
          rawObjects.push(summary);
        }
      }
    }
    reportBenchmarkProgress(`case ${benchmarkCase.id}: deduping ${rawObjects.length} raw objects`);
    const objects = dedupeObjectSummaries(rawObjects);

    validateCounts(benchmarkCase, objects, issues);
    const matchedObjectIds = validateRequiredObjects(benchmarkCase, objects, issues);
    validateForbiddenObjects(benchmarkCase.expected.forbiddenObjects, objects, issues);

    caseResults.push({
      benchmarkCase,
      actual: {
        objectCount: objects.length,
        classCounts: buildClassCounts(objects),
        compatibilityCategoryCounts: buildCompatibilityCategoryCounts(objects),
        objects,
      },
      matchedObjectIds,
      issues,
      pass: issues.every((issue) => issue.severity !== "blocking"),
    });
    reportBenchmarkProgress(
      `case ${benchmarkCase.id}: done pass=${
        issues.every((issue) => issue.severity !== "blocking") ? "true" : "false"
      } issues=${issues.length}`,
    );
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
    execution: {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      generatedAt: new Date().toISOString(),
      caseCount: cases.length,
      modelIds: [...modelIds],
      promptVersions: [...promptVersions],
    },
    caseResults,
    readiness: {
      blockingIssueCount,
      minorIssueCount,
      readyForRuntimeCutover: blockingIssueCount === 0,
    },
  };
}
