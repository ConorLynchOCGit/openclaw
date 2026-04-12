import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import { buildProcedureValidationPlan } from "./governance-plan-builders.js";
import {
  normalizeMemoryObjectRecord,
  normalizeProcedureObjectRecord,
  summarizeMemoryObjectQueryError,
} from "./memory-object-query-runtime.js";
import {
  listApprovedMemorySurfaceRows,
  listValidatedProcedureRows,
} from "./memory-object-read-search.js";
import type {
  ConsolidationPlanActionType,
  ConsolidationPlanConfidence,
  ConsolidationPlanFinding,
  ConsolidationPlanInput,
  ConsolidationPlanPriority,
  ConsolidationPlanResult,
  MemoryObjectRecord,
  MemoryProactivePlanAction,
  MemoryProactivePlanInput,
  MemoryProactivePlanResult,
  ProcedureObjectRecord,
} from "./runtime.js";
import { parseProcedureStatus, quoteQualifiedTable, withConfiguredClient } from "./shared.js";
import { selectProcedureValidationPlanTarget } from "./skill-governance-candidate-procurement-vetting.js";

export const DEFAULT_CONSOLIDATION_PLAN_LIMIT = 40;
const MAX_CONSOLIDATION_PLAN_LIMIT = 100;
export const DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS = 10;
const MAX_CONSOLIDATION_PLAN_MAX_FINDINGS = 50;
const DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS = 6;
const MAX_PROACTIVE_PLAN_MAX_ACTIONS = 20;

type ConsolidationRecord = {
  objectType: "memory_object" | "procedure";
  id: string;
  projectId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
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
  status: "candidate" | "planned" | "approved" | "rejected" | "installed" | "errored";
};

function parseCandidateSubmissionKind(
  value: string,
): "learning" | "correction" | "procedure" | "improvement" {
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

export function normalizeConsolidationPlanLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CONSOLIDATION_PLAN_LIMIT;
  }
  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_CONSOLIDATION_PLAN_LIMIT), 1),
    MAX_CONSOLIDATION_PLAN_LIMIT,
  );
}

export function normalizeConsolidationPlanMaxFindings(maxFindings: number | undefined): number {
  if (!Number.isFinite(maxFindings)) {
    return DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS;
  }
  return Math.min(
    Math.max(Math.trunc(maxFindings ?? DEFAULT_CONSOLIDATION_PLAN_MAX_FINDINGS), 1),
    MAX_CONSOLIDATION_PLAN_MAX_FINDINGS,
  );
}

export function normalizeProactivePlanMaxActions(maxActions: number | undefined): number {
  if (!Number.isFinite(maxActions)) {
    return DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS;
  }
  return Math.min(
    Math.max(Math.trunc(maxActions ?? DEFAULT_PROACTIVE_PLAN_MAX_ACTIONS), 1),
    MAX_PROACTIVE_PLAN_MAX_ACTIONS,
  );
}

export function normalizeConsolidationSelectionIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function createConsolidationSelectionKey(params: {
  actionType: ConsolidationPlanActionType;
  affectedObjectIds: string[];
}): string {
  return `${params.actionType}:${normalizeConsolidationSelectionIds(params.affectedObjectIds).join(",")}`;
}

export function normalizeMetadataString(
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

export function normalizeMetadataScalarKey(
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

function normalizeConsolidationContent(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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

async function listPendingCandidateReviewRows(params: {
  client: import("pg").Client;
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
  client: import("pg").Client;
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
  client: import("pg").Client;
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
  client: import("pg").Client;
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

export async function planConsolidationInConfiguredDatabase(params: {
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

export async function planProactivityInConfiguredDatabase(params: {
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
            ? parseCandidateSubmissionKind(target.source_candidate_kind)
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
          requiredApprovalClass: "conversational_review",
          affectedIds: state.pendingCandidateRows.map((row) => row.id),
          rationale: [
            `${String(state.pendingCandidateRows.length)} candidate-state memory object${state.pendingCandidateRows.length === 1 ? "" : "s"} remain unreviewed`,
            "a conversational candidate review step is required before any later promotion planning or bounded write path",
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
          requiredApprovalClass: "conversational_review",
          affectedIds: state.eligibleProcedureValidationIds,
          rationale: [
            `${String(state.eligibleProcedureValidationIds.length)} draft procedure${state.eligibleProcedureValidationIds.length === 1 ? "" : "s"} already meet bounded validation-planning eligibility`,
            "the next step should be surfaced as a conversational validation follow-up instead of hidden operator-only review",
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
          requiredApprovalClass: "conversational_review",
          affectedIds: state.candidateSkillRows.map((row) => row.id),
          rationale: [
            `${String(state.candidateSkillRows.length)} bounded skill candidate${state.candidateSkillRows.length === 1 ? "" : "s"} remain in internal candidate governance state`,
            "the next governance step should be surfaced conversationally instead of depending on hidden operator-only review",
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
          requiredApprovalClass: "conversational_review",
          affectedIds: state.staleMemoryIds,
          rationale: [
            "approved durable memory metadata marks bounded records as stale or superseded",
            "the next cleanup choice should be surfaced conversationally before any separate consolidation or cleanup step",
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
          requiredApprovalClass: "conversational_review",
          affectedIds: [...new Set(consolidationReviewIds)].slice(0, maxActions),
          rationale: [
            "bounded consolidation planning found duplicate or contradiction review findings",
            "those findings should be surfaced conversationally before any later explicit review or execution action is chosen",
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
