#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.toolification-09-script-db-toolification";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
  };
}

function safety(extra = {}) {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
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

function dotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }
  const index = trimmed.indexOf("=");
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function loadDotenvFiles() {
  const refs = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    let loaded = false;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const parsed = dotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
        loaded = true;
      }
    }
    if (loaded) {
      refs.push(`dotenv://${path.relative(root, filePath) || filePath}`);
    }
  }
  return refs;
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

async function ensureWorkItem(workQueue) {
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Script And DB Operation Toolification",
    description:
      "Make script.execute and db_operation.execute RuntimeToolKernel execution canonical for script and DB operation middleware.",
    metadata: {
      ownerSystemArea: "execution-platform",
      toolificationSurfaceId: "script-db-operation-toolification",
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
}

async function main() {
  const loadedDotenvRefs = loadDotenvFiles();
  const {
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    WorkQueueRepository,
    buildRuntimeToolificationTruthRegistry,
    createExecutionPlatformDatabaseRuntime,
    evaluateRuntimeToolificationAdoptionGate,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    registerDbOperationExecuteRuntimeTool,
    registerScriptExecuteRuntimeTool,
    resolveExecutionPlatformDbBoundaryContract,
    runDbOperationMiddlewareLiveCompletion,
    runScriptMiddlewareLiveCompletion,
  } = await ep();
  const runId = `script-db-toolification-${Date.now()}`;
  const preflight = writeArtifact("script-db-toolification-preflight.json", {
    artifactKind: "script_db_toolification_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    canonicalToolFamilies: ["script.execute", "db_operation.execute"],
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayReloadRequired: false,
    ...safety(),
  });

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    if (!gate.enabled) {
      const blocked = writeArtifact("script-db-toolification-summary.json", {
        artifactKind: "script_db_toolification_summary",
        runId,
        status: "blocked",
        blocker: gate.decision,
        readinessState: readiness.readinessState,
        reasonCodes: gate.reasonCodes,
        ...safety(),
      });
      console.log(JSON.stringify({ status: "blocked", summary: blocked.path }));
      return;
    }

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    await ensureWorkItem(workQueue);
    const runtimeToolRegistry = new RuntimeToolRegistry();
    const runtimeToolTraces = new RuntimeToolTraceRepository(runtime.sqlClient);
    registerScriptExecuteRuntimeTool({ registry: runtimeToolRegistry, handlers: {} });
    registerDbOperationExecuteRuntimeTool({ registry: runtimeToolRegistry, handlers: {} });
    const runtimeToolKernel = new RuntimeToolKernel({
      registry: runtimeToolRegistry,
      traces: runtimeToolTraces,
      defaultTimeoutMs: 240_000,
    });
    const suffix = sha256(runId).slice(0, 10);
    const scriptResult = await runScriptMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `${runId}-script-${suffix}`,
      cwd: root,
    });
    const dbResult = await runDbOperationMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `${runId}-db-${suffix}`,
      readiness,
    });
    const scriptInvocations = await runtimeToolTraces.listInvocations({
      runtimeJobId: scriptResult.runtimeJobId,
      toolId: "script.execute",
      limit: 20,
    });
    const dbInvocations = await runtimeToolTraces.listInvocations({
      runtimeJobId: dbResult.runtimeJobId,
      toolId: "db_operation.execute",
      limit: 20,
    });
    const scriptProof = writeArtifact("script-db-toolification-script-runtime-tool-proof.json", {
      artifactKind: "script_db_toolification_script_runtime_tool_proof",
      runId,
      runtimeJobId: scriptResult.runtimeJobId,
      result: scriptResult,
      invocationRefs: scriptInvocations.map(
        (invocation) => `runtime-tool://${invocation.invocationId}`,
      ),
      ...safety({ runtimeJobsCreated: true }),
    });
    const dbProof = writeArtifact("script-db-toolification-db-operation-runtime-tool-proof.json", {
      artifactKind: "script_db_toolification_db_operation_runtime_tool_proof",
      runId,
      runtimeJobId: dbResult.runtimeJobId,
      result: dbResult,
      invocationRefs: dbInvocations.map(
        (invocation) => `runtime-tool://${invocation.invocationId}`,
      ),
      readiness: {
        boundaryKind: readiness.boundary.boundaryKind,
        readinessState: readiness.readinessState,
        workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
        reasonCodes: readiness.reasonCodes,
      },
      ...safety({ runtimeJobsCreated: true }),
    });
    const readbackProof = writeArtifact("script-db-toolification-work-queue-readback-proof.json", {
      artifactKind: "script_db_toolification_work_queue_readback_proof",
      runId,
      scriptReadback: scriptResult.workQueueReadback,
      dbReadback: dbResult.workQueueReadback,
      scriptArtifactRefs: scriptResult.artifactRefs,
      dbArtifactRefs: dbResult.artifactRefs,
      runtimeToolInvocationRefs: [
        ...scriptInvocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
        ...dbInvocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
      ],
      ...safety({ runtimeJobsCreated: true }),
    });
    const surface = buildRuntimeToolificationTruthRegistry().find(
      (item) => item.surfaceId === "script-db-operation-toolification",
    );
    if (!surface) {
      throw new Error("script_db_toolification_surface_missing");
    }
    const closeoutRef = `closeout://execution-platform/script-db-toolification/${sha256(runId).slice(0, 16)}`;
    const gateResult = evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [scriptProof.ref, dbProof.ref, readbackProof.ref],
        toolInvocationRefs: [
          ...scriptInvocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
          ...dbInvocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
        ],
        workQueueReadbackRefs: [readbackProof.ref],
        closeoutRefs: [closeoutRef],
        retiredCompatibilityRefs: [
          "repo://extensions/execution-platform/src/script-jobs/script-job-repository.ts#facade-over-script-execute",
          "repo://extensions/execution-platform/src/db-operations/db-operation-repository.ts#facade-over-db-operation-execute",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    const gateProof = writeArtifact("script-db-toolification-adoption-gate-proof.json", {
      artifactKind: "script_db_toolification_adoption_gate_proof",
      runId,
      gate: gateResult,
      accepted: gateResult.accepted,
      ...safety({ runtimeJobsCreated: true }),
    });
    const closeout = await workQueue.completeToolificationWorkQueueItemFromAdoptionGate({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: dbResult.runtimeJobId,
      closeoutRef,
      validationRef: readbackProof.ref,
      validationRequired: true,
      sourceEditRequired: false,
      accepted: gateResult.accepted,
      toolificationAdoptionGateResults: [gateResult],
      toolificationAdoptionGateEvidenceRefs: [
        gateProof.ref,
        scriptProof.ref,
        dbProof.ref,
        readbackProof.ref,
      ],
      artifactRefs: [preflight.ref, scriptProof.ref, dbProof.ref, readbackProof.ref, gateProof.ref],
      reasonCodes: [
        "script_execute_runtime_tool_trace_accepted",
        "db_operation_execute_runtime_tool_trace_accepted",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const postCloseoutTruth = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    const summary = writeArtifact("script-db-toolification-summary.json", {
      artifactKind: "script_db_toolification_summary",
      runId,
      status: gateResult.accepted && closeout.closed ? "passed" : "needs_review",
      workItemId: WORK_ITEM_ID,
      scriptRuntimeJobId: scriptResult.runtimeJobId,
      dbRuntimeJobId: dbResult.runtimeJobId,
      scriptProof,
      dbProof,
      readbackProof,
      gateProof,
      closeout,
      queueStatus: postCloseoutTruth?.item.queueStatus ?? null,
      realScriptExecutionOccurred: scriptInvocations.some(
        (invocation) => invocation.status === "succeeded",
      ),
      realDbOperationOccurred: dbInvocations.some(
        (invocation) => invocation.status === "succeeded",
      ),
      nextQueueItemId: "openclaw-convergence.toolification-10-closeout-generate-toolification",
      ...safety({ runtimeJobsCreated: true }),
    });
    console.log(
      JSON.stringify({
        status: gateResult.accepted && closeout.closed ? "passed" : "needs_review",
        summary: summary.path,
        scriptRuntimeJobId: scriptResult.runtimeJobId,
        dbRuntimeJobId: dbResult.runtimeJobId,
      }),
    );
  } finally {
    await runtime?.close?.();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const failure = writeArtifact("script-db-toolification-summary.json", {
    artifactKind: "script_db_toolification_summary",
    status: "failed",
    workItemId: WORK_ITEM_ID,
    errorSummary: message.slice(0, 800),
    ...safety(),
  });
  console.error(JSON.stringify({ status: "failed", error: message, summary: failure.path }));
  process.exitCode = 1;
});
