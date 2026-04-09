import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import {
  extractCandidateConfirmationState,
  extractCandidateExpiresAt,
  inspectClusteredMemoryObjectLifecycle,
  isExpiredPendingClusteredMemoryCandidate,
  type ClusteredMemoryLifecycleRowBase,
  type ClusteredMemoryPendingCandidate,
} from "./clustered-memory-lifecycle.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { getMemoryLifecycleRuntimePolicy } from "./memory-runtime-policy-views.js";

type ProjectFactLifecycleRow = ClusteredMemoryLifecycleRowBase & {
  resolved_template: string | null;
  resolved_field_key: string | null;
  resolved_fact_family: string | null;
  resolved_project_scope: string | null;
  resolved_normalized_project_scope: string | null;
  resolved_value: string | null;
  resolved_normalized_value: string | null;
};

export type ProjectFactPendingCandidate = ClusteredMemoryPendingCandidate;

export type ProjectFactSubjectEntry = {
  id: string;
  reviewState: ProjectFactLifecycleRow["review_state"];
  createdAt: string;
  updatedAt: string;
  sourceEventId?: string;
  supersededAt?: string;
  key?: string;
  subjectKey?: string;
  template?: string;
  fieldKey?: string;
  factFamily?: string;
  projectScope?: string;
  normalizedProjectScope?: string;
  value?: string;
  normalizedValue?: string;
  confirmationState?: string;
  expiresAt?: string;
};

export type ProjectFactLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: ProjectFactPendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
  activeApprovedSubjectEntries: ProjectFactSubjectEntry[];
  pendingSubjectCandidates: ProjectFactSubjectEntry[];
};

function toProjectFactSubjectEntry(row: ProjectFactLifecycleRow): ProjectFactSubjectEntry {
  const metadata = row.metadata ?? undefined;
  return {
    id: row.id,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
    ...(row.resolved_key ? { key: row.resolved_key } : {}),
    ...(row.resolved_subject_key ? { subjectKey: row.resolved_subject_key } : {}),
    ...(row.resolved_template ? { template: row.resolved_template } : {}),
    ...(row.resolved_field_key ? { fieldKey: row.resolved_field_key } : {}),
    ...(row.resolved_fact_family ? { factFamily: row.resolved_fact_family } : {}),
    ...(row.resolved_project_scope ? { projectScope: row.resolved_project_scope } : {}),
    ...(row.resolved_normalized_project_scope
      ? { normalizedProjectScope: row.resolved_normalized_project_scope }
      : {}),
    ...(row.resolved_value ? { value: row.resolved_value } : {}),
    ...(row.resolved_normalized_value ? { normalizedValue: row.resolved_normalized_value } : {}),
    ...(extractCandidateConfirmationState(metadata)
      ? { confirmationState: extractCandidateConfirmationState(metadata) }
      : {}),
    ...(extractCandidateExpiresAt(metadata)
      ? { expiresAt: extractCandidateExpiresAt(metadata) }
      : {}),
  };
}

export function isExpiredPendingProjectFactCandidate(
  candidate: ProjectFactPendingCandidate,
  now = new Date(),
): boolean {
  return isExpiredPendingClusteredMemoryCandidate(candidate, now);
}

export async function inspectProjectFactLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<ProjectFactLifecycleInspection | null> {
  const inspection = await inspectClusteredMemoryObjectLifecycle<
    ProjectFactLifecycleRow,
    ProjectFactSubjectEntry
  >({
    config: params.config,
    key: params.key,
    subjectKey: params.subjectKey,
    projectId: params.projectId,
    projectScoped: true,
    logger: params.logger,
    logLabel: "project-fact",
    resolvedKeySql: `
      coalesce(
        metadata->'autoCapture'->>'key',
        metadata->'candidateMetadata'->'autoCapture'->>'key',
        metadata->'promotionMetadata'->'autoPromotion'->>'key'
      )
    `,
    resolvedSubjectKeySql: `
      coalesce(
        metadata->'autoCapture'->>'subjectKey',
        metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
        metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey',
        metadata->>'subject_key'
      )
    `,
    selectAdditionalColumns: [
      `coalesce(
        metadata->'autoCapture'->>'template',
        metadata->'candidateMetadata'->'autoCapture'->>'template',
        metadata->'promotionMetadata'->'autoPromotion'->>'template',
        metadata->'autoPromotion'->>'template'
      ) as resolved_template`,
      `coalesce(
        metadata->'autoCapture'->>'fieldKey',
        metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',
        metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',
        metadata->'autoPromotion'->>'fieldKey'
      ) as resolved_field_key`,
      `coalesce(
        metadata->'autoCapture'->>'factFamily',
        metadata->'candidateMetadata'->'autoCapture'->>'factFamily',
        metadata->'promotionMetadata'->'autoPromotion'->>'factFamily',
        metadata->'autoPromotion'->>'factFamily',
        case
          when coalesce(
            metadata->'autoCapture'->>'fieldKey',
            metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',
            metadata->'autoPromotion'->>'fieldKey'
          ) <> ''
          then 'supported_field'
          else ''
        end
      ) as resolved_fact_family`,
      `coalesce(
        metadata->'autoCapture'->>'projectScope',
        metadata->'candidateMetadata'->'autoCapture'->>'projectScope',
        metadata->'promotionMetadata'->'autoPromotion'->>'projectScope',
        metadata->'autoPromotion'->>'projectScope'
      ) as resolved_project_scope`,
      `coalesce(
        metadata->'autoCapture'->>'normalizedProjectScope',
        metadata->'candidateMetadata'->'autoCapture'->>'normalizedProjectScope',
        metadata->'promotionMetadata'->'autoPromotion'->>'normalizedProjectScope',
        metadata->'autoPromotion'->>'normalizedProjectScope'
      ) as resolved_normalized_project_scope`,
      `coalesce(
        metadata->'autoCapture'->>'value',
        metadata->'candidateMetadata'->'autoCapture'->>'value',
        metadata->'promotionMetadata'->'autoPromotion'->>'value',
        metadata->'autoPromotion'->>'value'
      ) as resolved_value`,
      `coalesce(
        metadata->'autoCapture'->>'normalizedValue',
        metadata->'candidateMetadata'->'autoCapture'->>'normalizedValue',
        metadata->'promotionMetadata'->'autoPromotion'->>'normalizedValue',
        metadata->'autoPromotion'->>'normalizedValue'
      ) as resolved_normalized_value`,
    ],
    pendingStates: getMemoryLifecycleRuntimePolicy("project_fact").pendingCandidateStates,
    toSubjectEntry: toProjectFactSubjectEntry,
  });
  if (!inspection) {
    return null;
  }

  return {
    ...(inspection.matchingApprovedObjectId
      ? { matchingApprovedObjectId: inspection.matchingApprovedObjectId }
      : {}),
    ...(inspection.pendingCandidate ? { pendingCandidate: inspection.pendingCandidate } : {}),
    activeApprovedSubjectObjectIds: inspection.activeApprovedSubjectObjectIds,
    pendingSubjectCandidateIds: inspection.pendingSubjectCandidateIds,
    activeApprovedSubjectEntries: inspection.activeApprovedSubjectEntries,
    pendingSubjectCandidates: inspection.pendingSubjectCandidates,
  };
}
