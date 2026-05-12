import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createWorkQueueParentChildActionGraph,
  validateActionGraphAcyclic,
} from "./action-graph.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

async function withWorkQueue<T>(work: (workQueue: WorkQueueRepository) => Promise<T>): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const now = () => new Date("2026-05-10T00:00:00.000Z");
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic", now });
    return await work(new WorkQueueRepository(database.sql, runtimeJobs, { now }));
  } finally {
    await database.close();
  }
}

describe("Work Queue parent/child action graph", () => {
  it("persists parent, child actions, dependencies, assignments, and graph refs", async () => {
    await withWorkQueue(async (workQueue) => {
      const readback = await createWorkQueueParentChildActionGraph({
        workQueue,
        graph: {
          parentWorkItemId: "parent-1",
          title: "Runtime graph readback",
          ownerObjective: "Improve Runtime Work Graph owner readback.",
          approvedPlanRefs: ["artifact://plan"],
          graphId: "graph-1",
          childActions: [
            {
              actionId: "implementation-action",
              actionKind: "coding",
              title: "Implement readback",
              assignedRole: "implementation_engineer",
              assignedWorkflow: "agent_team.coding",
              graphNodeRef: "runtime-work-graph://node/implementation",
            },
            {
              actionId: "qa-action",
              actionKind: "qa_test",
              title: "Validate readback",
              assignedRole: "test_engineer",
              assignedWorkflow: "agent_team.qa_test",
              dependencyActionIds: ["implementation-action"],
              evidenceRefs: ["pnpm test:file action-graph.test.ts"],
            },
          ],
        },
      });

      expect(readback.parentWorkItemId).toBe("parent-1");
      expect(readback.childActions).toHaveLength(2);
      expect(readback.dependencyEdges).toEqual([
        {
          workItemId: "qa-action",
          dependsOnWorkItemId: "implementation-action",
          dependencyType: "action_depends_on",
        },
      ]);
      expect(readback.planningStatusIsLifecycleState).toBe(false);
      expect(readback.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("rejects dependency cycles before writing graph", () => {
    expect(() =>
      validateActionGraphAcyclic([
        {
          actionId: "a",
          actionKind: "coding",
          title: "A",
          assignedRole: "implementation_engineer",
          assignedWorkflow: "agent_team.coding",
          dependencyActionIds: ["b"],
        },
        {
          actionId: "b",
          actionKind: "qa_test",
          title: "B",
          assignedRole: "test_engineer",
          assignedWorkflow: "agent_team.qa_test",
          dependencyActionIds: ["a"],
        },
      ]),
    ).toThrow(/cycle/u);
  });

  it("rejects raw storage metadata", async () => {
    await withWorkQueue(async (workQueue) => {
      await expect(
        createWorkQueueParentChildActionGraph({
          workQueue,
          graph: {
            parentWorkItemId: "raw-parent",
            title: "Raw trap",
            ownerObjective: "Raw trap",
            approvedPlanRefs: [],
            graphId: "graph-raw",
            childActions: [
              {
                actionId: "raw-child",
                actionKind: "coding",
                title: "Raw child",
                assignedRole: "implementation_engineer",
                assignedWorkflow: "agent_team.coding",
                metadata: { rawResponseStored: true },
              },
            ],
          },
        }),
      ).rejects.toThrow(/raw storage/u);
    });
  });
});
