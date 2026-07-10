// Codex tests cover native subagent task mirror plugin behavior.
import { describe, expect, it, vi } from "vitest";
import {
  codexNativeSubagentRunId,
  CodexNativeSubagentTaskMirror,
  type TaskLifecycleRuntime,
} from "./native-subagent-task-mirror.js";

function createRuntime() {
  return {
    tryCreateRunningTaskRun: vi.fn((params) => ({ taskId: "task-native-subagent", ...params })),
    recordTaskRunProgressByRunId: vi.fn(() => []),
    finalizeTaskRunByRunId: vi.fn(() => []),
  } as unknown as TaskLifecycleRuntime;
}

describe("CodexNativeSubagentTaskMirror", () => {
  it("creates a silent task-registry task for a native Codex subagent thread", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        agentId: "main",
        now: () => 20_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          sessionId: "session-tree",
          preview: "write the Madrid wine script",
          createdAt: 10,
          status: { type: "active", activeFlags: [] },
          source: {
            subAgent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
                agent_path: "agents/project_explorer.toml",
                agent_nickname: "Poincare",
                agent_role: "worker",
              },
            },
          },
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith({
      sourceId: "codex-thread:child-thread",
      agentId: "main",
      runId: "codex-thread:child-thread",
      label: "Poincare (worker)",
      task: "write the Madrid wine script",
      notifyPolicy: "silent",
      deliveryStatus: "not_applicable",
      preferMetadata: true,
      startedAt: 10_000,
      lastEventAt: 20_000,
      progressSummary:
        "Codex native subagent started (role: worker; agent_path: agents/project_explorer.toml).",
      eventMetadata: {
        codexNativeSubagent: true,
        parentThreadId: "parent-thread",
        childThreadId: "child-thread",
        childPhase: "child_spawned",
        childRole: "worker",
        childAgentPath: "agents/project_explorer.toml",
        childNickname: "Poincare",
        spawnReason: "write the Madrid wine script",
      },
    });
    expect(vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls[0]?.[0]).not.toHaveProperty(
      "childSessionKey",
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith({
      runId: "codex-thread:child-thread",
      lastEventAt: 20_000,
      progressSummary: "Codex native subagent is active.",
      eventSummary: "Codex native subagent is active.",
      eventMetadata: {
        codexNativeSubagent: true,
        parentThreadId: "parent-thread",
        childThreadId: "child-thread",
        childPhase: "child_active",
        childRole: "worker",
        childAgentPath: "agents/project_explorer.toml",
        childNickname: "Poincare",
        spawnReason: "write the Madrid wine script",
      },
    });
  });

  it("reads lowercase Codex subagent thread sources with role identity", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        agentId: "main",
        now: () => 21_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          preview: "review the substrate proof",
          createdAt: 11,
          status: { type: "active", activeFlags: [] },
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
                agent_path: null,
                agent_nickname: "Banach",
                agent_role: "codex_reviewer",
              },
            },
          },
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        label: "Banach (codex_reviewer)",
        task: "review the substrate proof",
        progressSummary: "Codex native subagent started (role: codex_reviewer).",
        eventMetadata: expect.objectContaining({
          childRole: "codex_reviewer",
          childNickname: "Banach",
          spawnReason: "review the substrate proof",
        }),
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        eventMetadata: expect.objectContaining({
          childPhase: "child_active",
          childRole: "codex_reviewer",
          childNickname: "Banach",
          spawnReason: "review the substrate proof",
        }),
      }),
    );
  });

  it("upgrades a generic collab-spawn task when native thread identity arrives later", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        agentId: "main",
        now: () => 22_000,
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
          prompt: "review bounded substrate evidence",
        },
      },
    });
    mirror.handleNotification({
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          preview: "short native preview",
          createdAt: 12,
          status: { type: "active", activeFlags: [] },
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
                agent_path: "agents/codex_reviewer.toml",
                agent_nickname: "Banach",
                agent_role: "codex_reviewer",
              },
            },
          },
        },
      },
    });
    mirror.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-thread",
        item: {
          type: "collabAgentToolCall",
          tool: "wait",
          agentsStates: {
            "child-thread": {
              status: "completed",
              message: "review complete",
            },
          },
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledTimes(1);
    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        label: "Codex subagent",
        task: "review bounded substrate evidence",
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        progressSummary:
          "Codex native subagent identified (role: codex_reviewer; agent_path: agents/codex_reviewer.toml).",
        eventMetadata: expect.objectContaining({
          childPhase: "child_identified",
          childRole: "codex_reviewer",
          childAgentPath: "agents/codex_reviewer.toml",
          childNickname: "Banach",
          spawnReason: "review bounded substrate evidence",
        }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        eventMetadata: expect.objectContaining({
          childPhase: "child_completed",
          childRole: "codex_reviewer",
          childAgentPath: "agents/codex_reviewer.toml",
          childNickname: "Banach",
          spawnReason: "review bounded substrate evidence",
        }),
      }),
    );
  });

  it("ignores subagent threads spawned by a different parent thread", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
      },
      runtime,
    );

    mirror.handleNotification({
      method: "thread/started",
      params: {
        thread: {
          id: "other-child",
          source: {
            subAgent: {
              thread_spawn: {
                parent_thread_id: "other-parent",
                depth: 1,
              },
            },
          },
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).not.toHaveBeenCalled();
    expect(runtime.recordTaskRunProgressByRunId).not.toHaveBeenCalled();
    expect(runtime.finalizeTaskRunByRunId).not.toHaveBeenCalled();
  });

  it("deduplicates repeated thread-started notifications for the same child thread", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
      },
      runtime,
    );
    const notification = {
      method: "thread/started",
      params: {
        thread: {
          id: "child-thread",
          source: {
            subAgent: {
              thread_spawn: {
                parent_thread_id: "parent-thread",
                depth: 1,
              },
            },
          },
        },
      },
    } as const;

    mirror.handleNotification(notification);
    mirror.handleNotification(notification);

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledTimes(1);
  });

  it("maps Codex thread status changes onto the mirrored task run", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 30_000,
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
      method: "thread/status/changed",
      params: {
        threadId: "failed-child",
        status: { type: "systemError" },
      },
    });

    expect(runtime.finalizeTaskRunByRunId).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: codexNativeSubagentRunId("child-thread"),
        status: "succeeded",
        endedAt: 30_000,
        lastEventAt: 30_000,
        progressSummary: "Codex native subagent is idle.",
        terminalSummary: "Codex native subagent finished.",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runId: codexNativeSubagentRunId("failed-child"),
        status: "failed",
        endedAt: 30_000,
        lastEventAt: 30_000,
        error: "Codex app-server reported a system error for the native subagent thread.",
        progressSummary: "Codex native subagent hit a system error.",
        terminalSummary: "Codex native subagent failed.",
      }),
    );
  });

  it("creates and updates tasks from Codex collab agent item state", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 40_000,
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
              status: "pendingInit",
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
          receiverThreadIds: [],
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
        sourceId: "codex-thread:child-thread",
        runId: "codex-thread:child-thread",
        label: "Codex subagent",
        task: "write the proof file",
        notifyPolicy: "silent",
        deliveryStatus: "not_applicable",
        preferMetadata: true,
        startedAt: 40_000,
        lastEventAt: 40_000,
        progressSummary: "Codex native subagent spawned.",
        eventMetadata: expect.objectContaining({
          codexNativeSubagent: true,
          parentThreadId: "parent-thread",
          childThreadId: "child-thread",
          childPhase: "child_spawned",
          spawnReason: "write the proof file",
        }),
      }),
    );
    expect(vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls[0]?.[0]).not.toHaveProperty(
      "childSessionKey",
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 40_000,
        progressSummary: "Codex native subagent is initializing.",
        eventSummary: "Codex native subagent is initializing.",
        eventMetadata: expect.objectContaining({
          childPhase: "child_initializing",
          spawnReason: "write the proof file",
        }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 40_000,
        lastEventAt: 40_000,
        progressSummary: "Codex native subagent completed: done",
        terminalSummary: "Codex native subagent finished: done",
        eventMetadata: expect.objectContaining({
          childPhase: "child_completed",
          spawnReason: "write the proof file",
        }),
      }),
    );
  });

  it("creates identified tasks from Codex-native spawn_agent function calls", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:main:main",
        now: () => 41_000,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "item/started",
      params: {
        threadId: "parent-thread",
        item: {
          type: "function_call",
          name: "spawn_agent",
          call_id: "call-spawn",
          arguments: JSON.stringify({
            agent_type: "codex_reviewer",
            message:
              "Role: codex_reviewer. Objective: review parent-provided bounded evidence pack.",
            fork_context: false,
          }),
        },
      },
    });
    mirror.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-thread",
        item: {
          type: "function_call_output",
          call_id: "call-spawn",
          output: JSON.stringify({
            agent_id: "child-thread",
            nickname: "Leibniz",
          }),
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "codex-thread:child-thread",
        runId: "codex-thread:child-thread",
        label: "Leibniz (codex_reviewer)",
        task: "review parent-provided bounded evidence pack.",
        progressSummary:
          "Codex native subagent spawned (role: codex_reviewer; agent_path: agents/codex_reviewer.toml).",
        eventMetadata: expect.objectContaining({
          childPhase: "child_spawned",
          childRole: "codex_reviewer",
          childAgentPath: "agents/codex_reviewer.toml",
          childNickname: "Leibniz",
          spawnReason: "review parent-provided bounded evidence pack.",
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
        eventMetadata: expect.objectContaining({
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
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 48_000,
        lastEventAt: 48_000,
        progressSummary: "Codex native subagent is idle: Inspecting task registry readback.",
        terminalSummary: "Codex native subagent finished: Inspecting task registry readback.",
      }),
    );
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

    expect(runtime.finalizeTaskRunByRunId).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        status: "succeeded",
        endedAt: 55_000,
        lastEventAt: 55_000,
        progressSummary: "Codex native subagent is idle.",
        terminalSummary: "Codex native subagent finished.",
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenNthCalledWith(
      2,
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
