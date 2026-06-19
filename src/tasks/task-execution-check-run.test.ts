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
  let lastSubmittedMarker = "check-run-main";
  return {
    makeId: () => "check-run",
    now: () => nowValues[Math.min(nowIndex++, nowValues.length - 1)] ?? 1,
    sleep: vi.fn(async () => {}),
    submitChat: vi.fn(async ({ idempotencyKey }) => {
      lastSubmittedMarker = idempotencyKey;
      return {
        runId: idempotencyKey,
        status: "started",
      };
    }),
    listTasks: vi.fn(async () => {
      return (
        params.tasksForMarker?.(lastSubmittedMarker) ?? [
          makeTask({ marker: lastSubmittedMarker, taskId: "task-main", lane: "main" }),
        ]
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
      taskId: "task-main",
      runId: "run-task-main",
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
