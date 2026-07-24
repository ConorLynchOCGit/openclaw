import { afterEach, describe, expect, it } from "vitest";
import {
  buildTaskLifecycleReadback,
  createTaskLifecycleReadbackContext,
} from "../gateway/task-lifecycle-readback.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import {
  createManagedTaskFlow,
  failFlow,
  finishFlow,
  resetTaskFlowRegistryForTests,
  setFlowWaiting,
  updateFlowRecordByIdExpectedRevision,
} from "./task-flow-registry.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import type { TaskRecord } from "./task-registry.types.js";

function requireFlow(flow: TaskFlowRecord | null | undefined): TaskFlowRecord {
  if (!flow) {
    throw new Error("expected TaskFlow creation to succeed");
  }
  return flow;
}

function parentTask(flowId: string): TaskRecord {
  return {
    taskId: `task-${flowId}`,
    runtime: "cli",
    requesterSessionKey: "agent:business-ops:test",
    ownerKey: "agent:business-ops:test",
    scopeKind: "session",
    parentFlowId: flowId,
    task: "Publish the candidate package.",
    status: "succeeded",
    deliveryStatus: "delivered",
    notifyPolicy: "done_only",
    createdAt: 1,
    endedAt: 2,
  };
}

function readbackFor(task: TaskRecord, flow: TaskFlowRecord) {
  return buildTaskLifecycleReadback(
    task,
    createTaskLifecycleReadbackContext({
      tasks: [task],
      readSessionEntry: () => undefined,
      readTaskFlow: () => flow,
    }),
  );
}

describe("TaskFlow terminal projection convergence", () => {
  afterEach(() => {
    resetTaskFlowRegistryForTests();
  });

  it("projects complete, failed, and cancelled from their exact native revisions", async () => {
    await withOpenClawTestState(
      { layout: "state-only", prefix: "openclaw-task-flow-terminal-" },
      async () => {
        resetTaskFlowRegistryForTests();
        const created = requireFlow(
          createManagedTaskFlow({
            ownerKey: "agent:business-ops:test",
            controllerId: "tests/terminal-convergence",
            goal: "Publish candidate package",
          }),
        );
        const waiting = setFlowWaiting({
          flowId: created.flowId,
          expectedRevision: created.revision,
          currentStep: "await_candidate",
          stateJson: { state: "candidate_in_progress" },
        });
        if (!waiting.applied) {
          throw new Error("expected waiting revision");
        }
        const finished = finishFlow({
          flowId: created.flowId,
          expectedRevision: waiting.flow.revision,
          currentStep: "closed_candidate_complete",
          stateJson: { state: "closed_candidate_complete" },
          endedAt: 20,
        });
        if (!finished.applied) {
          throw new Error("expected terminal revision");
        }
        const completeReadback = readbackFor(parentTask(finished.flow.flowId), finished.flow);
        expect(completeReadback.taskFlow).toEqual({
          flowId: finished.flow.flowId,
          revision: 2,
          status: "succeeded",
          terminal: true,
          currentStep: "closed_candidate_complete",
          stateLabel: "closed_candidate_complete",
        });

        const failedCreated = requireFlow(
          createManagedTaskFlow({
            ownerKey: "agent:business-ops:test",
            controllerId: "tests/terminal-convergence",
            goal: "Failed control",
          }),
        );
        const failed = failFlow({
          flowId: failedCreated.flowId,
          expectedRevision: failedCreated.revision,
          currentStep: "failed",
          stateJson: { state: "failed" },
          endedAt: 30,
        });
        if (!failed.applied) {
          throw new Error("expected failed revision");
        }
        expect(readbackFor(parentTask(failed.flow.flowId), failed.flow).taskFlow).toMatchObject({
          revision: 1,
          status: "failed",
          terminal: true,
        });

        const cancelledCreated = requireFlow(
          createManagedTaskFlow({
            ownerKey: "agent:business-ops:test",
            controllerId: "tests/terminal-convergence",
            goal: "Cancelled control",
          }),
        );
        const cancelled = updateFlowRecordByIdExpectedRevision({
          flowId: cancelledCreated.flowId,
          expectedRevision: cancelledCreated.revision,
          patch: {
            status: "cancelled",
            currentStep: "cancelled",
            endedAt: 40,
            updatedAt: 40,
          },
        });
        if (!cancelled.applied) {
          throw new Error("expected cancelled revision");
        }
        expect(
          readbackFor(parentTask(cancelled.flow.flowId), cancelled.flow).taskFlow,
        ).toMatchObject({
          revision: 1,
          status: "cancelled",
          terminal: true,
        });
      },
    );
  });
});
