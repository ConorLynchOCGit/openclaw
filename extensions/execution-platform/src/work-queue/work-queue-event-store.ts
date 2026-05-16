import type { QueryResultRow } from "pg";
import type { SqlClient } from "../db/sql-client.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildWorkQueueEvent,
  doesWorkQueueEventMatchFilter,
  emitWorkQueueEvent,
  isWorkQueueEventType,
  type CreateWorkQueueEventInput,
  type WorkQueueEvent,
  type WorkQueueEventFilter,
} from "./work-queue-events.ts";

type WorkQueueEventRow = QueryResultRow & {
  event_id: string;
  event_cursor: number | string;
  idempotency_key: string;
  event_type: string;
  work_item_id: string;
  parent_work_item_id: string | null;
  graph_id: string | null;
  node_id: string | null;
  runtime_job_id: string | null;
  human_task_id: string | null;
  queue_status: WorkQueueEvent["queueStatus"];
  reason_codes: JsonValue;
  evidence_refs: JsonValue;
  payload: JsonValue;
  created_at: Date | string;
};

export type ListWorkQueueEventsInput = WorkQueueEventFilter & {
  afterCursor?: number | null;
  limit?: number;
};

export type ListWorkQueueEventsResult = {
  artifactKind: "work_queue_event_replay_result";
  events: WorkQueueEvent[];
  nextCursor: number | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
};

function readStringArray(value: JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function decodeWorkQueueEvent(row: WorkQueueEventRow): WorkQueueEvent {
  if (!isWorkQueueEventType(row.event_type)) {
    throw new Error(`unknown_work_queue_event_type_in_store:${row.event_type}`);
  }
  return buildWorkQueueEvent({
    eventId: row.event_id,
    cursor: Number(row.event_cursor),
    idempotencyKey: row.idempotency_key,
    eventType: row.event_type,
    workItemId: row.work_item_id,
    parentWorkItemId: row.parent_work_item_id,
    graphId: row.graph_id,
    nodeId: row.node_id,
    runtimeJobId: row.runtime_job_id,
    humanTaskId: row.human_task_id,
    queueStatus: row.queue_status,
    reasonCodes: readStringArray(row.reason_codes),
    evidenceRefs: readStringArray(row.evidence_refs),
    payload: row.payload,
    createdAt: row.created_at,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  });
}

export class WorkQueueEventStore {
  constructor(private readonly sql: SqlClient) {}

  async getLatestCursor(): Promise<number> {
    const result = await this.sql.query<{ latest_cursor: number | string | null }>(
      `
        SELECT COALESCE(MAX(event_cursor), 0) AS latest_cursor
        FROM execution_platform.work_queue_events
      `,
    );
    return Number(result.rows[0]?.latest_cursor ?? 0);
  }

  async appendEvent(
    input: CreateWorkQueueEventInput,
    sql: SqlClient = this.sql,
  ): Promise<WorkQueueEvent> {
    const event = buildWorkQueueEvent(input);
    const result = await sql.query<WorkQueueEventRow>(
      `
        INSERT INTO execution_platform.work_queue_events (
          event_id,
          idempotency_key,
          event_type,
          work_item_id,
          parent_work_item_id,
          graph_id,
          node_id,
          runtime_job_id,
          human_task_id,
          queue_status,
          reason_codes,
          evidence_refs,
          payload,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::timestamptz)
        ON CONFLICT (idempotency_key) DO UPDATE
        SET idempotency_key = EXCLUDED.idempotency_key
        RETURNING *
      `,
      [
        event.eventId,
        event.idempotencyKey,
        event.eventType,
        event.workItemId,
        event.parentWorkItemId,
        event.graphId,
        event.nodeId,
        event.runtimeJobId,
        event.humanTaskId,
        event.queueStatus,
        JSON.stringify(event.reasonCodes),
        JSON.stringify(event.evidenceRefs),
        JSON.stringify(event.payload),
        event.createdAt,
      ],
    );
    const persisted = decodeWorkQueueEvent(result.rows[0]!);
    emitWorkQueueEvent(persisted);
    return persisted;
  }

  async listEvents(input: ListWorkQueueEventsInput = {}): Promise<ListWorkQueueEventsResult> {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const params: unknown[] = [input.afterCursor ?? 0];
    const conditions = ["event_cursor > $1"];
    if (input.workItemId?.trim()) {
      params.push(input.workItemId.trim());
      conditions.push(`work_item_id = $${params.length}`);
    }
    if (input.parentWorkItemId?.trim()) {
      params.push(input.parentWorkItemId.trim());
      conditions.push(`parent_work_item_id = $${params.length}`);
    }
    if (input.graphId?.trim()) {
      params.push(input.graphId.trim());
      conditions.push(`graph_id = $${params.length}`);
    }
    if ((input.eventTypes?.length ?? 0) > 0) {
      params.push(input.eventTypes);
      conditions.push(`event_type = ANY($${params.length}::text[])`);
    }
    params.push(limit);
    const result = await this.sql.query<WorkQueueEventRow>(
      `
        SELECT *
        FROM execution_platform.work_queue_events
        WHERE ${conditions.join(" AND ")}
        ORDER BY event_cursor ASC
        LIMIT $${params.length}
      `,
      params,
    );
    const events = result.rows
      .map(decodeWorkQueueEvent)
      .filter((event) => doesWorkQueueEventMatchFilter(event, input));
    return {
      artifactKind: "work_queue_event_replay_result",
      events,
      nextCursor: events.at(-1)?.cursor ?? input.afterCursor ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
    };
  }
}
