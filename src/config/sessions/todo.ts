import crypto from "node:crypto";
import { loadSessionStore, resolveSessionStoreEntry, updateSessionStoreEntry } from "./store.js";
import type {
  SessionTodoItem,
  SessionTodoPriority,
  SessionTodoState,
  SessionTodoStatus,
  SessionTodoUpdateEvent,
} from "./types.js";

export type SessionTodoInputItem = {
  content: string;
  status: SessionTodoStatus;
  priority?: SessionTodoPriority;
};

export type SessionTodoUpdateResult =
  | {
      persisted: true;
      sessionKey: string;
      todoRef: string;
      todo: SessionTodoState;
      event: SessionTodoUpdateEvent;
    }
  | {
      persisted: false;
      sessionKey: string;
      todoRef: string;
      reason: "missing_session";
    };

const SESSION_TODO_SCHEMA_VERSION = 1 as const;
const SESSION_TODO_HISTORY_LIMIT = 50;
const SESSION_TODO_ITEM_LIMIT = 100;
const SESSION_TODO_CONTENT_LIMIT = 240;
const PRIORITIES = new Set<SessionTodoPriority>(["low", "normal", "high"]);

export function buildSessionTodoRef(sessionKey: string): string {
  return `openclaw-session-todo://${encodeURIComponent(sessionKey.trim())}`;
}

function normalizePriority(priority: SessionTodoPriority | undefined): SessionTodoPriority {
  return priority && PRIORITIES.has(priority) ? priority : "normal";
}

function normalizeTodoContent(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, SESSION_TODO_CONTENT_LIMIT);
}

export function normalizeSessionTodoItems(
  items: readonly SessionTodoInputItem[],
): SessionTodoItem[] {
  return items
    .slice(0, SESSION_TODO_ITEM_LIMIT)
    .map((item, index) => ({
      content: normalizeTodoContent(item.content),
      status: item.status,
      priority: normalizePriority(item.priority),
      position: index + 1,
    }))
    .filter((item) => item.content.length > 0);
}

function normalizeExistingHistory(value: unknown): SessionTodoUpdateEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is SessionTodoUpdateEvent => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        record.type === "todo.updated" &&
        typeof record.eventId === "string" &&
        typeof record.updatedAt === "number" &&
        Array.isArray(record.items)
      );
    })
    .slice(-SESSION_TODO_HISTORY_LIMIT);
}

function isSessionTodoState(value: unknown): value is SessionTodoState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === SESSION_TODO_SCHEMA_VERSION &&
    typeof record.sessionKey === "string" &&
    typeof record.updatedAt === "number" &&
    Array.isArray(record.items) &&
    Array.isArray(record.history)
  );
}

export function readSessionTodo(params: {
  storePath: string;
  sessionKey: string;
}): SessionTodoState | null {
  try {
    const store = loadSessionStore(params.storePath, { skipCache: true });
    const resolved = resolveSessionStoreEntry({ store, sessionKey: params.sessionKey });
    const todo = resolved.existing?.todo;
    return isSessionTodoState(todo) ? todo : null;
  } catch {
    return null;
  }
}

function buildTodoEvent(params: {
  sessionKey: string;
  updatedAt: number;
  items: SessionTodoItem[];
  sourceToolCallId?: string;
  explanation?: string;
}): SessionTodoUpdateEvent {
  const completedCount = params.items.filter((item) => item.status === "completed").length;
  const inProgressCount = params.items.filter((item) => item.status === "in_progress").length;
  const eventHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sessionKey: params.sessionKey,
        updatedAt: params.updatedAt,
        sourceToolCallId: params.sourceToolCallId,
        items: params.items,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    eventId: `todo_${eventHash}`,
    type: "todo.updated",
    updatedAt: params.updatedAt,
    itemCount: params.items.length,
    completedCount,
    inProgressCount,
    ...(params.sourceToolCallId ? { sourceToolCallId: params.sourceToolCallId } : {}),
    ...(params.explanation ? { explanation: params.explanation } : {}),
    items: params.items,
  };
}

export async function updateSessionTodo(params: {
  storePath: string;
  sessionKey: string;
  items: readonly SessionTodoInputItem[];
  explanation?: string;
  sourceToolCallId?: string;
  now?: number;
}): Promise<SessionTodoUpdateResult> {
  const sessionKey = params.sessionKey.trim();
  const todoRef = buildSessionTodoRef(sessionKey);
  const updatedAt = params.now ?? Date.now();
  const items = normalizeSessionTodoItems(params.items);
  let todo: SessionTodoState | null = null;
  let event: SessionTodoUpdateEvent | null = null;
  const updated = await updateSessionStoreEntry({
    storePath: params.storePath,
    sessionKey,
    update: async (entry) => {
      event = buildTodoEvent({
        sessionKey,
        updatedAt,
        items,
        sourceToolCallId: params.sourceToolCallId,
        explanation: params.explanation,
      });
      const previousHistory = normalizeExistingHistory(entry.todo?.history);
      todo = {
        schemaVersion: SESSION_TODO_SCHEMA_VERSION,
        sessionKey,
        updatedAt,
        items,
        history: [...previousHistory, event].slice(-SESSION_TODO_HISTORY_LIMIT),
      };
      return { todo };
    },
  });

  if (!updated || !todo || !event) {
    return {
      persisted: false,
      sessionKey,
      todoRef,
      reason: "missing_session",
    };
  }
  return {
    persisted: true,
    sessionKey,
    todoRef,
    todo,
    event,
  };
}
