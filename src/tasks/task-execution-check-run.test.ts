import { describe, expect, it, vi } from "vitest";
import { createResolvedAgentRunReceipt, finalizeAgentRunReceipt } from "../agents/run-receipt.js";
import {
  runGBrainSignalDetectorCoverageCheck,
  type RunGBrainSignalDetectorCoverageCheckDeps,
} from "./task-execution-check-run.js";
import type { TaskRecord } from "./task-registry.types.js";

function makeTask(params: {
  marker: string;
  taskId: string;
  lane: string;
  status?: TaskRecord["status"];
  model?: string;
}): TaskRecord {
  const model = params.model ?? "anthropic/claude-haiku-4.5";
  return {
    taskId: params.taskId,
    runtime: "subagent",
    requesterSessionKey: "agent:memory-curator:main",
    ownerKey: "agent:memory-curator:main",
    scopeKind: "session",
    childSessionKey: `agent:memory-curator:subagent:gbrain-signal-${params.marker}-abc123`,
    agentId: "memory-curator",
    runId: `run-${params.taskId}`,
    label: "plugin:gbrain-context",
    task: "Run GBrain signal detection",
    status: params.status ?? "succeeded",
    deliveryStatus: "not_applicable",
    notifyPolicy: "silent",
    createdAt: 1,
    lastEventAt: 1,
    executionReceipt: finalizeAgentRunReceipt(
      createResolvedAgentRunReceipt({
        source: {
          kind: "plugin",
          id: "gbrain-context",
          hook: "message_received",
        },
        targetAgentId: "memory-curator",
        resolvedProvider: "openrouter",
        resolvedModel: model,
        runtime: "openclaw",
        contextMode: "lightweight",
      }),
      {
        finalProvider: "openrouter",
        finalModel: model,
        runtime: "openclaw",
        contextMode: "lightweight",
        terminalStatus: "succeeded",
      },
    ),
  };
}

function makeDeps(params: {
  tasksForMarker?: (marker: string) => TaskRecord[];
  nowValues?: number[];
}): RunGBrainSignalDetectorCoverageCheckDeps {
  const nowValues = params.nowValues ?? [1, 2, 3, 4, 5, 6, 7, 8];
  let nowIndex = 0;
  const submittedMarkers = new Set<string>();
  return {
    makeId: () => "check-run",
    now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 1,
    sleep: vi.fn(async () => {}),
    submitChat: vi.fn(async ({ idempotencyKey }) => {
      submittedMarkers.add(idempotencyKey);
      return {
        runId: idempotencyKey,
        status: "started",
      };
    }),
    listTasks: vi.fn(async () => {
      return Array.from(submittedMarkers).flatMap(
        (marker) =>
          params.tasksForMarker?.(marker) ?? [
            makeTask({
              marker,
              taskId: `task-${marker}`,
              lane: marker.split("-").at(-1) ?? marker,
            }),
          ],
      );
    }),
  };
}

describe("task execution CheckRun", () => {
  it("records a passed CheckStep for a matching finalized GBrain signal task", async () => {
    const result = await runGBrainSignalDetectorCoverageCheck(makeDeps({}), {
      agents: ["main"],
      checkRunId: "check-run",
      laneTimeoutMs: 10,
      pollIntervalMs: 1,
    });

    expect(result.status).toBe("passed");
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.steps[0]).toMatchObject({
      lane: "main",
      status: "passed",
      taskId: "task-check-run-main",
      runId: "run-task-check-run-main",
      result: { passed: true, admitted: true },
    });
  });

  it("returns a failed aggregate while preserving prior lane evidence", async () => {
    const deps = makeDeps({
      tasksForMarker: (marker) =>
        marker === "check-run-main"
          ? [makeTask({ marker, taskId: "task-main", lane: "main" })]
          : [],
      nowValues: [1, 2, 3, 4, 20, 21, 22, 40],
    });

    const result = await runGBrainSignalDetectorCoverageCheck(deps, {
      agents: ["main", "coding"],
      checkRunId: "check-run",
      laneTimeoutMs: 5,
      pollIntervalMs: 1,
    });

    expect(result.status).toBe("failed");
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.steps.map((step) => [step.lane, step.status])).toEqual([
      ["main", "passed"],
      ["coding", "timed_out"],
    ]);
    expect(result.steps[0]?.taskId).toBe("task-main");
    expect(result.steps[1]?.failures[0]?.code).toBe("timeout");
  });

  it("runs lanes through the native bounded concurrency fixture", async () => {
    const resolvers = new Map<string, () => void>();
    const submitted: string[] = [];
    const deps = makeDeps({});
    deps.submitChat = vi.fn(async ({ idempotencyKey }) => {
      submitted.push(idempotencyKey);
      await new Promise<void>((resolve) => {
        resolvers.set(idempotencyKey, resolve);
      });
      return { runId: idempotencyKey, status: "started" };
    });
    deps.listTasks = vi.fn(async () =>
      submitted.map((marker) =>
        makeTask({ marker, taskId: `task-${marker}`, lane: marker.split("-").at(-1) ?? marker }),
      ),
    );

    const flushMicrotasks = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };
    const waitForSubmittedCount = async (count: number) => {
      for (let index = 0; index < 20; index += 1) {
        if (submitted.length >= count) {
          return;
        }
        await flushMicrotasks();
      }
      throw new Error(`expected ${count} submitted lanes, got ${submitted.length}`);
    };
    const resultPromise = runGBrainSignalDetectorCoverageCheck(deps, {
      agents: ["main", "planning", "coding"],
      checkRunId: "check-run",
      concurrency: 2,
      laneTimeoutMs: 20,
      pollIntervalMs: 1,
    });

    await flushMicrotasks();
    expect(submitted).toEqual(["check-run-main", "check-run-planning"]);

    resolvers.get("check-run-main")?.();
    await waitForSubmittedCount(3);
    expect(submitted).toEqual(["check-run-main", "check-run-planning", "check-run-coding"]);

    resolvers.get("check-run-planning")?.();
    resolvers.get("check-run-coding")?.();

    const result = await resultPromise;
    expect(result.status).toBe("passed");
    expect(result.concurrency).toBe(2);
    expect(result.steps.map((step) => step.lane)).toEqual(["main", "planning", "coding"]);
  });

  it("fails one lane when the receipt model is wrong", async () => {
    const marker = "check-run-main";
    const result = await runGBrainSignalDetectorCoverageCheck(
      makeDeps({
        tasksForMarker: () => [
          makeTask({
            marker,
            taskId: "task-wrong-model",
            lane: "main",
            model: "gpt-5.5",
          }),
        ],
      }),
      {
        agents: ["main"],
        checkRunId: "check-run",
        laneTimeoutMs: 10,
        pollIntervalMs: 1,
      },
    );

    expect(result.status).toBe("failed");
    expect(result.steps[0]?.status).toBe("failed");
    expect(result.steps[0]?.failures.map((failure) => failure.code)).toContain(
      "resolved_model_mismatch",
    );
  });
});
