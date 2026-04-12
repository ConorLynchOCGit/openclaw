import { createHash } from "node:crypto";
import { Client, type ClientConfig } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  executeApprovedMemoryObjectSupersede,
  resolveCorrectionSupersedeSubjectKey,
  selectApprovedMemoryObjectSupersedeTargetsBySubjectKey,
} from "../memory-object-supersede.js";
import {
  claimNextBackgroundJobInConfiguredDatabase,
  enqueueBackgroundJobInConfiguredDatabase,
  finalizeBackgroundJobInConfiguredDatabase,
  getBackgroundJobInConfiguredDatabase,
  listBackgroundJobsInConfiguredDatabase,
} from "./background-job-queries.js";
import {
  createCandidateSubmissionPersistencePlan,
  type CandidatePersistencePlan,
} from "./candidate-submission-persistence.js";
import {
  buildMemoryPromotionPlanFromTarget,
  buildProcedureValidationPlan,
  isRecord,
  isSkillCandidateProcurementHandoff,
  isSkillCandidateVettingDecision,
  isStringArray,
} from "./governance-plan-builders.js";
import {
  executeConsolidationInConfiguredDatabase,
  executeDriftCheckInConfiguredDatabase,
} from "./maintenance-execution.js";
import {
  DEFAULT_CONSOLIDATION_PLAN_LIMIT,
  DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS,
  createConsolidationSelectionKey,
  normalizeConsolidationPlanLimit,
  normalizeConsolidationPlanMaxFindings,
  normalizeProactivePlanMaxActions,
  planConsolidationInConfiguredDatabase,
  planProactivityInConfiguredDatabase,
} from "./maintenance-planning.js";
import {
  normalizeMemoryObjectRecord,
  normalizeProcedureObjectRecord,
  summarizeMemoryObjectQueryError,
} from "./memory-object-query-runtime.js";
import {
  getMemoryObjectInConfiguredDatabase,
  listApprovedMemorySurfaceRows,
  listMemoryObjectsInConfiguredDatabase,
  listValidatedProcedureRows,
  searchMemoryObjectsBasicInConfiguredDatabase,
  searchMemoryObjectsHybridInConfiguredDatabase,
  searchMemoryObjectsSemanticInConfiguredDatabase,
} from "./memory-object-read-search.js";
import {
  executeFullCompactionFallbackInConfiguredDatabase,
  executeSessionMemoryCompactionInConfiguredDatabase,
  executeToolResultMicrocompactionInConfiguredDatabase,
  getSessionMemoryInConfiguredDatabase,
  getToolResultInConfiguredDatabase,
  persistToolResultInConfiguredDatabase,
  planCompactionInConfiguredDatabase,
  planToolResultMicrocompactionInConfiguredDatabase,
  updateSessionMemoryInConfiguredDatabase,
} from "./session-substrate-queries.js";
export { createCandidateSubmissionPersistencePlan } from "./candidate-submission-persistence.js";
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
  MemoryObjectListInput,
  MemoryObjectListResult,
  MemoryProactivePlanAction,
  MemoryProactivePlanInput,
  MemoryProactivePlanResult,
  MemoryObjectRecord,
  MemoryObjectSearchBasicInput,
  MemoryObjectSearchBasicResult,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchSemanticInput,
  MemoryObjectSearchSemanticResult,
  MemoryMiddlewareQueryLayer,
  JsonValue,
  ProcedureStatus,
  ProcedureObjectRecord,
  SessionMemoryGetInput,
  SessionMemoryGetResult,
  SessionMemoryCompactionPayload,
  SessionMemoryCompactExecuteInput,
  SessionMemoryCompactExecuteResult,
  SessionMemoryState,
  SessionMemoryUpdateInput,
  SessionMemoryUpdateResult,
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
  SkillCandidateCreateInput,
  SkillCandidateCreateResult,
  SkillCandidateProcurementPlanInput,
  SkillCandidateProcurementPlanResult,
  SkillCandidateProcurementRecordInput,
  SkillCandidateProcurementRecordResult,
  SkillCandidateApprovalPlanInput,
  SkillCandidateApprovalPlanResult,
  SkillCandidateApproveInput,
  SkillCandidateApproveResult,
  SkillCandidateInstallHandoffInput,
  SkillCandidateInstallHandoffResult,
  SkillCandidateInstallRecordInput,
  SkillCandidateInstallRecordResult,
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffResult,
  SkillCandidateVettingResultInput,
  SkillCandidateVettingResultRecordResult,
  SkillCandidateStatus,
  SkillCandidatePlanInput,
  SkillCandidatePlanResult,
} from "./runtime.js";
import {
  assertSafeIdentifier,
  parseProcedureStatus,
  quoteQualifiedTable,
  toClientConfig,
  withConfiguredClient,
} from "./shared.js";
import {
  approveSkillCandidateInConfiguredDatabase,
  createSkillCandidateInstallRecordInConfiguredDatabase,
  planSkillCandidateApprovalInConfiguredDatabase,
  planSkillCandidateInstallHandoffInConfiguredDatabase,
} from "./skill-governance-approval-install.js";
import {
  createSkillCandidateInConfiguredDatabase,
  createSkillCandidateProcurementRecordInConfiguredDatabase,
  createSkillCandidateVettingResultInConfiguredDatabase,
  planSkillCandidateInConfiguredDatabase,
  planSkillCandidateProcurementInConfiguredDatabase,
  planSkillCandidateSkillVetterHandoffInConfiguredDatabase,
  selectProcedureValidationPlanTarget,
} from "./skill-governance-candidate-procurement-vetting.js";

const DEFAULT_SCHEMA = "memory_middleware";
const DEFAULT_CANDIDATE_LIST_LIMIT = 20;
const MAX_CANDIDATE_LIST_LIMIT = 50;
const DEFAULT_MEMORY_OBJECT_LIST_LIMIT = 20;
const MAX_MEMORY_OBJECT_LIST_LIMIT = 50;
const DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT = 10;
const MAX_MEMORY_OBJECT_SEARCH_LIMIT = 25;
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

type ProcedureValidationWriteResult = {
  procedure_run_id: string;
  validated_at: string;
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
      const supersedeTargets = await selectApprovedMemoryObjectSupersedeTargetsBySubjectKey({
        client,
        schema: params.schema,
        subjectKey: correctionSubjectKey,
        supersededByObjectId: promotedMemoryObjectId,
      });
      const supersedeResult = await executeApprovedMemoryObjectSupersede({
        client,
        schema: params.schema,
        targetObjectIds: supersedeTargets.map((targetRow) => targetRow.id),
        supersededByObjectId: promotedMemoryObjectId,
        reviewerAgentId: params.input.promoterAgentId ?? target.agent_id ?? undefined,
        rationale:
          "older approved memory was superseded by a reviewed correction promotion for the same bounded subject",
        source: "candidate-memory-correction-supersede",
        supersededReason: "candidate_correction_promotion",
        metadata: {
          promotedFromCandidateId: params.input.candidateId,
          subjectKey: correctionSubjectKey,
        },
        logger: params.logger,
        logLabel: "candidate-memory-correction",
      });
      if (!supersedeResult.accepted) {
        throw new Error(supersedeResult.reason ?? "candidate correction supersede failed");
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
