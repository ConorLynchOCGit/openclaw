import type {
  WorkQueueEvent,
  WorkQueueEventFilter,
} from "../../extensions/execution-platform/src/work-queue/work-queue-events.ts";
import { doesWorkQueueEventMatchFilter } from "../../extensions/execution-platform/src/work-queue/work-queue-events.ts";

export type WorkQueueEventSubscriberRegistry = {
  subscribe: (connId: string, filter?: WorkQueueEventFilter) => void;
  unsubscribe: (connId: string) => void;
  getMatching: (event: WorkQueueEvent) => ReadonlySet<string>;
  clear: () => void;
};

export function createWorkQueueEventSubscriberRegistry(): WorkQueueEventSubscriberRegistry {
  const filtersByConnId = new Map<string, WorkQueueEventFilter>();
  const empty = new Set<string>();

  return {
    subscribe: (connId: string, filter: WorkQueueEventFilter = {}) => {
      const normalized = connId.trim();
      if (!normalized) {
        return;
      }
      filtersByConnId.set(normalized, filter);
    },
    unsubscribe: (connId: string) => {
      const normalized = connId.trim();
      if (!normalized) {
        return;
      }
      filtersByConnId.delete(normalized);
    },
    getMatching: (event: WorkQueueEvent) => {
      const connIds = new Set<string>();
      for (const [connId, filter] of filtersByConnId) {
        if (doesWorkQueueEventMatchFilter(event, filter)) {
          connIds.add(connId);
        }
      }
      return connIds.size > 0 ? connIds : empty;
    },
    clear: () => {
      filtersByConnId.clear();
    },
  };
}
