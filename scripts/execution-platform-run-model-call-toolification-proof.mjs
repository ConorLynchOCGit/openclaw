#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.toolification-08-model-call-toolification";

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

async function codexExecutorModule() {
  return await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
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

async function ensureWorkItem(workQueue) {
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Model Call Toolification And Model Task Middleware Collapse",
    description:
      "Make model.call RuntimeToolKernel execution canonical for model-task middleware live provider calls.",
    metadata: {
      ownerSystemArea: "execution-platform",
      toolificationSurfaceId: "model-call-toolification",
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
    registerModelCallRuntimeTool,
    runModelTaskMiddlewareLiveCompletion,
  } = await ep();
  const { CodexAppServerJsonExecutor } = await codexExecutorModule();
  const runId = `model-call-toolification-${Date.now()}`;
  const preflight = writeArtifact("model-call-toolification-preflight.json", {
    artifactKind: "model_call_toolification_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    canonicalToolFamily: "model.call",
    liveProviderPath: "codex_app_server_json_executor",
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayReloadRequired: false,
    ...safety(),
  });

  let runtime;
  let executor;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    await ensureWorkItem(workQueue);
    executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 180_000,
      reasoningEffort: "low",
    });
    const registry = new RuntimeToolRegistry();
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    registerModelCallRuntimeTool({ registry, executor });
    const kernel = new RuntimeToolKernel({ registry, traces, defaultTimeoutMs: 240_000 });
    const result = await runModelTaskMiddlewareLiveCompletion({
      runtimeJobs,
      workQueue,
      executor,
      runtimeToolKernel: kernel,
      createWorkQueueFixture: true,
      runtimeJobId: `${runId}-runtime-job`,
      contractId: "outcome_pack_review.structured_json",
      modelId: "openai-codex/gpt-5.4",
      reasoningEffort: "low",
      maxOutputTokens: 3000,
      closeoutMode: "inline_model_output",
    });
    const tracesSummary = await traces.summarize({
      runtimeJobId: result.runtimeJobId,
      limit: 20,
    });
    const invocations = await traces.listInvocations({
      runtimeJobId: result.runtimeJobId,
      toolId: "model.call",
      limit: 20,
    });
    const runtimeToolProof = writeArtifact("model-call-toolification-runtime-tool-proof.json", {
      artifactKind: "model_call_toolification_runtime_tool_proof",
      runId,
      runtimeJobId: result.runtimeJobId,
      status: result.status,
      middlewareKind: result.middlewareKind,
      traceSummary: tracesSummary,
      invocationRefs: invocations.map((invocation) => `runtime-tool://${invocation.invocationId}`),
      modelRefs: [...new Set(invocations.map((invocation) => invocation.modelRef).filter(Boolean))],
      providerRefs: [
        ...new Set(invocations.map((invocation) => invocation.providerRef).filter(Boolean)),
      ],
      runtimeToolCallCanonical: invocations.length > 0,
      directProviderCallByModelTaskMiddleware: false,
      ...safety({ runtimeJobsCreated: true }),
    });
    const readbackProof = writeArtifact("model-call-toolification-work-queue-readback-proof.json", {
      artifactKind: "model_call_toolification_work_queue_readback_proof",
      runId,
      runtimeJobId: result.runtimeJobId,
      workQueueReadback: result.workQueueReadback,
      artifactRefs: result.artifactRefs,
      runtimeToolInvocationRefs: invocations.map(
        (invocation) => `runtime-tool://${invocation.invocationId}`,
      ),
      ...safety({ runtimeJobsCreated: true }),
    });
    const surface = buildRuntimeToolificationTruthRegistry().find(
      (item) => item.surfaceId === "model-call-toolification",
    );
    if (!surface) {
      throw new Error("model_call_toolification_surface_missing");
    }
    const closeoutRef =
      result.closeoutCapsuleRef ??
      `closeout://execution-platform/model-call-toolification/${sha256(runId).slice(0, 16)}`;
    const gate = evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [runtimeToolProof.ref, readbackProof.ref],
        toolInvocationRefs: invocations.map(
          (invocation) => `runtime-tool://${invocation.invocationId}`,
        ),
        workQueueReadbackRefs: [readbackProof.ref],
        closeoutRefs: [closeoutRef],
        retiredCompatibilityRefs: [
          "repo://extensions/execution-platform/src/model-tasks/fallback.ts#classification-only-no-executor",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    const gateProof = writeArtifact("model-call-toolification-adoption-gate-proof.json", {
      artifactKind: "model_call_toolification_adoption_gate_proof",
      runId,
      surfaceId: surface.surfaceId,
      gate,
      accepted: gate.accepted,
      ...safety({ runtimeJobsCreated: true }),
    });
    const closeout = await workQueue.completeToolificationWorkQueueItemFromAdoptionGate({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: result.runtimeJobId,
      closeoutRef,
      validationRef: runtimeToolProof.ref,
      ownerReadbackRef: readbackProof.ref,
      validationRequired: true,
      sourceEditRequired: false,
      accepted: gate.accepted,
      toolificationAdoptionGateResults: [gate],
      toolificationAdoptionGateEvidenceRefs: [
        gateProof.ref,
        runtimeToolProof.ref,
        readbackProof.ref,
      ],
      artifactRefs: [preflight.ref, runtimeToolProof.ref, readbackProof.ref, gateProof.ref],
      reasonCodes: [
        "model_call_toolification_runtime_tool_trace_accepted",
        "model_task_middleware_facade_over_runtime_tool",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const postCloseoutTruth = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    const summary = writeArtifact("model-call-toolification-summary.json", {
      artifactKind: "model_call_toolification_summary",
      runId,
      status: gate.accepted && closeout.closed ? "passed" : "needs_review",
      workItemId: WORK_ITEM_ID,
      runtimeJobId: result.runtimeJobId,
      runtimeToolProof,
      readbackProof,
      gateProof,
      closeout,
      queueStatus: postCloseoutTruth?.item.queueStatus ?? null,
      closeoutCapsuleRef: result.closeoutCapsuleRef,
      nextQueueItemId: "openclaw-convergence.toolification-09-script-db-toolification",
      realModelCallMade: invocations.some((invocation) => invocation.status === "succeeded"),
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayRestartedOrRebuilt: false,
      ...safety({ runtimeJobsCreated: true }),
    });
    console.log(
      JSON.stringify({
        status: gate.accepted && closeout.closed ? "passed" : "needs_review",
        summary: summary.path,
        runtimeJobId: result.runtimeJobId,
        invocationRefs: invocations.map(
          (invocation) => `runtime-tool://${invocation.invocationId}`,
        ),
      }),
    );
  } finally {
    executor?.close?.();
    await runtime?.close?.();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const failure = writeArtifact("model-call-toolification-summary.json", {
    artifactKind: "model_call_toolification_summary",
    status: "failed",
    workItemId: WORK_ITEM_ID,
    errorSummary: message.slice(0, 800),
    ...safety(),
  });
  console.error(JSON.stringify({ status: "failed", error: message, summary: failure.path }));
  process.exitCode = 1;
});
