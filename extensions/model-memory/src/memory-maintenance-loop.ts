import fs from "node:fs/promises";
import path from "node:path";
import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { sha256JsonValue } from "./hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "./source-authority.ts";

export type MemoryMaintenanceTrigger = "memory_event" | "heartbeat" | "daily_sweep";

export type MemoryMaintenanceCandidateType =
  | "derived_refresh"
  | "stale_artifact"
  | "soft_source_consolidation"
  | "privacy_safety"
  | "cache_projection"
  | "retrieval_quality"
  | "source_authority_review";

export type MemoryMaintenanceCandidateStatus =
  | "active"
  | "archived"
  | "expired"
  | "completed"
  | "dismissed";

export type MemoryMaintenanceUrgency = "low" | "medium" | "high";
export type MemoryMaintenanceSurfacingLane = "background_only" | "context_surface" | "must_surface";

export type MemoryMaintenanceReasonCode =
  | "memory_event_dirty_target"
  | "heartbeat_actionable_delta"
  | "daily_sweep_repeated_finding"
  | "soft_source_needs_consolidation"
  | "inspection_only_excluded"
  | "privacy_redacted_finding"
  | "stale_projection_or_capsule"
  | "cache_or_projection_churn"
  | "retrieval_exclusion"
  | "authority_conflict";

export type MemoryMaintenanceSourceRef = {
  sourceId?: string;
  memoryId?: string;
  artifactPath?: string;
  contentHash?: string;
  sourceProfileId?: SourceProfileId;
  authorityTier?: SourceAuthorityTier;
};

export type MemoryMaintenanceCandidate = {
  candidateId: string;
  candidateType: MemoryMaintenanceCandidateType;
  status: MemoryMaintenanceCandidateStatus;
  sourceRefs: MemoryMaintenanceSourceRef[];
  reasonCodes: MemoryMaintenanceReasonCode[];
  urgency: MemoryMaintenanceUrgency;
  surfacingLane: MemoryMaintenanceSurfacingLane;
  createdAt: string;
  activeUntil: string;
  archivedUntil: string;
  pinned: boolean;
  recurrenceCount: number;
};

export type DerivedRefreshRecord = {
  targetType: "projection" | "capsule" | "graph" | "cache" | "retrieval_warmup";
  targetId: string;
  reasonCodes: MemoryMaintenanceReasonCode[];
  dirty: boolean;
  sourceRefs: MemoryMaintenanceSourceRef[];
};

export type MemoryMaintenanceEventInput = {
  eventId: string;
  occurredAt?: Date;
  affectedTargets?: DerivedRefreshRecord[];
  sourceRefs?: MemoryMaintenanceSourceRef[];
  reasonCodes?: MemoryMaintenanceReasonCode[];
};

export type MemoryMaintenanceReport = {
  schema_version: "memory_maintenance_report.v1";
  generated_at: string;
  trigger: MemoryMaintenanceTrigger;
  mode: "shadow_report_only";
  counts: {
    candidates_total: number;
    candidates_active: number;
    candidates_archived: number;
    candidates_expired: number;
    derived_refresh_records: number;
    soft_source_candidates: number;
    privacy_safety_candidates: number;
  };
  candidates: MemoryMaintenanceCandidate[];
  derived_refresh_records: DerivedRefreshRecord[];
  no_dark_data_scan: {
    passed: true;
    scanned_fields: string[];
    prohibited_fields_excluded: string[];
  };
  retention: {
    active_days: 30;
    archived_days: 90;
    storage: "runtime_state_artifact";
  };
};

const ACTIVE_DAYS = 30;
const ARCHIVED_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function iso(date: Date): string {
  return date.toISOString();
}

function sanitizeReportFileId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "maintenance";
}

function stableCandidateId(input: Omit<MemoryMaintenanceCandidate, "candidateId">): string {
  return buildDeterministicUuid(
    "memory-maintenance-candidate",
    JSON.stringify({
      candidateType: input.candidateType,
      sourceRefs: input.sourceRefs,
      reasonCodes: input.reasonCodes,
      createdAt: input.createdAt,
    }),
  );
}

export function createMemoryMaintenanceCandidate(input: {
  candidateId?: string;
  candidateType: MemoryMaintenanceCandidateType;
  sourceRefs?: MemoryMaintenanceSourceRef[];
  reasonCodes: MemoryMaintenanceReasonCode[];
  urgency?: MemoryMaintenanceUrgency;
  surfacingLane?: MemoryMaintenanceSurfacingLane;
  createdAt?: Date;
  pinned?: boolean;
  recurrenceCount?: number;
}): MemoryMaintenanceCandidate {
  const createdAt = input.createdAt ?? new Date();
  const activeUntil = addDays(createdAt, ACTIVE_DAYS);
  const archivedUntil = addDays(activeUntil, ARCHIVED_DAYS);
  const withoutId: Omit<MemoryMaintenanceCandidate, "candidateId"> = {
    candidateType: input.candidateType,
    status: "active",
    sourceRefs: input.sourceRefs ?? [],
    reasonCodes: input.reasonCodes,
    urgency: input.urgency ?? "medium",
    surfacingLane: input.surfacingLane ?? "background_only",
    createdAt: iso(createdAt),
    activeUntil: iso(activeUntil),
    archivedUntil: iso(archivedUntil),
    pinned: input.pinned ?? false,
    recurrenceCount: input.recurrenceCount ?? 0,
  };
  return {
    candidateId: input.candidateId ?? stableCandidateId(withoutId),
    ...withoutId,
  };
}

export function advanceMemoryMaintenanceCandidateLifecycle(
  candidate: MemoryMaintenanceCandidate,
  now: Date = new Date(),
): MemoryMaintenanceCandidate {
  if (candidate.status === "completed" || candidate.status === "dismissed") {
    return candidate;
  }
  if (candidate.pinned) {
    return { ...candidate, status: "active" };
  }
  const activeUntil = Date.parse(candidate.activeUntil);
  const archivedUntil = Date.parse(candidate.archivedUntil);
  if (now.getTime() <= activeUntil) {
    return { ...candidate, status: "active" };
  }
  if (now.getTime() <= archivedUntil) {
    return { ...candidate, status: "archived" };
  }
  return { ...candidate, status: "expired" };
}

export function renewMemoryMaintenanceCandidate(
  candidate: MemoryMaintenanceCandidate,
  occurredAt: Date = new Date(),
): MemoryMaintenanceCandidate {
  return createMemoryMaintenanceCandidate({
    candidateId: candidate.candidateId,
    candidateType: candidate.candidateType,
    sourceRefs: candidate.sourceRefs,
    reasonCodes: candidate.reasonCodes,
    urgency: candidate.urgency,
    surfacingLane: candidate.surfacingLane,
    createdAt: occurredAt,
    pinned: candidate.pinned,
    recurrenceCount: candidate.recurrenceCount + 1,
  });
}

function countCandidates(
  candidates: MemoryMaintenanceCandidate[],
  status: MemoryMaintenanceCandidateStatus,
): number {
  return candidates.filter((candidate) => candidate.status === status).length;
}

function sanitizeCandidate(candidate: MemoryMaintenanceCandidate): MemoryMaintenanceCandidate {
  return {
    ...candidate,
    sourceRefs: candidate.sourceRefs.map((sourceRef) => ({
      sourceId: sourceRef.sourceId,
      memoryId: sourceRef.memoryId,
      artifactPath: sourceRef.artifactPath,
      contentHash: sourceRef.contentHash,
      sourceProfileId: sourceRef.sourceProfileId,
      authorityTier: sourceRef.authorityTier,
    })),
  };
}

function sanitizeDerivedRefreshRecord(record: DerivedRefreshRecord): DerivedRefreshRecord {
  return {
    targetType: record.targetType,
    targetId: record.targetId,
    reasonCodes: record.reasonCodes,
    dirty: record.dirty,
    sourceRefs: record.sourceRefs.map((sourceRef) => ({
      sourceId: sourceRef.sourceId,
      memoryId: sourceRef.memoryId,
      artifactPath: sourceRef.artifactPath,
      contentHash: sourceRef.contentHash,
      sourceProfileId: sourceRef.sourceProfileId,
      authorityTier: sourceRef.authorityTier,
    })),
  };
}

export function buildMemoryMaintenanceReport(input: {
  trigger: MemoryMaintenanceTrigger;
  candidates?: MemoryMaintenanceCandidate[];
  derivedRefreshRecords?: DerivedRefreshRecord[];
  generatedAt?: Date;
}): MemoryMaintenanceReport {
  const candidates = (input.candidates ?? []).map(sanitizeCandidate);
  const derivedRefreshRecords = (input.derivedRefreshRecords ?? []).map(
    sanitizeDerivedRefreshRecord,
  );
  return {
    schema_version: "memory_maintenance_report.v1",
    generated_at: iso(input.generatedAt ?? new Date()),
    trigger: input.trigger,
    mode: "shadow_report_only",
    counts: {
      candidates_total: candidates.length,
      candidates_active: countCandidates(candidates, "active"),
      candidates_archived: countCandidates(candidates, "archived"),
      candidates_expired: countCandidates(candidates, "expired"),
      derived_refresh_records: derivedRefreshRecords.length,
      soft_source_candidates: candidates.filter(
        (candidate) => candidate.candidateType === "soft_source_consolidation",
      ).length,
      privacy_safety_candidates: candidates.filter(
        (candidate) => candidate.candidateType === "privacy_safety",
      ).length,
    },
    candidates,
    derived_refresh_records: derivedRefreshRecords,
    no_dark_data_scan: {
      passed: true,
      scanned_fields: [
        "candidate_ids",
        "candidate_types",
        "status",
        "source_refs",
        "reason_codes",
        "derived_refresh_records",
      ],
      prohibited_fields_excluded: [
        "raw_prompts",
        "full_transcripts",
        "raw_tool_logs",
        "secrets",
        "private_phrases",
        "hostile_imperative_text",
      ],
    },
    retention: {
      active_days: ACTIVE_DAYS,
      archived_days: ARCHIVED_DAYS,
      storage: "runtime_state_artifact",
    },
  };
}

export function onMemoryMaintenanceEvent(input: MemoryMaintenanceEventInput): {
  candidates: MemoryMaintenanceCandidate[];
  derivedRefreshRecords: DerivedRefreshRecord[];
  report: MemoryMaintenanceReport;
} {
  const occurredAt = input.occurredAt ?? new Date();
  const derivedRefreshRecords = input.affectedTargets ?? [];
  const candidates =
    derivedRefreshRecords.length > 0
      ? [
          createMemoryMaintenanceCandidate({
            candidateType: "derived_refresh",
            sourceRefs: input.sourceRefs,
            reasonCodes: input.reasonCodes ?? ["memory_event_dirty_target"],
            createdAt: occurredAt,
            urgency: "medium",
          }),
        ]
      : [];
  return {
    candidates,
    derivedRefreshRecords,
    report: buildMemoryMaintenanceReport({
      trigger: "memory_event",
      candidates,
      derivedRefreshRecords,
      generatedAt: occurredAt,
    }),
  };
}

export function runHeartbeatMemoryMaintenance(input: {
  candidates?: MemoryMaintenanceCandidate[];
  derivedRefreshRecords?: DerivedRefreshRecord[];
  now?: Date;
}): MemoryMaintenanceReport {
  const now = input.now ?? new Date();
  return buildMemoryMaintenanceReport({
    trigger: "heartbeat",
    candidates: (input.candidates ?? []).map((candidate) =>
      advanceMemoryMaintenanceCandidateLifecycle(candidate, now),
    ),
    derivedRefreshRecords: input.derivedRefreshRecords,
    generatedAt: now,
  });
}

export function runDailyMemoryMaintenance(input: {
  candidates?: MemoryMaintenanceCandidate[];
  derivedRefreshRecords?: DerivedRefreshRecord[];
  now?: Date;
}): MemoryMaintenanceReport {
  const now = input.now ?? new Date();
  return buildMemoryMaintenanceReport({
    trigger: "daily_sweep",
    candidates: (input.candidates ?? []).map((candidate) =>
      advanceMemoryMaintenanceCandidateLifecycle(candidate, now),
    ),
    derivedRefreshRecords: input.derivedRefreshRecords,
    generatedAt: now,
  });
}

export async function writeMemoryMaintenanceReport(input: {
  report: MemoryMaintenanceReport;
  artifactDir: string;
  reportId?: string;
}): Promise<{ path: string; contentHash: string }> {
  await fs.mkdir(input.artifactDir, { recursive: true });
  const reportId = sanitizeReportFileId(input.reportId ?? input.report.trigger);
  const reportPath = path.join(input.artifactDir, `${reportId}.maintenance.json`);
  const serialized = `${JSON.stringify(input.report, null, 2)}\n`;
  await fs.writeFile(reportPath, serialized, "utf8");
  return {
    path: reportPath,
    contentHash: sha256JsonValue(serialized),
  };
}
