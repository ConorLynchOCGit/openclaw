import { createHash } from "node:crypto";
import type { MemoryEdge, MemoryEvent } from "../mmv2/contracts.ts";
import type {
  ContextRunRecord,
  ContextRunSegmentRecord,
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
} from "../runtime-read-models.ts";
import {
  buildConflictObservedSignal,
  buildMemoryInjectionObservedSignal,
  buildMemoryRetrievalObservedSignal,
  buildSupersessionObservedSignal,
} from "./recorders.ts";
import { createMemoryOpsSignal } from "./signals.ts";
import type { MemoryOpsSignal } from "./types.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: Iterable<string | undefined | null>): string[] {
  return [...new Set([...values].filter((value): value is string => Boolean(value)))].toSorted(
    (left, right) => left.localeCompare(right),
  );
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

export function buildRetrievalObservationSignals(input: {
  requests: RetrievalRequestRecord[];
  resultSets: RetrievalResultSetRecord[];
  resultItems: RetrievalResultItemRecord[];
  observedAt?: string;
}): MemoryOpsSignal[] {
  const requestsById = new Map(input.requests.map((request) => [request.id, request]));
  const itemsBySetId = groupBy(input.resultItems, (item) => item.retrievalResultSetId);
  const signals: MemoryOpsSignal[] = [];

  for (const resultSet of input.resultSets) {
    const request = requestsById.get(resultSet.retrievalRequestId);
    if (!request) {
      continue;
    }
    const items = (itemsBySetId.get(resultSet.id) ?? []).toSorted(
      (left, right) => left.rankIndex - right.rankIndex,
    );
    const retrievedMemoryIds = items.map((item) => item.memoryObjectId);
    const selectedMemoryIds = items
      .filter((item) => item.selectedForContext)
      .map((item) => item.memoryObjectId);
    signals.push(
      buildMemoryRetrievalObservedSignal({
        signalId: `retrieval-${resultSet.id}`,
        observedAt: input.observedAt ?? resultSet.createdAt.toISOString(),
        sessionId: request.sessionId,
        runId: resultSet.id,
        queryHash: sha256(request.queryText),
        retrievedMemoryIds,
        selectedMemoryIds,
        reasonCodes: Object.fromEntries(
          items.map((item) => [item.memoryObjectId, item.retrievalReasonCodes]),
        ),
      }),
    );
  }

  return signals;
}

export function buildInjectionObservationSignals(input: {
  resultSets: RetrievalResultSetRecord[];
  resultItems: RetrievalResultItemRecord[];
  memoryStatusesById: Map<
    string,
    {
      status: "active" | "superseded" | "conflicted" | "quarantined" | "deleted";
      kind?: string | null;
      artifact_type?: string | null;
    }
  >;
  observedAt?: string;
}): MemoryOpsSignal[] {
  const itemsBySetId = groupBy(input.resultItems, (item) => item.retrievalResultSetId);
  const signals: MemoryOpsSignal[] = [];

  for (const resultSet of input.resultSets) {
    const selectedItems = (itemsBySetId.get(resultSet.id) ?? [])
      .filter((item) => item.selectedForContext)
      .toSorted((left, right) => left.rankIndex - right.rankIndex);
    if (selectedItems.length === 0) {
      continue;
    }
    signals.push(
      buildMemoryInjectionObservedSignal({
        signalId: `injection-${resultSet.id}`,
        observedAt: input.observedAt ?? resultSet.createdAt.toISOString(),
        runId: resultSet.id,
        injectedMemoryStatuses: selectedItems.map((item) => {
          const status = input.memoryStatusesById.get(item.memoryObjectId);
          return {
            memory_id: item.memoryObjectId,
            status: status?.status ?? "active",
            kind: status?.kind,
            artifact_type: status?.artifact_type,
            conflict_marked: item.retrievalReasonCodes.includes("conflict_marked"),
          };
        }),
      }),
    );
  }

  return signals;
}

export function buildContextRunLedgerSignals(input: {
  runs: ContextRunRecord[];
  segments: ContextRunSegmentRecord[];
  observedAt?: string;
}): MemoryOpsSignal[] {
  const segmentsByRunId = groupBy(input.segments, (segment) => segment.runId);
  return input.runs.map((run) => {
    const segments = (segmentsByRunId.get(run.id) ?? []).toSorted(
      (left, right) => left.segmentOrder - right.segmentOrder,
    );
    return createMemoryOpsSignal({
      signal_id: `context-run-${run.id}`,
      signal_type: "prompt_assembly_audit",
      observed_at: input.observedAt ?? run.assembledAt.toISOString(),
      session_id: run.sessionId,
      run_id: run.id,
      severity: "info",
      consumers: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
      related_source_ids: uniqueSorted(segments.map((segment) => segment.sourceArtifactId)),
      payload: {
        provider: run.provider,
        model: run.model,
        stable_layer_hash: run.stableLayerHash,
        semi_stable_layer_hash: run.semiStableLayerHash,
        volatile_layer_hash: run.volatileLayerHash,
        estimated_input_tokens: run.estimatedInputTokens,
        segment_count: segments.length,
        segment_types: segments.map((segment) => segment.segmentType),
        segment_hashes: segments.map((segment) => segment.segmentHash),
        dropped_count: segments.filter((segment) => segment.dropped).length,
        trimmed_count: segments.filter((segment) => segment.trimmed).length,
      },
      retention: { policy: "aggregate_only", ttl_seconds: 30 * 24 * 60 * 60 },
      privacy: {
        contains_raw_text: false,
        contains_user_content: false,
        contains_prompt_content: false,
        contains_secret: false,
        redacted: false,
      },
      usage_contract: {
        used_by: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
        action:
          "Audit prompt assembly shape, injected source artifacts, and memory pack churn without storing prompt content.",
      },
    });
  });
}

export function buildConflictAndSupersessionObservationSignals(input: {
  events: MemoryEvent[];
  edges: MemoryEdge[];
  observedAt?: string;
}): MemoryOpsSignal[] {
  const signals: MemoryOpsSignal[] = [];

  for (const event of input.events) {
    if (
      event.event_type === "conflict_recorded" ||
      event.payload?.reconciliation_decision === "record_as_conflict"
    ) {
      const memoryIds = uniqueSorted([event.memory_id, ...event.target_memory_ids]);
      if (memoryIds.length > 0) {
        signals.push(
          buildConflictObservedSignal({
            signalId: `conflict-event-${event.memory_event_id}`,
            observedAt: input.observedAt ?? event.occurred_at,
            candidateId: event.candidate_id ?? undefined,
            memoryIds,
            conflictType:
              typeof event.payload?.conflict_type === "string" ? event.payload.conflict_type : null,
            resolutionStatus: "unresolved",
          }),
        );
      }
    }
  }

  for (const edge of input.edges) {
    if (edge.edge_type === "supersedes") {
      signals.push(
        buildSupersessionObservedSignal({
          signalId: `supersession-edge-${edge.edge_id}`,
          observedAt: input.observedAt ?? edge.created_at,
          fromMemoryId: edge.from_memory_id,
          toMemoryId: edge.to_memory_id,
          supersessionType:
            typeof edge.metadata?.supersession_type === "string"
              ? edge.metadata.supersession_type
              : edge.edge_type,
        }),
      );
    }
    if (edge.edge_type === "conflicts_with") {
      signals.push(
        buildConflictObservedSignal({
          signalId: `conflict-edge-${edge.edge_id}`,
          observedAt: input.observedAt ?? edge.created_at,
          memoryIds: uniqueSorted([edge.from_memory_id, edge.to_memory_id]),
          conflictType:
            typeof edge.metadata?.conflict_type === "string"
              ? edge.metadata.conflict_type
              : edge.edge_type,
          resolutionStatus: "unresolved",
        }),
      );
    }
  }

  return signals;
}
