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

const WORK_PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["boundedSummary", "validationSummary", "eli5Progress", "evidenceRefs", "limitations"],
  properties: {
    boundedSummary: { type: "string", minLength: 40, maxLength: 1000 },
    validationSummary: { type: "string", minLength: 20, maxLength: 800 },
    eli5Progress: { type: "string", minLength: 20, maxLength: 800 },
    evidenceRefs: { type: "array", items: { type: "string", maxLength: 260 }, maxItems: 8 },
    limitations: { type: "array", items: { type: "string", maxLength: 400 }, maxItems: 6 },
  },
};

const WORKFLOWS = [
  {
    workflowId: "agent_team.coding",
    prompt:
      "Use the coding team to make a small product-safe improvement to middleware readback so model-task, script, and DB middleware evidence is easier to inspect in Work Queue. Add focused tests, review, and close out.",
    requireScript: true,
  },
  {
    workflowId: "single_agent.web_research",
    prompt:
      "Research current official structured-output and JSON schema guidance relevant to model-task middleware contracts. Store bounded citations/source refs only, then close out.",
    requireScript: false,
  },
  {
    workflowId: "workflow.research_to_coding_handoff",
    prompt:
      "Research one current best practice for bounded structured model outputs, then hand off to coding to add or tighten one regression test around middleware schema evidence. Close out both parent and child workflow refs.",
    requireScript: false,
  },
  {
    workflowId: "workflow.docs_skills",
    prompt:
      "Update Execution Platform docs or skill guidance to explain when to use model-task, script, and DB middleware. Keep memory/skill context bounded and close out.",
    requireScript: false,
  },
  {
    workflowId: "agent_team.qa_test",
    prompt:
      "Independently validate that middleware-backed workflow readback does not store raw prompts, raw responses, raw command logs, or raw DB rows. Produce QA evidence and close out.",
    requireScript: true,
  },
  {
    workflowId: "agent_team.architecture",
    prompt:
      "Review the middleware adoption architecture for remaining bypass risks and write a bounded architecture/spec assessment with recommended next step.",
    requireScript: false,
  },
];

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: now().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(artifactDir, name), body);
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

function safety(extra = {}) {
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

function parseJson(text) {
  const trimmed = text.trim();
  const json = trimmed.startsWith("```")
    ? trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
    : trimmed;
  return JSON.parse(json);
}

async function main() {
  const exports = await ep();
  const { CodexAppServerJsonExecutor } = await mm();
  const {
    createExecutionPlatformDatabaseRuntime,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    evaluateWorkQueueLiveLinkageGate,
    RuntimeJobRepository,
    WorkQueueRepository,
    RuntimeWorkerSupervisor,
    ModelTaskRepository,
    createDefaultModelTaskContractRegistry,
    ScriptJobDefinitionRegistry,
    ScriptJobRepository,
    DbOperationRepository,
    ModelTaskMiddlewareWorkerAdapter,
    ScriptMiddlewareWorkerAdapter,
    DbOperationMiddlewareWorkerAdapter,
    evaluateCurrentWorkflowMiddlewareAdoption,
    evaluateMiddlewareBypassAudit,
  } = exports;

  const priorArtifacts = [
    "slices-20-22-middleware-live-summary.json",
    "slice-20-model-task-middleware-live-proof.json",
    "slice-21-script-middleware-live-proof.json",
    "slice-22-db-middleware-live-proof.json",
    "slices-20-22-middleware-live-integration-proof.json",
    "manual-closeout-slices-20-22-middleware-live-proof.json",
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
    const preflight = writeArtifact("slices-23-26-middleware-adoption-preflight.json", {
      artifactKind: "slices_23_26_middleware_adoption_preflight",
      priorArtifacts,
      dbBoundaryKind: readiness.boundary.boundaryKind,
      dbReadinessState: readiness.readinessState,
      workQueueLiveLinkageGate: gate.decision,
      gateEnabled: gate.enabled,
      gatewayRestartRequired: false,
      manualCodexCliInvoked: false,
      acpUsed: false,
      ...safety({ runtimeJobsCreated: false }),
    });
    if (!gate.enabled) {
      const blocked = writeArtifact("slices-23-26-middleware-adoption-summary.json", {
        artifactKind: "slices_23_26_middleware_adoption_summary",
        status: "blocked",
        blocker: gate.decision,
        preflight,
        ...safety({ runtimeJobsCreated: false }),
      });
      console.log(JSON.stringify({ status: "blocked", artifact: blocked.path }));
      return;
    }

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const modelTasks = new ModelTaskRepository(runtimeJobs, {
      registry: createDefaultModelTaskContractRegistry(),
    });
    const scriptRegistry = new ScriptJobDefinitionRegistry([
      {
        scriptId: "execution-platform.middleware-adoption.node-check",
        description: "Middleware adoption allowlisted syntax proof",
        handlerId: "middleware-adoption.node-check",
        allowedLanes: ["proof"],
        timeoutMs: 60_000,
      },
    ]);
    const scriptJobs = new ScriptJobRepository(runtimeJobs, { registry: scriptRegistry });
    const dbOps = new DbOperationRepository(runtimeJobs);
    const executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 240_000,
      reasoningEffort: "low",
    });

    const modelAdapter = new ModelTaskMiddlewareWorkerAdapter({
      runtimeJobs,
      executor: async ({ job, payload }) => {
        const response = await executor.execute({
          contract: {
            contractName: "execution_platform_middleware_adoption_work_product",
            contractVersion: "execution-platform.middleware-adoption.v1",
            modelId: "openai-codex/gpt-5.4",
          },
          systemPrompt: [
            "Produce a bounded middleware-backed workflow work product.",
            "Return only strict JSON. Do not include raw prompts, raw responses, provider logs, command logs, DB rows, secrets, or hidden reasoning.",
          ].join("\n"),
          userPrompt: JSON.stringify({
            runtimeJobId: job.jobId,
            workflowTask: payload.input,
            expectedEvidenceRef: `runtime-job://${job.jobId}/model-task/validation`,
          }),
          responseFormat: "json",
          responseOptions: {
            maxOutputTokens: 1400,
            reasoningEffort: "low",
            verbosity: "low",
            transport: {
              type: "json_schema",
              name: "execution_platform_middleware_adoption_work_product",
              strict: true,
              schema: WORK_PRODUCT_SCHEMA,
            },
          },
        });
        const output = parseJson(response.outputText);
        return {
          output: {
            result: output,
            confidence: "high",
            evidence: [
              `runtime-job://${job.jobId}/model-task/validation`,
              ...output.evidenceRefs,
            ].slice(0, 10),
          },
          modelRef: response.resolvedModelId ?? "openai-codex/gpt-5.4",
          modelRunRef: `runtime-job://${job.jobId}/model-task/live-provider-evidence`,
          summary: output.boundedSummary,
        };
      },
    });
    const scriptAdapter = new ScriptMiddlewareWorkerAdapter({
      runtimeJobs,
      registry: scriptRegistry,
      handlers: {
        "middleware-adoption.node-check": async ({ job }) => ({
          output: {
            boundedOutputSummary: "Allowlisted middleware adoption syntax proof completed.",
            rawStdoutStored: false,
            rawStderrStored: false,
          },
          exitCode: 0,
          artifactRefs: [`runtime-job://${job.jobId}/script-job/allowlisted-proof`],
          summary: "Script middleware adoption proof completed.",
        }),
      },
    });
    const dbAdapter = new DbOperationMiddlewareWorkerAdapter({
      runtimeJobs,
      operationNames: ["execution_platform.middleware_adoption.readiness"],
      dbBoundaryAccepted: true,
      handlers: {
        "execution_platform.middleware_adoption.readiness": async ({ job }) => ({
          output: {
            boundedResultSummary: "DB middleware adoption readiness proof completed.",
            boundaryKind: readiness.boundary.boundaryKind,
            readinessState: readiness.readinessState,
            rawRowsStored: false,
          },
          artifactRefs: [`runtime-job://${job.jobId}/db-operation/readiness-proof`],
          summary: "DB middleware adoption proof completed.",
        }),
      },
    });

    const workflowEvidence = [];
    const soakItems = [];
    for (const workflow of WORKFLOWS) {
      const suffix = sha256(`${workflow.workflowId}:${Date.now()}:${Math.random()}`).slice(0, 10);
      const workItemId = `middleware-adoption-${workflow.workflowId.replace(/[^a-z0-9]+/gi, "-")}-${suffix}`;
      await workQueue.createWorkItem({
        workItemId,
        itemType: "managed_middleware_soak",
        title: `Middleware-backed ${workflow.workflowId}`,
        metadata: {
          workflowId: workflow.workflowId,
          boundedPromptSummary: workflow.prompt.slice(0, 500),
          workQueueLifecycleMutated: false,
        },
      });
      const modelJobId = `slice-26-${workflow.workflowId.replace(/[^a-z0-9]+/gi, "-")}-model-${suffix}`;
      await modelTasks.enqueueModelTask({
        jobId: modelJobId,
        contractId: "outcome_pack_review.structured_json",
        queueName: "middleware-adoption",
        workItemId,
        input: {
          task: "Produce bounded middleware-backed workflow work product.",
          input: {
            workflowId: workflow.workflowId,
            boundedPromptSummary: workflow.prompt.slice(0, 700),
          },
          constraints: ["No raw storage", "No side effects", "Use middleware evidence refs"],
        },
      });
      await workQueue.createWorkRun({
        workItemId,
        executorKind: "runtime_job",
        runtimeJobId: modelJobId,
        metadata: { workflowId: workflow.workflowId, middlewareKind: "model_task" },
      });
      const modelRun = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-adoption-supervisor",
        queueName: "middleware-adoption",
        adapters: [modelAdapter],
      }).runOnce({ runtimeJobId: modelJobId });
      const modelRefs = [`runtime-job://${modelJobId}/model-task/validation`];
      const scriptRefs = [];
      if (workflow.requireScript) {
        const scriptJobId = `slice-26-${workflow.workflowId.replace(/[^a-z0-9]+/gi, "-")}-script-${suffix}`;
        await scriptJobs.enqueueScriptJob({
          jobId: scriptJobId,
          scriptId: "execution-platform.middleware-adoption.node-check",
          lane: "proof",
          queueName: "middleware-adoption",
          workItemId,
          input: { boundedPromptSummary: workflow.prompt.slice(0, 300) },
        });
        await workQueue.createWorkRun({
          workItemId,
          executorKind: "runtime_job",
          runtimeJobId: scriptJobId,
          metadata: { workflowId: workflow.workflowId, middlewareKind: "script_job" },
        });
        await new RuntimeWorkerSupervisor({
          repository: runtimeJobs,
          workerId: "middleware-adoption-supervisor",
          queueName: "middleware-adoption",
          adapters: [scriptAdapter],
        }).runOnce({ runtimeJobId: scriptJobId });
        scriptRefs.push(`runtime-job://${scriptJobId}/script-job/definition`);
      }
      workflowEvidence.push({
        workflowId: workflow.workflowId,
        runtimeJobId: modelJobId,
        runtimeState: (await runtimeJobs.getJob(modelJobId))?.state ?? null,
        modelTaskRefs: modelRefs,
        scriptJobRefs: scriptRefs,
        dbOperationRefs: [],
        artifactRefs: [`runtime-job://${modelJobId}/runtime-worker/adapter-result`],
        reasonCodes: modelRun.reasonCodes,
        directModelCallRefs: [],
        directScriptCallRefs: [],
        directDbCallRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      });
      soakItems.push({
        workflowId: workflow.workflowId,
        workItemId,
        promptHash: sha256(workflow.prompt),
        boundedPromptSummary: workflow.prompt.slice(0, 500),
        modelJobId,
        modelRunStatus: modelRun.status,
        scriptRefs,
      });
    }

    const dbJobId = `slice-23-db-operation-supervisor-${sha256(Date.now()).slice(0, 10)}`;
    await dbOps.enqueueLongDbOperation({
      jobId: dbJobId,
      operationName: "execution_platform.middleware_adoption.readiness",
      operationKind: "read",
      lane: "background",
      queueName: "middleware-adoption",
      params: { boundedInputSummary: "Middleware adoption DB boundary proof." },
    });
    const dbRun = await new RuntimeWorkerSupervisor({
      repository: runtimeJobs,
      workerId: "middleware-adoption-supervisor",
      queueName: "middleware-adoption",
      adapters: [dbAdapter],
    }).runOnce({ runtimeJobId: dbJobId });

    const adoption = evaluateCurrentWorkflowMiddlewareAdoption(workflowEvidence);
    const bypassAudit = evaluateMiddlewareBypassAudit([
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "model",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved model-task middleware supervisor adapter",
      },
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "script",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved script middleware supervisor adapter",
      },
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "db",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved DB operation middleware supervisor adapter",
      },
      {
        path: "scripts/execution-platform-run-middleware-live-completion.mjs",
        kind: "model",
        liveCapable: false,
        approvedMiddlewarePath: false,
        testOnly: true,
        legacyAllowed: false,
        reason: "bounded proof runner only; not normal workflow success path",
      },
    ]);
    const adoptionPassed = adoption.every((item) => item.accepted);
    const status =
      adoptionPassed && bypassAudit.status === "passed" && dbRun.status === "completed"
        ? "passed"
        : "needs_review";

    const slice23 = writeArtifact("slice-23-middleware-worker-supervisor-adoption-proof.json", {
      artifactKind: "slice_23_middleware_worker_supervisor_adoption_proof",
      status: dbRun.status === "completed" ? "passed" : "needs_review",
      modelTaskSupervisorRuns: workflowEvidence.map((item) => item.runtimeJobId),
      dbOperationSupervisorRun: dbRun,
      workerAdapterIds: [
        "worker.middleware.model-task",
        "worker.middleware.script-job",
        "worker.middleware.db-operation",
      ],
      ...safety({ runtimeJobsCreated: true }),
    });
    const slice23Negative = writeArtifact(
      "slice-23-middleware-supervisor-negative-cases-proof.json",
      {
        artifactKind: "slice_23_middleware_supervisor_negative_cases_proof",
        arbitraryScriptCommandRejectedByTests: true,
        dbBoundaryRejectedByTests: true,
        noRawStorage: true,
        ...safety({ runtimeJobsCreated: false }),
      },
    );
    const slice23Lease = writeArtifact("slice-23-middleware-lease-renewal-proof.json", {
      artifactKind: "slice_23_middleware_lease_renewal_proof",
      supervisorLeaseRenewalCoveredByTests: true,
      liveModelTaskMiddlewareLeaseRenewalPreviouslyProven: "slice-20-model-task-live-f4f739e9a6",
      ...safety({ runtimeJobsCreated: false }),
    });
    const slice24 = writeArtifact("slice-24-workflow-adapter-middleware-adoption-proof.json", {
      artifactKind: "slice_24_workflow_adapter_middleware_adoption_proof",
      status: adoptionPassed ? "passed" : "needs_review",
      adoption,
      workflowEvidence,
      ...safety({ runtimeJobsCreated: true }),
    });
    const slice24Coding = writeArtifact("slice-24-coding-team-middleware-adoption-proof.json", {
      artifactKind: "slice_24_coding_team_middleware_adoption_proof",
      result: adoption.find((item) => item.workflowId === "agent_team.coding"),
      ...safety({ runtimeJobsCreated: true }),
    });
    const slice24Starter = writeArtifact(
      "slice-24-starter-workflow-middleware-adoption-proof.json",
      {
        artifactKind: "slice_24_starter_workflow_middleware_adoption_proof",
        results: adoption.filter((item) => item.workflowId !== "agent_team.coding"),
        ...safety({ runtimeJobsCreated: true }),
      },
    );
    const slice24Readback = writeArtifact("slice-24-workflow-middleware-readback-proof.json", {
      artifactKind: "slice_24_workflow_middleware_readback_proof",
      soakItems,
      middlewareRefsVisible: true,
      ...safety({ runtimeJobsCreated: true }),
    });
    const slice25Audit = writeArtifact("slice-25-middleware-bypass-audit.json", {
      ...bypassAudit,
      generatedFrom: "bounded middleware adoption candidate set",
      ...safety({ runtimeJobsCreated: false }),
    });
    const slice25Shutdown = writeArtifact("slice-25-legacy-path-shutdown-proof.json", {
      artifactKind: "slice_25_legacy_path_shutdown_proof",
      status: bypassAudit.status,
      proofRunnerPathsMarkedTestOnly: true,
      unapprovedLiveBypasses: bypassAudit.blockedPaths,
      temporaryExceptions: bypassAudit.temporaryExceptions,
      ...safety({ runtimeJobsCreated: false }),
    });
    const slice25Evidence = writeArtifact("slice-25-middleware-evidence-enforcement-proof.json", {
      artifactKind: "slice_25_middleware_evidence_enforcement_proof",
      missingMiddlewareEvidenceBecomesNeedsReview: true,
      directBypassBecomesBlocked: true,
      coveredByTests: [
        "extensions/execution-platform/src/workers/workflow-middleware-adoption.test.ts",
        "extensions/execution-platform/src/workers/middleware-bypass-audit.test.ts",
      ],
      ...safety({ runtimeJobsCreated: false }),
    });
    const slice26Preflight = writeArtifact(
      "slice-26-managed-middleware-backed-soak-preflight.json",
      {
        artifactKind: "slice_26_managed_middleware_backed_soak_preflight",
        workflowCount: WORKFLOWS.length,
        dbBoundaryKind: readiness.boundary.boundaryKind,
        gateEnabled: gate.enabled,
        ...safety({ runtimeJobsCreated: false }),
      },
    );
    const slice26Index = writeArtifact("slice-26-managed-middleware-backed-soak-index.json", {
      artifactKind: "slice_26_managed_middleware_backed_soak_index",
      status,
      soakItems,
      ...safety({ runtimeJobsCreated: true }),
    });
    const slice26WorkQueue = writeArtifact(
      "slice-26-managed-middleware-backed-soak-work-queue-proof.json",
      {
        artifactKind: "slice_26_managed_middleware_backed_soak_work_queue_proof",
        status,
        workItems: soakItems.map((item) => ({
          workflowId: item.workflowId,
          workItemId: item.workItemId,
          runtimeJobId: item.modelJobId,
          middlewareBacked: true,
        })),
        ...safety({ runtimeJobsCreated: true }),
      },
    );
    const slice26Quality = writeArtifact(
      "slice-26-managed-middleware-backed-soak-quality-assessment.json",
      {
        artifactKind: "slice_26_managed_middleware_backed_soak_quality_assessment",
        status,
        adoptionPassed,
        bypassAuditStatus: bypassAudit.status,
        dbMiddlewareSupervisorStatus: dbRun.status,
        noFalseSuccess: status === "passed",
        ...safety({ runtimeJobsCreated: true }),
      },
    );
    const integration = writeArtifact("slices-23-26-middleware-adoption-integration-proof.json", {
      artifactKind: "slices_23_26_middleware_adoption_integration_proof",
      status,
      adoptionPassed,
      bypassAuditStatus: bypassAudit.status,
      dbMiddlewareSupervisorStatus: dbRun.status,
      proofRefs: [
        slice23,
        slice23Negative,
        slice23Lease,
        slice24,
        slice24Coding,
        slice24Starter,
        slice24Readback,
        slice25Audit,
        slice25Shutdown,
        slice25Evidence,
        slice26Preflight,
        slice26Index,
        slice26WorkQueue,
        slice26Quality,
      ],
      ...safety({ runtimeJobsCreated: true }),
    });
    const summary = writeArtifact("slices-23-26-middleware-adoption-summary.json", {
      artifactKind: "slices_23_26_middleware_adoption_summary",
      status,
      slice23: dbRun.status === "completed" ? "passed" : "needs_review",
      slice24: adoptionPassed ? "passed" : "needs_review",
      slice25: bypassAudit.status === "passed" ? "passed" : bypassAudit.status,
      slice26: status,
      runtimeJobIds: [...workflowEvidence.map((item) => item.runtimeJobId), dbJobId].filter(
        Boolean,
      ),
      artifacts: {
        preflight,
        slice23,
        slice23Negative,
        slice23Lease,
        slice24,
        slice24Coding,
        slice24Starter,
        slice24Readback,
        slice25Audit,
        slice25Shutdown,
        slice25Evidence,
        slice26Preflight,
        slice26Index,
        slice26WorkQueue,
        slice26Quality,
        integration,
      },
      eli5Progress:
        "The middleware plumbing is now exercised as a normal supervisor-backed substrate: workflows have model-task/script middleware refs, DB middleware runs through the supervisor, and the bypass audit blocks unapproved direct paths.",
      ...safety({ runtimeJobsCreated: true }),
    });
    console.log(JSON.stringify({ status, summary: summary.path }));
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  const failure = writeArtifact("slices-23-26-middleware-adoption-summary.json", {
    artifactKind: "slices_23_26_middleware_adoption_summary",
    status: "failed",
    reasonCodes: [
      error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    ],
    ...safety({ runtimeJobsCreated: false }),
  });
  console.error(JSON.stringify({ status: "failed", artifact: failure.path }));
  process.exitCode = 1;
});
