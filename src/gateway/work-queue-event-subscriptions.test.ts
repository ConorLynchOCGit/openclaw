import { describe, expect, it } from "vitest";
import { buildWorkQueueEvent } from "../../extensions/execution-platform/src/work-queue/work-queue-events.ts";
import { createWorkQueueEventSubscriberRegistry } from "./work-queue-event-subscriptions.ts";

describe("work queue event subscriber registry", () => {
  it("matches subscribers by parent, graph, item, and event type filters", () => {
    const registry = createWorkQueueEventSubscriberRegistry();
    const event = buildWorkQueueEvent({
      eventType: "work_queue.role_invocation_started",
      workItemId: "child-1",
      parentWorkItemId: "parent-1",
      graphId: "graph-1",
      nodeId: "node-1",
      createdAt: "2026-05-14T00:00:00.000Z",
    });

    registry.subscribe("parent-sub", { parentWorkItemId: "parent-1" });
    registry.subscribe("graph-sub", { graphId: "graph-1" });
    registry.subscribe("item-sub", { workItemId: "child-1" });
    registry.subscribe("type-sub", { eventTypes: ["work_queue.role_invocation_started"] });
    registry.subscribe("wrong-sub", { graphId: "other-graph" });

    expect([...registry.getMatching(event)].toSorted()).toEqual([
      "graph-sub",
      "item-sub",
      "parent-sub",
      "type-sub",
    ]);
  });

  it("can unsubscribe and clear subscribers without leaking stale delivery targets", () => {
    const registry = createWorkQueueEventSubscriberRegistry();
    const event = buildWorkQueueEvent({
      eventType: "work_queue.item_updated",
      workItemId: "item-1",
      createdAt: "2026-05-14T00:00:00.000Z",
    });

    registry.subscribe("conn-1", {});
    expect([...registry.getMatching(event)]).toEqual(["conn-1"]);
    registry.unsubscribe("conn-1");
    expect([...registry.getMatching(event)]).toEqual([]);
    registry.subscribe("conn-2", {});
    registry.clear();
    expect([...registry.getMatching(event)]).toEqual([]);
  });
});
