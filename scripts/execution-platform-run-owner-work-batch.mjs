#!/usr/bin/env node
import { createHash } from "node:crypto";
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

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), body);
  return { path: `${ARTIFACT_DIR}/${name}`, sha256: sha256(body) };
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

async function runFixture() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    RuntimeJobRepository,
    WorkQueueRepository,
    runOwnerWorkBatch,
  } = await ep();
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
    const result = await runOwnerWorkBatch({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: true,
    });
    writeArtifact("owner-work-batch-fixture-proof.json", {
      artifactKind: "owner_work_batch_fixture_proof",
      status: result.status,
      result,
    });
    return result;
  } finally {
    await database.close();
  }
}

async function runLiveIfRequested() {
  if (!hasArg("--live")) {
    writeArtifact("owner-work-batch-live-blocker.json", {
      artifactKind: "owner_work_batch_live_blocker",
      status: "blocked_live_not_requested",
      reasonCodes: ["owner_work_batch_requires_live_flag"],
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    });
    return null;
  }
  const {
    RuntimeJobRepository,
    WorkQueueRepository,
    createExecutionPlatformDatabaseRuntime,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    runOwnerWorkBatch,
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
    if (!gate.enabled) {
      writeArtifact("owner-work-batch-live-blocker.json", {
        artifactKind: "owner_work_batch_live_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: summarizeReadiness(readiness),
        gate,
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawPageStored: false,
        workQueueLifecycleMutated: false,
      });
      return null;
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const result = await runOwnerWorkBatch({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: true,
    });
    writeArtifact("owner-work-batch-live-proof.json", {
      artifactKind: "owner_work_batch_live_proof",
      status: result.status,
      readiness: summarizeReadiness(readiness),
      result,
    });
    return result;
  } finally {
    if (runtime) {
      await runtime.pool.end();
    }
  }
}

await runFixture();
await runLiveIfRequested();
