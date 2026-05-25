import { describe, expect, it } from "vitest";
import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  ACP_CODEX_CODING_WORKER_ADAPTER_ID,
  AcpCodexCodingWorkerAdapter,
  type AcpCodexCodingWorkerRunner,
} from "./acp-codex-coding-worker-adapter.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T22:00:00.000Z"),
    });
    return await work(repository);
  } finally {
    await database.close();
  }
}

function completedRunner(): AcpCodexCodingWorkerRunner {
  return {
    async run({ job }) {
      return {
        status: "completed",
        summary: "Coding worker completed bounded work with validation and closeout.",
        teamRunId: `team-run-${job.jobId}`,
        workflowId: "agent_team.coding",
        roleRefs: ["role://implementation_engineer", "role://test_engineer"],
        modelRefs: ["model://fixture-implementation", "model://fixture-test"],
        validationRefs: [`runtime-job://${job.jobId}/validation/focused-tests`],
        reviewRefs: [`runtime-job://${job.jobId}/review/security-review`],
        closeoutRefs: [`runtime-job://${job.jobId}/closeout-capsule`],
        completedWorkEvidenceRefs: [`runtime-job://${job.jobId}/evidence/completed-work`],
        artifactRefs: [`runtime-job://${job.jobId}/artifact/bounded-change`],
        closeoutCapsule: createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: job.jobId,
          teamRunId: `team-run-${job.jobId}`,
        }),
        reasonCodes: ["fixture_coding_worker_completed"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

describe("ACP/Codex coding worker adapter", () => {
  it("dispatches through the runtime worker supervisor and succeeds with model-authored closeout evidence", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-coding-worker",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Make a bounded coding improvement.",
          rawPromptStored: false,
        },
      });
      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs: repository,
        runner: completedRunner(),
      });
      expect(adapter.adapterId).toBe(ACP_CODEX_CODING_WORKER_ADAPTER_ID);
      expect(adapter.jobTypes).toEqual(["executor.agent_team"]);

      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      });
      const result = await supervisor.runOnce();

      expect(result).toMatchObject({
        status: "completed",
        completed: true,
        runtimeJobId: "job-coding-worker",
        adapterId: ACP_CODEX_CODING_WORKER_ADAPTER_ID,
      });
      await expect(repository.getJob("job-coding-worker")).resolves.toMatchObject({
        state: "succeeded",
      });
      const artifacts = await repository.listArtifacts("job-coding-worker");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "runtime_worker.adapter_result",
          "runtime_worker.closeout_capsule_evaluation",
          "execution_platform.closeout_capsule",
        ]),
      );
      expect(JSON.stringify(artifacts)).not.toContain('"rawPromptStored":true');
    });
  });

  it("does not succeed when completed work evidence is missing", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-coding-worker-no-evidence",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        maxAttempts: 1,
        payload: { workflowId: "agent_team.coding", objectiveSummary: "bounded task" },
      });
      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs: repository,
        runner: {
          async run({ job }) {
            return {
              ...(await completedRunner().run({ job, workerId: "worker", leaseToken: "lease" })),
              completedWorkEvidenceRefs: [],
              validationRefs: [],
              reviewRefs: [],
              closeoutRefs: [],
              artifactRefs: [],
            };
          },
        },
      });

      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      }).runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["acp_codex_coding_worker_completed_without_evidence"],
      });
      await expect(repository.getJob("job-coding-worker-no-evidence")).resolves.toMatchObject({
        state: "failed",
      });
    });
  });

  it("does not succeed when model-authored closeout is missing, degraded, or unsafe", async () => {
    const unsafeCloseout = {
      ...createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: "job-coding-worker-unsafe-closeout",
      }),
      safetyFlags: {
        ...createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: "job-coding-worker-unsafe-closeout",
        }).safetyFlags,
        authorityGrantedByCloseout: true,
      },
    } as unknown as CloseoutCapsule;
    for (const [jobId, closeoutCapsule] of [
      ["job-coding-worker-no-closeout", null],
      [
        "job-coding-worker-degraded-closeout",
        createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: "job-coding-worker-degraded-closeout",
          humanReportSource: "degraded_system_fallback",
        }),
      ],
      ["job-coding-worker-unsafe-closeout", unsafeCloseout],
    ] as const) {
      await withRepository(async (repository) => {
        await repository.enqueueJob({
          jobId,
          jobType: "executor.agent_team",
          queueName: "worker-boundary",
          maxAttempts: 1,
          payload: { workflowId: "agent_team.coding", objectiveSummary: "bounded task" },
        });
        const adapter = new AcpCodexCodingWorkerAdapter({
          runtimeJobs: repository,
          runner: {
            async run({ job }) {
              return {
                ...(await completedRunner().run({ job, workerId: "worker", leaseToken: "lease" })),
                closeoutCapsule,
              };
            },
          },
        });
        const result = await new RuntimeWorkerSupervisor({
          repository,
          workerId: "worker-supervisor",
          queueName: "worker-boundary",
          adapters: [adapter],
        }).runOnce();

        expect(result.status, jobId).toBe("needs_review");
        expect(result.completed, jobId).toBe(false);
        await expect(repository.getJob(jobId)).resolves.toMatchObject({ state: "failed" });
      });
    }
  });

  it("ignores unknown payload flags and relies only on production evidence and closeout gates", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-coding-worker-quality-proof",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        maxAttempts: 1,
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Run a bounded coding job through production evidence gates.",
          deprecatedProofFlag: true,
        },
      });
      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs: repository,
        runner: completedRunner(),
      });

      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      }).runOnce();

      expect(result.status).toBe("completed");
      await expect(repository.getJob("job-coding-worker-quality-proof")).resolves.toMatchObject({
        state: "succeeded",
      });
      const artifacts = await repository.listArtifacts("job-coding-worker-quality-proof");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "runtime_worker.adapter_result",
          "runtime_worker.closeout_capsule_evaluation",
          "execution_platform.closeout_capsule",
        ]),
      );
    });
  });

  it("propagates validation failures without false success", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-coding-worker-validation-failed",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        maxAttempts: 1,
        payload: { workflowId: "agent_team.coding", objectiveSummary: "bounded task" },
      });
      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs: repository,
        runner: {
          async run() {
            return {
              status: "needs_review",
              summary: "Validation failed and requires repair.",
              teamRunId: "team-run-validation",
              workflowId: "agent_team.coding",
              roleRefs: [],
              modelRefs: [],
              validationRefs: ["runtime-job://job-coding-worker-validation-failed/validation"],
              reviewRefs: [],
              closeoutRefs: [],
              completedWorkEvidenceRefs: [],
              artifactRefs: [],
              reasonCodes: ["validation_failed"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
      });
      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      }).runOnce();

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("validation_failed");
      await expect(repository.getJob("job-coding-worker-validation-failed")).resolves.toMatchObject(
        { state: "failed" },
      );
    });
  });

  it("rejects arbitrary command-shaped runtime payloads", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-coding-worker-command",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        maxAttempts: 1,
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "bounded task",
          shellCommand: "echo nope",
        },
      });
      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs: repository,
        runner: completedRunner(),
      });
      const result = await new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      }).runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["acp_codex_coding_worker_arbitrary_command_payload_rejected"],
      });
      expect(
        JSON.stringify(await repository.listArtifacts("job-coding-worker-command")),
      ).not.toContain('"rawResponseStored":true');
    });
  });
});
