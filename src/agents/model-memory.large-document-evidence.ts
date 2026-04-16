import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CanonicalClassSchema,
  ExecutorBackedSemanticInterpreter,
  MemoryKindSchema,
  type ModelMemoryObjectRecord,
  type ModelMemorySupportItemRecord,
  type RuntimeRebuildResult,
  ingestDocumentLive,
} from "../../extensions/model-memory/runtime-api.ts";
import type {
  ContextArtifactRecord,
  WorkspaceProjectionVersionRecord,
} from "../../extensions/model-memory/runtime-api.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../../extensions/model-memory/runtime-api.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../../extensions/model-memory/src/semantic-interpreter.ts";
import type { ModelMemoryObject } from "../../extensions/model-memory/src/semantic-schema.ts";
import type { ModelMemorySourceKind } from "../../extensions/model-memory/src/storage-database-contract.ts";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.js";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.js";

export type LargeDocumentEvaluationPurpose =
  | "omission_discipline"
  | "rule_extraction"
  | "procedure_extraction"
  | "reference_extraction"
  | "architecture_fact_extraction"
  | "proof_fixture_contamination_risk";

export type LargeDocumentClassification =
  | "primary_large_source_proof_input"
  | "bootstrap_preservation_sensitive_input"
  | "migration_only_historical_input";

export type TierOneLargeDocumentCase = {
  id: string;
  relativePath: string;
  sourceKind: ModelMemorySourceKind;
  purposes: LargeDocumentEvaluationPurpose[];
  classification: LargeDocumentClassification;
};

export type LargeDocumentObjectSummary = {
  identityKey: string;
  canonicalClass: ModelMemoryObject["canonicalClass"];
  kind: ModelMemoryObject["kind"];
  payload: Record<string, unknown>;
  scope: Record<string, unknown>;
  provenanceCount: number;
  firstHeadingPath: string[];
  lineStart?: number;
  lineEnd?: number;
};

export type LargeDocumentRunSummary = {
  sourceId: string;
  windowCount: number;
  elapsedMs: number;
  requestSeed?: number;
  requestTimeoutMs: number;
  executionRequestCount: number;
  executionContractVersionCounts: Record<string, number>;
  executionResolvedModelIds: string[];
  executionResolvedModelIdsByContractVersion: Record<string, string[]>;
  executionTracesByContractVersion: Record<string, LargeDocumentExecutionTrace[]>;
  capturedObjectCount: number;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  writeDecisionCounts: Record<string, number>;
  objectSummaries: LargeDocumentObjectSummary[];
  projectionContentHashes: Record<string, string>;
  contextArtifactHashes: Record<string, string>;
  activeMemorySlotCount: number;
  activeMemorySetCount: number;
  projectionVersionCount: number;
  contextArtifactCount: number;
  provenanceValid: boolean;
  rejectReasons: string[];
  executed: boolean;
};

export type LargeDocumentExecutionTrace = {
  sourceWindowId: string;
  action: "ignore" | "capture";
  objectCount: number;
  summaries: string[];
};

export type LargeDocumentCaseEvidence = {
  id: string;
  relativePath: string;
  sourceKind: ModelMemorySourceKind;
  lineCount: number;
  purposes: LargeDocumentEvaluationPurpose[];
  classification: LargeDocumentClassification;
  firstRun: LargeDocumentRunSummary;
  secondRun: LargeDocumentRunSummary;
  omissionFindings: string[];
  provenanceFindings: string[];
  duplicateFindings: string[];
  rebuildFindings: string[];
};

export type LargeDocumentEvidenceReport = {
  generatedAt: string;
  modelRef: string;
  candidateModelRef: string;
  requestSeed?: number;
  requestTimeoutMs: number;
  databaseName: string;
  maxWordsPerWindow: number;
  rerunMode: "full" | "first_run_only";
  cases: LargeDocumentCaseEvidence[];
};

const MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW_ENV = "MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW";
const MODEL_MEMORY_EVIDENCE_REQUEST_TIMEOUT_ENV = "MODEL_MEMORY_REQUEST_TIMEOUT_MS";
const MODEL_MEMORY_EVIDENCE_REQUEST_SEED_ENV = "MODEL_MEMORY_REQUEST_SEED";

// Large-document evidence should avoid both monolithic whole-doc prompts and
// excessively fine-grained micro-chunking. Use a moderate structural budget so
// the probe lane stays fast enough to compare stability honestly.
export const LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW = 1_500;
export const LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS = 180_000;
export const LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED = 7;

type ModelExecutionEvent = {
  contractVersion: string;
  configuredModelId: string;
  resolvedModelId: string;
};

type LargeDocumentExecutionMetadata = {
  requestCount: number;
  contractVersionCounts: Record<string, number>;
  resolvedModelIds: string[];
  resolvedModelIdsByContractVersion: Record<string, string[]>;
};

type SemanticInterpreterTraceEvent = {
  contractVersion: string;
  sourceWindowId: string;
  action: "ignore" | "capture";
  objectCount: number;
  summaries: string[];
};

type SemanticInterpreterTraceMetadata = {
  tracesByContractVersion: Record<string, LargeDocumentExecutionTrace[]>;
};

class RecordingJsonExecutor implements JsonModelExecutor {
  private events: ModelExecutionEvent[] = [];

  constructor(private readonly delegate: JsonModelExecutor) {}

  reset(): void {
    this.events = [];
  }

  takeEvents(): ModelExecutionEvent[] {
    const snapshot = this.events.slice();
    this.events = [];
    return snapshot;
  }

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    const response = await this.delegate.execute(request);
    this.events.push({
      contractVersion: request.contract.contractVersion,
      configuredModelId: request.contract.modelId,
      resolvedModelId: response.resolvedModelId ?? request.contract.modelId,
    });
    return response;
  }
}

class RecordingSemanticInterpreter implements SemanticInterpreter {
  private events: SemanticInterpreterTraceEvent[] = [];

  constructor(private readonly delegate: SemanticInterpreter) {}

  reset(): void {
    this.events = [];
  }

  takeEvents(): SemanticInterpreterTraceEvent[] {
    const snapshot = this.events.slice();
    this.events = [];
    return snapshot;
  }

  async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
    const result = await this.delegate.interpret(input);
    this.events.push({
      contractVersion: input.prompt.contract.contractVersion,
      sourceWindowId: input.sourceWindow.id,
      action: result.action,
      objectCount: result.action === "capture" ? result.objects.length : 0,
      summaries: result.action === "capture" ? summarizeTraceObjects(result.objects) : [],
    });
    return result;
  }
}

function resolveOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveLargeDocumentEvidenceMaxWordsPerWindow(explicitValue?: number): number {
  if (explicitValue !== undefined && Number.isFinite(explicitValue) && explicitValue > 0) {
    return Math.floor(explicitValue);
  }

  const envValue = process.env[MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW_ENV]?.trim();
  if (!envValue) {
    return LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
  }

  const parsed = Number.parseInt(envValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
}

function resolveLargeDocumentEvidenceRequestTimeoutMs(explicitValue?: number): number {
  if (explicitValue !== undefined && Number.isFinite(explicitValue) && explicitValue > 0) {
    return Math.floor(explicitValue);
  }

  return (
    resolveOptionalPositiveInteger(process.env[MODEL_MEMORY_EVIDENCE_REQUEST_TIMEOUT_ENV]) ??
    LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS
  );
}

function resolveLargeDocumentEvidenceRequestSeed(explicitValue?: number): number {
  if (explicitValue !== undefined && Number.isInteger(explicitValue) && explicitValue > 0) {
    return explicitValue;
  }

  return (
    resolveOptionalPositiveInteger(process.env[MODEL_MEMORY_EVIDENCE_REQUEST_SEED_ENV]) ??
    LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED
  );
}

function summarizeExecutionEvents(events: ModelExecutionEvent[]): LargeDocumentExecutionMetadata {
  const contractVersionCounts = countBy(events.map((entry) => entry.contractVersion));
  const resolvedModelIds = Array.from(
    new Set(events.map((entry) => entry.resolvedModelId)),
  ).toSorted((left, right) => left.localeCompare(right));
  const resolvedModelIdsByContractVersion = Object.fromEntries(
    Object.entries(
      events.reduce<Record<string, string[]>>((acc, entry) => {
        const current = acc[entry.contractVersion] ?? [];
        if (!current.includes(entry.resolvedModelId)) {
          current.push(entry.resolvedModelId);
        }
        acc[entry.contractVersion] = current;
        return acc;
      }, {}),
    ).map(([contractVersion, modelIds]) => [
      contractVersion,
      modelIds.toSorted((left, right) => left.localeCompare(right)),
    ]),
  );

  return {
    requestCount: events.length,
    contractVersionCounts,
    resolvedModelIds,
    resolvedModelIdsByContractVersion,
  };
}

function normalizeDiagnosticText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(",")}}`;
}

function summarizeTraceObject(rawObject: unknown): string {
  if (!rawObject || typeof rawObject !== "object") {
    return stableStringify(rawObject);
  }

  const record = rawObject as Record<string, unknown>;
  const candidateType = typeof record.candidateType === "string" ? record.candidateType : undefined;
  const claim =
    typeof record.claim === "string" ? normalizeDiagnosticText(record.claim) : undefined;
  if (candidateType && claim) {
    return `${candidateType}:${claim}`;
  }

  const canonicalClass =
    typeof record.canonicalClass === "string" ? record.canonicalClass : undefined;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  if (canonicalClass && kind) {
    const payload = stableStringify(record.payload ?? {});
    const scope = stableStringify(record.scope ?? {});
    return `${canonicalClass}/${kind} payload=${payload} scope=${scope}`;
  }

  return stableStringify(rawObject);
}

function summarizeTraceObjects(objects: unknown[]): string[] {
  return objects.map((entry) => summarizeTraceObject(entry));
}

function summarizeInterpreterTraceEvents(
  events: SemanticInterpreterTraceEvent[],
): SemanticInterpreterTraceMetadata {
  const grouped = events.reduce<Record<string, LargeDocumentExecutionTrace[]>>((acc, event) => {
    const current = acc[event.contractVersion] ?? [];
    current.push({
      sourceWindowId: event.sourceWindowId,
      action: event.action,
      objectCount: event.objectCount,
      summaries: event.summaries,
    });
    acc[event.contractVersion] = current;
    return acc;
  }, {});

  return {
    tracesByContractVersion: Object.fromEntries(
      Object.entries(grouped).map(([contractVersion, traces]) => [
        contractVersion,
        traces.map((trace) => ({
          ...trace,
          summaries: trace.summaries.slice(),
        })),
      ]),
    ),
  };
}

function summarizeContractTraceCounts(
  tracesByContractVersion: Record<string, LargeDocumentExecutionTrace[]>,
): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(tracesByContractVersion)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([contractVersion, traces]) => [
        contractVersion,
        traces.map((trace) => trace.objectCount),
      ]),
  );
}

export const TIER_ONE_LARGE_DOCUMENT_CASES: TierOneLargeDocumentCase[] = [
  {
    id: "tier1-agents",
    relativePath: "AGENTS.md",
    sourceKind: "document",
    purposes: ["rule_extraction", "reference_extraction", "omission_discipline"],
    classification: "bootstrap_preservation_sensitive_input",
  },
  {
    id: "tier1-docs-help-testing",
    relativePath: "docs/help/testing.md",
    sourceKind: "document",
    purposes: ["procedure_extraction", "omission_discipline"],
    classification: "primary_large_source_proof_input",
  },
  {
    id: "tier1-gateway-configuration",
    relativePath: "docs/gateway/configuration.md",
    sourceKind: "document",
    purposes: ["reference_extraction", "omission_discipline"],
    classification: "primary_large_source_proof_input",
  },
  {
    id: "tier1-gateway-protocol",
    relativePath: "docs/gateway/protocol.md",
    sourceKind: "document",
    purposes: ["reference_extraction", "architecture_fact_extraction"],
    classification: "primary_large_source_proof_input",
  },
  {
    id: "tier1-model-memory-db-schema",
    relativePath: "docs/projects/model-memory/specs/database-schema-v1.md",
    sourceKind: "document",
    purposes: ["architecture_fact_extraction", "omission_discipline"],
    classification: "primary_large_source_proof_input",
  },
  {
    id: "tier1-model-memory-proof-corpus-plan",
    relativePath: "docs/projects/model-memory/proof-corpus-plan.md",
    sourceKind: "document",
    purposes: ["proof_fixture_contamination_risk", "omission_discipline"],
    classification: "primary_large_source_proof_input",
  },
];

const RESET_TABLES_SQL = `
TRUNCATE TABLE
  runtime_context.context_run_segments,
  runtime_context.context_runs,
  runtime_context.retrieval_result_items,
  runtime_context.retrieval_result_sets,
  runtime_context.retrieval_requests,
  runtime_context.workspace_projection_versions,
  runtime_context.workspace_projection_targets,
  runtime_context.context_artifacts,
  runtime_context.session_context_state,
  runtime_context.active_memory_sets,
  runtime_context.active_memory_slots,
  model_memory.supersession_links,
  model_memory.write_events,
  model_memory.memory_support_items,
  model_memory.memory_objects,
  model_memory.source_windows,
  model_memory.sources
RESTART IDENTITY CASCADE
`;

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function summarizeObject(
  record: ModelMemoryObjectRecord,
  supportItems: ModelMemorySupportItemRecord[],
): LargeDocumentObjectSummary {
  const provenance = supportItems.flatMap((item) => item.provenance);
  const firstSpan = provenance[0];
  const firstHeadingPath = Array.isArray(firstSpan?.headingPath)
    ? firstSpan.headingPath.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    identityKey: record.identityKey,
    canonicalClass: CanonicalClassSchema.parse(record.canonicalClass),
    kind: MemoryKindSchema.parse(record.kind),
    payload: record.payload,
    scope: record.scope,
    provenanceCount: provenance.length,
    firstHeadingPath,
    lineStart: typeof firstSpan?.lineStart === "number" ? firstSpan.lineStart : undefined,
    lineEnd: typeof firstSpan?.lineEnd === "number" ? firstSpan.lineEnd : undefined,
  };
}

function buildProjectionHashMap(
  projectionVersions: WorkspaceProjectionVersionRecord[],
): Record<string, string> {
  return Object.fromEntries(
    projectionVersions.map((entry) => [entry.targetId, entry.contentHash] as const),
  );
}

function buildArtifactHashMap(artifacts: ContextArtifactRecord[]): Record<string, string> {
  return Object.fromEntries(
    artifacts.map(
      (entry) =>
        [`${entry.artifactType}:${entry.scopeKey ?? "global"}`, entry.contentHash] as const,
    ),
  );
}

function summarizeRejectReasons(messages: string[]): string[] {
  return messages
    .filter((code, index, all) => all.indexOf(code) === index)
    .toSorted((left, right) => left.localeCompare(right));
}

function allProvenanceValid(
  supportItemsByObjectId: Map<string, ModelMemorySupportItemRecord[]>,
  records: ModelMemoryObjectRecord[],
): boolean {
  return records.every((record) =>
    (supportItemsByObjectId.get(record.id) ?? []).some(
      (item) =>
        item.provenance.length > 0 &&
        item.provenance.every((span) => Array.isArray(span.headingPath)),
    ),
  );
}

function buildOmissionFindings(caseEvidence: {
  capturedObjectCount: number;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  classification: LargeDocumentClassification;
  purposes: LargeDocumentEvaluationPurpose[];
}): string[] {
  const findings: string[] = [];
  if (caseEvidence.capturedObjectCount === 0 && caseEvidence.rejectedWindowCount === 0) {
    findings.push("valid_omission_candidate");
  }
  if (caseEvidence.rejectedWindowCount > 0) {
    findings.push("no_persisted_objects_due_to_rejection");
  }
  if (caseEvidence.ignoredWindowCount > 0) {
    findings.push("ignore_path_exercised");
  }
  if (caseEvidence.classification === "bootstrap_preservation_sensitive_input") {
    findings.push("bootstrap_sensitive_review_required");
  }
  if (caseEvidence.purposes.includes("proof_fixture_contamination_risk")) {
    findings.push("fixture_contamination_audit_required");
  }
  return findings;
}

function buildProvenanceFindings(run: LargeDocumentRunSummary): string[] {
  const findings: string[] = [];
  if (run.capturedObjectCount === 0) {
    findings.push("no_persisted_objects_for_provenance_audit");
  } else if (run.provenanceValid) {
    findings.push("all_captured_objects_have_structured_provenance");
  } else {
    findings.push("invalid_provenance_detected");
  }
  if (run.windowCount > 1) {
    findings.push("multi_window_chunking_exercised");
  }
  return findings;
}

function buildDuplicateFindings(
  firstRun: LargeDocumentRunSummary,
  secondRun: LargeDocumentRunSummary,
): string[] {
  const findings: string[] = [];
  if ((firstRun.writeDecisionCounts.attach_support ?? 0) > 0) {
    findings.push("intra_document_support_attachment_observed");
  }
  if (
    firstRun.capturedObjectCount > 0 &&
    (secondRun.writeDecisionCounts.attach_support ?? 0) === firstRun.capturedObjectCount
  ) {
    findings.push("full_rerun_support_attachment_stability");
  }
  if (!secondRun.executed) {
    findings.push("rerun_skipped_after_no_persisted_objects");
  }
  if ((secondRun.writeDecisionCounts.write ?? 0) > 0) {
    findings.push("rerun_created_new_objects");
  }
  return findings;
}

function buildRebuildFindings(
  firstRun: LargeDocumentRunSummary,
  secondRun: LargeDocumentRunSummary,
): string[] {
  const findings: string[] = [];
  if (
    JSON.stringify(firstRun.projectionContentHashes) ===
    JSON.stringify(secondRun.projectionContentHashes)
  ) {
    findings.push("projection_hashes_stable_on_rerun");
  } else {
    findings.push("projection_hashes_changed_on_rerun");
  }
  if (
    JSON.stringify(firstRun.contextArtifactHashes) ===
    JSON.stringify(secondRun.contextArtifactHashes)
  ) {
    findings.push("artifact_hashes_stable_on_rerun");
  } else {
    findings.push("artifact_hashes_changed_on_rerun");
  }
  if (
    firstRun.activeMemorySlotCount === secondRun.activeMemorySlotCount &&
    firstRun.activeMemorySetCount === secondRun.activeMemorySetCount
  ) {
    findings.push("derived_materialization_counts_stable_on_rerun");
  } else {
    findings.push("derived_materialization_counts_changed_on_rerun");
  }
  if (!secondRun.executed) {
    findings.push("rebuild_rerun_skipped_after_no_persisted_objects");
  }
  return findings;
}

async function summarizeLatestState(
  runtime: ModelMemoryDatabaseRuntime,
  sourceId: string,
  ingestResult: RuntimeRebuildResult | undefined,
  windowCount: number,
  elapsedMs: number,
  requestSeed: number,
  requestTimeoutMs: number,
  executionMetadata: LargeDocumentExecutionMetadata,
  interpreterMetadata: SemanticInterpreterTraceMetadata,
  writeResults: Array<{ decision: string }>,
  ignoredWindowCount: number,
  rejectedWindowCount: number,
  rejectMessages: string[],
): Promise<LargeDocumentRunSummary> {
  const allObjects = await runtime.canonicalRepository.listMemoryObjects();
  const allSupportItems = await runtime.canonicalRepository.listSupportItems();
  const sourceWindows = await runtime.canonicalRepository.listSourceWindows(sourceId);
  const windowIds = new Set(sourceWindows.map((window) => window.id));
  const supportItemsForSource = allSupportItems.filter((item) =>
    windowIds.has(item.sourceWindowId),
  );
  const objectIdsForSource = new Set(supportItemsForSource.map((item) => item.memoryObjectId));
  const objectsForSource = allObjects.filter((record) => objectIdsForSource.has(record.id));
  const supportItemsByObjectId = supportItemsForSource.reduce<
    Map<string, ModelMemorySupportItemRecord[]>
  >((acc, item) => {
    const current = acc.get(item.memoryObjectId) ?? [];
    current.push(item);
    acc.set(item.memoryObjectId, current);
    return acc;
  }, new Map());
  const rebuild = ingestResult ?? {
    activeMemorySlots: await runtime.runtimeRepository.listActiveMemorySlots(),
    activeMemorySets: await runtime.runtimeRepository.listActiveMemorySets(),
    contextArtifacts: await runtime.runtimeRepository.listContextArtifacts(),
    projectionVersions: await runtime.runtimeRepository.listProjectionVersions(),
  };

  return {
    sourceId,
    windowCount,
    elapsedMs,
    requestSeed,
    requestTimeoutMs,
    executionRequestCount: executionMetadata.requestCount,
    executionContractVersionCounts: executionMetadata.contractVersionCounts,
    executionResolvedModelIds: executionMetadata.resolvedModelIds,
    executionResolvedModelIdsByContractVersion: executionMetadata.resolvedModelIdsByContractVersion,
    executionTracesByContractVersion: interpreterMetadata.tracesByContractVersion,
    capturedObjectCount: objectsForSource.length,
    ignoredWindowCount,
    rejectedWindowCount,
    writeDecisionCounts: countBy(writeResults.map((entry) => entry.decision)),
    objectSummaries: objectsForSource.map((record) =>
      summarizeObject(record, supportItemsByObjectId.get(record.id) ?? []),
    ),
    projectionContentHashes: buildProjectionHashMap(rebuild.projectionVersions),
    contextArtifactHashes: buildArtifactHashMap(rebuild.contextArtifacts),
    activeMemorySlotCount: rebuild.activeMemorySlots.length,
    activeMemorySetCount: rebuild.activeMemorySets.length,
    projectionVersionCount: rebuild.projectionVersions.length,
    contextArtifactCount: rebuild.contextArtifacts.length,
    provenanceValid: allProvenanceValid(supportItemsByObjectId, objectsForSource),
    rejectReasons: summarizeRejectReasons(rejectMessages),
    executed: true,
  };
}

export async function resetModelMemoryEvidenceDatabase(
  runtime: ModelMemoryDatabaseRuntime,
): Promise<void> {
  await runtime.sqlClient.query(RESET_TABLES_SQL);
}

export async function executeLargeDocumentEvidencePhase(input: {
  runtime: ModelMemoryDatabaseRuntime;
  repoRoot: string;
  modelRef: string;
  candidateModelRef?: string;
  rerunMode?: "full" | "first_run_only";
  maxWordsPerWindow?: number;
  requestTimeoutMs?: number;
  requestSeed?: number;
  cases?: TierOneLargeDocumentCase[];
  preserveState?: boolean;
  onCaseStart?: (entry: TierOneLargeDocumentCase) => void;
  onCaseComplete?: (entry: LargeDocumentCaseEvidence) => void;
}): Promise<LargeDocumentEvidenceReport> {
  const cases = input.cases ?? TIER_ONE_LARGE_DOCUMENT_CASES;
  const requestTimeoutMs = resolveLargeDocumentEvidenceRequestTimeoutMs(input.requestTimeoutMs);
  const requestSeed = resolveLargeDocumentEvidenceRequestSeed(input.requestSeed);
  const executor = new RecordingJsonExecutor(
    new OpenAICompatibleLiveJsonExecutor({
      requestTimeoutMs,
      requestSeed,
    }),
  );
  const interpreter = new RecordingSemanticInterpreter(
    new ExecutorBackedSemanticInterpreter(executor),
  );
  const results: LargeDocumentCaseEvidence[] = [];
  const rerunMode = input.rerunMode ?? "full";
  const maxWordsPerWindow = resolveLargeDocumentEvidenceMaxWordsPerWindow(input.maxWordsPerWindow);

  for (const caseDefinition of cases) {
    input.onCaseStart?.(caseDefinition);
    await resetModelMemoryEvidenceDatabase(input.runtime);

    const absolutePath = path.join(input.repoRoot, caseDefinition.relativePath);
    const text = await readFile(absolutePath, "utf8");
    const lineCount = countLines(text);

    const firstRunStartedAt = Date.now();
    executor.reset();
    interpreter.reset();
    const firstResult = await ingestDocumentLive({
      canonicalRepository: input.runtime.canonicalRepository,
      runtimeRepository: input.runtime.runtimeRepository,
      memoryStore: input.runtime.memoryStore,
      rebuildRuntime: true,
      ingestion: {
        document: {
          externalSourceId: caseDefinition.relativePath,
          text,
          maxWordsPerWindow,
          sourceMetadata: {
            relativePath: caseDefinition.relativePath,
          },
        },
        modelId: input.modelRef,
        candidateModelId: input.candidateModelRef ?? input.modelRef,
        interpreter,
      },
    });
    const firstRunExecutionMetadata = summarizeExecutionEvents(executor.takeEvents());
    const firstRunInterpreterMetadata = summarizeInterpreterTraceEvents(interpreter.takeEvents());

    const firstRun = await summarizeLatestState(
      input.runtime,
      firstResult.source.id,
      firstResult.rebuild,
      firstResult.windows.length,
      Date.now() - firstRunStartedAt,
      requestSeed,
      requestTimeoutMs,
      firstRunExecutionMetadata,
      firstRunInterpreterMetadata,
      firstResult.writeResults.map((entry) => ({ decision: entry.decision })),
      firstResult.windowResults.filter((entry) => entry.action === "ignore").length,
      firstResult.windowResults.filter((entry) => entry.action === "reject").length,
      firstResult.windowResults.flatMap((entry) =>
        entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
      ),
    );

    const secondRun =
      rerunMode === "first_run_only" || firstRun.capturedObjectCount === 0
        ? {
            ...firstRun,
            executed: false,
          }
        : await (async () => {
            const secondRunStartedAt = Date.now();
            executor.reset();
            interpreter.reset();
            const secondResult = await ingestDocumentLive({
              canonicalRepository: input.runtime.canonicalRepository,
              runtimeRepository: input.runtime.runtimeRepository,
              memoryStore: input.runtime.memoryStore,
              rebuildRuntime: true,
              ingestion: {
                document: {
                  externalSourceId: caseDefinition.relativePath,
                  text,
                  maxWordsPerWindow,
                  sourceMetadata: {
                    relativePath: caseDefinition.relativePath,
                  },
                },
                modelId: input.modelRef,
                candidateModelId: input.candidateModelRef ?? input.modelRef,
                interpreter,
              },
            });
            const secondRunExecutionMetadata = summarizeExecutionEvents(executor.takeEvents());
            const secondRunInterpreterMetadata = summarizeInterpreterTraceEvents(
              interpreter.takeEvents(),
            );

            return summarizeLatestState(
              input.runtime,
              secondResult.source.id,
              secondResult.rebuild,
              secondResult.windows.length,
              Date.now() - secondRunStartedAt,
              requestSeed,
              requestTimeoutMs,
              secondRunExecutionMetadata,
              secondRunInterpreterMetadata,
              secondResult.writeResults.map((entry) => ({ decision: entry.decision })),
              secondResult.windowResults.filter((entry) => entry.action === "ignore").length,
              secondResult.windowResults.filter((entry) => entry.action === "reject").length,
              secondResult.windowResults.flatMap((entry) =>
                entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
              ),
            );
          })();

    const caseEvidence = {
      id: caseDefinition.id,
      relativePath: caseDefinition.relativePath,
      sourceKind: caseDefinition.sourceKind,
      lineCount,
      purposes: caseDefinition.purposes,
      classification: caseDefinition.classification,
      omissionFindings: buildOmissionFindings({
        capturedObjectCount: firstRun.capturedObjectCount,
        ignoredWindowCount: firstRun.ignoredWindowCount,
        rejectedWindowCount: firstRun.rejectedWindowCount,
        classification: caseDefinition.classification,
        purposes: caseDefinition.purposes,
      }),
      provenanceFindings: buildProvenanceFindings(firstRun),
      duplicateFindings: buildDuplicateFindings(firstRun, secondRun),
      rebuildFindings: buildRebuildFindings(firstRun, secondRun),
      firstRun,
      secondRun,
    };
    results.push(caseEvidence);
    input.onCaseComplete?.(caseEvidence);
  }

  if (!input.preserveState) {
    await resetModelMemoryEvidenceDatabase(input.runtime);
  }

  return {
    generatedAt: new Date().toISOString(),
    modelRef: input.modelRef,
    candidateModelRef: input.candidateModelRef ?? input.modelRef,
    requestSeed,
    requestTimeoutMs,
    databaseName: input.runtime.resolution.databaseName,
    maxWordsPerWindow,
    rerunMode,
    cases: results,
  };
}

export function renderLargeDocumentEvidenceMarkdown(report: LargeDocumentEvidenceReport): string {
  const lines: string[] = [];
  lines.push("# Model Memory Large-Document Evidence");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Model: ${report.modelRef}`);
  lines.push(`- Candidate model: ${report.candidateModelRef}`);
  lines.push(`- Request seed: ${report.requestSeed ?? "none"}`);
  lines.push(`- Request timeout ms: ${report.requestTimeoutMs}`);
  lines.push(`- Database: ${report.databaseName}`);
  lines.push(`- Max words per window: ${report.maxWordsPerWindow}`);
  lines.push(`- Rerun mode: ${report.rerunMode}`);
  lines.push("");

  for (const entry of report.cases) {
    lines.push(`## ${entry.relativePath}`);
    lines.push("");
    lines.push(`- Line count: ${entry.lineCount}`);
    lines.push(`- Purposes: ${entry.purposes.join(", ")}`);
    lines.push(`- Classification: ${entry.classification}`);
    lines.push(`- First run captured objects: ${entry.firstRun.capturedObjectCount}`);
    lines.push(`- First run elapsed ms: ${entry.firstRun.elapsedMs}`);
    lines.push(`- First run request seed: ${entry.firstRun.requestSeed ?? "none"}`);
    lines.push(`- First run request timeout ms: ${entry.firstRun.requestTimeoutMs}`);
    lines.push(`- First run execution request count: ${entry.firstRun.executionRequestCount}`);
    lines.push(
      `- First run resolved models: ${entry.firstRun.executionResolvedModelIds.join(", ") || "none"}`,
    );
    lines.push(
      `- First run contract object counts: ${JSON.stringify(summarizeContractTraceCounts(entry.firstRun.executionTracesByContractVersion))}`,
    );
    lines.push(
      `- First run write decisions: ${JSON.stringify(entry.firstRun.writeDecisionCounts)}`,
    );
    lines.push(`- Second run elapsed ms: ${entry.secondRun.elapsedMs}`);
    lines.push(`- Second run request seed: ${entry.secondRun.requestSeed ?? "none"}`);
    lines.push(`- Second run request timeout ms: ${entry.secondRun.requestTimeoutMs}`);
    lines.push(`- Second run execution request count: ${entry.secondRun.executionRequestCount}`);
    lines.push(
      `- Second run resolved models: ${entry.secondRun.executionResolvedModelIds.join(", ") || "none"}`,
    );
    lines.push(
      `- Second run contract object counts: ${JSON.stringify(summarizeContractTraceCounts(entry.secondRun.executionTracesByContractVersion))}`,
    );
    lines.push(
      `- Second run write decisions: ${JSON.stringify(entry.secondRun.writeDecisionCounts)}`,
    );
    lines.push(`- Omission findings: ${entry.omissionFindings.join(", ") || "none"}`);
    lines.push(`- Provenance findings: ${entry.provenanceFindings.join(", ") || "none"}`);
    lines.push(`- Duplicate findings: ${entry.duplicateFindings.join(", ") || "none"}`);
    lines.push(`- Rebuild findings: ${entry.rebuildFindings.join(", ") || "none"}`);
    lines.push("");

    if (entry.firstRun.objectSummaries.length > 0) {
      lines.push("### First-run objects");
      lines.push("");
      for (const object of entry.firstRun.objectSummaries) {
        lines.push(
          `- ${object.canonicalClass}/${object.kind} ${JSON.stringify(object.payload)} ` +
            `scope=${JSON.stringify(object.scope)} provenance=${object.firstHeadingPath.join(" > ") || "root"}`,
        );
      }
      lines.push("");
    } else {
      lines.push("### First-run objects");
      lines.push("");
      lines.push("- none");
      lines.push("");
    }
  }

  return lines.join("\n");
}
