import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import {
  createTaskLifecycleReadbackContext,
  type TaskLifecycleReadbackContext,
} from "../tasks/task-lifecycle-readback.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { mapTaskSummary } from "./server-methods/task-summary.js";

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
    readWorktree: (worktreeId) => ({
      id: worktreeId,
      name: "test-worktree",
      repoFingerprint: "sha256:repo",
      repoRoot: "/repo",
      path: "/repo/worktrees/test",
      branch: "openclaw/test",
      baseRef: "abc123",
      ownerKind: "session",
      ownerId: params.session.sessionId,
      createdAt: 1,
      lastActiveAt: 50,
    }),
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
      detail: {
        provider: "openai",
        model: "gpt-5.6-codex",
        reasoning: "high",
        profile: "coding",
        providerState: "fallback_recovered",
        providerCause: "disconnect",
        providerAttemptId: "attempt-2",
        providerAttemptStatus: "running",
        providerAttemptNumber: 2,
        physicalAttemptStartedAt: 40,
        continuationReason: "disconnect",
        lastTurnCompactions: 1,
        requestLocalReductionCount: 3,
        requestLocalReductionRoute: "prompt_projection",
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
    });
    const reopened = task({
      taskId: "task-child-reopened",
      taskKind: "codex-native-subagent",
      status: "running",
      runId: "codex-native-subagent:thread-child-1",
      startedAt: 25,
      lastEventAt: 60,
      detail: {
        codexNativeSubagent: true,
        parentThreadId: "thread-parent",
        childThreadId: "thread-child-1",
        childPhase: "child_active",
        childAttemptKind: "follow_up",
        childOperationId: "follow-up-call",
        childRole: "test_engineer",
        childModel: "gpt-5.6-codex",
        childReasoningEffort: "high",
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
      detail: {
        codexNativeSubagent: true,
        parentThreadId: "thread-parent",
        childThreadId: "thread-child-2",
        childPhase: "child_cancelled",
      },
    });
    const session = {
      sessionId: "openclaw-session-parent",
      updatedAt: 61,
      lastActivityAt: 58,
      compactionCount: 4,
      status: "running",
      modelProvider: "openai",
      model: "gpt-5.6-codex",
      reasoningLevel: "high",
      agentHarnessId: "coding",
      pluginExtensions: {
        codex: {
          execution: {
            schema: "openclaw.codex.execution.v1",
            threadId: "thread-parent",
            action: "resumed",
            cwd: "/repo/worktrees/test",
            identityWorkspaceDir: "/srv/openclaw/agents/coding",
            model: "gpt-5.6-codex",
            modelProvider: "openai",
            permissionProfile: ":workspace",
            runtimeWorkspaceRoots: ["/repo/worktrees/test"],
            instructionSources: [],
            appServerVersion: "0.144.1",
            runtimeFingerprint: "sha256:runtime",
            systemProfile: {
              layerVersion: "sha256:profile",
              purposeAgents: ["implementer", "test_engineer"],
              capabilityRoots: ["codex-system-skills"],
              workbenchMcp: true,
            },
          },
        },
      },
      worktree: {
        id: "wt-1",
        branch: "openclaw/test",
        repoRoot: "/repo",
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
      logicalStartedAt: 20,
      lastRealActivityAt: 60,
      physical: {
        active: true,
        startedAt: 40,
        attemptNumber: 2,
        continuationReason: "disconnect",
        attemptId: "attempt-2",
        attemptStatus: "running",
      },
      activeChildCount: 1,
      queuedChildCount: 0,
      terminalChildCount: 1,
      followupActive: true,
      worktree: {
        id: "wt-1",
        baseRef: "abc123",
        writeOwnerTaskIds: ["task-child-reopened"],
        writeOwnerTaskId: "task-child-reopened",
      },
      execution: {
        provider: "openai",
        model: "gpt-5.6-codex",
        reasoning: "high",
        profile: "coding",
      },
      codex: {
        threadId: "thread-parent",
        action: "resumed",
        cwd: "/repo/worktrees/test",
        identityWorkspaceDir: "/srv/openclaw/agents/coding",
        permissionProfile: ":workspace",
        runtimeWorkspaceRoots: ["/repo/worktrees/test"],
        instructionSources: [],
        systemProfile: {
          layerVersion: "sha256:profile",
          purposeAgents: ["implementer", "test_engineer"],
          capabilityRoots: ["codex-system-skills"],
          workbenchMcp: true,
        },
      },
      context: {
        nativeCompactionCount: 4,
        lastTurnCompactions: 1,
        requestLocalReductions: {
          count: 3,
          route: "prompt_projection",
        },
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
    expect(summary.readback?.children[1]).toMatchObject({
      attemptKind: "follow_up",
      operationId: "follow-up-call",
      phase: "child_active",
    });
    expect(summary.readback?.mismatches.map((entry) => entry.code)).toEqual([
      "validation_digest_stale",
      "handoff_digest_mismatch",
    ]);
  });

  it("reports every concurrent native write owner without inventing a single owner", () => {
    const parent = task({
      taskId: "task-parent",
      status: "running",
      runId: "run-parent",
      startedAt: 20,
      lastEventAt: 30,
    });
    const first = task({
      taskId: "task-child-first",
      parentTaskId: parent.taskId,
      taskKind: "codex-native-subagent",
      status: "running",
      startedAt: 25,
      lastEventAt: 40,
      detail: {
        codexNativeSubagent: true,
        parentThreadId: "thread-parent",
        childThreadId: "thread-child-first",
        childPhase: "child_active",
      },
    });
    const followup = task({
      taskId: "task-child-followup",
      parentTaskId: parent.taskId,
      taskKind: "codex-native-subagent",
      status: "running",
      startedAt: 26,
      lastEventAt: 41,
      detail: {
        codexNativeSubagent: true,
        parentThreadId: "thread-parent",
        childThreadId: "thread-child-followup",
        childPhase: "child_active",
        childAttemptKind: "follow_up",
        childOperationId: "follow-up-call",
      },
    });
    const session = {
      sessionId: "thread-parent",
      updatedAt: 41,
      status: "running",
      worktree: {
        id: "wt-1",
        branch: "openclaw/test",
        repoRoot: "/repo",
      },
    } satisfies SessionEntry;
    const flow = {
      flowId: "unused",
      syncMode: "managed",
      ownerKey: parent.ownerKey,
      controllerId: "tests/readback",
      revision: 1,
      status: "running",
      notifyPolicy: "done_only",
      goal: "Implement",
      createdAt: 5,
      updatedAt: 41,
    } satisfies TaskFlowRecord;

    const summary = mapTaskSummary(parent, {
      lifecycleContext: fixtureContext({
        tasks: [parent, first, followup],
        session,
        flow,
      }),
    });

    expect(summary.readback?.followupActive).toBe(true);
    expect(summary.readback?.worktree).toEqual({
      id: "wt-1",
      baseRef: "abc123",
      writeOwnerTaskIds: ["task-child-first", "task-child-followup"],
    });
  });

  it("does not let a failed physical attempt overwrite settled logical truth", () => {
    const parent = task({
      taskId: "task-parent",
      status: "succeeded",
      runId: "run-parent",
      deliveryStatus: "delivered",
      endedAt: 100,
      detail: {
        providerAttemptId: "attempt-1",
        providerAttemptStatus: "failed",
        providerCause: "disconnect",
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

  it("exposes cancellation that physically completed as a lifecycle disagreement", () => {
    const parent = task({
      taskId: "task-parent",
      status: "cancelled",
      runId: "run-parent",
      endedAt: 100,
      detail: {
        providerState: "succeeded",
        providerAttemptStatus: "succeeded",
      },
    });
    const session = {
      sessionId: "thread-parent",
      updatedAt: 110,
      status: "done",
    } satisfies SessionEntry;
    const flow = {
      flowId: "unused",
      syncMode: "managed",
      ownerKey: parent.ownerKey,
      controllerId: "tests/readback",
      revision: 1,
      status: "cancelled",
      notifyPolicy: "done_only",
      goal: "Implement",
      createdAt: 5,
      updatedAt: 100,
      endedAt: 100,
    } satisfies TaskFlowRecord;

    const summary = mapTaskSummary(parent, {
      lifecycleContext: fixtureContext({ tasks: [parent], session, flow }),
    });

    expect(summary.readback?.mismatches).toContainEqual({
      code: "logical_cancelled_provider_succeeded",
      owners: ["task-registry", "provider-attempt", "session-store"],
      evidence: ["task:cancelled", "provider:succeeded", "attempt:succeeded", "session:done"],
    });
  });
});
