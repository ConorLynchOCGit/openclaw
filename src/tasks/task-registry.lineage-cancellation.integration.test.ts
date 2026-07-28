// Proves managed TaskFlow cancellation as the durable lineage tombstone.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { cancelFlowById, completeTaskRunByRunId, runTaskInFlowForOwner } from "./task-executor.js";
import { createManagedTaskFlow, getTaskFlowById, resumeFlow } from "./task-flow-registry.js";
import {
  createTaskRecord,
  finalizeTaskLineageBeforeRunAbort,
  finalizeTaskRunByRunId,
  getTaskById,
  listTasksForFlowId,
  markTaskTerminalById,
} from "./task-registry.js";
import { runTaskRegistryMaintenance } from "./task-registry.maintenance.js";
import {
  resetTaskRegistryControlRuntimeForTests,
  resetTaskRegistryForTests,
  resetTaskFlowRegistryForTests,
  setTaskRegistryControlRuntimeForTests,
} from "./task-runtime.test-helpers.js";

function runTaskInFlow(
  params: Omit<Parameters<typeof runTaskInFlowForOwner>[0], "callerOwnerKey">,
) {
  return runTaskInFlowForOwner({
    ...params,
    callerOwnerKey: "agent:main:main",
  });
}

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
        cancelActiveCronTaskRun: vi.fn(() => false),
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

  it("tombstones foreground descendants before a physical parent abort", async () => {
    await withStateDirEnv("openclaw-task-parent-cancel-", async () => {
      resetTaskRegistryForTests({ persist: false });

      const parent = createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:planning:main",
        scopeKind: "session",
        childSessionKey: "agent:planning:main",
        runId: "run-parent-cancel",
        task: "Parent turn",
        status: "running",
      });
      if (!parent) {
        throw new Error("Expected parent task");
      }
      const child = createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:planning:main",
        scopeKind: "session",
        childSessionKey: "agent:researcher:subagent:child",
        runId: "run-child-cancel",
        parentTaskId: parent.taskId,
        task: "Child turn",
        status: "running",
      });
      if (!child) {
        throw new Error("Expected child task");
      }
      const grandchild = createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:researcher:subagent:child",
        scopeKind: "session",
        childSessionKey: "agent:researcher:subagent:grandchild",
        runId: "run-grandchild-cancel",
        parentTaskId: child.taskId,
        task: "Grandchild turn",
        status: "queued",
      });
      if (!grandchild) {
        throw new Error("Expected grandchild task");
      }

      // tasks.cancel persists the parent before chat abort reaches this owner.
      markTaskTerminalById({
        taskId: parent.taskId,
        status: "cancelled",
        endedAt: 200,
        error: "Cancelled by operator.",
      });

      expect(
        finalizeTaskLineageBeforeRunAbort({
          runId: parent.runId!,
          status: "cancelled",
          endedAt: 201,
          error: "Agent run was cancelled.",
        }),
      ).toBe(true);
      expect(getTaskById(parent.taskId)?.status).toBe("cancelled");
      expect(getTaskById(child.taskId)?.status).toBe("cancelled");
      expect(getTaskById(grandchild.taskId)?.status).toBe("cancelled");

      // The physical abort may report an error after the durable tombstone.
      finalizeTaskRunByRunId({
        runId: child.runId!,
        runtime: "subagent",
        sessionKey: child.childSessionKey,
        status: "failed",
        endedAt: 202,
        error: "AbortError: agent run aborted",
      });
      expect(getTaskById(child.taskId)?.status).toBe("cancelled");
    });
  });
});
