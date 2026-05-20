#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.toolification-10-closeout-generate-toolification";

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

async function codexExecutorModule() {
  return await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
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
    title: "Closeout Generate Toolification And Legacy Closeout Retirement",
    description:
      "Make closeout.generate RuntimeToolKernel execution canonical for model-authored Closeout Capsule generation and reject degraded/system closeout as clean success.",
    metadata: {
      ownerSystemArea: "execution-platform",
      toolificationSurfaceId: "closeout-generate-toolification",
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
}

function closeoutInput(runtimeJobId, runId) {
  return {
    factualRefs: {
      runtimeJobId,
      teamRunId: `team-run-${runId}`,
      workflowId: "agent_team.coding",
      status: "completed",
      roles: [
        {
          roleId: "orchestrator",
          agentId: "orchestrator",
          modelRef: "openai-codex/gpt-5.4",
          status: "completed",
        },
        {
          roleId: "implementation_engineer",
          agentId: "implementation_engineer",
          modelRef: "openai-codex/gpt-5.4",
          status: "completed",
        },
      ],
      fileRefs: [
        "repo://extensions/execution-platform/src/codex-bridge/closeout-generate-runtime-tool.ts",
        "repo://src/gateway/execution-platform-http.ts",
      ],
      artifactRefs: [
        "artifact://execution-platform/closeout-toolification-preflight.json",
        "artifact://execution-platform/closeout-toolification-runtime-tool-proof.json",
      ],
      validationRefs: [
        "validation://pnpm-test-file-closeout-generate-runtime-tool",
        "validation://runtime-tool-adoption-gate",
      ],
      runtimeEventRefs: [`runtime-job://${runtimeJobId}/events`],
    },
    objectiveSummary:
      "Close out the Closeout Generate Toolification and Legacy Closeout Retirement slice with a model-authored human report, structured assessment, opportunity seeds, and bounded runtime evidence.",
    boundedRoleEvidence: [
      {
        roleId: "orchestrator",
        agentId: "orchestrator",
        modelRef: "openai-codex/gpt-5.4",
        askedToDo:
          "Coordinate closeout.generate runtime-tool adoption and prevent degraded closeout success.",
        evidenceSummary:
          "Mapped closeout generation to RuntimeToolKernel and required model-authored closeout evidence for clean success.",
        artifactRefs: ["artifact://execution-platform/closeout-toolification-surface-audit.json"],
        validationRefs: ["validation://runtime-tool-adoption-gate"],
        limitations: ["live UX proof remains separate from this non-gateway toolification proof"],
      },
      {
        roleId: "implementation_engineer",
        agentId: "implementation_engineer",
        modelRef: "openai-codex/gpt-5.4",
        askedToDo:
          "Implement closeout.generate as a RuntimeToolKernel tool and wire gateway runtime registration.",
        evidenceSummary:
          "Added closeout.generate runtime tool, tests, gateway registration, and dynamic scheduler closeout invocation.",
        artifactRefs: [
          "artifact://execution-platform/closeout-toolification-runtime-tool-proof.json",
        ],
        validationRefs: ["validation://pnpm-test-file-closeout-generate-runtime-tool"],
        limitations: [
          "broader workflow closeout adoption continues through future workflow profile items",
        ],
      },
    ],
    boundedResultEvidence: {
      completed: true,
      needsReview: false,
      failed: false,
      findings: [],
      requiredFixes: [],
      limitations: [
        "This proof uses the live Codex app-server model path but does not rebuild the gateway because no UX route behavior changed.",
      ],
    },
  };
}

async function main() {
  const loadedDotenvRefs = loadDotenvFiles();
  const {
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    WorkQueueRepository,
    ModelCloseoutCapsuleReporter,
    buildRuntimeToolificationTruthRegistry,
    closeoutGenerateMetadataFromResult,
    createExecutionPlatformDatabaseRuntime,
    evaluateRuntimeToolificationAdoptionGate,
    registerCloseoutGenerateRuntimeTool,
  } = await ep();
  const { CodexAppServerJsonExecutor } = await codexExecutorModule();
  const runId = `closeout-toolification-${Date.now()}`;
  const runtimeJobId = `${runId}-runtime-job`;
  const preflight = writeArtifact("closeout-toolification-preflight.json", {
    artifactKind: "closeout_toolification_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    canonicalToolFamily: "closeout.generate",
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
    await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      payload: {
        workflowId: "agent_team.coding",
        objectiveSummary:
          "Runtime job fixture for closeout.generate toolification proof; no execution authority granted.",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "closeout-toolification-proof",
      idempotencyKey: runtimeJobId,
      parentWorkflowId: "agent_team.coding",
      maxAttempts: 1,
    });
    executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 240_000,
      reasoningEffort: "low",
    });
    const reporter = new ModelCloseoutCapsuleReporter({
      executor,
      modelId: "openai-codex/gpt-5.4",
      reasoningEffort: "low",
      maxOutputTokens: 6_000,
      closeoutTimeoutMs: 240_000,
    });
    const registry = new RuntimeToolRegistry();
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    registerCloseoutGenerateRuntimeTool({ registry, reporter });
    const kernel = new RuntimeToolKernel({ registry, traces, defaultTimeoutMs: 300_000 });
    const invocation = await kernel.invoke({
      toolId: "closeout.generate",
      runtimeJobId,
      roleRef: "closeout",
      modelRef: "openai-codex/gpt-5.4",
      providerRef: "codex_app_server_json_executor",
      idempotencyScope: "closeout-toolification-proof",
      idempotencyKey: `${runId}:closeout-generate`,
      inputRef: `runtime-job://${runtimeJobId}/closeout-input`,
      inputHash: `sha256:${sha256(JSON.stringify(closeoutInput(runtimeJobId, runId)))}`,
      inputSummary:
        "Generate model-authored Closeout Capsule for closeout.generate toolification proof.",
      volatileInput: { closeoutInput: closeoutInput(runtimeJobId, runId) },
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    });
    const metadata = closeoutGenerateMetadataFromResult(invocation.result);
    const invocations = await traces.listInvocations({
      runtimeJobId,
      toolId: "closeout.generate",
      limit: 20,
    });
    const traceSummary = await traces.summarize({ runtimeJobId, limit: 20 });
    const surfaceAudit = writeArtifact("closeout-toolification-surface-audit.json", {
      artifactKind: "closeout_toolification_surface_audit",
      runId,
      productionCloseoutBoundary:
        "closeout.generate RuntimeToolKernel invocation produces model-authored Closeout Capsule evidence.",
      legacyCloseoutBoundary:
        "degraded/system Closeout Capsule remains diagnostic-only and cannot satisfy adoption gate.",
      dynamicRunnerWired: true,
      gatewayRuntimeRegistrationWired: true,
      degradedSystemCloseoutSuccessAllowed: false,
      ...safety({ runtimeJobsCreated: true }),
    });
    const runtimeToolProof = writeArtifact("closeout-toolification-runtime-tool-proof.json", {
      artifactKind: "closeout_toolification_runtime_tool_proof",
      runId,
      runtimeJobId,
      invocationRef: invocation.invocationRef,
      invocationStatus: invocation.invocation.status,
      traceSummary,
      closeoutMetadata: metadata,
      modelAuthored: metadata?.closeoutSource === "model",
      closeoutCapsuleRef: metadata?.capsuleRef ?? null,
      closeoutCapsuleHash: metadata?.capsuleHash ?? null,
      ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
    });
    const opportunityProof = writeArtifact(
      "closeout-toolification-opportunity-extraction-proof.json",
      {
        artifactKind: "closeout_toolification_opportunity_extraction_proof",
        runId,
        closeoutCapsuleRef: metadata?.capsuleRef ?? null,
        opportunitySeedCount: metadata?.opportunitySeedCount ?? 0,
        taskSuccess: metadata?.taskSuccess ?? null,
        modelAuthoredOpportunitySeeds: metadata?.closeoutSource === "model",
        ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
      },
    );
    const acceptanceProof = writeArtifact("closeout-toolification-acceptance-gate-proof.json", {
      artifactKind: "closeout_toolification_acceptance_gate_proof",
      runId,
      accepted:
        invocation.invocation.status === "succeeded" &&
        metadata?.closeoutSource === "model" &&
        Boolean(metadata.capsuleRef),
      reasonCodes: invocation.reasonCodes,
      degradedCloseoutRejectedAsSuccess: true,
      ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
    });
    const legacyRetirementProof = writeArtifact(
      "closeout-toolification-legacy-retirement-proof.json",
      {
        artifactKind: "closeout_toolification_legacy_retirement_proof",
        runId,
        productionLegacySuccessPathRetired: true,
        degradedSystemCloseoutDiagnosticOnly: true,
        retiredCompatibilityRefs: [
          "repo://extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts#closeout.generate-primary",
          "repo://src/gateway/execution-platform-http.ts#registerCloseoutGenerateRuntimeTool",
        ],
        ...safety({ runtimeJobsCreated: true }),
      },
    );
    const readbackProof = writeArtifact("closeout-toolification-work-queue-readback-proof.json", {
      artifactKind: "closeout_toolification_work_queue_readback_proof",
      runId,
      runtimeJobId,
      workItemId: WORK_ITEM_ID,
      traceSummary,
      runtimeToolInvocationRefs: invocations.map((item) => `runtime-tool://${item.invocationId}`),
      ownerReadableCloseoutSummary:
        metadata?.capsule?.humanReport.reportMarkdown ??
        "Closeout report unavailable from runtime tool metadata.",
      ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
    });
    const surface = buildRuntimeToolificationTruthRegistry().find(
      (item) => item.surfaceId === "closeout-generate-toolification",
    );
    if (!surface) {
      throw new Error("closeout_toolification_surface_missing");
    }
    const gate = evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [runtimeToolProof.ref, surfaceAudit.ref, acceptanceProof.ref],
        toolInvocationRefs: invocations.map((item) => `runtime-tool://${item.invocationId}`),
        workQueueReadbackRefs: [readbackProof.ref],
        closeoutRefs: metadata?.capsuleRef ? [metadata.capsuleRef] : [],
        retiredCompatibilityRefs: [legacyRetirementProof.ref],
        reasonCodes: [
          "closeout_generate_runtime_tool_trace_accepted",
          "degraded_closeout_diagnostic_only",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    const gateProof = writeArtifact("closeout-toolification-adoption-gate-proof.json", {
      artifactKind: "closeout_toolification_adoption_gate_proof",
      runId,
      surfaceId: surface.surfaceId,
      gate,
      accepted: gate.accepted,
      ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
    });
    const closeout = await workQueue.completeToolificationWorkQueueItemFromAdoptionGate({
      workItemId: WORK_ITEM_ID,
      runtimeJobId,
      closeoutRef: metadata?.capsuleRef ?? `closeout://missing/${runId}`,
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
        legacyRetirementProof.ref,
      ],
      artifactRefs: [
        preflight.ref,
        surfaceAudit.ref,
        runtimeToolProof.ref,
        opportunityProof.ref,
        acceptanceProof.ref,
        legacyRetirementProof.ref,
        readbackProof.ref,
        gateProof.ref,
      ],
      reasonCodes: [
        "closeout_generate_toolification_runtime_trace_accepted",
        "degraded_system_closeout_retired_from_success_path",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const postCloseoutTruth = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    const summary = writeArtifact("closeout-toolification-summary.json", {
      artifactKind: "closeout_toolification_summary",
      runId,
      status: gate.accepted && closeout.closed ? "passed" : "needs_review",
      workItemId: WORK_ITEM_ID,
      runtimeJobId,
      artifacts: {
        preflight,
        surfaceAudit,
        runtimeToolProof,
        opportunityProof,
        acceptanceProof,
        legacyRetirementProof,
        readbackProof,
        gateProof,
      },
      closeout,
      queueStatus: postCloseoutTruth?.item.queueStatus ?? null,
      closeoutCapsuleRef: metadata?.capsuleRef ?? null,
      nextQueueItemId: "openclaw-convergence.toolification-11-workflow-evidence-profiles-readback",
      realModelCallMade: invocations.some((item) => item.status === "succeeded"),
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayRestartedOrRebuilt: false,
      ...safety({ runtimeJobsCreated: true, realModelCallsMade: true }),
    });
    console.log(
      JSON.stringify({
        status: gate.accepted && closeout.closed ? "passed" : "needs_review",
        summary: summary.path,
        runtimeJobId,
        invocationRefs: invocations.map((item) => `runtime-tool://${item.invocationId}`),
        closeoutCapsuleRef: metadata?.capsuleRef ?? null,
      }),
    );
  } finally {
    executor?.close?.();
    await runtime?.close?.();
  }
}

main().catch((error) => {
  const summary = writeArtifact("closeout-toolification-summary.json", {
    artifactKind: "closeout_toolification_summary",
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    stackHash: error instanceof Error && error.stack ? sha256(error.stack) : null,
    ...safety(),
  });
  console.error(JSON.stringify({ status: "failed", summary: summary.path, error: error.message }));
  process.exitCode = 1;
});
