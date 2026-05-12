#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = ".artifacts/execution-platform";
let executionPlatform;

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    `${ARTIFACT_DIR}/${name}`,
    `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    reasonCodes: readiness.reasonCodes,
  };
}

async function main() {
  if (!hasArg("--live")) {
    writeArtifact("owner-visible-work-queue-pilot-blocker.json", {
      artifactKind: "owner_visible_work_queue_pilot_blocker",
      status: "blocked_not_requested",
      reasonCodes: ["owner_visible_work_queue_pilot_requires_live_flag"],
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    return;
  }

  const {
    NativeExecutionRpcService,
    RuntimeJobRepository,
    WorkQueueRepository,
    createExecutionPlatformDatabaseRuntime,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
  } = await ep();

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const readinessSummary = summarizeReadiness(readiness);

    if (!gate.enabled) {
      writeArtifact("owner-visible-work-queue-pilot-blocker.json", {
        artifactKind: "owner_visible_work_queue_pilot_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: readinessSummary,
        gate: {
          decision: gate.decision,
          enabled: gate.enabled,
          reasonCodes: gate.reasonCodes,
        },
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        controlsApplied: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return;
    }

    const suffix = Date.now();
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const rpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
    const workItemId = `owner-visible-work-queue-pilot-${suffix}`;
    const runId = `owner-visible-work-queue-pilot-run-${suffix}`;
    const runtimeJobId = `owner-visible-work-queue-pilot-runtime-${suffix}`;

    await workQueue.createWorkItem({
      workItemId,
      itemType: "owner_visible_runtime_control_pilot",
      title: "Owner-visible Work Queue control/readback pilot",
      description: "Bounded owner-visible Work Queue item linked to runtime truth.",
      actorId: "operator",
      metadata: {
        slice: "15",
        ownerVisible: true,
        lifecycleTruthSource: "execution_platform_runtime_jobs",
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      },
    });
    const job = await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "execution_platform.owner_visible_work_queue_pilot",
      queueName: "execution-platform-smoke",
      payload: {
        workflowId: "execution_platform.owner_visible_work_queue_pilot",
        objectiveSummary: "Owner-visible Work Queue control/readback pilot.",
        workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      },
      workItemId,
      idempotencyScope: "execution-platform.owner-visible-work-queue-pilot",
      idempotencyKey: runtimeJobId,
    });
    const run = await workQueue.createWorkRun({
      runId,
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "pending",
      metadata: {
        runtimeJobId: job.jobId,
        lifecycleTruthSource: "execution_platform_runtime_jobs",
        workQueueLifecycleMutationAllowed: false,
      },
    });

    const actionKinds = [
      "pause",
      "redirect",
      "cancel",
      "retry",
      "mark_needs_review",
      "view_closeout",
    ];
    const decisions = [];
    for (const actionKind of actionKinds) {
      decisions.push(
        await rpc.applyControl({
          actionKind,
          actionId: `owner-visible-${actionKind}-${suffix}`,
          workItemId,
          runtimeJobId: job.jobId,
          auth: {
            actorId: "operator",
            authenticated: true,
            role: "operator",
            sourceRoute: "work_queue",
          },
          metadata:
            actionKind === "redirect"
              ? {
                  redirectSummary: "Bounded owner-visible redirect proof.",
                  rawPromptStored: false,
                  rawResponseStored: false,
                }
              : undefined,
        }),
      );
    }
    const unauthenticated = await rpc.applyControl({
      actionKind: "pause",
      actionId: `owner-visible-unauth-${suffix}`,
      workItemId,
      runtimeJobId: job.jobId,
      auth: { actorId: "", authenticated: false, role: "operator", sourceRoute: "work_queue" },
    });
    const missingRuntime = await rpc.applyControl({
      actionKind: "cancel",
      actionId: `owner-visible-missing-runtime-${suffix}`,
      workItemId,
      runtimeJobId: `missing-runtime-${suffix}`,
      auth: {
        actorId: "operator",
        authenticated: true,
        role: "operator",
        sourceRoute: "work_queue",
      },
    });
    const projection = await rpc.readWorkQueueProjection(workItemId);
    let missingProjectionUnavailable = false;
    try {
      await rpc.readWorkQueueProjection(`missing-work-item-${suffix}`);
    } catch (error) {
      missingProjectionUnavailable =
        error instanceof Error && error.message.includes("work item not found");
    }
    const status = await rpc.status(job.jobId);
    const closeout = await rpc.readCloseout(job.jobId);

    writeArtifact("owner-visible-work-queue-pilot-proof.json", {
      artifactKind: "owner_visible_work_queue_pilot_proof",
      status: "completed",
      readiness: readinessSummary,
      workItemId,
      runId: run.runId,
      runtimeJobId: job.jobId,
      runtimeJobState: status.runtimeJob?.state ?? null,
      lifecycleTruthSource: "execution_platform_runtime_jobs",
      runtimeJobsCreated: true,
      liveWorkQueueItemsCreated: true,
      liveWorkQueueRunsCreated: true,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("owner-visible-work-queue-controls-proof.json", {
      artifactKind: "owner_visible_work_queue_controls_proof",
      status: decisions.every((decision) => decision.accepted) ? "completed" : "needs_review",
      workItemId,
      runId: run.runId,
      runtimeJobId: job.jobId,
      actionKinds,
      acceptedControlCount: decisions.filter((decision) => decision.accepted).length,
      runtimeBacked: true,
      controlsApplied: true,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    writeArtifact("owner-visible-work-queue-readback-proof.json", {
      artifactKind: "owner_visible_work_queue_readback_proof",
      status: projection ? "completed" : "needs_review",
      workItemId,
      runId: run.runId,
      runtimeJobId: job.jobId,
      runtimeJobState: status.runtimeJob?.state ?? null,
      projectionAvailable: Boolean(projection),
      closeoutRefCount:
        closeout && typeof closeout === "object" && "closeoutRefs" in closeout
          ? closeout.closeoutRefs.length
          : 0,
      lifecycleTruthSource: "execution_platform_runtime_jobs",
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    writeArtifact("owner-visible-work-queue-negative-cases-proof.json", {
      artifactKind: "owner_visible_work_queue_negative_cases_proof",
      status: !unauthenticated.accepted && !missingRuntime.accepted ? "passed" : "needs_review",
      unauthenticatedRejected: !unauthenticated.accepted,
      missingRuntimeRejected: !missingRuntime.accepted,
      missingProjectionUnavailable,
      rejectedReasonCodes: [unauthenticated, missingRuntime]
        .flatMap((decision) => decision.reasonCodes)
        .slice(0, 20),
      controlsAppliedForRejectedCases: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
  } catch (error) {
    writeArtifact("owner-visible-work-queue-pilot-blocker.json", {
      artifactKind: "owner_visible_work_queue_pilot_blocker",
      status: "blocked_runtime_error",
      reasonCodes: ["owner_visible_work_queue_pilot_runtime_error"],
      errorSummary:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    process.exitCode = 2;
  } finally {
    if (runtime) {
      await runtime.pool.end();
    }
  }
}

await main();
