import { describe, expect, it } from "vitest";
import {
  assertStartExecutionSessionVisibleInput,
  buildRuntimeExecutionEventData,
  evaluateNativeExecutionProgressSafety,
  isRuntimeExecutionEventEnvelope,
} from "./native-agentic-orchestration.ts";

describe("native agentic orchestration", () => {
  it("builds native runtime event envelopes without allowing extras to override safety fields", () => {
    const data = buildRuntimeExecutionEventData({
      runtimeJobId: "runtime-job-envelope",
      sessionId: "session-envelope",
      eventKind: "tool_call_recorded",
      timestamp: "2026-06-12T10:01:00.000Z",
      extra: {
        toolName: "read",
        rawPromptStored: true as never,
        schemaVersion: "wrong-version",
      },
    });

    expect(isRuntimeExecutionEventEnvelope(data)).toBe(true);
    expect(data).toMatchObject({
      schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
      runtimeJobId: "runtime-job-envelope",
      sessionId: "session-envelope",
      eventKind: "tool_call_recorded",
      toolName: "read",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    });
  });

  it("keeps start_execution_session visible input small", () => {
    expect(() =>
      assertStartExecutionSessionVisibleInput({
        objective: "Patch the worker node.",
        refs: ["work-queue://item/native-orchestration"],
        route: "coding",
      }),
    ).toThrow(/only accepts objective, refs, constraints, and validationSignal/);

    expect(() =>
      assertStartExecutionSessionVisibleInput({
        objective: "Patch the worker node.",
        refs: [{ ref: "work-queue://item/native-orchestration", kind: "work_queue_item" }],
        constraints: ["stay inside allowed paths"],
        validationSignal: "targeted tests pass",
      }),
    ).not.toThrow();
  });

  it("uses progress-sensitive safety rails instead of fixed budget termination", () => {
    const progressing = evaluateNativeExecutionProgressSafety({
      activeChildSessions: 9,
      noProgressTurns: 5,
      repeatedToolCalls: 7,
      meaningfulProgressNow: true,
    });

    expect(progressing.status).toBe("warn");
    expect(progressing.fixedBudgetTermination).toBe(false);
    expect(progressing.reasonCodes).toContain(
      "native_execution_escalation_deferred_due_to_current_progress",
    );
    expect(progressing.escalations).toEqual([]);

    const stuck = evaluateNativeExecutionProgressSafety({
      activeChildSessions: 9,
      noProgressTurns: 5,
      repeatedToolCalls: 7,
      msSinceMeaningfulProgress: 11 * 60 * 1000,
      meaningfulProgressNow: false,
    });

    expect(stuck.status).toBe("escalate");
    expect(stuck.escalations).toEqual(
      expect.arrayContaining([
        "active_child_session_fanout_without_current_progress",
        "repeated_no_progress_turns",
        "repeated_tool_calls_without_progress",
        "stale_meaningful_progress",
      ]),
    );
    expect(stuck.fixedBudgetTermination).toBe(false);
  });
});
