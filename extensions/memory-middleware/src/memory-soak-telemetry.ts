import { createHash } from "node:crypto";
import { mkdir, appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginLogger } from "../api.js";
import type {
  CandidateRecord,
  MemoryObjectRecord,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  RetrievedMemoryRecord,
} from "./db/runtime.js";
import type { LearnedGuidanceAdvisoryPlanningResult } from "./learned-guidance-advisory-planning.js";
import {
  readCanonicalFirstMetadataString,
  readCanonicalMemoryRecordFromMetadata,
} from "./memory-canonical-compat.js";
import { resolveNativeMemoryProjectionScope } from "./native-memory-projection-scope.js";

export const MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION = 1 as const;

export type MemorySoakTelemetryCategory =
  | "capture"
  | "retrieval"
  | "application"
  | "review"
  | "projection"
  | "orchestration";

export type MemorySoakTelemetryScope =
  | "shared"
  | "project"
  | "agent"
  | "agent_project"
  | "session"
  | "unknown";

export type MemorySoakTelemetryFamily =
  | "preference"
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need"
  | "procedure"
  | "reference"
  | "other";

export type MemorySoakDemandSignal =
  | "source_heavy_prompt"
  | "research_packet_request"
  | "bulk_memory_packet_request"
  | "topic_brief_request"
  | "corpus_ingestion_request"
  | "fact_dense_session_memory"
  | "compaction_pressure_high";

export type MemorySoakTelemetryRecordState = "approved" | "candidate" | "validated" | "unknown";

export type MemorySoakTopRetrievedRecord = {
  id: string;
  family: MemorySoakTelemetryFamily;
  scope: MemorySoakTelemetryScope;
  state: MemorySoakTelemetryRecordState;
  score: number;
  matchedFields: string[];
  subjectKey?: string;
};

type MemorySoakTelemetryBaseEvent = {
  schemaVersion: typeof MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION;
  recordedAt: string;
  category: MemorySoakTelemetryCategory;
  action: string;
  source: string;
};

export type MemorySoakCaptureTurnSummaryEvent = MemorySoakTelemetryBaseEvent & {
  category: "capture";
  action: "turn_summary";
  source: "ordinary_turn_auto_capture";
  agentKey?: string;
  sessionKey?: string;
  posture: "default" | "bulk";
  segmentCount: number;
  candidatePlanCount: number;
  acceptedCaptureCount: number;
  deferredOverflowCount: number;
  acceptedCaptureLimit: number;
  deferredOverflowLimit: number;
  demandSignals: MemorySoakDemandSignal[];
};

export type MemorySoakCaptureCandidateEvent = MemorySoakTelemetryBaseEvent & {
  category: "capture";
  action:
    | "candidate_submission"
    | "candidate_duplicate_suppressed"
    | "candidate_submission_rejected"
    | "candidate_submission_failed";
  source: "candidate_ingress" | "ordinary_turn_auto_capture";
  submissionKind?: "learning" | "correction" | "procedure" | "improvement";
  family: MemorySoakTelemetryFamily;
  scope: MemorySoakTelemetryScope;
  submissionMode?: "immediate" | "deferred_overflow";
  captureClass?: string;
  key?: string;
  subjectKey?: string;
  projectScope?: string;
  agentKey?: string;
  posture?: "default" | "bulk";
  rank?: number;
  candidatePoolSize?: number;
  demandSignals?: MemorySoakDemandSignal[];
  accepted?: boolean;
  status?: string;
  reason?: string;
  eventId?: string;
  memoryObjectId?: string;
};

export type MemorySoakRetrievalEvent = MemorySoakTelemetryBaseEvent & {
  category: "retrieval";
  action: "hybrid_search";
  source: "memory_object_search_hybrid";
  queryHash: string;
  queryPreview: string;
  requestedScope?: string;
  requestedKind?: string;
  projectId?: string;
  limit?: number;
  accepted: boolean;
  status: string;
  reason?: string;
  recordCount: number;
  approvedCount: number;
  candidateCount: number;
  validatedCount: number;
  familyCounts: Partial<Record<MemorySoakTelemetryFamily, number>>;
  scopeCounts: Partial<Record<MemorySoakTelemetryScope, number>>;
  sameSubjectCollisionCount: number;
  conflictingSubjectCount: number;
  temporalAmbiguityCount: number;
  strongerScopePresentBelowTop: boolean;
  projectOverridesShared: boolean;
  agentOverridesShared: boolean;
  topRecords: MemorySoakTopRetrievedRecord[];
};

export type MemorySoakApplicationEvent = MemorySoakTelemetryBaseEvent & {
  category: "application";
  action: "learned_guidance_plan";
  source: "memory_learned_guidance_plan";
  queryHash: string;
  queryPreview: string;
  projectId?: string;
  accepted: boolean;
  status: string;
  outcome?: string;
  applicationMode?: string;
  retrievedRecordCount: number;
  eligibleWorkflowGuidanceCount: number;
  filteredOutByScopeCount: number;
  suggestionCount: number;
  suppressedConflictCount: number;
  wrongShapeDominanceProxy: boolean;
  noGuidanceDespiteRetrieval: boolean;
  suggestionScopeCounts: Partial<Record<MemorySoakTelemetryScope, number>>;
  suggestionStateCounts: Partial<Record<MemorySoakTelemetryRecordState, number>>;
  suppressedConflictSubjectKeys: string[];
};

export type MemorySoakReviewEvent = MemorySoakTelemetryBaseEvent & {
  category: "review";
  action: "candidate_review" | "candidate_promotion";
  source: "candidate_review" | "candidate_promotion";
  accepted: boolean;
  status: string;
  candidateId: string;
  family: MemorySoakTelemetryFamily;
  scope: MemorySoakTelemetryScope;
  deferredOverflowCandidate: boolean;
  outcome?: string;
  reviewState?: string;
  memoryObjectStateChanged?: boolean;
  promotionTarget?: "memory" | "procedure";
  promotedObjectId?: string;
  promotedMemoryKind?: string;
  reason?: string;
};

export type MemorySoakProjectionEvent = MemorySoakTelemetryBaseEvent & {
  category: "projection";
  action: "native_sync_projection";
  source: "memory_native_sync";
  write: boolean;
  scopes: string[];
  changedTargets: number;
  totalTargets: number;
  selectedEntries: number;
  omittedEntries: number;
  skippedRecords: number;
  unmatchedRecords: number;
  recoveredPartialBlocks: number;
};

export type MemorySoakOrchestrationEvent = MemorySoakTelemetryBaseEvent & {
  category: "orchestration";
  action: "native_sync_run" | "session_memory_update" | "compaction_plan";
  source: "memory_native_sync" | "session_memory" | "compaction_planning";
  write?: boolean;
  scopes?: string[];
  workspaceDir?: string;
  date?: string;
  telemetrySummaryIncluded?: boolean;
  sessionId?: string;
  agentId?: string;
  updateReason?: string;
  importantFactsCount?: number;
  demandSignals?: MemorySoakDemandSignal[];
  outcome?: string;
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
  clearCandidateCount?: number;
  sessionMemoryStatus?: string;
};

export type MemorySoakTelemetryEvent =
  | MemorySoakCaptureTurnSummaryEvent
  | MemorySoakCaptureCandidateEvent
  | MemorySoakRetrievalEvent
  | MemorySoakApplicationEvent
  | MemorySoakReviewEvent
  | MemorySoakProjectionEvent
  | MemorySoakOrchestrationEvent;

export type MemorySoakTelemetrySummary = {
  schemaVersion: typeof MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION;
  generatedAt: string;
  range: {
    eventCount: number;
    firstRecordedAt?: string;
    lastRecordedAt?: string;
  };
  capture: {
    turnSummaries: number;
    bulkTurns: number;
    candidatePlanCount: number;
    acceptedCount: number;
    deferredOverflowCount: number;
    duplicateSuppressedCount: number;
    submissionRejectedCount: number;
    submissionFailedCount: number;
    familyCounts: Partial<Record<MemorySoakTelemetryFamily, number>>;
    scopeCounts: Partial<Record<MemorySoakTelemetryScope, number>>;
  };
  retrieval: {
    hybridSearches: number;
    noResultSearches: number;
    retrievedRecords: number;
    approvedRecords: number;
    candidateRecords: number;
    validatedRecords: number;
    familyCounts: Partial<Record<MemorySoakTelemetryFamily, number>>;
    scopeCounts: Partial<Record<MemorySoakTelemetryScope, number>>;
    sameSubjectCollisionCount: number;
    conflictingSubjectCount: number;
    temporalAmbiguityCount: number;
    strongerScopePresentBelowTopCount: number;
    projectOverridesSharedCount: number;
    agentOverridesSharedCount: number;
  };
  application: {
    guidancePlans: number;
    acceptedPlans: number;
    plansWithSuggestions: number;
    noGuidanceDespiteRetrievalCount: number;
    wrongShapeDominanceProxyCount: number;
    filteredOutByScopeCount: number;
    suggestionCount: number;
    suppressedConflictCount: number;
  };
  review: {
    candidateReviews: number;
    acceptedReviews: number;
    rejectedReviews: number;
    needsRevisionReviews: number;
    memoryPromotions: number;
    procedurePromotions: number;
    deferredOverflowPromotions: number;
  };
  projection: {
    runs: number;
    changedTargets: number;
    totalTargets: number;
    selectedEntries: number;
    omittedEntries: number;
    skippedRecords: number;
    unmatchedRecords: number;
    recoveredPartialBlocks: number;
  };
  orchestration: {
    nativeSyncRuns: number;
    writeRuns: number;
    dryRuns: number;
    sessionMemoryUpdates: number;
    compactionPlans: number;
    highCompactionPressureCount: number;
    factDenseSessionMemoryCount: number;
  };
  corpusDemand: {
    signalCounts: Partial<Record<MemorySoakDemandSignal, number>>;
  };
  attentionFlags: string[];
  knownBlindSpots: string[];
};

export type MemorySoakTelemetryPort = {
  record(event: MemorySoakTelemetryEvent): Promise<void>;
  rootDir: string;
};

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

function previewText(value: string, maxLength = 160): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function incrementCounter<T extends string>(
  counts: Partial<Record<T, number>>,
  key: T,
  amount = 1,
): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function defaultMemorySoakTelemetryRootDir(): string {
  return path.resolve(process.cwd(), ".local/memory-soak");
}

function eventFilePath(rootDir: string, recordedAt: string): string {
  return path.join(rootDir, "events", `${toIsoDate(recordedAt)}.jsonl`);
}

export function createMemorySoakTelemetryPort(params?: {
  rootDir?: string;
  logger?: PluginLogger;
}): MemorySoakTelemetryPort {
  const rootDir = params?.rootDir ?? defaultMemorySoakTelemetryRootDir();

  return {
    rootDir,
    async record(event: MemorySoakTelemetryEvent) {
      try {
        const filePath = eventFilePath(rootDir, event.recordedAt);
        await ensureDir(path.dirname(filePath));
        await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
      } catch (error) {
        params?.logger?.warn?.(
          `memory soak telemetry write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

async function readJsonLinesFile(filePath: string): Promise<MemorySoakTelemetryEvent[]> {
  const text = await readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as MemorySoakTelemetryEvent];
      } catch {
        return [];
      }
    });
}

export async function readMemorySoakTelemetryEvents(params?: {
  rootDir?: string;
  sinceDate?: string;
}): Promise<MemorySoakTelemetryEvent[]> {
  const rootDir = params?.rootDir ?? defaultMemorySoakTelemetryRootDir();
  const eventsDir = path.join(rootDir, "events");
  let entries: string[];
  try {
    entries = (await readdir(eventsDir)).filter((entry) => entry.endsWith(".jsonl"));
  } catch {
    return [];
  }

  const sinceDate = params?.sinceDate;
  const filtered = entries
    .filter((entry) => !sinceDate || entry.slice(0, 10) >= sinceDate)
    .sort((left, right) => left.localeCompare(right));

  const events = await Promise.all(
    filtered.map((entry) => readJsonLinesFile(path.join(eventsDir, entry))),
  );
  return events.flat().sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

function buildAttentionFlags(summary: MemorySoakTelemetrySummary): string[] {
  const flags: string[] = [];
  if (
    summary.capture.deferredOverflowCount > 0 &&
    summary.review.deferredOverflowPromotions === 0
  ) {
    flags.push("deferred overflow exists but no later promotions were observed");
  }
  if (summary.retrieval.strongerScopePresentBelowTopCount > 0) {
    flags.push(
      "some retrievals returned broader top records while more specific records were also present",
    );
  }
  if (summary.application.filteredOutByScopeCount > 0) {
    flags.push("some learned-guidance records were filtered out by scope");
  }
  if (summary.retrieval.conflictingSubjectCount > 0) {
    flags.push(
      "retrieval saw competing subject clusters that may justify later relation or precedence work",
    );
  }
  if ((summary.corpusDemand.signalCounts.corpus_ingestion_request ?? 0) > 0) {
    flags.push("explicit corpus-ingestion demand signals were observed");
  }
  if ((summary.corpusDemand.signalCounts.topic_brief_request ?? 0) > 0) {
    flags.push("topic or project brief demand signals were observed");
  }
  return flags;
}

export function buildMemorySoakTelemetrySummary(params: {
  events: MemorySoakTelemetryEvent[];
  generatedAt?: string;
}): MemorySoakTelemetrySummary {
  const summary: MemorySoakTelemetrySummary = {
    schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    range: {
      eventCount: params.events.length,
      ...(params.events[0] ? { firstRecordedAt: params.events[0].recordedAt } : {}),
      ...(params.events.at(-1) ? { lastRecordedAt: params.events.at(-1)?.recordedAt } : {}),
    },
    capture: {
      turnSummaries: 0,
      bulkTurns: 0,
      candidatePlanCount: 0,
      acceptedCount: 0,
      deferredOverflowCount: 0,
      duplicateSuppressedCount: 0,
      submissionRejectedCount: 0,
      submissionFailedCount: 0,
      familyCounts: {},
      scopeCounts: {},
    },
    retrieval: {
      hybridSearches: 0,
      noResultSearches: 0,
      retrievedRecords: 0,
      approvedRecords: 0,
      candidateRecords: 0,
      validatedRecords: 0,
      familyCounts: {},
      scopeCounts: {},
      sameSubjectCollisionCount: 0,
      conflictingSubjectCount: 0,
      temporalAmbiguityCount: 0,
      strongerScopePresentBelowTopCount: 0,
      projectOverridesSharedCount: 0,
      agentOverridesSharedCount: 0,
    },
    application: {
      guidancePlans: 0,
      acceptedPlans: 0,
      plansWithSuggestions: 0,
      noGuidanceDespiteRetrievalCount: 0,
      wrongShapeDominanceProxyCount: 0,
      filteredOutByScopeCount: 0,
      suggestionCount: 0,
      suppressedConflictCount: 0,
    },
    review: {
      candidateReviews: 0,
      acceptedReviews: 0,
      rejectedReviews: 0,
      needsRevisionReviews: 0,
      memoryPromotions: 0,
      procedurePromotions: 0,
      deferredOverflowPromotions: 0,
    },
    projection: {
      runs: 0,
      changedTargets: 0,
      totalTargets: 0,
      selectedEntries: 0,
      omittedEntries: 0,
      skippedRecords: 0,
      unmatchedRecords: 0,
      recoveredPartialBlocks: 0,
    },
    orchestration: {
      nativeSyncRuns: 0,
      writeRuns: 0,
      dryRuns: 0,
      sessionMemoryUpdates: 0,
      compactionPlans: 0,
      highCompactionPressureCount: 0,
      factDenseSessionMemoryCount: 0,
    },
    corpusDemand: {
      signalCounts: {},
    },
    attentionFlags: [],
    knownBlindSpots: [
      "generic hybrid search retrieval still cannot prove final-answer use",
      "missed useful memory is still measured through truthful proxies rather than certainty",
      "relation and alias trouble are still demand signals, not a full ontology layer",
    ],
  };

  for (const event of params.events) {
    switch (event.category) {
      case "capture":
        if (event.action === "turn_summary") {
          summary.capture.turnSummaries += 1;
          summary.capture.candidatePlanCount += event.candidatePlanCount;
          summary.capture.acceptedCount += event.acceptedCaptureCount;
          summary.capture.deferredOverflowCount += event.deferredOverflowCount;
          if (event.posture === "bulk") {
            summary.capture.bulkTurns += 1;
          }
          for (const signal of event.demandSignals) {
            incrementCounter(summary.corpusDemand.signalCounts, signal);
          }
          break;
        }
        incrementCounter(summary.capture.familyCounts, event.family);
        incrementCounter(summary.capture.scopeCounts, event.scope);
        if (event.action === "candidate_duplicate_suppressed") {
          summary.capture.duplicateSuppressedCount += 1;
        }
        if (event.action === "candidate_submission_rejected") {
          summary.capture.submissionRejectedCount += 1;
        }
        if (event.action === "candidate_submission_failed") {
          summary.capture.submissionFailedCount += 1;
        }
        if (event.submissionMode === "deferred_overflow") {
          summary.capture.deferredOverflowCount += 1;
        }
        for (const signal of event.demandSignals ?? []) {
          incrementCounter(summary.corpusDemand.signalCounts, signal);
        }
        break;
      case "retrieval":
        summary.retrieval.hybridSearches += 1;
        summary.retrieval.retrievedRecords += event.recordCount;
        summary.retrieval.approvedRecords += event.approvedCount;
        summary.retrieval.candidateRecords += event.candidateCount;
        summary.retrieval.validatedRecords += event.validatedCount;
        summary.retrieval.sameSubjectCollisionCount += event.sameSubjectCollisionCount;
        summary.retrieval.conflictingSubjectCount += event.conflictingSubjectCount;
        summary.retrieval.temporalAmbiguityCount += event.temporalAmbiguityCount;
        if (event.recordCount === 0) {
          summary.retrieval.noResultSearches += 1;
        }
        if (event.strongerScopePresentBelowTop) {
          summary.retrieval.strongerScopePresentBelowTopCount += 1;
        }
        if (event.projectOverridesShared) {
          summary.retrieval.projectOverridesSharedCount += 1;
        }
        if (event.agentOverridesShared) {
          summary.retrieval.agentOverridesSharedCount += 1;
        }
        for (const [family, count] of Object.entries(event.familyCounts) as Array<
          [MemorySoakTelemetryFamily, number]
        >) {
          incrementCounter(summary.retrieval.familyCounts, family, count);
        }
        for (const [scope, count] of Object.entries(event.scopeCounts) as Array<
          [MemorySoakTelemetryScope, number]
        >) {
          incrementCounter(summary.retrieval.scopeCounts, scope, count);
        }
        break;
      case "application":
        summary.application.guidancePlans += 1;
        if (event.accepted) {
          summary.application.acceptedPlans += 1;
        }
        if (event.suggestionCount > 0) {
          summary.application.plansWithSuggestions += 1;
        }
        if (event.noGuidanceDespiteRetrieval) {
          summary.application.noGuidanceDespiteRetrievalCount += 1;
        }
        if (event.wrongShapeDominanceProxy) {
          summary.application.wrongShapeDominanceProxyCount += 1;
        }
        summary.application.filteredOutByScopeCount += event.filteredOutByScopeCount;
        summary.application.suggestionCount += event.suggestionCount;
        summary.application.suppressedConflictCount += event.suppressedConflictCount;
        break;
      case "review":
        if (event.action === "candidate_review") {
          summary.review.candidateReviews += 1;
          if (event.outcome === "accepted") {
            summary.review.acceptedReviews += 1;
          }
          if (event.outcome === "rejected") {
            summary.review.rejectedReviews += 1;
          }
          if (event.outcome === "needs_revision") {
            summary.review.needsRevisionReviews += 1;
          }
        } else if (event.action === "candidate_promotion") {
          if (event.promotionTarget === "memory") {
            summary.review.memoryPromotions += 1;
          }
          if (event.promotionTarget === "procedure") {
            summary.review.procedurePromotions += 1;
          }
          if (event.deferredOverflowCandidate) {
            summary.review.deferredOverflowPromotions += 1;
          }
        }
        break;
      case "projection":
        summary.projection.runs += 1;
        summary.projection.changedTargets += event.changedTargets;
        summary.projection.totalTargets += event.totalTargets;
        summary.projection.selectedEntries += event.selectedEntries;
        summary.projection.omittedEntries += event.omittedEntries;
        summary.projection.skippedRecords += event.skippedRecords;
        summary.projection.unmatchedRecords += event.unmatchedRecords;
        summary.projection.recoveredPartialBlocks += event.recoveredPartialBlocks;
        break;
      case "orchestration":
        if (event.action === "native_sync_run") {
          summary.orchestration.nativeSyncRuns += 1;
          if (event.write) {
            summary.orchestration.writeRuns += 1;
          } else {
            summary.orchestration.dryRuns += 1;
          }
        }
        if (event.action === "session_memory_update") {
          summary.orchestration.sessionMemoryUpdates += 1;
          if ((event.importantFactsCount ?? 0) >= 8) {
            summary.orchestration.factDenseSessionMemoryCount += 1;
          }
          for (const signal of event.demandSignals ?? []) {
            incrementCounter(summary.corpusDemand.signalCounts, signal);
          }
        }
        if (event.action === "compaction_plan") {
          summary.orchestration.compactionPlans += 1;
          if (
            typeof event.estimatedPromptTokens === "number" &&
            typeof event.estimatedPromptTokenThreshold === "number" &&
            event.estimatedPromptTokens >= event.estimatedPromptTokenThreshold
          ) {
            summary.orchestration.highCompactionPressureCount += 1;
          }
          for (const signal of event.demandSignals ?? []) {
            incrementCounter(summary.corpusDemand.signalCounts, signal);
          }
        }
        break;
    }
  }

  summary.attentionFlags = buildAttentionFlags(summary);
  return summary;
}

export function renderMemorySoakTelemetryOperatorSummary(
  summary: MemorySoakTelemetrySummary,
): string {
  const lines = [
    "# Memory Soak Telemetry Summary",
    "",
    `- events: ${String(summary.range.eventCount)}`,
    `- capture_turns: ${String(summary.capture.turnSummaries)}`,
    `- bulk_turns: ${String(summary.capture.bulkTurns)}`,
    `- deferred_overflow: ${String(summary.capture.deferredOverflowCount)}`,
    `- hybrid_searches: ${String(summary.retrieval.hybridSearches)}`,
    `- no_result_searches: ${String(summary.retrieval.noResultSearches)}`,
    `- guidance_plans: ${String(summary.application.guidancePlans)}`,
    `- guidance_suggestions: ${String(summary.application.suggestionCount)}`,
    `- candidate_reviews: ${String(summary.review.candidateReviews)}`,
    `- memory_promotions: ${String(summary.review.memoryPromotions)}`,
    `- projection_runs: ${String(summary.projection.runs)}`,
    `- native_sync_runs: ${String(summary.orchestration.nativeSyncRuns)}`,
  ];

  if (summary.attentionFlags.length > 0) {
    lines.push("", "## Attention", "", ...summary.attentionFlags.map((flag) => `- ${flag}`));
  }

  const demandSignals = Object.entries(summary.corpusDemand.signalCounts)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0) || left[0].localeCompare(right[0]));
  if (demandSignals.length > 0) {
    lines.push(
      "",
      "## Corpus Demand Signals",
      "",
      ...demandSignals.map(([signal, count]) => `- ${signal}: ${String(count)}`),
    );
  }

  lines.push(
    "",
    "## Blind Spots",
    "",
    ...summary.knownBlindSpots.map((blindSpot) => `- ${blindSpot}`),
  );

  return lines.join("\n");
}

export function renderMemorySoakTelemetryDailyBrief(summary: MemorySoakTelemetrySummary): string {
  if (summary.range.eventCount === 0) {
    return "- memory_soak: no recent events";
  }

  const attention =
    summary.attentionFlags.length > 0 ? `; attention=${summary.attentionFlags.length}` : "";
  return [
    "- memory_soak:",
    `captures=${String(summary.capture.turnSummaries)}`,
    `deferred=${String(summary.capture.deferredOverflowCount)}`,
    `retrievals=${String(summary.retrieval.hybridSearches)}`,
    `guidance=${String(summary.application.suggestionCount)}`,
    `reviews=${String(summary.review.candidateReviews)}`,
    attention ? attention.slice(2) : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

export async function writeMemorySoakTelemetrySummaryArtifacts(params: {
  rootDir?: string;
  summary: MemorySoakTelemetrySummary;
}): Promise<{
  latestJsonPath: string;
  latestSummaryPath: string;
  historyJsonPath: string;
  historySummaryPath: string;
}> {
  const rootDir = params.rootDir ?? defaultMemorySoakTelemetryRootDir();
  const reportsDir = path.join(rootDir, "history");
  await ensureDir(reportsDir);
  const stamp = params.summary.generatedAt
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "-");
  const historyJsonPath = path.join(reportsDir, `summary-${stamp}.json`);
  const historySummaryPath = path.join(reportsDir, `summary-${stamp}.md`);
  const latestJsonPath = path.join(rootDir, "latest-summary.json");
  const latestSummaryPath = path.join(rootDir, "latest-summary.md");
  const summaryText = renderMemorySoakTelemetryOperatorSummary(params.summary);

  await writeFile(historyJsonPath, `${JSON.stringify(params.summary, null, 2)}\n`, "utf8");
  await writeFile(historySummaryPath, `${summaryText}\n`, "utf8");
  await writeFile(latestJsonPath, `${JSON.stringify(params.summary, null, 2)}\n`, "utf8");
  await writeFile(latestSummaryPath, `${summaryText}\n`, "utf8");

  return {
    latestJsonPath,
    latestSummaryPath,
    historyJsonPath,
    historySummaryPath,
  };
}

function normalizeSubject(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hashQuery(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function familyFromCanonicalMetadata(
  metadata: Record<string, unknown> | undefined,
): MemorySoakTelemetryFamily | undefined {
  const canonicalRecord = readCanonicalMemoryRecordFromMetadata(metadata);
  const captureCategory =
    typeof canonicalRecord?.compatibility.captureCategory === "string"
      ? canonicalRecord.compatibility.captureCategory
      : undefined;
  if (
    captureCategory === "project_fact" ||
    captureCategory === "recurring_procedure" ||
    captureCategory === "workflow_improvement" ||
    captureCategory === "project_rule" ||
    captureCategory === "unmet_need"
  ) {
    return captureCategory;
  }
  const tags = new Set(canonicalRecord?.tags ?? []);
  if (tags.has("response_style")) {
    return "response_style";
  }
  if (tags.has("workflow_improvement") || tags.has("workflow_guidance")) {
    return "workflow_improvement";
  }
  if (tags.has("project_fact")) {
    return "project_fact";
  }
  if (tags.has("recurring_procedure") || tags.has("procedure")) {
    return "recurring_procedure";
  }
  if (tags.has("project_rule")) {
    return "project_rule";
  }
  if (tags.has("unmet_need")) {
    return "unmet_need";
  }
  if (tags.has("reference")) {
    return "reference";
  }
  return undefined;
}

export function resolveMemorySoakTelemetryFamilyFromMetadata(
  metadata: Record<string, unknown> | undefined,
): MemorySoakTelemetryFamily {
  const canonicalFamily = familyFromCanonicalMetadata(metadata);
  if (canonicalFamily) {
    return canonicalFamily;
  }
  const captureClass =
    readCanonicalFirstMetadataString(metadata, ["autoCapture", "captureClass"]) ??
    readCanonicalFirstMetadataString(metadata, [
      "candidateMetadata",
      "autoCapture",
      "captureClass",
    ]);
  if (captureClass === "explicit_preference" || captureClass === "preference_correction") {
    return "preference";
  }
  if (captureClass === "explicit_requirement" || captureClass === "requirement_correction") {
    return "response_style";
  }
  if (captureClass === "project_fact_correction") {
    return "project_fact";
  }
  return "other";
}

export function resolveMemorySoakTelemetryScopeFromCandidate(params: {
  candidate?: Pick<CandidateRecord, "projectId" | "agentId" | "candidateMetadata">;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}): MemorySoakTelemetryScope {
  const metadata = params.metadata ?? params.candidate?.candidateMetadata;
  const canonical = readCanonicalMemoryRecordFromMetadata(metadata);
  const scopeType =
    typeof canonical?.facets.scopeType === "string" ? canonical.facets.scopeType : undefined;
  if (scopeType === "session") {
    return "session";
  }
  const projectScoped =
    typeof canonical?.facets.projectScope === "string" ||
    typeof params.projectId === "string" ||
    typeof params.candidate?.projectId === "string";
  const agentScoped =
    typeof readCanonicalFirstMetadataString(metadata, ["autoCapture", "agentExternalKey"]) ===
      "string" ||
    typeof params.agentId === "string" ||
    typeof params.candidate?.agentId === "string";
  if (projectScoped && agentScoped) {
    return "agent_project";
  }
  if (projectScoped) {
    return "project";
  }
  if (agentScoped) {
    return "agent";
  }
  return "shared";
}

export function resolveMemorySoakTelemetryScopeFromRetrievedRecord(
  record: RetrievedMemoryRecord,
): MemorySoakTelemetryScope {
  if (record.objectType === "memory_object") {
    const projectionScope = resolveNativeMemoryProjectionScope(record as MemoryObjectRecord);
    if (projectionScope.kind === "session") {
      return "session";
    }
    if (projectionScope.kind === "agent") {
      return projectionScope.projectScoped ? "agent_project" : "agent";
    }
    if (projectionScope.kind === "project") {
      return "project";
    }
    return "shared";
  }
  if (record.projectId) {
    return "project";
  }
  return "shared";
}

export function resolveMemorySoakTelemetryFamilyFromRetrievedRecord(
  record: RetrievedMemoryRecord,
): MemorySoakTelemetryFamily {
  if (record.objectType === "procedure") {
    return "procedure";
  }
  return resolveMemorySoakTelemetryFamilyFromMetadata(record.metadata);
}

export function resolveMemorySoakTelemetryRecordState(
  record: RetrievedMemoryRecord,
): MemorySoakTelemetryRecordState {
  if (record.objectType === "procedure") {
    return "validated";
  }
  return record.reviewState === "approved"
    ? "approved"
    : record.reviewState === "candidate"
      ? "candidate"
      : "unknown";
}

export function deriveCorpusDemandSignalsFromPrompt(params: {
  text: string;
  candidatePlanCount: number;
  segmentCount: number;
}): MemorySoakDemandSignal[] {
  const normalized = params.text.toLowerCase();
  const signals = new Set<MemorySoakDemandSignal>();
  if (/\b(paper|article|repo|repository|dataset|research|study|sources?)\b/.test(normalized)) {
    signals.add("source_heavy_prompt");
  }
  if (/\b(remember|ingest|capture|record)\b/.test(normalized) && params.candidatePlanCount >= 6) {
    signals.add("bulk_memory_packet_request");
  }
  if (/\b(research packet|source packet|curated sources|research notes)\b/.test(normalized)) {
    signals.add("research_packet_request");
  }
  if (/\b(brief|briefing|topic summary|project summary|wiki)\b/.test(normalized)) {
    signals.add("topic_brief_request");
  }
  if (
    /\b(ingest this paper|ingest these sources|build a knowledge base|compile a wiki)\b/.test(
      normalized,
    )
  ) {
    signals.add("corpus_ingestion_request");
  }
  return [...signals];
}

export function deriveCorpusDemandSignalsFromSessionMemory(params: {
  importantFactsCount: number;
}): MemorySoakDemandSignal[] {
  const signals: MemorySoakDemandSignal[] = [];
  if (params.importantFactsCount >= 8) {
    signals.push("fact_dense_session_memory");
  }
  return signals;
}

export function deriveCorpusDemandSignalsFromCompaction(params: {
  estimatedPromptTokens?: number;
  estimatedPromptTokenThreshold?: number;
}): MemorySoakDemandSignal[] {
  const signals: MemorySoakDemandSignal[] = [];
  if (
    typeof params.estimatedPromptTokens === "number" &&
    typeof params.estimatedPromptTokenThreshold === "number" &&
    params.estimatedPromptTokens >= params.estimatedPromptTokenThreshold
  ) {
    signals.push("compaction_pressure_high");
  }
  return signals;
}

export function buildMemorySoakRetrievalEvent(params: {
  input: MemoryObjectSearchHybridInput;
  result: MemoryObjectSearchHybridResult;
  recordedAt?: string;
}): MemorySoakRetrievalEvent {
  const recordedAt = params.recordedAt ?? new Date().toISOString();
  const accepted = params.result.accepted;
  const records = accepted ? params.result.records : [];
  const familyCounts: Partial<Record<MemorySoakTelemetryFamily, number>> = {};
  const scopeCounts: Partial<Record<MemorySoakTelemetryScope, number>> = {};
  const subjectGroups = new Map<
    string,
    Array<{ content: string; scope: MemorySoakTelemetryScope }>
  >();
  const topRecords: MemorySoakTopRetrievedRecord[] = [];

  for (const record of records) {
    const family = resolveMemorySoakTelemetryFamilyFromRetrievedRecord(record);
    const scope = resolveMemorySoakTelemetryScopeFromRetrievedRecord(record);
    incrementCounter(familyCounts, family);
    incrementCounter(scopeCounts, scope);
    if (topRecords.length < 5) {
      topRecords.push({
        id: record.id,
        family,
        scope,
        state: resolveMemorySoakTelemetryRecordState(record),
        score: record.score,
        matchedFields: record.matchedFields,
        ...(record.objectType === "memory_object"
          ? {
              subjectKey:
                readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "subjectKey"]) ??
                readCanonicalFirstMetadataString(record.metadata, [
                  "candidateMetadata",
                  "autoCapture",
                  "subjectKey",
                ]),
            }
          : {}),
      });
    }
    const subjectKey =
      record.objectType === "memory_object"
        ? (readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "subjectKey"]) ??
          readCanonicalFirstMetadataString(record.metadata, [
            "candidateMetadata",
            "autoCapture",
            "subjectKey",
          ]) ??
          normalizeSubject(record.content))
        : normalizeSubject(record.title);
    if (subjectKey) {
      const content = record.objectType === "memory_object" ? record.content : record.body;
      const existing = subjectGroups.get(subjectKey) ?? [];
      existing.push({ content, scope });
      subjectGroups.set(subjectKey, existing);
    }
  }

  let sameSubjectCollisionCount = 0;
  let conflictingSubjectCount = 0;
  let temporalAmbiguityCount = 0;
  for (const entries of subjectGroups.values()) {
    if (entries.length > 1) {
      sameSubjectCollisionCount += 1;
      const distinctContents = new Set(entries.map((entry) => normalizeSubject(entry.content)));
      const distinctScopes = new Set(entries.map((entry) => entry.scope));
      if (distinctContents.size > 1) {
        conflictingSubjectCount += 1;
      }
      if (distinctContents.size > 1 && distinctScopes.size > 1) {
        temporalAmbiguityCount += 1;
      }
    }
  }

  const topScope = topRecords[0]?.scope;
  const strongerScopePresentBelowTop = topRecords.some(
    (record, index) =>
      index > 0 && specificityRank(record.scope) > specificityRank(topScope ?? "unknown"),
  );
  const projectOverridesShared =
    topScope === "project" && topRecords.some((record) => record.scope === "shared");
  const agentOverridesShared =
    (topScope === "agent" || topScope === "agent_project") &&
    topRecords.some((record) => record.scope === "shared");

  return {
    schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
    recordedAt,
    category: "retrieval",
    action: "hybrid_search",
    source: "memory_object_search_hybrid",
    queryHash: hashQuery(params.input.query),
    queryPreview: previewText(params.input.query),
    ...(params.input.scope ? { requestedScope: params.input.scope } : {}),
    ...(params.input.kind ? { requestedKind: params.input.kind } : {}),
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.limit !== undefined ? { limit: params.input.limit } : {}),
    accepted,
    status: params.result.status,
    ...(accepted ? {} : { reason: params.result.reason }),
    recordCount: records.length,
    approvedCount: records.filter(
      (record) => record.objectType === "memory_object" && record.reviewState === "approved",
    ).length,
    candidateCount: records.filter(
      (record) => record.objectType === "memory_object" && record.reviewState === "candidate",
    ).length,
    validatedCount: records.filter((record) => record.objectType === "procedure").length,
    familyCounts,
    scopeCounts,
    sameSubjectCollisionCount,
    conflictingSubjectCount,
    temporalAmbiguityCount,
    strongerScopePresentBelowTop,
    projectOverridesShared,
    agentOverridesShared,
    topRecords,
  };
}

export function buildMemorySoakApplicationEvent(params: {
  query: string;
  projectId?: string;
  result: LearnedGuidanceAdvisoryPlanningResult;
  recordedAt?: string;
}): MemorySoakApplicationEvent {
  const recordedAt = params.recordedAt ?? new Date().toISOString();
  const observability = params.result.observability;
  const suggestionScopeCounts: Partial<Record<MemorySoakTelemetryScope, number>> = {};
  const suggestionStateCounts: Partial<Record<MemorySoakTelemetryRecordState, number>> = {};
  const suppressedConflictSubjectKeys =
    params.result.accepted && params.result.suppressedConflicts.length > 0
      ? params.result.suppressedConflicts.map((conflict) => conflict.subjectKey)
      : [];

  if (params.result.accepted) {
    for (const suggestion of params.result.suggestions) {
      const scope = suggestion.projectId ? "project" : "shared";
      incrementCounter(suggestionScopeCounts, scope);
      incrementCounter(suggestionStateCounts, suggestion.memoryState);
    }
  }

  return {
    schemaVersion: MEMORY_SOAK_TELEMETRY_SCHEMA_VERSION,
    recordedAt,
    category: "application",
    action: "learned_guidance_plan",
    source: "memory_learned_guidance_plan",
    queryHash: hashQuery(params.query),
    queryPreview: previewText(params.query),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    accepted: params.result.accepted,
    status: params.result.status,
    ...(params.result.accepted ? { outcome: params.result.outcome } : {}),
    ...(params.result.accepted ? { applicationMode: params.result.applicationMode } : {}),
    retrievedRecordCount: observability.retrievedRecordCount,
    eligibleWorkflowGuidanceCount: observability.eligibleWorkflowGuidanceCount,
    filteredOutByScopeCount: observability.filteredOutByScopeCount,
    suggestionCount: observability.suggestionCount,
    suppressedConflictCount: observability.suppressedConflictCount,
    wrongShapeDominanceProxy:
      observability.retrievedRecordCount > 0 &&
      observability.eligibleWorkflowGuidanceCount === 0 &&
      observability.suggestionCount === 0,
    noGuidanceDespiteRetrieval:
      observability.retrievedRecordCount > 0 && observability.suggestionCount === 0,
    suggestionScopeCounts,
    suggestionStateCounts,
    suppressedConflictSubjectKeys,
  };
}

function specificityRank(scope: MemorySoakTelemetryScope): number {
  switch (scope) {
    case "session":
      return 5;
    case "agent_project":
      return 4;
    case "project":
      return 3;
    case "agent":
      return 2;
    case "shared":
      return 1;
    default:
      return 0;
  }
}
