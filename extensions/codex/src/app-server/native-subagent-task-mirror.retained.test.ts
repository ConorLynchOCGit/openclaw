// Codex tests cover native subagent task mirror plugin behavior.
import { describe, expect, it, vi } from "vitest";
import {
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

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
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
        detail: expect.objectContaining({
          schema: "openclaw.codex.native_subagent_task.v1",
          codexNativeSubagent: true,
          parentThreadId: "parent-thread",
          childThreadId: "child-thread",
          childPhase: "child_spawned",
          childRole: "worker",
          childAgentPath: "agents/project_explorer.toml",
          childNickname: "Poincare",
          spawnReason: "write the Madrid wine script",
        }),
      }),
    );
    expect(vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls[0]?.[0]).not.toHaveProperty(
      "childSessionKey",
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        lastEventAt: 20_000,
        progressSummary: "Codex native subagent is active.",
        eventSummary: "Codex native subagent is active.",
        detail: expect.objectContaining({
          schema: "openclaw.codex.native_subagent_task.v1",
          codexNativeSubagent: true,
          parentThreadId: "parent-thread",
          childThreadId: "child-thread",
          childPhase: "child_active",
          childRole: "worker",
          childAgentPath: "agents/project_explorer.toml",
          childNickname: "Poincare",
          spawnReason: "write the Madrid wine script",
        }),
      }),
    );
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
        detail: expect.objectContaining({
          childRole: "codex_reviewer",
          childNickname: "Banach",
          spawnReason: "review the substrate proof",
        }),
      }),
    );
    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-thread",
        detail: expect.objectContaining({
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
        turnId: "later-parent-turn",
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
        turnId: "parent-turn",
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
        detail: expect.objectContaining({
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
        detail: expect.objectContaining({
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

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: codexNativeSubagentRunId("child-thread"),
        lastEventAt: 30_000,
        progressSummary: "Codex native subagent is idle.",
        detail: expect.objectContaining({ childPhase: "child_idle" }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledTimes(1);
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
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
        detail: expect.objectContaining({
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
        detail: expect.objectContaining({
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
        detail: expect.objectContaining({
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
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "parent-turn",
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
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "replayed-parent-turn",
        item: {
          type: "function_call",
          name: "spawn_agent",
          call_id: "call-spawn",
          arguments: JSON.stringify({
            agent_type: "test_engineer",
            message: "A replay must not replace the first spawn intent.",
          }),
        },
      },
    });
    mirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "later-parent-turn",
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
        detail: expect.objectContaining({
          childPhase: "child_spawned",
          childRole: "codex_reviewer",
          childAgentPath: "agents/codex_reviewer.toml",
          childNickname: "Leibniz",
          parentTurnId: "parent-turn",
          spawnReason: "review parent-provided bounded evidence pack.",
        }),
      }),
    );
  });

  it("preserves exact spawn lineage across mirror recreation", () => {
    let latestDetail: Record<string, string | number | boolean | null> | undefined;
    const runtime = {
      listTaskRecords: vi.fn(() =>
        latestDetail
          ? [
              {
                runId: "codex-thread:restart-child",
                status: "running",
                detail: latestDetail,
              },
            ]
          : [],
      ),
      tryCreateRunningTaskRun: vi.fn((params) => {
        latestDetail = params.detail;
        return { taskId: "task-native-subagent", ...params };
      }),
      recordTaskRunProgressByRunId: vi.fn(() => []),
      finalizeTaskRunByRunId: vi.fn(() => []),
    } as unknown as TaskLifecycleRuntime;
    const params = {
      parentThreadId: "parent-thread",
      requesterSessionKey: "agent:coding:main",
      agentId: "coding",
      now: () => 41_125,
    };
    const firstMirror = new CodexNativeSubagentTaskMirror(params, runtime);

    firstMirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "exact-parent-turn",
        item: {
          type: "function_call",
          name: "spawn_agent",
          call_id: "restart-call",
          arguments: JSON.stringify({
            agent_type: "code_reviewer",
            message: "Review one bounded restart decision.",
          }),
        },
      },
    });
    firstMirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "later-parent-turn",
        item: {
          type: "function_call_output",
          call_id: "restart-call",
          output: JSON.stringify({ agent_id: "restart-child" }),
        },
      },
    });

    const restartedMirror = new CodexNativeSubagentTaskMirror(params, runtime);
    restartedMirror.handleNotification({
      method: "thread/status/changed",
      params: {
        threadId: "restart-child",
        status: { type: "idle" },
      },
    });

    expect(runtime.recordTaskRunProgressByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:restart-child",
        detail: expect.objectContaining({
          childPhase: "child_idle",
          parentThreadId: "parent-thread",
          parentTurnId: "exact-parent-turn",
          childThreadId: "restart-child",
          childRole: "code_reviewer",
          spawnReason: "Review one bounded restart decision.",
        }),
      }),
    );
  });

  it("does not infer lineage from call-id-less native spawn events", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:coding:main",
        agentId: "coding",
        now: () => 41_250,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "parent-turn-without-call-id",
        item: {
          type: "function_call",
          name: "spawn_agent",
          arguments: JSON.stringify({
            agent_type: "test_engineer",
            message: "Validate one bounded acceptance decision.",
          }),
        },
      },
    });
    mirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        item: {
          type: "function_call_output",
          output: JSON.stringify({ agent_id: "child-without-call-id" }),
        },
      },
    });

    expect(runtime.tryCreateRunningTaskRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-without-call-id",
        detail: expect.objectContaining({
          parentThreadId: "parent-thread",
          childThreadId: "child-without-call-id",
        }),
      }),
    );
    const taskDetail = vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls[0]?.[0].detail;
    expect(taskDetail).not.toHaveProperty("parentTurnId");
    expect(taskDetail).not.toHaveProperty("childRole");
  });

  it("does not correlate an unmatched keyed output to an unrelated unkeyed intent", () => {
    const runtime = createRuntime();
    const mirror = new CodexNativeSubagentTaskMirror(
      {
        parentThreadId: "parent-thread",
        requesterSessionKey: "agent:coding:main",
        agentId: "coding",
        now: () => 41_375,
      },
      runtime,
    );

    mirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "queued-parent-turn",
        item: {
          type: "function_call",
          name: "spawn_agent",
          arguments: JSON.stringify({
            agent_type: "project_explorer",
            message: "Inspect one bounded ownership decision.",
          }),
        },
      },
    });
    mirror.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-thread",
        turnId: "unmatched-output-turn",
        item: {
          type: "function_call_output",
          call_id: "unknown-call-id",
          output: JSON.stringify({ agent_id: "unmatched-keyed-child" }),
        },
      },
    });
    const createCalls = vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls;
    expect(createCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        runId: "codex-thread:unmatched-keyed-child",
        detail: expect.objectContaining({
          parentThreadId: "parent-thread",
          childThreadId: "unmatched-keyed-child",
        }),
      }),
    );
    expect(createCalls[0]?.[0].detail).not.toHaveProperty("parentTurnId");
    expect(createCalls[0]?.[0].detail).not.toHaveProperty("childRole");
    expect(createCalls).toHaveLength(1);
  });
});
