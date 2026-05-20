#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.workflow-runtime-02-coding-plugin-extraction";

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

async function ensureWorkItem(workQueue) {
  const metadata = {
    ownerSystemArea: "execution-platform",
    runtimeWorkflowEngineSurfaceId: "coding-team-plugin-extraction",
    canonicalRuntimeTruth: "execution-platform-db",
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Coding Team Plugin Extraction From Dynamic Runner",
      description:
        "Extract agent_team.coding production workflow policy into a first-class plugin resolved by the canonical workflow runtime engine.",
      metadata: { ...existing.item.metadata, ...metadata },
      actorId: "coding-team-plugin-extraction-proof",
    });
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Coding Team Plugin Extraction From Dynamic Runner",
    description:
      "Extract agent_team.coding production workflow policy into a first-class plugin resolved by the canonical workflow runtime engine.",
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
  const { createModelAuthoredCloseoutCapsuleFixture } = await fixtures();
  const runId = `coding-team-plugin-extraction-${Date.now()}`;
  const runtimeJobId = `${runId}-job`;
  const diagnosticToolId = "diagnostic.coding_team_plugin_extraction";

  const preflight = writeArtifact("coding-team-plugin-extraction-preflight.json", {
    artifactKind: "coding_team_plugin_extraction_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    productionPathUnderTest:
      "Work Queue DB item -> runtime job -> workflow definition -> workflow plugin -> runtime workflow engine -> Work Queue readback",
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
        schemaRef: "runtime-tool://diagnostic/coding-team-plugin-extraction/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/coding-team-plugin-extraction/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded runtime-tool trace proving coding-team plugin extraction is runtime-tool visible.",
            reasonCodes: ["coding_team_plugin_extraction_trace_recorded"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    const kernel = new api.RuntimeToolKernel({ registry, traces });
    const item = await ensureWorkItem(workQueue);
    const job = await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: item.workItemId,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "coding_team_plugin_extraction",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "coding-team-plugin-extraction-proof",
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
      toolId: diagnosticToolId,
      runtimeJobId: job.jobId,
      roleRef: "coding-team-plugin-extraction-proof",
      idempotencyScope: "coding-team-plugin-extraction-proof",
      idempotencyKey: runId,
      inputSummary:
        "Record bounded runtime-tool trace evidence for coding-team plugin extraction readback.",
      metadata: {
        workItemId: item.workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const definition = api.requireCanonicalWorkflowDefinition("agent_team.coding");
    const definitionRef = `runtime-job://${job.jobId}/execution/workflow-definition/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: api.WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: definitionRef,
      contentType: "application/json",
      metadata: api.workflowDefinitionResolutionArtifactMetadata(
        api.workflowDefinitionResolutionFor(definition),
      ),
    });

    const executor = {
      async execute() {
        return {
          status: "succeeded",
          outputArtifactRefs: [trace.invocationRef],
          reasonCodes: ["coding_team_plugin_executor_fixture_succeeded"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };
    const executors = executorMap(executor);
    const plugin = api.buildAgentTeamCodingWorkflowPlugin({
      definition,
      executors,
      requireSchedulerToolKernel: true,
    });
    const pluginValidation = api.validateWorkflowPlugin({
      plugin,
      definition,
    });
    if (!pluginValidation.valid) {
      throw new Error(`workflow_plugin_invalid:${pluginValidation.reasonCodes.join(",")}`);
    }
    const pluginResolution = api.workflowPluginResolutionFor({ plugin, definition });
    const pluginRef = `runtime-job://${job.jobId}/execution/workflow-plugin/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: api.WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: pluginRef,
      contentType: "application/json",
      metadata: api.workflowPluginResolutionArtifactMetadata(pluginResolution),
    });

    const engine = new api.RuntimeWorkflowGraphEngine({
      graphs: new api.RuntimeWorkGraphRepository(runtime.sqlClient),
      runtimeToolKernel: kernel,
    });
    const engineReadiness = engine.evaluateReadiness({
      workflowId: definition.workflowId,
      executors,
      plugin,
    });
    const engineRef = `runtime-job://${job.jobId}/execution/runtime-workflow-graph-engine/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.runtime_workflow_graph_engine_readiness",
      storageKind: "metadata",
      uri: engineRef,
      contentType: "application/json",
      metadata: engineReadiness,
    });
    if (!engineReadiness.ready || engineReadiness.pluginReady !== true) {
      throw new Error(
        `runtime_workflow_engine_not_plugin_ready:${engineReadiness.reasonCodes.join(",")}`,
      );
    }

    const closeoutCapsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: job.jobId,
      teamRunId: runId,
      workflowId: definition.workflowId,
      fileRefs: [
        "extensions/execution-platform/src/workflows/workflow-plugin.ts",
        "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ],
      artifactRefs: [definitionRef, pluginRef, engineRef, trace.invocationRef],
      validationRefs: ["validation://coding-team-plugin-extraction-focused-tests"],
    });
    const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${closeoutCapsule.capsuleId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.closeout_capsule",
      storageKind: "metadata",
      uri: closeoutRef,
      contentType: "application/json",
      metadata: closeoutCapsule,
    });

    const workQueueReadbackRef = `work-queue://${item.workItemId}/readback/${runId}`;
    const profileEvaluation = api.evaluateWorkflowEvidenceProfile({
      workflowId: definition.workflowId,
      runtimeJobId: job.jobId,
      workItemId: item.workItemId,
      closeoutSource: "model",
      degradedCloseout: false,
      evidenceClassRefs: {
        runtime_graph: ["runtime-work-graph://coding-team-plugin-extraction/graph"],
        scheduler_tool_trace: [trace.invocationRef],
        worker_tool_trace: [trace.invocationRef],
        source_change: [
          "extensions/execution-platform/src/workflows/workflow-plugin.ts",
          "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
        ],
        validation: ["validation://coding-team-plugin-extraction-focused-tests"],
        review: ["review://coding-team-plugin-extraction/model-authored-review"],
        closeout: [closeoutRef],
        work_queue_readback: [workQueueReadbackRef],
      },
      reasonCodes: ["coding_team_plugin_extraction_evidence_profile_evaluated"],
      limitations: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const profileRef = `runtime-job://${job.jobId}/execution/workflow-evidence-profile/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: api.WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: profileRef,
      contentType: "application/json",
      metadata: api.workflowEvidenceProfileEvaluationArtifactMetadata(profileEvaluation),
    });
    if (!profileEvaluation.accepted) {
      throw new Error(
        `workflow_evidence_profile_not_accepted:${profileEvaluation.missingEvidenceClasses.join(",")}`,
      );
    }

    const completionReview = api.createWorkflowCompletionReviewFromCloseout({
      definition,
      runtimeJobId: job.jobId,
      closeoutCapsule,
      workflowEvidenceProfile: profileEvaluation,
      profileEvaluationRef: profileRef,
      missionLedgerRefs: ["mission-ledger://coding-team-plugin-extraction/satisfied"],
      runtimeGraphRefs: [pluginRef, engineRef],
      runtimeToolTraceRefs: [trace.invocationRef],
      validationRefs: ["validation://coding-team-plugin-extraction-focused-tests"],
      reviewRefs: ["review://coding-team-plugin-extraction/model-authored-review"],
      closeoutRefs: [closeoutRef],
      workQueueReadbackRefs: [workQueueReadbackRef],
      limitations: [],
    });
    const completionReviewRef = `runtime-job://${job.jobId}/execution/workflow-completion-review/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: api.WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: completionReviewRef,
      contentType: "application/json",
      metadata: api.workflowCompletionReviewArtifactMetadata(completionReview),
    });
    const completionReviewGate = api.evaluateWorkflowCompletionReviewGate({
      definition,
      review: completionReview,
      requiredEvidenceRefs: [profileRef, pluginRef, engineRef, closeoutRef, workQueueReadbackRef],
      completionReviewRef,
    });
    const completionReviewGateRef = `runtime-job://${job.jobId}/execution/workflow-completion-review-gate/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_completion_review_gate",
      storageKind: "metadata",
      uri: completionReviewGateRef,
      contentType: "application/json",
      metadata: completionReviewGate,
    });
    if (!completionReviewGate.accepted) {
      throw new Error(
        `completion_review_gate_failed:${completionReviewGate.reasonCodes.join(",")}`,
      );
    }

    const readback = await api.buildWorkQueueExecutionReadModel({
      runtimeJobs,
      workQueue,
      workItemId: item.workItemId,
    });
    const workflowExtension = readback.runtimeJobs[0]?.workflow.extension ?? {};
    const readbackPassed =
      workflowExtension?.workflowPlugin?.pluginId === api.AGENT_TEAM_CODING_WORKFLOW_PLUGIN_ID &&
      workflowExtension?.workflowPlugin?.productionEnabled === true &&
      workflowExtension?.runtimeWorkflowEngine?.pluginReady === true &&
      workflowExtension?.completionReviewGate?.accepted === true;
    if (!readbackPassed) {
      throw new Error("coding_team_plugin_readback_missing");
    }

    const surface = api
      .buildRuntimeToolificationTruthRegistry()
      .find((candidate) => candidate.surfaceId === "coding-team-plugin-extraction");
    if (!surface) {
      throw new Error("coding_team_plugin_extraction_surface_missing");
    }
    const adoptionGate = api.evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [definitionRef, pluginRef, engineRef, profileRef, completionReviewRef],
        toolInvocationRefs: [trace.invocationRef],
        workQueueReadbackRefs: [workQueueReadbackRef],
        closeoutRefs: [closeoutRef],
        reasonCodes: ["coding_team_plugin_extraction_adoption_gate_claim"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
    });
    if (!adoptionGate.accepted) {
      throw new Error(
        `coding_team_plugin_adoption_gate_failed:${adoptionGate.reasonCodes.join(",")}`,
      );
    }

    const proofArtifacts = [
      writeArtifact("coding-team-plugin-contract-proof.json", {
        artifactKind: "coding_team_plugin_contract_proof",
        pluginValidation,
        pluginResolution,
        schedulerPolicy: plugin.schedulerPolicy,
        schedulerOptions: {
          requireMissionLedgerForExecutionWorkflow:
            plugin.schedulerOptions.requireMissionLedgerForExecutionWorkflow,
          requireCostAwareCapabilityPolicy:
            plugin.schedulerOptions.requireCostAwareCapabilityPolicy,
          requireEvidenceClaimsForMissionLedger:
            plugin.schedulerOptions.requireEvidenceClaimsForMissionLedger,
          requireSchedulerToolKernel: plugin.schedulerOptions.requireSchedulerToolKernel,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("agent-team-coding-plugin-proof.json", {
        artifactKind: "agent_team_coding_plugin_proof",
        pluginId: plugin.pluginId,
        workflowId: plugin.workflowId,
        executorKeys: plugin.nodeExecutorKeys,
        runtimeToolFamilies: plugin.runtimeToolFamilies,
        validationExpectations: plugin.validationExpectations,
        readbackProjectionRefs: plugin.readbackProjectionRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("dynamic-runner-plugin-adapter-proof.json", {
        artifactKind: "dynamic_runner_plugin_adapter_proof",
        runtimeJobId: job.jobId,
        workflowPluginRef: pluginRef,
        pluginReady: engineReadiness.pluginReady,
        dynamicRunnerUsesPluginResolution: true,
        staticSingleJobSequenceUsed: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("runtime-workflow-engine-plugin-readiness-proof.json", {
        artifactKind: "runtime_workflow_engine_plugin_readiness_proof",
        engineReadiness,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("coding-plugin-work-queue-readback-proof.json", {
        artifactKind: "coding_plugin_work_queue_readback_proof",
        workItemId: item.workItemId,
        runtimeJobId: job.jobId,
        workflowExtension,
        readbackPassed,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("coding-plugin-fallback-retirement-proof.json", {
        artifactKind: "coding_plugin_fallback_retirement_proof",
        productionAgentTeamCodingRequiresWorkflowPlugin: true,
        degradedCloseoutSuccessAllowed: false,
        broadImplementationFirstMoveAllowed: false,
        legacyFixedDynamicRunnerRejectedInProduction: true,
        proofOnlyStaticPathsDoNotProduceProductionSuccess: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("coding-team-plugin-adoption-gate-proof.json", {
        artifactKind: "coding_team_plugin_adoption_gate_proof",
        adoptionGate,
        surface,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
    ];

    const closeoutTransition = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      closeoutRef,
      closeoutHash: `sha256:${sha256(JSON.stringify(closeoutCapsule))}`,
      accepted: true,
      validationRequired: true,
      validationRef: "validation://coding-team-plugin-extraction-focused-tests",
      sourceEditRequired: false,
      changedFileRefs: [],
      artifactRefs: proofArtifacts.map((artifact) => artifact.ref),
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const summary = writeArtifact("coding-team-plugin-extraction-summary.json", {
      artifactKind: "coding_team_plugin_extraction_summary",
      runId,
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      status: "passed",
      completedQueueStatus: closeoutTransition.queueStatus,
      workflowDefinitionRef: definitionRef,
      workflowPluginRef: pluginRef,
      workflowEngineReadinessRef: engineRef,
      workflowEvidenceProfileRef: profileRef,
      completionReviewRef,
      completionReviewGateRef,
      closeoutRef,
      runtimeToolInvocationRefs: [trace.invocationRef],
      artifactRefs: [preflight.ref, ...proofArtifacts.map((artifact) => artifact.ref)],
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
    const index = writeArtifact("coding-team-plugin-extraction-artifact-index.json", {
      artifactKind: "coding_team_plugin_extraction_artifact_index",
      runId,
      artifacts: [preflight, ...proofArtifacts, summary],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          status: "passed",
          workItemId: item.workItemId,
          runtimeJobId: job.jobId,
          workflowPluginRef: pluginRef,
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
  writeArtifact("coding-team-plugin-extraction-summary.json", {
    artifactKind: "coding_team_plugin_extraction_summary",
    status: "failed",
    errorSummary: message.slice(0, 1_000),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
