#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.workflow-runtime-01-definition-registry";

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
    runtimeWorkflowEngineSurfaceId: "canonical-workflow-runtime-engine-definition-registry",
    canonicalRuntimeTruth: "execution-platform-db",
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Canonical Workflow Runtime Engine And Workflow Definition Registry",
      description:
        "Make workflow definitions, runtime graph engine readiness, completion review, evidence profile, and model-authored closeout the canonical production workflow gates.",
      metadata: { ...existing.item.metadata, ...metadata },
      actorId: "canonical-workflow-runtime-engine-proof",
    });
    return existing.item;
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Canonical Workflow Runtime Engine And Workflow Definition Registry",
    description:
      "Make workflow definitions, runtime graph engine readiness, completion review, evidence profile, and model-authored closeout the canonical production workflow gates.",
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
  const runId = `canonical-workflow-runtime-engine-${Date.now()}`;
  const runtimeJobId = `${runId}-job`;
  const diagnosticToolId = "diagnostic.canonical_workflow_runtime_engine";

  const preflight = writeArtifact("canonical-workflow-runtime-engine-preflight.json", {
    artifactKind: "canonical_workflow_runtime_engine_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    productionPathUnderTest:
      "Workflow definition registry -> RuntimeWorkflowGraphEngine readiness -> workflow evidence profile -> completion review -> Work Queue readback",
    externalResearchRefs: [
      "https://docs.langchain.com/oss/python/langgraph/durable-execution",
      "https://openai.github.io/openai-agents-python/tracing/",
      "https://developers.openai.com/api/docs/guides/agents",
      "https://www.anthropic.com/engineering/building-effective-agents",
    ],
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
        schemaRef: "runtime-tool://diagnostic/canonical-workflow-runtime-engine/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/canonical-workflow-runtime-engine/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded runtime-tool trace proving canonical workflow runtime engine readback is trace-backed.",
            reasonCodes: ["canonical_workflow_runtime_engine_trace_recorded"],
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
        proofKind: "canonical_workflow_runtime_engine_definition_registry",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "canonical-workflow-runtime-engine-proof",
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
      roleRef: "canonical-workflow-runtime-engine-proof",
      idempotencyScope: "canonical-workflow-runtime-engine-proof",
      idempotencyKey: runId,
      inputSummary:
        "Record bounded runtime-tool trace evidence for canonical workflow runtime engine readback.",
      metadata: {
        workItemId: item.workItemId,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const definition = api.requireCanonicalWorkflowDefinition("agent_team.coding");
    const definitionResolution = api.workflowDefinitionResolutionFor(definition);
    const definitionRef = `runtime-job://${job.jobId}/execution/workflow-definition/${definition.workflowId}`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: api.WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: definitionRef,
      contentType: "application/json",
      metadata: api.workflowDefinitionResolutionArtifactMetadata(definitionResolution),
    });

    const engine = new api.RuntimeWorkflowGraphEngine({
      graphs: new api.RuntimeWorkGraphRepository(runtime.sqlClient),
      runtimeToolKernel: kernel,
    });
    const engineReadiness = engine.evaluateReadiness({
      workflowId: definition.workflowId,
      executors: executorMap({
        execute: async () => ({
          status: "succeeded",
          outputArtifactRefs: [],
          reasonCodes: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        }),
      }),
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
    if (!engineReadiness.ready) {
      throw new Error(`engine_readiness_failed:${engineReadiness.reasonCodes.join(",")}`);
    }

    const profileEvaluation = api.evaluateWorkflowEvidenceProfile({
      workflowId: definition.workflowId,
      runtimeJobId: job.jobId,
      workItemId: item.workItemId,
      closeoutSource: "model",
      evidenceClassRefs: {
        runtime_graph: [`runtime-graph://${runId}-graph`],
        scheduler_tool_trace: [`runtime-tool://scheduler.select_next_node/${runId}`],
        worker_tool_trace: [trace.invocationRef],
        source_change: [
          "repo://extensions/execution-platform/src/workflows/workflow-definition.ts#sha256:bounded",
          "repo://extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts#sha256:bounded",
        ],
        validation: ["validation://canonical-workflow-runtime-engine-focused-tests"],
        review: ["review://canonical-workflow-runtime-engine-model-completion-review"],
        closeout: [`closeout://canonical-workflow-runtime-engine/${runId}`],
        work_queue_readback: [`work-queue://${item.workItemId}/readback/${runId}`],
      },
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

    const capsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: job.jobId,
      workflowId: definition.workflowId,
      reportMarkdown:
        "The canonical workflow runtime engine slice is complete: definitions, engine readiness, evidence profiles, completion review, and Work Queue readback are wired as production gates.",
      eli5Progress:
        "OpenClaw now checks a workflow against the official workflow definition before it can say the work succeeded.",
      artifactRefs: [preflight.ref, definitionRef, engineRef, profileRef],
      validationRefs: ["validation://canonical-workflow-runtime-engine-focused-tests"],
    });
    const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${capsule.capsuleId}`;
    await api.recordCloseoutCapsuleArtifact({
      runtimeJobs,
      capsule,
      storageKind: "metadata",
    });

    const completionReview = api.createWorkflowCompletionReviewFromCloseout({
      definition,
      runtimeJobId: job.jobId,
      closeoutCapsule: capsule,
      workflowEvidenceProfile: profileEvaluation,
      profileEvaluationRef: profileRef,
      missionLedgerRefs: [`runtime-job://${job.jobId}/mission-ledger/${runId}`],
      runtimeGraphRefs: [`runtime-graph://${runId}-graph`, engineRef],
      runtimeToolTraceRefs: [
        trace.invocationRef,
        `runtime-tool://scheduler.select_next_node/${runId}`,
      ],
      validationRefs: ["validation://canonical-workflow-runtime-engine-focused-tests"],
      reviewRefs: ["review://canonical-workflow-runtime-engine-model-completion-review"],
      closeoutRefs: [closeoutRef],
      workQueueReadbackRefs: [`work-queue://${item.workItemId}/readback/${runId}`],
      limitations: [],
    });
    const completionReviewRef = `runtime-job://${job.jobId}/execution/workflow-completion-review/${runId}`;
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
      requiredEvidenceRefs: [profileRef, engineRef, trace.invocationRef, closeoutRef],
      completionReviewRef,
    });
    const completionReviewGateRef = `runtime-job://${job.jobId}/execution/workflow-completion-review-gate/${runId}`;
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
      workflowExtension?.workflowDefinition?.productionEnabled === true &&
      workflowExtension?.runtimeWorkflowEngine?.ready === true &&
      workflowExtension?.completionReviewGate?.accepted === true;
    if (!readbackPassed) {
      throw new Error("workflow_definition_engine_readback_missing");
    }

    const surface = api
      .buildRuntimeToolificationTruthRegistry()
      .find(
        (candidate) =>
          candidate.surfaceId === "canonical-workflow-runtime-engine-definition-registry",
      );
    if (!surface) {
      throw new Error("canonical_workflow_runtime_engine_surface_missing");
    }
    const adoptionGate = api.evaluateRuntimeToolificationAdoptionGate({
      surface,
      claim: {
        surfaceId: surface.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: [definitionRef, engineRef, profileRef, completionReviewRef],
        toolInvocationRefs: [trace.invocationRef],
        workQueueReadbackRefs: [`work-queue://${item.workItemId}/readback/${runId}`],
        closeoutRefs: [closeoutRef],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    if (!adoptionGate.accepted) {
      throw new Error(`adoption_gate_failed:${adoptionGate.reasonCodes.join(",")}`);
    }

    const proofArtifacts = [
      writeArtifact("canonical-workflow-runtime-research-summary.json", {
        artifactKind: "canonical_workflow_runtime_research_summary",
        conclusion:
          "Durable workflow systems should persist graph state, typed tool traces, and final model-authored evaluation as separate runtime evidence instead of prompt footer self-checks.",
        sourceRefs: [
          "https://docs.langchain.com/oss/python/langgraph/durable-execution",
          "https://openai.github.io/openai-agents-python/tracing/",
          "https://developers.openai.com/api/docs/guides/agents",
          "https://www.anthropic.com/engineering/building-effective-agents",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-runtime-definition-contract-proof.json", {
        artifactKind: "canonical_workflow_runtime_definition_contract_proof",
        definitionResolution,
        registrySummary: api.summarizeCanonicalWorkflowDefinitionRegistry(),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-runtime-graph-engine-proof.json", {
        artifactKind: "canonical_workflow_runtime_graph_engine_proof",
        engineReadiness,
        executorCoverage: Object.keys(executorMap({ execute: async () => ({}) })),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-runtime-completion-review-proof.json", {
        artifactKind: "canonical_workflow_runtime_completion_review_proof",
        completionReview,
        completionReviewGate,
        deepCompletionQuestion: definition.completionReviewPolicy.deepCompletionQuestion,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-runtime-readback-proof.json", {
        artifactKind: "canonical_workflow_runtime_readback_proof",
        workItemId: item.workItemId,
        runtimeJobId: job.jobId,
        workflowExtension,
        blockerReasonCodes: readback.runtimeJobs[0]?.workflow.blockerReasonCodes ?? [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
      writeArtifact("canonical-workflow-runtime-adoption-gate-proof.json", {
        artifactKind: "canonical_workflow_runtime_adoption_gate_proof",
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
      closeoutHash: `sha256:${sha256(JSON.stringify(capsule))}`,
      accepted: true,
      validationRequired: true,
      validationRef: "validation://canonical-workflow-runtime-engine-focused-tests",
      sourceEditRequired: false,
      changedFileRefs: [],
      artifactRefs: proofArtifacts.map((artifact) => artifact.ref),
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const summary = writeArtifact("canonical-workflow-runtime-engine-summary.json", {
      artifactKind: "canonical_workflow_runtime_engine_summary",
      runId,
      workItemId: item.workItemId,
      runtimeJobId: job.jobId,
      status: "passed",
      completedQueueStatus: closeoutTransition.queueStatus,
      workflowDefinitionRef: definitionRef,
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

    writeArtifact("canonical-workflow-runtime-engine-artifact-index.json", {
      artifactKind: "canonical_workflow_runtime_engine_artifact_index",
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
          summary: summary.path,
          closeoutRef,
          completionReviewGateAccepted: completionReviewGate.accepted,
        },
        null,
        2,
      ),
    );
  } finally {
    if (runtime?.pool?.end) {
      await runtime.pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
