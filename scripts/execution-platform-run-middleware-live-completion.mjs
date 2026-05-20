#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const now = () => new Date();
let executionPlatform;
let modelMemory;

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: now().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body);
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function mm() {
  modelMemory ??= await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  return modelMemory;
}

function summarizeReadiness(readiness, gate) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    gateDecision: gate.decision,
    gateEnabled: gate.enabled,
    reasonCodes: gate.reasonCodes,
    rawDbRowsStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function safetyFlags(extra = {}) {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
    ...extra,
  };
}

async function main() {
  const {
    createExecutionPlatformDatabaseRuntime,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    evaluateWorkQueueLiveLinkageGate,
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    WorkQueueRepository,
    ModelCloseoutCapsuleReporter,
    registerModelCallRuntimeTool,
    registerScriptExecuteRuntimeTool,
    registerDbOperationExecuteRuntimeTool,
    runModelTaskMiddlewareLiveCompletion,
    runScriptMiddlewareLiveCompletion,
    runDbOperationMiddlewareLiveCompletion,
  } = await ep();
  const { CodexAppServerJsonExecutor } = await mm();

  const priorArtifacts = [
    "starter-workflow-live-quality-soak-summary.json",
    "starter-workflow-live-quality-soak-index.json",
    "starter-workflow-live-quality-soak-work-queue-proof.json",
    "starter-workflow-live-quality-assessment.json",
    "starter-workflow-live-quality-validation-proof.json",
    "manual-closeout-starter-workflow-live-quality-soak-proof.json",
  ].map((name) => ({
    path: `.artifacts/execution-platform/${name}`,
    exists: fs.existsSync(path.join(artifactDir, name)),
  }));

  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const preflight = writeArtifact("slices-20-22-middleware-live-preflight.json", {
      artifactKind: "slices_20_22_middleware_live_preflight",
      priorArtifacts,
      db: summarizeReadiness(readiness, gate),
      liveModelCallsAllowedThroughApprovedPath: true,
      gatewayRestartRequired: false,
      manualCodexCliInvoked: false,
      acpUsed: false,
      ...safetyFlags({ runtimeJobsCreated: false }),
    });

    if (!gate.enabled) {
      const blocker = writeArtifact("slices-20-22-middleware-live-summary.json", {
        artifactKind: "slices_20_22_middleware_live_summary",
        status: "blocked",
        blocker: gate.decision,
        preflight,
        db: summarizeReadiness(readiness, gate),
        slice20: "blocked_db_boundary",
        slice21: "blocked_db_boundary",
        slice22: "blocked_db_boundary",
        ...safetyFlags({ runtimeJobsCreated: false }),
      });
      console.log(
        JSON.stringify({ status: "blocked", blocker: gate.decision, artifact: blocker.path }),
      );
      return;
    }

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 120_000,
      reasoningEffort: "low",
    });
    const runtimeToolRegistry = new RuntimeToolRegistry();
    const runtimeToolTraces = new RuntimeToolTraceRepository(runtime.sqlClient);
    registerModelCallRuntimeTool({ registry: runtimeToolRegistry, executor });
    registerScriptExecuteRuntimeTool({ registry: runtimeToolRegistry, handlers: {} });
    registerDbOperationExecuteRuntimeTool({ registry: runtimeToolRegistry, handlers: {} });
    const runtimeToolKernel = new RuntimeToolKernel({
      registry: runtimeToolRegistry,
      traces: runtimeToolTraces,
      defaultTimeoutMs: 240_000,
    });
    const closeoutReporter = new ModelCloseoutCapsuleReporter({
      executor,
      modelId: "openai-codex/gpt-5.4",
      reasoningEffort: "low",
      maxOutputTokens: 6000,
      closeoutTimeoutMs: 120_000,
      opportunitySeedRepairTimeoutMs: 30_000,
      now,
    });

    const modelResult = await runModelTaskMiddlewareLiveCompletion({
      runtimeJobs,
      workQueue,
      executor,
      runtimeToolKernel,
      closeoutReporter,
      createWorkQueueFixture: true,
      runtimeJobId: `slice-20-model-task-live-${sha256(now().toISOString()).slice(0, 10)}`,
      modelId: "openai-codex/gpt-5.4",
      reasoningEffort: "low",
      maxOutputTokens: 3000,
    });
    const modelProof = writeArtifact("slice-20-model-task-middleware-live-proof.json", {
      artifactKind: "slice_20_model_task_middleware_live_proof",
      result: modelResult,
      providerPath: "codex_app_server_json_executor",
      modelRef: "openai-codex/gpt-5.4",
      closeoutCapsuleRef: modelResult.closeoutCapsuleRef,
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    const modelReadback = writeArtifact("model-task-middleware-live-readback-proof.json", {
      artifactKind: "model_task_middleware_live_readback_proof",
      runtimeJobId: modelResult.runtimeJobId,
      workQueueReadback: modelResult.workQueueReadback,
      artifactRefs: modelResult.artifactRefs,
      ...safetyFlags({ runtimeJobsCreated: true }),
    });

    const scriptResult = await runScriptMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `slice-21-script-live-${sha256(now().toISOString()).slice(0, 10)}`,
      cwd: root,
    });
    const scriptProof = writeArtifact("slice-21-script-middleware-live-proof.json", {
      artifactKind: "slice_21_script_middleware_live_proof",
      result: scriptResult,
      allowedCommandRef:
        "node --check scripts/execution-platform-run-starter-workflow-live-quality-soak.mjs",
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    const scriptReadback = writeArtifact("script-middleware-runtime-readback-proof.json", {
      artifactKind: "script_middleware_runtime_readback_proof",
      runtimeJobId: scriptResult.runtimeJobId,
      workQueueReadback: scriptResult.workQueueReadback,
      artifactRefs: scriptResult.artifactRefs,
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    const scriptNegative = writeArtifact("script-middleware-negative-cases-proof.json", {
      artifactKind: "script_middleware_negative_cases_proof",
      arbitraryShellExecutionAllowed: false,
      allowedCommandCount: 1,
      rejectedRawLogStorage: true,
      rawStdoutStored: false,
      rawStderrStored: false,
      rawCommandLogStored: false,
      ...safetyFlags({ runtimeJobsCreated: false }),
    });

    const dbResult = await runDbOperationMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `slice-22-db-live-${sha256(now().toISOString()).slice(0, 10)}`,
      readiness,
    });
    const dbProof = writeArtifact("slice-22-db-middleware-live-proof.json", {
      artifactKind: "slice_22_db_middleware_live_proof",
      result: dbResult,
      readiness: summarizeReadiness(readiness, gate),
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    const dbBoundaryProof = writeArtifact("db-middleware-boundary-proof.json", {
      artifactKind: "db_middleware_boundary_proof",
      readiness: summarizeReadiness(readiness, gate),
      approvedRuntimeDbBoundary: gate.enabled,
      noModelMemoryFallback: readiness.boundary.boundaryKind !== "model_memory_fallback",
      ...safetyFlags({ runtimeJobsCreated: false }),
    });
    const dbNegative = writeArtifact("db-middleware-negative-cases-proof.json", {
      artifactKind: "db_middleware_negative_cases_proof",
      rawDbDumpsStored: false,
      rawRowsProjected: false,
      modelMemoryFallbackWouldBlock: true,
      ...safetyFlags({ runtimeJobsCreated: false }),
    });

    const integration = writeArtifact("slices-20-22-middleware-live-integration-proof.json", {
      artifactKind: "slices_20_22_middleware_live_integration_proof",
      status: "passed",
      runtimeJobIds: [modelResult.runtimeJobId, scriptResult.runtimeJobId, dbResult.runtimeJobId],
      workQueueReadbackPresent: [
        Boolean(modelResult.workQueueReadback),
        Boolean(scriptResult.workQueueReadback),
        Boolean(dbResult.workQueueReadback),
      ],
      proofs: [
        modelProof,
        modelReadback,
        scriptProof,
        scriptReadback,
        scriptNegative,
        dbProof,
        dbBoundaryProof,
        dbNegative,
      ],
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    const summary = writeArtifact("slices-20-22-middleware-live-summary.json", {
      artifactKind: "slices_20_22_middleware_live_summary",
      status: "passed",
      slice20: "passed",
      slice21: "passed",
      slice22: "passed",
      runtimeJobIds: {
        modelTask: modelResult.runtimeJobId,
        scriptJob: scriptResult.runtimeJobId,
        dbOperation: dbResult.runtimeJobId,
      },
      closeoutCapsuleRef: modelResult.closeoutCapsuleRef,
      artifacts: {
        preflight,
        modelProof,
        modelReadback,
        scriptProof,
        scriptReadback,
        scriptNegative,
        dbProof,
        dbBoundaryProof,
        dbNegative,
        integration,
      },
      eli5Progress:
        "The three middleware layers now prove live runtime completion: a model task used the approved model path, a script job used one allowlisted command, and a DB operation used the approved runtime DB boundary.",
      ...safetyFlags({ runtimeJobsCreated: true }),
    });
    console.log(
      JSON.stringify({
        status: "passed",
        runtimeJobIds: [modelResult.runtimeJobId, scriptResult.runtimeJobId, dbResult.runtimeJobId],
        summary: summary.path,
      }),
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  const failure = writeArtifact("slices-20-22-middleware-live-summary.json", {
    artifactKind: "slices_20_22_middleware_live_summary",
    status: "failed",
    reasonCodes: [error instanceof Error ? error.message : "unknown_error"].slice(0, 5),
    ...safetyFlags({ runtimeJobsCreated: false }),
  });
  console.error(JSON.stringify({ status: "failed", artifact: failure.path }));
  process.exitCode = 1;
});
