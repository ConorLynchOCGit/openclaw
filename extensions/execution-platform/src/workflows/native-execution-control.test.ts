import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { isRuntimeExecutionEventEnvelope } from "./native-agentic-orchestration.ts";
import { applyNativeExecutionControl } from "./native-execution-control.ts";
import { startAcceptedNativeExecutionSessionForTest } from "./native-execution-test-fixtures.ts";

async function withRepository<T>(
  work: (input: { repository: RuntimeJobRepository }) => Promise<T>,
): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const repository = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    return await work({ repository });
  } finally {
    await db.close();
  }
}

describe("native execution control", () => {
  it("records redirect and waiting-for-human as session-tree runtime events", async () => {
    await withRepository(async ({ repository }) => {
      const started = await startAcceptedNativeExecutionSessionForTest({
        runtimeJobs: repository,
        request: {
          objective: "Run native orchestration.",
          refs: ["work-queue://item/native-control"],
        },
        runtime: {
          sessionId: "session-control-parent",
          idempotencyKey: "native-control-parent",
        },
      });

      const redirect = await applyNativeExecutionControl({
        runtimeJobs: repository,
        runtimeJobId: started.runtimeJobId,
        sessionId: started.sessionId,
        controlKind: "redirect",
        reason: "operator steering",
        redirectMessage: "Use the native child-session path.",
        targetSessionIds: ["session-control-parent", "session-child"],
        actorId: "operator:test",
        now: () => new Date("2026-06-12T00:00:01.000Z"),
      });
      const waiting = await applyNativeExecutionControl({
        runtimeJobs: repository,
        runtimeJobId: started.runtimeJobId,
        sessionId: started.sessionId,
        controlKind: "waiting_for_human",
        question: "Which eligible Work Queue item should run next?",
        now: () => new Date("2026-06-12T00:00:02.000Z"),
      });

      expect(redirect.status).toBe("recorded");
      expect(redirect.event.eventType).toBe("execution.control.redirect");
      expect(isRuntimeExecutionEventEnvelope(redirect.event.data)).toBe(true);
      expect(redirect.event.data).toMatchObject({
        eventKind: "control_recorded",
        runtimeJobId: started.runtimeJobId,
        sessionId: started.sessionId,
        controlKind: "redirect",
        redirectMessage: "Use the native child-session path.",
        targetSessionIds: ["session-control-parent", "session-child"],
        workQueueLifecycleMutationAllowed: false,
        rawPromptStored: false,
      });
      expect(waiting.event.eventType).toBe("execution.waiting_for_human");
      expect(waiting.event.data).toMatchObject({
        eventKind: "waiting_for_human",
        waitingForHumanQuestion: "Which eligible Work Queue item should run next?",
      });
    });
  });

  it("cancels through the owning RuntimeJob and records a native control event", async () => {
    await withRepository(async ({ repository }) => {
      const started = await startAcceptedNativeExecutionSessionForTest({
        runtimeJobs: repository,
        request: {
          objective: "Run native orchestration.",
          refs: ["work-queue://item/native-control-cancel"],
        },
        runtime: {
          sessionId: "session-control-cancel",
          idempotencyKey: "native-control-cancel",
        },
      });

      const result = await applyNativeExecutionControl({
        runtimeJobs: repository,
        runtimeJobId: started.runtimeJobId,
        sessionId: started.sessionId,
        controlKind: "cancel",
        reason: "operator canceled native session",
      });
      const canceled = await repository.getJob(started.runtimeJobId);

      expect(result.status).toBe("canceled");
      expect(canceled?.state).toBe("canceled");
      expect(result.event.eventType).toBe("execution.control.cancel");
      expect(result.event.data).toMatchObject({
        eventKind: "control_recorded",
        controlKind: "cancel",
        reason: "operator canceled native session",
      });
    });
  });
});
