import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueEventStore } from "./work-queue-event-store.ts";
import {
  buildWorkQueueEvent,
  clearWorkQueueEventListenersForTests,
  onWorkQueueEvent,
  WORK_QUEUE_EVENT_TYPES,
} from "./work-queue-events.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

describe("work queue event contract", () => {
  it("builds bounded events and rejects raw storage claims", () => {
    const event = buildWorkQueueEvent({
      eventType: "work_queue.child_created",
      workItemId: "child-1",
      parentWorkItemId: "parent-1",
      graphId: "graph-1",
      reasonCodes: ["created"],
      evidenceRefs: ["runtime-work-graph://graph-1/node/node-1"],
      createdAt: "2026-05-14T00:00:00.000Z",
    });

    expect(event).toMatchObject({
      artifactKind: "work_queue_event",
      eventType: "work_queue.child_created",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(() =>
      buildWorkQueueEvent({
        eventType: "work_queue.child_created",
        workItemId: "child-1",
        rawPromptStored: true as false,
      }),
    ).toThrow("work_queue_event_raw_storage_rejected");
  });

  it("includes parallel runtime graph event vocabulary", () => {
    expect(WORK_QUEUE_EVENT_TYPES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });
});

describe("work queue event store", () => {
  it("persists and replays DB-backed Work Queue events with in-process push", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql);
      const eventStore = new WorkQueueEventStore(database.sql);
      const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { eventStore });
      const listener = vi.fn();
      clearWorkQueueEventListenersForTests();
      const unsubscribe = onWorkQueueEvent(listener);

      const parent = await workQueue.createWorkItem({
        workItemId: "event-parent",
        itemType: "execution_workflow",
        title: "Event parent",
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "graph-events",
        nodeId: "node-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "active",
        evidenceRefs: ["runtime-work-graph://graph-events/node/node-1"],
      });

      const replay = await eventStore.listEvents({ parentWorkItemId: parent.workItemId });
      const latestCursor = await eventStore.getLatestCursor();

      expect(listener).toHaveBeenCalled();
      expect(replay.events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining(["work_queue.child_created", "work_queue.graph_node_started"]),
      );
      expect(latestCursor).toBeGreaterThanOrEqual(replay.events.at(-1)?.cursor ?? 0);
      expect(replay.events.every((event) => !event.rawPromptStored)).toBe(true);
      unsubscribe();
    } finally {
      await database.close();
      clearWorkQueueEventListenersForTests();
    }
  });

  it("emits specific role, validation, repair, human, and closeout event types for graph nodes", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql);
      const eventStore = new WorkQueueEventStore(database.sql);
      const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { eventStore });
      clearWorkQueueEventListenersForTests();

      const parent = await workQueue.createWorkItem({
        workItemId: "parallel-event-parent",
        itemType: "execution_workflow",
        title: "Parallel event parent",
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "implementation-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "active",
        evidenceRefs: ["runtime-work-graph://parallel-graph/node/implementation-1"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "implementation-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        evidenceRefs: ["artifact://validation/implementation-1"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "validation-1",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        assignedWorkflow: "qa.test",
        queueStatus: "needs_review",
        evidenceRefs: ["artifact://validation/validation-1"],
        blockerReasonCodes: ["validation_failed"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "repair-1",
        nodeKind: "repair",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        evidenceRefs: ["artifact://repair/repair-1"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "human-1",
        nodeKind: "human_task",
        assignedRole: "human_operator",
        assignedWorkflow: "human/operator",
        queueStatus: "blocked",
        humanTaskId: "human-task-1",
        evidenceRefs: ["runtime-work-graph://parallel-graph/human-task/human-task-1"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        nodeId: "closeout-1",
        nodeKind: "closeout",
        assignedRole: "orchestrator",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        evidenceRefs: ["closeout-capsule://parallel-graph/capsule"],
      });

      const replay = await eventStore.listEvents({
        parentWorkItemId: parent.workItemId,
        graphId: "parallel-graph",
        limit: 100,
      });
      const eventTypes = replay.events.map((event) => event.eventType);

      expect(eventTypes).toEqual(
        expect.arrayContaining([
          "work_queue.active_worker_changed",
          "work_queue.role_invocation_started",
          "work_queue.role_invocation_completed",
          "work_queue.validation_failed",
          "work_queue.repair_completed",
          "work_queue.human_task_blocked",
          "work_queue.closeout_accepted",
        ]),
      );
      expect(replay.events.every((event) => !event.rawProviderLogStored)).toBe(true);
    } finally {
      await database.close();
      clearWorkQueueEventListenersForTests();
    }
  });
});
