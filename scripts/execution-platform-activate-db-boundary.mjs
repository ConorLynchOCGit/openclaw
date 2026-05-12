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

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    `${ARTIFACT_DIR}/${name}`,
    `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function envFlagEnabled(name) {
  const value = process.env[name]?.trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(value ?? "");
}

function summarizeReadiness(readiness) {
  return {
    artifactKind: readiness.artifactKind,
    contractVersion: readiness.contractVersion,
    boundary: {
      boundaryKind: readiness.boundary.boundaryKind,
      schemaName: readiness.boundary.schemaName,
      migrationOwner: readiness.boundary.migrationOwner,
      configSourceRef: readiness.boundary.configSourceRef,
      runtimeSubstrateRef: readiness.boundary.runtimeSubstrateRef,
      databaseName: readiness.boundary.databaseName,
      capability: readiness.boundary.capability,
      readinessState: readiness.boundary.readinessState,
      fallbackReasonCodes: readiness.boundary.fallbackReasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
    schemaPresent: readiness.schemaPresent,
    appliedMigrationRefs: readiness.appliedMigrationRefs,
    requiredMigrationRefs: readiness.requiredMigrationRefs,
    missingMigrationRefs: readiness.missingMigrationRefs,
    requiredTables: readiness.requiredTables,
    missingTables: readiness.missingTables,
    writeAccessAllowed: readiness.writeAccessAllowed,
    convergenceTrackerMaySeed: readiness.convergenceTrackerMaySeed,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    readinessState: readiness.readinessState,
    reasonCodes: readiness.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function summarizeGate(gate) {
  return {
    artifactKind: gate.artifactKind,
    contractVersion: gate.contractVersion,
    decision: gate.decision,
    enabled: gate.enabled,
    boundaryKind: gate.boundaryKind,
    readinessState: gate.readinessState,
    workQueueLiveLinkageMayAttach: gate.workQueueLiveLinkageMayAttach,
    missingTables: gate.missingTables,
    missingMigrationRefs: gate.missingMigrationRefs,
    reasonCodes: gate.reasonCodes,
    runtimeJobsCreated: false,
    liveWorkQueueItemsCreated: false,
    liveWorkQueueRunsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

async function runSmoke(input) {
  const { RuntimeJobRepository, WorkQueueRepository } = await ep();
  const suffix = Date.now();
  const runtimeJobs = new RuntimeJobRepository(input.runtime.sqlClient, { claimStrategy: "basic" });
  const workQueue = new WorkQueueRepository(input.runtime.sqlClient, runtimeJobs);
  const workItemId = `db-boundary-linkage-smoke-${suffix}`;
  const runtimeJobId = `db-boundary-linkage-smoke-runtime-${suffix}`;
  const runId = `db-boundary-linkage-smoke-run-${suffix}`;

  const workItem = await workQueue.createWorkItem({
    workItemId,
    itemType: "execution_platform_db_boundary_smoke",
    title: "DB boundary live Work Queue linkage smoke",
    description: "Bounded live linkage smoke item created only after DB boundary gate passed.",
    actorId: "system:execution-platform-db-boundary-activation",
    metadata: {
      slice: "14A",
      boundaryKind: input.readiness.boundary.boundaryKind,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    },
  });
  const runtimeJob = await runtimeJobs.enqueueJob({
    jobId: runtimeJobId,
    jobType: "execution_platform.db_boundary_linkage_smoke",
    queueName: "execution-platform-smoke",
    payload: {
      objectiveSummary: "Bounded DB boundary linkage smoke.",
      workItemId,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    },
    workItemId,
    idempotencyScope: "execution-platform.db-boundary-linkage-smoke",
    idempotencyKey: runtimeJobId,
  });
  const run = await workQueue.createWorkRun({
    runId,
    workItemId,
    executorKind: "runtime_job",
    runtimeJobId,
    runState: "pending",
    metadata: {
      runtimeJobId,
      lifecycleTruthSource: "execution_platform_runtime_jobs",
      workQueueLifecycleMutationAllowed: false,
    },
  });
  const readback = await workQueue.readWorkItemTruth(workItemId);

  writeArtifact("db-boundary-live-linkage-smoke-proof.json", {
    artifactKind: "db_boundary_live_linkage_smoke_proof",
    status: "completed",
    workItemId: workItem.workItemId,
    runId: run.runId,
    runtimeJobId: runtimeJob.jobId,
    runState: run.runState,
    lifecycleTruthSource: "execution_platform_runtime_jobs",
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  writeArtifact("work-queue-live-linkage-readback-proof.json", {
    artifactKind: "work_queue_live_linkage_readback_proof",
    status: readback ? "completed" : "blocked_readback_missing",
    workItemId,
    runId,
    runtimeJobId,
    readbackPresent: Boolean(readback),
    readbackRunCount: readback?.runs.length ?? 0,
    readbackRuntimeJobIds: readback?.runs
      .map((candidate) => candidate.runtimeJobId)
      .filter(Boolean)
      .slice(0, 10),
    lifecycleTruthSource: "execution_platform_runtime_jobs",
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
}

async function main() {
  loadDotenvFiles();
  const {
    createExecutionPlatformDatabaseRuntime,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
  } = await ep();
  if (!hasArg("--inspect-live")) {
    writeArtifact("db-boundary-activation-blocker.json", {
      artifactKind: "db_boundary_activation_blocker",
      status: "blocked_not_requested",
      reasonCodes: ["live_db_boundary_activation_requires_inspect_live_flag"],
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    return;
  }

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({
      applyMigrations: false,
    });
    const boundary = resolveExecutionPlatformDbBoundaryContract({
      resolution: runtime.resolution,
      sharedRuntimeDb:
        runtime.resolution.explicitlyApprovedSharedRuntimeDatabase ||
        envFlagEnabled("OPENCLAW_EXECUTION_PLATFORM_SHARED_RUNTIME_DB_APPROVED"),
    });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const readinessSummary = summarizeReadiness(readiness);
    const gateSummary = summarizeGate(gate);

    writeArtifact("db-boundary-readiness-proof.json", {
      artifactKind: "db_boundary_readiness_proof",
      status: "inspected",
      readiness: readinessSummary,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("db-boundary-migration-readiness-proof.json", {
      artifactKind: "db_boundary_migration_readiness_proof",
      status: readiness.missingMigrationRefs.length === 0 ? "passed" : "blocked_missing_migrations",
      appliedMigrationRefs: readiness.appliedMigrationRefs,
      requiredMigrationRefs: readiness.requiredMigrationRefs,
      missingMigrationRefs: readiness.missingMigrationRefs,
      missingTables: readiness.missingTables,
      destructiveMigrationApplied: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("work-queue-live-linkage-gate-proof.json", {
      artifactKind: "work_queue_live_linkage_gate_proof",
      status: gate.enabled ? "enabled" : "blocked",
      gate: gateSummary,
      readiness: readinessSummary,
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });

    if (!gate.enabled) {
      writeArtifact("db-boundary-live-linkage-blocker.json", {
        artifactKind: "db_boundary_live_linkage_blocker",
        status: "blocked",
        blocker: gate.decision,
        reasonCodes: gate.reasonCodes,
        readiness: readinessSummary,
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return;
    }

    if (!hasArg("--smoke")) {
      writeArtifact("db-boundary-live-linkage-blocker.json", {
        artifactKind: "db_boundary_live_linkage_blocker",
        status: "blocked_smoke_not_requested",
        blocker: "smoke_requires_explicit_smoke_flag",
        reasonCodes: ["live_linkage_smoke_requires_explicit_smoke_flag"],
        readiness: readinessSummary,
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawDbRowsStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return;
    }

    await runSmoke({ runtime, readiness });
  } catch (error) {
    writeArtifact("db-boundary-activation-blocker.json", {
      artifactKind: "db_boundary_activation_blocker",
      status: "blocked_inspection_failed",
      reasonCodes: ["db_boundary_activation_inspection_failed"],
      errorSummary:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
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
