import { Compile } from "typebox/compile";
import { describe, expect, it } from "vitest";
import { TaskSummarySchema } from "./tasks.js";

describe("TaskSummarySchema", () => {
  const validateTaskSummary = Compile(TaskSummarySchema);

  it("accepts native delivery and terminal state", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "delivered",
        terminalOutcome: "succeeded",
      }),
    ).toBe(true);
  });

  it("accepts the shared lifecycle readback DTO", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-parent",
        status: "running",
        deliveryStatus: "pending",
        readback: {
          schema: "openclaw.task.lifecycle_readback.v1",
          logicalStatus: "running",
          nativeTaskStatus: "running",
          logicalStartedAt: 90,
          lastActivityAt: 100,
          lastRealActivityAt: 99,
          physical: {
            runId: "run-parent",
            sessionKey: "agent:coding:subagent:parent",
            sessionStatus: "running",
            active: true,
            startedAt: 91,
            attemptNumber: 2,
            continuationReason: "disconnect",
            attemptId: "attempt-2",
            attemptStatus: "running",
          },
          children: [
            {
              taskId: "task-child",
              status: "running",
              active: true,
              kind: "codex-native-subagent",
              phase: "child_active",
              attemptKind: "follow_up",
              operationId: "follow-up-call",
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
            writeOwnerTaskIds: ["task-child"],
            writeOwnerTaskId: "task-child",
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
          context: {
            nativeCompactionCount: 3,
            lastTurnCompactions: 1,
            requestLocalReductions: {
              count: 2,
              route: "prompt_projection",
            },
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

  it("requires closed delivery status values", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "completed",
        deliveryStatus: "ignored",
      }),
    ).toBe(false);
    expect(validateTaskSummary.Check({ id: "task-1", status: "completed" })).toBe(false);
  });

  it("rejects unbounded readback fields", () => {
    expect(
      validateTaskSummary.Check({
        id: "task-1",
        status: "running",
        deliveryStatus: "pending",
        readback: {
          schema: "openclaw.task.lifecycle_readback.v1",
          logicalStatus: "running",
          nativeTaskStatus: "running",
          lastActivityAt: 100,
          lastRealActivityAt: 100,
          children: [],
          activeChildCount: 0,
          queuedChildCount: 0,
          terminalChildCount: 0,
          followupActive: false,
          deliveryStatus: "pending",
          mismatches: [],
          rawTranscript: "must not cross the bounded DTO",
        },
      }),
    ).toBe(false);
  });
});
