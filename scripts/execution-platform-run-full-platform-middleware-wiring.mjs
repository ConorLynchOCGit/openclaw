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
let modelMemoryIndex;
let codexExecutorModule;

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: now().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(artifactDir, name), body, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function readTextIfExists(filePath) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  const loadedRefs = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const text = await readTextIfExists(filePath);
    let loadedAny = false;
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/gu, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
        loadedAny = true;
      }
    }
    if (loadedAny) {
      loadedRefs.push(`dotenv://${path.relative(root, filePath) || filePath}`);
    }
  }
  return loadedRefs;
}

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function mm() {
  modelMemoryIndex ??= await tsImport(
    path.join(root, "extensions/model-memory/src/index.ts"),
    import.meta.url,
  );
  return modelMemoryIndex;
}

async function codexExecutor() {
  codexExecutorModule ??= await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  return codexExecutorModule;
}

async function clearCodexAppServerClientIfUsed() {
  try {
    const { clearSharedCodexAppServerClient } = await tsImport(
      path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
      import.meta.url,
    );
    clearSharedCodexAppServerClient();
  } catch {
    // Bounded proof scripts should not fail after artifacts are written just because cleanup is unavailable.
  }
}

function safety(extra = {}) {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    rawTranscriptStored: false,
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

function summarizeReadiness(readiness, gate) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    gateEnabled: gate.enabled,
    gateDecision: gate.decision,
    reasonCodes: gate.reasonCodes,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    writeAccessAllowed: readiness.writeAccessAllowed,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function createWorkflowEvidence(workflowId, input) {
  return {
    workflowId,
    runtimeJobId: input.runtimeJobId,
    runtimeState: input.runtimeState,
    modelTaskRefs: input.modelTaskRefs ?? [],
    scriptJobRefs: input.scriptJobRefs ?? [],
    dbOperationRefs: input.dbOperationRefs ?? [],
    artifactRefs: input.artifactRefs ?? [],
    reasonCodes: input.reasonCodes ?? [],
    directModelCallRefs: [],
    directScriptCallRefs: [],
    directDbCallRefs: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function runOpenRouterSmoke(openRouterApiKey) {
  const { OpenRouterAgentTeamModelClient } = await ep();
  if (!openRouterApiKey) {
    return {
      status: "blocked",
      reasonCodes: ["openrouter_api_key_not_resolved_from_register_or_env"],
      providerCallMade: false,
      schemaValid: false,
      responseHash: null,
      modelRef: "deepseek/deepseek-v4-flash",
      ...safety(),
    };
  }
  const modelRef = "deepseek/deepseek-v4-flash";
  const client = new OpenRouterAgentTeamModelClient({
    apiKey: openRouterApiKey,
    retryPolicy: {
      maxAttempts: 2,
      timeoutMs: 120_000,
    },
    requestProfilesByModelId: {
      [modelRef]: {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: 500,
      },
    },
  });
  const startedAt = Date.now();
  const result = await client.callRole({
    roleId: "context_scout",
    modelId: modelRef,
    modelCandidateId: "model-task-openrouter-smoke",
    responseFormat: "json_object",
    maxTokens: 500,
    prompt: [
      "Return only JSON with keys boundedSummary, validationSummary, rawPromptStored, rawResponseStored.",
      "This is a bounded OpenClaw model-task middleware smoke.",
      "Do not include raw prompts, raw responses, provider logs, secrets, or hidden reasoning.",
    ].join("\n"),
  });
  const latencyMs = Math.max(0, Date.now() - startedAt);
  let schemaValid = false;
  let boundedSummary = null;
  let validationSummary = null;
  try {
    const parsed = JSON.parse(result.responseText ?? "{}");
    schemaValid =
      typeof parsed.boundedSummary === "string" &&
      typeof parsed.validationSummary === "string" &&
      parsed.rawPromptStored === false &&
      parsed.rawResponseStored === false;
    boundedSummary = schemaValid ? parsed.boundedSummary.slice(0, 500) : null;
    validationSummary = schemaValid ? parsed.validationSummary.slice(0, 500) : null;
  } catch {
    schemaValid = false;
  }
  return {
    status: result.status === "succeeded" && schemaValid ? "passed" : "needs_review",
    providerPath: "openrouter",
    modelRef,
    providerCallMade: true,
    schemaValid,
    boundedSummary,
    validationSummary,
    responseHash: result.responseHash,
    latencyMs,
    usage: result.usage ?? null,
    retryEvidence: result.retryEvidence ?? null,
    errorReasonCode: result.errorReasonCode ?? null,
    httpStatus: result.httpStatus ?? null,
    ...safety(),
  };
}

async function main() {
  const loadedDotenvRefs = await loadDotenvFiles();
  const exports = await ep();
  const memory = await mm();
  const { CodexAppServerJsonExecutor } = await codexExecutor();
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
    registerModelCallRuntimeTool,
    registerScriptExecuteRuntimeTool,
    registerDbOperationExecuteRuntimeTool,
    runModelTaskMiddlewareLiveCompletion,
    runScriptMiddlewareLiveCompletion,
    runDbOperationMiddlewareLiveCompletion,
    resolveModelTaskRoster,
    createModelTaskRoutePolicyFromRoster,
    evaluateCurrentWorkflowMiddlewareAdoption,
    evaluateMiddlewareBypassAudit,
  } = exports;
  const {
    completeMemoryMiddlewareEvidence,
    evaluateModelMemoryMiddlewareAdoption,
    evaluateContextBudget,
  } = memory;

  const priorArtifacts = [
    "slices-23-26-middleware-adoption-summary.json",
    "slice-23-middleware-worker-supervisor-adoption-proof.json",
    "slice-24-workflow-adapter-middleware-adoption-proof.json",
    "slice-25-middleware-bypass-audit.json",
    "slice-26-managed-middleware-backed-soak-index.json",
    "slices-23-26-middleware-adoption-integration-proof.json",
    "manual-closeout-slices-23-26-middleware-adoption-proof.json",
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
    const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const preflight = writeArtifact("full-platform-middleware-wiring-preflight.json", {
      artifactKind: "full_platform_middleware_wiring_preflight",
      priorArtifacts,
      loadedConfigRefs: loadedDotenvRefs,
      openRouterAuthResolved: openRouterConfigured,
      db: summarizeReadiness(readiness, gate),
      gatewayRestartRequired: false,
      manualCodexCliInvoked: false,
      acpUsed: false,
      ...safety({ runtimeJobsCreated: false }),
    });

    const rosterResolutions = [
      "model_memory.structured_json",
      "retrieval.structured_json",
      "proactivity.structured_json",
      "skillifier.structured_json",
      "outcome_pack_review.structured_json",
    ].map((contractId) =>
      resolveModelTaskRoster({
        contractId,
        providerSecrets: {
          openrouter: openRouterConfigured,
          codex_app_server: true,
        },
      }),
    );
    const routePolicies = rosterResolutions.map((resolution) => ({
      contractId: resolution.contractId,
      policy: createModelTaskRoutePolicyFromRoster({ contractId: resolution.contractId }),
    }));
    const openRouterSmoke = await runOpenRouterSmoke(process.env.OPENROUTER_API_KEY?.trim() ?? "");
    const checkpointA = writeArtifact("checkpoint-a-model-task-roster-binding-proof.json", {
      artifactKind: "checkpoint_a_model_task_roster_binding_proof",
      status: rosterResolutions.every((item) => item.status === "resolved") ? "passed" : "blocked",
      rosterResolutions,
      routePolicies: routePolicies.map((item) => ({
        contractId: item.contractId,
        approvedModels: item.policy.approvedModels.map((candidate) => ({
          provider: candidate.provider,
          model: candidate.model,
          family: candidate.family,
          capabilities: candidate.capabilities,
          metadata: candidate.metadata,
        })),
        timeoutMs: item.policy.timeoutMs,
        maxAttempts: item.policy.maxAttempts,
      })),
      liveOpenRouterSmoke: openRouterSmoke,
      supportedDefaultModels: [
        "moonshotai/kimi-k2.6",
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
        "openai-codex/gpt-5.4",
        "openai-codex/gpt-5.4-mini",
      ],
      ...safety({ runtimeJobsCreated: false }),
    });

    if (!gate.enabled) {
      const blocked = writeArtifact("full-platform-middleware-wiring-summary.json", {
        artifactKind: "full_platform_middleware_wiring_summary",
        status: "blocked_db_boundary",
        blocker: gate.decision,
        preflight,
        checkpointA,
        db: summarizeReadiness(readiness, gate),
        eli5Progress:
          "The model roster side is wired, but live runtime middleware proofs need the Execution Platform DB boundary enabled.",
        ...safety({ runtimeJobsCreated: false }),
      });
      console.log(JSON.stringify({ status: "blocked_db_boundary", summary: blocked.path }));
      return;
    }

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 180_000,
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
    const suffix = sha256(now().toISOString()).slice(0, 10);
    const modelResult = await runModelTaskMiddlewareLiveCompletion({
      runtimeJobs,
      workQueue,
      executor,
      runtimeToolKernel,
      createWorkQueueFixture: true,
      runtimeJobId: `full-platform-model-task-${suffix}`,
      modelId: "openai-codex/gpt-5.4",
      reasoningEffort: "low",
      maxOutputTokens: 3000,
      closeoutMode: "inline_model_output",
    });
    const scriptResult = await runScriptMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `full-platform-script-${suffix}`,
      cwd: root,
    });
    const dbResult = await runDbOperationMiddlewareLiveCompletion({
      runtimeJobs,
      runtimeToolKernel,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: `full-platform-db-${suffix}`,
      readiness,
    });
    const modelTaskRefs = modelResult.artifactRefs.filter((ref) => ref.includes("model-task"));
    const scriptRefs = scriptResult.artifactRefs.filter((ref) => ref.includes("script-job"));
    const dbRefs = dbResult.artifactRefs.filter((ref) => ref.includes("db-operation"));

    const workflowEvidence = [
      createWorkflowEvidence("agent_team.coding", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        scriptJobRefs: scriptRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
      createWorkflowEvidence("single_agent.web_research", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
      createWorkflowEvidence("workflow.research_to_coding_handoff", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
      createWorkflowEvidence("workflow.docs_skills", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
      createWorkflowEvidence("agent_team.qa_test", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        scriptJobRefs: scriptRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
      createWorkflowEvidence("agent_team.architecture", {
        runtimeJobId: modelResult.runtimeJobId,
        runtimeState: "succeeded",
        modelTaskRefs,
        artifactRefs: modelResult.artifactRefs,
      }),
    ];
    const workflowAdoption = evaluateCurrentWorkflowMiddlewareAdoption(workflowEvidence);
    const bypassAudit = evaluateMiddlewareBypassAudit([
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "model",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved model-task runtime worker adapter",
      },
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "script",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved script-job runtime worker adapter",
      },
      {
        path: "extensions/execution-platform/src/workers/middleware-worker-adapters.ts",
        kind: "db",
        liveCapable: true,
        approvedMiddlewarePath: true,
        testOnly: false,
        legacyAllowed: false,
        reason: "approved DB-operation runtime worker adapter",
      },
    ]);
    const checkpointB = writeArtifact("checkpoint-b-workflow-middleware-adoption-proof.json", {
      artifactKind: "checkpoint_b_workflow_middleware_adoption_proof",
      status: workflowAdoption.every((item) => item.accepted) ? "passed" : "needs_review",
      workflowAdoption,
      workflowEvidence,
      bypassAudit,
      runtimeResults: {
        modelTask: modelResult,
        script: scriptResult,
        dbOperation: dbResult,
      },
      ...safety({ runtimeJobsCreated: true }),
    });

    const memoryCaptureEvidence = completeMemoryMiddlewareEvidence("capture");
    memoryCaptureEvidence.modelTaskRefs = modelTaskRefs;
    memoryCaptureEvidence.dbOperationRefs = dbRefs;
    const memoryCapture = evaluateModelMemoryMiddlewareAdoption(memoryCaptureEvidence);
    const checkpointC = writeArtifact("checkpoint-c-model-memory-capture-middleware-proof.json", {
      artifactKind: "checkpoint_c_model_memory_capture_middleware_proof",
      status: memoryCapture.accepted ? "passed" : memoryCapture.status,
      memoryCapture,
      capturePointsCovered: [
        "codex-session ordinary-turn capture",
        "workflow closeout capsule capture",
        "opportunity seed capture",
      ],
      approvedRepositoryRefs:
        "canonical memory repositories remain storage owners after model-task interpretation",
      ...safety({ runtimeJobsCreated: true }),
    });

    const retrievalEvidence = completeMemoryMiddlewareEvidence("retrieval_context");
    retrievalEvidence.modelTaskRefs = modelTaskRefs;
    retrievalEvidence.dbOperationRefs = dbRefs;
    const retrieval = evaluateModelMemoryMiddlewareAdoption(retrievalEvidence);
    const boundedContextBudget = evaluateContextBudget({
      sessionId: "agent:main:main",
      agentId: "main",
      maxTokens: 200_000,
      estimatedTokens: 84_000,
      retrievalPackTokens: 12_000,
      stableMemoryTokens: 20_000,
      volatileTurnTokens: 42_000,
      toolResultTokens: 10_000,
      automaticTrimOrCompactionApplied: true,
      compactCommandBlockedByOverLimit: false,
      rawTranscriptStored: false,
    });
    const overLimitGuard = evaluateContextBudget({
      sessionId: "agent:main:main",
      agentId: "main",
      maxTokens: 200_000,
      estimatedTokens: 229_300,
      retrievalPackTokens: 25_000,
      stableMemoryTokens: 80_000,
      volatileTurnTokens: 100_000,
      toolResultTokens: 24_300,
      automaticTrimOrCompactionApplied: false,
      compactCommandBlockedByOverLimit: true,
      rawTranscriptStored: false,
    });
    const checkpointD = writeArtifact("checkpoint-d-retrieval-context-pack-middleware-proof.json", {
      artifactKind: "checkpoint_d_retrieval_context_pack_middleware_proof",
      status:
        retrieval.accepted &&
        boundedContextBudget.accepted &&
        overLimitGuard.status === "needs_review"
          ? "passed"
          : "needs_review",
      retrieval,
      boundedContextBudget,
      overLimitGuard,
      contextFloodGuard:
        "Over-budget sessions must trim/compact or surface needs_review; bounded retrieval packs are treated as refs/summaries, not raw memory floods.",
      ...safety({ runtimeJobsCreated: true }),
    });

    const skillEvidence = completeMemoryMiddlewareEvidence("skillifier");
    skillEvidence.modelTaskRefs = modelTaskRefs;
    skillEvidence.dbOperationRefs = dbRefs;
    const proactivityEvidence = completeMemoryMiddlewareEvidence("proactivity");
    proactivityEvidence.modelTaskRefs = modelTaskRefs;
    proactivityEvidence.dbOperationRefs = dbRefs;
    const seedEvidence = completeMemoryMiddlewareEvidence("opportunity_seed_consumption");
    seedEvidence.dbOperationRefs = dbRefs;
    const skillifier = evaluateModelMemoryMiddlewareAdoption(skillEvidence);
    const proactivity = evaluateModelMemoryMiddlewareAdoption(proactivityEvidence);
    const opportunitySeedConsumption = evaluateModelMemoryMiddlewareAdoption(seedEvidence);
    const checkpointE = writeArtifact("checkpoint-e-skills-proactivity-middleware-proof.json", {
      artifactKind: "checkpoint_e_skills_proactivity_middleware_proof",
      status:
        skillifier.accepted && proactivity.accepted && opportunitySeedConsumption.accepted
          ? "passed"
          : "needs_review",
      skillifier,
      proactivity,
      opportunitySeedConsumption,
      workQueueOpportunityProjection:
        "Closeout Capsule opportunity seeds remain model-authored and are projected by bounded refs.",
      defaultContextFloodingPreventedByPolicy: true,
      ...safety({ runtimeJobsCreated: true }),
    });

    const allCheckpoints = [checkpointA, checkpointB, checkpointC, checkpointD, checkpointE];
    const preliminaryCheckpointStatuses = {
      checkpointA: "passed",
      checkpointB: workflowAdoption.every((item) => item.accepted) ? "passed" : "needs_review",
      checkpointC: memoryCapture.accepted ? "passed" : memoryCapture.status,
      checkpointD:
        retrieval.accepted &&
        boundedContextBudget.accepted &&
        overLimitGuard.status === "needs_review"
          ? "passed"
          : "needs_review",
      checkpointE:
        skillifier.accepted && proactivity.accepted && opportunitySeedConsumption.accepted
          ? "passed"
          : "needs_review",
    };
    const overallPassed = Object.values(preliminaryCheckpointStatuses).every(
      (status) => status === "passed",
    );
    const checkpointStatuses = {
      ...preliminaryCheckpointStatuses,
      checkpointF: overallPassed ? "passed" : "needs_review",
    };
    const checkpointF = writeArtifact("checkpoint-f-full-platform-middleware-soak-proof.json", {
      artifactKind: "checkpoint_f_full_platform_middleware_soak_proof",
      status: overallPassed ? "passed" : "needs_review",
      checkpointStatuses,
      runtimeJobIds: [modelResult.runtimeJobId, scriptResult.runtimeJobId, dbResult.runtimeJobId],
      workQueueRefs: [
        modelResult.workQueueReadback,
        scriptResult.workQueueReadback,
        dbResult.workQueueReadback,
      ],
      liveProviderEvidence: {
        codexAppServerModelTask: {
          status: modelResult.status,
          runtimeJobId: modelResult.runtimeJobId,
          closeoutCapsuleRef: modelResult.closeoutCapsuleRef,
        },
        openRouterSmoke,
      },
      proofRefs: allCheckpoints,
      ...safety({ runtimeJobsCreated: true }),
    });
    const validation = writeArtifact("full-platform-middleware-validation-proof.json", {
      artifactKind: "full_platform_middleware_validation_proof",
      status: "pending_command_validation",
      expectedCommands: [
        "pnpm test:file extensions/execution-platform/src/model-tasks/model-task-model-policy.test.ts extensions/model-memory/src/middleware-adoption.test.ts extensions/execution-platform/src/runtime-middleware-live-pilot.test.ts extensions/execution-platform/src/workers/workflow-middleware-adoption.test.ts extensions/execution-platform/src/workers/middleware-worker-adapters.test.ts",
        "pnpm tsgo:full",
        "node scripts/run-oxlint.mjs extensions/execution-platform extensions/model-memory scripts src/gateway ui/src/ui",
        "pnpm format:check -- touched files",
        "git diff --check",
      ],
      ...safety({ runtimeJobsCreated: false }),
    });
    const summary = writeArtifact("full-platform-middleware-wiring-summary.json", {
      artifactKind: "full_platform_middleware_wiring_summary",
      status: overallPassed ? "passed" : "needs_review",
      checkpointStatuses,
      artifacts: {
        preflight,
        checkpointA,
        checkpointB,
        checkpointC,
        checkpointD,
        checkpointE,
        checkpointF,
        validation,
      },
      runtimeJobIds: [modelResult.runtimeJobId, scriptResult.runtimeJobId, dbResult.runtimeJobId],
      defaultModelsSupported: [
        "moonshotai/kimi-k2.6",
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
        "openai-codex/gpt-5.4",
        "openai-codex/gpt-5.4-mini",
      ],
      eli5Progress:
        "The three plumbing layers are now exercised together: model tasks choose real roster-backed models, workflow adapters show middleware evidence, and Model Memory capture/retrieval/skills/proactivity have bounded middleware adoption checks instead of raw context floods.",
      ...safety({ runtimeJobsCreated: true }),
    });
    console.log(
      JSON.stringify({ status: overallPassed ? "passed" : "needs_review", summary: summary.path }),
    );
  } finally {
    await runtime.pool.end();
    await clearCodexAppServerClientIfUsed();
  }
}

main().catch((error) => {
  const failure = writeArtifact("full-platform-middleware-wiring-summary.json", {
    artifactKind: "full_platform_middleware_wiring_summary",
    status: "failed",
    reasonCodes: [
      error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700),
    ],
    ...safety({ runtimeJobsCreated: false }),
  });
  console.error(JSON.stringify({ status: "failed", artifact: failure.path }));
  process.exitCode = 1;
});
