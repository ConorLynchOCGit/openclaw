#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_ID = "openclaw-convergence.toolification-07-truth-registry-adoption-gate";
const NEXT_WORK_ITEM_ID = "openclaw-convergence.toolification-08-model-call-toolification";

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify({ ...value, createdAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(`${ARTIFACT_DIR}/${name}`, body);
  return {
    path: `${ARTIFACT_DIR}/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
  };
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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) {
        continue;
      }
      let value = rest.join("=").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  }
}

function pickSurface(surfaces, surfaceId) {
  const surface = surfaces.find((item) => item.surfaceId === surfaceId);
  if (!surface) {
    throw new Error(`surface_missing:${surfaceId}`);
  }
  return surface;
}

async function loadExecutionPlatformRuntimeApi() {
  try {
    const builtApi = await import("../dist/extensions/execution-platform/runtime-api.js");
    if (
      typeof builtApi.buildRuntimeToolificationTruthRegistry === "function" &&
      typeof builtApi.evaluateRuntimeToolificationAdoptionGate === "function"
    ) {
      return builtApi;
    }
  } catch {
    // Source import below is the approved path in repo/dev checkouts.
  }
  try {
    return await import("../extensions/execution-platform/src/index.ts");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") ||
      message.includes("TypeScript parameter property") ||
      message.includes("Unknown file extension")
    ) {
      throw new Error(
        "runtime_toolification_truth_registry_proof_requires_ts_runner: run `pnpm exec tsx scripts/execution-platform-run-runtime-toolification-truth-registry-proof.mjs` from the repo checkout, or build dist before running with node.",
        { cause: error },
      );
    }
    throw error;
  }
}

async function main() {
  loadDotenvFiles();
  const {
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    WorkQueueEventStore,
    WorkQueueRepository,
    buildRuntimeToolDefinition,
    buildRuntimeToolAdoptionBoundaryMapFromRegistry,
    buildRuntimeToolificationTruthRegistry,
    createExecutionPlatformDatabaseRuntime,
    evaluateRuntimeToolificationAdoptionGate,
    summarizeRuntimeToolificationTruthRegistry,
  } = await loadExecutionPlatformRuntimeApi();
  const runId = `runtime-toolification-truth-registry-${Date.now()}`;
  const preflight = writeArtifact("runtime-toolification-truth-registry-preflight.json", {
    artifactKind: "runtime_toolification_truth_registry_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    nextWorkItemId: NEXT_WORK_ITEM_ID,
    codexCliInvokedManually: false,
    acpUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  const hardeningPreflight = writeArtifact(
    "runtime-toolification-truth-registry-hardening-preflight.json",
    {
      artifactKind: "runtime_toolification_truth_registry_hardening_preflight",
      runId,
      workItemId: WORK_ITEM_ID,
      proofCommand: "pnpm proof:execution-platform:toolification-truth-registry",
      directNodeGuarded: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
  );

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueueEvents = new WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registry.register(
      buildRuntimeToolDefinition({
        toolId: "diagnostic.toolification_truth_registry",
        toolVersion: "v1",
        toolFamily: "diagnostic.bounded",
        executorKey: "diagnostic.toolification_truth_registry",
        schemaRef: "runtime-tool://diagnostic/toolification-truth-registry/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/runtime-toolification-truth-registry/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded diagnostic trace proving the adoption gate uses RuntimeToolKernel evidence.",
            reasonCodes: ["runtime_toolification_truth_registry_diagnostic_trace"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    const kernel = new RuntimeToolKernel({ registry, traces });
    const trace = await kernel.invoke({
      toolId: "diagnostic.toolification_truth_registry",
      idempotencyScope: "runtime-toolification-truth-registry",
      idempotencyKey: runId,
      inputSummary:
        "Create bounded RuntimeToolKernel evidence for the toolification truth registry adoption gate.",
      metadata: {
        workItemId: WORK_ITEM_ID,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const surfaces = buildRuntimeToolificationTruthRegistry();
    const legacyBoundaryMap = buildRuntimeToolAdoptionBoundaryMapFromRegistry(surfaces);
    const legacyBoundaryDerived = legacyBoundaryMap.every((surface) =>
      surface.reasonCodes.includes("runtime_tool_adoption_boundary_registry_derived_compat_export"),
    );
    const traceRef = trace.invocationRef;
    const readbackRef =
      "artifact://execution-platform/runtime-toolification-truth-registry-work-queue-readback-proof.json";
    const closeoutRef = `closeout://${runId}/runtime-toolification-truth-registry`;
    const validationRef =
      "artifact://execution-platform/runtime-toolification-truth-registry-adoption-gate-proof.json";
    const gateResults = [
      evaluateRuntimeToolificationAdoptionGate({
        surface: pickSurface(surfaces, "runtime-tool-call-kernel"),
        claim: {
          surfaceId: "runtime-tool-call-kernel",
          claimKind: "production_primary",
          claimedStatus: "production_primary",
          evidenceRefs: [preflight.ref],
          toolInvocationRefs: [traceRef],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      }),
      evaluateRuntimeToolificationAdoptionGate({
        surface: pickSurface(surfaces, "scheduler-toolification"),
        claim: {
          surfaceId: "scheduler-toolification",
          claimKind: "production_primary",
          claimedStatus: "production_primary",
          evidenceRefs: [
            "artifact://execution-platform/scheduler-toolification-split-planning-summary.json",
          ],
          toolInvocationRefs: [traceRef],
          workQueueReadbackRefs: [readbackRef],
          closeoutRefs: [closeoutRef],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      }),
      evaluateRuntimeToolificationAdoptionGate({
        surface: pickSurface(surfaces, "model-call-toolification"),
        claim: {
          surfaceId: "model-call-toolification",
          claimKind: "blocked_or_deferred",
          claimedStatus: "queued_for_toolification",
          blockerReasonCodes: ["model_call_toolification_pending_next_queue_item"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      }),
      evaluateRuntimeToolificationAdoptionGate({
        surface: pickSurface(surfaces, "product-spec-planning-workflow"),
        claim: {
          surfaceId: "product-spec-planning-workflow",
          claimKind: "live_ux_proven",
          claimedStatus: "live_ux_proven",
          evidenceRefs: ["artifact://execution-platform/product-spec-planning-pending"],
          toolInvocationRefs: [traceRef],
          workQueueReadbackRefs: [readbackRef],
          closeoutRefs: [closeoutRef],
          reasonCodes: ["intentional_overclaim_rejected_until_live_ux_proof_exists"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      }),
    ];
    const summary = summarizeRuntimeToolificationTruthRegistry({ surfaces, gateResults });
    const proof = writeArtifact("runtime-toolification-truth-registry-adoption-gate-proof.json", {
      artifactKind: "runtime_toolification_truth_registry_adoption_gate_proof",
      runId,
      workItemId: WORK_ITEM_ID,
      databaseName: runtime.resolution.databaseName,
      databaseSource: runtime.resolution.source,
      reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
      gateResults,
      acceptedGateCount: gateResults.filter((result) => result.accepted).length,
      rejectedGateCount: gateResults.filter((result) => !result.accepted).length,
      overclaimRejected: gateResults.some(
        (result) =>
          result.surfaceId === "product-spec-planning-workflow" &&
          !result.accepted &&
          result.missingEvidenceKinds.includes("live_ux_proof_ref"),
      ),
      traceRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
    const hardeningProof = writeArtifact(
      "runtime-toolification-truth-registry-hardening-proof.json",
      {
        artifactKind: "runtime_toolification_truth_registry_hardening_proof",
        runId,
        workItemId: WORK_ITEM_ID,
        legacyBoundaryDerived,
        legacyBoundarySurfaceCount: legacyBoundaryMap.length,
        proofScriptInvocationPath: {
          approvedCommand: "pnpm proof:execution-platform:toolification-truth-registry",
          directNodeGuardedWithActionableError: true,
        },
        canonicalReadbackExpectedForRegistryItem: true,
        toolificationCloseoutRequiresAdoptionGateEvidence: true,
        gateResults,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
      },
    );

    const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    if (!existing) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "implementation_slice",
        title: "Runtime Toolification Truth Registry And Adoption Gate",
        description:
          "Canonical truth registry and adoption gate for runtime toolification surfaces.",
        metadata: {
          track: "execution-platform",
          ownerSystemArea: "execution-platform",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        actorId: "runtime-toolification-truth-registry-proof",
      });
    }
    const latest = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    const existingMetadata =
      latest?.item.metadata &&
      typeof latest.item.metadata === "object" &&
      !Array.isArray(latest.item.metadata)
        ? latest.item.metadata
        : {};
    await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Runtime Toolification Truth Registry And Adoption Gate",
      description:
        latest?.item.description ??
        "Canonical truth registry and adoption gate for runtime toolification surfaces.",
      metadata: {
        ...existingMetadata,
        toolificationTruthRegistry: summary,
        artifactRefs: [preflight.path, hardeningPreflight.path, proof.path, hardeningProof.path],
        nextAction: "Proceed to Model Call Toolification And Model Task Middleware Collapse.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
      actorId: "runtime-toolification-truth-registry-proof",
    });
    await workQueue.attachArtifactReference({
      workItemId: WORK_ITEM_ID,
      artifactType: "execution_platform.runtime_toolification_truth_registry",
      storageKind: "metadata",
      uri: proof.ref,
      sha256: proof.sha256,
      metadata: {
        summary,
        gateResultCount: gateResults.length,
        acceptedGateCount: gateResults.filter((result) => result.accepted).length,
        rejectedGateCount: gateResults.filter((result) => !result.accepted).length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
    });

    const list = await workQueue.listDbWorkQueue({ bucket: "all", limit: 100 });
    const readbackItem = list.items.find((item) => item.workItemId === WORK_ITEM_ID);
    const readback = writeArtifact(
      "runtime-toolification-truth-registry-work-queue-readback-proof.json",
      {
        artifactKind: "runtime_toolification_truth_registry_work_queue_readback_proof",
        runId,
        workItemId: WORK_ITEM_ID,
        readbackPresent: Boolean(readbackItem?.convergenceSlice.toolificationTruthRegistry),
        queueStatus: readbackItem?.queueStatus ?? null,
        toolificationTruthRegistry:
          readbackItem?.convergenceSlice.toolificationTruthRegistry ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      },
    );
    const closeout = await workQueue.completeToolificationWorkQueueItemFromAdoptionGate({
      workItemId: WORK_ITEM_ID,
      closeoutRef,
      closeoutHash: `sha256:${sha256(JSON.stringify(summary))}`,
      validationRef,
      ownerReadbackRef: readback.ref,
      artifactRefs: [
        preflight.ref,
        hardeningPreflight.ref,
        proof.ref,
        hardeningProof.ref,
        readback.ref,
      ],
      accepted: true,
      validationRequired: true,
      sourceEditRequired: false,
      toolificationAdoptionGateResults: gateResults.filter((result) => result.accepted),
      toolificationAdoptionGateEvidenceRefs: [
        proof.ref,
        hardeningProof.ref,
        readback.ref,
        traceRef,
      ],
      reasonCodes: [
        "runtime_toolification_truth_registry_completed",
        "adoption_gate_blocks_overclaims",
        "work_queue_readback_contains_registry_summary",
      ],
      actorId: "runtime-toolification-truth-registry-proof",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      runtimeLifecycleMutated: false,
      modelPromotionPerformed: false,
    });
    const finalSummary = writeArtifact("runtime-toolification-truth-registry-summary.json", {
      artifactKind: "runtime_toolification_truth_registry_summary_artifact",
      runId,
      workItemId: WORK_ITEM_ID,
      nextWorkItemId: NEXT_WORK_ITEM_ID,
      registrySummary: summary,
      closeoutTransition: closeout,
      preflightArtifact: preflight.path,
      hardeningPreflightArtifact: hardeningPreflight.path,
      proofArtifact: proof.path,
      hardeningProofArtifact: hardeningProof.path,
      readbackArtifact: readback.path,
      traceRef,
      pass: closeout.closed && Boolean(readbackItem?.convergenceSlice.toolificationTruthRegistry),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          pass: closeout.closed,
          workItemId: WORK_ITEM_ID,
          nextWorkItemId: NEXT_WORK_ITEM_ID,
          traceRef,
          artifacts: [
            preflight.path,
            hardeningPreflight.path,
            proof.path,
            hardeningProof.path,
            readback.path,
            finalSummary.path,
          ],
          closeout,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime?.pool.end();
  }
}

main().catch((error) => {
  writeArtifact("runtime-toolification-truth-registry-summary.json", {
    artifactKind: "runtime_toolification_truth_registry_summary_artifact",
    pass: false,
    errorSummary:
      error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  console.error(error);
  process.exitCode = 1;
});
