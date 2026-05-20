#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
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
    .update(String(value ?? ""))
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const text = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(path.join(artifactRoot, name), text, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(text) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of (await readTextIfExists(filePath)).split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function boundedSource() {
  return {
    sourceRef: "official-docs://research-to-coding-fixture",
    sourceKind: "official_docs",
    urlHash: "url-hash",
    contentHash: "content-hash",
    titleSummary: "Official documentation source",
    citationSummary: "Bounded current-doc finding used only as data for coding handoff.",
    retrievedAt: new Date().toISOString(),
  };
}

function summarizeResult(result) {
  return {
    ...result,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawPageStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function runFixture() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    RuntimeJobRepository,
    WorkQueueRepository,
    runResearchToCodingHandoffPilot,
    runModelTaskMiddlewarePilot,
    runScriptMiddlewarePilot,
    runDbOperationMiddlewarePilot,
  } = await ep();
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const handoff = await runResearchToCodingHandoffPilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      parentRuntimeJobId: "research-to-coding-fixture-parent",
      childRuntimeJobId: "research-to-coding-fixture-child",
      teamRunId: "research-to-coding-fixture-team-run",
      researchRunId: "research-to-coding-fixture-research-run",
      objectiveSummary: "Use bounded current-doc research refs before coding.",
      boundedResearchSummary: "Fixture research-to-coding handoff stores refs and hashes only.",
      sources: [boundedSource()],
    });
    const modelTask = await runModelTaskMiddlewarePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: "model-task-middleware-fixture-job",
    });
    const script = await runScriptMiddlewarePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: "script-middleware-fixture-job",
      proofOnly: true,
    });
    const dbOperation = await runDbOperationMiddlewarePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: "db-operation-middleware-fixture-job",
      proofOnly: true,
    });
    await writeJson("research-to-coding-handoff-fixture-proof.json", {
      artifactKind: "research_to_coding_handoff_fixture_proof",
      status: handoff.status,
      result: summarizeResult(handoff),
    });
    await writeJson("research-to-coding-handoff-work-queue-readback-proof.json", {
      artifactKind: "research_to_coding_handoff_work_queue_readback_proof",
      status: handoff.workQueueReadback ? "completed" : "blocked",
      readback: handoff.workQueueReadback,
      workQueueLifecycleMutated: false,
    });
    await writeJson("model-task-middleware-fixture-proof.json", {
      artifactKind: "model_task_middleware_fixture_proof",
      status: modelTask.status,
      result: summarizeResult(modelTask),
    });
    await writeJson("model-task-middleware-work-queue-readback-proof.json", {
      artifactKind: "model_task_middleware_work_queue_readback_proof",
      status: modelTask.workQueueReadback ? "completed" : "blocked",
      readback: modelTask.workQueueReadback,
      workQueueLifecycleMutated: false,
    });
    await writeJson("script-middleware-fixture-proof.json", {
      artifactKind: "script_middleware_fixture_proof",
      status: script.status,
      result: summarizeResult(script),
    });
    await writeJson("script-middleware-work-queue-readback-proof.json", {
      artifactKind: "script_middleware_work_queue_readback_proof",
      status: script.workQueueReadback ? "completed" : "blocked",
      readback: script.workQueueReadback,
      workQueueLifecycleMutated: false,
    });
    await writeJson("db-operation-middleware-fixture-proof.json", {
      artifactKind: "db_operation_middleware_fixture_proof",
      status: dbOperation.status,
      result: summarizeResult(dbOperation),
    });
    await writeJson("db-operation-middleware-work-queue-readback-proof.json", {
      artifactKind: "db_operation_middleware_work_queue_readback_proof",
      status: dbOperation.workQueueReadback ? "completed" : "blocked",
      readback: dbOperation.workQueueReadback,
      workQueueLifecycleMutated: false,
    });
    return { handoff, modelTask, script, dbOperation };
  } finally {
    await database.close();
  }
}

async function runLiveRuntimeOnly() {
  const {
    createExecutionPlatformDatabaseRuntime,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    RuntimeJobRepository,
    runResearchToCodingHandoffPilot,
    runModelTaskMiddlewarePilot,
    runScriptMiddlewarePilot,
    runDbOperationMiddlewarePilot,
    inspectLiveDbReadinessForDbOperationMiddleware,
  } = await ep();
  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const readinessSummary = {
      boundaryKind: readiness.boundary.boundaryKind,
      runtimeSubstrateRef: readiness.boundary.runtimeSubstrateRef,
      databaseName: readiness.boundary.databaseName,
      readinessState: readiness.readinessState,
      schemaPresent: readiness.schemaPresent,
      missingTables: readiness.missingTables,
      writeAccessAllowed: readiness.writeAccessAllowed,
      reasonCodes: readiness.reasonCodes,
      rawRowsStored: false,
      secretsStored: false,
    };
    await writeJson("convergence-slices-10-13-live-db-readiness.json", {
      artifactKind: "convergence_slices_10_13_live_db_readiness",
      status: "inspected",
      readiness: readinessSummary,
      workQueueLifecycleMutated: false,
    });
    if (!readiness.writeAccessAllowed || readiness.missingTables.length > 0) {
      await writeJson("convergence-slices-10-13-live-runtime-blocker.json", {
        artifactKind: "convergence_slices_10_13_live_runtime_blocker",
        status: "blocked_runtime_db_not_writable",
        readiness: readinessSummary,
        reasonCodes: readiness.reasonCodes,
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
      });
      return null;
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const suffix = Date.now();
    const handoff = await runResearchToCodingHandoffPilot({
      runtimeJobs,
      parentRuntimeJobId: `research-to-coding-live-parent-${suffix}`,
      childRuntimeJobId: `research-to-coding-live-child-${suffix}`,
      teamRunId: `research-to-coding-live-team-run-${suffix}`,
      researchRunId: `research-to-coding-live-research-run-${suffix}`,
      objectiveSummary: "Use bounded current-doc research refs before coding.",
      boundedResearchSummary: "Live runtime-only research handoff stores refs and hashes only.",
      sources: [boundedSource()],
    });
    const modelTask = await runModelTaskMiddlewarePilot({
      runtimeJobs,
      runtimeJobId: `model-task-middleware-live-${suffix}`,
    });
    const script = await runScriptMiddlewarePilot({
      runtimeJobs,
      runtimeJobId: `script-middleware-live-${suffix}`,
      proofOnly: true,
    });
    const dbReadiness = await inspectLiveDbReadinessForDbOperationMiddleware();
    const dbOperation = await runDbOperationMiddlewarePilot({
      runtimeJobs,
      runtimeJobId: `db-operation-middleware-live-${suffix}`,
      proofOnly: true,
      boundedOutput: {
        boundedResultSummary: "Live DB readiness inspected with bounded metadata only.",
        readiness: dbReadiness,
        rawRowsStored: false,
        secretsStored: false,
      },
    });
    await writeJson("research-to-coding-handoff-runtime-proof.json", {
      artifactKind: "research_to_coding_handoff_runtime_proof",
      status: handoff.status,
      result: summarizeResult(handoff),
      liveWorkQueueReadbackBlocker:
        "runtime_only_live_pilot_did_not_create_work_item_to_avoid_direct_work_queue_lifecycle_mutation",
    });
    await writeJson("model-task-middleware-live-runtime-proof.json", {
      artifactKind: "model_task_middleware_live_runtime_proof",
      status: modelTask.status,
      result: summarizeResult(modelTask),
      providerCallsMade: false,
      liveWorkQueueReadbackBlocker:
        "runtime_only_live_pilot_did_not_create_work_item_to_avoid_direct_work_queue_lifecycle_mutation",
    });
    await writeJson("script-middleware-live-runtime-proof.json", {
      artifactKind: "script_middleware_live_runtime_proof",
      status: script.status,
      result: summarizeResult(script),
      liveWorkQueueReadbackBlocker:
        "runtime_only_live_pilot_did_not_create_work_item_to_avoid_direct_work_queue_lifecycle_mutation",
    });
    await writeJson("db-operation-middleware-live-readonly-proof.json", {
      artifactKind: "db_operation_middleware_live_readonly_proof",
      status: dbOperation.status,
      result: summarizeResult(dbOperation),
      dbReadiness,
      liveWorkQueueReadbackBlocker:
        "runtime_only_live_pilot_did_not_create_work_item_to_avoid_direct_work_queue_lifecycle_mutation",
    });
    return { handoff, modelTask, script, dbOperation, readiness: readinessSummary };
  } finally {
    await runtime?.pool.end();
  }
}

async function main() {
  await loadDotenvFiles();
  let fixture = null;
  let live = null;
  const artifactRefs = [];
  if (hasArg("--fixture")) {
    fixture = await runFixture();
    artifactRefs.push(
      ".artifacts/execution-platform/research-to-coding-handoff-fixture-proof.json",
      ".artifacts/execution-platform/research-to-coding-handoff-work-queue-readback-proof.json",
      ".artifacts/execution-platform/model-task-middleware-fixture-proof.json",
      ".artifacts/execution-platform/model-task-middleware-work-queue-readback-proof.json",
      ".artifacts/execution-platform/script-middleware-fixture-proof.json",
      ".artifacts/execution-platform/script-middleware-work-queue-readback-proof.json",
      ".artifacts/execution-platform/db-operation-middleware-fixture-proof.json",
      ".artifacts/execution-platform/db-operation-middleware-work-queue-readback-proof.json",
    );
  }
  if (hasArg("--run-live-runtime-only")) {
    live = await runLiveRuntimeOnly();
    artifactRefs.push(
      ".artifacts/execution-platform/convergence-slices-10-13-live-db-readiness.json",
      live
        ? ".artifacts/execution-platform/research-to-coding-handoff-runtime-proof.json"
        : ".artifacts/execution-platform/convergence-slices-10-13-live-runtime-blocker.json",
      live
        ? ".artifacts/execution-platform/model-task-middleware-live-runtime-proof.json"
        : ".artifacts/execution-platform/model-task-middleware-live-blocker.json",
      live
        ? ".artifacts/execution-platform/script-middleware-live-runtime-proof.json"
        : ".artifacts/execution-platform/script-middleware-live-blocker.json",
      live
        ? ".artifacts/execution-platform/db-operation-middleware-live-readonly-proof.json"
        : ".artifacts/execution-platform/db-operation-middleware-live-blocker.json",
    );
  }
  await writeJson("convergence-slices-10-13-runtime-script-summary.json", {
    artifactKind: "convergence_slices_10_13_runtime_script_summary",
    status: live?.handoff?.status ?? fixture?.handoff?.status ?? "blocked",
    fixture: fixture
      ? {
          handoff: summarizeResult(fixture.handoff),
          modelTask: summarizeResult(fixture.modelTask),
          script: summarizeResult(fixture.script),
          dbOperation: summarizeResult(fixture.dbOperation),
        }
      : null,
    live: live
      ? {
          handoff: summarizeResult(live.handoff),
          modelTask: summarizeResult(live.modelTask),
          script: summarizeResult(live.script),
          dbOperation: summarizeResult(live.dbOperation),
          readiness: live.readiness,
        }
      : null,
    artifactRefs,
    providerCallsMade: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    runtimeJobsCreated: Boolean(fixture || live),
    workQueueLifecycleMutated: false,
  });
}

await main();
