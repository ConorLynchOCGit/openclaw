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

function summarizeGate(gate) {
  return {
    decision: gate.decision,
    enabled: gate.enabled,
    boundaryKind: gate.boundaryKind,
    readinessState: gate.readinessState,
    reasonCodes: gate.reasonCodes,
  };
}

async function main() {
  if (!hasArg("--live-smoke")) {
    writeArtifact("work-queue-runtime-controls-live-smoke-blocker.json", {
      artifactKind: "work_queue_runtime_controls_live_smoke_blocker",
      status: "blocked_not_requested",
      reasonCodes: ["work_queue_runtime_controls_smoke_requires_live_smoke_flag"],
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
    const boundary = resolveExecutionPlatformDbBoundaryContract({
      resolution: runtime.resolution,
      sharedRuntimeDb: runtime.resolution.explicitlyApprovedSharedRuntimeDatabase,
    });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });

    if (!gate.enabled) {
      writeArtifact("work-queue-runtime-controls-live-smoke-blocker.json", {
        artifactKind: "work_queue_runtime_controls_live_smoke_blocker",
        status: "blocked_db_boundary_gate",
        gate: summarizeGate(gate),
        readiness: summarizeReadiness(readiness),
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
    const workItemId = `work-queue-controls-smoke-${suffix}`;
    const runtimeJobId = `work-queue-controls-smoke-runtime-${suffix}`;
    const runId = `work-queue-controls-smoke-run-${suffix}`;

    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_platform_runtime_controls_smoke",
      title: "Work Queue runtime controls smoke",
      description: "Bounded runtime-backed Work Queue controls smoke item.",
      actorId: "system:execution-platform-work-queue-controls-smoke",
      metadata: {
        slice: "14B",
        lifecycleTruthSource: "execution_platform_runtime_jobs",
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
      },
    });
    const job = await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "execution_platform.work_queue_controls_smoke",
      queueName: "execution-platform-smoke",
      payload: {
        objectiveSummary: "Bounded Work Queue runtime controls smoke.",
        workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      },
      workItemId,
      idempotencyScope: "execution-platform.work-queue-controls-smoke",
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
          actionId: `work-queue-controls-smoke-${actionKind}-${suffix}`,
          workItemId,
          runtimeJobId: job.jobId,
          auth: {
            actorId: "operator",
            authenticated: true,
            role: "operator",
            sourceRoute: "service",
          },
          metadata:
            actionKind === "redirect"
              ? {
                  redirectSummary: "Bounded smoke redirect metadata.",
                  rawPromptStored: false,
                  rawResponseStored: false,
                }
              : undefined,
        }),
      );
    }
    const unauthenticated = await rpc.applyControl({
      actionKind: "pause",
      actionId: `work-queue-controls-smoke-unauth-${suffix}`,
      workItemId,
      runtimeJobId: job.jobId,
      auth: { actorId: "", authenticated: false, role: "operator", sourceRoute: "service" },
    });
    const missingRuntime = await rpc.applyControl({
      actionKind: "cancel",
      actionId: `work-queue-controls-smoke-missing-runtime-${suffix}`,
      workItemId,
      runtimeJobId: `missing-runtime-${suffix}`,
      auth: { actorId: "operator", authenticated: true, role: "operator", sourceRoute: "service" },
    });
    const projection = await rpc.readWorkQueueProjection(workItemId);
    const status = await rpc.status(job.jobId);
    const closeout = await rpc.readCloseout(job.jobId);

    const acceptedControlCount = decisions.filter((decision) => decision.accepted).length;
    const rejectedControlReasonCodes = [unauthenticated, missingRuntime]
      .flatMap((decision) => decision.reasonCodes)
      .slice(0, 20);

    writeArtifact("work-queue-runtime-controls-live-smoke-proof.json", {
      artifactKind: "work_queue_runtime_controls_live_smoke_proof",
      status: acceptedControlCount === actionKinds.length ? "completed" : "needs_review",
      workItemId,
      runId: run.runId,
      runtimeJobId: job.jobId,
      actionKinds,
      acceptedControlCount,
      rejectedControlReasonCodes,
      missingRuntimeRejected: !missingRuntime.accepted,
      unauthenticatedRejected: !unauthenticated.accepted,
      lifecycleTruthSource: "execution_platform_runtime_jobs",
      runtimeJobsCreated: true,
      liveWorkQueueItemsCreated: true,
      liveWorkQueueRunsCreated: true,
      controlsApplied: true,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("work-queue-runtime-controls-live-readback-proof.json", {
      artifactKind: "work_queue_runtime_controls_live_readback_proof",
      status: status.runtimeJob && projection ? "completed" : "needs_review",
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
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
  } catch (error) {
    writeArtifact("work-queue-runtime-controls-live-smoke-blocker.json", {
      artifactKind: "work_queue_runtime_controls_live_smoke_blocker",
      status: "blocked_smoke_failed",
      reasonCodes: ["work_queue_runtime_controls_smoke_failed"],
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
