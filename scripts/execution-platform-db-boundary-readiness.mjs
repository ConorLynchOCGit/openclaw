import fs from "node:fs";
import {
  buildExecutionPlatformFeatureFlagRegistry,
  createExecutionPlatformDatabaseRuntime,
  evaluateExecutionPlatformFlag,
  inspectExecutionPlatformDbReadiness,
  resolveExecutionPlatformDbBoundaryContract,
  seedConvergenceTrackerWhenDbReady,
  RuntimeJobRepository,
  WorkQueueRepository,
} from "../extensions/execution-platform/src/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";

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
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
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
    `${JSON.stringify({ ...value, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
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
    missingTables: readiness.missingTables,
    writeAccessAllowed: readiness.writeAccessAllowed,
    convergenceTrackerMaySeed: readiness.convergenceTrackerMaySeed,
    readinessState: readiness.readinessState,
    reasonCodes: readiness.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

async function main() {
  loadDotenvFiles();
  const shouldInspectLive = hasArg("--inspect-live");
  const shouldSeed = hasArg("--seed");
  if (!shouldInspectLive) {
    writeArtifact("execution-platform-live-db-boundary-readiness.json", {
      artifactKind: "execution_platform_live_db_boundary_readiness",
      status: "blocked_not_requested",
      reasonCodes: ["live_db_inspection_requires_inspect_live_flag"],
      liveDbConnected: false,
      seedAttempted: false,
      rawPromptStored: false,
      rawResponseStored: false,
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
    });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    writeArtifact("execution-platform-live-db-boundary-readiness.json", {
      artifactKind: "execution_platform_live_db_boundary_readiness",
      status: "inspected",
      liveDbConnected: true,
      readiness: summarizeReadiness(readiness),
      seedRequested: shouldSeed,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });

    if (!shouldSeed) {
      writeArtifact("convergence-tracker-live-seed-blocker.json", {
        artifactKind: "convergence_tracker_live_seed_blocker",
        status: "blocked_seed_not_requested",
        reasonCodes: ["live_seed_requires_seed_flag"],
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      });
      return;
    }

    const flagRegistry = buildExecutionPlatformFeatureFlagRegistry({
      env: process.env,
      dbReadiness: readiness,
      scope: "owner_only",
    });
    const seedGate = evaluateExecutionPlatformFlag(flagRegistry, "convergence_tracker_live_seed", {
      critical: true,
      dbReadiness: readiness,
    });
    if (!seedGate.allowed) {
      writeArtifact("convergence-tracker-live-seed-blocker.json", {
        artifactKind: "convergence_tracker_live_seed_blocker",
        status: "blocked_feature_gate_or_db_boundary",
        reasonCodes: seedGate.reasonCodes,
        flagDecision: {
          flagId: seedGate.flagId,
          decision: seedGate.decision,
          currentState: seedGate.currentState,
          riskClass: seedGate.riskClass,
          sourceRef: seedGate.sourceRef,
          configRef: seedGate.configRef,
          rawConfigValueStored: false,
        },
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        authorityGranted: false,
        controlsApplied: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return;
    }

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const seedResult = await seedConvergenceTrackerWhenDbReady({
      workQueue,
      readiness,
      actorId: "system:execution-platform-db-boundary-live-seed",
    });
    if (seedResult.accepted) {
      const readback = await workQueue.readWorkQueue(100);
      writeArtifact("convergence-tracker-live-seed-proof.json", {
        artifactKind: "convergence_tracker_live_seed_proof",
        status: "seeded",
        created: seedResult.created,
        existing: seedResult.existing,
        updated: seedResult.updated,
        projectedConvergenceSliceCount: readback.filter((item) => item.convergenceSlice).length,
        activeQueueItemCount: readback.filter((item) => item.queueStatus !== "closed").length,
        nextActiveQueueItem: readback.find((item) => item.queueStatus === "active") ?? null,
        sliceOneStatus: readback.find((item) => item.workItemId === "openclaw-convergence.slice-01")
          ?.convergenceSlice?.planningStatus,
        sliceTwoStatus: readback.find((item) => item.workItemId === "openclaw-convergence.slice-02")
          ?.convergenceSlice?.planningStatus,
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        authorityGranted: false,
        controlsApplied: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
    } else {
      writeArtifact("convergence-tracker-live-seed-blocker.json", {
        artifactKind: "convergence_tracker_live_seed_blocker",
        status: "blocked",
        reasonCodes: seedResult.reasonCodes,
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        authorityGranted: false,
        controlsApplied: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
    }
  } catch (error) {
    writeArtifact("execution-platform-live-db-boundary-readiness.json", {
      artifactKind: "execution_platform_live_db_boundary_readiness",
      status: "blocked",
      reasonCodes: ["live_db_boundary_inspection_failed"],
      errorSummary:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      liveDbConnected: false,
      seedAttempted: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("convergence-tracker-live-seed-blocker.json", {
      artifactKind: "convergence_tracker_live_seed_blocker",
      status: "blocked_live_db_inspection_failed",
      reasonCodes: ["live_db_boundary_inspection_failed"],
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
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
