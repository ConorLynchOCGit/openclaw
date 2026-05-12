import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  type StructuredModelIntentRouterProvider,
} from "../intent-front-door/index.ts";
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
import { buildDefaultWorkflowWorkerAdapterRegistry } from "./workflow-worker-adapter-registry.ts";

function codingRouterProvider(): StructuredModelIntentRouterProvider {
  return {
    async route() {
      return {
        output: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.95,
          objectiveSummary: "Run bounded coding worker-supervisor proof.",
          requestedActions: [
            createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
            createCanonicalRouterAction("test", "focused tests", 0.95),
            createCanonicalRouterAction("review", "review", 0.95),
            createCanonicalRouterAction("closeout", "closeout", 0.95),
          ],
          requestedAuthority: "local_yolo",
          sideEffectClass: "code_edit",
        }),
        providerRef: "fixture://structured-front-door",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: ["fixture_structured_router"],
      };
    },
  };
}

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
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        queueName: "worker-boundary",
        structuredRouterProvider: codingRouterProvider(),
        workerAdapterRegistry: buildDefaultWorkflowWorkerAdapterRegistry({
          generatedAt: "2026-05-08T22:00:00.000Z",
          contractStateByWorkflowId: { "agent_team.coding": "shadow" },
          adapterIdByWorkflowId: { "agent_team.coding": "worker.acp-codex.coding" },
        }),
      });
      const submit = await rpc.submit({
        prompt: "Have the coding team make a bounded proof improvement.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-worker-boundary",
        },
        workItemId: "work-item-worker-boundary",
      });
      expect(submit).toMatchObject({
        accepted: true,
        workflowId: "agent_team.coding",
        workerContractState: "shadow",
        workerAdapterId: "worker.acp-codex.coding",
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
      }).runOnce({ runtimeJobId: submit.runtimeJobId ?? undefined });
      expect(workerRun).toMatchObject({
        status: "completed",
        completed: true,
        runtimeJobId: submit.runtimeJobId,
      });

      const closeout = await rpc.readCloseout(submit.runtimeJobId ?? "");
      expect(JSON.stringify(closeout)).toContain("execution_platform_closeout_capsule");
      await applyRuntimeWorkerSupervisorControl({
        runtimeJobs,
        request: {
          controlId: "integration-closeout-readback",
          controlKind: "closeout_readback",
          runtimeJobId: submit.runtimeJobId,
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
        runtimeJobId: submit.runtimeJobId,
        workflowId: submit.workflowId,
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

      expect(
        JSON.stringify(await runtimeJobs.listArtifacts(submit.runtimeJobId ?? "")),
      ).not.toContain('"rawPromptStored":true');
    } finally {
      await db.close();
    }
  });
});
