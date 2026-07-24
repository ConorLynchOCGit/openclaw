// Proves managed TaskFlow cancellation as the durable lineage tombstone.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { cancelFlowById, completeTaskRunByRunId, runTaskInFlow } from "./task-executor.js";
import {
  createManagedTaskFlow,
  getTaskFlowById,
  resetTaskFlowRegistryForTests,
  resumeFlow,
} from "./task-flow-registry.js";
import {
  getTaskById,
  listTasksForFlowId,
  resetTaskRegistryControlRuntimeForTests,
  resetTaskRegistryForTests,
  setTaskRegistryControlRuntimeForTests,
} from "./task-registry.js";
import { runTaskRegistryMaintenance } from "./task-registry.maintenance.js";

describe("task lineage cancellation", () => {
  afterEach(() => {
    resetTaskRegistryControlRuntimeForTests();
    resetTaskRegistryForTests({ persist: false });
    resetTaskFlowRegistryForTests({ persist: false });
  });

  it("persists cancellation before aborting descendants and rejects later admission", async () => {
    await withStateDirEnv("openclaw-task-lineage-cancel-", async () => {
      resetTaskRegistryForTests({ persist: false });
      resetTaskFlowRegistryForTests({ persist: false });

      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/lineage-cancellation",
        goal: "Cancel one logical task lineage",
        status: "running",
      });
      if (!flow) {
        throw new Error("Expected managed flow creation");
      }

      const settled = runTaskInFlow({
        flowId: flow.flowId,
        runtime: "subagent",
        childSessionKey: "agent:worker:subagent:settled",
        runId: "run-lineage-settled",
        task: "Already settled child",
        deliveryStatus: "not_applicable",
        status: "running",
        startedAt: Date.now(),
      });
      if (!settled.task) {
        throw new Error("Expected settled child creation");
      }
      completeTaskRunByRunId({
        runId: "run-lineage-settled",
        runtime: "subagent",
        sessionKey: "agent:worker:subagent:settled",
        endedAt: Date.now(),
        terminalSummary: "settled before cancellation",
      });

      const settledFlow = getTaskFlowById(flow.flowId);
      if (!settledFlow) {
        throw new Error("Expected settled flow");
      }
      const resumed = resumeFlow({
        flowId: flow.flowId,
        expectedRevision: settledFlow.revision,
        status: "running",
      });
      if (!resumed.applied) {
        throw new Error(`Expected flow resume, got ${resumed.reason}`);
      }

      const active = runTaskInFlow({
        flowId: flow.flowId,
        runtime: "subagent",
        childSessionKey: "agent:worker:subagent:active",
        runId: "run-lineage-active",
        task: "Active child",
        deliveryStatus: "not_applicable",
        status: "running",
        startedAt: Date.now(),
      });
      const queued = runTaskInFlow({
        flowId: flow.flowId,
        runtime: "subagent",
        childSessionKey: "agent:worker:subagent:queued",
        runId: "run-lineage-queued",
        task: "Queued child",
        deliveryStatus: "not_applicable",
      });
      if (!active.task || !queued.task) {
        throw new Error("Expected active and queued descendants");
      }

      const abortedSessionKeys: string[] = [];
      setTaskRegistryControlRuntimeForTests({
        getAcpSessionManager: () => ({
          cancelSession: vi.fn(async () => undefined),
        }),
        killSubagentRunAdmin: vi.fn(async ({ sessionKey }) => {
          const persistedFlow = getTaskFlowById(flow.flowId);
          expect(persistedFlow?.cancelRequestedAt).toEqual(expect.any(Number));
          abortedSessionKeys.push(sessionKey);
          return {
            found: true as const,
            killed: true,
            runId:
              sessionKey === "agent:worker:subagent:active"
                ? "run-lineage-active"
                : "run-lineage-queued",
            sessionKey,
            cascadeKilled: 0,
          };
        }),
      });

      const cancelled = await cancelFlowById({ cfg: {}, flowId: flow.flowId });

      expect(cancelled).toMatchObject({ found: true, cancelled: true });
      expect(abortedSessionKeys.toSorted()).toEqual([
        "agent:worker:subagent:active",
        "agent:worker:subagent:queued",
      ]);
      expect(getTaskById(settled.task.taskId)?.status).toBe("succeeded");
      expect(getTaskById(active.task.taskId)?.status).toBe("cancelled");
      expect(getTaskById(queued.task.taskId)?.status).toBe("cancelled");
      expect(getTaskFlowById(flow.flowId)).toMatchObject({
        status: "cancelled",
        cancelRequestedAt: expect.any(Number),
      });

      const rejected = runTaskInFlow({
        flowId: flow.flowId,
        runtime: "subagent",
        childSessionKey: "agent:worker:subagent:future",
        runId: "run-lineage-future",
        task: "Future child must not start",
        deliveryStatus: "not_applicable",
      });
      expect(rejected).toMatchObject({
        found: true,
        created: false,
        reason: "Flow cancellation has already been requested.",
      });

      resetTaskRegistryForTests({ persist: false });
      resetTaskFlowRegistryForTests({ persist: false });
      await runTaskRegistryMaintenance();

      expect(getTaskFlowById(flow.flowId)).toMatchObject({
        status: "cancelled",
        cancelRequestedAt: expect.any(Number),
      });
      expect(
        listTasksForFlowId(flow.flowId).map(({ runId, status }) => ({ runId, status })),
      ).toEqual(
        expect.arrayContaining([
          { runId: "run-lineage-settled", status: "succeeded" },
          { runId: "run-lineage-active", status: "cancelled" },
          { runId: "run-lineage-queued", status: "cancelled" },
        ]),
      );
      expect(
        runTaskInFlow({
          flowId: flow.flowId,
          runtime: "subagent",
          childSessionKey: "agent:worker:subagent:restart",
          runId: "run-lineage-after-restart",
          task: "Restart recovery must not revive this lineage",
          deliveryStatus: "not_applicable",
        }),
      ).toMatchObject({ created: false });
    });
  });
});
