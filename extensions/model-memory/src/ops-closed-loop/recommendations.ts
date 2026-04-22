import { createHash } from "node:crypto";
import type { HookDiscoveryArtifact, HookDiscoveryStatus } from "./hook-discovery.ts";
import type {
  MemoryOpsRecommendation,
  MemoryOpsRecommendationCategory,
  MemoryOpsSignal,
  RecommendationSeverity,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function stableRecommendationId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function buildRecommendation(input: {
  nowIso: string;
  category: MemoryOpsRecommendationCategory;
  severity: RecommendationSeverity;
  title: string;
  summary: string;
  evidenceSignalIds: string[];
  relatedMemoryIds?: string[];
  relatedCandidateIds?: string[];
  relatedSessionIds?: string[];
  relatedHookNames?: string[];
  recommendedAction: string;
  autoFixAvailable?: boolean;
  safeToAutoFix?: boolean;
}): MemoryOpsRecommendation {
  return {
    recommendation_id: stableRecommendationId([
      input.category,
      input.title,
      ...input.evidenceSignalIds,
      ...(input.relatedMemoryIds ?? []),
      ...(input.relatedHookNames ?? []),
    ]),
    schema_version: "memory_ops_recommendation.v1",
    created_at: input.nowIso,
    severity: input.severity,
    status: "open",
    title: input.title,
    summary: input.summary,
    evidence_signal_ids: input.evidenceSignalIds,
    related_memory_ids: input.relatedMemoryIds,
    related_candidate_ids: input.relatedCandidateIds,
    related_session_ids: input.relatedSessionIds,
    related_hook_names: input.relatedHookNames,
    category: input.category,
    recommended_action: input.recommendedAction,
    suggested_command: null,
    auto_fix_available: input.autoFixAvailable ?? false,
    auto_fix_enabled: false,
    safe_to_auto_fix: input.safeToAutoFix ?? false,
  };
}

function readInjectedStatuses(signal: MemoryOpsSignal): Array<{
  memoryId: string;
  status: string;
  conflictMarked?: boolean;
}> {
  const value = signal.payload.injected_memory_statuses ?? signal.payload.memory_statuses;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const memoryId = readString(entry.memory_id) ?? readString(entry.memoryId);
    const status = readString(entry.status);
    if (!memoryId || !status) {
      return [];
    }
    return [
      {
        memoryId,
        status,
        conflictMarked:
          readBoolean(entry.conflict_marked) ?? readBoolean(entry.conflictMarkerIncluded),
      },
    ];
  });
}

function flushFailed(signal: MemoryOpsSignal): boolean {
  const flushResult = signal.payload.flush_result ?? signal.payload.batch_flush_result;
  if (isRecord(flushResult)) {
    const ok = readBoolean(flushResult.ok);
    if (ok === false) {
      return true;
    }
  }
  const triggered = readBoolean(signal.payload.flush_triggered);
  const unprocessed =
    readNumber(signal.payload.unprocessed_delta_count) ??
    readNumber(signal.payload.unprocessed_count) ??
    0;
  return triggered === true && unprocessed > 0 && !flushResult;
}

export function buildRecommendationsFromSignals(input: {
  signals: MemoryOpsSignal[];
  nowIso?: string;
}): MemoryOpsRecommendation[] {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const recommendations: MemoryOpsRecommendation[] = [];

  for (const signal of input.signals) {
    if (signal.signal_type === "memory_injection_observed") {
      const injectedStatuses = readInjectedStatuses(signal);
      const superseded = injectedStatuses.filter((entry) => entry.status === "superseded");
      if (superseded.length > 0) {
        recommendations.push(
          buildRecommendation({
            nowIso,
            category: "superseded_memory_injected",
            severity: "action_required",
            title: "Superseded memory was injected",
            summary: `Injected superseded memory ids: ${superseded
              .map((entry) => entry.memoryId)
              .join(", ")}`,
            evidenceSignalIds: [signal.signal_id],
            relatedMemoryIds: superseded.map((entry) => entry.memoryId),
            relatedSessionIds: signal.session_id ? [signal.session_id] : undefined,
            recommendedAction:
              "Fix retrieval or prompt injection filters to exclude superseded memories.",
            autoFixAvailable: true,
            safeToAutoFix: true,
          }),
        );
      }

      const silentConflicts = injectedStatuses.filter(
        (entry) => entry.status === "conflicted" && entry.conflictMarked !== true,
      );
      if (silentConflicts.length > 0) {
        recommendations.push(
          buildRecommendation({
            nowIso,
            category: "bad_injection",
            severity: "action_required",
            title: "Conflicted memory was injected without a conflict marker",
            summary: `Injected conflicted memory ids without explicit marking: ${silentConflicts
              .map((entry) => entry.memoryId)
              .join(", ")}`,
            evidenceSignalIds: [signal.signal_id],
            relatedMemoryIds: silentConflicts.map((entry) => entry.memoryId),
            relatedSessionIds: signal.session_id ? [signal.session_id] : undefined,
            recommendedAction:
              "Update prompt injection to exclude conflicted memories by default or include an explicit conflict marker.",
            autoFixAvailable: true,
            safeToAutoFix: true,
          }),
        );
      }
    }

    if (signal.signal_type === "duplicate_hash_observed") {
      const duplicateIds = readStringArray(signal.payload.duplicate_evidence_ids);
      const duplicateCount = readNumber(signal.payload.duplicate_count) ?? duplicateIds.length;
      const admittedCount = readNumber(signal.payload.admitted_count);
      if (duplicateCount > 0 || (admittedCount ?? 0) > 1) {
        recommendations.push(
          buildRecommendation({
            nowIso,
            category: "dedupe_failure",
            severity: "warning",
            title: "Duplicate memory/evidence hash observed",
            summary: `Duplicate hash ${readString(signal.payload.hash) ?? "unknown"} appeared ${duplicateCount || admittedCount} time(s).`,
            evidenceSignalIds: [signal.signal_id],
            relatedMemoryIds: signal.related_memory_ids,
            relatedCandidateIds: signal.related_candidate_ids,
            recommendedAction:
              "Review extraction dedupe and reconciliation keys for this source lane.",
          }),
        );
      }
    }

    if (
      (signal.signal_type === "compaction_boundary" ||
        signal.signal_type === "session_command_boundary" ||
        signal.signal_type === "session_end_boundary") &&
      flushFailed(signal)
    ) {
      recommendations.push(
        buildRecommendation({
          nowIso,
          category:
            signal.signal_type === "compaction_boundary"
              ? "compaction_risk"
              : "session_flush_failed",
          severity: signal.signal_type === "compaction_boundary" ? "critical" : "action_required",
          title:
            signal.signal_type === "compaction_boundary"
              ? "Compaction boundary could lose unprocessed deltas"
              : "Session boundary flush failed",
          summary: "A boundary signal reported unprocessed deltas with no successful flush.",
          evidenceSignalIds: [signal.signal_id],
          relatedSessionIds: signal.session_id ? [signal.session_id] : undefined,
          recommendedAction:
            "Repair or rerun the bounded memory flush before relying on compaction/session closure.",
          autoFixAvailable: true,
          safeToAutoFix: true,
        }),
      );
    }
  }

  return recommendations;
}

function hookStatusNeedsRecommendation(status: HookDiscoveryStatus): boolean {
  return status === "registered_not_fired" || status === "blocked" || status === "synthetic_only";
}

export function buildHookHealthRecommendations(input: {
  discovery: HookDiscoveryArtifact;
  nowIso?: string;
}): MemoryOpsRecommendation[] {
  const nowIso = input.nowIso ?? new Date().toISOString();
  return input.discovery.targets
    .filter((target) => hookStatusNeedsRecommendation(target.status))
    .map((target) =>
      buildRecommendation({
        nowIso,
        category: "hook_health",
        severity: target.status === "blocked" ? "warning" : "info",
        title: `Hook needs verification: ${target.hook_name}`,
        summary: `Discovery status is ${target.status}. Registration surface: ${
          target.registration_surface_exists ? "present" : "missing"
        }.`,
        evidenceSignalIds: [],
        relatedHookNames: [target.hook_name],
        recommendedAction:
          target.status === "blocked"
            ? "Add or choose a fallback hook before depending on this seam."
            : target.status === "synthetic_only"
              ? "Run a real UI/gateway turn before treating this seam as production-verified."
              : "Run a safe runtime trigger before using this hook as an implementation dependency.",
      }),
    );
}
