import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { HumanOperatorTaskAdapter } from "./human-operator-task-adapter.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

async function withAdapter<T>(
  work: (input: {
    graphs: RuntimeWorkGraphRepository;
    adapter: HumanOperatorTaskAdapter;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    await graphs.createGraph({
      graphId: "graph-human",
      workflowId: "runtime_work_graph.multi_action",
      orchestratorModelRef: "openai-codex/gpt-5.5",
    });
    return await work({ graphs, adapter: new HumanOperatorTaskAdapter(graphs) });
  } finally {
    await database.close();
  }
}

describe("human operator task adapter", () => {
  it("pauses graph on human task and resumes with bounded response ref", async () => {
    await withAdapter(async ({ adapter, graphs }) => {
      const created = await adapter.createTask({
        graphId: "graph-human",
        operatorId: "owner",
        promptSummary: "Choose whether to include docs update.",
        requiredResponseShape: { decision: "yes_or_no" },
        blockingNodeRefs: ["runtime-work-graph://node/orchestrator"],
      });
      const resumed = await adapter.resumeTask({
        graphId: "graph-human",
        humanTaskId: created.humanTask.humanTaskId,
        boundedResponseRef: "operator-response://decision-1",
      });
      const snapshot = await graphs.readGraphSnapshot("graph-human");

      expect(created.workflowPaused).toBe(true);
      expect(resumed.resumeAccepted).toBe(true);
      expect(snapshot?.humanTasks[0]).toMatchObject({ taskStatus: "resumed" });
      expect(snapshot?.edges.map((edge) => edge.edgeKind).toSorted()).toEqual([
        "human_resume",
        "human_wait",
      ]);
    });
  });

  it("does not resume expired human tasks", async () => {
    await withAdapter(async ({ adapter }) => {
      const created = await adapter.createTask({
        graphId: "graph-human",
        operatorId: "owner",
        promptSummary: "Expired decision",
        requiredResponseShape: { decision: "yes_or_no" },
        deadlineAt: new Date("2026-05-09T00:00:00.000Z"),
        blockingNodeRefs: [],
      });

      await expect(
        adapter.resumeTask({
          graphId: "graph-human",
          humanTaskId: created.humanTask.humanTaskId,
          boundedResponseRef: "operator-response://late",
        }),
      ).rejects.toThrow(/human_task_not_resumable/u);
    });
  });
});
