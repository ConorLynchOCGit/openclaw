// Tasks JSON tests cover structured task command output and managed task flow state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTaskSummary } from "../gateway/task-summary-projection.js";
import type { RuntimeEnv } from "../runtime.js";
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
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { tasksAuditJsonCommand, tasksListJsonCommand, tasksShowJsonCommand } from "./tasks-json.js";

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
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

function readJsonLog(runtime: RuntimeEnv): unknown {
  const [call] = vi.mocked(runtime.log).mock.calls;
  if (!call) {
    throw new Error("expected runtime log call");
  }
  return JSON.parse(String(call[0]));
}

function jsonRoundTrip<T>(value: T): T {
  const serialized = JSON.stringify(value);
  return JSON.parse(serialized) as T;
}

async function withTaskJsonStateDir(run: () => Promise<void>): Promise<void> {
  await withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-tasks-json-command-" },
    async () => {
      resetTaskRegistryDeliveryRuntimeForTests();
      resetTaskRegistryForTests({ persist: false });
      resetTaskFlowRegistryForTests({ persist: false });
      try {
        await run();
      } finally {
        resetTaskRegistryDeliveryRuntimeForTests();
        resetTaskRegistryForTests({ persist: false });
        resetTaskFlowRegistryForTests({ persist: false });
      }
    },
  );
}

describe("tasks JSON commands", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests({ persist: false });
    resetTaskFlowRegistryForTests({ persist: false });
  });

  it("lists task records with runtime and status filters", async () => {
    await withTaskJsonStateDir(async () => {
      const cliTask = createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "run-cli",
        status: "running",
        task: "Inspect issue backlog",
      });
      createTaskRecord({
        runtime: "cron",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "run-cron",
        status: "queued",
        task: "Refresh schedule",
      });

      const runtime = createRuntime();
      await tasksListJsonCommand({ json: true, runtime: "cli", status: "running" }, runtime);

      expect(readJsonLog(runtime)).toStrictEqual({
        count: 1,
        runtime: "cli",
        status: "running",
        tasks: [jsonRoundTrip(mapTaskSummary(cliTask))],
      });
    });
  });

  it("returns a bounded operator summary for large task lists", async () => {
    await withTaskJsonStateDir(async () => {
      let progressTask: TaskRecord | undefined;
      for (let index = 0; index < 25; index += 1) {
        const task = createTaskRecord({
          runtime: "cli",
          ownerKey: "",
          scopeKind: "system",
          status: index % 2 === 0 ? "running" : "succeeded",
          task: `Task ${index}`,
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
        progressSummary: "running bounded list summary check",
        lastEventAt: progressAt,
        eventMetadata: {
          nativeEventStream: "tool",
          nativeEventPhase: "running",
          nativeEventToolName: "summary-check",
        },
      });

      const runtime = createRuntime();
      await tasksListJsonCommand({ json: true, summary: true }, runtime);

      const payload = readJsonLog(runtime) as {
        schema?: string;
        count?: number;
        displayed?: number;
        displayLimit?: number;
        truncated?: boolean;
        summary?: { active?: number; total?: number };
        activeProgress?: {
          displayedWithProgress?: number;
          displayedBySource?: Record<string, number>;
        };
        tasks?: Array<{ taskId?: string; activeProgress?: { source?: string; note?: string } }>;
      };
      expect(payload.schema).toBe("openclaw.tasks.list.summary.v1");
      expect(payload.count).toBe(25);
      expect(payload.displayLimit).toBe(20);
      expect(payload.displayed).toBe(20);
      expect(payload.truncated).toBe(true);
      expect(payload.summary).toMatchObject({ total: 25, active: 13 });
      expect(payload.activeProgress?.displayedWithProgress).toBeGreaterThanOrEqual(1);
      expect(payload.activeProgress?.displayedBySource?.["task-receipt"]).toBeGreaterThanOrEqual(1);
      expect(payload.tasks).toHaveLength(20);
      expect(payload.tasks?.[0]).toMatchObject({
        activeProgress: {
          source: "task-receipt",
          note: "running bounded list summary check",
        },
      });
    });
  });

  it("shows one task record as JSON by task id or run id", async () => {
    await withTaskJsonStateDir(async () => {
      const task = createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "run-json-show",
        status: "running",
        task: "Inspect task JSON readback",
      });

      const byTaskIdRuntime = createRuntime();
      await tasksShowJsonCommand({ json: true, lookup: task.taskId }, byTaskIdRuntime);
      expect(readJsonLog(byTaskIdRuntime)).toStrictEqual(jsonRoundTrip(mapTaskSummary(task)));

      const byRunIdRuntime = createRuntime();
      await tasksShowJsonCommand({ json: true, lookup: "run-json-show" }, byRunIdRuntime);
      expect(readJsonLog(byRunIdRuntime)).toStrictEqual(jsonRoundTrip(mapTaskSummary(task)));
    });
  });

  it("exits when task JSON show cannot resolve the lookup", async () => {
    await withTaskJsonStateDir(async () => {
      const runtime = createRuntime();
      await tasksShowJsonCommand({ json: true, lookup: "missing-task" }, runtime);

      expect(runtime.error).toHaveBeenCalledWith("Task not found: missing-task");
      expect(runtime.exit).toHaveBeenCalledWith(1);
      expect(runtime.log).not.toHaveBeenCalled();
    });
  });

  it("keeps audit JSON shape and combined task-flow sorting", async () => {
    await withTaskJsonStateDir(async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now - 40 * 60_000);
      createTaskRecord({
        runtime: "cli",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        runId: "task-stale-running",
        status: "running",
        task: "Inspect issue backlog",
      });
      vi.setSystemTime(now);
      const runningFlow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/tasks-json-command",
        goal: "Running flow",
        status: "running",
        createdAt: now - 45 * 60_000,
        updatedAt: now - 45 * 60_000,
      });
      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/tasks-json-command",
        goal: "Waiting flow",
        status: "waiting",
        createdAt: now - 40 * 60_000,
        updatedAt: now - 40 * 60_000,
      });

      const runtime = createRuntime();
      await tasksAuditJsonCommand({ json: true, limit: 1 }, runtime);

      expect(readJsonLog(runtime)).toStrictEqual({
        count: 5,
        filteredCount: 5,
        displayed: 1,
        filters: {
          severity: null,
          code: null,
          limit: 1,
        },
        summary: {
          total: 1,
          warnings: 0,
          errors: 1,
          byCode: {
            stale_queued: 0,
            stale_running: 1,
            lost: 0,
            delivery_failed: 0,
            missing_cleanup: 0,
            inconsistent_timestamps: 0,
          },
          taskFlows: {
            total: 4,
            warnings: 2,
            errors: 2,
            byCode: {
              restore_failed: 0,
              stale_running: 1,
              stale_waiting: 1,
              stale_blocked: 0,
              cancel_stuck: 0,
              missing_linked_tasks: 2,
              blocked_task_missing: 0,
              inconsistent_timestamps: 0,
            },
          },
          combined: { total: 5, errors: 3, warnings: 2 },
        },
        findings: [
          {
            kind: "task_flow",
            severity: "error",
            code: "stale_running",
            detail: "running TaskFlow has not advanced recently",
            ageMs: 45 * 60_000,
            status: "running",
            token: runningFlow.flowId,
            flow: jsonRoundTrip(runningFlow),
          },
        ],
      });
    });
  });
});
