import { Compile } from "typebox/compile";
import { describe, expect, it } from "vitest";
import { TaskSummarySchema } from "./tasks.js";

describe("TaskSummarySchema", () => {
  const validateTaskSummary = Compile(TaskSummarySchema);

  it("accepts bounded deliveryStatus readback", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "not_applicable",
      }),
    ).toBe(true);
  });

  it("accepts optional bounded active progress projections", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "trajectory",
          ref: "session:child-1",
          currentPhase: "validation",
          activeLabel: "exec_command",
          observedAt: "2026-06-30T18:30:00.000Z",
          elapsedMs: 900,
          durationMs: 875,
          sourceEventType: "tool.call",
          sourceEventSeq: 14,
          toolName: "bash",
          command: "pnpm vitest run src/gateway/session-utils.test.ts",
          exitCode: 1,
          validationClass: "test",
          outputSummary: "FAIL expected active progress evidence",
          repairAction: "Inspect active progress projection output fields.",
          childRole: "test_engineer",
          childAgentPath: "agents/test_engineer.toml",
          childPhase: "post-diff validation",
          spawnReason: "Validation strategy was non-obvious.",
          diffReviewed: true,
          note: "checking progress",
          pointer: {
            kind: "inspect-next",
            ref: "openclaw sessions tail --session-key agent:coding:subagent:child-1",
          },
          derivedBy: "readLatestTrajectoryProgressProjection",
          bounded: true,
        },
      }),
    ).toBe(true);
  });

  it("accepts the shared native lifecycle readback DTO", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-parent",
        status: "running",
        deliveryStatus: "pending",
        readback: {
          schema: "openclaw.task.lifecycle_readback.v1",
          logicalStatus: "running",
          nativeTaskStatus: "running",
          lastActivityAt: 100,
          physical: {
            runId: "run-parent",
            sessionKey: "agent:coding:subagent:parent",
            sessionStatus: "running",
            active: true,
            attemptId: "attempt-2",
            attemptStatus: "running",
          },
          children: [
            {
              taskId: "task-child",
              status: "running",
              active: true,
              kind: "codex-native-subagent",
              phase: "followup_task",
              lastActivityAt: 99,
            },
          ],
          activeChildCount: 1,
          queuedChildCount: 0,
          terminalChildCount: 0,
          followupActive: true,
          worktree: {
            id: "wt-1",
            kind: "system-change",
            baseRef: "abc123",
            writeOwnerTaskId: "task-child",
          },
          execution: {
            provider: "openai",
            model: "gpt-5.6-codex",
            reasoning: "high",
            profile: "coding",
          },
          artifact: {
            governingRef: "plans/example.md",
            governingDigest: "a".repeat(64),
            observedDigest: "a".repeat(64),
            reviewedDigest: "a".repeat(64),
            handoffDigest: "a".repeat(64),
            stale: false,
          },
          provider: {
            state: "running",
            attemptId: "attempt-2",
          },
          taskFlow: {
            flowId: "flow-1",
            revision: 2,
            status: "running",
            terminal: false,
          },
          deliveryStatus: "pending",
          mismatches: [],
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded native receipt-derived active progress projections", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "task-receipt",
          ref: "task-event:task-1:1782869100000:progress",
          currentPhase: "running",
          activeLabel: "codebase-researcher",
          observedAt: "2026-06-30T20:05:00.000Z",
          elapsedMs: 1200,
          sourceEventType: "task.progress",
          note: "Codex native subagent is running: reviewing event-spine code.",
          pointer: {
            kind: "task",
            ref: "task-1",
            label: "task run receipt",
          },
          derivedBy: "resolveTaskReadbackProgressProjection",
          bounded: true,
        },
      }),
    ).toBe(true);

    expect(
      validateTaskSummary.Check({
        id: "task-3",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "task-registry",
          ref: "task:task-3",
          currentPhase: "running",
          activeLabel: "planning",
          observedAt: "2026-06-30T20:07:00.000Z",
          elapsedMs: 1500,
          sourceEventType: "task.registry",
          note: "Native task row is active; no richer task receipt or trajectory progress is available yet.",
          pointer: {
            kind: "task",
            ref: "task-3",
            label: "native task registry row",
          },
          derivedBy: "resolveTaskReadbackProgressProjection",
          bounded: true,
        },
      }),
    ).toBe(false);

    expect(
      validateTaskSummary.Check({
        id: "task-4",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "unavailable",
          ref: "session:child-1",
          currentPhase: "running",
          activeLabel: null,
          observedAt: "2026-06-30T20:05:00.000Z",
          note: "Native active progress event unavailable for running session; session-store status=running.",
          pointer: {
            kind: "session",
            ref: "agent:main:subagent:child-1",
            label: "session readback",
          },
          derivedBy: "buildGatewaySessionRow",
          bounded: true,
        },
      }),
    ).toBe(true);
  });

  it("rejects removed subagent registry and child-run task summary fields", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-subagent-registry-source",
        status: "running",
        deliveryStatus: "pending",
        activeProgress: {
          source: "subagent-registry",
          ref: "subagent-run:run-child",
          currentPhase: "running",
          derivedBy: "resolveTaskReadbackProgressProjection",
          bounded: true,
        },
      }),
    ).toBe(false);

    expect(
      validateTaskSummary.Check({
        id: "task-parent",
        status: "running",
        deliveryStatus: "pending",
        childRunCount: 2,
        childRuns: [],
      }),
    ).toBe(false);

    expect(
      validateTaskSummary.Check({
        id: "task-child-top-level",
        status: "running",
        deliveryStatus: "pending",
        childSessionKey: "agent:codebase-researcher:subagent:child",
        childRole: "codebase-researcher",
        childPhase: "running",
        spawnReason: "inspect source",
      }),
    ).toBe(false);
  });

  it("requires closed deliveryStatus values", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "ignored",
      }),
    ).toBe(false);
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
      }),
    ).toBe(false);
  });
});
