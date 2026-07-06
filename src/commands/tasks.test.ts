// Tasks command tests cover task listing, status rendering, cron-store integration, and cancellations.
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigRuntimeState } from "../config/config.js";
import { saveCronStore } from "../cron/store.js";
import type { RuntimeEnv } from "../runtime.js";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { resetDetachedTaskLifecycleRuntimeForTests } from "../tasks/detached-task-runtime.js";
import {
  createManagedTaskFlow as createManagedTaskFlowOrNull,
  resetTaskFlowRegistryForTests,
} from "../tasks/task-flow-registry.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import {
  createTaskRecord as createTaskRecordOrNull,
  resetTaskRegistryDeliveryRuntimeForTests,
  resetTaskRegistryForTests,
  setTaskProgressById,
} from "../tasks/task-registry.js";
import * as taskRegistryMaintenance from "../tasks/task-registry.maintenance.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import type { OpenClawTestState } from "../test-utils/openclaw-test-state.js";
import {
  tasksAuditCommand,
  tasksCancelCommand,
  tasksListCommand,
  tasksMaintenanceCommand,
  tasksShowCommand,
} from "./tasks.js";

const mocks = vi.hoisted(() => ({
  callGateway: vi.fn(),
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: mocks.callGateway,
}));

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as RuntimeEnv;
}

function createTaskRecord(params: Parameters<typeof createTaskRecordOrNull>[0]): TaskRecord {
  const task = createTaskRecordOrNull(params);
  if (!task) {
    throw new Error("expected task creation to succeed");
  }
  return task;
}

function createManagedTaskFlow(
  params: Parameters<typeof createManagedTaskFlowOrNull>[0],
): TaskFlowRecord {
  const flow = createManagedTaskFlowOrNull(params);
  if (!flow) {
    throw new Error("expected managed TaskFlow creation to succeed");
  }
  return flow;
}

function readFirstJsonLog(runtime: RuntimeEnv): unknown {
  const calls = vi.mocked(runtime.log).mock.calls;
  const [message] = calls[0] ?? [];
  return JSON.parse(String(message));
}

function jsonRoundTrip<T>(value: T): T {
  const serialized = JSON.stringify(value);
  return JSON.parse(serialized) as T;
}

const zeroTaskAuditCounts = {
  delivery_failed: 0,
  inconsistent_timestamps: 0,
  lost: 0,
  missing_cleanup: 0,
  stale_queued: 0,
  stale_running: 0,
};

async function withTaskCommandStateDir(
  run: (state: OpenClawTestState) => Promise<void>,
): Promise<void> {
  await withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-tasks-command-" },
    async (state) => {
      taskRegistryMaintenance.stopTaskRegistryMaintenanceForTests();
      taskRegistryMaintenance.resetTaskRegistryMaintenanceRuntimeForTests();
      resetConfigRuntimeState();
      resetDetachedTaskLifecycleRuntimeForTests();
      resetTaskRegistryDeliveryRuntimeForTests();
      resetTaskRegistryForTests({ persist: false });
      resetTaskFlowRegistryForTests({ persist: false });
      closeOpenClawAgentDatabasesForTest();
      try {
        await run(state);
      } finally {
        taskRegistryMaintenance.stopTaskRegistryMaintenanceForTests();
        taskRegistryMaintenance.resetTaskRegistryMaintenanceRuntimeForTests();
        resetConfigRuntimeState();
        resetDetachedTaskLifecycleRuntimeForTests();
        resetTaskRegistryDeliveryRuntimeForTests();
        resetTaskRegistryForTests({ persist: false });
        resetTaskFlowRegistryForTests({ persist: false });
        closeOpenClawAgentDatabasesForTest();
      }
    },
  );
}

describe("tasks commands", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    taskRegistryMaintenance.stopTaskRegistryMaintenanceForTests();
    taskRegistryMaintenance.resetTaskRegistryMaintenanceRuntimeForTests();
    resetConfigRuntimeState();
    resetDetachedTaskLifecycleRuntimeForTests();
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests({ persist: false });
    resetTaskFlowRegistryForTests({ persist: false });
    closeOpenClawAgentDatabasesForTest();
    mocks.callGateway.mockReset();
  });

  it("keeps audit JSON stable and sorts combined findings before limiting", async () => {
    await withTaskCommandStateDir(async () => {
      const now = Date.now();
      createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "task-stale-queued",
        status: "running",
        task: "Inspect issue backlog",
        startedAt: now - 40 * 60_000,
      });
      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/tasks-command",
        goal: "Inspect issue backlog",
        status: "waiting",
        createdAt: now - 40 * 60_000,
        updatedAt: now - 40 * 60_000,
      });

      const runtime = createRuntime();
      await tasksAuditCommand({ json: true }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        summary: {
          total: number;
          errors: number;
          warnings: number;
          byCode: Record<string, number>;
          taskFlows: { total: number; byCode: Record<string, number> };
          combined: { total: number; errors: number; warnings: number };
        };
      };

      expect(payload.summary.byCode.lost).toBe(1);
      expect(payload.summary.taskFlows.byCode.stale_waiting).toBe(1);
      expect(payload.summary.taskFlows.byCode.missing_linked_tasks).toBe(1);
      expect(payload.summary.combined.total).toBe(3);

      const runningFlow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/tasks-command",
        goal: "Running flow",
        status: "running",
        createdAt: now - 45 * 60_000,
        updatedAt: now - 45 * 60_000,
      });

      const limitedRuntime = createRuntime();
      await tasksAuditCommand({ json: true, limit: 1 }, limitedRuntime);

      const limitedPayload = readFirstJsonLog(limitedRuntime) as { findings: unknown[] };
      const [limitedFinding] = limitedPayload.findings as Array<{ ageMs?: number }>;

      expect(limitedPayload.findings).toHaveLength(1);
      expect(limitedFinding).toMatchObject({
        kind: "task_flow",
        severity: "error",
        code: "stale_running",
        detail: "running TaskFlow has not advanced recently",
        status: "running",
        token: runningFlow.flowId,
        flow: jsonRoundTrip(runningFlow),
      });
      expect(limitedFinding?.ageMs).toBeGreaterThanOrEqual(45 * 60_000);
      expect(limitedFinding?.ageMs).toBeLessThan(45 * 60_000 + 1_000);
    });
  });

  it("routes cron task cancellation through the live gateway before local fallback", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "cron",
        sourceId: "nightly-gmail-sync",
        ownerKey: "",
        scopeKind: "system",
        runId: "cron:nightly-gmail-sync:123",
        task: "Nightly Gmail sync",
        status: "running",
        deliveryStatus: "not_applicable",
        notifyPolicy: "silent",
      });
      mocks.callGateway.mockResolvedValueOnce({
        found: true,
        cancelled: true,
        task: {
          taskId: task.taskId,
          runtime: "cron",
          runId: task.runId,
        },
      });
      const runtime = createRuntime();

      await tasksCancelCommand({ lookup: task.taskId }, runtime);

      expect(mocks.callGateway).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "tasks.cancel",
          params: { taskId: task.taskId },
          timeoutMs: 5_000,
        }),
      );
      expect(runtime.log).toHaveBeenCalledWith(
        `Cancelled ${task.taskId} (cron) run cron:nightly-gmail-sync:123.`,
      );
      expect(runtime.error).not.toHaveBeenCalled();
      expect(runtime.exit).not.toHaveBeenCalled();
    });
  });

  it("explains stale running tasks retained by backing sessions in maintenance JSON", async () => {
    await withTaskCommandStateDir(async (state) => {
      const now = Date.now();
      const childSessionKey = "agent:main:subagent:child-retained";
      const task = createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        childSessionKey,
        runId: "run-retained-child",
        status: "running",
        task: "Review retained child session",
        startedAt: now - 45 * 60_000,
      });

      const sessionsDir = state.sessionsDir("main");
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionsDir, "sessions.json"),
        JSON.stringify(
          {
            [childSessionKey]: {
              sessionId: "child-retained",
              updatedAt: now,
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const runtime = createRuntime();
      await tasksMaintenanceCommand({ json: true, apply: false }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        diagnostics: {
          staleRunningTasks: Array<{
            taskId: string;
            decision: string;
            reason: string;
            childSessionKey?: string;
          }>;
        };
      };

      expect(payload.diagnostics.staleRunningTasks).toContainEqual(
        expect.objectContaining({
          taskId: task.taskId,
          decision: "retained",
          reason: "backing_session_present",
          childSessionKey,
        }),
      );
    });
  });

  it("explains task maintenance decisions before applying session registry pruning", async () => {
    await withTaskCommandStateDir(async (state) => {
      const now = Date.now();
      const childSessionKey = "agent:main:cron:done-job:run:old-run";
      const task = createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        childSessionKey,
        runId: "run-backed-before-session-sweep",
        status: "running",
        task: "Review old cron child session",
        startedAt: now - 45 * 60_000,
      });

      const sessionsDir = state.sessionsDir("main");
      const storePath = path.join(sessionsDir, "sessions.json");
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            [childSessionKey]: {
              sessionId: "old-run",
              updatedAt: now - 8 * 24 * 60 * 60_000,
            },
            "agent:main:telegram:dm:recent": {
              sessionId: "recent-session",
              updatedAt: now - 60_000,
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const runtime = createRuntime();
      await tasksMaintenanceCommand({ json: true, apply: true }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        maintenance: {
          tasks: { reconciled: number };
          sessions: { pruned: number };
        };
        diagnostics: {
          staleRunningTasks: Array<{
            taskId: string;
            decision: string;
            reason: string;
            childSessionKey?: string;
          }>;
        };
      };

      expect(payload.maintenance.tasks.reconciled).toBe(0);
      expect(payload.maintenance.sessions.pruned).toBe(1);
      expect(payload.diagnostics.staleRunningTasks).toContainEqual(
        expect.objectContaining({
          taskId: task.taskId,
          decision: "retained",
          reason: "backing_session_present",
          childSessionKey,
        }),
      );

      const updated = JSON.parse(await fs.readFile(storePath, "utf8")) as Record<string, unknown>;
      expect(updated[childSessionKey]).toBeUndefined();
      expect(updated["agent:main:telegram:dm:recent"]).toBeDefined();
    });
  });

  it("does not build JSON-only diagnostics for text maintenance output", async () => {
    await withTaskCommandStateDir(async () => {
      const diagnosticsSpy = vi.spyOn(
        taskRegistryMaintenance,
        "getTaskRegistryMaintenanceDiagnostics",
      );
      const runtime = createRuntime();

      await tasksMaintenanceCommand({ json: false, apply: false }, runtime);

      expect(diagnosticsSpy).not.toHaveBeenCalled();
    });
  });

  it("shows tasks with Date-invalid optional timestamps without crashing", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "task-invalid-started-at",
        status: "running",
        task: "Inspect malformed task timestamp",
        startedAt: 8_700_000_000_000_000,
      });

      const runtime = createRuntime();
      await tasksShowCommand({ json: false, lookup: task.taskId }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain(`taskId: ${task.taskId}`);
      expect(joined).toContain("startedAt: n/a");
    });
  });

  it("shows bounded task list summary output without dumping every task", async () => {
    await withTaskCommandStateDir(async () => {
      let progressTask: TaskRecord | undefined;
      for (let index = 0; index < 25; index += 1) {
        const task = createTaskRecord({
          runtime: "cli",
          ownerKey: "",
          scopeKind: "system",
          status: index % 2 === 0 ? "running" : "succeeded",
          task: `Summary task ${index}`,
        });
        if (index === 24) {
          progressTask = task;
        }
      }
      if (!progressTask) {
        throw new Error("expected progress task");
      }
      const progressAt = Date.now() + 1;
      setTaskProgressById({
        taskId: progressTask.taskId,
        progressSummary: "validating bounded human list summary",
        lastEventAt: progressAt,
        eventMetadata: {
          nativeEventStream: "tool",
          nativeEventPhase: "running",
          nativeEventToolName: "validation",
        },
      });

      const runtime = createRuntime();
      await tasksListCommand({ summary: true }, runtime);

      const logs = vi.mocked(runtime.log).mock.calls.map(([line]) => String(line));
      const joined = logs.join("\n");
      expect(joined).toContain("Background tasks: 25");
      expect(joined).toContain("Showing 20 bounded rows");
      expect(joined).toContain("full list available with `openclaw tasks list --json`");
      expect(joined).toContain("task-receipt phase=running validation agent.tool");
      expect(joined).toContain("note=validating bounded human lis");
      expect(joined).not.toContain("Summary task 9");
    });
  });

  it("uses requester session trajectory progress before stale prompt-shaped task text", async () => {
    await withTaskCommandStateDir(async (state) => {
      const sessionKey = "agent:coding:phase0z-event-spine";
      const sessionId = "sess-phase0z-event-spine";
      const sessionsDir = state.sessionsDir("coding");
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionsDir, "sessions.json"),
        `${JSON.stringify(
          {
            [sessionKey]: {
              sessionId,
              status: "running",
              updatedAt: 1_000,
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.writeFile(
        path.join(sessionsDir, `${sessionId}.trajectory.jsonl`),
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "tool.call",
          ts: "2026-07-01T00:30:00.000Z",
          seq: 8,
          sourceSeq: 15,
          sessionId,
          sessionKey,
          data: {
            name: "spawn_agent",
            phase: "child-work",
            elapsedMs: 42_000,
            summary: "project_explorer child is inspecting readback seams",
          },
        })}\n${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "tool.result",
          ts: "2026-07-01T00:30:01.000Z",
          seq: 9,
          sourceSeq: 16,
          sessionId,
          sessionKey,
          data: {
            name: "spawn_agent",
            status: "completed",
          },
        })}\n`,
        "utf8",
      );

      createTaskRecord({
        runtime: "cli",
        requesterSessionKey: sessionKey,
        ownerKey: sessionKey,
        scopeKind: "session",
        agentId: "coding",
        status: "running",
        task: "Runtime liveness check for Phase 0Z: use exactly one Codex-native child...",
        progressSummary:
          "Runtime liveness check for Phase 0Z: use exactly one Codex-native child...",
        startedAt: 1_000,
      });

      const runtime = createRuntime();
      await tasksListCommand({ summary: true }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain("trajectory phase=child-work spawn_agent tool.result");
      expect(joined).not.toContain("Runtime liveness check for Phase 0Z");
    });
  });

  it("uses fresh task run events before stale child progress summaries", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        childSessionKey: "agent:coding:subagent:child-1",
        label: "project_explorer",
        status: "running",
        task: "Child run started.",
        progressSummary: "Child started.",
        startedAt: Date.now(),
      });
      setTaskProgressById({
        taskId: task.taskId,
        progressSummary: "Child started.",
        eventSummary: "project_explorer is inspecting task registry readback.",
        lastEventAt: Date.now() + 1,
      });

      const runtime = createRuntime();
      await tasksListCommand({ summary: true, runtime: "subagent", status: "running" }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain("task-receipt phase=waiting_on_child project_explorer task.running");
      expect(joined).toContain("note=Parent is w");
      expect(joined).not.toContain("Child started.");
    });
  });

  it("shows readback progress from a task execution receipt", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "cli",
        ownerKey: "",
        scopeKind: "system",
        label: "validation",
        status: "running",
        task: "Inspect active child progress",
        startedAt: Date.now(),
      });
      const progressAt = Date.now() + 1;
      setTaskProgressById({
        taskId: task.taskId,
        progressSummary: "running focused task readback regression",
        lastEventAt: progressAt,
        eventMetadata: {
          nativeEventStream: "tool",
          nativeEventPhase: "running",
          nativeEventToolName: "validation",
        },
      });

      const runtime = createRuntime();
      await tasksShowCommand({ json: false, lookup: task.taskId }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain("activeProgress: task-receipt phase=running validation agent.tool");
      expect(joined).toContain("note=running focused task readback regression");
      expect(joined).toContain(`pointer=task:${task.taskId}`);
    });
  });

  it("shows Codex-native child role timing from task execution receipts", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "subagent",
        taskKind: "codex-native",
        sourceId: "codex-thread:child-readback",
        ownerKey: "agent:coding:main",
        scopeKind: "session",
        agentId: "coding",
        runId: "codex-thread:child-readback",
        label: "project_explorer",
        status: "running",
        deliveryStatus: "not_applicable",
        notifyPolicy: "silent",
        task: "Inspect run intelligence owner files before implementation.",
        startedAt: Date.now(),
      });
      setTaskProgressById({
        taskId: task.taskId,
        eventSummary: "Codex native subagent spawned.",
        lastEventAt: Date.now() + 1,
        eventMetadata: {
          childRole: "project_explorer",
          childAgentPath: "agents/project_explorer.toml",
          childPhase: "child_spawned",
          spawnReason: "Inspect run intelligence owner files before implementation.",
        },
      });

      const runtime = createRuntime();
      await tasksShowCommand({ json: false, lookup: task.taskId }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain("childRole=project_explorer");
      expect(joined).toContain("childAgentPath=agents/project_explorer.toml");
      expect(joined).toContain("childPhase=child_spawned");
      expect(joined).toContain(
        "spawnReason=Inspect run intelligence owner files before implementation.",
      );
    });
  });

  it("includes readback progress in task show JSON from task execution receipts", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "cli",
        ownerKey: "",
        scopeKind: "system",
        label: "validation-json",
        status: "running",
        task: "Inspect active child progress JSON",
      });
      const lastEventAt = Date.now() + 1;
      setTaskProgressById({
        taskId: task.taskId,
        progressSummary: "running JSON task readback regression",
        lastEventAt,
        eventMetadata: {
          nativeEventStream: "tool",
          nativeEventPhase: "running",
          nativeEventToolName: "validation-json",
        },
      });

      const runtime = createRuntime();
      await tasksShowCommand({ json: true, lookup: task.taskId }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        activeProgress?: {
          source?: string;
          ref?: string;
          currentPhase?: string;
          activeLabel?: string;
          sourceEventType?: string;
          note?: string;
          bounded?: boolean;
        };
      };
      expect(payload.activeProgress).toMatchObject({
        source: "task-receipt",
        ref: `task-event:${task.taskId}:${lastEventAt}:progress`,
        currentPhase: "running",
        activeLabel: "validation-json",
        sourceEventType: "agent.tool",
        toolName: "validation-json",
        note: "running JSON task readback regression",
        bounded: true,
      });
    });
  });

  it("does not infer child role timing in task show JSON from child session keys", async () => {
    await withTaskCommandStateDir(async () => {
      const task = createTaskRecord({
        runtime: "subagent",
        taskKind: "openclaw-agent",
        ownerKey: "agent:planning:main",
        requesterSessionKey: "agent:planning:main",
        childSessionKey: "agent:codebase-researcher:subagent:child-1",
        scopeKind: "session",
        label: "current-state scout",
        status: "succeeded",
        deliveryStatus: "not_applicable",
        notifyPolicy: "silent",
        task: "Read bounded source refs and return a Context Pack.",
        startedAt: Date.now() - 5_000,
        progressSummary: "Context Pack returned.",
      });

      const runtime = createRuntime();
      await tasksShowCommand({ json: true, lookup: task.taskId }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        childSessionKey?: string;
        childRole?: string;
        childPhase?: string;
        spawnReason?: string;
      };
      expect(payload).toMatchObject({
        childSessionKey: "agent:codebase-researcher:subagent:child-1",
      });
      expect(payload.childRole).toBeUndefined();
      expect(payload.childPhase).toBeUndefined();
      expect(payload.spawnReason).toBeUndefined();
    });
  });

  it("explains retained lost task cleanup timing in maintenance text output", async () => {
    await withTaskCommandStateDir(async () => {
      const cleanupAfter = Date.now() + 60_000;
      createTaskRecord({
        runtime: "subagent",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "run-retained-lost",
        status: "lost",
        task: "Retained lost task",
        cleanupAfter,
      });

      const runtime = createRuntime();
      await tasksMaintenanceCommand({ json: false, apply: true }, runtime);

      const joined = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(joined).toContain(
        `Retained lost tasks: 1 retained until ${new Date(cleanupAfter).toISOString()}; maintenance will prune after cleanupAfter.`,
      );
    });
  });

  it("keeps tasks maintenance JSON additive for TaskFlow state", async () => {
    await withTaskCommandStateDir(async () => {
      const now = Date.now();
      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/tasks-command",
        goal: "Old terminal flow",
        status: "succeeded",
        createdAt: now - 8 * 24 * 60 * 60_000,
        updatedAt: now - 8 * 24 * 60 * 60_000,
        endedAt: now - 8 * 24 * 60 * 60_000,
      });

      const runtime = createRuntime();
      await tasksMaintenanceCommand({ json: true, apply: false }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        mode: string;
        maintenance: { taskFlows: { pruned: number } };
        auditBefore: {
          byCode: Record<string, number>;
          taskFlows: { byCode: Record<string, number> };
        };
        auditAfter: {
          byCode: Record<string, number>;
          taskFlows: { byCode: Record<string, number> };
        };
      };

      expect(payload.mode).toBe("preview");
      expect(payload.maintenance.taskFlows.pruned).toBe(1);
      expect(payload.auditBefore.byCode).toStrictEqual(zeroTaskAuditCounts);
      expect(payload.auditBefore.taskFlows.byCode.stale_running).toBe(0);
      expect(payload.auditAfter.byCode).toStrictEqual(zeroTaskAuditCounts);
      expect(payload.auditAfter.taskFlows.byCode.stale_running).toBe(0);
    });
  });

  it("applies a conservative session registry sweep for stale cron run sessions", async () => {
    await withTaskCommandStateDir(async (state) => {
      const now = Date.now();
      const sessionsDir = state.sessionsDir("main");
      const storePath = path.join(sessionsDir, "sessions.json");
      const old = now - 8 * 24 * 60 * 60_000;
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            "agent:main:cron:done-job:run:old-run": {
              sessionId: "done-run",
              updatedAt: old,
            },
            "agent:main:cron:running-job:run:old-run": {
              sessionId: "running-run",
              updatedAt: old,
            },
            "agent:main:cron:done-job:run:recent-run": {
              sessionId: "recent-run",
              updatedAt: now - 60_000,
            },
            "agent:main:telegram:dm:old": {
              sessionId: "ordinary-old-session",
              updatedAt: old,
            },
          },
          null,
          2,
        ),
        "utf-8",
      );
      await saveCronStore(state.statePath("cron", "jobs.json"), {
        version: 1,
        jobs: [
          {
            id: "running-job",
            name: "Running job",
            enabled: true,
            schedule: { kind: "every", everyMs: 60_000 },
            sessionTarget: "isolated",
            sessionKey: "cron:running-job",
            wakeMode: "now",
            payload: { kind: "agentTurn", message: "ping" },
            delivery: { mode: "none" },
            createdAtMs: now,
            updatedAtMs: now,
            state: { runningAtMs: now - 5_000 },
          },
          {
            id: "done-job",
            name: "Done job",
            enabled: true,
            schedule: { kind: "every", everyMs: 60_000 },
            sessionTarget: "isolated",
            sessionKey: "cron:done-job",
            wakeMode: "now",
            payload: { kind: "agentTurn", message: "ping" },
            delivery: { mode: "none" },
            createdAtMs: now,
            updatedAtMs: now,
            state: {},
          },
        ],
      });
      const runtime = createRuntime();
      await tasksMaintenanceCommand({ json: true, apply: true }, runtime);

      const payload = readFirstJsonLog(runtime) as {
        maintenance: {
          sessions: {
            pruned: number;
            runningCronJobs: number;
            stores: Array<{ pruned: number; preservedRunning: number }>;
          };
        };
      };
      expect(payload.maintenance.sessions.pruned).toBe(1);
      expect(payload.maintenance.sessions.runningCronJobs).toBe(1);
      expect(payload.maintenance.sessions.stores[0]?.pruned).toBe(1);
      expect(payload.maintenance.sessions.stores[0]?.preservedRunning).toBe(1);

      const updated = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<string, unknown>;
      expect(updated["agent:main:cron:done-job:run:old-run"]).toBeUndefined();
      for (const key of [
        "agent:main:cron:running-job:run:old-run",
        "agent:main:cron:done-job:run:recent-run",
        "agent:main:telegram:dm:old",
      ]) {
        if (updated[key] === undefined) {
          throw new Error(`Expected preserved session ${key}`);
        }
      }
    });
  });
});
