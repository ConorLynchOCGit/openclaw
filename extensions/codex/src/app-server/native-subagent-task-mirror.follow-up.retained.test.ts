// Codex tests cover native subagent task mirror plugin behavior.
import { describe, expect, it, vi } from "vitest";
import {
  codexNativeSubagentFollowUpRunId,
  codexNativeSubagentRunId,
  CodexNativeSubagentTaskMirror,
  type TaskLifecycleRuntime,
} from "./native-subagent-task-mirror.js";

function createRuntime() {
  return {
    listTaskRecords: vi.fn(() => []),
    tryCreateRunningTaskRun: vi.fn((params) => ({ taskId: "task-native-subagent", ...params })),
    recordTaskRunProgressByRunId: vi.fn(() => []),
    finalizeTaskRunByRunId: vi.fn(() => []),
  } as unknown as TaskLifecycleRuntime;
}

describe("CodexNativeSubagentTaskMirror", () => {
  it("creates an identified task from Codex v2 dynamic spawn and subagent activity items", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:coding:main",
        agentId: "coding",
        now: () => 41_500,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/started",
      params: {
        threadId: "parent-thread",
        turnId: "parent-turn",
        item: {
          id: "call-v2-spawn",
          type: "dynamicToolCall",
          namespace: "agents",
          tool: "spawn_agent",
          arguments: {
            agent_type: "project_explorer",
            task_name: "v2_workspace_probe",
            model: "gpt-5.6-terra",
            reasoning_effort: "medium",
            message: "Inspect the workspace and return one bounded context pack.",
            fork_turns: "none",
          },
          status: "inProgress",
        },
      },
    });
    mirror.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-thread",
        turnId: "later-parent-turn",
        item: {
          id: "call-v2-spawn",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "child-v2-thread",
          agentPath: "/root/v2_workspace_probe",
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "codex-thread:child-v2-thread",
        runId: "codex-thread:child-v2-thread",
        label: "project_explorer",
        task: "v2_workspace_probe",
        detail: expect.objectContaining({
          parentThreadId: "parent-thread",
          parentTurnId: "parent-turn",
          childThreadId: "child-v2-thread",
          childRole: "project_explorer",
          childAgentPath: "agents/project_explorer.toml",
          childTaskName: "v2_workspace_probe",
          childModel: "gpt-5.6-terra",
          childReasoningEffort: "medium",
          spawnReason: "v2_workspace_probe",
        }),
      }),
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-thread",
        turnId: "later-parent-turn",
        item: {
          id: "call-v2-spawn",
          type: "subAgentActivity",
          kind: "started",
          agentThreadId: "child-v2-thread",
          agentPath: "/root/v2_workspace_probe",
        },
      },
    });

    mirror.handleNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "child-v2-thread",
        turnId: "child-turn",
        tokenUsage: {
          total: {
            inputTokens: 120,
            outputTokens: 30,
            cachedInputTokens: 20,
            reasoningOutputTokens: 10,
            totalTokens: 150,
          },
          last: {},
        },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-v2-thread",
        status: { type: "idle" },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-v2-thread",
        detail: expect.objectContaining({
          childPhase: "child_idle",
          childTaskName: "v2_workspace_probe",
          childModel: "gpt-5.6-terra",
          childReasoningEffort: "medium",
          childInputTokens: 120,
          childOutputTokens: 30,
          childCachedInputTokens: 20,
          childReasoningOutputTokens: 10,
          childTotalTokens: 150,
        }),
      }),
    );
  });

  it("uses the notification thread id when collab agent items omit sender thread id", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 42_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/started",
      params: {
        threadId: "parent-thread",
        item: {
          type: "collabAgentToolCall",
          tool: "spawn_agent",
          receiverThreadIds: ["child-thread"],
          prompt: "inspect one thing",
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        task: "inspect one thing",
      }),
    );
  });

  it("creates spawn tasks from collab agent states when receiver thread ids are absent", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 43_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-thread",
        item: {
          type: "collabAgentToolCall",
          tool: "spawn_agent",
          prompt: "inspect one thing",
          agentsStates: {
            "child-thread": {
              status: "completed",
              message: "done",
            },
          },
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        task: "inspect one thing",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        terminalSummary: "Codex native subagent finished: done",
      }),
    );
  });

  it("finalizes stale collab agent state from the blocked tool call status", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 45_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "blocked",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "read cwd",
          agentsStates: {
            "child-thread": {
              status: "pendingInit",
              message: "Native hook relay unavailable",
            },
          },
        },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).not.toHaveBeenCalledWith({
      runId: "codex-thread:child-thread",
      lastEventAt: 45_000,
      progressSummary: "Codex native subagent blocked: Native hook relay unavailable",
    });
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 45_000,
        lastEventAt: 45_000,
        progressSummary: "Codex native subagent blocked: Native hook relay unavailable",
        terminalSummary: "Codex native subagent blocked: Native hook relay unavailable",
        terminalOutcome: "blocked",
        detail: expect.objectContaining({
          childPhase: "child_blocked",
          spawnReason: "read cwd",
        }),
      }),
    );
  });

  it("does not treat completed tool calls as completed subagents", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 46_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "read cwd",
          agentsStates: {
            "child-thread": {
              status: "pendingInit",
              message: null,
            },
          },
        },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 46_000,
        progressSummary: "Codex native subagent is initializing.",
        eventSummary: "Codex native subagent is initializing.",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).not.toHaveBeenCalled();
  });

  it("does not treat failed non-spawn tool calls as failed subagents", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 47_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "wait",
          status: "failed",
          senderThreadId: "parent-thread",
          receiverThreadIds: [],
          agentsStates: {
            "child-thread": {
              status: "running",
              message: "wait timed out",
            },
          },
        },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 47_000,
        progressSummary: "Codex native subagent is running: wait timed out",
        eventSummary: "Codex native subagent is running: wait timed out",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).not.toHaveBeenCalled();
  });

  it("keeps collab-agent progress detail when thread status updates arrive later", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 48_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          agentsStates: {
            "child-thread": {
              status: "running",
              message: "Inspecting task registry readback.",
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "active", activeFlags: ["tool"] },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "idle" },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 48_000,
        progressSummary: "Codex native subagent is active: Inspecting task registry readback.",
        eventSummary: "Codex native subagent is active: Inspecting task registry readback.",
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 48_000,
        progressSummary: "Codex native subagent is idle: Inspecting task registry readback.",
        detail: expect.objectContaining({ childPhase: "child_idle" }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).not.toHaveBeenCalled();
  });

  it("mirrors a reopened native child as a linked active follow-up attempt", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        agentId: "coding",
        now: () => 49_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          preview: "implement the bounded slice",
          createdAt: 10,
          status: { type: "active", activeFlags: [] },
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
                agent_path: "agents/implementer.toml",
                agent_nickname: "Curie",
                agent_role: "implementer",
              },
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "idle" },
      },
    });
    vi.mocked(runtime.listTaskRecords).mockReturnValue([
      {
        taskId: "task-native-subagent",
        runId: codexNativeSubagentRunId("child-thread"),
        status: "succeeded",
      } as ReturnType<TaskLifecycleRuntime["listTaskRecords"]>[number],
    ]);
    mirror.handleNotification({
      method: "item/started",
      params: {
        threadId: "parent-thread",
        turnId: "parent-turn-2",
        item: {
          id: "follow-up-call",
          type: "collabAgentToolCall",
          tool: "sendInput",
          status: "inProgress",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "Resolve the reviewer finding and rerun the focused test.",
          agentsStates: {
            "child-thread": {
              status: "running",
              message: "Applying the focused repair.",
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "active", activeFlags: ["tool"] },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "idle" },
      },
    });

    const followUpRunId = codexNativeSubagentFollowUpRunId("child-thread", "follow-up-call");
    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledTimes(2);
    expect(runtime.tryCreateRunningTaskRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceId: followUpRunId,
        runId: followUpRunId,
        parentTaskId: "task-native-subagent",
        agentId: "coding",
        task: "Resolve the reviewer finding and rerun the focused test.",
        progressSummary:
          "Codex native subagent follow-up started: Resolve the reviewer finding and rerun the focused test.",
        detail: expect.objectContaining({
          parentThreadId: "parent-thread",
          parentTurnId: "parent-turn-2",
          childThreadId: "child-thread",
          childPhase: "child_follow_up_started",
          childAttemptKind: "follow_up",
          childOperationId: "follow-up-call",
          childRole: "implementer",
        }),
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: followUpRunId,
        progressSummary: "Codex native subagent is active: Applying the focused repair.",
        detail: expect.objectContaining({
          childAttemptKind: "follow_up",
          childOperationId: "follow-up-call",
          childPhase: "child_active",
        }),
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: followUpRunId,
        progressSummary: "Codex native subagent is idle: Applying the focused repair.",
        detail: expect.objectContaining({
          childAttemptKind: "follow_up",
          childOperationId: "follow-up-call",
          childPhase: "child_idle",
        }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).not.toHaveBeenCalled();
  });

  it("preserves a completed collab agent message when the thread later goes idle", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 50_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "write the proof file",
          agentsStates: {
            "child-thread": {
              status: "completed",
              message: "No user task is specified.",
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "idle" },
      },
    });

    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledTimes(1);
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 50_000,
        lastEventAt: 50_000,
        progressSummary: "Codex native subagent completed: No user task is specified.",
        terminalSummary: "Codex native subagent finished: No user task is specified.",
      }),
    );
  });

  it("lets terminal collab agent state correct an earlier idle thread status", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 55_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "child-thread",
        status: { type: "idle" },
      },
    });
    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "failed",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          prompt: "read cwd",
          agentsStates: {
            "child-thread": {
              status: "pendingInit",
              message: "Native hook relay unavailable",
            },
          },
        },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 55_000,
        progressSummary: "Codex native subagent is idle.",
        detail: expect.objectContaining({ childPhase: "child_idle" }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledTimes(1);
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "failed",
        endedAt: 55_000,
        lastEventAt: 55_000,
        error: "Native hook relay unavailable",
        progressSummary: "Codex native subagent failed: Native hook relay unavailable",
        terminalSummary: "Codex native subagent did not complete: Native hook relay unavailable",
      }),
    );
  });

  it("normalizes collab agent status spelling from alternate event surfaces", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 60_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          senderThreadId: "parent-thread",
          receiverThreadIds: ["child-thread"],
          agentsStates: {
            "child-thread": {
              status: "pending_init",
              message: null,
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "item/completed",
      params: {
        item: {
          type: "collabAgentToolCall",
          tool: "wait",
          senderThreadId: "parent-thread",
          agentsStates: {
            "child-thread": {
              status: "success",
              message: "done",
            },
          },
        },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 60_000,
        progressSummary: "Codex native subagent is initializing.",
        eventSummary: "Codex native subagent is initializing.",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 60_000,
        lastEventAt: 60_000,
        progressSummary: "Codex native subagent completed: done",
        terminalSummary: "Codex native subagent finished: done",
      }),
    );
  });
});
