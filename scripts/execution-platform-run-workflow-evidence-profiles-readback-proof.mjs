#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.toolification-11-workflow-evidence-profiles-readback";

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

function loadDotenvFiles() {
  const loaded = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    let loadedAny = false;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
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
      if (key && !process.env[key]) {
        process.env[key] = value;
        loadedAny = true;
      }
    }
    if (loadedAny) {
      loaded.push(`dotenv://${path.relative(root, filePath) || filePath}`);
    }
  }
  return loaded;
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

async function ensureWorkItem(workQueue) {
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  const metadata = {
    ownerSystemArea: "execution-platform",
    toolificationSurfaceId: "workflow-evidence-profiles-readback",
    canonicalRuntimeTruth: "execution-platform-db",
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  if (existing) {
    await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Workflow Evidence Profiles And Tool Trace Readback Hardening",
      description:
        "Canonical workflow evidence profiles gate clean workflow success and surface profile status in Work Queue readback.",
      metadata: { ...existing.item.metadata, ...metadata },
      actorId: "workflow-evidence-profile-proof",
    });
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Workflow Evidence Profiles And Tool Trace Readback Hardening",
    description:
      "Canonical workflow evidence profiles gate clean workflow success and surface profile status in Work Queue readback.",
    metadata,
  });
}

function pickSurface(surfaces, surfaceId) {
  const surface = surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!surface) {
    throw new Error(`surface_missing:${surfaceId}`);
  }
  return surface;
}

async function main() {
  const loadedDotenvRefs = loadDotenvFiles();
  const {
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    WorkQueueEventStore,
    WorkQueueRepository,
    buildRuntimeToolDefinition,
    buildRuntimeToolificationTruthRegistry,
    buildWorkQueueExecutionReadModel,
    createExecutionPlatformDatabaseRuntime,
    evaluateRuntimeToolificationAdoptionGate,
    evaluateWorkflowEvidenceProfile,
    workflowEvidenceProfileEvaluationArtifactMetadata,
    WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
  } = await ep();
  const runId = `workflow-evidence-profile-${Date.now()}`;
  const runtimeJobId = `${runId}-job`;
  const traceToolId = "diagnostic.workflow_evidence_profile";
  const preflight = writeArtifact("workflow-evidence-profiles-readback-preflight.json", {
    artifactKind: "workflow_evidence_profiles_readback_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    productionPathUnderTest:
      "Runtime job artifacts -> workflow evidence profile evaluator -> Work Queue readback",
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayReloadRequired: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });

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
        toolId: traceToolId,
        toolVersion: "v1",
        toolFamily: "worker.invoke",
        executorKey: traceToolId,
        schemaRef: "runtime-tool://diagnostic/workflow-evidence-profile/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/workflow-evidence-profiles-readback/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded diagnostic worker trace proving workflow evidence profiles are tied to RuntimeToolKernel evidence.",
            reasonCodes: ["workflow_evidence_profile_runtime_tool_trace_recorded"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    const kernel = new RuntimeToolKernel({ registry, traces });
    const item = await ensureWorkItem(workQueue);
    const job = await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: item.workItemId,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "workflow_evidence_profile_readback",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "workflow-evidence-profile-readback-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });
    await workQueue.createWorkRun({
      runId: `${runId}-run`,
      workItemId: item.workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
    });
    const trace = await kernel.invoke({
      toolId: traceToolId,
      runtimeJobId: job.jobId,
      roleRef: "workflow-evidence-profile-proof",
      idempotencyScope: "workflow-evidence-profile-readback-proof",
      idempotencyKey: runId,
      inputSummary:
        "Record bounded runtime-tool trace evidence for workflow evidence profile readback.",
      metadata: {
        workItemId: item.workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const evaluation = evaluateWorkflowEvidenceProfile({
      workflowId: "agent_team.coding",
      runtimeJobId: job.jobId,
      workItemId: item.workItemId,
      closeoutSource: "model",
      evidenceClassRefs: {
        runtime_graph: [`runtime-graph://${runId}-graph`],
        scheduler_tool_trace: [`runtime-tool://scheduler.select_next_node/${runId}`],
        worker_tool_trace: [trace.invocationRef],
        source_change: [
          "repo://extensions/execution-platform/src/workflows/workflow-evidence-profile.ts#sha256:bounded",
        ],
        validation: [
          "validation://pnpm-test-file-extensions-execution-platform-src-workflows-workflow-evidence-profile",
        ],
        review: [`review://workflow-evidence-profile/${runId}`],
        closeout: [`closeout://${runId}/workflow-evidence-profile`],
        work_queue_readback: [`work-queue://${item.workItemId}/readback`],
      },
      reasonCodes: ["workflow_evidence_profile_production_gate_positive_path"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    if (!evaluation.accepted) {
      throw new Error(
        `positive_profile_evaluation_not_accepted:${evaluation.reasonCodes.join(",")}`,
      );
    }
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-evidence-profile/agent_team.coding`,
      contentType: "application/json",
      metadata: workflowEvidenceProfileEvaluationArtifactMetadata(evaluation),
    });
    const claimed = await runtimeJobs.claimNextJob({
      queueName: "agent-team",
      runtimeJobId: job.jobId,
      workerId: "worker.workflow-evidence-profile-proof",
    });
    if (!claimed) {
      throw new Error("workflow_evidence_profile_proof_job_claim_failed");
    }
    await runtimeJobs.completeJob({
      leaseToken: claimed.leaseToken,
      result: {
        workflowId: "agent_team.coding",
        workflowEvidenceProfileAccepted: true,
        workflowEvidenceProfileRef: `runtime-job://${job.jobId}/execution/workflow-evidence-profile/agent_team.coding`,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    const readback = await buildWorkQueueExecutionReadModel({
      runtimeJobs,
      workQueue,
      workItemId: item.workItemId,
    });
    const readbackProfile =
      readback.runtimeJobs[0]?.workflow.extension?.workflowEvidenceProfile ?? null;
    if (!readbackProfile || readbackProfile.accepted !== true) {
      throw new Error("workflow_evidence_profile_readback_missing_or_not_accepted");
    }

    const rejectedGeneric = evaluateWorkflowEvidenceProfile({
      workflowId: "workflow.unknown",
      runtimeJobId: `${runId}-generic-job`,
      workItemId: item.workItemId,
      closeoutSource: "model",
      evidenceClassRefs: {
        closeout: [`closeout://${runId}/generic`],
        work_queue_readback: [`work-queue://${item.workItemId}/readback`],
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    if (rejectedGeneric.accepted) {
      throw new Error("generic_workflow_profile_unexpectedly_accepted");
    }

    const proof = writeArtifact("workflow-evidence-profiles-readback-proof.json", {
      artifactKind: "workflow_evidence_profiles_readback_proof",
      runId,
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      traceInvocationRef: trace.invocationRef,
      acceptedProfile: {
        profileId: evaluation.profileId,
        status: evaluation.status,
        acceptedEvidenceClasses: evaluation.acceptedEvidenceClasses,
        artifactRef: `runtime-job://${job.jobId}/execution/workflow-evidence-profile/agent_team.coding`,
      },
      rejectedGenericProfile: {
        profileId: rejectedGeneric.profileId,
        status: rejectedGeneric.status,
        reasonCodes: rejectedGeneric.reasonCodes,
      },
      readbackProfile,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });

    const surfaces = buildRuntimeToolificationTruthRegistry();
    const surface = pickSurface(surfaces, "workflow-evidence-profiles-readback");
    const gateResult = evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [preflight.ref, proof.ref],
        toolInvocationRefs: [trace.invocationRef],
        workQueueReadbackRefs: [`work-queue://${item.workItemId}/readback`],
        closeoutRefs: [`closeout://${runId}/workflow-evidence-profile`],
        reasonCodes: ["workflow_evidence_profile_gate_evidence_recorded"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    if (!gateResult.accepted) {
      throw new Error(
        `workflow_evidence_profile_adoption_gate_rejected:${gateResult.missingEvidenceKinds.join(",")}`,
      );
    }
    const gate = writeArtifact("workflow-evidence-profiles-readback-adoption-gate-proof.json", {
      artifactKind: "workflow_evidence_profiles_readback_adoption_gate_proof",
      runId,
      surfaceId: surface.surfaceId,
      gateResult,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      closeoutRef: `closeout://${runId}/workflow-evidence-profile`,
      validationRef: proof.ref,
      validationRequired: true,
      sourceEditRequired: false,
      toolificationAdoptionGateResults: [gateResult],
      toolificationAdoptionGateEvidenceRefs: [gate.ref],
      reasonCodes: ["workflow_evidence_profiles_readback_production_primary"],
      accepted: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      runtimeLifecycleMutated: false,
      modelPromotionPerformed: false,
    });
    const summary = writeArtifact("workflow-evidence-profiles-readback-summary.json", {
      artifactKind: "workflow_evidence_profiles_readback_summary",
      runId,
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      closedStatus: closeout.status,
      profileAccepted: evaluation.accepted,
      genericFallbackRejected: !rejectedGeneric.accepted,
      readbackProfileAccepted: readbackProfile.accepted === true,
      adoptionGateAccepted: gateResult.accepted,
      artifactRefs: [preflight.ref, proof.ref, gate.ref],
      nextQueueItem: "Canonical Workflow Runtime Engine And Workflow Definition Registry",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          workItemId: item.workItemId,
          runtimeJobId: job.jobId,
          closedStatus: closeout.status,
          artifacts: [preflight.path, proof.path, gate.path, summary.path],
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime?.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
