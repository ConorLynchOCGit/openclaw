import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  assertStartExecutionSessionVisibleInput,
  buildRuntimeExecutionEventData,
  createNativeExecutionSessionStartTool,
  evaluateNativeExecutionProgressSafety,
  isRuntimeExecutionEventEnvelope,
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  startNativeExecutionSession,
} from "./native-agentic-orchestration.ts";

async function withRepository<T>(
  work: (input: { repository: RuntimeJobRepository }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-06-12T10:00:00.000Z"),
    });
    return await work({ repository });
  } finally {
    await database.close();
  }
}

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

  it("starts a native execution RuntimeJob and records a session-start event envelope", async () => {
    await withRepository(async ({ repository }) => {
      const ensureSession = vi.fn(async (input) => ({ sessionId: input.sessionId }));
      const result = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Implement the next Work Queue item.",
          refs: [
            { ref: "work-queue://item/openclaw-native-orchestration", kind: "work_queue_item" },
          ],
          constraints: ["Use native sessions and runtime events."],
          validationSignal: "focused proof passes",
        },
        runtime: {
          sessionId: "session-native-start",
          agentProfile: "execution-orchestrator",
          workItemId: "openclaw-native-orchestration",
        },
        ensureSession,
      });

      expect(result.status).toBe("started");
      expect(result.runtimeJob.jobType).toBe(NATIVE_EXECUTION_SESSION_JOB_TYPE);
      expect(result.runtimeJob.workItemId).toBe("openclaw-native-orchestration");
      expect(result.runtimeJob.payload).toMatchObject({
        artifactKind: "openclaw.accepted_agent_run",
        objective: "Implement the next Work Queue item.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      });
      expect(JSON.stringify(result.runtimeJob.payload)).not.toContain("RequirementMap");
      expect(JSON.stringify(result.runtimeJob.payload)).not.toContain("SchedulerGraphPatch");
      expect(JSON.stringify(result.runtimeJob.payload)).not.toContain("admitted_runtime_snapshot");
      expect(JSON.stringify(result.runtimeJob.payload)).not.toContain("providerLease");
      expect(ensureSession).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeJobId: result.runtimeJobId,
          sessionId: "session-native-start",
          agentProfile: "execution-orchestrator",
          parentSessionId: null,
          childRelation: null,
        }),
      );
      expect(result.event.eventType).toBe("execution.session.started");
      expect(isRuntimeExecutionEventEnvelope(result.event.data)).toBe(true);
      expect(result.event.data).toMatchObject({
        runtimeJobId: result.runtimeJobId,
        sessionId: "session-native-start",
        eventKind: "execution_session_started",
        parentSessionId: null,
        childSessionId: null,
        rawPromptStored: false,
      });
    });
  });

  it("deduplicates start retries without duplicating the start event", async () => {
    await withRepository(async ({ repository }) => {
      const request = {
        objective: "Implement native orchestration.",
        refs: ["doc://native-orchestration"],
      };
      const first = await startNativeExecutionSession({
        runtimeJobs: repository,
        request,
        runtime: { sessionId: "session-dedupe", idempotencyKey: "same-start" },
      });
      const second = await startNativeExecutionSession({
        runtimeJobs: repository,
        request,
        runtime: { sessionId: "session-dedupe", idempotencyKey: "same-start" },
      });

      expect(second.status).toBe("already_started");
      expect(second.runtimeJobId).toBe(first.runtimeJobId);
      const events = await repository.listEvents(first.runtimeJobId, 100);
      expect(
        events.filter((event) => event.eventType === "execution.session.started"),
      ).toHaveLength(1);
    });
  });

  it("records resume events against the existing RuntimeJob instead of creating a new job", async () => {
    await withRepository(async ({ repository }) => {
      const started = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Resume native orchestration.",
          refs: ["runtime-job://job-native-resume"],
        },
        runtime: { sessionId: "session-resume" },
      });
      const resumed = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Resume native orchestration after operator steering.",
          refs: ["runtime-job://job-native-resume"],
          constraints: ["Continue the existing session tree."],
        },
        runtime: {
          resumeRuntimeJobId: started.runtimeJobId,
          sessionId: "session-resume",
          resumeRequestId: "resume-once",
        },
      });
      const duplicateResume = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Resume native orchestration after operator steering.",
          refs: ["runtime-job://job-native-resume"],
          constraints: ["Continue the existing session tree."],
        },
        runtime: {
          resumeRuntimeJobId: started.runtimeJobId,
          sessionId: "session-resume",
          resumeRequestId: "resume-once",
        },
      });

      expect(resumed.status).toBe("resumed");
      expect(duplicateResume.status).toBe("already_resumed");
      expect(resumed.runtimeJobId).toBe(started.runtimeJobId);
      const jobs = await repository.listRecentJobs({
        jobTypes: [NATIVE_EXECUTION_SESSION_JOB_TYPE],
      });
      expect(jobs).toHaveLength(1);
      const events = await repository.listEvents(started.runtimeJobId, 100);
      expect(
        events.filter((event) => event.eventType === "execution.session.resumed"),
      ).toHaveLength(1);
      expect(
        events.find((event) => event.eventType === "execution.session.resumed")?.data,
      ).toMatchObject({
        runtimeJobId: started.runtimeJobId,
        sessionId: "session-resume",
        eventKind: "execution_session_resumed",
      });
    });
  });

  it("records child-session relation metadata in runtime events", async () => {
    await withRepository(async ({ repository }) => {
      const result = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Run a blocking validation child.",
          refs: ["task://validation-child"],
        },
        runtime: {
          sessionId: "session-child",
          parentSessionId: "session-parent",
          childRelation: "blocking",
        },
      });

      expect(result.event.data).toMatchObject({
        eventKind: "child_session_started",
        parentSessionId: "session-parent",
        childSessionId: "session-child",
        childRelation: "blocking",
      });
    });
  });

  it("creates a runtime-owned start_execution_session tool adapter", async () => {
    await withRepository(async ({ repository }) => {
      const tool = createNativeExecutionSessionStartTool({
        runtimeJobs: repository,
        runtime: {
          sessionId: "session-tool-adapter",
          agentProfile: "execution-orchestrator",
        },
      });

      expect(tool.name).toBe("start_execution_session");
      const result = await tool.execute("call-start-execution", {
        objective: "Route a large prompt into native execution.",
        refs: ["prompt://large-task"],
        validationSignal: "runtime job and session are linked",
      });

      const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
      expect(text).toContain("Native execution session started.");
      expect(text).toContain("runtimeJobId:");
      expect(text).toContain("sessionId: session-tool-adapter");
      const jobs = await repository.listRecentJobs({
        jobTypes: [NATIVE_EXECUTION_SESSION_JOB_TYPE],
      });
      expect(jobs).toHaveLength(1);
      const events = await repository.listEvents(jobs[0]!.jobId, 100);
      expect(events.some((event) => event.eventType === "execution.session.started")).toBe(true);
    });
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
