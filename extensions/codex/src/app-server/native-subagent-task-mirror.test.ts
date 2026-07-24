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
        eventMetadata: expect.objectContaining({
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
    let latestMetadata: Record<string, string | number | boolean | null> | undefined;
    const runtime = {
      listTaskRecords: vi.fn(() =>
        latestMetadata
          ? [
              {
                runId: "codex-thread:restart-child",
                status: "running",
                executionReceipt: { latestEvent: { metadata: latestMetadata } },
              },
            ]
          : [],
      ),
      tryCreateRunningTaskRun: vi.fn((params) => {
        latestMetadata = params.eventMetadata;
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

    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:restart-child",
        eventMetadata: expect.objectContaining({
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
        eventMetadata: expect.objectContaining({
          parentThreadId: "parent-thread",
          childThreadId: "child-without-call-id",
        }),
      }),
    );
    const eventMetadata = vi.mocked(runtime.tryCreateRunningTaskRun).mock.calls[0]?.[0]
      .eventMetadata;
    expect(eventMetadata).not.toHaveProperty("parentTurnId");
    expect(eventMetadata).not.toHaveProperty("childRole");
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
        eventMetadata: expect.objectContaining({
          parentThreadId: "parent-thread",
          childThreadId: "unmatched-keyed-child",
        }),
      }),
    );
    expect(createCalls[0]?.[0].eventMetadata).not.toHaveProperty("parentTurnId");
    expect(createCalls[0]?.[0].eventMetadata).not.toHaveProperty("childRole");
    expect(createCalls).toHaveLength(1);
  });

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
        eventMetadata: expect.objectContaining({
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

    expect(runtime.finalizeTaskRunByRunId).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "codex-thread:child-v2-thread",
        eventMetadata: expect.objectContaining({
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
        eventMetadata: expect.objectContaining({
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
        eventMetadata: expect.objectContaining({
          childAttemptKind: "follow_up",
          childOperationId: "follow-up-call",
          childPhase: "child_active",
        }),
      }),
    );
    expect(runtime.finalizeTaskRunByRunId).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runId: followUpRunId,
        status: "succeeded",
        eventMetadata: expect.objectContaining({
          childAttemptKind: "follow_up",
          childOperationId: "follow-up-call",
          childPhase: "child_completed",
        }),
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
