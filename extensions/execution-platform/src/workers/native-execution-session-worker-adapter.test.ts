import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  NATIVE_EXECUTION_SESSION_QUEUE,
} from "../workflows/native-agentic-orchestration.ts";
import {
  NativeExecutionSessionWorkerAdapter,
  NATIVE_EXECUTION_SESSION_WORKER_ADAPTER_ID,
} from "./native-execution-session-worker-adapter.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";

const TEST_RUNTIME_GENERATION_ID = "runtime-generation:test";

async function withRepository<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-06-12T16:00:00.000Z"),
    });
    return await work(runtimeJobs);
  } finally {
    await database.close();
  }
}

describe("NativeExecutionSessionWorkerAdapter", () => {
  it("runs a native execution session through the runtime worker supervisor", async () => {
    await withRepository(async (runtimeJobs) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "native-worker-session-job",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        payload: {
          artifactKind: "openclaw.accepted_agent_run",
          schemaVersion: "openclaw.accepted-agent-run.payload.v1",
          runtimeGenerationId: TEST_RUNTIME_GENERATION_ID,
          agentId: "execution-orchestrator",
          envelope: "runtime_job",
          policyRef: null,
          objective: "Run native session worker adapter.",
          refs: [{ ref: "work-queue://item/native-worker-adapter" }],
          constraints: ["Use runtime evidence closure."],
          validationSignal: "native adapter records evidence",
          session: {
            sessionId: "native-worker-session",
            agentProfile: "execution-orchestrator",
            parentSessionId: null,
            childRelation: null,
          },
          runRequest: {
            agentId: "execution-orchestrator",
            input: { prompt: "Run native session worker adapter.", trigger: "manual" },
            workspace: { runtimeWorkspaceDir: "/tmp/openclaw-runtime" },
            transcript: {
              sessionId: "native-worker-session",
              sessionFile: "/tmp/openclaw-runtime/native-worker-session.jsonl",
            },
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        },
      });
      const adapter = new NativeExecutionSessionWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job, payload, taskMessage }) {
            expect(job.jobId).toBe("native-worker-session-job");
            expect(payload.objective).toBe("Run native session worker adapter.");
            expect(payload.runtimeGenerationId).toBe(TEST_RUNTIME_GENERATION_ID);
            expect(payload.runRequest).toMatchObject({
              agentId: "execution-orchestrator",
            });
            expect(taskMessage.text).toContain("Objective: Run native session worker adapter.");
            return {
              status: "completed",
              summary: "Native execution session completed with runtime evidence.",
              sessionId: payload.session.sessionId,
              agentProfile: payload.session.agentProfile,
              artifactRefs: [`runtime-job://${job.jobId}/artifact/native-session-result`],
              completedWorkEvidenceRefs: [
                `runtime-job://${job.jobId}/event/execution.finish.accepted`,
              ],
              reasonCodes: ["native_execution_session_worker_completed"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "native-worker-supervisor",
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        adapters: [adapter],
      }).runOnce({ runtimeJobId: job.jobId });

      expect(result).toMatchObject({
        status: "completed",
        completed: true,
        runtimeJobId: job.jobId,
        adapterId: NATIVE_EXECUTION_SESSION_WORKER_ADAPTER_ID,
      });
      await expect(runtimeJobs.getJob(job.jobId)).resolves.toMatchObject({
        state: "succeeded",
      });
      await expect(runtimeJobs.listEvents(job.jobId)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "runtime_worker.adapter_started" }),
          expect.objectContaining({
            eventType: "runtime_worker.adapter_completed",
            data: expect.objectContaining({
              adapterId: NATIVE_EXECUTION_SESSION_WORKER_ADAPTER_ID,
              status: "completed",
            }),
          }),
        ]),
      );
    });
  });

  it("rejects malformed native execution payloads as needs_review", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "native-worker-malformed",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        payload: { artifactKind: "openclaw.accepted_agent_run" },
      });
      const adapter = new NativeExecutionSessionWorkerAdapter({
        runtimeJobs,
        runner: {
          async run() {
            throw new Error("runner should not be called for malformed payloads");
          },
        },
      });
      const job = await runtimeJobs.getJob("native-worker-malformed");
      expect(job).not.toBeNull();
      const result = await adapter.execute({
        job: job!,
        workerId: "native-worker-supervisor",
        leaseId: "lease-test",
        leaseToken: "lease-token-test",
      });

      expect(result).toMatchObject({
        status: "needs_review",
        summary:
          "Native execution session payload is missing required objective, refs, or session fields.",
      });
      expect(result.reasonCodes).toContain("native_execution_session_worker_payload_invalid");
    });
  });

  it("rejects native execution payloads without runtime generation as needs_review", async () => {
    await withRepository(async (runtimeJobs) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "native-worker-session-no-generation",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        payload: {
          artifactKind: "openclaw.accepted_agent_run",
          schemaVersion: "openclaw.accepted-agent-run.payload.v1",
          objective: "Run native session worker adapter without runtime generation.",
          refs: [{ ref: "work-queue://item/native-worker-adapter" }],
          constraints: [],
          validationSignal: null,
          session: {
            sessionId: "native-worker-session-no-generation",
            agentProfile: "execution-orchestrator",
            parentSessionId: null,
            childRelation: null,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        },
      });
      const adapter = new NativeExecutionSessionWorkerAdapter({
        runtimeJobs,
        runner: {
          async run() {
            throw new Error("runner should not be called without runtime generation");
          },
        },
      });
      const result = await adapter.execute({
        job,
        workerId: "native-worker-supervisor",
        leaseId: "lease-test",
        leaseToken: "lease-token-test",
      });

      expect(result).toMatchObject({
        status: "needs_review",
        summary: "Native execution session payload is missing the resident runtime generation id.",
      });
      expect(result.reasonCodes).toContain(
        "native_execution_session_worker_runtime_generation_missing",
      );
    });
  });

  it("rejects native execution payloads without executable runRequest as needs_review", async () => {
    await withRepository(async (runtimeJobs) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "native-worker-session-no-run-request",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        payload: {
          artifactKind: "openclaw.accepted_agent_run",
          schemaVersion: "openclaw.accepted-agent-run.payload.v1",
          runtimeGenerationId: TEST_RUNTIME_GENERATION_ID,
          agentId: "execution-orchestrator",
          envelope: "runtime_job",
          policyRef: null,
          objective: "Run native session worker adapter without run request.",
          refs: [{ ref: "work-queue://item/native-worker-adapter" }],
          constraints: [],
          validationSignal: null,
          session: {
            sessionId: "native-worker-session-no-run-request",
            agentProfile: "execution-orchestrator",
            parentSessionId: null,
            childRelation: null,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        },
      });
      const adapter = new NativeExecutionSessionWorkerAdapter({
        runtimeJobs,
        runner: {
          async run() {
            throw new Error("runner should not be called without runRequest");
          },
        },
      });
      const result = await adapter.execute({
        job,
        workerId: "native-worker-supervisor",
        leaseId: "lease-test",
        leaseToken: "lease-token-test",
      });

      expect(result).toMatchObject({
        status: "needs_review",
        summary: "Native execution session payload is missing the executable accepted run request.",
      });
      expect(result.reasonCodes).toContain("native_execution_session_worker_run_request_missing");
    });
  });
});
