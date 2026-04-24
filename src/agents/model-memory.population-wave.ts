import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.ts";
import {
  DatabaseMemoryObjectStore,
  ExecutorBackedSemanticCollisionAdjudicator,
} from "../plugin-sdk/model-memory-legacy.js";
import {
  ExecutorBackedSemanticInterpreter,
  ingestDocumentLive,
  rebuildDerivedRuntimeState,
  type ModelMemoryLifecycleState,
  type ModelMemoryObjectRecord,
  type ModelMemorySupportItemRecord,
  type ModelMemoryWriteEventRecord,
  type ModelMemorySourceKind,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS,
  TIER_ONE_LARGE_DOCUMENT_CASES,
  resetModelMemoryEvidenceDatabase,
  type LargeDocumentClassification,
  type LargeDocumentEvaluationPurpose,
} from "./model-memory.large-document-evidence.ts";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.ts";

const DEFAULT_LIMIT = 100;
const DEFAULT_CHUNK_SIZE = 10;

const TIER_TWO_PACKS = [
  {
    packId: "docs/projects/model-memory/specs",
    relativeDir: "docs/projects/model-memory/specs",
    allowedExtensions: new Set([".md"]),
    classification: "primary_large_source_proof_input" as const,
    purposes: [
      "architecture_fact_extraction",
      "reference_extraction",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
  {
    packId: "docs/help",
    relativeDir: "docs/help",
    allowedExtensions: new Set([".md"]),
    classification: "primary_large_source_proof_input" as const,
    purposes: [
      "procedure_extraction",
      "omission_discipline",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
  {
    packId: "docs/gateway",
    relativeDir: "docs/gateway",
    allowedExtensions: new Set([".md"]),
    classification: "primary_large_source_proof_input" as const,
    purposes: [
      "reference_extraction",
      "architecture_fact_extraction",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
  {
    packId: "docs/reference/templates",
    relativeDir: "docs/reference/templates",
    allowedExtensions: new Set([".md"]),
    classification: "bootstrap_preservation_sensitive_input" as const,
    purposes: [
      "reference_extraction",
      "omission_discipline",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
] as const;

const TIER_THREE_PACKS = [
  {
    packId: "extensions/model-memory",
    relativeDir: "extensions/model-memory",
    classification: "primary_large_source_proof_input" as const,
    purposes: [
      "architecture_fact_extraction",
      "reference_extraction",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
  {
    packId: "src/plugin-sdk",
    relativeDir: "src/plugin-sdk",
    classification: "primary_large_source_proof_input" as const,
    purposes: [
      "architecture_fact_extraction",
      "reference_extraction",
    ] satisfies LargeDocumentEvaluationPurpose[],
  },
] as const;

export type PopulationWaveTier =
  | "tier1_single_document_pilot"
  | "tier2_curated_repo_pack"
  | "tier3_selected_code_and_doc_pack";

export type PopulationWaveSource = {
  order: number;
  chunkIndex: number;
  tier: PopulationWaveTier;
  packId: string;
  id: string;
  sourceKind: ModelMemorySourceKind;
  relativePath: string;
  absolutePath: string;
  displayPath: string;
  classification: LargeDocumentClassification;
  purposes: LargeDocumentEvaluationPurpose[];
};

export type PopulationWaveChunk = {
  chunkIndex: number;
  sourcePaths: string[];
};

export type PopulationWavePlan = {
  generatedAt: string;
  limitRequested: number;
  chunkSize: number;
  totalEligibleSources: number;
  selectedCount: number;
  sourceSelectionNotes: string[];
  sources: PopulationWaveSource[];
  chunks: PopulationWaveChunk[];
};

export type PopulationWaveSourceResult = {
  source: string;
  chunkIndex: number;
  tier: PopulationWaveTier;
  packId: string;
  classification: LargeDocumentClassification;
  status: "completed" | "failed";
  lineCount: number;
  windowCount: number;
  capturedClaimCount: number;
  persistedObjectCount: number;
  persistedSupportItemCount: number;
  activeObjectCount: number;
  provisionalObjectCount: number;
  conflictHoldObjectCount: number;
  writeDecisionCounts: Record<string, number>;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  rejectReasons: string[];
  errorMessage?: string;
};

export type PopulationWaveChunkResult = {
  chunkIndex: number;
  sourcePaths: string[];
  attemptedCount: number;
  completedCount: number;
  failedCount: number;
  persistedObjectCount: number;
  persistedSupportItemCount: number;
  activeObjectCount: number;
  provisionalObjectCount: number;
  conflictHoldObjectCount: number;
  writeDecisionCounts: Record<string, number>;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  rejectReasons: string[];
};

export type PopulationWaveReport = {
  generatedAt: string;
  modelRef: string;
  candidateModelRef: string;
  requestSeed?: number;
  requestTimeoutMs: number;
  maxWordsPerWindow: number;
  chunkSize: number;
  plan: PopulationWavePlan;
  chunkResults: PopulationWaveChunkResult[];
  sourceResults: PopulationWaveSourceResult[];
  totals: {
    docsAttempted: number;
    docsCompleted: number;
    docsFailed: number;
    canonicalObjectsPersisted: number;
    supportItemsPersisted: number;
    activeObjects: number;
    provisionalObjects: number;
    conflictHoldObjects: number;
    writeDecisionCounts: Record<string, number>;
    ignoredWindowCount: number;
    rejectedWindowCount: number;
    rejectReasons: string[];
  };
  finalRuntimeState: {
    activeMemorySlotCount: number;
    activeMemorySetCount: number;
    contextArtifactCount: number;
    projectionVersionCount: number;
  };
};

type PopulationWavePlanCandidate = Omit<PopulationWaveSource, "order" | "chunkIndex">;

type PopulationWaveProgressEvent =
  | {
      type: "phase";
      phase: "resolve_plan" | "reset_database" | "start_chunk" | "complete";
      message: string;
    }
  | {
      type: "source_start";
      index: number;
      total: number;
      chunkIndex: number;
      source: PopulationWaveSource;
      message: string;
    }
  | {
      type: "source_complete";
      index: number;
      total: number;
      chunkIndex: number;
      source: PopulationWaveSource;
      result: PopulationWaveSourceResult;
      message: string;
    };

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function mergeCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function countLifecycle(
  records: ModelMemoryObjectRecord[],
): Record<ModelMemoryLifecycleState, number> {
  return {
    provisional: records.filter((record) => record.lifecycleState === "provisional").length,
    active: records.filter((record) => (record.lifecycleState ?? "active") === "active").length,
    superseded: records.filter((record) => record.lifecycleState === "superseded").length,
    expired: records.filter((record) => record.lifecycleState === "expired").length,
    conflict_hold: records.filter((record) => record.lifecycleState === "conflict_hold").length,
  };
}

function buildTouchedObjectIds(
  supportItems: ModelMemorySupportItemRecord[],
  windowIds: Set<string>,
): Set<string> {
  return new Set(
    supportItems
      .filter((item) => windowIds.has(item.sourceWindowId))
      .map((item) => item.memoryObjectId),
  );
}

function chunkBySize<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function toPlanSources(
  candidates: PopulationWavePlanCandidate[],
  chunkSize: number,
): PopulationWaveSource[] {
  return candidates.map((candidate, index) => ({
    ...candidate,
    order: index + 1,
    chunkIndex: Math.floor(index / chunkSize) + 1,
  }));
}

function shouldIncludeTierThreeFile(relativePath: string): boolean {
  const basename = path.basename(relativePath);
  if (basename === "package.json") {
    return true;
  }
  const extension = path.extname(relativePath);
  if (![".ts", ".md", ".sql", ".json"].includes(extension)) {
    return false;
  }
  return !/(^|[.-])tests?(\.|$)/i.test(basename);
}

async function walkFiles(
  rootDirectory: string,
  allowedExtensions?: ReadonlySet<string>,
): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath, allowedExtensions)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (allowedExtensions && !allowedExtensions.has(path.extname(entry.name))) {
      continue;
    }
    files.push(absolutePath);
  }
  return files.toSorted((left, right) => left.localeCompare(right));
}

async function buildTierTwoCandidates(input: {
  repoRoot: string;
  seen: Set<string>;
}): Promise<PopulationWavePlanCandidate[]> {
  const candidates: PopulationWavePlanCandidate[] = [];
  for (const pack of TIER_TWO_PACKS) {
    const absoluteDir = path.join(input.repoRoot, pack.relativeDir);
    const absoluteFiles = await walkFiles(absoluteDir, pack.allowedExtensions);
    for (const absolutePath of absoluteFiles) {
      const relativePath = path.relative(input.repoRoot, absolutePath).replace(/\\/g, "/");
      if (input.seen.has(relativePath)) {
        continue;
      }
      input.seen.add(relativePath);
      candidates.push({
        id: `tier2-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        sourceKind: "document",
        relativePath,
        absolutePath,
        displayPath: relativePath,
        tier: "tier2_curated_repo_pack",
        packId: pack.packId,
        classification: pack.classification,
        purposes: [...pack.purposes],
      });
    }
  }
  return candidates;
}

async function buildTierThreeCandidates(input: {
  repoRoot: string;
  seen: Set<string>;
}): Promise<PopulationWavePlanCandidate[]> {
  const candidates: PopulationWavePlanCandidate[] = [];
  for (const pack of TIER_THREE_PACKS) {
    const absoluteDir = path.join(input.repoRoot, pack.relativeDir);
    const absoluteFiles = await walkFiles(absoluteDir);
    for (const absolutePath of absoluteFiles) {
      const relativePath = path.relative(input.repoRoot, absolutePath).replace(/\\/g, "/");
      if (!shouldIncludeTierThreeFile(relativePath)) {
        continue;
      }
      if (input.seen.has(relativePath)) {
        continue;
      }
      input.seen.add(relativePath);
      candidates.push({
        id: `tier3-${relativePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        sourceKind: "document",
        relativePath,
        absolutePath,
        displayPath: relativePath,
        tier: "tier3_selected_code_and_doc_pack",
        packId: pack.packId,
        classification: pack.classification,
        purposes: [...pack.purposes],
      });
    }
  }
  return candidates;
}

export function selectPopulationWaveSources(input: {
  tierOne: PopulationWavePlanCandidate[];
  tierTwo: PopulationWavePlanCandidate[];
  tierThree: PopulationWavePlanCandidate[];
  limit: number;
  chunkSize: number;
}): PopulationWavePlan {
  const orderedCandidates = [...input.tierOne, ...input.tierTwo, ...input.tierThree];
  const selected = toPlanSources(orderedCandidates.slice(0, input.limit), input.chunkSize);
  const chunks = chunkBySize(selected, input.chunkSize).map((chunk, index) => ({
    chunkIndex: index + 1,
    sourcePaths: chunk.map((source) => source.relativePath),
  }));
  const sourceSelectionNotes = [
    "Tier 1 preserves the exact declared single-document pilot order from the ingestion inventory.",
    "Tier 2 preserves the declared pack priority order: docs/projects/model-memory/specs, docs/help, docs/gateway, docs/reference/templates.",
    "Tier 2 de-duplicates files already selected in Tier 1 instead of re-ingesting them twice.",
    "Tier 3 fills the remainder only after Tier 2 is exhausted, using selected production code-and-doc packs from extensions/model-memory first and src/plugin-sdk only if still needed.",
    "Within each pack, file order is deterministic lexical order to keep chunk membership stable and inspectable.",
  ];
  return {
    generatedAt: new Date().toISOString(),
    limitRequested: input.limit,
    chunkSize: input.chunkSize,
    totalEligibleSources: orderedCandidates.length,
    selectedCount: selected.length,
    sourceSelectionNotes,
    sources: selected,
    chunks,
  };
}

export async function resolvePopulationWavePlan(input: {
  repoRoot: string;
  limit?: number;
  chunkSize?: number;
}): Promise<PopulationWavePlan> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const seen = new Set<string>();
  const tierOne: PopulationWavePlanCandidate[] = TIER_ONE_LARGE_DOCUMENT_CASES.map((entry) => {
    seen.add(entry.relativePath);
    return {
      id: entry.id,
      sourceKind: entry.sourceKind,
      relativePath: entry.relativePath,
      absolutePath: path.join(input.repoRoot, entry.relativePath),
      displayPath: entry.relativePath,
      tier: "tier1_single_document_pilot",
      packId: "tier1",
      classification: entry.classification,
      purposes: entry.purposes,
    };
  });
  const tierTwo = await buildTierTwoCandidates({ repoRoot: input.repoRoot, seen });
  const tierThree = await buildTierThreeCandidates({ repoRoot: input.repoRoot, seen });
  return selectPopulationWaveSources({
    tierOne,
    tierTwo,
    tierThree,
    limit,
    chunkSize,
  });
}

export async function executePopulationWave(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config?: OpenClawConfig;
  repoRoot: string;
  modelRef: string;
  candidateModelRef: string;
  requestTimeoutMs?: number;
  requestSeed?: number;
  maxWordsPerWindow?: number;
  limit?: number;
  chunkSize?: number;
  onProgress?: (event: PopulationWaveProgressEvent) => void | Promise<void>;
}): Promise<PopulationWaveReport> {
  const requestTimeoutMs = input.requestTimeoutMs ?? LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
  const requestSeed = input.requestSeed ?? LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;
  const maxWordsPerWindow = input.maxWordsPerWindow ?? LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;

  await input.onProgress?.({
    type: "phase",
    phase: "resolve_plan",
    message: "resolving first-100 population plan",
  });
  const plan = await resolvePopulationWavePlan({
    repoRoot: input.repoRoot,
    limit: input.limit,
    chunkSize,
  });

  await input.onProgress?.({
    type: "phase",
    phase: "reset_database",
    message: "resetting model-memory population database state",
  });
  await resetModelMemoryEvidenceDatabase(input.runtime);

  const executor = new OpenAICompatibleLiveJsonExecutor({
    config: input.config,
    requestTimeoutMs,
    requestSeed,
  });
  const interpreter = new ExecutorBackedSemanticInterpreter(executor);
  const collisionAdjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
  const memoryStore = new DatabaseMemoryObjectStore(
    input.runtime.canonicalRepository,
    collisionAdjudicator,
  );

  const sourceResults: PopulationWaveSourceResult[] = [];
  const chunkResults: PopulationWaveChunkResult[] = [];
  const chunks = chunkBySize(plan.sources, chunkSize);
  const totalSources = plan.sources.length;

  for (const [chunkOffset, chunk] of chunks.entries()) {
    await input.onProgress?.({
      type: "phase",
      phase: "start_chunk",
      message: `starting chunk ${chunkOffset + 1}/${chunks.length} with ${chunk.length} sources`,
    });

    for (const [indexWithinChunk, source] of chunk.entries()) {
      const sourceIndex = chunkOffset * chunkSize + indexWithinChunk + 1;
      await input.onProgress?.({
        type: "source_start",
        index: sourceIndex,
        total: totalSources,
        chunkIndex: source.chunkIndex,
        source,
        message: `ingesting ${sourceIndex}/${totalSources}: ${source.relativePath}`,
      });

      let resultSummary: PopulationWaveSourceResult;
      try {
        const text = await readFile(source.absolutePath, "utf8");
        const result = await ingestDocumentLive({
          canonicalRepository: input.runtime.canonicalRepository,
          runtimeRepository: input.runtime.runtimeRepository,
          memoryStore,
          collisionAdjudicator,
          rebuildRuntime: false,
          ingestion: {
            document: {
              externalSourceId: source.displayPath,
              text,
              maxWordsPerWindow,
              sourceMetadata: {
                relativePath: source.displayPath,
              },
            },
            modelId: input.modelRef,
            candidateModelId: input.candidateModelRef,
            interpreter,
          },
        });

        const snapshot = await input.runtime.canonicalRepository.snapshot();
        const windowIds = new Set(result.windows.map((window) => window.id));
        const supportItemsForSource = snapshot.supportItems.filter((item) =>
          windowIds.has(item.sourceWindowId),
        );
        const objectIds = buildTouchedObjectIds(snapshot.supportItems, windowIds);
        const objectsForSource = snapshot.memoryObjects.filter((record) =>
          objectIds.has(record.id),
        );
        const lifecycle = countLifecycle(objectsForSource);
        const rejectReasons = uniqueSorted(
          result.windowResults.flatMap((entry) =>
            entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
          ),
        );

        resultSummary = {
          source: source.relativePath,
          chunkIndex: source.chunkIndex,
          tier: source.tier,
          packId: source.packId,
          classification: source.classification,
          status: "completed",
          lineCount: countLines(text),
          windowCount: result.windows.length,
          capturedClaimCount: result.capturedObjects.length,
          persistedObjectCount: objectsForSource.length,
          persistedSupportItemCount: supportItemsForSource.length,
          activeObjectCount: lifecycle.active,
          provisionalObjectCount: lifecycle.provisional,
          conflictHoldObjectCount: lifecycle.conflict_hold,
          writeDecisionCounts: countBy(result.writeResults.map((entry) => entry.decision)),
          ignoredWindowCount: result.windowResults.filter((entry) => entry.action === "ignore")
            .length,
          rejectedWindowCount: result.windowResults.filter((entry) => entry.action === "reject")
            .length,
          rejectReasons,
        };
      } catch (error) {
        resultSummary = {
          source: source.relativePath,
          chunkIndex: source.chunkIndex,
          tier: source.tier,
          packId: source.packId,
          classification: source.classification,
          status: "failed",
          lineCount: 0,
          windowCount: 0,
          capturedClaimCount: 0,
          persistedObjectCount: 0,
          persistedSupportItemCount: 0,
          activeObjectCount: 0,
          provisionalObjectCount: 0,
          conflictHoldObjectCount: 0,
          writeDecisionCounts: {},
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }

      sourceResults.push(resultSummary);
      await input.onProgress?.({
        type: "source_complete",
        index: sourceIndex,
        total: totalSources,
        chunkIndex: source.chunkIndex,
        source,
        result: resultSummary,
        message:
          resultSummary.status === "completed"
            ? `completed ${sourceIndex}/${totalSources}: ${source.relativePath} objects=${resultSummary.persistedObjectCount} supports=${resultSummary.persistedSupportItemCount} decisions=${JSON.stringify(resultSummary.writeDecisionCounts)}`
            : `failed ${sourceIndex}/${totalSources}: ${source.relativePath} error=${resultSummary.errorMessage}`,
      });
    }

    await rebuildDerivedRuntimeState({
      canonicalRepository: input.runtime.canonicalRepository,
      runtimeRepository: input.runtime.runtimeRepository,
    });

    const chunkSourceResults = sourceResults.filter(
      (entry) => entry.chunkIndex === chunkOffset + 1,
    );
    chunkResults.push({
      chunkIndex: chunkOffset + 1,
      sourcePaths: chunk.map((source) => source.relativePath),
      attemptedCount: chunkSourceResults.length,
      completedCount: chunkSourceResults.filter((entry) => entry.status === "completed").length,
      failedCount: chunkSourceResults.filter((entry) => entry.status === "failed").length,
      persistedObjectCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.persistedObjectCount,
        0,
      ),
      persistedSupportItemCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.persistedSupportItemCount,
        0,
      ),
      activeObjectCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.activeObjectCount,
        0,
      ),
      provisionalObjectCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.provisionalObjectCount,
        0,
      ),
      conflictHoldObjectCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.conflictHoldObjectCount,
        0,
      ),
      writeDecisionCounts: chunkSourceResults.reduce<Record<string, number>>(
        (counts, entry) => mergeCounts(counts, entry.writeDecisionCounts),
        {},
      ),
      ignoredWindowCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.ignoredWindowCount,
        0,
      ),
      rejectedWindowCount: chunkSourceResults.reduce(
        (sum, entry) => sum + entry.rejectedWindowCount,
        0,
      ),
      rejectReasons: uniqueSorted(chunkSourceResults.flatMap((entry) => entry.rejectReasons)),
    });
  }

  const finalSnapshot = await input.runtime.canonicalRepository.snapshot();
  const finalRuntime = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  const finalLifecycle = countLifecycle(finalSnapshot.memoryObjects);

  const report: PopulationWaveReport = {
    generatedAt: new Date().toISOString(),
    modelRef: input.modelRef,
    candidateModelRef: input.candidateModelRef,
    requestSeed,
    requestTimeoutMs,
    maxWordsPerWindow,
    chunkSize,
    plan,
    chunkResults,
    sourceResults,
    totals: {
      docsAttempted: sourceResults.length,
      docsCompleted: sourceResults.filter((entry) => entry.status === "completed").length,
      docsFailed: sourceResults.filter((entry) => entry.status === "failed").length,
      canonicalObjectsPersisted: finalSnapshot.memoryObjects.length,
      supportItemsPersisted: finalSnapshot.supportItems.length,
      activeObjects: finalLifecycle.active,
      provisionalObjects: finalLifecycle.provisional,
      conflictHoldObjects: finalLifecycle.conflict_hold,
      writeDecisionCounts: countBy(
        finalSnapshot.writeEvents.map((entry: ModelMemoryWriteEventRecord) => entry.decision),
      ),
      ignoredWindowCount: sourceResults.reduce((sum, entry) => sum + entry.ignoredWindowCount, 0),
      rejectedWindowCount: sourceResults.reduce((sum, entry) => sum + entry.rejectedWindowCount, 0),
      rejectReasons: uniqueSorted(sourceResults.flatMap((entry) => entry.rejectReasons)),
    },
    finalRuntimeState: {
      activeMemorySlotCount: finalRuntime.activeMemorySlots.length,
      activeMemorySetCount: finalRuntime.activeMemorySets.length,
      contextArtifactCount: finalRuntime.contextArtifacts.length,
      projectionVersionCount: finalRuntime.projectionVersions.length,
    },
  };

  await input.onProgress?.({
    type: "phase",
    phase: "complete",
    message: `population wave complete: docs=${report.totals.docsCompleted}/${report.totals.docsAttempted} objects=${report.totals.canonicalObjectsPersisted} supports=${report.totals.supportItemsPersisted}`,
  });

  return report;
}

export function renderPopulationWavePlanMarkdown(plan: PopulationWavePlan): string {
  const lines: string[] = [];
  lines.push("# Model Memory First-100 Population Plan");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Generated at: ${plan.generatedAt}`);
  lines.push(`- Requested limit: ${plan.limitRequested}`);
  lines.push(`- Selected sources: ${plan.selectedCount}`);
  lines.push(`- Total eligible sources: ${plan.totalEligibleSources}`);
  lines.push(`- Chunk size: ${plan.chunkSize}`);
  lines.push("");
  lines.push("## Ordering Notes");
  lines.push("");
  for (const note of plan.sourceSelectionNotes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("## Chunks");
  lines.push("");
  for (const chunk of plan.chunks) {
    lines.push(`### Chunk ${chunk.chunkIndex}`);
    lines.push("");
    for (const sourcePath of chunk.sourcePaths) {
      lines.push(`- ${sourcePath}`);
    }
    lines.push("");
  }
  lines.push("## Ordered Sources");
  lines.push("");
  lines.push("| Order | Chunk | Tier | Pack | Classification | Source |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const source of plan.sources) {
    lines.push(
      `| ${source.order} | ${source.chunkIndex} | ${source.tier} | ${source.packId} | ${source.classification} | ${source.relativePath} |`,
    );
  }
  return lines.join("\n");
}

export function renderPopulationWaveMarkdown(report: PopulationWaveReport): string {
  const lines: string[] = [];
  lines.push("# Model Memory First-100 Population Run");
  lines.push("");
  lines.push("## Run Posture");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Pass 1 model: ${report.candidateModelRef}`);
  lines.push(`- Pass 2 model: ${report.modelRef}`);
  lines.push(`- Request seed: ${report.requestSeed ?? "unset"}`);
  lines.push(`- Request timeout ms: ${report.requestTimeoutMs}`);
  lines.push(`- Max words per window: ${report.maxWordsPerWindow}`);
  lines.push(`- Chunk size: ${report.chunkSize}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Docs attempted: ${report.totals.docsAttempted}`);
  lines.push(`- Docs completed: ${report.totals.docsCompleted}`);
  lines.push(`- Docs failed: ${report.totals.docsFailed}`);
  lines.push(`- Canonical objects persisted: ${report.totals.canonicalObjectsPersisted}`);
  lines.push(`- Support items persisted: ${report.totals.supportItemsPersisted}`);
  lines.push(`- Active objects: ${report.totals.activeObjects}`);
  lines.push(`- Provisional objects: ${report.totals.provisionalObjects}`);
  lines.push(`- Conflict-hold objects: ${report.totals.conflictHoldObjects}`);
  lines.push(`- Write decisions: ${JSON.stringify(report.totals.writeDecisionCounts)}`);
  lines.push(`- Ignored windows: ${report.totals.ignoredWindowCount}`);
  lines.push(`- Rejected windows: ${report.totals.rejectedWindowCount}`);
  lines.push(
    `- Reject reasons: ${report.totals.rejectReasons.length > 0 ? report.totals.rejectReasons.join(", ") : "none"}`,
  );
  lines.push("");
  lines.push("## Chunk Results");
  lines.push("");
  for (const chunk of report.chunkResults) {
    lines.push(`### Chunk ${chunk.chunkIndex}`);
    lines.push("");
    lines.push(`- Sources: ${chunk.sourcePaths.join(", ")}`);
    lines.push(`- Attempted: ${chunk.attemptedCount}`);
    lines.push(`- Completed: ${chunk.completedCount}`);
    lines.push(`- Failed: ${chunk.failedCount}`);
    lines.push(`- Objects persisted: ${chunk.persistedObjectCount}`);
    lines.push(`- Support items persisted: ${chunk.persistedSupportItemCount}`);
    lines.push(`- Active objects touched: ${chunk.activeObjectCount}`);
    lines.push(`- Provisional objects touched: ${chunk.provisionalObjectCount}`);
    lines.push(`- Conflict-hold objects touched: ${chunk.conflictHoldObjectCount}`);
    lines.push(`- Write decisions: ${JSON.stringify(chunk.writeDecisionCounts)}`);
    lines.push(`- Ignored windows: ${chunk.ignoredWindowCount}`);
    lines.push(`- Rejected windows: ${chunk.rejectedWindowCount}`);
    lines.push(
      `- Reject reasons: ${chunk.rejectReasons.length > 0 ? chunk.rejectReasons.join(", ") : "none"}`,
    );
    lines.push("");
  }
  lines.push("## Source Results");
  lines.push("");
  lines.push(
    "| Chunk | Status | Tier | Pack | Source | Objects | Supports | Active | Provisional | Conflict Hold | Decisions | Rejects |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const source of report.sourceResults) {
    const decisionSummary =
      Object.keys(source.writeDecisionCounts).length > 0
        ? JSON.stringify(source.writeDecisionCounts)
        : "{}";
    const rejectSummary =
      source.status === "failed"
        ? (source.errorMessage ?? "failed")
        : source.rejectReasons.length > 0
          ? source.rejectReasons.join(", ")
          : "none";
    lines.push(
      `| ${source.chunkIndex} | ${source.status} | ${source.tier} | ${source.packId} | ${source.source} | ${source.persistedObjectCount} | ${source.persistedSupportItemCount} | ${source.activeObjectCount} | ${source.provisionalObjectCount} | ${source.conflictHoldObjectCount} | ${decisionSummary} | ${rejectSummary.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push("## Final Runtime State");
  lines.push("");
  lines.push(`- Active memory slots: ${report.finalRuntimeState.activeMemorySlotCount}`);
  lines.push(`- Active memory sets: ${report.finalRuntimeState.activeMemorySetCount}`);
  lines.push(`- Context artifacts: ${report.finalRuntimeState.contextArtifactCount}`);
  lines.push(`- Projection versions: ${report.finalRuntimeState.projectionVersionCount}`);
  return lines.join("\n");
}
