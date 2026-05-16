import { randomUUID } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkItemQueueStatus } from "./types.ts";

export const WORK_QUEUE_EVENT_TYPES = [
  "work_queue.item_created",
  "work_queue.item_updated",
  "work_queue.item_closed",
  "work_queue.child_created",
  "work_queue.child_updated",
  "work_queue.parent_rollup_updated",
  "work_queue.graph_node_started",
  "work_queue.graph_node_completed",
  "work_queue.graph_node_failed",
  "work_queue.graph_node_needs_review",
  "work_queue.role_invocation_started",
  "work_queue.role_invocation_completed",
  "work_queue.role_invocation_failed",
  "work_queue.role_invocation_needs_review",
  "work_queue.active_worker_changed",
  "work_queue.validation_started",
  "work_queue.validation_failed",
  "work_queue.validation_repaired",
  "work_queue.validation_passed",
  "work_queue.repair_started",
  "work_queue.repair_completed",
  "work_queue.repair_exhausted",
  "work_queue.human_task_waiting",
  "work_queue.human_task_resumed",
  "work_queue.human_task_expired",
  "work_queue.human_task_blocked",
  "work_queue.closeout_started",
  "work_queue.closeout_accepted",
  "work_queue.closeout_rejected",
  "work_queue.closeout_needs_review",
  "work_queue.item_blocked",
  "work_queue.item_unblocked",
  "work_queue.queue_rank_changed",
  "work_queue.reconciled",
] as const;

export type WorkQueueEventType = (typeof WORK_QUEUE_EVENT_TYPES)[number];

const WORK_QUEUE_EVENT_TYPE_SET = new Set<string>(WORK_QUEUE_EVENT_TYPES);
const MAX_REASON_CODES = 30;
const MAX_EVIDENCE_REFS = 40;
const MAX_REF_LENGTH = 500;
const MAX_PAYLOAD_BYTES = 12_000;

export type WorkQueueEvent = {
  artifactKind: "work_queue_event";
  eventId: string;
  cursor: number;
  idempotencyKey: string;
  eventType: WorkQueueEventType;
  workItemId: string;
  parentWorkItemId: string | null;
  graphId: string | null;
  nodeId: string | null;
  runtimeJobId: string | null;
  humanTaskId: string | null;
  queueStatus: WorkItemQueueStatus | null;
  reasonCodes: string[];
  evidenceRefs: string[];
  payload: JsonValue;
  createdAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type CreateWorkQueueEventInput = {
  eventId?: string;
  cursor?: number;
  idempotencyKey?: string;
  eventType: WorkQueueEventType;
  workItemId: string;
  parentWorkItemId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  runtimeJobId?: string | null;
  humanTaskId?: string | null;
  queueStatus?: WorkItemQueueStatus | null;
  reasonCodes?: string[];
  evidenceRefs?: string[];
  payload?: JsonValue;
  createdAt?: Date | string;
  rawPromptStored?: false;
  rawResponseStored?: false;
  rawTranscriptStored?: false;
  rawProviderLogStored?: false;
  rawToolLogStored?: false;
  rawDbRowsStored?: false;
  workQueueLifecycleMutated?: false;
};

export type WorkQueueEventFilter = {
  workItemId?: string | null;
  parentWorkItemId?: string | null;
  graphId?: string | null;
  eventTypes?: WorkQueueEventType[];
};

export type WorkQueueEventListener = (event: WorkQueueEvent) => void;

const listeners = new Set<WorkQueueEventListener>();

function normalizeOptionalRef(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.slice(0, MAX_REF_LENGTH) : null;
}

function normalizeReasonCodes(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .map((value) => value.slice(0, 120))
    .slice(0, MAX_REASON_CODES);
}

function normalizeEvidenceRefs(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .map((value) => value.slice(0, MAX_REF_LENGTH))
    .slice(0, MAX_EVIDENCE_REFS);
}

function assertPayloadBounded(payload: JsonValue): void {
  const byteLength = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error(`work_queue_event_payload_exceeds_limit:${byteLength}`);
  }
}

export function buildWorkQueueEvent(input: CreateWorkQueueEventInput): WorkQueueEvent {
  if (!WORK_QUEUE_EVENT_TYPE_SET.has(input.eventType)) {
    throw new Error(`unknown_work_queue_event_type:${input.eventType}`);
  }
  const raw = input as Record<string, unknown>;
  if (
    raw.rawPromptStored === true ||
    raw.rawResponseStored === true ||
    raw.rawTranscriptStored === true ||
    raw.rawProviderLogStored === true ||
    raw.rawToolLogStored === true ||
    raw.rawDbRowsStored === true
  ) {
    throw new Error("work_queue_event_raw_storage_rejected");
  }
  if (raw.workQueueLifecycleMutated === true) {
    throw new Error("work_queue_event_lifecycle_mutation_claim_rejected");
  }
  const workItemId = normalizeOptionalRef(input.workItemId);
  if (!workItemId) {
    throw new Error("work_queue_event_missing_work_item_id");
  }
  const payload = input.payload ?? {};
  assertPayloadBounded(payload);
  const createdAt =
    input.createdAt instanceof Date
      ? input.createdAt.toISOString()
      : typeof input.createdAt === "string"
        ? new Date(input.createdAt).toISOString()
        : new Date().toISOString();
  return {
    artifactKind: "work_queue_event",
    eventId: normalizeOptionalRef(input.eventId) ?? randomUUID(),
    cursor: input.cursor ?? 0,
    idempotencyKey:
      normalizeOptionalRef(input.idempotencyKey) ??
      `${input.eventType}:${workItemId}:${createdAt}:${randomUUID()}`,
    eventType: input.eventType,
    workItemId,
    parentWorkItemId: normalizeOptionalRef(input.parentWorkItemId),
    graphId: normalizeOptionalRef(input.graphId),
    nodeId: normalizeOptionalRef(input.nodeId),
    runtimeJobId: normalizeOptionalRef(input.runtimeJobId),
    humanTaskId: normalizeOptionalRef(input.humanTaskId),
    queueStatus: input.queueStatus ?? null,
    reasonCodes: normalizeReasonCodes(input.reasonCodes),
    evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
    payload,
    createdAt,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function isWorkQueueEventType(value: string): value is WorkQueueEventType {
  return WORK_QUEUE_EVENT_TYPE_SET.has(value);
}

export function doesWorkQueueEventMatchFilter(
  event: Pick<WorkQueueEvent, "eventType" | "workItemId" | "parentWorkItemId" | "graphId">,
  filter: WorkQueueEventFilter,
): boolean {
  if (filter.workItemId?.trim() && event.workItemId !== filter.workItemId.trim()) {
    return false;
  }
  if (
    filter.parentWorkItemId?.trim() &&
    event.parentWorkItemId !== filter.parentWorkItemId.trim()
  ) {
    return false;
  }
  if (filter.graphId?.trim() && event.graphId !== filter.graphId.trim()) {
    return false;
  }
  if ((filter.eventTypes?.length ?? 0) > 0 && !filter.eventTypes!.includes(event.eventType)) {
    return false;
  }
  return true;
}

export function onWorkQueueEvent(listener: WorkQueueEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitWorkQueueEvent(event: WorkQueueEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function clearWorkQueueEventListenersForTests(): void {
  listeners.clear();
}
