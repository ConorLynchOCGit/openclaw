import { createHash } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import type {
  CandidateGetInput,
  CandidateGetResult,
  CandidateListInput,
  CandidateListResult,
  CandidateMemoryPromotionInput,
  CandidateMemoryPromotionResult,
  CandidateProcedurePromotionInput,
  CandidateProcedurePromotionResult,
  CandidatePromotionPlanInput,
  CandidatePromotionPlanResult,
  CandidatePromotionPlanTarget,
  CandidateRecord,
  CandidateReviewInput,
  CandidateReviewOutcome,
  CandidateReviewResult,
  CandidateSubmissionInput,
  CandidateSubmissionKind,
  CandidateSubmissionResult,
  CompactionPlanInput,
  CompactionPlanResult,
  CompactionPlanSessionMemoryStatus,
  ConsolidationExecuteAction,
  ConsolidationExecuteInput,
  ConsolidationExecuteResult,
  ConsolidationExecuteSelection,
  DriftCheckExecuteAction,
  DriftCheckExecuteInput,
  DriftCheckExecuteResult,
  DriftCheckExecuteSelection,
  ConsolidationPlanActionType,
  ConsolidationPlanConfidence,
  ConsolidationPlanFinding,
  ConsolidationPlanInput,
  ConsolidationPlanPriority,
  ConsolidationPlanResult,
  FullCompactionFallbackExecuteInput,
  FullCompactionFallbackExecuteResult,
  FullCompactionFallbackPayload,
  MemoryObjectGetInput,
  MemoryObjectGetResult,
  MemoryBackgroundJobClaimedRecord,
  MemoryBackgroundJobClass,
  MemoryBackgroundJobGetInput,
  MemoryBackgroundJobGetResult,
  MemoryBackgroundJobEnqueueInput,
  MemoryBackgroundJobEnqueueResult,
  MemoryBackgroundJobFinalizeInput,
  MemoryBackgroundJobListInput,
  MemoryBackgroundJobListResult,
  MemoryBackgroundJobRecord,
  MemoryBackgroundJobRunNextInput,
  MemoryBackgroundJobStatus,
  MemoryObjectListInput,
  MemoryObjectListResult,
  MemoryProactivePlanAction,
  MemoryProactivePlanInput,
  MemoryProactivePlanResult,
  MemoryObjectRecord,
  MemoryObjectReadSurface,
  MemoryObjectSearchBasicInput,
  MemoryObjectSearchBasicResult,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchSemanticInput,
  MemoryObjectSearchSemanticResult,
  MemoryObjectSearchScope,
  MemoryObjectSemanticSearchScope,
  MemoryMiddlewareQueryLayer,
  JsonValue,
  ProcedureStatus,
  ProcedureObjectRecord,
  RankedRetrievedMemoryRecord,
  SessionMemoryGetInput,
  SessionMemoryGetResult,
  SessionMemoryCompactionPayload,
  SessionMemoryCompactExecuteInput,
  SessionMemoryCompactExecuteResult,
  SessionMemoryState,
  SessionMemoryUpdateInput,
  SessionMemoryUpdateResult,
  SemanticRetrievedMemoryRecord,
  ToolResultGetInput,
  ToolResultGetResult,
  ToolResultMicrocompactExecuteInput,
  ToolResultMicrocompactExecuteResult,
  ToolResultMicrocompactCandidate,
  ToolResultMicrocompactPlanInput,
  ToolResultMicrocompactPlanResult,
  ToolResultMicrocompactTrigger,
  ToolResultPersistInput,
  ToolResultPersistResult,
  ToolResultPreview,
  ToolResultRecord,
  ProcedureValidationInput,
  ProcedureValidationResult,
  ProcedureValidationPlanInput,
  ProcedureValidationPlanResult,
  ProcedureValidationPlanTarget,
  SkillCandidateCreateInput,
  SkillCandidateCreateResult,
  SkillCandidateProcurementPlanInput,
  SkillCandidateProcurementPlanResult,
  SkillCandidateProcurementPlanTarget,
  SkillCandidateProcurementRecordInput,
  SkillCandidateProcurementRecordResult,
  SkillCandidateApprovalPlanInput,
  SkillCandidateApprovalPlanAcceptedResult,
  SkillCandidateApprovalPlanResult,
  SkillCandidateApprovalPlanTarget,
  SkillCandidateApproveInput,
  SkillCandidateApproveResult,
  SkillCandidateApprovalScope,
  SkillCandidateInstallHandoffInput,
  SkillCandidateInstallHandoffPackage,
  SkillCandidateInstallHandoffResult,
  SkillCandidateInstallHandoffTarget,
  SkillCandidateInstallRecordInput,
  SkillCandidateInstallRecordResult,
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffPackage,
  SkillCandidateSkillVetterHandoffResult,
  SkillCandidateSkillVetterHandoffTarget,
  SkillCandidateVettingResultInput,
  SkillCandidateVettingResultRecordResult,
  SkillCandidateStatus,
  SkillCandidatePlanInput,
  SkillCandidatePlanResult,
  SkillCandidatePlanTarget,
} from "./runtime.js";

const DEFAULT_SCHEMA = "memory_middleware";
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_CANDIDATE_LIST_LIMIT = 20;
const MAX_CANDIDATE_LIST_LIMIT = 50;
const DEFAULT_MEMORY_OBJECT_LIST_LIMIT = 20;
const MAX_MEMORY_OBJECT_LIST_LIMIT = 50;
const DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT = 10;
const MAX_MEMORY_OBJECT_SEARCH_LIMIT = 25;
const DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES = 4_096;
const MAX_TOOL_RESULT_PERSIST_THRESHOLD_BYTES = 200_000;
const DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT = 280;
const MAX_TOOL_RESULT_PREVIEW_CHAR_LIMIT = 1_000;
const DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS = 900;
const MAX_TOOL_RESULT_IDLE_GAP_SECONDS = 86_400;
const DEFAULT_TOOL_RESULT_COUNT_THRESHOLD = 6;
const MAX_TOOL_RESULT_COUNT_THRESHOLD = 100;
const DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT = 2;
const MAX_TOOL_RESULT_RECENT_FLOOR_COUNT = 20;
const DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT = 10;
const MAX_TOOL_RESULT_MAX_CLEAR_COUNT = 50;
const DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD = 12_000;
const MAX_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD = 200_000;
const SESSION_MEMORY_LIST_MAX_ITEMS = 20;
const SESSION_MEMORY_WORKLOG_MAX_ITEMS = 40;
const SESSION_MEMORY_TITLE_MAX_CHARS = 160;
const SESSION_MEMORY_STATE_MAX_CHARS = 600;
const SESSION_MEMORY_TASK_SPEC_MAX_CHARS = 1_500;
const SESSION_MEMORY_ENTRY_MAX_CHARS = 300;
const DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS = 1_800;
const MAX_SESSION_MEMORY_STALE_AFTER_SECONDS = 86_400;
const DEFAULT_CONSOLIDATION_PLAN_LIMIT = 40;
const MAX_CONSOLIDATION_PLAN_LIMIT = 100;
const DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS = 10;
const MAX_CONSOLIDATION_PLAN_MAX_FINDINGS = 50;
const DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS = 6;
const MAX_PROACTIVE_PLAN_MAX_ACTIONS = 20;
const DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS = 3;
const MAX_BACKGROUND_JOB_MAX_ATTEMPTS = 10;
const NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES = ["workflow_phrase_pattern"] as const;

type CandidatePersistencePlan = {
  schema: string;
  event: {
    eventKind: "candidate_submission";
    eventName: `candidate_submission.${CandidateSubmissionKind}`;
    projectId?: string;
    agentId?: string;
    sessionId?: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  memoryObject: {
    projectId?: string;
    agentId?: string;
    sessionId?: string;
    memoryKind: "project" | "feedback" | "procedure";
    reviewState: "candidate";
    content: string;
    metadata: Record<string, unknown>;
  };
  memorySource: {
    sourceKind: "event";
    sourceTable: string;
    metadata: Record<string, unknown>;
  };
};

type CandidateSubmissionWriteResult = {
  eventId: string;
  memoryObjectId: string;
};

type CandidateRow = {
  id: string;
  event_id: string;
  kind: string;
  memory_kind: "project" | "feedback" | "procedure";
  review_state: "candidate";
  content: string;
  project_id: string | null;
  agent_id: string | null;
  session_id: string | null;
  event_name: string;
  candidate_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CandidateReviewTargetRow = {
  id: string;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
};

type CandidateReviewWriteResult = {
  reviewId: string;
  reviewState: "candidate" | "corrected" | "rejected";
  memoryObjectStateChanged: boolean;
};

type CandidateMemoryPromotionTargetRow = {
  id: string;
  kind: string;
  memory_kind: "project" | "feedback" | "procedure";
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  project_id: string | null;
  agent_id: string | null;
  session_id: string | null;
  source_event_id: string | null;
  content: string;
  candidate_metadata: Record<string, unknown> | null;
  latest_review_id: string | null;
  latest_review_outcome: CandidateReviewOutcome | null;
};

type CandidateProcedurePromotionWriteResult = {
  procedure_id: string;
};

type ProcedureValidationPlanTargetRow = {
  id: string;
  project_id: string | null;
  status: ProcedureStatus;
  title: string;
  body: string;
  source_memory_object_id: string | null;
  promoted_from_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  source_candidate_kind: string | null;
  source_candidate_review_state:
    | "candidate"
    | "approved"
    | "corrected"
    | "rejected"
    | "superseded"
    | null;
  latest_candidate_review_id: string | null;
  latest_candidate_review_outcome: CandidateReviewOutcome | null;
  latest_validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
};

type ProcedureValidationWriteResult = {
  procedure_run_id: string;
  validated_at: string;
};

type SkillCandidateRow = {
  id: string;
  status: SkillCandidateStatus;
};

type SkillCandidateProcurementTargetRow = {
  id: string;
  project_id: string | null;
  status: SkillCandidateStatus;
  name: string;
  summary: string;
  source_procedure_id: string | null;
  source_procedure_status: ProcedureStatus | null;
  source_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
};

type SkillCandidateSkillVetterHandoffTargetRow = {
  id: string;
  project_id: string | null;
  status: SkillCandidateStatus;
  name: string;
  summary: string;
  source_procedure_id: string | null;
  source_procedure_status: ProcedureStatus | null;
  source_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
  procurement_record_id: string | null;
  procurement_record_payload: Record<string, unknown> | null;
  procurement_record_created_at: string | null;
};

type SkillCandidateVettingResultTargetRow = SkillCandidateSkillVetterHandoffTargetRow;

type SkillCandidateApprovalPlanTargetRow = SkillCandidateSkillVetterHandoffTargetRow & {
  vetting_result_id: string | null;
  vetting_result_payload: Record<string, unknown> | null;
};

type SkillCandidateInstallHandoffTargetRow = SkillCandidateApprovalPlanTargetRow & {
  approval_record_id: string | null;
  approval_record_payload: Record<string, unknown> | null;
  approval_record_created_at: string | null;
};

type SkillCandidateApprovalRecordRow = {
  id: string;
  approved_scope: SkillCandidateApprovalScope | null;
};

type SkillCandidateInstallRecordRow = {
  id: string;
  installed_scope: SkillCandidateApprovalScope | null;
};

type PendingCandidateReviewRow = {
  id: string;
  source_event_name: string | null;
  created_at: string;
};

type DraftProcedureIdRow = {
  id: string;
};

type CandidateSkillGovernanceRow = {
  id: string;
  status: SkillCandidateStatus;
};

type BackgroundJobRow = {
  id: string;
  project_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  job_kind: "maintenance";
  status: MemoryBackgroundJobStatus;
  payload: Record<string, unknown> | null;
  run_after: string;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown> | null;
  created_at?: string | Date;
  started_at?: string | Date | null;
  finished_at?: string | Date | null;
  last_error?: string | null;
};

type ToolResultRow = {
  id: string;
  session_id: string;
  memory_event_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  tool_name: string;
  status: "persisted" | "rehydrated" | "compacted" | "deleted";
  content_type: string | null;
  preview_text: string | null;
  payload_text: string | null;
  payload_json: JsonValue | null;
  size_bytes: string | number | null;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ToolResultMicrocompactRow = ToolResultRow;

type SessionMemoryRow = {
  id: string;
  agent_id: string;
  session_id: string | null;
  state_key: string;
  lifecycle: "active" | "paused" | "completed" | "superseded";
  state_json: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type RetrievedMemoryObjectRow = {
  object_type: "memory_object";
  read_surface: "approved_memory_view" | "reviewable_candidates_view";
  id: string;
  memory_kind: "project" | "feedback" | "procedure";
  review_state: "candidate" | "approved";
  content: string;
  project_id: string | null;
  agent_id: string | null;
  session_id: string | null;
  source_event_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RetrievedProcedureRow = {
  object_type: "procedure";
  read_surface: "validated_procedure_read_model";
  id: string;
  status: "validated";
  title: string;
  body: string;
  project_id: string | null;
  source_memory_object_id: string | null;
  source_candidate_id: string | null;
  latest_validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RankedMemoryObjectSearchRow = RetrievedMemoryObjectRow & {
  score: number;
  matched_fields: string[];
};

type RankedProcedureSearchRow = RetrievedProcedureRow & {
  score: number;
  matched_fields: string[];
};

type SemanticMemoryObjectSearchRow = RetrievedMemoryObjectRow & {
  score: number;
  distance: number;
  matched_fields: string[];
  embedding_model: string;
  embedding_version: string;
  chunk_index: number;
};

type SemanticProcedureSearchRow = RetrievedProcedureRow & {
  score: number;
  distance: number;
  matched_fields: string[];
  embedding_model: string;
  embedding_version: string;
  chunk_index: number;
};

type ConsolidationRecord = {
  objectType: "memory_object" | "procedure";
  id: string;
  projectId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

type ConsolidationExecutionMemoryRow = {
  id: string;
  project_id: string | null;
  memory_kind: "user" | "feedback" | "project" | "reference" | "procedure" | "policy";
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  metadata: Record<string, unknown> | null;
  created_at: string;
  superseded_at: string | null;
};

type DriftCheckExecutionProcedureRow = {
  id: string;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type PgErrorLike = Error & {
  code?: string;
};

function isConfigured(config: MemoryMiddlewareDbConfig): boolean {
  return typeof config.url === "string" && config.url.length > 0;
}

function normalizeCandidateLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_CANDIDATE_LIST_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_CANDIDATE_LIST_LIMIT;
  }
  return Math.min(truncated, MAX_CANDIDATE_LIST_LIMIT);
}

function normalizeToolResultThreshold(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PERSIST_THRESHOLD_BYTES);
}

function normalizeToolResultPreviewCharLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PREVIEW_CHAR_LIMIT);
}

function normalizeToolResultIdleGapSeconds(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_IDLE_GAP_SECONDS);
}

function normalizeToolResultCountThreshold(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_COUNT_THRESHOLD;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_COUNT_THRESHOLD;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_COUNT_THRESHOLD);
}

function normalizeToolResultRecentFloorCount(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT;
  }
  const truncated = Math.trunc(limit);
  if (truncated < 0) {
    return DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_RECENT_FLOOR_COUNT);
}

function normalizeToolResultMaxClearCount(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_MAX_CLEAR_COUNT);
}

function normalizeToolResultPromptTokenThreshold(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD);
}

function normalizeSessionMemoryStaleAfterSeconds(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS;
  }
  return Math.min(truncated, MAX_SESSION_MEMORY_STALE_AFTER_SECONDS);
}

function normalizeSessionMemoryString(
  value: string | undefined,
  maxChars: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.slice(0, maxChars);
}

function normalizeSessionMemoryList(
  values: string[] | undefined,
  maxItems: number,
): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const value = normalizeSessionMemoryString(rawValue, SESSION_MEMORY_ENTRY_MAX_CHARS);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

function createEmptySessionMemoryState(): SessionMemoryState {
  return {
    relevantFiles: [],
    commandsUsed: [],
    errorsAndCorrections: [],
    decisionsMade: [],
    importantFactsLearned: [],
    keyResults: [],
    pendingTasks: [],
    worklog: [],
  };
}

function normalizeSessionMemoryState(
  rawState: Record<string, unknown> | null | undefined,
): SessionMemoryState {
  const title = normalizeSessionMemoryString(
    typeof rawState?.title === "string" ? rawState.title : undefined,
    SESSION_MEMORY_TITLE_MAX_CHARS,
  );
  const currentState = normalizeSessionMemoryString(
    typeof rawState?.currentState === "string" ? rawState.currentState : undefined,
    SESSION_MEMORY_STATE_MAX_CHARS,
  );
  const taskSpecification = normalizeSessionMemoryString(
    typeof rawState?.taskSpecification === "string" ? rawState.taskSpecification : undefined,
    SESSION_MEMORY_TASK_SPEC_MAX_CHARS,
  );

  return {
    ...createEmptySessionMemoryState(),
    ...(title ? { title } : {}),
    ...(currentState ? { currentState } : {}),
    ...(taskSpecification ? { taskSpecification } : {}),
    relevantFiles:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.relevantFiles) ? (rawState.relevantFiles as string[]) : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    commandsUsed:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.commandsUsed) ? (rawState.commandsUsed as string[]) : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    errorsAndCorrections:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.errorsAndCorrections)
          ? (rawState.errorsAndCorrections as string[])
          : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    decisionsMade:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.decisionsMade) ? (rawState.decisionsMade as string[]) : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    importantFactsLearned:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.importantFactsLearned)
          ? (rawState.importantFactsLearned as string[])
          : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    keyResults:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.keyResults) ? (rawState.keyResults as string[]) : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    pendingTasks:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.pendingTasks) ? (rawState.pendingTasks as string[]) : undefined,
        SESSION_MEMORY_LIST_MAX_ITEMS,
      ) ?? [],
    worklog:
      normalizeSessionMemoryList(
        Array.isArray(rawState?.worklog) ? (rawState.worklog as string[]) : undefined,
        SESSION_MEMORY_WORKLOG_MAX_ITEMS,
      ) ?? [],
  };
}

function applySessionMemoryUpdate(
  existing: SessionMemoryState,
  input: SessionMemoryUpdateInput,
): SessionMemoryState {
  const nextState: SessionMemoryState = {
    ...existing,
  };

  if (input.title !== undefined) {
    const title = normalizeSessionMemoryString(input.title, SESSION_MEMORY_TITLE_MAX_CHARS);
    if (title) {
      nextState.title = title;
    } else {
      delete nextState.title;
    }
  }

  if (input.currentState !== undefined) {
    const currentState = normalizeSessionMemoryString(
      input.currentState,
      SESSION_MEMORY_STATE_MAX_CHARS,
    );
    if (currentState) {
      nextState.currentState = currentState;
    } else {
      delete nextState.currentState;
    }
  }

  if (input.taskSpecification !== undefined) {
    const taskSpecification = normalizeSessionMemoryString(
      input.taskSpecification,
      SESSION_MEMORY_TASK_SPEC_MAX_CHARS,
    );
    if (taskSpecification) {
      nextState.taskSpecification = taskSpecification;
    } else {
      delete nextState.taskSpecification;
    }
  }

  const arrayUpdates: Array<
    [
      (
        | "relevantFiles"
        | "commandsUsed"
        | "errorsAndCorrections"
        | "decisionsMade"
        | "importantFactsLearned"
        | "keyResults"
        | "pendingTasks"
        | "worklog"
      ),
      string[] | undefined,
      number,
    ]
  > = [
    ["relevantFiles", input.relevantFiles, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["commandsUsed", input.commandsUsed, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["errorsAndCorrections", input.errorsAndCorrections, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["decisionsMade", input.decisionsMade, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["importantFactsLearned", input.importantFactsLearned, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["keyResults", input.keyResults, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["pendingTasks", input.pendingTasks, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["worklog", input.worklog, SESSION_MEMORY_WORKLOG_MAX_ITEMS],
  ];

  for (const [key, values, maxItems] of arrayUpdates) {
    if (values !== undefined) {
      nextState[key] = normalizeSessionMemoryList(values, maxItems) ?? [];
    }
  }

  return nextState;
}

function toClientConfig(config: MemoryMiddlewareDbConfig): ClientConfig {
  if (!config.url) {
    throw new Error("memory middleware database URL is not configured");
  }
  return {
    connectionString: config.url,
  };
}

function assertSafeIdentifier(identifier: string, label: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`${label} must be a simple SQL identifier`);
  }
  return identifier;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier}"`;
}

function quoteQualifiedTable(params: { schema: string; table: string }): string {
  const schema = assertSafeIdentifier(params.schema, "schema");
  const table = assertSafeIdentifier(params.table, "table");
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

type ToolResultPayloadSelection =
  | {
      contentType: string;
      payloadText: string;
      payloadJson: null;
      serializedPayload: string;
    }
  | {
      contentType: string;
      payloadText: null;
      payloadJson: JsonValue;
      serializedPayload: string;
    };

function selectToolResultPayload(input: ToolResultPersistInput): ToolResultPayloadSelection {
  const hasText = typeof input.payloadText === "string";
  const hasJson = input.payloadJson !== undefined;

  if (hasText === hasJson) {
    throw new Error("tool result persistence requires exactly one of payloadText or payloadJson");
  }

  if (hasText) {
    return {
      contentType: input.contentType?.trim() || "text/plain",
      payloadText: input.payloadText ?? "",
      payloadJson: null,
      serializedPayload: input.payloadText ?? "",
    };
  }

  return {
    contentType: input.contentType?.trim() || "application/json",
    payloadText: null,
    payloadJson: input.payloadJson as JsonValue,
    serializedPayload: JSON.stringify(input.payloadJson),
  };
}

function summarizePreviewText(
  value: string,
  charLimit: number,
): {
  previewText: string;
  truncated: boolean;
  omittedBytes: number;
} {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= charLimit) {
    return {
      previewText: normalized,
      truncated: false,
      omittedBytes: 0,
    };
  }

  const previewBase = normalized.slice(0, Math.max(1, charLimit - 1)).trimEnd();
  const previewText = `${previewBase}…`;
  const omittedBytes = Math.max(
    0,
    Buffer.byteLength(normalized, "utf8") - Buffer.byteLength(previewText, "utf8"),
  );

  return {
    previewText,
    truncated: true,
    omittedBytes,
  };
}

function createToolResultPreview(params: {
  toolResultId?: string;
  contentType: string;
  serializedPayload: string;
  sizeBytes: number;
  previewCharLimit: number;
}): ToolResultPreview {
  const summarized = summarizePreviewText(params.serializedPayload, params.previewCharLimit);
  const referenceToken = params.toolResultId ? `tool_result:${params.toolResultId}` : undefined;
  const shouldSubstitute = Boolean(params.toolResultId);

  return {
    kind: "tool_result_preview",
    shouldSubstitute,
    previewText: summarized.previewText,
    substitutionText: shouldSubstitute
      ? `[tool-result:${params.toolResultId}] ${summarized.previewText}`
      : summarized.previewText,
    retrievalToolName: "memory_tool_result_get",
    ...(params.toolResultId ? { retrievalArgs: { toolResultId: params.toolResultId } } : {}),
    ...(referenceToken ? { referenceToken } : {}),
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
    truncated: summarized.truncated,
    omittedBytes: summarized.omittedBytes,
  };
}

function parseBigIntLikeToNumber(value: string | number | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeToolResultRecord(row: ToolResultRow): ToolResultRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    storageStatus: row.status,
    ...(row.content_type ? { contentType: row.content_type } : {}),
    ...(row.preview_text ? { previewText: row.preview_text } : {}),
    ...(row.payload_text ? { payloadText: row.payload_text } : {}),
    ...(row.payload_json !== null ? { payloadJson: row.payload_json } : {}),
    ...(parseBigIntLikeToNumber(row.size_bytes) !== undefined
      ? { sizeBytes: parseBigIntLikeToNumber(row.size_bytes) }
      : {}),
    ...(row.checksum_sha256 ? { checksumSha256: row.checksum_sha256 } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.memory_event_id ? { memoryEventId: row.memory_event_id } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function estimatePreviewTokens(row: ToolResultMicrocompactRow): number {
  const previewText = row.preview_text ?? "";
  const previewSource = previewText.length > 0 ? previewText : (row.payload_text ?? "");
  const previewChars = previewSource.length;
  const previewTokenEstimate = Math.ceil(previewChars / 4);
  const sizeEstimate = Math.ceil((parseBigIntLikeToNumber(row.size_bytes) ?? 0) / 4);
  return Math.max(1, previewTokenEstimate, sizeEstimate);
}

function normalizeToolResultMicrocompactCandidate(
  row: ToolResultMicrocompactRow,
): ToolResultMicrocompactCandidate {
  return {
    toolResultId: row.id,
    toolName: row.tool_name,
    ...(row.preview_text ? { previewText: row.preview_text } : {}),
    referenceToken: `tool_result:${row.id}`,
    ...(parseBigIntLikeToNumber(row.size_bytes) !== undefined
      ? { sizeBytes: parseBigIntLikeToNumber(row.size_bytes) }
      : {}),
    estimatedPreviewTokens: estimatePreviewTokens(row),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function normalizeSessionMemoryUpdateCount(metadata: Record<string, unknown> | null): number {
  const rawValue = metadata?.updateCount;
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0) {
    return Math.trunc(rawValue);
  }
  if (typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function isSessionMemorySufficient(memory: SessionMemoryState): boolean {
  return Boolean(
    memory.title ||
    memory.currentState ||
    memory.taskSpecification ||
    memory.decisionsMade.length > 0 ||
    memory.importantFactsLearned.length > 0 ||
    memory.keyResults.length > 0 ||
    memory.pendingTasks.length > 0 ||
    memory.worklog.length > 0 ||
    memory.relevantFiles.length > 0,
  );
}

function collectSessionMemoryCompactionEntries(
  memory: SessionMemoryState,
): Array<[string, string | undefined]> {
  return [
    ["title", memory.title],
    ["current_state", memory.currentState],
    ["task_specification", memory.taskSpecification],
    [
      "relevant_files",
      memory.relevantFiles.length > 0 ? memory.relevantFiles.join("; ") : undefined,
    ],
    ["commands_used", memory.commandsUsed.length > 0 ? memory.commandsUsed.join("; ") : undefined],
    [
      "errors_and_corrections",
      memory.errorsAndCorrections.length > 0 ? memory.errorsAndCorrections.join("; ") : undefined,
    ],
    [
      "decisions_made",
      memory.decisionsMade.length > 0 ? memory.decisionsMade.join("; ") : undefined,
    ],
    [
      "important_facts_learned",
      memory.importantFactsLearned.length > 0 ? memory.importantFactsLearned.join("; ") : undefined,
    ],
    ["key_results", memory.keyResults.length > 0 ? memory.keyResults.join("; ") : undefined],
    ["pending_tasks", memory.pendingTasks.length > 0 ? memory.pendingTasks.join("; ") : undefined],
    ["worklog", memory.worklog.length > 0 ? memory.worklog.join("; ") : undefined],
  ];
}

function buildSessionMemoryCompactionPayload(params: {
  stateId: string;
  memory: SessionMemoryState;
}): SessionMemoryCompactionPayload {
  const includedEntries = collectSessionMemoryCompactionEntries(params.memory).filter(
    (entry) => entry[1],
  );
  const compactedText = includedEntries.map(([field, value]) => `${field}: ${value}`).join("\n");

  return {
    kind: "session_memory_compaction",
    shouldSubstitute: true,
    substitutionText: `[session-memory:${params.stateId}] ${params.memory.title ?? params.memory.currentState ?? "session memory available"}`,
    compactedText,
    fieldsIncluded: includedEntries.map(([field]) => field),
    structuredMemory: params.memory,
  };
}

function buildFullCompactionFallbackPayload(params: {
  sessionId: string;
  planResult: Extract<CompactionPlanResult, { accepted: true }>;
  sessionMemoryStateId?: string;
  sessionMemoryUpdatedAt?: string;
  sessionMemory?: SessionMemoryState;
}): FullCompactionFallbackPayload {
  const sessionMemoryEntries = params.sessionMemory
    ? collectSessionMemoryCompactionEntries(params.sessionMemory).filter((entry) => entry[1])
    : [];
  const compactedLines: string[] = [
    "planner_outcome: propose_full_compaction_fallback",
    `session_memory_status: ${params.planResult.sessionMemoryStatus}`,
    `microcompaction_recommended: ${params.planResult.microcompactionRecommended ? "true" : "false"}`,
  ];

  if (params.sessionMemoryStateId) {
    compactedLines.push(`session_memory_state_id: ${params.sessionMemoryStateId}`);
  }
  if (params.sessionMemoryUpdatedAt) {
    compactedLines.push(`session_memory_updated_at: ${params.sessionMemoryUpdatedAt}`);
  }
  if (params.planResult.clearCandidates.length > 0) {
    compactedLines.push(
      `clear_candidate_ids: ${params.planResult.clearCandidates.map((item) => item.toolResultId).join("; ")}`,
    );
  }
  if (sessionMemoryEntries.length > 0) {
    compactedLines.push(
      ...sessionMemoryEntries.map(([field, value]) => `session_memory_${field}: ${value}`),
    );
  }
  compactedLines.push(`rationale: ${params.planResult.rationale.join("; ")}`);
  if (params.planResult.requiredInputs.length > 0) {
    compactedLines.push(`required_inputs: ${params.planResult.requiredInputs.join("; ")}`);
  }

  const compactedText = compactedLines.join("\n");
  const payloadSignature = createHash("sha256")
    .update(
      JSON.stringify({
        sessionId: params.sessionId,
        sessionMemoryStatus: params.planResult.sessionMemoryStatus,
        sessionMemoryStateId: params.sessionMemoryStateId,
        sessionMemoryUpdatedAt: params.sessionMemoryUpdatedAt,
        rationale: params.planResult.rationale,
        requiredInputs: params.planResult.requiredInputs,
        clearCandidateIds: params.planResult.clearCandidates.map((item) => item.toolResultId),
        compactedText,
      }),
    )
    .digest("hex")
    .slice(0, 12);

  return {
    kind: "full_compaction_fallback",
    shouldSubstitute: true,
    substitutionText: `[full-fallback:${payloadSignature}] bounded fallback artifact available`,
    compactedText,
    substrate: {
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: params.planResult.sessionMemoryStatus,
      ...(params.sessionMemoryStateId ? { sessionMemoryStateId: params.sessionMemoryStateId } : {}),
      ...(params.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: params.sessionMemoryUpdatedAt }
        : {}),
      microcompactionRecommended: params.planResult.microcompactionRecommended,
      clearCandidateIds: params.planResult.clearCandidates.map((item) => item.toolResultId),
    },
    rationale: params.planResult.rationale,
    ...(params.sessionMemory ? { structuredSessionMemory: params.sessionMemory } : {}),
  };
}

function mapCandidateKindToMemoryKind(
  input: CandidateSubmissionInput,
): CandidatePersistencePlan["memoryObject"]["memoryKind"] {
  if (
    input.kind === "correction" &&
    input.metadata &&
    typeof input.metadata === "object" &&
    input.metadata.category === "project_fact_correction"
  ) {
    return "project";
  }
  if (
    input.kind === "learning" &&
    input.metadata &&
    typeof input.metadata === "object" &&
    (input.metadata.category === "user_preference" ||
      input.metadata.category === "user_requirement")
  ) {
    return "feedback";
  }
  switch (input.kind) {
    case "correction":
      return "feedback";
    case "procedure":
      return "procedure";
    case "learning":
    case "improvement":
      return "project";
  }
}

function parseCandidateKind(value: string): CandidateSubmissionKind {
  if (
    value === "learning" ||
    value === "correction" ||
    value === "procedure" ||
    value === "improvement"
  ) {
    return value;
  }
  throw new Error(`candidate row contains unsupported submission kind: ${value}`);
}

function parseEventName(value: string): CandidateRecord["eventName"] {
  if (
    value === "candidate_submission.learning" ||
    value === "candidate_submission.correction" ||
    value === "candidate_submission.procedure" ||
    value === "candidate_submission.improvement"
  ) {
    return value;
  }
  throw new Error(`candidate row contains unsupported event name: ${value}`);
}

function parseProcedureStatus(value: string): ProcedureStatus {
  if (
    value === "draft" ||
    value === "validated" ||
    value === "superseded" ||
    value === "rejected" ||
    value === "archived"
  ) {
    return value;
  }
  throw new Error(`procedure row contains unsupported status: ${value}`);
}

function buildApprovedMemoryArtifactVisibilityCondition(alias: string): string {
  const hiddenArtifacts = NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES.map(
    (value) => `'${value}'`,
  ).join(", ");
  const artifactFamilyExpression = [
    "coalesce(",
    `${alias}.metadata->>'artifactFamily',`,
    `${alias}.metadata->'candidateMetadata'->>'artifactFamily',`,
    `${alias}.metadata->'promotionMetadata'->>'artifactFamily',`,
    "''",
    ")",
  ].join(" ");
  return `${artifactFamilyExpression} not in (${hiddenArtifacts})`;
}

function normalizeCandidateRecord(row: CandidateRow): CandidateRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    kind: parseCandidateKind(row.kind),
    memoryKind: row.memory_kind,
    reviewState: row.review_state,
    content: row.content,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    eventName: parseEventName(row.event_name),
    ...(row.candidate_metadata ? { candidateMetadata: row.candidate_metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeMemoryObjectListLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_MEMORY_OBJECT_LIST_LIMIT;
  }
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_MEMORY_OBJECT_LIST_LIMIT), 1),
    MAX_MEMORY_OBJECT_LIST_LIMIT,
  );
}

function normalizeMemoryObjectSearchLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT;
  }
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT), 1),
    MAX_MEMORY_OBJECT_SEARCH_LIMIT,
  );
}

type ResponseStyleQueryHint = {
  template:
    | "responses_concise"
    | "responses_bullets"
    | "responses_plain_english"
    | "responses_no_tables"
    | "responses_numbered_steps";
};

type ProjectFactQueryHint = {
  fieldKey:
    | "default_branch"
    | "staging_branch"
    | "repository_url"
    | "deployment_url"
    | "documentation_url"
    | "runbook_url"
    | "primary_package_manager"
    | "primary_environment_name";
};

type RecurringProcedureQueryHint = {
  procedureKey:
    | "deploy_checklist"
    | "release_checklist"
    | "triage_checklist"
    | "investigation_checklist";
};

type WorkflowImprovementQueryHint = {
  lessonKey:
    | "vitest_wrapper_required"
    | "scripts_committer_required"
    | "git_stash_unsafe"
    | "docs_only_check_fast"
    | "memory_proof_runner_required"
    | "readyz_for_readiness"
    | "python_command_unavailable"
    | "gateway_tools_invoke_forbidden"
    | "openai_embeddings_api_key_required"
    | "anthropic_context1m_eligible_credential_required";
};

type GeneralizedWorkflowGuidancePatternHint =
  | ""
  | "use_instead_of"
  | "trust_for_scope"
  | "avoid_only";

function normalizeRetrievalQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferGeneralizedWorkflowGuidancePatternHint(
  query: string,
): GeneralizedWorkflowGuidancePatternHint {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return "";
  }
  if (
    normalized.includes("what should i trust") ||
    normalized.includes("which signal should i trust") ||
    normalized.includes("which source should i trust") ||
    normalized.includes("what source should i trust") ||
    normalized.includes("rely on") ||
    normalized.includes("trust")
  ) {
    return "trust_for_scope";
  }
  if (
    normalized.includes("what should i avoid") ||
    normalized.includes("avoid") ||
    normalized.includes("don't use") ||
    normalized.includes("do not use")
  ) {
    return "avoid_only";
  }
  if (
    normalized.includes("should i use") ||
    normalized.includes("what should i use") ||
    normalized.includes("instead of")
  ) {
    return "use_instead_of";
  }
  return "";
}

function inferResponseStyleQueryHint(query: string): ResponseStyleQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("plain english") || normalized.includes("jargon")) {
    return { template: "responses_plain_english" };
  }
  if (normalized.includes("bullet points") || normalized.includes("bullet-point")) {
    return { template: "responses_bullets" };
  }
  if (normalized.includes("numbered steps") || normalized.includes("numbered lists")) {
    return { template: "responses_numbered_steps" };
  }
  if (normalized.includes("table")) {
    return { template: "responses_no_tables" };
  }
  if (
    normalized.includes("concise") ||
    normalized.includes("brief") ||
    normalized.includes("short replies") ||
    normalized.includes("short responses")
  ) {
    return { template: "responses_concise" };
  }
  return null;
}

function inferProjectFactQueryHint(query: string): ProjectFactQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("default branch")) {
    return { fieldKey: "default_branch" };
  }
  if (normalized.includes("staging branch")) {
    return { fieldKey: "staging_branch" };
  }
  if (
    normalized.includes("repository url") ||
    normalized.includes("repo url") ||
    normalized.includes("repository link") ||
    normalized.includes("repo link")
  ) {
    return { fieldKey: "repository_url" };
  }
  if (
    normalized.includes("deployment url") ||
    normalized.includes("deploy url") ||
    normalized.includes("deployed url") ||
    normalized.includes("deployment link")
  ) {
    return { fieldKey: "deployment_url" };
  }
  if (
    normalized.includes("documentation url") ||
    normalized.includes("docs url") ||
    normalized.includes("documentation link") ||
    normalized.includes("docs link")
  ) {
    return { fieldKey: "documentation_url" };
  }
  if (normalized.includes("runbook url") || normalized.includes("runbook link")) {
    return { fieldKey: "runbook_url" };
  }
  if (
    normalized.includes("package manager") ||
    normalized.includes("pnpm") ||
    normalized.includes("npm") ||
    normalized.includes("yarn") ||
    normalized.includes("bun")
  ) {
    return { fieldKey: "primary_package_manager" };
  }
  if (normalized.includes("environment")) {
    return { fieldKey: "primary_environment_name" };
  }
  return null;
}

function inferRecurringProcedureQueryHint(query: string): RecurringProcedureQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("deploy checklist") ||
    normalized.includes("deployment checklist") ||
    /\bdeploy\b/.test(normalized) ||
    /\bdeployment\b/.test(normalized) ||
    /\broll out\b/.test(normalized) ||
    /\brollout\b/.test(normalized)
  ) {
    return { procedureKey: "deploy_checklist" };
  }
  if (
    normalized.includes("release checklist") ||
    normalized.includes("release steps") ||
    /\brelease\b/.test(normalized) ||
    /\bship\b/.test(normalized)
  ) {
    return { procedureKey: "release_checklist" };
  }
  if (
    normalized.includes("triage checklist") ||
    normalized.includes("triage steps") ||
    /\btriage\b/.test(normalized)
  ) {
    return { procedureKey: "triage_checklist" };
  }
  if (
    normalized.includes("investigation checklist") ||
    normalized.includes("investigation steps") ||
    /\binvestigate\b/.test(normalized) ||
    /\binvestigation\b/.test(normalized) ||
    /\bdebug\b/.test(normalized)
  ) {
    return { procedureKey: "investigation_checklist" };
  }
  return null;
}

function inferWorkflowImprovementQueryHint(query: string): WorkflowImprovementQueryHint | null {
  const normalized = normalizeRetrievalQuery(query);
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("vitest") ||
    normalized.includes("pnpm test") ||
    normalized.includes("test wrapper") ||
    normalized.includes("run tests")
  ) {
    return { lessonKey: "vitest_wrapper_required" };
  }
  if (
    normalized.includes("scripts/committer") ||
    normalized.includes("git add") ||
    normalized.includes("git commit") ||
    normalized.includes("scoped commit")
  ) {
    return { lessonKey: "scripts_committer_required" };
  }
  if (normalized.includes("git stash") || normalized.includes("stash")) {
    return { lessonKey: "git_stash_unsafe" };
  }
  if (
    (normalized.includes("docs-only") ||
      normalized.includes("docs only") ||
      normalized.includes("process-only") ||
      normalized.includes("process only") ||
      normalized.includes("changelog-only") ||
      normalized.includes("changelog only")) &&
    (normalized.includes("check:fast") ||
      normalized.includes("check fast") ||
      normalized.includes("pnpm check") ||
      normalized.includes("pnpm build"))
  ) {
    return { lessonKey: "docs_only_check_fast" };
  }
  if (
    normalized.includes("memory:proof") ||
    (normalized.includes("memory proof") &&
      (normalized.includes("proof runner") ||
        normalized.includes("isolated proof") ||
        normalized.includes("production proof")))
  ) {
    return { lessonKey: "memory_proof_runner_required" };
  }
  if (
    normalized.includes("readyz") ||
    ((normalized.includes("healthz") || normalized.includes("liveness")) &&
      normalized.includes("readiness"))
  ) {
    return { lessonKey: "readyz_for_readiness" };
  }
  if (
    (normalized.includes("python") &&
      (normalized.includes("not available") ||
        normalized.includes("unavailable") ||
        normalized.includes("without python") ||
        normalized.includes("python command"))) ||
    normalized.includes("tsx")
  ) {
    return { lessonKey: "python_command_unavailable" };
  }
  if (
    normalized.includes("/tools/invoke") ||
    normalized.includes("tools invoke") ||
    (normalized.includes("gateway") && normalized.includes("runtime invocation"))
  ) {
    return { lessonKey: "gateway_tools_invoke_forbidden" };
  }
  if (
    (normalized.includes("embedding") || normalized.includes("semantic memory search")) &&
    (normalized.includes("codex oauth") ||
      normalized.includes("codex") ||
      normalized.includes("chatgpt oauth")) &&
    (normalized.includes("api key") || normalized.includes("openai_api_key"))
  ) {
    return { lessonKey: "openai_embeddings_api_key_required" };
  }
  if (
    (normalized.includes("anthropic") || normalized.includes("claude")) &&
    (normalized.includes("long context") || normalized.includes("context1m")) &&
    (normalized.includes("extra usage") ||
      normalized.includes("429") ||
      normalized.includes("fallback model"))
  ) {
    return { lessonKey: "anthropic_context1m_eligible_credential_required" };
  }
  return null;
}

function normalizeConsolidationPlanLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CONSOLIDATION_PLAN_LIMIT;
  }
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_CONSOLIDATION_PLAN_LIMIT), 1),
    MAX_CONSOLIDATION_PLAN_LIMIT,
  );
}

function normalizeConsolidationPlanMaxFindings(maxFindings: number | undefined): number {
  if (!Number.isFinite(maxFindings)) {
    return DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS;
  }
  return Math.min(
    Math.max(Math.trunc(maxFindings ?? DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS), 1),
    MAX_CONSOLIDATION_PLAN_MAX_FINDINGS,
  );
}

function normalizeProactivePlanMaxActions(maxActions: number | undefined): number {
  if (!Number.isFinite(maxActions)) {
    return DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS;
  }
  return Math.min(
    Math.max(Math.trunc(maxActions ?? DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS), 1),
    MAX_PROACTIVE_PLAN_MAX_ACTIONS,
  );
}

function normalizeBackgroundJobMaxAttempts(maxAttempts: number | undefined): number {
  if (!Number.isFinite(maxAttempts)) {
    return DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS;
  }
  return Math.min(
    Math.max(Math.trunc(maxAttempts ?? DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS), 1),
    MAX_BACKGROUND_JOB_MAX_ATTEMPTS,
  );
}

function normalizeBackgroundJobAffectedIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) {
    return undefined;
  }

  const normalized = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBackgroundJobRunAfter(runAfter: string | undefined): string {
  if (!runAfter) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(runAfter);
  if (Number.isNaN(parsed)) {
    throw new Error("background job runAfter must be a valid ISO-8601 timestamp");
  }
  return new Date(parsed).toISOString();
}

function parseMemoryBackgroundJobClass(value: unknown): MemoryBackgroundJobClass | undefined {
  return value === "proactive_plan" ||
    value === "proactive_execute_run_drift_check" ||
    value === "consolidation_plan" ||
    value === "consolidation_execute"
    ? value
    : undefined;
}

function normalizeBackgroundJobConsolidationSelections(
  selections: { actionType: unknown; affectedObjectIds: unknown }[] | undefined,
): ConsolidationExecuteSelection[] | undefined {
  if (!selections || selections.length === 0) {
    return undefined;
  }

  return selections
    .map((selection) => {
      const actionType = selection.actionType;
      if (
        actionType !== "duplicate_merge_review" &&
        actionType !== "contradiction_review" &&
        actionType !== "stale_superseded_review" &&
        actionType !== "drift_check_review"
      ) {
        return undefined;
      }
      if (!Array.isArray(selection.affectedObjectIds)) {
        return undefined;
      }
      const affectedObjectIds = [
        ...new Set(
          selection.affectedObjectIds.filter((entry): entry is string => typeof entry === "string"),
        ),
      ]
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .sort((left, right) => left.localeCompare(right));
      if (affectedObjectIds.length === 0) {
        return undefined;
      }
      return {
        actionType,
        affectedObjectIds,
      } satisfies ConsolidationExecuteSelection;
    })
    .filter((selection): selection is ConsolidationExecuteSelection => Boolean(selection))
    .sort((left, right) => {
      const actionDelta = left.actionType.localeCompare(right.actionType);
      if (actionDelta !== 0) {
        return actionDelta;
      }
      return left.affectedObjectIds.join(",").localeCompare(right.affectedObjectIds.join(","));
    });
}

function createBackgroundJobPayload(
  input: MemoryBackgroundJobEnqueueInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    jobClass: input.jobClass,
  };

  if (input.projectId) {
    payload.projectId = input.projectId;
  }
  if (input.maxActions !== undefined) {
    payload.maxActions = normalizeProactivePlanMaxActions(input.maxActions);
  }
  if (input.limit !== undefined) {
    payload.limit = normalizeConsolidationPlanLimit(input.limit);
  }
  if (input.maxFindings !== undefined) {
    payload.maxFindings = normalizeConsolidationPlanMaxFindings(input.maxFindings);
  }

  const affectedIds = normalizeBackgroundJobAffectedIds(input.affectedIds);
  if (affectedIds) {
    payload.affectedIds = affectedIds;
  }
  const approvedFindings = input.approvedFindings
    ? normalizeBackgroundJobConsolidationSelections(input.approvedFindings)
    : undefined;
  if (approvedFindings) {
    payload.approvedFindings = approvedFindings;
  }
  if (input.reviewerAgentId) {
    payload.reviewerAgentId = input.reviewerAgentId;
  }
  if (input.includeValidatedProcedures !== undefined) {
    payload.includeValidatedProcedures = input.includeValidatedProcedures;
  }

  return payload;
}

function createBackgroundJobPayloadFingerprint(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function normalizeConsolidationSelectionIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function createConsolidationSelectionKey(params: {
  actionType: ConsolidationPlanActionType;
  affectedObjectIds: string[];
}): string {
  return `${params.actionType}:${normalizeConsolidationSelectionIds(params.affectedObjectIds).join(",")}`;
}

function normalizeMemoryObjectScope(
  scope: MemoryObjectSearchScope | undefined,
): MemoryObjectSearchScope {
  return scope ?? "approved_only";
}

function normalizeMemoryObjectSemanticScope(
  scope: MemoryObjectSemanticSearchScope | undefined,
): MemoryObjectSemanticSearchScope {
  return scope ?? "approved_only";
}

function scopeIncludesCandidates(scope: MemoryObjectSearchScope): boolean {
  return scope === "include_candidates" || scope === "include_candidates_and_validated_procedures";
}

function scopeIncludesValidatedProcedures(scope: MemoryObjectSearchScope): boolean {
  return (
    scope === "include_validated_procedures" ||
    scope === "include_candidates_and_validated_procedures"
  );
}

function parseMemoryObjectReadSurface(
  value: string,
): Extract<MemoryObjectReadSurface, "approved_memory_view" | "reviewable_candidates_view"> {
  if (value === "approved_memory_view" || value === "reviewable_candidates_view") {
    return value;
  }
  throw new Error(`memory object row contains unsupported read surface: ${value}`);
}

function parseProcedureReadSurface(
  value: string,
): Extract<MemoryObjectReadSurface, "validated_procedure_read_model"> {
  if (value === "validated_procedure_read_model") {
    return value;
  }
  throw new Error(`procedure row contains unsupported read surface: ${value}`);
}

function normalizeMemoryObjectRecord(row: RetrievedMemoryObjectRow): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: parseMemoryObjectReadSurface(row.read_surface),
    id: row.id,
    memoryKind: row.memory_kind,
    reviewState: row.review_state,
    content: row.content,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProcedureObjectRecord(row: RetrievedProcedureRow): ProcedureObjectRecord {
  return {
    objectType: "procedure",
    readSurface: parseProcedureReadSurface(row.read_surface),
    id: row.id,
    status: "validated",
    title: row.title,
    body: row.body,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.source_memory_object_id ? { sourceMemoryObjectId: row.source_memory_object_id } : {}),
    ...(row.source_candidate_id ? { sourceCandidateId: row.source_candidate_id } : {}),
    ...(row.latest_validation_run_id
      ? { latestValidationRunId: row.latest_validation_run_id }
      : {}),
    ...(row.latest_validation_run_outcome
      ? { latestValidationRunOutcome: row.latest_validation_run_outcome }
      : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRankedMemoryObjectRecord(
  row: RankedMemoryObjectSearchRow,
): RankedRetrievedMemoryRecord {
  return {
    ...normalizeMemoryObjectRecord(row),
    score: row.score,
    matchedFields: row.matched_fields,
  };
}

function normalizeConsolidationContent(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMetadataScalarKey(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function normalizeConsolidationRecordFromMemoryObject(
  record: MemoryObjectRecord,
): ConsolidationRecord {
  return {
    objectType: "memory_object",
    id: record.id,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    content: record.content,
    ...(record.metadata ? { metadata: record.metadata } : {}),
    updatedAt: record.updatedAt,
  };
}

function normalizeConsolidationRecordFromProcedure(
  record: ProcedureObjectRecord,
): ConsolidationRecord {
  return {
    objectType: "procedure",
    id: record.id,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    title: record.title,
    content: `${record.title}\n${record.body}`.trim(),
    ...(record.metadata ? { metadata: record.metadata } : {}),
    updatedAt: record.updatedAt,
  };
}

function buildConsolidationFinding(params: {
  actionType: ConsolidationPlanActionType;
  priority: ConsolidationPlanPriority;
  confidence: ConsolidationPlanConfidence;
  records: ConsolidationRecord[];
  rationale: string[];
}): ConsolidationPlanFinding {
  const affectedObjectIds = [...new Set(params.records.map((record) => record.id))].sort();
  const affectedObjectTypes = affectedObjectIds
    .map((id) => params.records.find((record) => record.id === id))
    .filter((record): record is ConsolidationRecord => Boolean(record))
    .map((record) => record.objectType);
  const projectIds = [...new Set(params.records.map((record) => record.projectId).filter(Boolean))];

  return {
    actionType: params.actionType,
    priority: params.priority,
    confidence: params.confidence,
    affectedObjectIds,
    affectedObjectTypes,
    rationale: params.rationale,
    ...(projectIds.length === 1 ? { projectId: projectIds[0] } : {}),
  };
}

function summarizeConsolidationExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown consolidation execution failure";
}

function normalizeConsolidationExecuteSelection(
  selection: ConsolidationExecuteSelection,
): ConsolidationExecuteSelection {
  return {
    actionType: selection.actionType,
    affectedObjectIds: normalizeConsolidationSelectionIds(selection.affectedObjectIds),
  };
}

function summarizeDriftCheckExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown drift-check execution failure";
}

function normalizeDriftCheckExecuteSelection(
  selection: DriftCheckExecuteSelection,
): DriftCheckExecuteSelection {
  return {
    actionType: "drift_check_review",
    affectedObjectIds: normalizeConsolidationSelectionIds(selection.affectedObjectIds),
  };
}

function normalizeRankedProcedureObjectRecord(
  row: RankedProcedureSearchRow,
): RankedRetrievedMemoryRecord {
  return {
    ...normalizeProcedureObjectRecord(row),
    score: row.score,
    matchedFields: row.matched_fields,
  };
}

function normalizeSemanticMemoryObjectRecord(
  row: SemanticMemoryObjectSearchRow,
): SemanticRetrievedMemoryRecord {
  return {
    ...normalizeMemoryObjectRecord(row),
    score: row.score,
    distance: row.distance,
    matchedFields: row.matched_fields,
    embeddingModel: row.embedding_model,
    embeddingVersion: row.embedding_version,
    chunkIndex: row.chunk_index,
  };
}

function normalizeSemanticProcedureObjectRecord(
  row: SemanticProcedureSearchRow,
): SemanticRetrievedMemoryRecord {
  return {
    ...normalizeProcedureObjectRecord(row),
    score: row.score,
    distance: row.distance,
    matchedFields: row.matched_fields,
    embeddingModel: row.embedding_model,
    embeddingVersion: row.embedding_version,
    chunkIndex: row.chunk_index,
  };
}

export function createCandidateSubmissionPersistencePlan(params: {
  schema: string;
  input: CandidateSubmissionInput;
}): CandidatePersistencePlan {
  const schema = assertSafeIdentifier(params.schema, "schema");
  const input = params.input;
  const eventName = `candidate_submission.${input.kind}` as const;

  return {
    schema,
    event: {
      eventKind: "candidate_submission",
      eventName,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      payload: {
        submissionKind: input.kind,
        content: input.content,
        ...(input.metadata ? { candidateMetadata: input.metadata } : {}),
      },
      metadata: {
        source: "candidate-only-ingress",
      },
    },
    memoryObject: {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      memoryKind: mapCandidateKindToMemoryKind(input),
      reviewState: "candidate",
      content: input.content,
      metadata: {
        submissionKind: input.kind,
        ...(input.metadata ? { candidateMetadata: input.metadata } : {}),
      },
    },
    memorySource: {
      sourceKind: "event",
      sourceTable: `${schema}.memory_events`,
      metadata: {
        source: "candidate-only-ingress",
        submissionKind: input.kind,
      },
    },
  };
}

function summarizeCandidateError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "candidate submission references a missing project, agent, or session";
    case "23514":
      return "candidate submission violated a memory middleware constraint";
    case "22P02":
      return "candidate submission used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect")) {
    return "memory middleware database is unavailable";
  }
  if (pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate submission failed: ${pgError.message}`;
}

function summarizeCandidateQueryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate query failed: ${pgError.message}`;
}

function summarizeCandidateReviewError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "candidate review references a missing candidate or reviewer";
    case "23514":
      return "candidate review violated a memory middleware constraint";
    case "22P02":
      return "candidate review used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate review failed: ${pgError.message}`;
}

function summarizeToolResultPersistenceError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "tool-result persistence references a missing session, project, or agent";
    case "23514":
      return "tool-result persistence violated a memory middleware constraint";
    case "22P02":
      return "tool-result persistence used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result persistence failed: ${pgError.message}`;
}

function summarizeToolResultQueryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result query failed: ${pgError.message}`;
}

function summarizeToolResultMicrocompactionError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result microcompaction planning failed: ${pgError.message}`;
}

function summarizeSessionMemoryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "session-memory write references a missing session or agent";
    case "23514":
      return "session-memory write violated a memory middleware constraint";
    case "22P02":
      return "session-memory write used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `session-memory operation failed: ${pgError.message}`;
}

function mapReviewOutcome(params: { outcome: CandidateReviewOutcome }): {
  action: "approve" | "correct" | "reject";
  resultingState: "approved" | "corrected" | "rejected";
  persistedReviewState: "candidate" | "corrected" | "rejected";
  updateMemoryObjectState: boolean;
} {
  switch (params.outcome) {
    case "accepted":
      return {
        action: "approve",
        resultingState: "approved",
        persistedReviewState: "candidate",
        updateMemoryObjectState: false,
      };
    case "needs_revision":
      return {
        action: "correct",
        resultingState: "corrected",
        persistedReviewState: "corrected",
        updateMemoryObjectState: true,
      };
    case "rejected":
      return {
        action: "reject",
        resultingState: "rejected",
        persistedReviewState: "rejected",
        updateMemoryObjectState: true,
      };
  }
}

function summarizeCandidatePlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate promotion planning failed: ${pgError.message}`;
}

function summarizeProcedureValidationPlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `procedure validation planning failed: ${pgError.message}`;
}

function summarizeProcedureValidationError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "procedure validation references missing procedure or validator rows";
    case "23514":
      return "procedure validation violated a memory middleware constraint";
    case "22P02":
      return "procedure validation used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `procedure validation failed: ${pgError.message}`;
}

function summarizeSkillCandidatePlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateCreateError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate creation references missing procedure provenance rows";
    case "23514":
      return "skill-candidate creation violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate creation used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate creation failed: ${pgError.message}`;
}

function summarizeSkillCandidateProcurementPlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate procurement planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateProcurementRecordError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate procurement record references missing provenance rows";
    case "23514":
      return "skill-candidate procurement record violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate procurement record used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate procurement record failed: ${pgError.message}`;
}

function summarizeSkillCandidateSkillVetterHandoffError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate Skill Vetter handoff planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateVettingResultError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate vetting result references missing provenance rows";
    case "23514":
      return "skill-candidate vetting result violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate vetting result used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate vetting result failed: ${pgError.message}`;
}

function summarizeSkillCandidateApprovalPlanError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate approval planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateApprovalError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate approval references missing provenance rows";
    case "23514":
      return "skill-candidate approval violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate approval used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate approval failed: ${pgError.message}`;
}

function summarizeSkillCandidateInstallHandoffError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate install handoff planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateInstallRecordError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate install record creation failed: ${pgError.message}`;
}

function summarizeMemoryObjectQueryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `memory object query failed: ${pgError.message}`;
}

function summarizeCandidatePromotionError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "candidate memory promotion references missing provenance rows";
    case "23514":
      return "candidate memory promotion violated a memory middleware constraint";
    case "22P02":
      return "candidate memory promotion used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate memory promotion failed: ${pgError.message}`;
}

function summarizeCandidateProcedurePromotionError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "candidate procedure promotion references missing provenance rows";
    case "23514":
      return "candidate procedure promotion violated a memory middleware constraint";
    case "22P02":
      return "candidate procedure promotion used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `candidate procedure promotion failed: ${pgError.message}`;
}

function buildCandidatePromotionPlan(params: {
  candidateId: string;
  kind: CandidateSubmissionKind;
  reviewState: "candidate" | "corrected" | "rejected";
  latestReviewOutcome?: CandidateReviewOutcome;
}): CandidatePromotionPlanResult {
  if (params.reviewState === "rejected" || params.latestReviewOutcome === "rejected") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "rejected",
      latestReviewOutcome: "rejected",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate has a rejected review outcome",
        "rejected candidates are not eligible for next-step promotion planning",
      ],
      requiredGates: [
        "candidate would need to be resubmitted or replaced before future promotion planning",
      ],
    };
  }

  if (params.reviewState === "corrected" || params.latestReviewOutcome === "needs_revision") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "corrected",
      latestReviewOutcome: "needs_revision",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate has a needs-revision review outcome",
        "candidates needing revision are not eligible for promotion planning until reviewed again",
      ],
      requiredGates: [
        "revise the candidate content",
        "record a fresh accepted review outcome before promotion planning",
      ],
    };
  }

  if (params.latestReviewOutcome !== "accepted") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "candidate",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate does not yet have an accepted review outcome",
        "promotion planning stays advisory-only until a reviewer accepts the candidate",
      ],
      requiredGates: ["record an accepted candidate review before promotion planning"],
    };
  }

  const nextTarget: CandidatePromotionPlanTarget =
    params.kind === "procedure" ? "propose_procedure_draft" : "propose_memory_promotion";
  const requiredGates =
    params.kind === "procedure"
      ? [
          "manual promotion confirmation is still required",
          "bounded procedure-draft promotion requires an explicit write tool invocation",
          "policy and review checks must pass before any future promotion write",
        ]
      : [
          "manual promotion confirmation is still required",
          "bounded memory promotion requires an explicit write tool invocation",
          "policy and review checks must pass before any future promotion write",
        ];
  const rationale =
    params.kind === "procedure"
      ? [
          "candidate has an accepted review outcome",
          "procedure candidates can be considered for a future procedure-draft path",
        ]
      : [
          "candidate has an accepted review outcome",
          "this candidate kind can be considered for a future memory-promotion path",
        ];

  return {
    accepted: true,
    status: "ok",
    candidateId: params.candidateId,
    candidateKind: params.kind,
    reviewState: "candidate",
    latestReviewOutcome: "accepted",
    eligible: true,
    possibleTargets: [nextTarget, "remain_candidate_only"],
    rationale,
    requiredGates,
  };
}

function normalizePromotionReviewState(
  reviewState: CandidateMemoryPromotionTargetRow["review_state"],
): "candidate" | "corrected" | "rejected" {
  if (reviewState === "candidate" || reviewState === "corrected" || reviewState === "rejected") {
    return reviewState;
  }
  return "candidate";
}

function buildMemoryPromotionPlanFromTarget(params: {
  candidateId: string;
  kind: CandidateSubmissionKind;
  reviewState: CandidateMemoryPromotionTargetRow["review_state"];
  latestReviewOutcome?: CandidateReviewOutcome;
}): CandidatePromotionPlanResult {
  return buildCandidatePromotionPlan({
    candidateId: params.candidateId,
    kind: params.kind,
    reviewState: normalizePromotionReviewState(params.reviewState),
    ...(params.latestReviewOutcome ? { latestReviewOutcome: params.latestReviewOutcome } : {}),
  });
}

function buildProcedureValidationPlan(params: {
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  sourceCandidateKind?: CandidateSubmissionKind;
  latestCandidateReviewOutcome?: CandidateReviewOutcome;
  hasPromotedReviewProvenance: boolean;
  hasSourceEventProvenance: boolean;
}): ProcedureValidationPlanResult {
  const remainDraftOnly = (
    rationale: string[],
    requiredGates: string[],
  ): ProcedureValidationPlanResult => ({
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: params.procedureStatus,
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestCandidateReviewOutcome
      ? { latestCandidateReviewOutcome: params.latestCandidateReviewOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_draft_only"],
    rationale,
    requiredGates,
  });

  if (params.procedureStatus !== "draft") {
    return remainDraftOnly(
      [
        `procedure is already in ${params.procedureStatus} state`,
        "only draft procedures are eligible for validated-procedure planning",
      ],
      ["keep this procedure out of validated-procedure planning until a new draft exists"],
    );
  }

  if (!params.sourceCandidateId) {
    return remainDraftOnly(
      [
        "procedure draft is missing candidate source-memory provenance",
        "validated-procedure planning requires a draft linked back to a reviewed procedure candidate",
      ],
      ["recreate or relink the draft through the bounded procedure-promotion path"],
    );
  }

  if (params.sourceCandidateKind !== "procedure") {
    return remainDraftOnly(
      [
        "procedure draft is not backed by a procedure candidate",
        "validated-procedure planning is reserved for bounded procedure-draft artifacts",
      ],
      ["use a reviewed procedure candidate before considering validated-procedure planning"],
    );
  }

  if (params.latestCandidateReviewOutcome !== "accepted") {
    return remainDraftOnly(
      [
        "source procedure candidate does not have an accepted review outcome",
        "validated-procedure planning stays advisory-only until the source candidate is accepted",
      ],
      ["record an accepted candidate review before planning a validated procedure"],
    );
  }

  if (!params.hasPromotedReviewProvenance || !params.hasSourceEventProvenance) {
    return remainDraftOnly(
      [
        "procedure draft is missing required promotion provenance",
        "validated-procedure planning requires both accepted-review and source-event linkage",
      ],
      ["recreate the draft through the bounded procedure-promotion path"],
    );
  }

  const possibleTargets: ProcedureValidationPlanTarget[] = [
    "propose_validated_procedure",
    "remain_draft_only",
  ];

  return {
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: "draft",
    sourceCandidateId: params.sourceCandidateId,
    latestCandidateReviewOutcome: "accepted",
    eligible: true,
    possibleTargets,
    rationale: [
      "procedure draft is backed by an accepted reviewed procedure candidate",
      "draft provenance includes both accepted-review and source-event linkage",
    ],
    requiredGates: [
      "manual validation confirmation is still required",
      "validated-procedure writes require an explicit write tool invocation",
      "procedure-run evidence, policy checks, and review gates must pass before any future validation write",
    ],
  };
}

function buildSkillCandidatePlan(params: {
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  hasValidationRun: boolean;
  hasPromotedReviewProvenance: boolean;
  hasSourceEventProvenance: boolean;
}): SkillCandidatePlanResult {
  const remainValidatedProcedureOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidatePlanResult => ({
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: params.procedureStatus,
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_validated_procedure_only"],
    rationale,
    requiredGates,
  });

  if (params.procedureStatus !== "validated") {
    return remainValidatedProcedureOnly(
      [
        `procedure is currently in ${params.procedureStatus} state`,
        "only validated procedures are eligible for skill-candidate planning",
      ],
      ["complete bounded procedure validation before planning a skill candidate"],
    );
  }

  if (!params.sourceCandidateId) {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing source candidate provenance",
        "skill-candidate planning requires a procedure that preserves bounded candidate lineage",
      ],
      ["recreate the validated procedure through the bounded candidate-to-procedure path"],
    );
  }

  if (!params.hasPromotedReviewProvenance || !params.hasSourceEventProvenance) {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing required review or event provenance",
        "skill-candidate planning requires preserved bounded promotion provenance",
      ],
      ["recreate the validated procedure through the bounded promotion and validation path"],
    );
  }

  if (!params.hasValidationRun || params.latestValidationRunOutcome !== "passed") {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing a passed validation run",
        "skill-candidate planning stays advisory-only until procedure validation evidence is present",
      ],
      ["record a successful bounded validation run before planning a skill candidate"],
    );
  }

  const possibleTargets: SkillCandidatePlanTarget[] = [
    "propose_skill_candidate",
    "remain_validated_procedure_only",
  ];

  return {
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: "validated",
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "procedure is in validated state",
      "validated procedure preserves bounded candidate provenance and a passed validation run",
    ],
    requiredGates: [
      "manual skill-candidate confirmation is still required",
      "skill-candidate creation requires an explicit write tool invocation",
      "procurement, review, and policy checks must pass before any future skill-candidate write",
    ],
  };
}

function buildSkillCandidateProcurementPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  name: string;
  summary: string;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
}): SkillCandidateProcurementPlanResult {
  const remainInternalOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidateProcurementPlanResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_internal_skill_candidate_only"],
    rationale,
    requiredGates,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remainInternalOnly(
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "procurement handoff planning is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning procurement workflow for the skill candidate's current lifecycle state"],
    );
  }

  if (!params.sourceProcedureId) {
    return remainInternalOnly(
      [
        "skill candidate is missing source procedure provenance",
        "procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded procedure-to-skill path"],
    );
  }

  if (params.sourceProcedureStatus !== "validated") {
    return remainInternalOnly(
      [
        "source procedure is not in validated state",
        "procurement handoff planning requires a bounded skill candidate backed by a validated procedure",
      ],
      ["validate the source procedure through the bounded validation path first"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing required bounded lineage fields",
        "procurement handoff planning requires preserved candidate, review, event, and validation provenance",
      ],
      ["recreate the skill candidate through the bounded internal promotion path"],
    );
  }

  if (params.latestValidationRunOutcome !== "passed") {
    return remainInternalOnly(
      [
        "skill candidate is missing a passed validation run outcome",
        "procurement handoff planning stays advisory-only until bounded validation evidence is present",
      ],
      ["record a successful bounded procedure validation before procurement handoff planning"],
    );
  }

  const possibleTargets: SkillCandidateProcurementPlanTarget[] = [
    "propose_procurement_handoff",
    "remain_internal_skill_candidate_only",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: "candidate",
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
    ],
    requiredGates: [
      "manual procurement handoff confirmation is still required",
      "Skill Vetter must be invoked explicitly outside this advisory slice",
      "minimum vetting outputs must be recorded before lifecycle advancement",
      "installation remains blocked until procurement and policy gates pass",
    ],
    handoff: {
      source: {
        sourceType: "bounded_internal_skill_candidate",
        skillCandidateId: params.skillCandidateId,
        sourceProcedureId: params.sourceProcedureId,
        sourceCandidateId: params.sourceCandidateId,
        sourceEventId: params.sourceEventId,
        validationRunId: params.validationRunId,
      },
      scope: {
        name: params.name,
        summary: params.summary,
        intendedRole: "candidate_reusable_behavior",
        boundaries: [
          "bounded internal skill candidate only",
          "no installation or runtime enablement is implied by this plan",
          "must remain an accelerator and not the canonical memory substrate",
        ],
        overlaps: [
          "candidate reusable behavior distilled from a validated procedure",
          "future external skill evaluation must remain subordinate to repo-native memory architecture",
        ],
      },
      permissionsRisk: {
        currentArtifactRisk: "bounded_internal_record_only",
        installRisk: "external_skill_not_reviewed",
        requiredChecks: [
          "review file, network, secret, and execution expectations during procurement",
          "confirm requested capability is compatible with current policy posture",
          "verify the actual packaged skill before any install decision",
        ],
      },
      suspiciousPatterns: {
        knownConcerns: [
          "no external package has been reviewed yet",
          "Skill Vetter has not been invoked by this planning surface",
        ],
        openQuestions: [
          "determine the packaging or source path for any future external skill candidate",
          "review the actual external implementation for suspicious patterns before installation",
        ],
      },
      operationalFit: {
        roadmapRole: "skill_candidate",
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
        repoNativeLineagePreserved: true,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: [
          "Skill Vetter review has not been completed",
          "minimum vetting outputs are not yet recorded",
          "no installation is allowed in this advisory slice",
        ],
      },
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSkillCandidateProcurementHandoff(
  value: unknown,
): value is SkillCandidateSkillVetterHandoffPackage["handoff"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value.source) &&
    isRecord(value.scope) &&
    isRecord(value.permissionsRisk) &&
    isRecord(value.suspiciousPatterns) &&
    isRecord(value.operationalFit) &&
    isRecord(value.approvalRecommendation)
  );
}

function isSkillCandidateVettingDecision(
  value: unknown,
): value is SkillCandidateVettingResultInput["decision"] {
  return (
    value === "reject" ||
    value === "defer" ||
    value === "approve_limited" ||
    value === "approve_normal"
  );
}

function buildSkillCandidateSkillVetterHandoffPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  procurementRecordPayload?: Record<string, unknown>;
  procurementRecordCreatedAt?: string;
}): SkillCandidateSkillVetterHandoffResult {
  const remainInternalOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidateSkillVetterHandoffResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_internal_only"],
    rationale,
    requiredGates,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remainInternalOnly(
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "manual Skill Vetter handoff is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning procurement workflow for the skill candidate's current lifecycle state"],
    );
  }

  if (!params.sourceProcedureId) {
    return remainInternalOnly(
      [
        "skill candidate is missing source procedure provenance",
        "manual Skill Vetter handoff requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded procedure-to-skill path"],
    );
  }

  if (params.sourceProcedureStatus !== "validated") {
    return remainInternalOnly(
      [
        "source procedure is not in validated state",
        "manual Skill Vetter handoff requires a bounded skill candidate backed by a validated procedure",
      ],
      ["validate the source procedure through the bounded validation path first"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing required bounded lineage fields",
        "manual Skill Vetter handoff requires preserved candidate, review, event, and validation provenance",
      ],
      ["recreate the skill candidate through the bounded internal promotion path"],
    );
  }

  if (params.latestValidationRunOutcome !== "passed") {
    return remainInternalOnly(
      [
        "skill candidate is missing a passed validation run outcome",
        "manual Skill Vetter handoff remains blocked until bounded validation evidence is present",
      ],
      ["record a successful bounded procedure validation before Skill Vetter handoff planning"],
    );
  }

  if (
    !params.procurementRecordId ||
    !params.procurementRecordPayload ||
    !params.procurementRecordCreatedAt
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing an internal procurement record",
        "manual Skill Vetter handoff requires a persisted procurement record before review handoff",
      ],
      ["create a bounded procurement record before preparing manual Skill Vetter handoff"],
    );
  }

  const procurementRecordPayload = params.procurementRecordPayload;
  const handoff = procurementRecordPayload.handoff;
  const recordRequiredGates = procurementRecordPayload.requiredGates;

  if (!isSkillCandidateProcurementHandoff(handoff) || !isStringArray(recordRequiredGates)) {
    return remainInternalOnly(
      [
        "procurement record is missing the structured procurement handoff package",
        "manual Skill Vetter handoff requires a complete procurement record payload before review handoff",
      ],
      ["recreate the bounded procurement record before preparing manual Skill Vetter handoff"],
    );
  }

  const possibleTargets: SkillCandidateSkillVetterHandoffTarget[] = [
    "propose_skill_vetter_handoff",
    "remain_internal_only",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: "candidate",
    procurementRecordId: params.procurementRecordId,
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "a procurement record already preserves the structured handoff package for manual vetting",
    ],
    requiredGates: [
      "manual Skill Vetter invocation is still required",
      ...recordRequiredGates,
      "manual Skill Vetter findings must be recorded before lifecycle advancement",
      "installation remains blocked until procurement, vetting, and policy gates pass",
    ],
    handoff: {
      procurementRecord: {
        procurementRecordId: params.procurementRecordId,
        eventName: "skill_candidate.procurement_record",
        recordedAt: params.procurementRecordCreatedAt,
      },
      handoff,
      manualSkillVetterInputs: {
        source: handoff.source,
        scope: handoff.scope,
        permissionsRisk: handoff.permissionsRisk,
        suspiciousPatterns: handoff.suspiciousPatterns,
        operationalFit: handoff.operationalFit,
        approvalRecommendation: handoff.approvalRecommendation,
      },
      manualSteps: [
        "run Skill Vetter manually against the actual external skill artifact or source path",
        "compare Skill Vetter findings against the preserved bounded lineage and procurement record",
        "record minimum vetting outputs before any lifecycle advancement or install decision",
      ],
      installGuardrails: [
        "do not install any skill from this handoff package alone",
        "do not treat this handoff as Skill Vetter output",
        "keep the candidate in internal-only state until manual vetting and approval gates complete",
      ],
    },
  };
}

async function withConfiguredClient<T>(params: {
  config: MemoryMiddlewareDbConfig;
  run: (client: Client) => Promise<T>;
}): Promise<T> {
  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    return await params.run(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function writeCandidateSubmission(params: {
  client: Client;
  plan: CandidatePersistencePlan;
}): Promise<CandidateSubmissionWriteResult> {
  const schema = params.plan.schema;
  const memoryEventsTable = quoteQualifiedTable({
    schema,
    table: "memory_events",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema,
    table: "memory_objects",
  });
  const memorySourcesTable = quoteQualifiedTable({
    schema,
    table: "memory_sources",
  });

  const eventInsert = await params.client.query<{ id: string }>(
    `
      insert into ${memoryEventsTable} (
        project_id,
        agent_id,
        session_id,
        event_kind,
        event_name,
        payload,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      returning id
    `,
    [
      params.plan.event.projectId ?? null,
      params.plan.event.agentId ?? null,
      params.plan.event.sessionId ?? null,
      params.plan.event.eventKind,
      params.plan.event.eventName,
      JSON.stringify(params.plan.event.payload),
      JSON.stringify(params.plan.event.metadata),
    ],
  );

  const eventId = eventInsert.rows[0]?.id;
  if (!eventId) {
    throw new Error("candidate submission did not return a memory event id");
  }

  const memoryObjectInsert = await params.client.query<{ id: string }>(
    `
      insert into ${memoryObjectsTable} (
        project_id,
        agent_id,
        session_id,
        source_event_id,
        memory_kind,
        review_state,
        content,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning id
    `,
    [
      params.plan.memoryObject.projectId ?? null,
      params.plan.memoryObject.agentId ?? null,
      params.plan.memoryObject.sessionId ?? null,
      eventId,
      params.plan.memoryObject.memoryKind,
      params.plan.memoryObject.reviewState,
      params.plan.memoryObject.content,
      JSON.stringify(params.plan.memoryObject.metadata),
    ],
  );

  const memoryObjectId = memoryObjectInsert.rows[0]?.id;
  if (!memoryObjectId) {
    throw new Error("candidate submission did not return a memory object id");
  }

  await params.client.query(
    `
      insert into ${memorySourcesTable} (
        memory_object_id,
        source_kind,
        source_table,
        source_id,
        metadata
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      memoryObjectId,
      params.plan.memorySource.sourceKind,
      params.plan.memorySource.sourceTable,
      eventId,
      JSON.stringify(params.plan.memorySource.metadata),
    ],
  );

  return {
    eventId,
    memoryObjectId,
  };
}

async function submitCandidateToConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateSubmissionInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateSubmissionResult> {
  const plan = createCandidateSubmissionPersistencePlan({
    schema: params.schema,
    input: params.input,
  });

  params.logger.debug?.(
    [
      "memory-middleware candidate submission prepared",
      `kind=${params.input.kind}`,
      `event=${plan.event.eventName}`,
      `memoryKind=${plan.memoryObject.memoryKind}`,
      `schema=${params.schema}`,
    ].join(" "),
  );

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");
    const writeResult = await writeCandidateSubmission({
      client,
      plan,
    });
    await client.query("commit");

    return {
      accepted: true,
      status: "accepted",
      kind: params.input.kind,
      storage: "database",
      reviewState: "candidate",
      eventId: writeResult.eventId,
      memoryObjectId: writeResult.memoryObjectId,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only. Connection setup failures may not have an open txn.
    }

    const reason = summarizeCandidateError(error);
    params.logger.error(
      `memory-middleware candidate submission failed kind=${params.input.kind}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      kind: params.input.kind,
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function listCandidatesFromConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateListInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateListResult> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const conditions = ["mo.review_state = 'candidate'", "me.event_kind = 'candidate_submission'"];
  const values: unknown[] = [];
  let nextParam = 1;

  if (params.input.kind) {
    conditions.push(
      `coalesce(mo.metadata->>'submissionKind', me.payload->>'submissionKind') = $${nextParam}`,
    );
    values.push(params.input.kind);
    nextParam += 1;
  }
  if (params.input.projectId) {
    conditions.push(`mo.project_id = $${nextParam}::uuid`);
    values.push(params.input.projectId);
    nextParam += 1;
  }
  if (params.input.agentId) {
    conditions.push(`mo.agent_id = $${nextParam}::uuid`);
    values.push(params.input.agentId);
    nextParam += 1;
  }
  if (params.input.sessionId) {
    conditions.push(`mo.session_id = $${nextParam}::uuid`);
    values.push(params.input.sessionId);
    nextParam += 1;
  }

  const limit = normalizeCandidateLimit(params.input.limit);
  values.push(limit);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<CandidateRow>(
          `
            select
              mo.id::text as id,
              me.id::text as event_id,
              coalesce(mo.metadata->>'submissionKind', me.payload->>'submissionKind') as kind,
              mo.memory_kind,
              mo.review_state,
              mo.content,
              mo.project_id::text as project_id,
              mo.agent_id::text as agent_id,
              mo.session_id::text as session_id,
              me.event_name,
              coalesce(
                mo.metadata->'candidateMetadata',
                me.payload->'candidateMetadata'
              ) as candidate_metadata,
              to_char(mo.created_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as created_at,
              to_char(mo.updated_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as updated_at
            from ${memoryObjectsTable} mo
            inner join ${memoryEventsTable} me
              on me.id = mo.source_event_id
            where ${conditions.join("\n              and ")}
            order by mo.created_at desc, mo.id desc
            limit $${nextParam}
          `,
          values,
        );
        return result.rows.map(normalizeCandidateRecord);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware candidate list prepared",
        `count=${records.length}`,
        `schema=${params.schema}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      candidates: records,
    };
  } catch (error) {
    const reason = summarizeCandidateQueryError(error);
    params.logger.error(`memory-middleware candidate list failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function getCandidateFromConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateGetResult> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  try {
    const record = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<CandidateRow>(
          `
            select
              mo.id::text as id,
              me.id::text as event_id,
              coalesce(mo.metadata->>'submissionKind', me.payload->>'submissionKind') as kind,
              mo.memory_kind,
              mo.review_state,
              mo.content,
              mo.project_id::text as project_id,
              mo.agent_id::text as agent_id,
              mo.session_id::text as session_id,
              me.event_name,
              coalesce(
                mo.metadata->'candidateMetadata',
                me.payload->'candidateMetadata'
              ) as candidate_metadata,
              to_char(mo.created_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as created_at,
              to_char(mo.updated_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as updated_at
            from ${memoryObjectsTable} mo
            inner join ${memoryEventsTable} me
              on me.id = mo.source_event_id
            where mo.id = $1::uuid
              and mo.review_state = 'candidate'
              and me.event_kind = 'candidate_submission'
            limit 1
          `,
          [params.input.candidateId],
        );
        return result.rows[0] ? normalizeCandidateRecord(result.rows[0]) : undefined;
      },
    });

    if (!record) {
      return {
        accepted: false,
        status: "not_found",
        reason: "candidate not found",
      };
    }

    params.logger.debug?.(
      [
        "memory-middleware candidate get prepared",
        `candidateId=${params.input.candidateId}`,
        `schema=${params.schema}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      candidate: record,
    };
  } catch (error) {
    const reason = summarizeCandidateQueryError(error);
    params.logger.error(`memory-middleware candidate get failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function selectCandidateMemoryPromotionTarget(params: {
  client: Client;
  schema: string;
  candidateId: string;
}): Promise<CandidateMemoryPromotionTargetRow | undefined> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const result = await params.client.query<CandidateMemoryPromotionTargetRow>(
    `
      select
        mo.id::text as id,
        coalesce(mo.metadata->>'submissionKind', me.payload->>'submissionKind') as kind,
        mo.memory_kind,
        mo.review_state,
        mo.project_id::text as project_id,
        mo.agent_id::text as agent_id,
        mo.session_id::text as session_id,
        mo.source_event_id::text as source_event_id,
        mo.content,
        coalesce(
          mo.metadata->'candidateMetadata',
          me.payload->'candidateMetadata'
        ) as candidate_metadata,
        mr.id::text as latest_review_id,
        case
          when mr.action = 'approve' then 'accepted'
          when mr.action = 'reject' then 'rejected'
          when mr.action = 'correct' then 'needs_revision'
          else null
        end as latest_review_outcome
      from ${memoryObjectsTable} mo
      inner join ${memoryEventsTable} me
        on me.id = mo.source_event_id
      left join lateral (
        select id, action
        from ${memoryReviewsTable}
        where memory_object_id = mo.id
        order by created_at desc, id desc
        limit 1
      ) mr on true
      where mo.id = $1::uuid
        and me.event_kind = 'candidate_submission'
      limit 1
    `,
    [params.candidateId],
  );

  return result.rows[0];
}

async function selectProcedureValidationPlanTarget(params: {
  client: Client;
  schema: string;
  procedureId: string;
}): Promise<ProcedureValidationPlanTargetRow | undefined> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });

  const result = await params.client.query<ProcedureValidationPlanTargetRow>(
    `
      select
        p.id::text as id,
        p.project_id::text as project_id,
        p.status::text as status,
        p.title,
        p.body,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'promotedFromCandidateId' as promoted_from_candidate_id,
        p.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        p.metadata->>'sourceEventId' as source_event_id,
        mo.metadata->>'submissionKind' as source_candidate_kind,
        mo.review_state as source_candidate_review_state,
        mr.id::text as latest_candidate_review_id,
        case
          when mr.action = 'approve' then 'accepted'
          when mr.action = 'reject' then 'rejected'
          when mr.action = 'correct' then 'needs_revision'
          else null
        end as latest_candidate_review_outcome,
        pr.id::text as latest_validation_run_id,
        pr.outcome::text as latest_validation_run_outcome
      from ${proceduresTable} p
      left join ${memoryObjectsTable} mo
        on mo.id = p.source_memory_object_id
      left join lateral (
        select id, action
        from ${memoryReviewsTable}
        where memory_object_id = p.source_memory_object_id
        order by created_at desc, id desc
        limit 1
      ) mr on true
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      where p.id = $1::uuid
      limit 1
    `,
    [params.procedureId],
  );

  return result.rows[0];
}

async function selectSkillCandidateProcurementTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateProcurementTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });

  const result = await params.client.query<SkillCandidateProcurementTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function selectSkillCandidateSkillVetterHandoffTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateSkillVetterHandoffTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const result = await params.client.query<SkillCandidateSkillVetterHandoffTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        me.id::text as procurement_record_id,
        me.payload as procurement_record_payload,
        to_char(me.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as procurement_record_created_at
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) me on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function selectSkillCandidateApprovalPlanTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateApprovalPlanTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const result = await params.client.query<SkillCandidateApprovalPlanTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        procurement.id::text as procurement_record_id,
        procurement.payload as procurement_record_payload,
        to_char(procurement.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as procurement_record_created_at,
        vetting.id::text as vetting_result_id,
        vetting.payload as vetting_result_payload
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) procurement on true
      left join lateral (
        select id, payload
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) vetting on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function selectSkillCandidateInstallHandoffTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateInstallHandoffTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const result = await params.client.query<SkillCandidateInstallHandoffTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        procurement.id::text as procurement_record_id,
        procurement.payload as procurement_record_payload,
        to_char(procurement.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as procurement_record_created_at,
        vetting.id::text as vetting_result_id,
        vetting.payload as vetting_result_payload,
        approval.id::text as approval_record_id,
        approval.payload as approval_record_payload,
        to_char(approval.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as approval_record_created_at
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) procurement on true
      left join lateral (
        select id, payload
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) vetting on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.approval'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) approval on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function reviewCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateReviewInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateReviewResult> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const reviewMapping = mapReviewOutcome({
    outcome: params.input.outcome,
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const targetResult = await client.query<CandidateReviewTargetRow>(
      `
        select id::text as id, review_state
        from ${memoryObjectsTable}
        where id = $1::uuid
        limit 1
      `,
      [params.input.candidateId],
    );
    const target = targetResult.rows[0];

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "candidate not found",
      };
    }

    if (target.review_state !== "candidate") {
      await client.query("rollback");
      return {
        accepted: false,
        status: "invalid_state",
        reason: `candidate review requires candidate state, found ${target.review_state}`,
      };
    }

    const reviewInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryReviewsTable} (
          memory_object_id,
          reviewer_agent_id,
          action,
          resulting_state,
          rationale,
          metadata
        )
        values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
        returning id::text as id
      `,
      [
        params.input.candidateId,
        params.input.reviewerAgentId ?? null,
        reviewMapping.action,
        reviewMapping.resultingState,
        params.input.rationale ?? null,
        JSON.stringify({
          source: "candidate-review-tool",
          reviewOutcome: params.input.outcome,
          ...(params.input.metadata ? { candidateReviewMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const reviewId = reviewInsert.rows[0]?.id;
    if (!reviewId) {
      throw new Error("candidate review did not return a review id");
    }

    if (reviewMapping.updateMemoryObjectState) {
      await client.query(
        `
          update ${memoryObjectsTable}
          set review_state = $2
          where id = $1::uuid
        `,
        [params.input.candidateId, reviewMapping.persistedReviewState],
      );
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware candidate review recorded",
        `candidateId=${params.input.candidateId}`,
        `outcome=${params.input.outcome}`,
        `state=${reviewMapping.persistedReviewState}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "recorded",
      candidateId: params.input.candidateId,
      outcome: params.input.outcome,
      reviewId,
      memoryObjectStateChanged: reviewMapping.updateMemoryObjectState,
      reviewState: reviewMapping.persistedReviewState,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeCandidateReviewError(error);
    params.logger.error(
      `memory-middleware candidate review failed candidateId=${params.input.candidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function planCandidatePromotionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidatePromotionPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidatePromotionPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectCandidateMemoryPromotionTarget({
          client,
          schema: params.schema,
          candidateId: params.input.candidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "candidate not found",
      };
    }

    const kind = parseCandidateKind(target.kind);
    const plan = buildMemoryPromotionPlanFromTarget({
      candidateId: params.input.candidateId,
      kind,
      reviewState: target.review_state,
      ...(target.latest_review_outcome
        ? { latestReviewOutcome: target.latest_review_outcome }
        : {}),
    });

    params.logger.debug?.(
      [
        "memory-middleware candidate promotion plan prepared",
        `candidateId=${params.input.candidateId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeCandidatePlanningError(error);
    params.logger.error(`memory-middleware candidate promotion plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function planProcedureValidationInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ProcedureValidationPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ProcedureValidationPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectProcedureValidationPlanTarget({
          client,
          schema: params.schema,
          procedureId: params.input.procedureId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const procedureStatus = parseProcedureStatus(target.status);
    const sourceCandidateId =
      target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
    const sourceCandidateKind = target.source_candidate_kind
      ? parseCandidateKind(target.source_candidate_kind)
      : undefined;
    const plan = buildProcedureValidationPlan({
      procedureId: params.input.procedureId,
      procedureStatus,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
      ...(sourceCandidateKind ? { sourceCandidateKind } : {}),
      ...(target.latest_candidate_review_outcome
        ? { latestCandidateReviewOutcome: target.latest_candidate_review_outcome }
        : {}),
      hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
      hasSourceEventProvenance: Boolean(target.source_event_id),
    });

    params.logger.debug?.(
      [
        "memory-middleware procedure validation plan prepared",
        `procedureId=${params.input.procedureId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeProcedureValidationPlanningError(error);
    params.logger.error(`memory-middleware procedure validation plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function validateProcedureInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ProcedureValidationInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ProcedureValidationResult> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectProcedureValidationPlanTarget({
      client,
      schema: params.schema,
      procedureId: params.input.procedureId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const procedureStatus = parseProcedureStatus(target.status);
    const sourceCandidateId =
      target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
    const sourceCandidateKind = target.source_candidate_kind
      ? parseCandidateKind(target.source_candidate_kind)
      : undefined;
    const plan = buildProcedureValidationPlan({
      procedureId: params.input.procedureId,
      procedureStatus,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
      ...(sourceCandidateKind ? { sourceCandidateKind } : {}),
      ...(target.latest_candidate_review_outcome
        ? { latestCandidateReviewOutcome: target.latest_candidate_review_outcome }
        : {}),
      hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
      hasSourceEventProvenance: Boolean(target.source_event_id),
    });

    if (procedureStatus === "validated") {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_validated",
        procedureId: params.input.procedureId,
        procedureStatus: "validated",
        ...(target.latest_validation_run_id
          ? { procedureRunId: target.latest_validation_run_id }
          : {}),
        ...(sourceCandidateId ? { sourceCandidateId } : {}),
      };
    }

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "procedure validation plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_validated_procedure") || !plan.eligible) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const procedureRunInsert = await client.query<ProcedureValidationWriteResult>(
      `
        insert into ${procedureRunsTable} (
          procedure_id,
          agent_id,
          outcome,
          notes,
          evidence
        )
        values ($1::uuid, $2::uuid, 'passed', $3, $4::jsonb)
        returning id::text as procedure_run_id, now()::text as validated_at
      `,
      [
        params.input.procedureId,
        params.input.validatorAgentId ?? null,
        params.input.rationale ?? null,
        JSON.stringify({
          source: "procedure-validation-tool",
          ...(sourceCandidateId ? { sourceCandidateId } : {}),
          ...(target.promoted_from_review_id
            ? { promotedFromReviewId: target.promoted_from_review_id }
            : {}),
          ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
          ...(params.input.metadata ? { validationMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const procedureRunId = procedureRunInsert.rows[0]?.procedure_run_id;
    if (!procedureRunId) {
      throw new Error("procedure validation did not return a procedure run id");
    }

    await client.query(
      `
        update ${proceduresTable}
        set
          status = 'validated',
          validated_at = now(),
          metadata = metadata || $2::jsonb
        where id = $1::uuid
      `,
      [
        params.input.procedureId,
        JSON.stringify({
          lastValidationRunId: procedureRunId,
          validationSource: "procedure-validation-tool",
          ...(params.input.validatorAgentId
            ? { validatedByAgentId: params.input.validatorAgentId }
            : {}),
          ...(params.input.rationale ? { validationRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { validationMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware procedure validation recorded",
        `procedureId=${params.input.procedureId}`,
        `procedureRunId=${procedureRunId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "validated",
      procedureId: params.input.procedureId,
      procedureStatus: "validated",
      procedureRunId,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeProcedureValidationError(error);
    params.logger.error(
      `memory-middleware procedure validation failed procedureId=${params.input.procedureId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function planSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidatePlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidatePlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectProcedureValidationPlanTarget({
          client,
          schema: params.schema,
          procedureId: params.input.procedureId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const procedureStatus = parseProcedureStatus(target.status);
    const sourceCandidateId =
      target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
    const plan = buildSkillCandidatePlan({
      procedureId: params.input.procedureId,
      procedureStatus,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      hasValidationRun: Boolean(target.latest_validation_run_id),
      hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
      hasSourceEventProvenance: Boolean(target.source_event_id),
    });

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate plan prepared",
        `procedureId=${params.input.procedureId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidatePlanningError(error);
    params.logger.error(`memory-middleware skill-candidate plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function createSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateCreateInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateCreateResult> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectProcedureValidationPlanTarget({
      client,
      schema: params.schema,
      procedureId: params.input.procedureId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const procedureStatus = parseProcedureStatus(target.status);
    const sourceCandidateId =
      target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
    const plan = buildSkillCandidatePlan({
      procedureId: params.input.procedureId,
      procedureStatus,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      hasValidationRun: Boolean(target.latest_validation_run_id),
      hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
      hasSourceEventProvenance: Boolean(target.source_event_id),
    });

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_skill_candidate") || !plan.eligible) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingSkillCandidate = await client.query<SkillCandidateRow>(
      `
        select
          id::text as id,
          status::text as status
        from ${skillCandidatesTable}
        where source_procedure_id = $1::uuid
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.procedureId],
    );
    const existingRow = existingSkillCandidate.rows[0];
    if (existingRow) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        procedureId: params.input.procedureId,
        skillCandidateId: existingRow.id,
        skillCandidateStatus: existingRow.status,
        ...(sourceCandidateId ? { sourceCandidateId } : {}),
      };
    }

    const name = params.input.name?.trim() || target.title;
    const summary = params.input.summary?.trim() || target.body;
    const insertResult = await client.query<{ id: string }>(
      `
        insert into ${skillCandidatesTable} (
          project_id,
          source_procedure_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, $2::uuid, 'candidate', $3, $4, $5::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.procedureId,
        name,
        summary,
        JSON.stringify({
          source: "skill-candidate-create-tool",
          createdFromProcedureId: params.input.procedureId,
          ...(sourceCandidateId ? { sourceCandidateId } : {}),
          ...(target.promoted_from_review_id
            ? { promotedFromReviewId: target.promoted_from_review_id }
            : {}),
          ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
          ...(target.latest_validation_run_id
            ? { validationRunId: target.latest_validation_run_id }
            : {}),
          ...(params.input.creatorAgentId ? { creatorAgentId: params.input.creatorAgentId } : {}),
          ...(params.input.rationale ? { creationRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { skillCandidateMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const skillCandidateId = insertResult.rows[0]?.id;
    if (!skillCandidateId) {
      throw new Error("skill-candidate creation did not return a skill candidate id");
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate creation recorded",
        `procedureId=${params.input.procedureId}`,
        `skillCandidateId=${skillCandidateId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      procedureId: params.input.procedureId,
      skillCandidateId,
      skillCandidateStatus: "candidate",
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateCreateError(error);
    params.logger.error(
      `memory-middleware skill-candidate creation failed procedureId=${params.input.procedureId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function planSkillCandidateProcurementInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateProcurementPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateProcurementPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateProcurementTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateProcurementPlan({
      skillCandidateId: params.input.skillCandidateId,
      skillCandidateStatus: target.status,
      name: target.name,
      summary: target.summary,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: target.source_procedure_status }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
    });

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate procurement plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateProcurementPlanningError(error);
    params.logger.error(`memory-middleware skill-candidate procurement plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function planSkillCandidateSkillVetterHandoffInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateSkillVetterHandoffInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateSkillVetterHandoffResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateSkillVetterHandoffTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateSkillVetterHandoffPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.procurement_record_payload
        ? { procurementRecordPayload: target.procurement_record_payload }
        : {}),
      ...(target.procurement_record_created_at
        ? { procurementRecordCreatedAt: target.procurement_record_created_at }
        : {}),
    });

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate Skill Vetter handoff plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateSkillVetterHandoffError(error);
    params.logger.error(
      `memory-middleware skill-candidate Skill Vetter handoff plan failed: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

function buildSkillCandidateApprovalPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  procurementRecordPayload?: Record<string, unknown>;
  procurementRecordCreatedAt?: string;
  vettingResultId?: string;
  vettingResultPayload?: Record<string, unknown>;
}): SkillCandidateApprovalPlanResult {
  const baseInstallGuardrails = [
    "do not install any skill from this planning result alone",
    "keep any later installation as a separate explicit action",
    "do not let the skill candidate replace the canonical memory substrate",
  ];

  const remain = (
    possibleTargets: SkillCandidateApprovalPlanTarget[],
    rationale: string[],
    requiredGates: string[],
    remainingBlockers: string[],
    extra: Partial<SkillCandidateApprovalPlanAcceptedResult> = {},
  ): SkillCandidateApprovalPlanResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.vettingResultId ? { vettingResultRecordId: params.vettingResultId } : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets,
    rationale,
    requiredGates,
    installGuardrails: baseInstallGuardrails,
    remainingBlockers,
    ...extra,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remain(
      ["remain_internal_only"],
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "approval planning is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning lifecycle workflow for the skill candidate's current state"],
      [`skill candidate is already in ${params.skillCandidateStatus} state`],
    );
  }

  if (!params.sourceProcedureId || params.sourceProcedureStatus !== "validated") {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing validated procedure provenance",
        "approval planning requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded validated procedure path"],
      ["validated procedure provenance is incomplete"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId ||
    params.latestValidationRunOutcome !== "passed"
  ) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing required bounded lineage or passed validation evidence",
        "approval planning requires preserved candidate, review, event, and validation provenance",
      ],
      ["restore bounded lineage and passed validation evidence before approval planning"],
      ["bounded lineage or validation evidence is incomplete"],
    );
  }

  if (
    !params.procurementRecordId ||
    !params.procurementRecordPayload ||
    !params.procurementRecordCreatedAt
  ) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing an internal procurement record",
        "approval planning requires procurement context before any later approval consideration",
      ],
      ["create a bounded procurement record before approval planning"],
      ["internal procurement record is missing"],
    );
  }

  if (!params.vettingResultId || !params.vettingResultPayload) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing a manual vetting result",
        "approval planning requires a recorded manual vetting result before any later approval consideration",
      ],
      ["record a bounded manual vetting result before approval planning"],
      ["manual vetting result is missing"],
    );
  }

  const decision = params.vettingResultPayload.decision;
  const result = params.vettingResultPayload.result;
  if (
    !isSkillCandidateVettingDecision(decision) ||
    !isRecord(result) ||
    !isRecord(result.approvalRecommendation) ||
    !isRecord(result.operationalFit)
  ) {
    return remain(
      ["remain_blocked"],
      [
        "manual vetting result is missing the structured approval recommendation",
        "approval planning requires a complete bounded vetting result payload",
      ],
      ["recreate the bounded manual vetting result before approval planning"],
      ["manual vetting result payload is incomplete"],
    );
  }

  const approvalRecommendation = result.approvalRecommendation;
  const operationalFit = result.operationalFit;
  const blockers = isStringArray(approvalRecommendation.blockers)
    ? approvalRecommendation.blockers
    : ["approval recommendation blockers are missing or invalid"];

  const remainingBlockers = [...blockers];
  if (operationalFit.acceleratorOnly !== true) {
    remainingBlockers.push("skill candidate must remain accelerator-only");
  }
  if (operationalFit.canonicalMemorySubstrate !== false) {
    remainingBlockers.push("skill candidate must not become the canonical memory substrate");
  }

  if (decision === "defer") {
    return remain(
      ["remain_internal_only"],
      [
        "manual vetting result deferred further action",
        "skill candidate should remain internal-only until a later manual review updates the recommendation",
      ],
      ["perform another explicit manual review before any approval-state mutation slice"],
      remainingBlockers.length > 0 ? remainingBlockers : ["manual review remains deferred"],
      { latestVettingDecision: "defer" },
    );
  }

  if (decision === "reject") {
    return remain(
      ["remain_blocked"],
      [
        "manual vetting result rejected this skill candidate for approval planning",
        "approval or installation planning cannot proceed while the rejection stands",
      ],
      ["do not advance approval or installation while the rejection remains in force"],
      remainingBlockers.length > 0
        ? remainingBlockers
        : ["manual vetting result rejected this skill candidate"],
      { latestVettingDecision: "reject" },
    );
  }

  if (remainingBlockers.length > 0) {
    return remain(
      ["remain_blocked"],
      [
        "manual vetting result still carries unresolved blockers",
        "approval planning remains blocked until the recorded blockers are cleared",
      ],
      ["clear the remaining blockers before any approval-state mutation slice"],
      remainingBlockers,
      { latestVettingDecision: decision },
    );
  }

  if (
    decision === "approve_limited" &&
    approvalRecommendation.proposedLifecycleState === "approved_limited"
  ) {
    return {
      accepted: true,
      status: "ok",
      skillCandidateId: params.skillCandidateId,
      skillCandidateStatus: params.skillCandidateStatus,
      procurementRecordId: params.procurementRecordId,
      vettingResultRecordId: params.vettingResultId,
      sourceProcedureId: params.sourceProcedureId,
      sourceCandidateId: params.sourceCandidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_limited",
      eligible: true,
      possibleTargets: ["propose_approved_for_limited_use", "remain_internal_only"],
      rationale: [
        "manual vetting result supports bounded limited approval planning",
        "installation remains separate and guarded even when limited approval is proposed",
      ],
      requiredGates: [
        "manual approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: baseInstallGuardrails,
      remainingBlockers: [],
    };
  }

  if (
    decision === "approve_normal" &&
    approvalRecommendation.proposedLifecycleState === "approved_normal" &&
    approvalRecommendation.installRecommendation === "manual_followup_required"
  ) {
    return {
      accepted: true,
      status: "ok",
      skillCandidateId: params.skillCandidateId,
      skillCandidateStatus: params.skillCandidateStatus,
      procurementRecordId: params.procurementRecordId,
      vettingResultRecordId: params.vettingResultId,
      sourceProcedureId: params.sourceProcedureId,
      sourceCandidateId: params.sourceCandidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_normal",
      eligible: true,
      possibleTargets: ["propose_approved_for_normal_use", "remain_internal_only"],
      rationale: [
        "manual vetting result supports bounded normal-use approval planning",
        "installation remains a separate guarded action even when normal-use approval is proposed",
      ],
      requiredGates: [
        "manual approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: baseInstallGuardrails,
      remainingBlockers: [],
    };
  }

  return remain(
    ["remain_blocked"],
    [
      "manual vetting result does not support a bounded approval target yet",
      "approval planning remains blocked until the recorded recommendation matches a supported bounded target",
    ],
    [
      "record a compatible bounded approval recommendation before any approval-state mutation slice",
    ],
    ["manual vetting recommendation is not aligned to a supported bounded approval target"],
    { latestVettingDecision: decision },
  );
}

function approvalScopeToPlanningTarget(
  scope: SkillCandidateApprovalScope,
): SkillCandidateApprovalPlanTarget {
  return scope === "limited"
    ? "propose_approved_for_limited_use"
    : "propose_approved_for_normal_use";
}

function approvalScopeToSkillCandidateStatus(
  scope: SkillCandidateApprovalScope,
): "approved_limited" | "approved_normal" {
  return scope === "limited" ? "approved_limited" : "approved_normal";
}

async function planSkillCandidateApprovalInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateApprovalPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateApprovalPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateApprovalPlanTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateApprovalPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.procurement_record_payload
        ? { procurementRecordPayload: target.procurement_record_payload }
        : {}),
      ...(target.procurement_record_created_at
        ? { procurementRecordCreatedAt: target.procurement_record_created_at }
        : {}),
      ...(target.vetting_result_id ? { vettingResultId: target.vetting_result_id } : {}),
      ...(target.vetting_result_payload
        ? { vettingResultPayload: target.vetting_result_payload }
        : {}),
    });

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate approval plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${String(plan.accepted && plan.eligible)}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateApprovalPlanError(error);
    params.logger.error(`memory-middleware skill-candidate approval plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function approveSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateApproveInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateApproveResult> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateApprovalPlanTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateApprovalPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.procurement_record_payload
        ? { procurementRecordPayload: target.procurement_record_payload }
        : {}),
      ...(target.procurement_record_created_at
        ? { procurementRecordCreatedAt: target.procurement_record_created_at }
        : {}),
      ...(target.vetting_result_id ? { vettingResultId: target.vetting_result_id } : {}),
      ...(target.vetting_result_payload
        ? { vettingResultPayload: target.vetting_result_payload }
        : {}),
    });

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate approval plan could not be evaluated",
      };
    }

    const requiredTarget = approvalScopeToPlanningTarget(params.input.scope);
    const approvedStatus = approvalScopeToSkillCandidateStatus(params.input.scope);

    if (target.status === approvedStatus) {
      const existingApproval = await client.query<SkillCandidateApprovalRecordRow>(
        `
          select
            id::text as id,
            payload->>'approvedScope' as approved_scope
          from ${memoryEventsTable}
          where event_name = 'skill_candidate.approval'
            and metadata->>'skillCandidateId' = $1
          order by created_at desc, id desc
          limit 1
        `,
        [params.input.skillCandidateId],
      );
      const existingApprovalRow = existingApproval.rows[0];
      if (existingApprovalRow) {
        await client.query("commit");
        return {
          accepted: true,
          status: "already_approved",
          skillCandidateId: params.input.skillCandidateId,
          approvalRecordId: existingApprovalRow.id,
          approvedScope: existingApprovalRow.approved_scope === "normal" ? "normal" : "limited",
          skillCandidateStatus: approvedStatus,
          procurementRecordId: plan.procurementRecordId!,
          vettingResultRecordId: plan.vettingResultRecordId!,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
        };
      }
    }

    if (!plan.eligible || !plan.possibleTargets.includes(requiredTarget)) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingApproval = await client.query<SkillCandidateApprovalRecordRow>(
      `
        select
          id::text as id,
          payload->>'approvedScope' as approved_scope
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.approval'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingApprovalRow = existingApproval.rows[0];
    if (existingApprovalRow) {
      const existingScope = existingApprovalRow.approved_scope === "normal" ? "normal" : "limited";
      await client.query("commit");
      return {
        accepted: true,
        status: "already_approved",
        skillCandidateId: params.input.skillCandidateId,
        approvalRecordId: existingApprovalRow.id,
        approvedScope: existingScope,
        skillCandidateStatus: approvalScopeToSkillCandidateStatus(existingScope),
        procurementRecordId: plan.procurementRecordId!,
        vettingResultRecordId: plan.vettingResultRecordId!,
        ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
        ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
      };
    }

    const approvalInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.approval', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.approverAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-approve-tool",
          approvedScope: params.input.scope,
          procurementRecordId: plan.procurementRecordId,
          vettingResultRecordId: plan.vettingResultRecordId,
          installGuardrails: plan.installGuardrails,
          requiredGates: plan.requiredGates,
          remainingBlockers: plan.remainingBlockers,
          rationale: plan.rationale,
        }),
        JSON.stringify({
          source: "skill-candidate-approve-tool",
          skillCandidateId: params.input.skillCandidateId,
          approvedScope: params.input.scope,
          procurementRecordId: plan.procurementRecordId,
          vettingResultRecordId: plan.vettingResultRecordId,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
          ...(params.input.approverAgentId
            ? { approverAgentId: params.input.approverAgentId }
            : {}),
          ...(params.input.rationale ? { approvalRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { approvalMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const approvalRecordId = approvalInsert.rows[0]?.id;
    if (!approvalRecordId) {
      throw new Error("skill-candidate approval did not return an approval record id");
    }

    await client.query(
      `
        update ${skillCandidatesTable}
        set
          status = $2,
          vetted_at = coalesce(vetted_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb
        where id = $1::uuid
      `,
      [
        params.input.skillCandidateId,
        approvedStatus,
        JSON.stringify({
          latestApprovalRecordId: approvalRecordId,
          latestApprovedScope: params.input.scope,
          latestApprovalProcurementRecordId: plan.procurementRecordId,
          latestApprovalVettingResultRecordId: plan.vettingResultRecordId,
          installGuardrails: plan.installGuardrails,
          ...(params.input.approverAgentId
            ? { latestApproverAgentId: params.input.approverAgentId }
            : {}),
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate approval recorded",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `approvalRecordId=${approvalRecordId}`,
        `scope=${params.input.scope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "approved",
      skillCandidateId: params.input.skillCandidateId,
      approvalRecordId,
      approvedScope: params.input.scope,
      skillCandidateStatus: approvedStatus,
      procurementRecordId: plan.procurementRecordId!,
      vettingResultRecordId: plan.vettingResultRecordId!,
      ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
      ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateApprovalError(error);
    params.logger.error(
      `memory-middleware skill-candidate approval failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function deriveApprovedScope(params: {
  skillCandidateStatus: SkillCandidateStatus;
  approvalRecordPayload?: Record<string, unknown>;
}): SkillCandidateApprovalScope | undefined {
  const fromPayload =
    params.approvalRecordPayload?.approvedScope === "normal"
      ? "normal"
      : params.approvalRecordPayload?.approvedScope === "limited"
        ? "limited"
        : undefined;
  if (fromPayload) {
    return fromPayload;
  }
  if (params.skillCandidateStatus === "approved_normal") {
    return "normal";
  }
  if (params.skillCandidateStatus === "approved_limited") {
    return "limited";
  }
  return undefined;
}

function buildSkillCandidateInstallHandoffPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  vettingResultRecordId?: string;
  approvalRecordId?: string;
  approvalRecordCreatedAt?: string;
  approvalRecordPayload?: Record<string, unknown>;
}): SkillCandidateInstallHandoffResult {
  const approvedScope = deriveApprovedScope({
    skillCandidateStatus: params.skillCandidateStatus,
    approvalRecordPayload: params.approvalRecordPayload,
  });
  const installGuardrails =
    params.approvalRecordPayload && isStringArray(params.approvalRecordPayload.installGuardrails)
      ? params.approvalRecordPayload.installGuardrails
      : [
          "do not install any skill from this handoff alone",
          "keep installation as a separate explicit manual action",
          "do not let the skill candidate replace the canonical memory substrate",
        ];

  const remain = (
    rationale: string[],
    requiredGates: string[],
    remainingBlockers: string[],
  ): SkillCandidateInstallHandoffResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(approvedScope ? { approvedScope } : {}),
    ...(params.approvalRecordId ? { approvalRecordId: params.approvalRecordId } : {}),
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.vettingResultRecordId
      ? { vettingResultRecordId: params.vettingResultRecordId }
      : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_approved_internal_only"],
    rationale,
    requiredGates,
    remainingBlockers,
    installGuardrails,
  });

  if (
    params.skillCandidateStatus !== "approved_limited" &&
    params.skillCandidateStatus !== "approved_normal"
  ) {
    return remain(
      [
        `skill candidate is in ${params.skillCandidateStatus} state`,
        "manual install handoff is reserved for bounded approved skill candidates only",
      ],
      ["record bounded internal approval before any later manual install handoff"],
      [`skill candidate is not in an approved state`],
    );
  }

  if (!params.sourceProcedureId || params.sourceProcedureStatus !== "validated") {
    return remain(
      [
        "skill candidate is missing validated procedure provenance",
        "manual install handoff requires a bounded approved skill candidate linked to a validated procedure",
      ],
      ["restore validated procedure provenance before any manual install handoff"],
      ["validated procedure provenance is incomplete"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.validationRunId ||
    params.latestValidationRunOutcome !== "passed"
  ) {
    return remain(
      [
        "skill candidate is missing bounded lineage or passed validation evidence",
        "manual install handoff requires preserved candidate lineage and passed validation evidence",
      ],
      ["restore bounded lineage and validation evidence before any manual install handoff"],
      ["bounded lineage or validation evidence is incomplete"],
    );
  }

  if (!params.procurementRecordId || !params.vettingResultRecordId) {
    return remain(
      [
        "skill candidate is missing procurement or manual vetting records",
        "manual install handoff requires preserved procurement and vetting lineage",
      ],
      ["restore procurement and manual vetting records before any manual install handoff"],
      ["procurement or vetting lineage is incomplete"],
    );
  }

  if (
    !params.approvalRecordId ||
    !params.approvalRecordCreatedAt ||
    !params.approvalRecordPayload
  ) {
    return remain(
      [
        "skill candidate is missing a bounded approval record",
        "manual install handoff requires an internal approval artifact before any separate install step",
      ],
      ["record bounded internal approval before any manual install handoff"],
      ["approval record is missing"],
    );
  }

  if (!approvedScope) {
    return remain(
      [
        "approval scope is missing from the bounded approval record",
        "manual install handoff requires an explicit limited or normal approval scope",
      ],
      [
        "restore a bounded approval record with explicit approval scope before manual install handoff",
      ],
      ["approval scope is missing"],
    );
  }

  const remainingBlockers = isStringArray(params.approvalRecordPayload.remainingBlockers)
    ? params.approvalRecordPayload.remainingBlockers
    : [];
  if (remainingBlockers.length > 0) {
    return remain(
      [
        "bounded approval record still carries unresolved blockers",
        "manual install handoff remains internal-only until the recorded blockers are cleared",
      ],
      ["clear the remaining blockers before any separate manual install action"],
      remainingBlockers,
    );
  }

  const rationale =
    isStringArray(params.approvalRecordPayload.rationale) &&
    params.approvalRecordPayload.rationale.length > 0
      ? params.approvalRecordPayload.rationale
      : [
          "bounded internal approval is recorded",
          "a separate manual install step may now be prepared without automation",
        ];
  const manualSteps = [
    "treat this handoff as preparation only and keep installation as a separate explicit action",
    "verify the target artifact or package against the recorded approval scope and install guardrails",
    "preserve accelerator-only boundaries and do not replace the canonical memory substrate during install review",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    approvedScope,
    approvalRecordId: params.approvalRecordId,
    procurementRecordId: params.procurementRecordId,
    vettingResultRecordId: params.vettingResultRecordId,
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_manual_install_handoff", "remain_approved_internal_only"],
    rationale: [
      ...rationale,
      "installation remains a separate explicit manual step even after bounded approval is recorded",
    ],
    requiredGates: [
      "manual installation remains a separate explicit action",
      "respect the recorded install guardrails during any later install review",
    ],
    remainingBlockers: [],
    installGuardrails,
    handoff: {
      approval: {
        approvalRecordId: params.approvalRecordId,
        eventName: "skill_candidate.approval",
        recordedAt: params.approvalRecordCreatedAt,
        approvedScope,
      },
      source: {
        skillCandidateId: params.skillCandidateId,
        ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
        ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
        ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
        ...(params.vettingResultRecordId
          ? { vettingResultRecordId: params.vettingResultRecordId }
          : {}),
        ...(params.validationRunId ? { validationRunId: params.validationRunId } : {}),
      },
      rationale,
      remainingBlockers: [],
      installGuardrails,
      manualSteps,
    },
  };
}

async function planSkillCandidateInstallHandoffInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateInstallHandoffInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateInstallHandoffResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateInstallHandoffTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const handoff = buildSkillCandidateInstallHandoffPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.vetting_result_id ? { vettingResultRecordId: target.vetting_result_id } : {}),
      ...(target.approval_record_id ? { approvalRecordId: target.approval_record_id } : {}),
      ...(target.approval_record_created_at
        ? { approvalRecordCreatedAt: target.approval_record_created_at }
        : {}),
      ...(target.approval_record_payload
        ? { approvalRecordPayload: target.approval_record_payload }
        : {}),
    });

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate install handoff prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${String(handoff.accepted && handoff.eligible)}`,
      ].join(" "),
    );

    return handoff;
  } catch (error) {
    const reason = summarizeSkillCandidateInstallHandoffError(error);
    params.logger.error(`memory-middleware skill-candidate install handoff failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function createSkillCandidateInstallRecordInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateInstallRecordInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateInstallRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateInstallHandoffTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const handoff = buildSkillCandidateInstallHandoffPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.vetting_result_id ? { vettingResultRecordId: target.vetting_result_id } : {}),
      ...(target.approval_record_id ? { approvalRecordId: target.approval_record_id } : {}),
      ...(target.approval_record_created_at
        ? { approvalRecordCreatedAt: target.approval_record_created_at }
        : {}),
      ...(target.approval_record_payload
        ? { approvalRecordPayload: target.approval_record_payload }
        : {}),
    });

    if (!handoff.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate install handoff plan could not be evaluated",
      };
    }

    if (
      !handoff.eligible ||
      !handoff.possibleTargets.includes("propose_manual_install_handoff") ||
      !handoff.approvedScope ||
      !handoff.approvalRecordId ||
      !handoff.procurementRecordId ||
      !handoff.vettingResultRecordId
    ) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: handoff.rationale.join(" "),
      };
    }

    const existingInstallRecord = await client.query<SkillCandidateInstallRecordRow>(
      `
        select
          id::text as id,
          payload->>'installedScope' as installed_scope
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.install_record'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingInstallRecordRow = existingInstallRecord.rows[0];
    if (existingInstallRecordRow) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        installRecordId: existingInstallRecordRow.id,
        installedScope:
          existingInstallRecordRow.installed_scope === "normal" ? "normal" : handoff.approvedScope,
        skillCandidateStatus:
          handoff.approvedScope === "normal" ? "approved_normal" : "approved_limited",
        approvalRecordId: handoff.approvalRecordId,
        procurementRecordId: handoff.procurementRecordId,
        vettingResultRecordId: handoff.vettingResultRecordId,
        ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
        ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
      };
    }

    const installRecordInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.install_record', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.installerAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-install-record-create-tool",
          installedScope: handoff.approvedScope,
          approvalRecordId: handoff.approvalRecordId,
          procurementRecordId: handoff.procurementRecordId,
          vettingResultRecordId: handoff.vettingResultRecordId,
          installGuardrails: handoff.installGuardrails,
          manualSteps: handoff.handoff?.manualSteps ?? [],
          requiredGates: handoff.requiredGates,
          remainingBlockers: handoff.remainingBlockers,
          rationale: handoff.rationale,
          ...(params.input.installNotes ? { installNotes: params.input.installNotes } : {}),
        }),
        JSON.stringify({
          source: "skill-candidate-install-record-create-tool",
          skillCandidateId: params.input.skillCandidateId,
          installedScope: handoff.approvedScope,
          approvalRecordId: handoff.approvalRecordId,
          procurementRecordId: handoff.procurementRecordId,
          vettingResultRecordId: handoff.vettingResultRecordId,
          ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
          ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
          ...(params.input.installerAgentId
            ? { installerAgentId: params.input.installerAgentId }
            : {}),
          ...(params.input.installNotes ? { installNotes: params.input.installNotes } : {}),
          ...(params.input.metadata ? { installMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const installRecordId = installRecordInsert.rows[0]?.id;
    if (!installRecordId) {
      throw new Error("skill-candidate install record creation did not return a record id");
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate install record created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `installRecordId=${installRecordId}`,
        `installedScope=${handoff.approvedScope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      installRecordId,
      installedScope: handoff.approvedScope,
      skillCandidateStatus:
        handoff.approvedScope === "normal" ? "approved_normal" : "approved_limited",
      approvalRecordId: handoff.approvalRecordId,
      procurementRecordId: handoff.procurementRecordId,
      vettingResultRecordId: handoff.vettingResultRecordId,
      ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
      ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateInstallRecordError(error);
    params.logger.error(
      `memory-middleware skill-candidate install record failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function persistToolResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultPersistInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultPersistResult> {
  const payload = selectToolResultPayload(params.input);
  const sizeBytes = Buffer.byteLength(payload.serializedPayload, "utf8");
  const thresholdBytes = normalizeToolResultThreshold(params.input.persistThresholdBytes);
  const previewCharLimit = normalizeToolResultPreviewCharLimit(params.input.previewCharLimit);

  if (!params.input.forcePersist && sizeBytes <= thresholdBytes) {
    return {
      accepted: true,
      status: "inline",
      persisted: false,
      sessionId: params.input.sessionId,
      toolName: params.input.toolName,
      contentType: payload.contentType,
      sizeBytes,
      thresholdBytes,
      preview: createToolResultPreview({
        contentType: payload.contentType,
        serializedPayload: payload.serializedPayload,
        sizeBytes,
        previewCharLimit,
      }),
    };
  }

  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const checksumSha256 = createHash("sha256").update(payload.serializedPayload).digest("hex");
    const preview = createToolResultPreview({
      contentType: payload.contentType,
      serializedPayload: payload.serializedPayload,
      sizeBytes,
      previewCharLimit,
    });

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          session_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, $3::uuid, 'tool_result', 'tool_result.persisted', $4::jsonb, $5::jsonb)
        returning id
      `,
      [
        params.input.projectId ?? null,
        params.input.agentId ?? null,
        params.input.sessionId,
        JSON.stringify({
          source: "tool-result-persist-tool",
          toolName: params.input.toolName,
          contentType: payload.contentType,
          sizeBytes,
          previewText: preview.previewText,
          referenceToken: preview.referenceToken,
          checksumSha256,
        }),
        JSON.stringify({
          source: "tool-result-persist-tool",
          ...(params.input.metadata ? { persistMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const memoryEventId = eventInsert.rows[0]?.id;
    if (!memoryEventId) {
      throw new Error("tool-result persistence did not return a memory event id");
    }

    const toolResultInsert = await client.query<{ id: string }>(
      `
        insert into ${toolResultsTable} (
          session_id,
          memory_event_id,
          tool_name,
          status,
          content_type,
          preview_text,
          payload_text,
          payload_json,
          size_bytes,
          checksum_sha256,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          $3,
          'persisted',
          $4,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9,
          $10::jsonb
        )
        returning id
      `,
      [
        params.input.sessionId,
        memoryEventId,
        params.input.toolName,
        payload.contentType,
        preview.previewText,
        payload.payloadText,
        payload.payloadJson === null ? null : JSON.stringify(payload.payloadJson),
        sizeBytes,
        checksumSha256,
        JSON.stringify({
          source: "tool-result-persist-tool",
          thresholdBytes,
          previewCharLimit,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
          ...(params.input.metadata ? { toolMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const toolResultId = toolResultInsert.rows[0]?.id;
    if (!toolResultId) {
      throw new Error("tool-result persistence did not return a tool result id");
    }

    await client.query(
      `
        update ${memoryEventsTable}
        set payload = payload || $2::jsonb
        where id = $1::uuid
      `,
      [
        memoryEventId,
        JSON.stringify({
          toolResultId,
          referenceToken: `tool_result:${toolResultId}`,
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware tool result persisted",
        `toolName=${params.input.toolName}`,
        `toolResultId=${toolResultId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "persisted",
      persisted: true,
      toolResultId,
      memoryEventId,
      sessionId: params.input.sessionId,
      toolName: params.input.toolName,
      contentType: payload.contentType,
      storageStatus: "persisted",
      sizeBytes,
      checksumSha256,
      thresholdBytes,
      preview: createToolResultPreview({
        toolResultId,
        contentType: payload.contentType,
        serializedPayload: payload.serializedPayload,
        sizeBytes,
        previewCharLimit,
      }),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeToolResultPersistenceError(error);
    params.logger.error(
      `memory-middleware tool result persistence failed tool=${params.input.toolName}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function getToolResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultGetResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  try {
    const row = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<ToolResultRow>(
          `
            select
              tr.id,
              tr.session_id,
              tr.memory_event_id,
              me.project_id,
              me.agent_id,
              tr.tool_name,
              tr.status,
              tr.content_type,
              tr.preview_text,
              tr.payload_text,
              tr.payload_json,
              tr.size_bytes,
              tr.checksum_sha256,
              tr.metadata,
              tr.created_at,
              tr.updated_at
            from ${toolResultsTable} tr
            left join ${memoryEventsTable} me
              on me.id = tr.memory_event_id
            where tr.id = $1::uuid
          `,
          [params.input.toolResultId],
        );
        return result.rows[0];
      },
    });

    if (!row) {
      return {
        accepted: false,
        status: "not_found",
        reason: "tool result not found",
      };
    }

    return {
      accepted: true,
      status: "ok",
      toolResult: normalizeToolResultRecord(row),
    };
  } catch (error) {
    const reason = summarizeToolResultQueryError(error);
    params.logger.error(
      `memory-middleware tool result query failed toolResultId=${params.input.toolResultId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function planToolResultMicrocompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultMicrocompactPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultMicrocompactPlanResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });

  const idleGapSeconds = normalizeToolResultIdleGapSeconds(params.input.idleGapSeconds);
  const persistedCountThreshold = normalizeToolResultCountThreshold(
    params.input.persistedCountThreshold,
  );
  const recentFloorCount = normalizeToolResultRecentFloorCount(params.input.recentFloorCount);
  const maxClearCount = normalizeToolResultMaxClearCount(params.input.maxClearCount);
  const estimatedPromptTokenThreshold = normalizeToolResultPromptTokenThreshold(
    params.input.estimatedPromptTokenThreshold,
  );

  try {
    const rows = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<ToolResultMicrocompactRow>(
          `
            select
              id,
              session_id,
              memory_event_id,
              null::text as project_id,
              null::text as agent_id,
              tool_name,
              status,
              content_type,
              preview_text,
              payload_text,
              payload_json,
              size_bytes,
              checksum_sha256,
              metadata,
              created_at,
              updated_at
            from ${toolResultsTable}
            where session_id = $1::uuid
              and status = 'persisted'
            order by updated_at desc, created_at desc, id desc
          `,
          [params.input.sessionId],
        );
        return result.rows;
      },
    });

    const preservedRows = rows.slice(0, recentFloorCount);
    const candidateRows = rows.slice(recentFloorCount);
    const idleCutoff = Date.now() - idleGapSeconds * 1000;
    const selectedById = new Map<string, ToolResultMicrocompactCandidate>();
    const triggers = new Set<ToolResultMicrocompactTrigger>();
    const rationale: string[] = [];

    const candidateRowsOldestFirst = [...candidateRows].sort((left, right) => {
      const leftUpdated = new Date(normalizeTimestamp(left.updated_at)).getTime();
      const rightUpdated = new Date(normalizeTimestamp(right.updated_at)).getTime();
      if (leftUpdated !== rightUpdated) {
        return leftUpdated - rightUpdated;
      }
      const leftCreated = new Date(normalizeTimestamp(left.created_at)).getTime();
      const rightCreated = new Date(normalizeTimestamp(right.created_at)).getTime();
      if (leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }
      return left.id.localeCompare(right.id);
    });

    const idleRows = candidateRowsOldestFirst.filter(
      (row) => new Date(normalizeTimestamp(row.updated_at)).getTime() <= idleCutoff,
    );
    if (idleRows.length > 0) {
      triggers.add("idle_gap_threshold");
      rationale.push(
        `${idleRows.length} persisted tool-result previews are older than the idle-gap threshold`,
      );
      for (const row of idleRows) {
        selectedById.set(row.id, normalizeToolResultMicrocompactCandidate(row));
      }
    }

    const overflowCount = Math.max(0, rows.length - persistedCountThreshold);
    if (overflowCount > 0) {
      triggers.add("persisted_count_threshold");
      rationale.push(
        `persisted tool-result count ${rows.length} exceeds threshold ${persistedCountThreshold}`,
      );
      for (const row of candidateRowsOldestFirst.slice(0, overflowCount)) {
        selectedById.set(row.id, normalizeToolResultMicrocompactCandidate(row));
      }
    }

    if (
      typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens) &&
      params.input.estimatedPromptTokens > estimatedPromptTokenThreshold
    ) {
      triggers.add("estimated_token_pressure");
      rationale.push(
        `estimated prompt tokens ${Math.trunc(params.input.estimatedPromptTokens)} exceed threshold ${estimatedPromptTokenThreshold}`,
      );
      let remainingPressure =
        Math.trunc(params.input.estimatedPromptTokens) - estimatedPromptTokenThreshold;
      for (const row of candidateRowsOldestFirst) {
        if (remainingPressure <= 0) {
          break;
        }
        const candidate = normalizeToolResultMicrocompactCandidate(row);
        selectedById.set(row.id, candidate);
        remainingPressure -= candidate.estimatedPreviewTokens;
      }
    }

    const clearCandidates = candidateRowsOldestFirst
      .filter((row) => selectedById.has(row.id))
      .slice(0, maxClearCount)
      .map((row) => selectedById.get(row.id) as ToolResultMicrocompactCandidate);

    if (clearCandidates.length === 0) {
      return {
        accepted: true,
        status: "ok",
        sessionId: params.input.sessionId,
        shouldCompact: false,
        recommendedAction: "none",
        triggers: [],
        rationale:
          rows.length === 0
            ? ["no persisted tool results exist for this session"]
            : ["persisted tool-result previews remain within bounded microcompaction thresholds"],
        persistedResultCount: rows.length,
        recentFloorCount: Math.min(recentFloorCount, rows.length),
        preservedToolResultIds: preservedRows.map((row) => row.id),
        clearCandidates: [],
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold,
      };
    }

    return {
      accepted: true,
      status: "ok",
      sessionId: params.input.sessionId,
      shouldCompact: true,
      recommendedAction: "clear_persisted_previews",
      triggers: [...triggers],
      rationale,
      persistedResultCount: rows.length,
      recentFloorCount: Math.min(recentFloorCount, rows.length),
      preservedToolResultIds: preservedRows.map((row) => row.id),
      clearCandidates,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold,
    };
  } catch (error) {
    const reason = summarizeToolResultMicrocompactionError(error);
    params.logger.error(
      `memory-middleware tool result microcompaction planning failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function executeToolResultMicrocompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultMicrocompactExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultMicrocompactExecuteResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planToolResultMicrocompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  const requestedToolResultIds = params.input.clearToolResultIds;
  const requestedSet = new Set(requestedToolResultIds ?? []);
  const eligibleCandidates =
    requestedSet.size === 0
      ? planResult.clearCandidates
      : planResult.clearCandidates.filter((candidate) => requestedSet.has(candidate.toolResultId));
  const skippedRequestedToolResultIds =
    requestedSet.size === 0
      ? []
      : [...requestedSet].filter(
          (toolResultId) =>
            !planResult.clearCandidates.some(
              (candidate) => candidate.toolResultId === toolResultId,
            ),
        );

  if (eligibleCandidates.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      clearedToolResultIds: [],
      preservedToolResultIds: planResult.preservedToolResultIds,
      ...(requestedToolResultIds ? { requestedToolResultIds } : {}),
      clearCandidates: [],
      skippedRequestedToolResultIds,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  }

  const candidateIds = eligibleCandidates.map((candidate) => candidate.toolResultId);
  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const updateResult = await client.query<{ id: string }>(
      `
        update ${toolResultsTable}
        set
          status = 'compacted',
          preview_text = null,
          metadata = metadata || $2::jsonb
        where session_id = $1::uuid
          and id = any($3::uuid[])
          and status = 'persisted'
        returning id::text as id
      `,
      [
        params.input.sessionId,
        JSON.stringify({
          microcompaction: {
            clearedAt: new Date().toISOString(),
            source: "tool-result-microcompact-execute-tool",
          },
        }),
        candidateIds,
      ],
    );

    const clearedToolResultIds = updateResult.rows.map((row) => row.id);
    const executedCandidates = eligibleCandidates.filter((candidate) =>
      clearedToolResultIds.includes(candidate.toolResultId),
    );

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'micro',
          $3::memory_middleware.compaction_status,
          $4,
          $5::jsonb,
          $6::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId ?? null,
        clearedToolResultIds.length > 0 ? "completed" : "skipped",
        clearedToolResultIds.length > 0
          ? `Cleared ${clearedToolResultIds.length} persisted tool-result previews`
          : "No persisted tool-result previews required clearing",
        JSON.stringify({
          requestedToolResultIds: requestedToolResultIds ?? null,
          plannerClearCandidateIds: planResult.clearCandidates.map(
            (candidate) => candidate.toolResultId,
          ),
          clearedToolResultIds,
          skippedRequestedToolResultIds,
          preservedToolResultIds: planResult.preservedToolResultIds,
        }),
        JSON.stringify({
          source: "tool-result-microcompact-execute-tool",
        }),
      ],
    );

    const compactionEventId = compactionInsert.rows[0]?.id;
    if (!compactionEventId) {
      throw new Error("microcompaction execution did not return a compaction event id");
    }

    await client.query("commit");

    return {
      accepted: true,
      status: clearedToolResultIds.length > 0 ? "executed" : "no_op",
      sessionId: params.input.sessionId,
      compactionEventId,
      clearedToolResultIds,
      preservedToolResultIds: planResult.preservedToolResultIds,
      ...(requestedToolResultIds ? { requestedToolResultIds } : {}),
      clearCandidates: executedCandidates,
      skippedRequestedToolResultIds,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeToolResultMicrocompactionError(error);
    params.logger.error(
      `memory-middleware tool result microcompaction execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function getSessionMemoryInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryGetResult> {
  const agentStateTable = quoteQualifiedTable({
    schema: params.schema,
    table: "agent_state",
  });

  try {
    const row = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<SessionMemoryRow>(
          `
            select
              id,
              agent_id,
              session_id,
              state_key,
              lifecycle::text as lifecycle,
              state_json,
              metadata,
              created_at,
              updated_at
            from ${agentStateTable}
            where agent_id = $1::uuid
              and session_id = $2::uuid
              and state_key = 'session_memory'
            limit 1
          `,
          [params.input.agentId, params.input.sessionId],
        );
        return result.rows[0];
      },
    });

    if (!row) {
      return {
        accepted: true,
        status: "ok",
        exists: false,
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        memory: createEmptySessionMemoryState(),
        stateKey: "session_memory",
      };
    }

    return {
      accepted: true,
      status: "ok",
      exists: true,
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      memory: normalizeSessionMemoryState(row.state_json),
      stateKey: "session_memory",
      stateId: row.id,
      lifecycle: row.lifecycle,
      updateCount: normalizeSessionMemoryUpdateCount(row.metadata),
      ...(typeof row.metadata?.updateReason === "string"
        ? { updateReason: row.metadata.updateReason }
        : {}),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    };
  } catch (error) {
    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory get failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function updateSessionMemoryInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryUpdateInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryUpdateResult> {
  const agentStateTable = quoteQualifiedTable({
    schema: params.schema,
    table: "agent_state",
  });
  const sessionsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "sessions",
  });
  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const existingResult = await client.query<SessionMemoryRow>(
      `
        select
          id,
          agent_id,
          session_id,
          state_key,
          lifecycle::text as lifecycle,
          state_json,
          metadata,
          created_at,
          updated_at
        from ${agentStateTable}
        where agent_id = $1::uuid
          and session_id = $2::uuid
          and state_key = 'session_memory'
        for update
      `,
      [params.input.agentId, params.input.sessionId],
    );

    const existingRow = existingResult.rows[0];
    const nextState = applySessionMemoryUpdate(
      normalizeSessionMemoryState(existingRow?.state_json),
      params.input,
    );
    const nextUpdateCount = normalizeSessionMemoryUpdateCount(existingRow?.metadata ?? null) + 1;
    const nextMetadata = {
      source: "session-memory-tool",
      updateCount: nextUpdateCount,
      ...(params.input.updateReason ? { updateReason: params.input.updateReason } : {}),
      ...(params.input.metadata ? { sessionMemoryMetadata: params.input.metadata } : {}),
    };

    let persistedRow: SessionMemoryRow | undefined;
    let status: "created" | "updated" = "updated";

    if (existingRow) {
      const updateResult = await client.query<SessionMemoryRow>(
        `
          update ${agentStateTable}
          set
            lifecycle = 'active',
            state_json = $2::jsonb,
            metadata = $3::jsonb
          where id = $1::uuid
          returning
            id,
            agent_id,
            session_id,
            state_key,
            lifecycle::text as lifecycle,
            state_json,
            metadata,
            created_at,
            updated_at
        `,
        [existingRow.id, JSON.stringify(nextState), JSON.stringify(nextMetadata)],
      );
      persistedRow = updateResult.rows[0];
    } else {
      status = "created";
      const insertResult = await client.query<SessionMemoryRow>(
        `
          insert into ${agentStateTable} (
            project_id,
            agent_id,
            session_id,
            state_key,
            lifecycle,
            state_json,
            metadata
          )
          values (
            (select project_id from ${sessionsTable} where id = $2::uuid),
            $1::uuid,
            $2::uuid,
            'session_memory',
            'active',
            $3::jsonb,
            $4::jsonb
          )
          returning
            id,
            agent_id,
            session_id,
            state_key,
            lifecycle::text as lifecycle,
            state_json,
            metadata,
            created_at,
            updated_at
        `,
        [
          params.input.agentId,
          params.input.sessionId,
          JSON.stringify(nextState),
          JSON.stringify(nextMetadata),
        ],
      );
      persistedRow = insertResult.rows[0];
    }

    if (!persistedRow) {
      throw new Error("session-memory write did not return an agent_state row");
    }

    await client.query("commit");

    return {
      accepted: true,
      status,
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      stateKey: "session_memory",
      stateId: persistedRow.id,
      lifecycle: "active",
      memory: normalizeSessionMemoryState(persistedRow.state_json),
      updateCount: normalizeSessionMemoryUpdateCount(persistedRow.metadata),
      ...(typeof persistedRow.metadata?.updateReason === "string"
        ? { updateReason: persistedRow.metadata.updateReason }
        : {}),
      createdAt: normalizeTimestamp(persistedRow.created_at),
      updatedAt: normalizeTimestamp(persistedRow.updated_at),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory update failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function planCompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CompactionPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CompactionPlanResult> {
  const estimatedPromptTokenThreshold = normalizeToolResultPromptTokenThreshold(
    params.input.estimatedPromptTokenThreshold,
  );
  const sessionMemoryStaleAfterSeconds = normalizeSessionMemoryStaleAfterSeconds(
    params.input.sessionMemoryStaleAfterSeconds,
  );

  const microcompactResult = await planToolResultMicrocompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!microcompactResult.accepted) {
    return microcompactResult;
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  const rationale: string[] = [];
  const requiredInputs: string[] = [];
  const sessionMemoryExists = sessionMemoryResult.exists;
  const sessionMemoryUpdatedAt = sessionMemoryResult.updatedAt;
  const sessionMemorySufficient = sessionMemoryExists
    ? isSessionMemorySufficient(sessionMemoryResult.memory)
    : false;
  const sessionMemoryFresh = Boolean(
    sessionMemoryUpdatedAt &&
    Date.now() - new Date(sessionMemoryUpdatedAt).getTime() <=
      sessionMemoryStaleAfterSeconds * 1000,
  );

  let sessionMemoryStatus: CompactionPlanSessionMemoryStatus = "missing";
  if (!sessionMemoryExists) {
    sessionMemoryStatus = "missing";
    rationale.push("session memory does not exist for this session");
  } else if (!sessionMemoryFresh) {
    sessionMemoryStatus = "stale";
    rationale.push("session memory exists but is older than the bounded freshness window");
  } else if (!sessionMemorySufficient) {
    sessionMemoryStatus = "fresh_but_insufficient";
    rationale.push("session memory is fresh but does not yet capture enough structured work state");
  } else {
    sessionMemoryStatus = "fresh_and_sufficient";
    rationale.push("session memory is fresh and sufficient for bounded context recovery");
  }

  const promptPressureExceeded = Boolean(
    typeof params.input.estimatedPromptTokens === "number" &&
    Number.isFinite(params.input.estimatedPromptTokens) &&
    Math.trunc(params.input.estimatedPromptTokens) > estimatedPromptTokenThreshold,
  );

  let outcome:
    | "none"
    | "use_microcompaction"
    | "use_session_memory"
    | "propose_full_compaction_fallback" = "none";

  if (microcompactResult.shouldCompact) {
    outcome = "use_microcompaction";
    rationale.unshift("persisted tool-result pressure exceeds bounded microcompaction thresholds");
    if (!sessionMemoryExists) {
      requiredInputs.push(
        "create or update session memory after preview clearing if more context relief is needed",
      );
    }
  } else if (promptPressureExceeded && sessionMemoryStatus === "fresh_and_sufficient") {
    outcome = "use_session_memory";
    rationale.unshift(
      "prompt pressure exceeds the bounded threshold and fresh session memory is available",
    );
  } else if (promptPressureExceeded) {
    outcome = "propose_full_compaction_fallback";
    rationale.unshift(
      "prompt pressure exceeds the bounded threshold and session memory is missing, stale, or insufficient",
    );
    requiredInputs.push(
      "fresh sufficient session memory or a future full compaction implementation",
    );
  } else {
    outcome = "none";
    rationale.unshift("bounded context pressure remains within the current compaction thresholds");
  }

  return {
    accepted: true,
    status: "ok",
    sessionId: params.input.sessionId,
    agentId: params.input.agentId,
    outcome,
    rationale,
    requiredInputs,
    clearCandidates: microcompactResult.clearCandidates,
    microcompactionRecommended: microcompactResult.shouldCompact,
    sessionMemoryStatus,
    sessionMemoryExists,
    sessionMemorySufficient,
    sessionMemoryFresh,
    ...(sessionMemoryUpdatedAt ? { sessionMemoryUpdatedAt } : {}),
    ...(typeof params.input.estimatedPromptTokens === "number" &&
    Number.isFinite(params.input.estimatedPromptTokens)
      ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
      : {}),
    estimatedPromptTokenThreshold,
  };
}

async function executeSessionMemoryCompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryCompactExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryCompactExecuteResult> {
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planCompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
      ...(params.input.sessionMemoryStaleAfterSeconds !== undefined
        ? { sessionMemoryStaleAfterSeconds: params.input.sessionMemoryStaleAfterSeconds }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  if (planResult.outcome !== "use_session_memory") {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      rationale: planResult.rationale,
      requiredInputs: planResult.requiredInputs,
      ...(planResult.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: planResult.sessionMemoryUpdatedAt }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  if (
    !sessionMemoryResult.exists ||
    !sessionMemoryResult.stateId ||
    !sessionMemoryResult.updatedAt
  ) {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: "missing",
      rationale: ["session memory is missing so session-memory-backed compaction cannot execute"],
      requiredInputs: ["bounded session memory must exist before this execution path can run"],
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const payload = buildSessionMemoryCompactionPayload({
    stateId: sessionMemoryResult.stateId,
    memory: sessionMemoryResult.memory,
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const existingEvent = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${compactionEventsTable}
        where session_id = $1::uuid
          and compaction_kind = 'micro'
          and status = 'completed'
          and details ->> 'compactionSubstrate' = 'session_memory'
          and details ->> 'sessionMemoryStateId' = $2
          and details ->> 'sessionMemoryUpdatedAt' = $3
        order by created_at desc
        limit 1
      `,
      [params.input.sessionId, sessionMemoryResult.stateId, sessionMemoryResult.updatedAt],
    );
    const existingCompactionEventId = existingEvent.rows[0]?.id;
    if (existingCompactionEventId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_executed",
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        plannerOutcome: planResult.outcome,
        sessionMemoryStatus: planResult.sessionMemoryStatus,
        sessionMemoryStateId: sessionMemoryResult.stateId,
        sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
        compactionEventId: existingCompactionEventId,
        payload,
        rationale: [
          "session-memory-backed compaction already exists for the current session-memory state",
        ],
        requiredInputs: [],
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      };
    }

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'micro',
          'completed',
          $3,
          $4::jsonb,
          $5::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId,
        "Reused bounded session memory as the compaction substrate",
        JSON.stringify({
          compactionSubstrate: "session_memory",
          plannerOutcome: planResult.outcome,
          sessionMemoryStateId: sessionMemoryResult.stateId,
          sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
          sessionMemoryStatus: planResult.sessionMemoryStatus,
          fieldsIncluded: payload.fieldsIncluded,
          compactedText: payload.compactedText,
        }),
        JSON.stringify({
          source: "session-memory-compact-execute-tool",
        }),
      ],
    );
    const compactionEventId = compactionInsert.rows[0]?.id;
    if (!compactionEventId) {
      throw new Error("session-memory compaction did not return a compaction event id");
    }

    await client.query("commit");
    return {
      accepted: true,
      status: "executed",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      sessionMemoryStateId: sessionMemoryResult.stateId,
      sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
      compactionEventId,
      payload,
      rationale: ["session memory was reused as the bounded compaction substrate"],
      requiredInputs: [],
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory compaction execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function executeFullCompactionFallbackInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: FullCompactionFallbackExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<FullCompactionFallbackExecuteResult> {
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planCompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
      ...(params.input.sessionMemoryStaleAfterSeconds !== undefined
        ? { sessionMemoryStaleAfterSeconds: params.input.sessionMemoryStaleAfterSeconds }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  if (planResult.outcome !== "propose_full_compaction_fallback") {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      rationale: planResult.rationale,
      requiredInputs: planResult.requiredInputs,
      ...(planResult.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: planResult.sessionMemoryUpdatedAt }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  const payload = buildFullCompactionFallbackPayload({
    sessionId: params.input.sessionId,
    planResult,
    ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
      ? { sessionMemoryStateId: sessionMemoryResult.stateId }
      : {}),
    ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
      ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
      : {}),
    ...(sessionMemoryResult.exists ? { sessionMemory: sessionMemoryResult.memory } : {}),
  });
  const payloadSignature = createHash("sha256")
    .update(payload.compactedText)
    .update(payload.substitutionText)
    .digest("hex");

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const existingEvent = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${compactionEventsTable}
        where session_id = $1::uuid
          and compaction_kind = 'full'
          and status = 'completed'
          and details ->> 'compactionSubstrate' = 'full_fallback'
          and details ->> 'payloadSignature' = $2
        order by created_at desc
        limit 1
      `,
      [params.input.sessionId, payloadSignature],
    );
    const existingCompactionEventId = existingEvent.rows[0]?.id;
    if (existingCompactionEventId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_executed",
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        plannerOutcome: planResult.outcome,
        sessionMemoryStatus: planResult.sessionMemoryStatus,
        ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
          ? { sessionMemoryStateId: sessionMemoryResult.stateId }
          : {}),
        ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
          ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
          : {}),
        compactionEventId: existingCompactionEventId,
        payload,
        rationale: ["full fallback compaction already exists for the current bounded substrate"],
        requiredInputs: planResult.requiredInputs,
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      };
    }

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'full',
          'completed',
          $3,
          $4::jsonb,
          $5::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId,
        "Produced a bounded full fallback compaction artifact from existing structured state",
        JSON.stringify({
          compactionSubstrate: "full_fallback",
          payloadSignature,
          plannerOutcome: planResult.outcome,
          sessionMemoryStatus: planResult.sessionMemoryStatus,
          ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
            ? { sessionMemoryStateId: sessionMemoryResult.stateId }
            : {}),
          ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
            ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
            : {}),
          clearCandidateIds: planResult.clearCandidates.map((item) => item.toolResultId),
          compactedText: payload.compactedText,
        }),
        JSON.stringify({
          source: "full-compaction-fallback-execute-tool",
        }),
      ],
    );

    await client.query("commit");

    return {
      accepted: true,
      status: "executed",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
        ? { sessionMemoryStateId: sessionMemoryResult.stateId }
        : {}),
      ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
        ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
        : {}),
      compactionEventId: compactionInsert.rows[0]?.id,
      payload,
      rationale: [
        "bounded existing state was packaged into a deterministic full-fallback compaction artifact",
      ],
      requiredInputs: planResult.requiredInputs,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware full compaction fallback execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function planConsolidationInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ConsolidationPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ConsolidationPlanResult> {
  const includeValidatedProcedures = params.input.includeValidatedProcedures ?? true;
  const listLimit = normalizeConsolidationPlanLimit(params.input.limit);
  const maxFindings = normalizeConsolidationPlanMaxFindings(params.input.maxFindings);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryRows = await listApprovedMemorySurfaceRows({
          client,
          schema: params.schema,
          input: {
            ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
            limit: listLimit,
          },
        });
        const memoryRecords = memoryRows.map((row) =>
          normalizeConsolidationRecordFromMemoryObject(normalizeMemoryObjectRecord(row)),
        );

        if (!includeValidatedProcedures) {
          return memoryRecords;
        }

        const procedureRows = await listValidatedProcedureRows({
          client,
          schema: params.schema,
          input: {
            ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
            limit: listLimit,
          },
        });
        const procedureRecords = procedureRows.map((row) =>
          normalizeConsolidationRecordFromProcedure(normalizeProcedureObjectRecord(row)),
        );

        return [...memoryRecords, ...procedureRecords];
      },
    });

    const findings: ConsolidationPlanFinding[] = [];

    const duplicateGroups = new Map<string, ConsolidationRecord[]>();
    for (const record of records) {
      const normalizedContent = normalizeConsolidationContent(record.content);
      if (!normalizedContent) {
        continue;
      }
      const existing = duplicateGroups.get(normalizedContent) ?? [];
      existing.push(record);
      duplicateGroups.set(normalizedContent, existing);
    }
    for (const group of duplicateGroups.values()) {
      if (group.length < 2) {
        continue;
      }
      findings.push(
        buildConsolidationFinding({
          actionType: "duplicate_merge_review",
          priority: "medium",
          confidence: "high",
          records: group,
          rationale: ["approved durable records share the same normalized content"],
        }),
      );
    }

    const contradictionGroups = new Map<string, Map<string, ConsolidationRecord[]>>();
    for (const record of records) {
      const consolidationKey = normalizeMetadataString(record.metadata, "consolidationKey");
      const consolidationValue = normalizeMetadataScalarKey(record.metadata, "consolidationValue");
      if (!consolidationKey || consolidationValue === undefined) {
        continue;
      }
      const valueMap =
        contradictionGroups.get(consolidationKey) ?? new Map<string, ConsolidationRecord[]>();
      const valueRecords = valueMap.get(consolidationValue) ?? [];
      valueRecords.push(record);
      valueMap.set(consolidationValue, valueRecords);
      contradictionGroups.set(consolidationKey, valueMap);
    }
    for (const [consolidationKey, valueMap] of contradictionGroups.entries()) {
      if (valueMap.size < 2) {
        continue;
      }
      const recordsForKey = [...valueMap.values()].flat();
      findings.push(
        buildConsolidationFinding({
          actionType: "contradiction_review",
          priority: "high",
          confidence: "high",
          records: recordsForKey,
          rationale: [
            `durable records share consolidationKey=${consolidationKey} but preserve conflicting consolidationValue metadata`,
          ],
        }),
      );
    }

    for (const record of records) {
      const supersededByObjectId = normalizeMetadataString(record.metadata, "supersededByObjectId");
      const supersededByProcedureId = normalizeMetadataString(
        record.metadata,
        "supersededByProcedureId",
      );
      const lifecycleHint = normalizeMetadataString(record.metadata, "lifecycleHint");
      if (
        !supersededByObjectId &&
        !supersededByProcedureId &&
        lifecycleHint !== "stale" &&
        lifecycleHint !== "superseded"
      ) {
        continue;
      }
      findings.push(
        buildConsolidationFinding({
          actionType: "stale_superseded_review",
          priority: "medium",
          confidence: "medium",
          records: [record],
          rationale: [
            supersededByObjectId || supersededByProcedureId
              ? "durable record metadata marks the object as superseded by another bounded artifact"
              : "durable record metadata marks the object as stale or superseded",
          ],
        }),
      );
    }

    const now = Date.now();
    for (const record of records) {
      const driftCheckDueAt = normalizeMetadataString(record.metadata, "driftCheckDueAt");
      if (!driftCheckDueAt) {
        continue;
      }
      const dueAt = Date.parse(driftCheckDueAt);
      if (!Number.isFinite(dueAt) || dueAt > now) {
        continue;
      }
      const driftCheckedAt = normalizeMetadataString(record.metadata, "driftCheckedAt");
      if (driftCheckedAt) {
        const checkedAt = Date.parse(driftCheckedAt);
        if (Number.isFinite(checkedAt) && checkedAt >= dueAt) {
          continue;
        }
      }
      findings.push(
        buildConsolidationFinding({
          actionType: "drift_check_review",
          priority: "low",
          confidence: "high",
          records: [record],
          rationale: ["durable record metadata indicates a drift-check due time in the past"],
        }),
      );
    }

    const priorityOrder: Record<ConsolidationPlanPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    const actionOrder: Record<ConsolidationPlanActionType, number> = {
      contradiction_review: 0,
      duplicate_merge_review: 1,
      stale_superseded_review: 2,
      drift_check_review: 3,
    };
    findings.sort((left, right) => {
      const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const actionDelta = actionOrder[left.actionType] - actionOrder[right.actionType];
      if (actionDelta !== 0) {
        return actionDelta;
      }
      return left.affectedObjectIds.join(",").localeCompare(right.affectedObjectIds.join(","));
    });

    const boundedFindings = findings.slice(0, maxFindings);
    const result: ConsolidationPlanResult =
      boundedFindings.length === 0
        ? {
            accepted: true,
            status: "ok",
            outcome: "no_action",
            inspectedRecordCount: records.length,
            includeValidatedProcedures,
            findings: [],
            rationale: ["bounded durable memory does not currently require consolidation review"],
          }
        : {
            accepted: true,
            status: "ok",
            outcome: "review_needed",
            inspectedRecordCount: records.length,
            includeValidatedProcedures,
            findings: boundedFindings,
            rationale: [
              `bounded durable memory contains ${String(boundedFindings.length)} consolidation finding${boundedFindings.length === 1 ? "" : "s"}`,
            ],
          };

    params.logger.debug?.(
      [
        "memory-middleware consolidation plan completed",
        `records=${String(records.length)}`,
        `findings=${String(boundedFindings.length)}`,
        `includeValidatedProcedures=${includeValidatedProcedures ? "true" : "false"}`,
      ].join(" "),
    );

    return result;
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware consolidation plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function listPendingCandidateReviewRows(params: {
  client: Client;
  schema: string;
  projectId?: string;
  limit: number;
}): Promise<PendingCandidateReviewRow[]> {
  const reviewableCandidatesView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_reviewable_candidates_v",
  });

  const result = await params.client.query<PendingCandidateReviewRow>(
    `
      select
        id::text as id,
        source_event_name,
        created_at::text as created_at
      from ${reviewableCandidatesView}
      where review_state = 'candidate'
        and latest_review_action is null
        and ($1::uuid is null or project_id = $1::uuid)
      order by created_at asc, id asc
      limit $2
    `,
    [params.projectId ?? null, params.limit],
  );

  return result.rows;
}

async function listDraftProcedureIdsForProactivity(params: {
  client: Client;
  schema: string;
  projectId?: string;
  limit: number;
}): Promise<string[]> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });

  const result = await params.client.query<DraftProcedureIdRow>(
    `
      select id::text as id
      from ${proceduresTable}
      where status = 'draft'
        and ($1::uuid is null or project_id = $1::uuid)
      order by created_at asc, id asc
      limit $2
    `,
    [params.projectId ?? null, params.limit],
  );

  return result.rows.map((row) => row.id);
}

async function listCandidateSkillGovernanceRows(params: {
  client: Client;
  schema: string;
  projectId?: string;
  limit: number;
}): Promise<CandidateSkillGovernanceRow[]> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });

  const result = await params.client.query<CandidateSkillGovernanceRow>(
    `
      select
        id::text as id,
        status::text as status
      from ${skillCandidatesTable}
      where status = 'candidate'
        and ($1::uuid is null or project_id = $1::uuid)
      order by created_at asc, id asc
      limit $2
    `,
    [params.projectId ?? null, params.limit],
  );

  return result.rows;
}

async function listStaleApprovedMemoryIds(params: {
  client: Client;
  schema: string;
  projectId?: string;
  limit: number;
}): Promise<string[]> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });

  const result = await params.client.query<{ id: string }>(
    `
      select id::text as id
      from ${memoryObjectsTable}
      where review_state = 'approved'
        and ($1::uuid is null or project_id = $1::uuid)
        and (
          metadata ? 'supersededByObjectId'
          or metadata ? 'supersededByProcedureId'
          or coalesce(metadata->>'lifecycleHint', '') in ('stale', 'superseded')
        )
      order by updated_at asc, id asc
      limit $2
    `,
    [params.projectId ?? null, params.limit],
  );

  return result.rows.map((row) => row.id);
}

function createProactivePlanAction(params: {
  actionType: MemoryProactivePlanAction["actionType"];
  priority: MemoryProactivePlanAction["priority"];
  actionClass: MemoryProactivePlanAction["actionClass"];
  requiredApprovalClass: MemoryProactivePlanAction["requiredApprovalClass"];
  affectedIds: string[];
  rationale: string[];
}): MemoryProactivePlanAction {
  return {
    actionType: params.actionType,
    priority: params.priority,
    actionClass: params.actionClass,
    requiredApprovalClass: params.requiredApprovalClass,
    affectedIds: params.affectedIds,
    rationale: params.rationale,
    advisoryOnly: true,
    advisoryNote: "Advisory only. No proactive actions were executed.",
  };
}

async function planProactivityInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryProactivePlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryProactivePlanResult> {
  const maxActions = normalizeProactivePlanMaxActions(params.input.maxActions);

  try {
    const state = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const pendingCandidateRows = await listPendingCandidateReviewRows({
          client,
          schema: params.schema,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          limit: maxActions,
        });

        const draftProcedureIds = await listDraftProcedureIdsForProactivity({
          client,
          schema: params.schema,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          limit: maxActions * 3,
        });
        const eligibleProcedureValidationIds: string[] = [];
        for (const procedureId of draftProcedureIds) {
          const target = await selectProcedureValidationPlanTarget({
            client,
            schema: params.schema,
            procedureId,
          });
          if (!target) {
            continue;
          }

          const sourceCandidateId =
            target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
          const sourceCandidateKind = target.source_candidate_kind
            ? parseCandidateKind(target.source_candidate_kind)
            : undefined;
          const plan = buildProcedureValidationPlan({
            procedureId,
            procedureStatus: parseProcedureStatus(target.status),
            ...(sourceCandidateId ? { sourceCandidateId } : {}),
            ...(sourceCandidateKind ? { sourceCandidateKind } : {}),
            ...(target.latest_candidate_review_outcome
              ? { latestCandidateReviewOutcome: target.latest_candidate_review_outcome }
              : {}),
            hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
            hasSourceEventProvenance: Boolean(target.source_event_id),
          });
          if (plan.accepted && plan.eligible) {
            eligibleProcedureValidationIds.push(procedureId);
          }
          if (eligibleProcedureValidationIds.length >= maxActions) {
            break;
          }
        }

        const candidateSkillRows = await listCandidateSkillGovernanceRows({
          client,
          schema: params.schema,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          limit: maxActions,
        });

        const staleMemoryIds = await listStaleApprovedMemoryIds({
          client,
          schema: params.schema,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          limit: maxActions,
        });

        return {
          pendingCandidateRows,
          eligibleProcedureValidationIds,
          candidateSkillRows,
          staleMemoryIds,
        };
      },
    });

    const consolidationPlan = await planConsolidationInConfiguredDatabase({
      config: params.config,
      input: {
        ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
        includeValidatedProcedures: true,
        limit: Math.max(maxActions * 3, DEFAULT_CONSOLIDATION_PLAN_LIMIT),
        maxFindings: Math.max(maxActions * 3, DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS),
      },
      logger: params.logger,
      schema: params.schema,
    });

    if (!consolidationPlan.accepted) {
      return consolidationPlan;
    }

    const driftAffectedIds = consolidationPlan.findings
      .filter((finding) => finding.actionType === "drift_check_review")
      .flatMap((finding) => finding.affectedObjectIds);
    const consolidationReviewIds = consolidationPlan.findings
      .filter(
        (finding) =>
          finding.actionType === "duplicate_merge_review" ||
          finding.actionType === "contradiction_review",
      )
      .flatMap((finding) => finding.affectedObjectIds);

    const actions: MemoryProactivePlanAction[] = [];

    if (state.pendingCandidateRows.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "follow_up_candidate_review",
          priority: "high",
          actionClass: "candidate_review_follow_up",
          requiredApprovalClass: "manual_review",
          affectedIds: state.pendingCandidateRows.map((row) => row.id),
          rationale: [
            `${String(state.pendingCandidateRows.length)} candidate-state memory object${state.pendingCandidateRows.length === 1 ? "" : "s"} remain unreviewed`,
            "manual candidate review is required before any later promotion planning or bounded write path",
          ],
        }),
      );
    }

    if (state.eligibleProcedureValidationIds.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "follow_up_procedure_validation",
          priority: "medium",
          actionClass: "procedure_validation_follow_up",
          requiredApprovalClass: "manual_validation_review",
          affectedIds: state.eligibleProcedureValidationIds,
          rationale: [
            `${String(state.eligibleProcedureValidationIds.length)} draft procedure${state.eligibleProcedureValidationIds.length === 1 ? "" : "s"} already meet bounded validation-planning eligibility`,
            "validated-procedure creation still requires explicit manual follow-up through the bounded validation surface",
          ],
        }),
      );
    }

    if (state.candidateSkillRows.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "follow_up_skill_candidate_governance",
          priority: "medium",
          actionClass: "skill_candidate_governance_follow_up",
          requiredApprovalClass: "manual_governance_review",
          affectedIds: state.candidateSkillRows.map((row) => row.id),
          rationale: [
            `${String(state.candidateSkillRows.length)} bounded skill candidate${state.candidateSkillRows.length === 1 ? "" : "s"} remain in internal candidate governance state`,
            "procurement, vetting, approval, and install follow-up remain manual and explicitly separated from this advisory planner",
          ],
        }),
      );
    }

    if (driftAffectedIds.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "run_drift_check",
          priority: "medium",
          actionClass: "drift_check_follow_up",
          requiredApprovalClass: "explicit_write_invocation",
          affectedIds: [...new Set(driftAffectedIds)].slice(0, maxActions),
          rationale: [
            "bounded durable memory contains overdue drift-check findings",
            "drift-check recording remains a separate explicit write action and is not executed by this planner",
          ],
        }),
      );
    }

    if (state.staleMemoryIds.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "revisit_stale_memory",
          priority: "low",
          actionClass: "memory_hygiene_follow_up",
          requiredApprovalClass: "manual_review",
          affectedIds: state.staleMemoryIds,
          rationale: [
            "approved durable memory metadata marks bounded records as stale or superseded",
            "human review is still required before any separate consolidation or cleanup step",
          ],
        }),
      );
    }

    if (consolidationReviewIds.length > 0) {
      actions.push(
        createProactivePlanAction({
          actionType: "review_consolidation_findings",
          priority: "medium",
          actionClass: "consolidation_review_follow_up",
          requiredApprovalClass: "manual_review",
          affectedIds: [...new Set(consolidationReviewIds)].slice(0, maxActions),
          rationale: [
            "bounded consolidation planning found duplicate or contradiction review findings",
            "those findings remain advisory until a later explicit review or execution action is chosen",
          ],
        }),
      );
    }

    const priorityOrder: Record<MemoryProactivePlanAction["priority"], number> = {
      high: 0,
      medium: 1,
      low: 2,
      none: 3,
    };
    actions.sort((left, right) => {
      const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.actionType.localeCompare(right.actionType);
    });

    const boundedActions = actions.slice(0, maxActions);
    if (boundedActions.length === 0) {
      return {
        accepted: true,
        status: "ok",
        outcome: "no_action",
        ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
        advisoryOnly: true,
        advisoryNote: "Advisory only. No proactive actions were executed.",
        actions: [
          createProactivePlanAction({
            actionType: "no_action",
            priority: "none",
            actionClass: "none",
            requiredApprovalClass: "none",
            affectedIds: [],
            rationale: [
              "bounded internal memory-middleware state does not currently suggest a useful proactive follow-up",
            ],
          }),
        ],
        inspectedState: {
          pendingCandidateReviewCount: 0,
          eligibleProcedureValidationCount: 0,
          candidateSkillGovernanceCount: 0,
          staleMemoryCount: 0,
          driftCheckCount: 0,
          consolidationReviewCount: 0,
        },
        rationale: ["no bounded proactive follow-up opportunities were identified"],
      };
    }

    return {
      accepted: true,
      status: "ok",
      outcome: "actions_available",
      ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
      advisoryOnly: true,
      advisoryNote: "Advisory only. No proactive actions were executed.",
      actions: boundedActions,
      inspectedState: {
        pendingCandidateReviewCount: state.pendingCandidateRows.length,
        eligibleProcedureValidationCount: state.eligibleProcedureValidationIds.length,
        candidateSkillGovernanceCount: state.candidateSkillRows.length,
        staleMemoryCount: state.staleMemoryIds.length,
        driftCheckCount: driftAffectedIds.length,
        consolidationReviewCount: consolidationReviewIds.length,
      },
      rationale: [
        `bounded middleware state contains ${String(boundedActions.length)} advisory proactive opportunit${boundedActions.length === 1 ? "y" : "ies"}`,
      ],
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware proactive plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function enqueueBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobEnqueueInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobEnqueueResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  try {
    const payload = createBackgroundJobPayload(params.input);
    const payloadFingerprint = createBackgroundJobPayloadFingerprint(payload);
    const runAfter = normalizeBackgroundJobRunAfter(params.input.runAfter);
    const maxAttempts = normalizeBackgroundJobMaxAttempts(params.input.maxAttempts);

    return withConfiguredClient({
      config: params.config,
      async run(client) {
        const existingJob = await client.query<{ id: string; run_after: string }>(
          `
            select id::text as id, run_after::text as run_after
            from ${backgroundJobsTable}
            where job_kind = 'maintenance'
              and status in ('queued', 'running')
              and metadata->>'payloadFingerprint' = $1
            order by created_at desc, id desc
            limit 1
          `,
          [payloadFingerprint],
        );
        const existingJobId = existingJob.rows[0]?.id;
        if (existingJobId) {
          return {
            accepted: true,
            status: "already_queued",
            jobId: existingJobId,
            jobClass: params.input.jobClass,
            jobKind: "maintenance",
            runAfter: existingJob.rows[0]?.run_after ?? runAfter,
            payloadFingerprint,
          };
        }

        const inserted = await client.query<{ id: string; run_after: string }>(
          `
            insert into ${backgroundJobsTable} (
              project_id,
              session_id,
              agent_id,
              job_kind,
              status,
              payload,
              run_after,
              max_attempts,
              metadata
            )
            values ($1::uuid, $2::uuid, $3::uuid, 'maintenance', 'queued', $4::jsonb, $5::timestamptz, $6, $7::jsonb)
            returning id::text as id, run_after::text as run_after
          `,
          [
            params.input.projectId ?? null,
            params.input.sessionId ?? null,
            params.input.agentId ?? null,
            JSON.stringify(payload),
            runAfter,
            maxAttempts,
            JSON.stringify({
              source: "memory_background_job_enqueue",
              payloadFingerprint,
              boundedJobClass: params.input.jobClass,
            }),
          ],
        );
        const jobId = inserted.rows[0]?.id;
        if (!jobId) {
          throw new Error("background job enqueue did not return a job id");
        }

        return {
          accepted: true,
          status: "queued",
          jobId,
          jobClass: params.input.jobClass,
          jobKind: "maintenance",
          runAfter: inserted.rows[0]?.run_after ?? runAfter,
          payloadFingerprint,
        };
      },
    });
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job enqueue failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      jobClass: params.input.jobClass,
      reason,
    };
  }
}

function normalizeClaimedBackgroundJobRow(row: BackgroundJobRow): MemoryBackgroundJobClaimedRecord {
  const normalized = normalizeBackgroundJobRecordRow(row);

  return {
    jobId: normalized.jobId,
    jobClass: normalized.jobClass,
    jobKind: normalized.jobKind,
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    ...(normalized.sessionId ? { sessionId: normalized.sessionId } : {}),
    ...(normalized.agentId ? { agentId: normalized.agentId } : {}),
    attempts: normalized.attempts,
    maxAttempts: normalized.maxAttempts,
    runAfter: normalized.runAfter,
    payloadFingerprint: normalized.payloadFingerprint,
    ...(normalized.maxActions !== undefined ? { maxActions: normalized.maxActions } : {}),
    ...(normalized.limit !== undefined ? { limit: normalized.limit } : {}),
    ...(normalized.maxFindings !== undefined ? { maxFindings: normalized.maxFindings } : {}),
    ...(normalized.affectedIds ? { affectedIds: normalized.affectedIds } : {}),
    ...(normalized.approvedFindings ? { approvedFindings: normalized.approvedFindings } : {}),
    ...(normalized.reviewerAgentId ? { reviewerAgentId: normalized.reviewerAgentId } : {}),
    ...(normalized.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: normalized.includeValidatedProcedures }
      : {}),
  };
}

function normalizeBackgroundJobTimestamp(
  value: string | Date | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeBackgroundJobRecordRow(row: BackgroundJobRow): MemoryBackgroundJobRecord {
  const payload = row.payload ?? {};
  const metadata = row.metadata ?? {};
  const jobClass = parseMemoryBackgroundJobClass(payload.jobClass);
  if (!jobClass) {
    throw new Error(`unsupported background job class: ${String(payload.jobClass)}`);
  }

  const affectedIds = Array.isArray(payload.affectedIds)
    ? normalizeBackgroundJobAffectedIds(
        payload.affectedIds.filter((entry): entry is string => typeof entry === "string"),
      )
    : undefined;
  const maxActions =
    typeof payload.maxActions === "number" && Number.isFinite(payload.maxActions)
      ? normalizeProactivePlanMaxActions(payload.maxActions)
      : undefined;
  const limit =
    typeof payload.limit === "number" && Number.isFinite(payload.limit)
      ? normalizeConsolidationPlanLimit(payload.limit)
      : undefined;
  const maxFindings =
    typeof payload.maxFindings === "number" && Number.isFinite(payload.maxFindings)
      ? normalizeConsolidationPlanMaxFindings(payload.maxFindings)
      : undefined;
  const approvedFindings = Array.isArray(payload.approvedFindings)
    ? normalizeBackgroundJobConsolidationSelections(
        payload.approvedFindings.map((selection) =>
          selection && typeof selection === "object" && !Array.isArray(selection)
            ? {
                actionType: (selection as Record<string, unknown>).actionType,
                affectedObjectIds: (selection as Record<string, unknown>).affectedObjectIds,
              }
            : { actionType: undefined, affectedObjectIds: undefined },
        ),
      )
    : undefined;
  const reviewerAgentId =
    typeof payload.reviewerAgentId === "string" && payload.reviewerAgentId.trim().length > 0
      ? payload.reviewerAgentId.trim()
      : undefined;
  const includeValidatedProcedures =
    typeof payload.includeValidatedProcedures === "boolean"
      ? payload.includeValidatedProcedures
      : undefined;
  const payloadFingerprint =
    typeof metadata.payloadFingerprint === "string" && metadata.payloadFingerprint.length > 0
      ? metadata.payloadFingerprint
      : createBackgroundJobPayloadFingerprint(payload);

  return {
    jobId: row.id,
    jobClass,
    jobKind: row.job_kind,
    status: row.status,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    payloadFingerprint,
    ...(normalizeBackgroundJobTimestamp(row.created_at)
      ? { createdAt: normalizeBackgroundJobTimestamp(row.created_at) }
      : {}),
    ...(normalizeBackgroundJobTimestamp(row.started_at)
      ? { startedAt: normalizeBackgroundJobTimestamp(row.started_at) }
      : {}),
    ...(normalizeBackgroundJobTimestamp(row.finished_at)
      ? { finishedAt: normalizeBackgroundJobTimestamp(row.finished_at) }
      : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(maxActions !== undefined ? { maxActions } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(maxFindings !== undefined ? { maxFindings } : {}),
    ...(affectedIds ? { affectedIds } : {}),
    ...(approvedFindings ? { approvedFindings } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    ...(includeValidatedProcedures !== undefined ? { includeValidatedProcedures } : {}),
  };
}

async function claimNextBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobRunNextInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobClaimedRecord | undefined> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");
    const allowedJobClasses =
      params.input.allowedJobClasses && params.input.allowedJobClasses.length > 0
        ? params.input.allowedJobClasses
        : [
            "proactive_plan",
            "proactive_execute_run_drift_check",
            "consolidation_plan",
            "consolidation_execute",
          ];

    const claimed = await client.query<BackgroundJobRow>(
      `
        with candidate as (
          select id
          from ${backgroundJobsTable}
          where job_kind = 'maintenance'
            and status = 'queued'
            and run_after <= now()
            and payload->>'jobClass' = any($2::text[])
            and ($1::uuid is null or project_id = $1::uuid)
          order by run_after asc, created_at asc, id asc
          for update skip locked
          limit 1
        )
        update ${backgroundJobsTable} as jobs
        set
          status = 'running',
          started_at = now(),
          attempts = jobs.attempts + 1,
          last_error = null
        from candidate
        where jobs.id = candidate.id
        returning
          jobs.id::text as id,
          jobs.project_id::text as project_id,
          jobs.session_id::text as session_id,
          jobs.agent_id::text as agent_id,
          jobs.job_kind,
          jobs.status,
          jobs.payload,
          jobs.run_after::text as run_after,
          jobs.attempts,
          jobs.max_attempts,
          jobs.metadata,
          jobs.created_at,
          jobs.started_at,
          jobs.finished_at,
          jobs.last_error
      `,
      [params.input.projectId ?? null, allowedJobClasses],
    );

    const claimedRow = claimed.rows[0];
    await client.query("commit");
    return claimedRow ? normalizeClaimedBackgroundJobRow(claimedRow) : undefined;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best-effort rollback only.
    }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function finalizeBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobFinalizeInput;
  logger: PluginLogger;
  schema: string;
}): Promise<void> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  await withConfiguredClient({
    config: params.config,
    async run(client) {
      await client.query(
        `
          update ${backgroundJobsTable}
          set
            status = $2,
            finished_at = now(),
            last_error = $3,
            metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
          where id = $1::uuid
        `,
        [
          params.input.jobId,
          params.input.status,
          params.input.lastError ?? null,
          JSON.stringify({
            lastRun: {
              status: params.input.status,
              ...(params.input.lastError ? { lastError: params.input.lastError } : {}),
              executionMetadata: params.input.executionMetadata,
            },
          }),
        ],
      );
    },
  });
}

async function selectConsolidationExecutionMemoryRows(params: {
  client: Client;
  schema: string;
  objectIds: string[];
}): Promise<ConsolidationExecutionMemoryRow[]> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const result = await params.client.query<ConsolidationExecutionMemoryRow>(
    `
      select
        id::text as id,
        project_id::text as project_id,
        memory_kind::text as memory_kind,
        review_state::text as review_state,
        metadata,
        created_at,
        superseded_at
      from ${memoryObjectsTable}
      where id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [params.objectIds],
  );
  return result.rows;
}

async function insertConsolidationSupersedeReview(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  reviewerAgentId?: string;
  rationale: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const result = await params.client.query<{ id: string }>(
    `
      insert into ${memoryReviewsTable} (
        memory_object_id,
        reviewer_agent_id,
        action,
        resulting_state,
        rationale,
        metadata
      )
      values ($1::uuid, $2::uuid, 'supersede', 'superseded', $3::text, $4::jsonb)
      returning id::text as id
    `,
    [
      params.memoryObjectId,
      params.reviewerAgentId ?? null,
      params.rationale,
      JSON.stringify(params.metadata),
    ],
  );
  const reviewId = result.rows[0]?.id;
  if (!reviewId) {
    throw new Error("consolidation execution did not return a review id");
  }
  return reviewId;
}

async function updateMemoryObjectToSuperseded(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  metadata: Record<string, unknown>;
  supersededAt: string;
}): Promise<void> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  await params.client.query(
    `
      update ${memoryObjectsTable}
      set
        review_state = 'superseded',
        superseded_at = coalesce(superseded_at, $2::timestamptz),
        metadata = metadata || $3::jsonb
      where id = $1::uuid
    `,
    [params.memoryObjectId, params.supersededAt, JSON.stringify(params.metadata)],
  );
}

async function ensureConsolidationSupersedesLink(params: {
  client: Client;
  schema: string;
  sourceMemoryObjectId: string;
  targetMemoryObjectId: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryLinksTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_links",
  });
  const existing = await params.client.query<{ id: string }>(
    `
      select id::text as id
      from ${memoryLinksTable}
      where source_memory_object_id = $1::uuid
        and target_memory_object_id = $2::uuid
        and link_kind = 'supersedes'
      limit 1
    `,
    [params.sourceMemoryObjectId, params.targetMemoryObjectId],
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    return existingId;
  }

  const inserted = await params.client.query<{ id: string }>(
    `
      insert into ${memoryLinksTable} (
        source_memory_object_id,
        target_memory_object_id,
        link_kind,
        metadata
      )
      values ($1::uuid, $2::uuid, 'supersedes', $3::jsonb)
      returning id::text as id
    `,
    [params.sourceMemoryObjectId, params.targetMemoryObjectId, JSON.stringify(params.metadata)],
  );
  const linkId = inserted.rows[0]?.id;
  if (!linkId) {
    throw new Error("consolidation execution did not return a memory link id");
  }
  return linkId;
}

function chooseCanonicalConsolidationSurvivor(
  rows: ConsolidationExecutionMemoryRow[],
): ConsolidationExecutionMemoryRow | undefined {
  return [...rows]
    .filter((row) => row.review_state === "approved")
    .sort((left, right) => {
      const createdAtDelta = Date.parse(left.created_at) - Date.parse(right.created_at);
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }
      return left.id.localeCompare(right.id);
    })[0];
}

async function executeDuplicateConsolidationSelection(params: {
  client: Client;
  schema: string;
  selection: ConsolidationExecuteSelection;
  reviewerAgentId?: string;
}): Promise<ConsolidationExecuteAction> {
  const rows = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: params.selection.affectedObjectIds,
  });

  if (rows.length !== params.selection.affectedObjectIds.length) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["duplicate execution requires all affected durable memory objects to exist"],
    };
  }

  if (rows.some((row) => row.memory_kind === "policy")) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["policy memory is out of scope for bounded consolidation execution"],
    };
  }

  const survivor = chooseCanonicalConsolidationSurvivor(rows);
  if (!survivor) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["duplicate execution requires at least one approved durable memory survivor"],
    };
  }

  const duplicates = rows.filter((row) => row.id !== survivor.id);
  const executableDuplicates = duplicates.filter(
    (row) => row.review_state === "approved" && row.superseded_at === null,
  );

  if (executableDuplicates.length === 0) {
    const duplicateRowsAlreadySuperseded =
      duplicates.length > 0 &&
      duplicates.every((row) => row.review_state === "superseded" || row.superseded_at !== null);
    return {
      actionType: params.selection.actionType,
      status: duplicateRowsAlreadySuperseded ? "already_executed" : "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: duplicates.map((row) => row.id).sort((a, b) => a.localeCompare(b)),
      survivorObjectId: survivor.id,
      reviewIds: [],
      linkIds: [],
      rationale: duplicateRowsAlreadySuperseded
        ? [
            "duplicate durable memory objects were already superseded in favor of the canonical survivor",
          ]
        : [
            "duplicate execution only supports approved durable memory objects that are not already superseded",
          ],
    };
  }

  const executedAt = new Date().toISOString();
  const supersededObjectIds: string[] = [];
  const reviewIds: string[] = [];
  const linkIds: string[] = [];

  for (const duplicate of executableDuplicates) {
    const reviewId = await insertConsolidationSupersedeReview({
      client: params.client,
      schema: params.schema,
      memoryObjectId: duplicate.id,
      reviewerAgentId: params.reviewerAgentId,
      rationale: "duplicate durable memory was superseded by bounded consolidation execution",
      metadata: {
        source: "memory-consolidation-execute-tool",
        actionType: "duplicate_merge_review",
        survivorObjectId: survivor.id,
        affectedObjectIds: params.selection.affectedObjectIds,
        executedAt,
      },
    });
    await updateMemoryObjectToSuperseded({
      client: params.client,
      schema: params.schema,
      memoryObjectId: duplicate.id,
      supersededAt: executedAt,
      metadata: {
        supersededByObjectId: survivor.id,
        lifecycleHint: "superseded",
        consolidationActionType: "duplicate_merge_review",
        consolidationExecutedAt: executedAt,
      },
    });
    const linkId = await ensureConsolidationSupersedesLink({
      client: params.client,
      schema: params.schema,
      sourceMemoryObjectId: duplicate.id,
      targetMemoryObjectId: survivor.id,
      metadata: {
        source: "memory-consolidation-execute-tool",
        actionType: "duplicate_merge_review",
        executedAt,
      },
    });
    supersededObjectIds.push(duplicate.id);
    reviewIds.push(reviewId);
    linkIds.push(linkId);
  }

  return {
    actionType: params.selection.actionType,
    status: "executed",
    affectedObjectIds: params.selection.affectedObjectIds,
    supersededObjectIds: supersededObjectIds.sort((a, b) => a.localeCompare(b)),
    survivorObjectId: survivor.id,
    reviewIds,
    linkIds,
    rationale: [
      "duplicate durable memory objects were conservatively superseded in favor of the canonical approved survivor",
    ],
  };
}

async function executeStaleSupersededConsolidationSelection(params: {
  client: Client;
  schema: string;
  selection: ConsolidationExecuteSelection;
  reviewerAgentId?: string;
}): Promise<ConsolidationExecuteAction> {
  if (params.selection.affectedObjectIds.length !== 1) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution currently supports exactly one durable memory object at a time",
      ],
    };
  }

  const sourceObjectId = params.selection.affectedObjectIds[0];
  const [sourceRow] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [sourceObjectId],
  });
  if (!sourceRow) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["stale or superseded execution requires the durable memory object to exist"],
    };
  }
  if (sourceRow.memory_kind === "policy") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["policy memory is out of scope for bounded consolidation execution"],
    };
  }

  const targetObjectId = normalizeMetadataString(
    sourceRow.metadata ?? undefined,
    "supersededByObjectId",
  );
  const targetProcedureId = normalizeMetadataString(
    sourceRow.metadata ?? undefined,
    "supersededByProcedureId",
  );
  if (!targetObjectId || targetProcedureId) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution currently requires metadata.supersededByObjectId and does not auto-resolve procedure-target supersession",
      ],
    };
  }

  const [targetRow] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [targetObjectId],
  });
  if (!targetRow || targetRow.memory_kind === "policy" || targetRow.review_state !== "approved") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution requires an existing approved durable memory target",
      ],
    };
  }

  if (sourceRow.review_state === "superseded" || sourceRow.superseded_at !== null) {
    return {
      actionType: params.selection.actionType,
      status:
        normalizeMetadataString(sourceRow.metadata ?? undefined, "supersededByObjectId") ===
        targetObjectId
          ? "already_executed"
          : "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [sourceObjectId],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale:
        normalizeMetadataString(sourceRow.metadata ?? undefined, "supersededByObjectId") ===
        targetObjectId
          ? ["stale durable memory was already superseded by the bounded target object"]
          : [
              "stale or superseded execution only supports approved durable memory that is not already superseded",
            ],
    };
  }

  if (sourceRow.review_state !== "approved") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale: ["stale or superseded execution only supports approved durable memory objects"],
    };
  }

  const executedAt = new Date().toISOString();
  const reviewId = await insertConsolidationSupersedeReview({
    client: params.client,
    schema: params.schema,
    memoryObjectId: sourceObjectId,
    reviewerAgentId: params.reviewerAgentId,
    rationale: "stale durable memory was superseded by bounded consolidation execution",
    metadata: {
      source: "memory-consolidation-execute-tool",
      actionType: "stale_superseded_review",
      survivorObjectId: targetObjectId,
      affectedObjectIds: params.selection.affectedObjectIds,
      executedAt,
    },
  });
  await updateMemoryObjectToSuperseded({
    client: params.client,
    schema: params.schema,
    memoryObjectId: sourceObjectId,
    supersededAt: executedAt,
    metadata: {
      supersededByObjectId: targetObjectId,
      lifecycleHint: "superseded",
      consolidationActionType: "stale_superseded_review",
      consolidationExecutedAt: executedAt,
    },
  });
  const linkId = await ensureConsolidationSupersedesLink({
    client: params.client,
    schema: params.schema,
    sourceMemoryObjectId: sourceObjectId,
    targetMemoryObjectId: targetObjectId,
    metadata: {
      source: "memory-consolidation-execute-tool",
      actionType: "stale_superseded_review",
      executedAt,
    },
  });

  return {
    actionType: params.selection.actionType,
    status: "executed",
    affectedObjectIds: params.selection.affectedObjectIds,
    supersededObjectIds: [sourceObjectId],
    survivorObjectId: targetObjectId,
    reviewIds: [reviewId],
    linkIds: [linkId],
    rationale: [
      "stale durable memory was conservatively superseded using its existing bounded supersededByObjectId metadata",
    ],
  };
}

async function executeConsolidationInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ConsolidationExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ConsolidationExecuteResult> {
  const executionMode = params.input.approvedFindings?.length
    ? "approved_subset"
    : "plan_all_eligible";
  const planResult = await planConsolidationInConfiguredDatabase({
    config: params.config,
    input: params.input,
    logger: params.logger,
    schema: params.schema,
  });

  if (!planResult.accepted) {
    if (planResult.status === "failed") {
      params.logger.error(`memory-middleware consolidation execution failed: ${planResult.reason}`);
    }
    return {
      accepted: false,
      status: planResult.status,
      reason: planResult.reason,
    };
  }

  const selectedFindings =
    executionMode === "approved_subset"
      ? params.input.approvedFindings!.map(normalizeConsolidationExecuteSelection)
      : planResult.findings.map((finding) =>
          normalizeConsolidationExecuteSelection({
            actionType: finding.actionType,
            affectedObjectIds: finding.affectedObjectIds,
          }),
        );

  if (selectedFindings.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      executionMode,
      reviewedFindingCount: 0,
      executedActionCount: 0,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
      actions: [],
      rationale: ["no bounded consolidation findings were selected for execution"],
    };
  }

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const actions: ConsolidationExecuteAction[] = [];

    for (const selection of selectedFindings) {
      switch (selection.actionType) {
        case "duplicate_merge_review":
          actions.push(
            await executeDuplicateConsolidationSelection({
              client,
              schema: params.schema,
              selection,
              reviewerAgentId: params.input.reviewerAgentId,
            }),
          );
          break;
        case "stale_superseded_review":
          actions.push(
            await executeStaleSupersededConsolidationSelection({
              client,
              schema: params.schema,
              selection,
              reviewerAgentId: params.input.reviewerAgentId,
            }),
          );
          break;
        case "contradiction_review":
        case "drift_check_review":
          actions.push({
            actionType: selection.actionType,
            status: "skipped_ineligible",
            affectedObjectIds: selection.affectedObjectIds,
            supersededObjectIds: [],
            reviewIds: [],
            linkIds: [],
            rationale: [
              `${selection.actionType} remains advisory-only in this bounded consolidation slice`,
            ],
          });
          break;
      }
    }

    const executedActionCount = actions.filter((action) => action.status === "executed").length;
    const alreadyExecutedCount = actions.filter(
      (action) => action.status === "already_executed",
    ).length;
    const skippedFindingCount = actions.filter(
      (action) => action.status === "skipped_ineligible",
    ).length;

    if (executedActionCount === 0) {
      await client.query("rollback");
      return {
        accepted: true,
        status:
          alreadyExecutedCount > 0 && skippedFindingCount === 0 ? "already_executed" : "no_op",
        executionMode,
        reviewedFindingCount: selectedFindings.length,
        executedActionCount,
        alreadyExecutedCount,
        skippedFindingCount,
        actions,
        rationale:
          alreadyExecutedCount > 0 && skippedFindingCount === 0
            ? [
                "selected consolidation findings had already been materialized by prior bounded execution",
              ]
            : ["selected consolidation findings were not eligible for bounded execution changes"],
      };
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware consolidation execution completed",
        `mode=${executionMode}`,
        `reviewedFindings=${String(selectedFindings.length)}`,
        `executedActions=${String(executedActionCount)}`,
        `alreadyExecuted=${String(alreadyExecutedCount)}`,
        `skipped=${String(skippedFindingCount)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "executed",
      executionMode,
      reviewedFindingCount: selectedFindings.length,
      executedActionCount,
      alreadyExecutedCount,
      skippedFindingCount,
      actions,
      rationale: [
        `${String(executedActionCount)} bounded consolidation action${executedActionCount === 1 ? "" : "s"} executed without touching contradiction or drift findings`,
      ],
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeConsolidationExecutionError(error);
    params.logger.error(`memory-middleware consolidation execution failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function normalizeBackgroundJobListLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 20;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return 20;
  }
  return Math.min(truncated, 100);
}

async function listBackgroundJobsInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobListInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobListResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    const rows = await client.query<BackgroundJobRow>(
      `
        select
          id::text as id,
          project_id::text as project_id,
          session_id::text as session_id,
          agent_id::text as agent_id,
          job_kind,
          status,
          payload,
          run_after::text as run_after,
          attempts,
          max_attempts,
          metadata,
          created_at,
          started_at,
          finished_at,
          last_error
        from ${backgroundJobsTable}
        where job_kind = 'maintenance'
          and ($1::uuid is null or project_id = $1::uuid)
          and ($2::text is null or status::text = $2::text)
          and ($3::text is null or payload->>'jobClass' = $3::text)
        order by created_at desc, id desc
        limit $4::int
      `,
      [
        params.input.projectId ?? null,
        params.input.status ?? null,
        params.input.jobClass ?? null,
        normalizeBackgroundJobListLimit(params.input.limit),
      ],
    );

    return {
      accepted: true,
      status: "ok",
      jobs: rows.rows.map(normalizeBackgroundJobRecordRow),
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job list failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function getBackgroundJobInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryBackgroundJobGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryBackgroundJobGetResult> {
  const backgroundJobsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "background_jobs",
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    const row = await client.query<BackgroundJobRow>(
      `
        select
          id::text as id,
          project_id::text as project_id,
          session_id::text as session_id,
          agent_id::text as agent_id,
          job_kind,
          status,
          payload,
          run_after::text as run_after,
          attempts,
          max_attempts,
          metadata,
          created_at,
          started_at,
          finished_at,
          last_error
        from ${backgroundJobsTable}
        where id = $1::uuid
          and job_kind = 'maintenance'
        limit 1
      `,
      [params.input.jobId],
    );
    const record = row.rows[0];
    if (!record) {
      return {
        accepted: false,
        status: "not_found",
        reason: "background job was not found",
      };
    }
    return {
      accepted: true,
      status: "ok",
      job: normalizeBackgroundJobRecordRow(record),
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware background job get failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function selectDriftCheckExecutionProcedureRows(params: {
  client: Client;
  schema: string;
  procedureIds: string[];
}): Promise<DriftCheckExecutionProcedureRow[]> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const result = await params.client.query<DriftCheckExecutionProcedureRow>(
    `
      select
        id::text as id,
        project_id::text as project_id,
        metadata,
        updated_at
      from ${proceduresTable}
      where id = any($1::uuid[])
      order by id asc
    `,
    [params.procedureIds],
  );
  return result.rows;
}

async function insertDriftCheckExecutionEvent(params: {
  client: Client;
  schema: string;
  projectId?: string;
  reviewerAgentId?: string;
  eventName: "memory_object.drift_check" | "procedure.drift_check";
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });
  const result = await params.client.query<{ id: string }>(
    `
      insert into ${memoryEventsTable} (
        project_id,
        agent_id,
        event_kind,
        event_name,
        payload,
        metadata
      )
      values ($1::uuid, $2::uuid, 'review', $3::text, $4::jsonb, $5::jsonb)
      returning id::text as id
    `,
    [
      params.projectId ?? null,
      params.reviewerAgentId ?? null,
      params.eventName,
      JSON.stringify(params.payload),
      JSON.stringify(params.metadata),
    ],
  );
  const eventId = result.rows[0]?.id;
  if (!eventId) {
    throw new Error("drift-check execution did not return an event id");
  }
  return eventId;
}

async function updateMemoryObjectDriftMetadata(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  await params.client.query(
    `
      update ${memoryObjectsTable}
      set metadata = metadata || $2::jsonb
      where id = $1::uuid
    `,
    [params.memoryObjectId, JSON.stringify(params.metadata)],
  );
}

async function updateProcedureDriftMetadata(params: {
  client: Client;
  schema: string;
  procedureId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  await params.client.query(
    `
      update ${proceduresTable}
      set metadata = metadata || $2::jsonb
      where id = $1::uuid
    `,
    [params.procedureId, JSON.stringify(params.metadata)],
  );
}

async function executeMemoryObjectDriftCheckSelection(params: {
  client: Client;
  schema: string;
  objectId: string;
  reviewerAgentId?: string;
}): Promise<DriftCheckExecuteAction> {
  const [row] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [params.objectId],
  });
  if (!row) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires the durable memory object to exist"],
    };
  }
  if (row.memory_kind === "policy") {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["policy memory is out of scope for bounded drift-check execution"],
    };
  }

  const driftCheckDueAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckDueAt");
  if (!driftCheckDueAt) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires bounded driftCheckDueAt metadata"],
    };
  }

  const dueAt = Date.parse(driftCheckDueAt);
  if (!Number.isFinite(dueAt) || dueAt > Date.now()) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt,
      rationale: ["drift-check execution requires an overdue bounded driftCheckDueAt timestamp"],
    };
  }

  const driftCheckedAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckedAt");
  if (driftCheckedAt) {
    const checkedAt = Date.parse(driftCheckedAt);
    if (Number.isFinite(checkedAt) && checkedAt >= dueAt) {
      return {
        actionType: "drift_check_review",
        status: "already_executed",
        affectedObjectId: params.objectId,
        affectedObjectType: "memory_object",
        driftCheckDueAt,
        driftCheckedAt,
        rationale: [
          "bounded drift-check metadata already records a check after the current due timestamp",
        ],
      };
    }
  }

  const executedAt = new Date().toISOString();
  const eventId = await insertDriftCheckExecutionEvent({
    client: params.client,
    schema: params.schema,
    projectId: row.project_id ?? undefined,
    reviewerAgentId: params.reviewerAgentId,
    eventName: "memory_object.drift_check",
    payload: {
      objectType: "memory_object",
      objectId: params.objectId,
      driftCheckDueAt,
      driftCheckedAt: executedAt,
      outcome: "review_recorded",
    },
    metadata: {
      source: "memory-drift-check-execute-tool",
      actionType: "drift_check_review",
    },
  });
  await updateMemoryObjectDriftMetadata({
    client: params.client,
    schema: params.schema,
    memoryObjectId: params.objectId,
    metadata: {
      driftCheckedAt: executedAt,
      driftCheckOutcome: "review_recorded",
      driftCheckEventId: eventId,
    },
  });

  return {
    actionType: "drift_check_review",
    status: "executed",
    affectedObjectId: params.objectId,
    affectedObjectType: "memory_object",
    driftCheckDueAt,
    driftCheckedAt: executedAt,
    eventId,
    rationale: ["overdue durable memory drift check was recorded without rewriting stored content"],
  };
}

async function executeProcedureDriftCheckSelection(params: {
  client: Client;
  schema: string;
  procedureId: string;
  reviewerAgentId?: string;
}): Promise<DriftCheckExecuteAction> {
  const [row] = await selectDriftCheckExecutionProcedureRows({
    client: params.client,
    schema: params.schema,
    procedureIds: [params.procedureId],
  });
  if (!row) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires the validated procedure to exist"],
    };
  }

  const driftCheckDueAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckDueAt");
  if (!driftCheckDueAt) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires bounded driftCheckDueAt metadata"],
    };
  }

  const dueAt = Date.parse(driftCheckDueAt);
  if (!Number.isFinite(dueAt) || dueAt > Date.now()) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt,
      rationale: ["drift-check execution requires an overdue bounded driftCheckDueAt timestamp"],
    };
  }

  const driftCheckedAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckedAt");
  if (driftCheckedAt) {
    const checkedAt = Date.parse(driftCheckedAt);
    if (Number.isFinite(checkedAt) && checkedAt >= dueAt) {
      return {
        actionType: "drift_check_review",
        status: "already_executed",
        affectedObjectId: params.procedureId,
        affectedObjectType: "procedure",
        driftCheckDueAt,
        driftCheckedAt,
        rationale: [
          "bounded procedure drift-check metadata already records a check after the current due timestamp",
        ],
      };
    }
  }

  const executedAt = new Date().toISOString();
  const eventId = await insertDriftCheckExecutionEvent({
    client: params.client,
    schema: params.schema,
    projectId: row.project_id ?? undefined,
    reviewerAgentId: params.reviewerAgentId,
    eventName: "procedure.drift_check",
    payload: {
      objectType: "procedure",
      objectId: params.procedureId,
      driftCheckDueAt,
      driftCheckedAt: executedAt,
      outcome: "review_recorded",
    },
    metadata: {
      source: "memory-drift-check-execute-tool",
      actionType: "drift_check_review",
    },
  });
  await updateProcedureDriftMetadata({
    client: params.client,
    schema: params.schema,
    procedureId: params.procedureId,
    metadata: {
      driftCheckedAt: executedAt,
      driftCheckOutcome: "review_recorded",
      driftCheckEventId: eventId,
    },
  });

  return {
    actionType: "drift_check_review",
    status: "executed",
    affectedObjectId: params.procedureId,
    affectedObjectType: "procedure",
    driftCheckDueAt,
    driftCheckedAt: executedAt,
    eventId,
    rationale: [
      "overdue validated-procedure drift check was recorded without rewriting stored procedure content",
    ],
  };
}

async function executeDriftCheckInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: DriftCheckExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<DriftCheckExecuteResult> {
  const executionMode = params.input.approvedFindings?.length
    ? "approved_subset"
    : "plan_all_eligible";
  const planResult = await planConsolidationInConfiguredDatabase({
    config: params.config,
    input: params.input,
    logger: params.logger,
    schema: params.schema,
  });

  if (!planResult.accepted) {
    if (planResult.status === "failed") {
      params.logger.error(`memory-middleware drift-check execution failed: ${planResult.reason}`);
    }
    return {
      accepted: false,
      status: planResult.status,
      reason: planResult.reason,
    };
  }

  const selectedFindings =
    executionMode === "approved_subset"
      ? params.input.approvedFindings!.map(normalizeDriftCheckExecuteSelection)
      : planResult.findings
          .filter((finding) => finding.actionType === "drift_check_review")
          .map((finding) =>
            normalizeDriftCheckExecuteSelection({
              actionType: "drift_check_review",
              affectedObjectIds: finding.affectedObjectIds,
            }),
          );

  if (selectedFindings.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      executionMode,
      reviewedFindingCount: 0,
      executedActionCount: 0,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
      actions: [],
      rationale: ["no bounded drift-check findings were selected for execution"],
    };
  }

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const actions: DriftCheckExecuteAction[] = [];
    for (const selection of selectedFindings) {
      if (selection.affectedObjectIds.length !== 1) {
        actions.push({
          actionType: "drift_check_review",
          status: "skipped_ineligible",
          affectedObjectId: selection.affectedObjectIds[0] ?? "",
          affectedObjectType: "memory_object",
          driftCheckDueAt: "",
          rationale: [
            "bounded drift-check execution currently supports exactly one object id per finding",
          ],
        });
        continue;
      }

      const targetId = selection.affectedObjectIds[0];
      const memoryRows = await selectConsolidationExecutionMemoryRows({
        client,
        schema: params.schema,
        objectIds: [targetId],
      });
      if (memoryRows.length > 0) {
        actions.push(
          await executeMemoryObjectDriftCheckSelection({
            client,
            schema: params.schema,
            objectId: targetId,
            reviewerAgentId: params.input.reviewerAgentId,
          }),
        );
        continue;
      }

      actions.push(
        await executeProcedureDriftCheckSelection({
          client,
          schema: params.schema,
          procedureId: targetId,
          reviewerAgentId: params.input.reviewerAgentId,
        }),
      );
    }

    const executedActionCount = actions.filter((action) => action.status === "executed").length;
    const alreadyExecutedCount = actions.filter(
      (action) => action.status === "already_executed",
    ).length;
    const skippedFindingCount = actions.filter(
      (action) => action.status === "skipped_ineligible",
    ).length;

    if (executedActionCount === 0) {
      await client.query("rollback");
      return {
        accepted: true,
        status:
          alreadyExecutedCount > 0 && skippedFindingCount === 0 ? "already_executed" : "no_op",
        executionMode,
        reviewedFindingCount: selectedFindings.length,
        executedActionCount,
        alreadyExecutedCount,
        skippedFindingCount,
        actions,
        rationale:
          alreadyExecutedCount > 0 && skippedFindingCount === 0
            ? [
                "selected drift-check findings had already been materialized by prior bounded execution",
              ]
            : ["selected drift-check findings were not eligible for bounded execution changes"],
      };
    }

    await client.query("commit");
    params.logger.debug?.(
      [
        "memory-middleware drift-check execution completed",
        `mode=${executionMode}`,
        `reviewedFindings=${String(selectedFindings.length)}`,
        `executedActions=${String(executedActionCount)}`,
        `alreadyExecuted=${String(alreadyExecutedCount)}`,
        `skipped=${String(skippedFindingCount)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "executed",
      executionMode,
      reviewedFindingCount: selectedFindings.length,
      executedActionCount,
      alreadyExecutedCount,
      skippedFindingCount,
      actions,
      rationale: [
        `${String(executedActionCount)} bounded drift-check action${executedActionCount === 1 ? "" : "s"} recorded without rewriting stored facts`,
      ],
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeDriftCheckExecutionError(error);
    params.logger.error(`memory-middleware drift-check execution failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function selectApprovedMemorySurfaceById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedMemoryObjectRow | null> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'approved_memory_view'::text as read_surface,
        id::text as id,
        memory_kind::text as memory_kind,
        'approved'::text as review_state,
        content,
        project_id::text as project_id,
        agent_id::text as agent_id,
        session_id::text as session_id,
        null::text as source_event_id,
        metadata,
        created_at::text as created_at,
        updated_at::text as updated_at
      from ${approvedMemoryView}
      where id = $1::uuid
      limit 1
    `,
    [params.objectId],
  );
  return result.rows[0] ?? null;
}

async function selectReviewableCandidateSurfaceById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedMemoryObjectRow | null> {
  const reviewableCandidatesView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_reviewable_candidates_v",
  });
  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'reviewable_candidates_view'::text as read_surface,
        id::text as id,
        memory_kind::text as memory_kind,
        review_state::text as review_state,
        content,
        project_id::text as project_id,
        agent_id::text as agent_id,
        session_id::text as session_id,
        null::text as source_event_id,
        metadata,
        created_at::text as created_at,
        updated_at::text as updated_at
      from ${reviewableCandidatesView}
      where id = $1::uuid
        and review_state = 'candidate'
      limit 1
    `,
    [params.objectId],
  );
  return result.rows[0] ?? null;
}

async function listApprovedMemorySurfaceRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const conditions = ["true"];
  conditions.push(buildApprovedMemoryArtifactVisibilityCondition("v"));
  const values: unknown[] = [];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }
  if (params.input.agentId) {
    values.push(params.input.agentId);
    conditions.push(`v.agent_id = $${values.length}::uuid`);
  }
  if (params.input.sessionId) {
    values.push(params.input.sessionId);
    conditions.push(`v.session_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectListLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'approved_memory_view'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        'approved'::text as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${approvedMemoryView} v
      where ${conditions.join("\n        and ")}
      order by v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );
  return result.rows;
}

async function listReviewableCandidateSurfaceRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  const reviewableCandidatesView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_reviewable_candidates_v",
  });
  const conditions = ["review_state = 'candidate'"];
  const values: unknown[] = [];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`project_id = $${values.length}::uuid`);
  }
  if (params.input.agentId) {
    values.push(params.input.agentId);
    conditions.push(`agent_id = $${values.length}::uuid`);
  }
  if (params.input.sessionId) {
    values.push(params.input.sessionId);
    conditions.push(`session_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectListLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'reviewable_candidates_view'::text as read_surface,
        id::text as id,
        memory_kind::text as memory_kind,
        review_state::text as review_state,
        content,
        project_id::text as project_id,
        agent_id::text as agent_id,
        session_id::text as session_id,
        null::text as source_event_id,
        metadata,
        created_at::text as created_at,
        updated_at::text as updated_at
      from ${reviewableCandidatesView}
      where ${conditions.join("\n        and ")}
      order by updated_at desc
      limit $${values.length}::int
    `,
    values,
  );
  return result.rows;
}

async function selectMemoryObjectById(params: {
  client: Client;
  schema: string;
  objectId: string;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow | null> {
  if (scopeIncludesCandidates(params.scope)) {
    const reviewableCandidate = await selectReviewableCandidateSurfaceById(params);
    if (reviewableCandidate) {
      return reviewableCandidate;
    }
  }

  return selectApprovedMemorySurfaceById(params);
}

async function selectValidatedProcedureById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedProcedureRow | null> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where p.id = $1::uuid
        and p.status = 'validated'
      limit 1
    `,
    [params.objectId],
  );

  return result.rows[0] ?? null;
}

async function listMemoryObjectRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approved = await listApprovedMemorySurfaceRows(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await listReviewableCandidateSurfaceRows(params)
    : [];
  return sortRetrievedRowsByUpdatedAtDesc([...approved, ...reviewableCandidates]);
}

async function listValidatedProcedureRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedProcedureRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const conditions = ["p.status::text = 'validated'"];
  const values: unknown[] = [];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectListLimit(params.input.limit));

  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchApprovedMemorySurfaceRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const conditions = [
    `(mo.search_document @@ websearch_to_tsquery('english', $1::text) or ${combinedTextExpression} like lower($2::text))`,
    buildApprovedMemoryArtifactVisibilityCondition("v"),
  ];
  const values: unknown[] = [params.input.query, `%${params.input.query}%`];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'approved_memory_view'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        'approved'::text as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${approvedMemoryView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchReviewableCandidateSurfaceRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  const reviewableCandidatesView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_reviewable_candidates_v",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const conditions = [
    "v.review_state = 'candidate'",
    `(mo.search_document @@ websearch_to_tsquery('english', $1::text) or ${combinedTextExpression} like lower($2::text))`,
  ];
  const values: unknown[] = [params.input.query, `%${params.input.query}%`];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        'reviewable_candidates_view'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        v.review_state::text as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${reviewableCandidatesView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchMemoryObjectRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approved = await searchApprovedMemorySurfaceRowsBasic(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await searchReviewableCandidateSurfaceRowsBasic(params)
    : [];
  return sortRetrievedRowsByUpdatedAtDesc([...approved, ...reviewableCandidates]);
}

async function searchValidatedProcedureRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedProcedureRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const conditions = [
    "p.status::text = 'validated'",
    "(p.search_document @@ websearch_to_tsquery('english', $1::text) or lower(coalesce(p.title, '') || ' ' || coalesce(p.body, '')) like lower($2::text))",
  ];
  const values: unknown[] = [params.input.query, `%${params.input.query}%`];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchApprovedMemorySurfaceRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedMemoryObjectSearchRow[]> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const autoCaptureTemplateExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'template',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'template',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureFieldKeyExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'fieldKey',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',",
    "v.metadata->'autoPromotion'->>'fieldKey',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureLessonKeyExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'lessonKey',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'lessonKey',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'lessonKey',",
    "v.metadata->'autoPromotion'->>'lessonKey',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureLessonFamilyExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'lessonFamily',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'lessonFamily',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'lessonFamily',",
    "v.metadata->'autoPromotion'->>'lessonFamily',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureGuidancePatternExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'guidancePattern',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'guidancePattern',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'guidancePattern',",
    "v.metadata->'autoPromotion'->>'guidancePattern',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureNormalizedSubjectExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'normalizedSubject',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'normalizedSubject',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'normalizedSubject',",
    "v.metadata->'autoPromotion'->>'normalizedSubject',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureNormalizedProjectScopeExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'normalizedProjectScope',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'normalizedProjectScope',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'normalizedProjectScope',",
    "v.metadata->'autoPromotion'->>'normalizedProjectScope',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureNormalizedRecommendedActionExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'normalizedRecommendedAction',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'normalizedRecommendedAction',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'normalizedRecommendedAction',",
    "v.metadata->'autoPromotion'->>'normalizedRecommendedAction',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureNormalizedAvoidActionExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'normalizedAvoidAction',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'normalizedAvoidAction',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'normalizedAvoidAction',",
    "v.metadata->'autoPromotion'->>'normalizedAvoidAction',",
    "''",
    ")",
  ].join(" ");
  const responseStyleHint =
    params.input.kind === "project" || params.input.kind === "procedure"
      ? null
      : inferResponseStyleQueryHint(params.input.query);
  const projectFactHint =
    params.input.kind === "project" ? inferProjectFactQueryHint(params.input.query) : null;
  const workflowImprovementHint =
    params.input.kind === "project" ? inferWorkflowImprovementQueryHint(params.input.query) : null;
  const normalizedQuery = normalizeRetrievalQuery(params.input.query);
  const generalizedWorkflowPatternHint =
    params.input.kind === "project"
      ? inferGeneralizedWorkflowGuidancePatternHint(params.input.query)
      : "";
  const conditions = [
    `(
      mo.search_document @@ websearch_to_tsquery('english', $1::text)
      or ${combinedTextExpression} like lower($2::text)
      or similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
    )`,
    buildApprovedMemoryArtifactVisibilityCondition("v"),
  ];
  const values: unknown[] = [
    params.input.query,
    `${params.input.query}%`,
    responseStyleHint?.template ?? "",
    projectFactHint?.fieldKey ?? "",
    workflowImprovementHint?.lessonKey ?? "",
    normalizedQuery,
    generalizedWorkflowPatternHint,
  ];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RankedMemoryObjectSearchRow>(
    `
      select
        'memory_object'::text as object_type,
        'approved_memory_view'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        'approved'::text as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at,
        (
          case when lower(coalesce(v.title, '')) = lower($1::text) then 140 else 0 end
          + case when ${combinedTextExpression} = lower($1::text) then 120 else 0 end
          + case when lower(coalesce(v.title, '')) like lower($2::text) then 110 else 0 end
          + case when ${combinedTextExpression} like lower($2::text) then 90 else 0 end
          + case when $3::text <> '' and ${autoCaptureTemplateExpression} = $3::text then 135 else 0 end
          + case when $4::text <> '' and ${autoCaptureFieldKeyExpression} = $4::text then 220 else 0 end
          + case when $5::text <> '' and ${autoCaptureLessonKeyExpression} = $5::text then 185 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
              and ${autoCaptureNormalizedSubjectExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedSubjectExpression} || '%'
            then 170 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
              and ${autoCaptureNormalizedProjectScopeExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedProjectScopeExpression} || '%'
            then 210 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
              and ${autoCaptureNormalizedSubjectExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedSubjectExpression} || '%'
            then 165 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
              and ${autoCaptureNormalizedRecommendedActionExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedRecommendedActionExpression} || '%'
            then 95 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
              and ${autoCaptureNormalizedRecommendedActionExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedRecommendedActionExpression} || '%'
            then 95 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
              and ${autoCaptureNormalizedAvoidActionExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedAvoidActionExpression} || '%'
            then 90 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
              and ${autoCaptureNormalizedAvoidActionExpression} <> ''
              and $6::text like '%' || ${autoCaptureNormalizedAvoidActionExpression} || '%'
            then 90 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
              and $7::text <> ''
              and ${autoCaptureGuidancePatternExpression} = $7::text
            then 40 else 0 end
          + case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
              and $7::text <> ''
              and ${autoCaptureGuidancePatternExpression} = $7::text
            then 40 else 0 end
          + (ts_rank_cd(mo.search_document, websearch_to_tsquery('english', $1::text)) * 100.0)
          + (similarity(${combinedTextExpression}, lower($1::text)) * 40.0)
        )::float8 as score,
        array_remove(
          array[
            case when lower(coalesce(v.title, '')) = lower($1::text) then 'title_exact' end,
            case when ${combinedTextExpression} = lower($1::text) then 'content_exact' end,
            case when lower(coalesce(v.title, '')) like lower($2::text) then 'title_prefix' end,
            case when ${combinedTextExpression} like lower($2::text) then 'content_prefix' end,
            case when $3::text <> '' and ${autoCaptureTemplateExpression} = $3::text
              then 'auto_capture_template_match'
            end,
            case when $4::text <> '' and ${autoCaptureFieldKeyExpression} = $4::text
              then 'auto_capture_field_match'
            end,
            case when $5::text <> '' and ${autoCaptureLessonKeyExpression} = $5::text
              then 'auto_capture_lesson_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
                and ${autoCaptureNormalizedSubjectExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedSubjectExpression} || '%'
              then 'generalized_subject_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
                and ${autoCaptureNormalizedProjectScopeExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedProjectScopeExpression} || '%'
              then 'project_rule_scope_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
                and ${autoCaptureNormalizedSubjectExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedSubjectExpression} || '%'
              then 'project_rule_subject_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
                and ${autoCaptureNormalizedRecommendedActionExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedRecommendedActionExpression} || '%'
              then 'generalized_recommended_action_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
                and ${autoCaptureNormalizedRecommendedActionExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedRecommendedActionExpression} || '%'
              then 'project_rule_recommended_action_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
                and ${autoCaptureNormalizedAvoidActionExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedAvoidActionExpression} || '%'
              then 'generalized_avoid_action_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
                and ${autoCaptureNormalizedAvoidActionExpression} <> ''
                and $6::text like '%' || ${autoCaptureNormalizedAvoidActionExpression} || '%'
              then 'project_rule_avoid_action_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_workflow_lesson'
                and $7::text <> ''
                and ${autoCaptureGuidancePatternExpression} = $7::text
              then 'generalized_guidance_pattern_match'
            end,
            case when ${autoCaptureLessonFamilyExpression} = 'generalized_project_rule'
                and $7::text <> ''
                and ${autoCaptureGuidancePatternExpression} = $7::text
              then 'project_rule_guidance_pattern_match'
            end,
            case when mo.search_document @@ websearch_to_tsquery('english', $1::text)
              then 'fts_search_document'
            end,
            case when similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
              then 'trigram_similarity'
            end
          ],
          null
        )::text[] as matched_fields
      from ${approvedMemoryView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by score desc, v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchReviewableCandidateSurfaceRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedMemoryObjectSearchRow[]> {
  const reviewableCandidatesView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_reviewable_candidates_v",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const autoCaptureTemplateExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'template',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'template',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureFieldKeyExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'fieldKey',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',",
    "v.metadata->'autoPromotion'->>'fieldKey',",
    "''",
    ")",
  ].join(" ");
  const autoCaptureLessonKeyExpression = [
    "coalesce(",
    "v.metadata->'autoCapture'->>'lessonKey',",
    "v.metadata->'candidateMetadata'->'autoCapture'->>'lessonKey',",
    "v.metadata->'promotionMetadata'->'autoPromotion'->>'lessonKey',",
    "v.metadata->'autoPromotion'->>'lessonKey',",
    "''",
    ")",
  ].join(" ");
  const responseStyleHint =
    params.input.kind === "project" || params.input.kind === "procedure"
      ? null
      : inferResponseStyleQueryHint(params.input.query);
  const projectFactHint =
    params.input.kind === "project" ? inferProjectFactQueryHint(params.input.query) : null;
  const workflowImprovementHint =
    params.input.kind === "project" ? inferWorkflowImprovementQueryHint(params.input.query) : null;
  const conditions = [
    "v.review_state = 'candidate'",
    `(
      mo.search_document @@ websearch_to_tsquery('english', $1::text)
      or ${combinedTextExpression} like lower($2::text)
      or similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
    )`,
  ];
  const values: unknown[] = [
    params.input.query,
    `${params.input.query}%`,
    responseStyleHint?.template ?? "",
    projectFactHint?.fieldKey ?? "",
    workflowImprovementHint?.lessonKey ?? "",
  ];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RankedMemoryObjectSearchRow>(
    `
      select
        'memory_object'::text as object_type,
        'reviewable_candidates_view'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        v.review_state::text as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at,
        (
          case when lower(coalesce(v.title, '')) = lower($1::text) then 140 else 0 end
          + case when ${combinedTextExpression} = lower($1::text) then 120 else 0 end
          + case when lower(coalesce(v.title, '')) like lower($2::text) then 110 else 0 end
          + case when ${combinedTextExpression} like lower($2::text) then 90 else 0 end
          + case when $3::text <> '' and ${autoCaptureTemplateExpression} = $3::text then 135 else 0 end
          + case when $4::text <> '' and ${autoCaptureFieldKeyExpression} = $4::text then 220 else 0 end
          + case when $5::text <> '' and ${autoCaptureLessonKeyExpression} = $5::text then 185 else 0 end
          + (ts_rank_cd(mo.search_document, websearch_to_tsquery('english', $1::text)) * 100.0)
          + (similarity(${combinedTextExpression}, lower($1::text)) * 40.0)
        )::float8 as score,
        array_remove(
          array[
            case when lower(coalesce(v.title, '')) = lower($1::text) then 'title_exact' end,
            case when ${combinedTextExpression} = lower($1::text) then 'content_exact' end,
            case when lower(coalesce(v.title, '')) like lower($2::text) then 'title_prefix' end,
            case when ${combinedTextExpression} like lower($2::text) then 'content_prefix' end,
            case when $3::text <> '' and ${autoCaptureTemplateExpression} = $3::text
              then 'auto_capture_template_match'
            end,
            case when $4::text <> '' and ${autoCaptureFieldKeyExpression} = $4::text
              then 'auto_capture_field_match'
            end,
            case when $5::text <> '' and ${autoCaptureLessonKeyExpression} = $5::text
              then 'auto_capture_lesson_match'
            end,
            case when mo.search_document @@ websearch_to_tsquery('english', $1::text)
              then 'fts_search_document'
            end,
            case when similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
              then 'trigram_similarity'
            end
          ],
          null
        )::text[] as matched_fields
      from ${reviewableCandidatesView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by score desc, v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchMemoryObjectRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
  scope: MemoryObjectSearchScope;
}): Promise<RankedMemoryObjectSearchRow[]> {
  const approved = await searchApprovedMemorySurfaceRowsHybrid(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await searchReviewableCandidateSurfaceRowsHybrid(params)
    : [];
  return [...approved, ...reviewableCandidates].sort(
    (left, right) =>
      right.score - left.score || Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

async function searchValidatedProcedureRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedProcedureSearchRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const combinedTextExpression = "lower(coalesce(p.title, '') || ' ' || coalesce(p.body, ''))";
  const procedureKeyExpression = [
    "coalesce(",
    "p.metadata->'autoPromotion'->>'procedureKey',",
    "p.metadata->'candidateMetadata'->'autoCapture'->>'procedureKey',",
    "p.metadata->'promotionMetadata'->'autoPromotion'->>'procedureKey',",
    "''",
    ")",
  ].join(" ");
  const procedureHint = inferRecurringProcedureQueryHint(params.input.query);
  const conditions = [
    "p.status::text = 'validated'",
    `(
      p.search_document @@ websearch_to_tsquery('english', $1::text)
      or ${combinedTextExpression} like lower($2::text)
      or similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
      or ($3::text <> '' and ${procedureKeyExpression} = $3::text)
    )`,
  ];
  const values: unknown[] = [
    params.input.query,
    `${params.input.query}%`,
    procedureHint?.procedureKey ?? "",
  ];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RankedProcedureSearchRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at,
        greatest(
          case when lower(p.title) = lower($1::text) then 160 else 0 end,
          case when lower(p.title) like lower($2::text) then 130 else 0 end,
          case when $3::text <> '' and ${procedureKeyExpression} = $3::text then 220 else 0 end,
          (ts_rank_cd(p.search_document, websearch_to_tsquery('english', $1::text)) * 110.0),
          (similarity(${combinedTextExpression}, lower($1::text)) * 45.0)
        )::float8 as score,
        array_remove(
          array[
            case when lower(p.title) = lower($1::text) then 'title_exact' end,
            case when lower(p.title) like lower($2::text) then 'title_prefix' end,
            case when $3::text <> '' and ${procedureKeyExpression} = $3::text
              then 'procedure_key_match'
            end,
            case when p.search_document @@ websearch_to_tsquery('english', $1::text)
              then 'fts_search_document'
            end,
            case when similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
              then 'trigram_similarity'
            end
          ],
          null
        )::text[] as matched_fields
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by score desc, p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

function serializeVectorLiteral(values: number[]): string {
  if (values.length === 0) {
    throw new Error("semantic embedding query vector must not be empty");
  }

  return `[${values.join(",")}]`;
}

async function searchApprovedMemorySurfaceRowsSemantic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchSemanticInput;
}): Promise<SemanticMemoryObjectSearchRow[]> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const memoryEmbeddingsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_embeddings",
  });
  const conditions = [
    "me.embedding is not null",
    "me.embedding_model = $2::text",
    "me.embedding_version = $3::text",
    buildApprovedMemoryArtifactVisibilityCondition("v"),
  ];
  const values: unknown[] = [
    serializeVectorLiteral(params.input.embedding),
    params.input.embeddingModel,
    params.input.embeddingVersion,
  ];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<SemanticMemoryObjectSearchRow>(
    `
      with ranked as (
        select
          'memory_object'::text as object_type,
          'approved_memory_view'::text as read_surface,
          v.id::text as id,
          v.memory_kind::text as memory_kind,
          'approved'::text as review_state,
          v.content,
          v.project_id::text as project_id,
          v.agent_id::text as agent_id,
          v.session_id::text as session_id,
          null::text as source_event_id,
          v.metadata,
          v.created_at::text as created_at,
          v.updated_at::text as updated_at,
          me.embedding_model,
          me.embedding_version,
          me.chunk_index,
          (me.embedding <=> $1::vector)::float8 as distance
        from ${approvedMemoryView} v
        inner join ${memoryEmbeddingsTable} me
          on me.memory_object_id = v.id
        where ${conditions.join("\n          and ")}
      ),
      deduped as (
        select distinct on (id)
          object_type,
          read_surface,
          id,
          memory_kind,
          review_state,
          content,
          project_id,
          agent_id,
          session_id,
          source_event_id,
          metadata,
          created_at,
          updated_at,
          embedding_model,
          embedding_version,
          chunk_index,
          distance
        from ranked
        order by id, distance asc, updated_at desc
      )
      select
        object_type,
        read_surface,
        id,
        memory_kind,
        review_state,
        content,
        project_id,
        agent_id,
        session_id,
        source_event_id,
        metadata,
        created_at,
        updated_at,
        embedding_model,
        embedding_version,
        chunk_index,
        distance,
        (1.0 / (1.0 + distance))::float8 as score,
        array['semantic_embedding']::text[] as matched_fields
      from deduped
      order by score desc, updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchValidatedProcedureRowsSemantic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchSemanticInput;
}): Promise<SemanticProcedureSearchRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEmbeddingsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_embeddings",
  });
  const conditions = [
    "p.status::text = 'validated'",
    "p.source_memory_object_id is not null",
    "me.embedding is not null",
    "me.embedding_model = $2::text",
    "me.embedding_version = $3::text",
  ];
  const values: unknown[] = [
    serializeVectorLiteral(params.input.embedding),
    params.input.embeddingModel,
    params.input.embeddingVersion,
  ];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<SemanticProcedureSearchRow>(
    `
      with ranked as (
        select
          'procedure'::text as object_type,
          'validated_procedure_read_model'::text as read_surface,
          p.id::text as id,
          p.status::text as status,
          p.title,
          p.body,
          p.project_id::text as project_id,
          p.source_memory_object_id::text as source_memory_object_id,
          p.metadata->>'sourceCandidateId' as source_candidate_id,
          vr.id::text as latest_validation_run_id,
          vr.outcome::text as latest_validation_run_outcome,
          p.metadata,
          p.created_at::text as created_at,
          p.updated_at::text as updated_at,
          me.embedding_model,
          me.embedding_version,
          me.chunk_index,
          (me.embedding <=> $1::vector)::float8 as distance
        from ${proceduresTable} p
        inner join ${memoryEmbeddingsTable} me
          on me.memory_object_id = p.source_memory_object_id
        left join lateral (
          select id, outcome
          from ${procedureRunsTable}
          where procedure_id = p.id
          order by created_at desc
          limit 1
        ) vr on true
        where ${conditions.join("\n          and ")}
      ),
      deduped as (
        select distinct on (id)
          object_type,
          read_surface,
          id,
          status,
          title,
          body,
          project_id,
          source_memory_object_id,
          source_candidate_id,
          latest_validation_run_id,
          latest_validation_run_outcome,
          metadata,
          created_at,
          updated_at,
          embedding_model,
          embedding_version,
          chunk_index,
          distance
        from ranked
        order by id, distance asc, updated_at desc
      )
      select
        object_type,
        read_surface,
        id,
        status,
        title,
        body,
        project_id,
        source_memory_object_id,
        source_candidate_id,
        latest_validation_run_id,
        latest_validation_run_outcome,
        metadata,
        created_at,
        updated_at,
        embedding_model,
        embedding_version,
        chunk_index,
        distance,
        (1.0 / (1.0 + distance))::float8 as score,
        array['semantic_embedding']::text[] as matched_fields
      from deduped
      order by score desc, updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

function sortRetrievedRecordsByUpdatedAtDesc<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

function sortRankedRetrievedRecords<T extends { updatedAt: string; score: number }>(
  records: T[],
): T[] {
  return [...records].sort(
    (left, right) =>
      right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

function sortRetrievedRowsByUpdatedAtDesc<T extends { updated_at: string }>(records: T[]): T[] {
  return [...records].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

async function getMemoryObjectInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectGetResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const result = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObject = await selectMemoryObjectById({
          client,
          schema: params.schema,
          objectId: params.input.objectId,
          scope,
        });
        if (memoryObject) {
          return {
            record: normalizeMemoryObjectRecord(memoryObject),
          } as const;
        }
        if (!scopeIncludesValidatedProcedures(scope)) {
          return null;
        }
        const procedure = await selectValidatedProcedureById({
          client,
          schema: params.schema,
          objectId: params.input.objectId,
        });
        return procedure ? ({ record: normalizeProcedureObjectRecord(procedure) } as const) : null;
      },
    });

    if (!result) {
      return {
        accepted: false,
        status: "not_found",
        reason: "memory object not found in requested retrieval scope",
      };
    }

    params.logger.debug?.(
      [
        "memory-middleware memory object get completed",
        `objectId=${params.input.objectId}`,
        `objectType=${result.record.objectType}`,
        `scope=${scope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      record: result.record,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object get failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function listMemoryObjectsInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectListInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectListResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await listMemoryObjectRows({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return retrieved;
        }
        const procedures = await listValidatedProcedureRows({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRetrievedRecordsByUpdatedAtDesc([
          ...retrieved,
          ...procedures.map(normalizeProcedureObjectRecord),
        ]);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object list completed",
        `scope=${scope}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object list failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function searchMemoryObjectsBasicInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchBasicInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchBasicResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await searchMemoryObjectRowsBasic({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return retrieved;
        }
        const procedures = await searchValidatedProcedureRowsBasic({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRetrievedRecordsByUpdatedAtDesc([
          ...retrieved,
          ...procedures.map(normalizeProcedureObjectRecord),
        ]);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object basic search completed",
        `scope=${scope}`,
        `query=${params.input.query}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      query: params.input.query,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object basic search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function searchMemoryObjectsHybridInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchHybridInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchHybridResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await searchMemoryObjectRowsHybrid({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeRankedMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return sortRankedRetrievedRecords(retrieved);
        }
        const procedures = await searchValidatedProcedureRowsHybrid({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRankedRetrievedRecords([
          ...retrieved,
          ...procedures.map(normalizeRankedProcedureObjectRecord),
        ]);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object hybrid search completed",
        `scope=${scope}`,
        `query=${params.input.query}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      query: params.input.query,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object hybrid search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function searchMemoryObjectsSemanticInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchSemanticInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchSemanticResult> {
  const scope = normalizeMemoryObjectSemanticScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const approved = await searchApprovedMemorySurfaceRowsSemantic({
          client,
          schema: params.schema,
          input: params.input,
        });
        const retrieved = approved.map(normalizeSemanticMemoryObjectRecord);
        if (scope !== "include_validated_procedures") {
          return retrieved;
        }
        const procedures = await searchValidatedProcedureRowsSemantic({
          client,
          schema: params.schema,
          input: params.input,
        });
        return [...retrieved, ...procedures.map(normalizeSemanticProcedureObjectRecord)].sort(
          (left, right) =>
            right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object semantic search completed",
        `scope=${scope}`,
        `embeddingModel=${params.input.embeddingModel}`,
        `embeddingVersion=${params.input.embeddingVersion}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      embeddingModel: params.input.embeddingModel,
      embeddingVersion: params.input.embeddingVersion,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object semantic search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

async function createSkillCandidateVettingResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateVettingResultInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateVettingResultRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateSkillVetterHandoffTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const handoffPlan = buildSkillCandidateSkillVetterHandoffPlan({
      skillCandidateId: target.id,
      skillCandidateStatus: target.status,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
      ...(target.procurement_record_id
        ? { procurementRecordId: target.procurement_record_id }
        : {}),
      ...(target.procurement_record_payload
        ? { procurementRecordPayload: target.procurement_record_payload }
        : {}),
      ...(target.procurement_record_created_at
        ? { procurementRecordCreatedAt: target.procurement_record_created_at }
        : {}),
    });

    if (!handoffPlan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate Skill Vetter handoff plan could not be evaluated",
      };
    }

    if (
      !handoffPlan.possibleTargets.includes("propose_skill_vetter_handoff") ||
      !handoffPlan.eligible
    ) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: handoffPlan.rationale.join(" "),
      };
    }

    const procurementRecordId = handoffPlan.procurementRecordId;
    const handoff = handoffPlan.handoff;
    if (!procurementRecordId || !handoff) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: "manual Skill Vetter handoff package is incomplete",
      };
    }

    const existingRecord = await client.query<{ id: string; decision: string | null }>(
      `
        select id::text as id, payload->>'decision' as decision
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingRecordId = existingRecord.rows[0]?.id;
    if (existingRecordId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        procurementRecordId,
        vettingResultRecordId: existingRecordId,
        decision:
          existingRecord.rows[0]?.decision === "reject" ||
          existingRecord.rows[0]?.decision === "defer" ||
          existingRecord.rows[0]?.decision === "approve_limited" ||
          existingRecord.rows[0]?.decision === "approve_normal"
            ? existingRecord.rows[0].decision
            : params.input.decision,
        skillCandidateStatus: target.status,
        ...(handoffPlan.sourceProcedureId
          ? { sourceProcedureId: handoffPlan.sourceProcedureId }
          : {}),
        ...(handoffPlan.sourceCandidateId
          ? { sourceCandidateId: handoffPlan.sourceCandidateId }
          : {}),
      };
    }

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.vetting_result', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.reviewerAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-vetting-result-tool",
          procurementRecordId,
          handoff,
          decision: params.input.decision,
          ...(params.input.summary ? { summary: params.input.summary } : {}),
          result: {
            permissionsRisk: params.input.permissionsRisk,
            suspiciousPatterns: params.input.suspiciousPatterns,
            operationalFit: params.input.operationalFit,
            approvalRecommendation: params.input.approvalRecommendation,
          },
          requiredGates: handoffPlan.requiredGates,
        }),
        JSON.stringify({
          source: "skill-candidate-vetting-result-tool",
          skillCandidateId: params.input.skillCandidateId,
          procurementRecordId,
          vettingDecision: params.input.decision,
          ...(handoffPlan.sourceProcedureId
            ? { sourceProcedureId: handoffPlan.sourceProcedureId }
            : {}),
          ...(handoffPlan.sourceCandidateId
            ? { sourceCandidateId: handoffPlan.sourceCandidateId }
            : {}),
          ...(params.input.reviewerAgentId
            ? { reviewerAgentId: params.input.reviewerAgentId }
            : {}),
          ...(params.input.summary ? { vettingSummary: params.input.summary } : {}),
          ...(params.input.metadata ? { vettingResultMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const vettingResultRecordId = eventInsert.rows[0]?.id;
    if (!vettingResultRecordId) {
      throw new Error(
        "skill-candidate vetting result creation did not return a vetting-result record id",
      );
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate vetting result created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `vettingResultRecordId=${vettingResultRecordId}`,
        `decision=${params.input.decision}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      procurementRecordId,
      vettingResultRecordId,
      decision: params.input.decision,
      skillCandidateStatus: target.status,
      ...(handoffPlan.sourceProcedureId
        ? { sourceProcedureId: handoffPlan.sourceProcedureId }
        : {}),
      ...(handoffPlan.sourceCandidateId
        ? { sourceCandidateId: handoffPlan.sourceCandidateId }
        : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateVettingResultError(error);
    params.logger.error(
      `memory-middleware skill-candidate vetting result failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function createSkillCandidateProcurementRecordInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateProcurementRecordInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateProcurementRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateProcurementTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateProcurementPlan({
      skillCandidateId: params.input.skillCandidateId,
      skillCandidateStatus: target.status,
      name: target.name,
      summary: target.summary,
      ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
      ...(target.source_procedure_status
        ? { sourceProcedureStatus: target.source_procedure_status }
        : {}),
      ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
      ...(target.promoted_from_review_id
        ? { promotedFromReviewId: target.promoted_from_review_id }
        : {}),
      ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
      ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
      ...(target.latest_validation_run_outcome
        ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
        : {}),
    });

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate procurement plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_procurement_handoff") || !plan.eligible) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingRecord = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingRecordId = existingRecord.rows[0]?.id;
    if (existingRecordId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        procurementRecordId: existingRecordId,
        skillCandidateStatus: target.status,
        ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
        ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
      };
    }

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.procurement_record', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.recorderAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-procurement-record-tool",
          handoff: plan.handoff,
          rationale: plan.rationale,
          requiredGates: plan.requiredGates,
        }),
        JSON.stringify({
          source: "skill-candidate-procurement-record-tool",
          skillCandidateId: params.input.skillCandidateId,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
          ...(params.input.recorderAgentId
            ? { recorderAgentId: params.input.recorderAgentId }
            : {}),
          ...(params.input.rationale ? { recordRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { procurementRecordMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const procurementRecordId = eventInsert.rows[0]?.id;
    if (!procurementRecordId) {
      throw new Error(
        "skill-candidate procurement record creation did not return a procurement record id",
      );
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate procurement record created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `procurementRecordId=${procurementRecordId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      procurementRecordId,
      skillCandidateStatus: target.status,
      ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
      ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateProcurementRecordError(error);
    params.logger.error(
      `memory-middleware skill-candidate procurement record failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function readNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let cursor: unknown = metadata;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined;
}

function resolveCorrectionSupersedeSubjectKey(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["autoCapture", "subjectKey"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "autoCapture", "subjectKey"]) ??
    normalizeMetadataString(metadata, "preference_key")
  );
}

async function selectApprovedSupersedeTargetsBySubjectKey(params: {
  client: Client;
  schema: string;
  subjectKey: string;
  promotedMemoryObjectId: string;
}): Promise<Array<{ id: string }>> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const result = await params.client.query<{ id: string }>(
    `
      select id::text as id
      from ${memoryObjectsTable}
      where review_state = 'approved'
        and id <> $2::uuid
        and (
          metadata->'candidateMetadata'->'autoCapture'->>'subjectKey' = $1
          or metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey' = $1
          or metadata->'autoPromotion'->>'subjectKey' = $1
          or metadata->>'preference_key' = $1
        )
      order by created_at desc, id desc
    `,
    [params.subjectKey, params.promotedMemoryObjectId],
  );
  return result.rows;
}

async function promoteCandidateToMemoryInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateMemoryPromotionInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateMemoryPromotionResult> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memorySourcesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_sources",
  });
  const memoryLinksTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_links",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectCandidateMemoryPromotionTarget({
      client,
      schema: params.schema,
      candidateId: params.input.candidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "candidate not found",
      };
    }

    const kind = parseCandidateKind(target.kind);
    const plan = buildMemoryPromotionPlanFromTarget({
      candidateId: params.input.candidateId,
      kind,
      reviewState: target.review_state,
      ...(target.latest_review_outcome
        ? { latestReviewOutcome: target.latest_review_outcome }
        : {}),
    });

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "candidate promotion plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_memory_promotion")) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason:
          kind === "procedure"
            ? "procedure candidates are not eligible for bounded memory promotion"
            : plan.rationale.join(" "),
      };
    }

    if (!plan.eligible || plan.latestReviewOutcome !== "accepted") {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }
    const promotedMemoryKind = target.memory_kind === "feedback" ? "feedback" : "project";

    if (!target.source_event_id) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "candidate memory promotion requires candidate source-event provenance",
      };
    }

    if (!target.latest_review_id) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: "candidate memory promotion requires an accepted review record",
      };
    }

    const existingPromotion = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${memoryObjectsTable}
        where metadata->>'promotedFromCandidateId' = $1
          and review_state = 'approved'
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.candidateId],
    );
    const existingPromotedMemoryObjectId = existingPromotion.rows[0]?.id;
    if (existingPromotedMemoryObjectId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_promoted",
        candidateId: params.input.candidateId,
        promotedMemoryObjectId: existingPromotedMemoryObjectId,
        promotedMemoryKind,
        promotedReviewState: "approved",
        sourceEventId: target.source_event_id,
      };
    }

    const promotedMemoryInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryObjectsTable} (
          project_id,
          agent_id,
          session_id,
          source_event_id,
          memory_kind,
          review_state,
          content,
          metadata
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'approved', $6, $7::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.promoterAgentId ?? target.agent_id,
        target.session_id,
        target.source_event_id,
        target.memory_kind,
        target.content,
        JSON.stringify({
          source: "candidate-memory-promotion-tool",
          submissionKind: kind,
          promotedFromCandidateId: params.input.candidateId,
          promotedFromReviewId: target.latest_review_id,
          ...(target.candidate_metadata ? { candidateMetadata: target.candidate_metadata } : {}),
          ...(params.input.rationale ? { promotionRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { promotionMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const promotedMemoryObjectId = promotedMemoryInsert.rows[0]?.id;
    if (!promotedMemoryObjectId) {
      throw new Error("candidate memory promotion did not return a promoted memory object id");
    }

    await client.query(
      `
        insert into ${memorySourcesTable} (
          memory_object_id,
          source_kind,
          source_table,
          source_id,
          metadata
        )
        values
          ($1::uuid, 'event', $2, $3::uuid, $4::jsonb),
          ($1::uuid, 'review', $5, $6::uuid, $7::jsonb)
      `,
      [
        promotedMemoryObjectId,
        `${params.schema}.memory_events`,
        target.source_event_id,
        JSON.stringify({
          source: "candidate-memory-promotion-tool",
          promotedFromCandidateId: params.input.candidateId,
        }),
        `${params.schema}.memory_reviews`,
        target.latest_review_id,
        JSON.stringify({
          source: "candidate-memory-promotion-tool",
          promotedFromCandidateId: params.input.candidateId,
          ...(params.input.rationale ? { promotionRationale: params.input.rationale } : {}),
        }),
      ],
    );

    await client.query(
      `
        insert into ${memoryLinksTable} (
          source_memory_object_id,
          target_memory_object_id,
          link_kind,
          metadata
        )
        values ($1::uuid, $2::uuid, 'derived_from', $3::jsonb)
      `,
      [
        promotedMemoryObjectId,
        params.input.candidateId,
        JSON.stringify({
          source: "candidate-memory-promotion-tool",
          promotedFromReviewId: target.latest_review_id,
          ...(params.input.metadata ? { promotionMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const correctionSubjectKey =
      kind === "correction"
        ? resolveCorrectionSupersedeSubjectKey(target.candidate_metadata ?? undefined)
        : undefined;
    if (correctionSubjectKey) {
      const supersedeTargets = await selectApprovedSupersedeTargetsBySubjectKey({
        client,
        schema: params.schema,
        subjectKey: correctionSubjectKey,
        promotedMemoryObjectId,
      });
      const supersededAt = new Date().toISOString();
      for (const supersedeTarget of supersedeTargets) {
        await insertConsolidationSupersedeReview({
          client,
          schema: params.schema,
          memoryObjectId: supersedeTarget.id,
          reviewerAgentId: params.input.promoterAgentId ?? target.agent_id ?? undefined,
          rationale:
            "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
          metadata: {
            source: "candidate-memory-correction-supersede",
            supersededByObjectId: promotedMemoryObjectId,
            promotedFromCandidateId: params.input.candidateId,
            subjectKey: correctionSubjectKey,
          },
        });
        await updateMemoryObjectToSuperseded({
          client,
          schema: params.schema,
          memoryObjectId: supersedeTarget.id,
          supersededAt,
          metadata: {
            supersededByObjectId: promotedMemoryObjectId,
            lifecycleHint: "superseded",
            supersededReason: "candidate_correction_promotion",
            subjectKey: correctionSubjectKey,
          },
        });
        await ensureConsolidationSupersedesLink({
          client,
          schema: params.schema,
          sourceMemoryObjectId: supersedeTarget.id,
          targetMemoryObjectId: promotedMemoryObjectId,
          metadata: {
            source: "candidate-memory-correction-supersede",
            promotedFromCandidateId: params.input.candidateId,
            subjectKey: correctionSubjectKey,
          },
        });
      }
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware candidate memory promotion recorded",
        `candidateId=${params.input.candidateId}`,
        `promotedMemoryObjectId=${promotedMemoryObjectId}`,
        `memoryKind=${target.memory_kind}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "promoted",
      candidateId: params.input.candidateId,
      promotedMemoryObjectId,
      promotedMemoryKind,
      promotedReviewState: "approved",
      sourceEventId: target.source_event_id,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeCandidatePromotionError(error);
    params.logger.error(
      `memory-middleware candidate memory promotion failed candidateId=${params.input.candidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function promoteCandidateToProcedureDraftInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CandidateProcedurePromotionInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CandidateProcedurePromotionResult> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const memoryLinksTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_links",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectCandidateMemoryPromotionTarget({
      client,
      schema: params.schema,
      candidateId: params.input.candidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "candidate not found",
      };
    }

    const kind = parseCandidateKind(target.kind);
    const plan = buildMemoryPromotionPlanFromTarget({
      candidateId: params.input.candidateId,
      kind,
      reviewState: target.review_state,
      ...(target.latest_review_outcome
        ? { latestReviewOutcome: target.latest_review_outcome }
        : {}),
    });

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "candidate promotion plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_procedure_draft")) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason:
          kind !== "procedure"
            ? "only accepted reviewed procedure candidates are eligible for bounded procedure promotion"
            : plan.rationale.join(" "),
      };
    }

    if (!plan.eligible || plan.latestReviewOutcome !== "accepted") {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    if (kind !== "procedure" || target.memory_kind !== "procedure") {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason:
          "only accepted reviewed procedure candidates are eligible for bounded procedure promotion",
      };
    }

    if (!target.source_event_id) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "candidate procedure promotion requires candidate source-event provenance",
      };
    }

    if (!target.latest_review_id) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: "candidate procedure promotion requires an accepted review record",
      };
    }

    const existingProcedure = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${proceduresTable}
        where source_memory_object_id = $1::uuid
          and metadata->>'promotedFromCandidateId' = $1::text
          and status = 'draft'
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.candidateId],
    );
    const existingProcedureId = existingProcedure.rows[0]?.id;
    if (existingProcedureId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_promoted",
        candidateId: params.input.candidateId,
        procedureId: existingProcedureId,
        procedureStatus: "draft",
        sourceEventId: target.source_event_id,
      };
    }

    const procedureTitle =
      params.input.title?.trim() ||
      `Procedure draft from candidate ${params.input.candidateId.slice(0, 8)}`;
    const procedureInsert = await client.query<CandidateProcedurePromotionWriteResult>(
      `
        insert into ${proceduresTable} (
          project_id,
          source_memory_object_id,
          status,
          title,
          body,
          metadata
        )
        values ($1::uuid, $2::uuid, 'draft', $3, $4, $5::jsonb)
        returning id::text as procedure_id
      `,
      [
        target.project_id,
        params.input.candidateId,
        procedureTitle,
        target.content,
        JSON.stringify({
          source: "candidate-procedure-promotion-tool",
          submissionKind: kind,
          promotedFromCandidateId: params.input.candidateId,
          promotedFromReviewId: target.latest_review_id,
          sourceEventId: target.source_event_id,
          ...(params.input.promoterAgentId
            ? { promoterAgentId: params.input.promoterAgentId }
            : {}),
          ...(target.candidate_metadata ? { candidateMetadata: target.candidate_metadata } : {}),
          ...(params.input.rationale ? { promotionRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { promotionMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const procedureId = procedureInsert.rows[0]?.procedure_id;
    if (!procedureId) {
      throw new Error("candidate procedure promotion did not return a procedure id");
    }

    await client.query(
      `
        insert into ${memoryLinksTable} (
          source_memory_object_id,
          target_table,
          target_id,
          link_kind,
          metadata
        )
        values ($1::uuid, $2, $3::uuid, 'procedure_evidence', $4::jsonb)
      `,
      [
        params.input.candidateId,
        `${params.schema}.procedures`,
        procedureId,
        JSON.stringify({
          source: "candidate-procedure-promotion-tool",
          promotedFromReviewId: target.latest_review_id,
          sourceEventId: target.source_event_id,
          ...(params.input.metadata ? { promotionMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware candidate procedure promotion recorded",
        `candidateId=${params.input.candidateId}`,
        `procedureId=${procedureId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "promoted",
      candidateId: params.input.candidateId,
      procedureId,
      procedureStatus: "draft",
      sourceEventId: target.source_event_id,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeCandidateProcedurePromotionError(error);
    params.logger.error(
      `memory-middleware candidate procedure promotion failed candidateId=${params.input.candidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export function createMemoryMiddlewareQueryLayer(params: {
  config: MemoryMiddlewareDbConfig;
  logger: PluginLogger;
}): MemoryMiddlewareQueryLayer {
  const schema = assertSafeIdentifier(params.config.schema ?? DEFAULT_SCHEMA, "schema");

  return {
    async healthcheck() {
      return {
        driver: "postgres",
        configured: isConfigured(params.config),
        schema,
      };
    },
    async submitCandidate(input: CandidateSubmissionInput): Promise<CandidateSubmissionResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          kind: input.kind,
          reason: "memory middleware database URL is not configured",
        };
      }

      return submitCandidateToConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async listCandidates(input: CandidateListInput): Promise<CandidateListResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return listCandidatesFromConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async getCandidate(input: CandidateGetInput): Promise<CandidateGetResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return getCandidateFromConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async reviewCandidate(input: CandidateReviewInput): Promise<CandidateReviewResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return reviewCandidateInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planCandidatePromotion(
      input: CandidatePromotionPlanInput,
    ): Promise<CandidatePromotionPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planCandidatePromotionInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async promoteCandidateToMemory(
      input: CandidateMemoryPromotionInput,
    ): Promise<CandidateMemoryPromotionResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return promoteCandidateToMemoryInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async promoteCandidateToProcedureDraft(
      input: CandidateProcedurePromotionInput,
    ): Promise<CandidateProcedurePromotionResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return promoteCandidateToProcedureDraftInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planProcedureValidation(
      input: ProcedureValidationPlanInput,
    ): Promise<ProcedureValidationPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planProcedureValidationInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async validateProcedure(input: ProcedureValidationInput): Promise<ProcedureValidationResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return validateProcedureInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planSkillCandidate(input: SkillCandidatePlanInput): Promise<SkillCandidatePlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planSkillCandidateInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async createSkillCandidate(
      input: SkillCandidateCreateInput,
    ): Promise<SkillCandidateCreateResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return createSkillCandidateInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planSkillCandidateProcurement(
      input: SkillCandidateProcurementPlanInput,
    ): Promise<SkillCandidateProcurementPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planSkillCandidateProcurementInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async createSkillCandidateProcurementRecord(
      input: SkillCandidateProcurementRecordInput,
    ): Promise<SkillCandidateProcurementRecordResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return createSkillCandidateProcurementRecordInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planSkillCandidateSkillVetterHandoff(
      input: SkillCandidateSkillVetterHandoffInput,
    ): Promise<SkillCandidateSkillVetterHandoffResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planSkillCandidateSkillVetterHandoffInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async createSkillCandidateVettingResult(
      input: SkillCandidateVettingResultInput,
    ): Promise<SkillCandidateVettingResultRecordResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return createSkillCandidateVettingResultInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planSkillCandidateApproval(
      input: SkillCandidateApprovalPlanInput,
    ): Promise<SkillCandidateApprovalPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planSkillCandidateApprovalInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async approveSkillCandidate(
      input: SkillCandidateApproveInput,
    ): Promise<SkillCandidateApproveResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return approveSkillCandidateInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planSkillCandidateInstallHandoff(
      input: SkillCandidateInstallHandoffInput,
    ): Promise<SkillCandidateInstallHandoffResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planSkillCandidateInstallHandoffInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async createSkillCandidateInstallRecord(
      input: SkillCandidateInstallRecordInput,
    ): Promise<SkillCandidateInstallRecordResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return createSkillCandidateInstallRecordInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async persistToolResult(input: ToolResultPersistInput): Promise<ToolResultPersistResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return persistToolResultInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async getToolResult(input: ToolResultGetInput): Promise<ToolResultGetResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return getToolResultInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planToolResultMicrocompaction(
      input: ToolResultMicrocompactPlanInput,
    ): Promise<ToolResultMicrocompactPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planToolResultMicrocompactionInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async executeToolResultMicrocompaction(
      input: ToolResultMicrocompactExecuteInput,
    ): Promise<ToolResultMicrocompactExecuteResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return executeToolResultMicrocompactionInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async getSessionMemory(input: SessionMemoryGetInput): Promise<SessionMemoryGetResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return getSessionMemoryInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async updateSessionMemory(input: SessionMemoryUpdateInput): Promise<SessionMemoryUpdateResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return updateSessionMemoryInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planCompaction(input: CompactionPlanInput): Promise<CompactionPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planCompactionInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async executeSessionMemoryCompaction(
      input: SessionMemoryCompactExecuteInput,
    ): Promise<SessionMemoryCompactExecuteResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return executeSessionMemoryCompactionInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async executeFullCompactionFallback(
      input: FullCompactionFallbackExecuteInput,
    ): Promise<FullCompactionFallbackExecuteResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return executeFullCompactionFallbackInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planConsolidation(input: ConsolidationPlanInput): Promise<ConsolidationPlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planConsolidationInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async executeConsolidation(
      input: ConsolidationExecuteInput,
    ): Promise<ConsolidationExecuteResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return executeConsolidationInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async executeDriftCheck(input: DriftCheckExecuteInput): Promise<DriftCheckExecuteResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return executeDriftCheckInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async planProactivity(input: MemoryProactivePlanInput): Promise<MemoryProactivePlanResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return planProactivityInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async enqueueBackgroundJob(
      input: MemoryBackgroundJobEnqueueInput,
    ): Promise<MemoryBackgroundJobEnqueueResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          jobClass: input.jobClass,
          reason: "memory middleware database URL is not configured",
        };
      }

      return enqueueBackgroundJobInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async listBackgroundJobs(
      input: MemoryBackgroundJobListInput,
    ): Promise<MemoryBackgroundJobListResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return listBackgroundJobsInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async getBackgroundJob(
      input: MemoryBackgroundJobGetInput,
    ): Promise<MemoryBackgroundJobGetResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return getBackgroundJobInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async claimNextBackgroundJob(
      input: MemoryBackgroundJobRunNextInput,
    ): Promise<MemoryBackgroundJobClaimedRecord | undefined> {
      if (!isConfigured(params.config)) {
        throw new Error("memory middleware database URL is not configured");
      }

      return claimNextBackgroundJobInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async finalizeBackgroundJob(input: MemoryBackgroundJobFinalizeInput): Promise<void> {
      if (!isConfigured(params.config)) {
        throw new Error("memory middleware database URL is not configured");
      }

      return finalizeBackgroundJobInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async getMemoryObject(input: MemoryObjectGetInput): Promise<MemoryObjectGetResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return getMemoryObjectInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async listMemoryObjects(input: MemoryObjectListInput): Promise<MemoryObjectListResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return listMemoryObjectsInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async searchMemoryObjectsBasic(
      input: MemoryObjectSearchBasicInput,
    ): Promise<MemoryObjectSearchBasicResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return searchMemoryObjectsBasicInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async searchMemoryObjectsHybrid(
      input: MemoryObjectSearchHybridInput,
    ): Promise<MemoryObjectSearchHybridResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return searchMemoryObjectsHybridInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
    async searchMemoryObjectsSemantic(
      input: MemoryObjectSearchSemanticInput,
    ): Promise<MemoryObjectSearchSemanticResult> {
      if (!isConfigured(params.config)) {
        return {
          accepted: false,
          status: "not_configured",
          reason: "memory middleware database URL is not configured",
        };
      }

      return searchMemoryObjectsSemanticInConfiguredDatabase({
        config: params.config,
        input,
        logger: params.logger,
        schema,
      });
    },
  };
}
