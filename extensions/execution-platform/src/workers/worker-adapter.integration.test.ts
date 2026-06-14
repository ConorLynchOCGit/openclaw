import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { NativeExecutionRpcService } from "../intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { AcpCodexCodingWorkerAdapter } from "./acp-codex-coding-worker-adapter.ts";
import { auditBrowserPromptRuntimeLinkage } from "./browser-runtime-linkage-audit.ts";
import { applyRuntimeWorkerSupervisorControl } from "./runtime-worker-supervisor-controls.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";

describe("Slices 8-10 worker adapter integration", () => {
  it("links native submit, worker registry, supervisor adapter, Closeout Capsule, Work Queue, and browser audit", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      await workQueue.createWorkItem({
        workItemId: "work-item-worker-boundary",
        itemType: "execution_workflow",
        title: "Worker boundary proof",
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: "job-worker-boundary",
        jobType: "executor.agent_team",
        queueName: "worker-boundary",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Run bounded coding worker-supervisor proof.",
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
        workItemId: "work-item-worker-boundary",
      });
      await workQueue.createWorkRun({
        workItemId: "work-item-worker-boundary",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: {
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.worker_contract_state",
        storageKind: "metadata",
        uri: `runtime-job://${job.jobId}/execution/worker-contract-state`,
        contentType: "application/json",
        metadata: {
          artifactKind: "workflow_worker_execution_readiness",
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          contractState: "shadow",
          workerAdapterId: "worker.acp-codex.coding",
          accepted: true,
          reasonCodes: ["allowed_by_coding_worker_contract"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
      });

      const adapter = new AcpCodexCodingWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            return {
              status: "completed",
              summary: "Coding worker completed bounded proof with closeout.",
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
        },
      });
      const workerRun = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "worker-supervisor",
        queueName: "worker-boundary",
        adapters: [adapter],
      }).runOnce({ runtimeJobId: job.jobId });
      expect(workerRun).toMatchObject({
        status: "completed",
        completed: true,
        runtimeJobId: job.jobId,
      });

      const closeout = await rpc.readCloseout(job.jobId);
      expect(JSON.stringify(closeout)).toContain("execution_platform_closeout_capsule");
      await applyRuntimeWorkerSupervisorControl({
        runtimeJobs,
        request: {
          controlId: "integration-closeout-readback",
          controlKind: "closeout_readback",
          runtimeJobId: job.jobId,
          actorId: "operator",
          authenticated: true,
          reason: "read back closeout through runtime control surface",
          targetValidation: { fresh: true, authorized: true, source: "fixture_runtime_state" },
        },
      });
      const projection = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-worker-boundary",
      });
      const summary = summarizeWorkQueueExecutionForUi(projection);
      expect(JSON.stringify(summary)).toContain("worker.acp-codex.coding");
      expect(JSON.stringify(summary)).toContain("execution_platform_closeout_capsule");
      expect(JSON.stringify(summary)).toContain("closeout_readback");
      expect(JSON.stringify(summary)).toContain("allowed_by_coding_worker_contract");

      const audit = auditBrowserPromptRuntimeLinkage({
        promptKind: "execution",
        runtimeJobId: job.jobId,
        workflowId: "agent_team.coding",
        workerContractState:
          summary && typeof summary === "object" && !Array.isArray(summary)
            ? ((summary as Record<string, unknown>).workerContractState as JsonValue)
            : null,
        closeoutCapsule:
          closeout && typeof closeout === "object" && !Array.isArray(closeout)
            ? ((closeout as Record<string, unknown>).closeoutCapsule as JsonValue)
            : null,
        workQueueProjection: summary,
      });
      expect(audit).toMatchObject({
        passed: true,
        reasonCodes: ["browser_runtime_linkage_passed"],
      });

      expect(JSON.stringify(await runtimeJobs.listArtifacts(job.jobId))).not.toContain(
        '"rawPromptStored":true',
      );
    } finally {
      await db.close();
    }
  });
});
