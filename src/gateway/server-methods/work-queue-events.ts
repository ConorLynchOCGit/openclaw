import {
  createExecutionPlatformDatabaseRuntime,
  WorkQueueEventStore,
  WORK_QUEUE_EVENT_TYPES,
  type WorkQueueEventFilter,
  type WorkQueueEventType,
} from "../../../extensions/execution-platform/runtime-api.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readEventTypes(value: unknown): WorkQueueEventType[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const allowed = new Set<string>(WORK_QUEUE_EVENT_TYPES);
  const eventTypes = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => allowed.has(entry)) as WorkQueueEventType[];
  return eventTypes.length > 0 ? eventTypes.slice(0, 20) : undefined;
}

function readFilter(params: Record<string, unknown>): WorkQueueEventFilter {
  return {
    workItemId: readString(params.workItemId),
    parentWorkItemId: readString(params.parentWorkItemId),
    graphId: readString(params.graphId),
    eventTypes: readEventTypes(params.eventTypes),
  };
}

export const workQueueEventHandlers: GatewayRequestHandlers = {
  "work_queue.subscribe": ({ params, client, context, respond }) => {
    const connId = client?.connId?.trim();
    if (!connId) {
      respond(true, { subscribed: false }, undefined);
      return;
    }
    context.subscribeWorkQueueEvents?.(connId, readFilter(params));
    respond(
      true,
      {
        subscribed: true,
        event: "work_queue.changed",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      undefined,
    );
  },
  "work_queue.unsubscribe": ({ client, context, respond }) => {
    const connId = client?.connId?.trim();
    if (connId) {
      context.unsubscribeWorkQueueEvents?.(connId);
    }
    respond(true, { subscribed: false }, undefined);
  },
  "work_queue.events.replay": async ({ params, respond }) => {
    const afterCursor = Number(params.afterCursor ?? 0);
    if (!Number.isFinite(afterCursor) || afterCursor < 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "afterCursor invalid"));
      return;
    }
    const database = await createExecutionPlatformDatabaseRuntime({
      config: loadConfig(),
      applyMigrations: true,
    });
    const eventStore = new WorkQueueEventStore(database.sqlClient);
    const result = await eventStore.listEvents({
      ...readFilter(params),
      afterCursor,
      limit: Number(params.limit ?? 200),
    });
    respond(true, result, undefined);
  },
};
