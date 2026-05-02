import { createMemoryOpsSignal } from "./signals.ts";
import type { MemoryOpsSignal } from "./types.ts";

type CommonSignalInput = {
  signalId?: string;
  observedAt?: string;
  tenantId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  sessionKey?: string | null;
  runId?: string | null;
};

type CommonSignalFields = {
  signal_id?: string;
  observed_at: string;
  tenant_id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  session_id?: string | null;
  session_key?: string | null;
  run_id?: string | null;
};

function common(input: CommonSignalInput): CommonSignalFields {
  return {
    signal_id: input.signalId,
    observed_at: input.observedAt ?? new Date().toISOString(),
    tenant_id: input.tenantId,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    session_id: input.sessionId,
    session_key: input.sessionKey,
    run_id: input.runId,
  };
}

const SAFE_PRIVACY = {
  contains_raw_text: false,
  contains_user_content: false,
  contains_prompt_content: false,
  contains_secret: false,
  redacted: false,
};

export function buildMemoryInjectionObservedSignal(
  input: CommonSignalInput & {
    injectedMemoryStatuses: Array<{
      memory_id: string;
      status: "active" | "superseded" | "conflicted" | "quarantined" | "deleted";
      kind?: string | null;
      artifact_type?: string | null;
      conflict_marked?: boolean;
    }>;
    promptSectionId?: string;
    tokenCost?: number;
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "memory_injection_observed",
    severity: "info",
    consumers: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
    related_memory_ids: input.injectedMemoryStatuses.map((entry) => entry.memory_id),
    payload: {
      injected_memory_statuses: input.injectedMemoryStatuses,
      prompt_section_id: input.promptSectionId,
      token_cost: input.tokenCost,
    },
    retention: { policy: "aggregate_only", ttl_seconds: 30 * 24 * 60 * 60 },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
      action:
        "Detect stale, superseded, or conflicted memory injection and report retrieval quality risks.",
    },
  });
}

export function buildMemoryRetrievalObservedSignal(
  input: CommonSignalInput & {
    queryHash: string;
    retrievedMemoryIds: string[];
    selectedMemoryIds?: string[];
    reasonCodes?: Record<string, string[]>;
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "memory_retrieval_observed",
    severity: "info",
    consumers: ["retrieval_quality", "cron_recommendation"],
    related_memory_ids: input.retrievedMemoryIds,
    payload: {
      query_hash: input.queryHash,
      retrieved_memory_ids: input.retrievedMemoryIds,
      selected_memory_ids: input.selectedMemoryIds ?? [],
      reason_codes: input.reasonCodes ?? {},
    },
    retention: { policy: "aggregate_only", ttl_seconds: 30 * 24 * 60 * 60 },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["retrieval_quality", "cron_recommendation"],
      action: "Measure retrieval selection quality without storing query text.",
    },
  });
}

export function buildConflictObservedSignal(
  input: CommonSignalInput & {
    candidateId?: string;
    memoryIds: string[];
    conflictType?: string | null;
    resolutionStatus?: string | null;
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "conflict_observed",
    severity: "warning",
    consumers: ["conflict_resolution", "retrieval_quality", "cron_recommendation"],
    related_candidate_ids: input.candidateId ? [input.candidateId] : undefined,
    related_memory_ids: input.memoryIds,
    payload: {
      conflict_type: input.conflictType ?? null,
      resolution_status: input.resolutionStatus ?? "unresolved",
    },
    retention: { policy: "until_candidate_resolved", ttl_seconds: null },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["conflict_resolution", "retrieval_quality", "cron_recommendation"],
      action:
        "Prevent silent injection of unresolved conflicts and surface review recommendations.",
    },
  });
}

export function buildSupersessionObservedSignal(
  input: CommonSignalInput & {
    fromMemoryId: string;
    toMemoryId: string;
    supersessionType?: string | null;
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "supersession_observed",
    severity: "info",
    consumers: ["conflict_resolution", "retrieval_quality", "cron_recommendation"],
    related_memory_ids: [input.fromMemoryId, input.toMemoryId],
    payload: {
      from_memory_id: input.fromMemoryId,
      to_memory_id: input.toMemoryId,
      supersession_type: input.supersessionType ?? null,
    },
    retention: { policy: "until_memory_superseded", ttl_seconds: null },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["conflict_resolution", "retrieval_quality", "cron_recommendation"],
      action: "Detect superseded memory reuse and retrieval filtering gaps.",
    },
  });
}

export function buildSourceAuthorityObservedSignal(
  input: CommonSignalInput & {
    sourceType: string;
    authorityLevel: string;
    relatedMemoryIds?: string[];
    relatedCandidateIds?: string[];
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "source_authority_observed",
    severity: "info",
    consumers: ["admission_gate", "reconciliation", "conflict_resolution"],
    related_memory_ids: input.relatedMemoryIds,
    related_candidate_ids: input.relatedCandidateIds,
    payload: {
      source_type: input.sourceType,
      authority_level: input.authorityLevel,
    },
    retention: { policy: "bounded_audit", ttl_seconds: 30 * 24 * 60 * 60 },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["admission_gate", "reconciliation", "conflict_resolution"],
      action: "Support authority-aware admission and reconciliation decisions.",
    },
  });
}

export function buildFileHashObservedSignal(
  input: CommonSignalInput & {
    filePath: string;
    basename: string;
    contentHash: string;
    previousHash?: string | null;
    changed: boolean;
    linkedCaptureEventIds?: string[];
  },
): MemoryOpsSignal {
  return createMemoryOpsSignal({
    ...common(input),
    signal_type: "file_hash_observed",
    severity: input.changed ? "info" : "debug",
    consumers: ["dedupe", "provenance_attachment", "cron_recommendation"],
    payload: {
      file_path: input.filePath,
      basename: input.basename,
      content_hash: input.contentHash,
      previous_hash: input.previousHash ?? null,
      changed: input.changed,
      linked_capture_event_ids: input.linkedCaptureEventIds ?? [],
    },
    retention: { policy: "aggregate_only", ttl_seconds: 30 * 24 * 60 * 60 },
    privacy: SAFE_PRIVACY,
    usage_contract: {
      used_by: ["dedupe", "provenance_attachment", "cron_recommendation"],
      action: "Detect changed watched files and file-import gaps without storing file content.",
    },
  });
}
