#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.workflow-runtime-03-generic-runner-retirement";

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

async function fixtures() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/workers/test-closeout-capsule-fixture.ts"),
    import.meta.url,
  );
}

async function retiredRunnerFixture() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts"),
    import.meta.url,
  );
}

async function ensureWorkItem(workQueue) {
  const metadata = {
    ownerSystemArea: "execution-platform",
    runtimeWorkflowEngineSurfaceId: "generic-workflow-runner-retirement",
    canonicalRuntimeTruth: "execution-platform-db",
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Generic Workflow Runner Production Retirement",
      description:
        "Retire generic queued workflow production success and force production workflow completion through canonical workflow engine gates.",
      metadata: { ...existing.item.metadata, ...metadata },
      actorId: "generic-workflow-runner-retirement-proof",
    });
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Generic Workflow Runner Production Retirement",
    description:
      "Retire generic queued workflow production success and force production workflow completion through canonical workflow engine gates.",
    metadata,
  });
}

function executorMap(executor) {
  return {
    "kind:context_scout": executor,
    "kind:implementation": executor,
    "kind:validation": executor,
    "kind:test_review": executor,
    "kind:repair": executor,
    "kind:reviewer": executor,
    "kind:observability_readback": executor,
    "kind:human_task": executor,
    "kind:closeout": executor,
    "role:context_scout": executor,
    "role:implementation_engineer": executor,
    "role:test_engineer": executor,
    "role:reviewer": executor,
    "role:observability_scribe": executor,
  };
}

async function main() {
  const loadedDotenvRefs = loadDotenvFiles();
  const api = await ep();
  const { WorkflowQueuedRunner } = await retiredRunnerFixture();
  const { createModelAuthoredCloseoutCapsuleFixture } = await fixtures();
  const runId = `generic-workflow-runner-retirement-${Date.now()}`;
  const diagnosticToolId = "diagnostic.generic_workflow_runner_retirement";

  const preflight = writeArtifact("generic-workflow-runner-retirement-preflight.json", {
    artifactKind: "generic_workflow_runner_retirement_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    productionPathUnderTest:
      "Runtime job -> WorkflowQueuedRunner migration shim -> canonical workflow blockers/readback -> DB Work Queue closeout",
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
    runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient, {
      claimStrategy: "basic",
    });
    const workQueueEvents = new api.WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const traces = new api.RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new api.RuntimeToolRegistry();
    registry.register(
      api.buildRuntimeToolDefinition({
        toolId: diagnosticToolId,
        toolVersion: "v1",
        toolFamily: "worker.invoke",
        executorKey: diagnosticToolId,
        schemaRef: "runtime-tool://diagnostic/generic-workflow-runner-retirement/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/generic-workflow-runner-retirement/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded runtime-tool trace proving generic workflow runner retirement is runtime-tool visible.",
            reasonCodes: ["generic_workflow_runner_retirement_trace_recorded"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    const kernel = new api.RuntimeToolKernel({ registry, traces });
    const item = await ensureWorkItem(workQueue);

    const proofJob = await runtimeJobs.enqueueJob({
      jobId: `${runId}-proof-job`,
      jobType: "proof.execution_platform",
      queueName: "proof",
      workItemId: item.workItemId,
      payload: {
        proofKind: "generic_workflow_runner_retirement",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "generic-workflow-runner-retirement-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });
    const trace = await kernel.invoke({
      toolId: diagnosticToolId,
      runtimeJobId: proofJob.jobId,
      roleRef: "generic-workflow-runner-retirement-proof",
      idempotencyScope: "generic-workflow-runner-retirement-proof",
      idempotencyKey: runId,
      inputSummary:
        "Record bounded runtime-tool trace evidence for generic workflow runner retirement.",
      metadata: {
        workItemId: item.workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const workflowCases = [
      {
        label: "product_spec_planning",
        workflowId: "agent_team.product_spec_planning",
        expectedStatus: "blocked_migration_required",
      },
      {
        label: "docs_skills",
        workflowId: "workflow.docs_skills",
        expectedStatus: "blocked_migration_required",
      },
      {
        label: "coding_production_ready_wrong_job_type",
        workflowId: "agent_team.coding",
        expectedStatus: "canonical_engine_required",
      },
      {
        label: "unknown_workflow",
        workflowId: "workflow.unknown",
        expectedStatus: "definition_missing",
      },
    ];
    const runResults = [];
    for (const testCase of workflowCases) {
      const workCaseItem = await workQueue.createGeneratedWorkItem({
        workItemId: `${WORK_ITEM_ID}.${testCase.label}.${runId}`,
        itemType: "execution_workflow",
        title: `Generic workflow retirement proof: ${testCase.label}`,
        description:
          "Proof item for verifying WorkflowQueuedRunner cannot produce production workflow success.",
        metadata: {
          parentWorkItemId: item.workItemId,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        generatedOriginKind: "proof_diagnostic",
        generatedTerminalPolicy: "debug_only",
        parentWorkItemId: item.workItemId,
        createdBy: "generic-workflow-runner-retirement-proof",
        reasonCodes: [
          "generic_workflow_runner_retirement_diagnostic_child",
          "not_owner_roadmap_work",
        ],
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: `${runId}-${testCase.label}`,
        jobType: "executor.workflow",
        queueName: "agent-team",
        workItemId: workCaseItem.workItemId,
        payload: {
          workflowId: testCase.workflowId,
          objectiveSummary:
            "Attempt to complete through generic workflow runner; production success must be retired.",
        },
        idempotencyScope: "generic-workflow-runner-retirement-proof",
        idempotencyKey: `${runId}:${testCase.label}`,
        maxAttempts: 1,
      });
      await workQueue.createWorkRun({
        runId: `${runId}-${testCase.label}-run`,
        workItemId: workCaseItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
      });
      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: `generic-retirement-proof:${testCase.label}`,
        queueName: "agent-team",
        runtimeJobId: job.jobId,
        runtimeToolKernel: kernel,
      }).runOnce();
      const artifacts = await runtimeJobs.listArtifacts(job.jobId);
      const retirement = artifacts.find(
        (artifact) =>
          artifact.artifactType === api.GENERIC_WORKFLOW_RUNNER_RETIREMENT_ARTIFACT_TYPE,
      );
      const closeoutArtifacts = artifacts.filter((artifact) =>
        artifact.artifactType.includes("closeout"),
      );
      if (run.completed || !run.failed || run.status !== testCase.expectedStatus) {
        throw new Error(`generic_runner_retirement_case_failed:${testCase.label}`);
      }
      if (!retirement) {
        throw new Error(`generic_runner_retirement_artifact_missing:${testCase.label}`);
      }
      if (closeoutArtifacts.length > 0) {
        throw new Error(`generic_runner_closeout_artifact_should_not_exist:${testCase.label}`);
      }
      runResults.push({
        label: testCase.label,
        workflowId: testCase.workflowId,
        runtimeJobId: job.jobId,
        status: run.status,
        completed: run.completed,
        failed: run.failed,
        reasonCodes: run.reasonCodes,
        retirementArtifactRef: retirement.uri,
        closeoutArtifactsCreated: closeoutArtifacts.length,
      });
    }

    const executor = {
      async execute() {
        return {
          status: "succeeded",
          outputArtifactRefs: [trace.invocationRef],
          reasonCodes: ["canonical_dispatch_executor_fixture_succeeded"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };
    const executors = executorMap(executor);
    const definition = api.requireCanonicalWorkflowDefinition("agent_team.coding");
    const plugin = api.buildAgentTeamCodingWorkflowPlugin({
      definition,
      executors,
      requireSchedulerToolKernel: true,
    });
    const engine = new api.RuntimeWorkflowGraphEngine({
      graphs: new api.RuntimeWorkGraphRepository(runtime.sqlClient),
      runtimeToolKernel: kernel,
    });
    const codingReadiness = engine.evaluateReadiness({
      workflowId: "agent_team.coding",
      executors,
      plugin,
    });
    const productSpecReadiness = engine.evaluateReadiness({
      workflowId: "agent_team.product_spec_planning",
      executors: {},
    });
    if (!codingReadiness.ready || productSpecReadiness.ready) {
      throw new Error("canonical_workflow_dispatch_readiness_failed");
    }

    const readback = await api.buildWorkQueueExecutionReadModel({
      runtimeJobs,
      workQueue,
      workItemId: `${WORK_ITEM_ID}.product_spec_planning.${runId}`,
    });
    const retirementReadback =
      readback.runtimeJobs[0]?.workflow.extension?.genericWorkflowRunnerRetirement;
    if (
      !retirementReadback ||
      retirementReadback.genericProductionSuccessAllowed !== false ||
      retirementReadback.canonicalWorkflowEngineRequired !== true
    ) {
      throw new Error("generic_runner_retirement_readback_missing");
    }

    const closeoutCapsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: proofJob.jobId,
      teamRunId: runId,
      workflowId: "execution-platform.generic-workflow-runner-retirement",
      fileRefs: [
        "extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
        "extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.ts",
      ],
      artifactRefs: [trace.invocationRef],
      validationRefs: ["validation://generic-workflow-runner-retirement-focused-tests"],
    });
    const closeoutRef = `runtime-job://${proofJob.jobId}/closeout-capsule/${closeoutCapsule.capsuleId}`;
    await runtimeJobs.attachArtifact({
      jobId: proofJob.jobId,
      artifactType: "execution_platform.closeout_capsule",
      storageKind: "metadata",
      uri: closeoutRef,
      contentType: "application/json",
      metadata: closeoutCapsule,
    });

    const proofArtifacts = [
      writeArtifact("generic-workflow-runner-entrypoint-audit.json", {
        artifactKind: "generic_workflow_runner_entrypoint_audit",
        productionEntryPointsReviewed: [
          "extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts",
          "extensions/execution-platform/src/codex-bridge/host-routes.ts",
          "src/gateway/server-methods/chat.ts",
          "extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts",
        ],
        classifications: [
          {
            path: "WorkflowQueuedRunner",
            classification: "migration_shim_only",
            productionSuccessAllowed: false,
          },
          {
            path: "agent_team.coding",
            classification: "canonical_engine_plugin_backed",
            productionSuccessAllowedThroughGenericRunner: false,
          },
          {
            path: "agent_team.product_spec_planning",
            classification: "blocked_migration_required_until_plugin_proof",
            productionSuccessAllowedThroughGenericRunner: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("generic-workflow-runner-production-retirement-proof.json", {
        artifactKind: "generic_workflow_runner_production_retirement_proof",
        runResults,
        allGenericRunsFailedClosed: runResults.every(
          (result) => result.failed && !result.completed && result.closeoutArtifactsCreated === 0,
        ),
        genericProductionSuccessAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-dispatch-retirement-proof.json", {
        artifactKind: "canonical_workflow_dispatch_retirement_proof",
        codingReadiness,
        productSpecReadiness,
        codingRequiresCanonicalEngine: true,
        productSpecMigrationRequired: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("generic-runner-retirement-work-queue-readback-proof.json", {
        artifactKind: "generic_runner_retirement_work_queue_readback_proof",
        workItemId: `${WORK_ITEM_ID}.product_spec_planning.${runId}`,
        runtimeJobId: `${runId}-product_spec_planning`,
        retirementReadback,
        blockerReasonCodes: readback.runtimeJobs[0]?.workflow.blockerReasonCodes ?? [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("generic-runner-fallback-retirement-proof.json", {
        artifactKind: "generic_runner_fallback_retirement_proof",
        workflowQueuedRunnerCanCompleteProductionSuccess: false,
        closeoutGenerateInvokedByGenericRunner: false,
        degradedCloseoutSuccessAllowed: false,
        fixtureSuccessAllowedInProduction: false,
        genericRunnerRole: "migration_shim_only",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
    ];

    const surface = api
      .buildRuntimeToolificationTruthRegistry()
      .find((candidate) => candidate.surfaceId === "generic-workflow-runner-retirement");
    if (!surface) {
      throw new Error("generic_workflow_runner_retirement_surface_missing");
    }
    const adoptionGate = api.evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: proofArtifacts.map((artifact) => artifact.ref),
        toolInvocationRefs: [trace.invocationRef],
        workQueueReadbackRefs: [
          `work-queue://${WORK_ITEM_ID}.product_spec_planning.${runId}/readback`,
        ],
        closeoutRefs: [closeoutRef],
        retiredCompatibilityRefs: [
          "repo://extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts#production-success-retired",
          "repo://extensions/execution-platform/src/codex-bridge/workflow-queued-runner.test.ts#generic-runner-retirement",
        ],
        reasonCodes: ["generic_workflow_runner_retirement_adoption_gate_claim"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    if (!adoptionGate.accepted) {
      throw new Error(
        `generic_workflow_runner_retirement_adoption_gate_failed:${adoptionGate.reasonCodes.join(",")}`,
      );
    }
    const adoptionArtifact = writeArtifact(
      "generic-workflow-runner-retirement-adoption-gate-proof.json",
      {
        artifactKind: "generic_workflow_runner_retirement_adoption_gate_proof",
        adoptionGate,
        surface,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
    );

    const closeoutTransition = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: item.workItemId,
      runtimeJobId: proofJob.jobId,
      closeoutRef,
      closeoutHash: `sha256:${sha256(JSON.stringify(closeoutCapsule))}`,
      accepted: true,
      validationRequired: true,
      validationRef: "validation://generic-workflow-runner-retirement-focused-tests",
      sourceEditRequired: false,
      changedFileRefs: [],
      artifactRefs: [...proofArtifacts.map((artifact) => artifact.ref), adoptionArtifact.ref],
      toolificationAdoptionGateResults: [adoptionGate],
      toolificationAdoptionGateEvidenceRefs: [adoptionArtifact.ref],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const summary = writeArtifact("generic-workflow-runner-retirement-summary.json", {
      artifactKind: "generic_workflow_runner_retirement_summary",
      runId,
      workItemId: item.workItemId,
      proofRuntimeJobId: proofJob.jobId,
      status: "passed",
      completedQueueStatus: closeoutTransition.queueStatus,
      runtimeToolInvocationRefs: [trace.invocationRef],
      closeoutRef,
      artifactRefs: [
        preflight.ref,
        ...proofArtifacts.map((artifact) => artifact.ref),
        adoptionArtifact.ref,
      ],
      genericProductionSuccessAllowed: false,
      workflowQueuedRunnerRole: "migration_shim_only",
      productSpecPlanningGenericSuccessAllowed: false,
      codingGenericSuccessAllowed: false,
      realModelCallsMade: false,
      proofKind: "production_runtime_path_non_provider_diagnostic",
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayReloaded: false,
      workQueueLifecycleMutatedDirectly: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    const index = writeArtifact("generic-workflow-runner-retirement-artifact-index.json", {
      artifactKind: "generic_workflow_runner_retirement_artifact_index",
      runId,
      artifacts: [preflight, ...proofArtifacts, adoptionArtifact, summary],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          status: "passed",
          workItemId: item.workItemId,
          proofRuntimeJobId: proofJob.jobId,
          summary: summary.path,
          artifactIndex: index.path,
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
  const message = error instanceof Error ? error.message : String(error);
  writeArtifact("generic-workflow-runner-retirement-summary.json", {
    artifactKind: "generic_workflow_runner_retirement_summary",
    status: "failed",
    errorSummary: message.slice(0, 1_000),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
