import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  isRuntimeExecutionEventEnvelope,
  startNativeExecutionSession,
} from "./native-agentic-orchestration.ts";
import { finishSharedExecution } from "./shared-execution-finish-service.ts";

async function withRepository<T>(
  work: (input: { repository: RuntimeJobRepository }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-06-12T11:00:00.000Z"),
    });
    return await work({ repository });
  } finally {
    await database.close();
  }
}

describe("shared execution finish service", () => {
  it("auto-attaches mutation, validation, artifact, and child-session evidence", async () => {
    await withRepository(async ({ repository }) => {
      const started = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Finish with runtime evidence.",
          refs: ["work-queue://item/finish"],
        },
        runtime: { sessionId: "session-finish" },
      });
      await repository.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "node_agent_tool_result",
        data: {
          toolName: "edit",
          changedFilePaths: ["extensions/execution-platform/src/workflows/a.ts"],
        },
      });
      await repository.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "node_agent_native_task_result",
        data: {
          requestedAgentId: "execution-validation-scout",
          validationEvidenceRef: "native-session://validation/result",
        },
      });
      await repository.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "node_agent_native_task_result",
        data: {
          requestedAgentId: "execution-critic",
          criticDecision: "ACCEPT",
        },
      });
      await repository.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.child.completed",
        data: {
          schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-finish",
          eventKind: "child_session_completed",
          parentSessionId: "session-finish",
          childSessionId: "session-child",
          childRelation: "blocking",
          timestamp: "2026-06-12T11:00:00.000Z",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        },
      });
      await repository.attachArtifact({
        jobId: started.runtimeJobId,
        artifactType: "execution.test_artifact",
        storageKind: "ref",
        uri: "artifact://finish-proof",
        metadata: { rawPromptStored: false, rawResponseStored: false, rawProviderLogStored: false },
      });

      const result = await finishSharedExecution({
        runtimeJobs: repository,
        runtimeJobId: started.runtimeJobId,
        sessionId: "session-finish",
        status: "completed",
        summary: "Finished with evidence.",
        requiredEvidenceKinds: ["mutation", "validation", "artifact"],
      });

      expect(result.accepted).toBe(true);
      expect(result.evidence.changedFileRefs).toContain(
        "repo-file://extensions/execution-platform/src/workflows/a.ts",
      );
      expect(result.evidence.mutationRefs).toHaveLength(1);
      expect(result.evidence.validationRefs).toHaveLength(1);
      expect(result.evidence.criticRefs).toHaveLength(1);
      expect(result.evidence.artifactRefs).toHaveLength(1);
      expect(result.evidence.openBlockingChildSessionIds).toEqual([]);
      expect(result.event.eventType).toBe("execution.finish.accepted");
      expect(isRuntimeExecutionEventEnvelope(result.event.data)).toBe(true);
      expect(result.event.data).toMatchObject({
        accepted: true,
        eventKind: "finish_recorded",
        rawPromptStored: false,
        rawToolLogStored: false,
      });
    });
  });

  it("rejects completed finish when required evidence or blocking children are missing", async () => {
    await withRepository(async ({ repository }) => {
      const started = await startNativeExecutionSession({
        runtimeJobs: repository,
        request: {
          objective: "Reject unsupported completion.",
          refs: ["work-queue://item/finish-reject"],
        },
        runtime: { sessionId: "session-finish-reject" },
      });
      await repository.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.session.started",
        data: {
          schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-finish-reject",
          eventKind: "child_session_started",
          parentSessionId: "session-finish-reject",
          childSessionId: "session-child-open",
          childRelation: "blocking",
          timestamp: "2026-06-12T11:00:00.000Z",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        },
      });

      const result = await finishSharedExecution({
        runtimeJobs: repository,
        runtimeJobId: started.runtimeJobId,
        sessionId: "session-finish-reject",
        status: "completed",
        summary: "Done.",
        requiredEvidenceKinds: ["mutation", "validation"],
      });

      expect(result.accepted).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "shared_finish_missing_mutation_evidence",
          "shared_finish_missing_validation_evidence",
          "shared_finish_open_blocking_children",
        ]),
      );
      expect(result.correction).toContain("missing required runtime evidence");
      expect(result.correction).toContain("blocking child sessions are still open");
      expect(result.event.eventType).toBe("execution.finish.rejected");
    });
  });
});
