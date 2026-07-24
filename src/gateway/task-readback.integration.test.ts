import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import {
  createTaskLifecycleReadbackContext,
  type TaskLifecycleReadbackContext,
} from "./task-lifecycle-readback.js";
import { mapTaskSummary } from "./task-summary-projection.js";

function task(overrides: Partial<TaskRecord> & Pick<TaskRecord, "taskId" | "status">): TaskRecord {
  return {
    runtime: "cli",
    requesterSessionKey: "agent:coding:subagent:parent",
    ownerKey: "agent:coding:subagent:parent",
    scopeKind: "session",
    task: "Implement the accepted plan.",
    deliveryStatus: "pending",
    notifyPolicy: "done_only",
    createdAt: 10,
    ...overrides,
  };
}

function fixtureContext(params: {
  tasks: TaskRecord[];
  session: SessionEntry;
  flow: TaskFlowRecord;
}): TaskLifecycleReadbackContext {
  return createTaskLifecycleReadbackContext({
    tasks: params.tasks,
    readSessionEntry: () => params.session,
    readTaskFlow: () => params.flow,
  });
}

describe("shared task lifecycle readback", () => {
  it("keeps logical truth while exposing reopened children and stale evidence", () => {
    const parent = task({
      taskId: "task-parent",
      status: "running",
      runId: "run-parent",
      parentFlowId: "flow-1",
      startedAt: 20,
      lastEventAt: 50,
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 4,
        updatedAt: 50,
        latestEvent: {
          at: 50,
          kind: "progress",
          metadata: {
            provider: "openai",
            model: "gpt-5.6-codex",
            reasoning: "high",
            profile: "coding",
            providerState: "fallback_recovered",
            providerCause: "disconnect",
            providerAttemptId: "attempt-2",
            providerAttemptStatus: "running",
            governingArtifactRef: "plans/example.md",
            governingArtifactDigest: "a".repeat(64),
            observedArtifactDigest: "b".repeat(64),
            validationDigest: "a".repeat(64),
            reviewReceiptRef: "reviews/example.json",
            reviewedDigest: "a".repeat(64),
            reviewVerdict: "approve",
            handoffTarget: "coding",
            handoffDigest: "b".repeat(64),
          },
        },
      },
    });
    const reopened = task({
      taskId: "task-child-reopened",
      taskKind: "codex-native-subagent",
      status: "running",
      runId: "codex-native-subagent:thread-child-1",
      startedAt: 25,
      lastEventAt: 60,
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 3,
        updatedAt: 60,
        latestEvent: {
          at: 60,
          kind: "progress",
          metadata: {
            codexNativeSubagent: true,
            parentThreadId: "thread-parent",
            childThreadId: "thread-child-1",
            childPhase: "followup_task",
            childRole: "test_engineer",
            childModel: "gpt-5.6-codex",
            childReasoningEffort: "high",
          },
        },
      },
    });
    const cancelled = task({
      taskId: "task-child-cancelled",
      taskKind: "codex-native-subagent",
      status: "cancelled",
      runId: "codex-native-subagent:thread-child-2",
      startedAt: 26,
      endedAt: 45,
      lastEventAt: 45,
      deliveryStatus: "not_applicable",
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 2,
        updatedAt: 45,
        latestEvent: {
          at: 45,
          kind: "cancelled",
          metadata: {
            codexNativeSubagent: true,
            parentThreadId: "thread-parent",
            childThreadId: "thread-child-2",
            childPhase: "child_cancelled",
          },
        },
      },
    });
    const session = {
      sessionId: "thread-parent",
      updatedAt: 61,
      status: "running",
      modelProvider: "openai",
      model: "gpt-5.6-codex",
      reasoningLevel: "high",
      agentHarnessId: "coding",
      worktree: {
        id: "wt-1",
        branch: "openclaw/test",
        repoRoot: "/repo",
        kind: "system-change",
        baseRef: "base-a",
      },
    } satisfies SessionEntry;
    const flow = {
      flowId: "flow-1",
      syncMode: "managed",
      ownerKey: parent.ownerKey,
      controllerId: "tests/readback",
      revision: 3,
      status: "running",
      notifyPolicy: "done_only",
      goal: "Implement",
      currentStep: "validation",
      stateJson: { state: "validating" },
      createdAt: 5,
      updatedAt: 55,
    } satisfies TaskFlowRecord;
    const summary = mapTaskSummary(parent, {
      lifecycleContext: fixtureContext({
        tasks: [parent, reopened, cancelled],
        session,
        flow,
      }),
    });

    expect(summary.status).toBe("running");
    expect(summary.readback).toMatchObject({
      logicalStatus: "running",
      nativeTaskStatus: "running",
      physical: {
        active: true,
        attemptId: "attempt-2",
        attemptStatus: "running",
      },
      activeChildCount: 1,
      queuedChildCount: 0,
      terminalChildCount: 1,
      followupActive: true,
      worktree: {
        id: "wt-1",
        writeOwnerTaskId: "task-child-reopened",
      },
      execution: {
        provider: "openai",
        model: "gpt-5.6-codex",
        reasoning: "high",
        profile: "coding",
      },
      provider: {
        state: "fallback_recovered",
        cause: "disconnect",
        attemptId: "attempt-2",
      },
      taskFlow: {
        flowId: "flow-1",
        revision: 3,
        status: "running",
        terminal: false,
        stateLabel: "validating",
      },
      artifact: {
        stale: true,
      },
    });
    expect(summary.readback?.children.map((child) => [child.taskId, child.status])).toEqual([
      ["task-child-cancelled", "cancelled"],
      ["task-child-reopened", "running"],
    ]);
    expect(summary.readback?.mismatches.map((entry) => entry.code)).toEqual([
      "validation_digest_stale",
      "handoff_digest_mismatch",
    ]);
  });

  it("does not let a failed physical attempt overwrite settled logical truth", () => {
    const parent = task({
      taskId: "task-parent",
      status: "succeeded",
      runId: "run-parent",
      deliveryStatus: "delivered",
      endedAt: 100,
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 5,
        updatedAt: 100,
        latestEvent: {
          at: 100,
          kind: "succeeded",
          metadata: {
            providerAttemptId: "attempt-1",
            providerAttemptStatus: "failed",
            providerCause: "disconnect",
          },
        },
      },
    });
    const session = {
      sessionId: "thread-parent",
      updatedAt: 100,
      status: "done",
    } satisfies SessionEntry;
    const flow = {
      flowId: "unused",
      syncMode: "managed",
      ownerKey: parent.ownerKey,
      controllerId: "tests/readback",
      revision: 1,
      status: "succeeded",
      notifyPolicy: "done_only",
      goal: "Implement",
      createdAt: 5,
      updatedAt: 100,
      endedAt: 100,
    } satisfies TaskFlowRecord;

    const summary = mapTaskSummary(parent, {
      lifecycleContext: fixtureContext({ tasks: [parent], session, flow }),
    });

    expect(summary.status).toBe("completed");
    expect(summary.readback?.logicalStatus).toBe("completed");
    expect(summary.readback?.physical?.attemptStatus).toBe("failed");
    expect(summary.readback?.deliveryStatus).toBe("delivered");
    expect(summary.readback?.mismatches).toEqual([]);
  });
});
