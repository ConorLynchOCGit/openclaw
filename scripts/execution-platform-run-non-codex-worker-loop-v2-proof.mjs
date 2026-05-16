#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.non-codex-worker-loop-v2";
const targetFile = "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts";
const testFile =
  "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts";
const validationCommandRef = `pnpm test:file ${testFile}`;
let validationAttempt = 0;

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(path.join(artifactRoot, name), body, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
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
      }
    }
  }
}

function boundedSnapshots(input) {
  return input.fileSnapshots
    .slice(0, 4)
    .map((snapshot) =>
      [
        `--- ${snapshot.path} sha256:${snapshot.contentHash} truncated:${snapshot.truncated ? "true" : "false"} ---`,
        snapshot.boundedContent,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildKimiPrompt(input) {
  const hasExpandedContext = input.expandedContextRefs.length > 0;
  const failureSummary = input.previousFailureSummary
    ? `Previous bounded failure summary: ${input.previousFailureSummary}`
    : "";
  return [
    "You are the Kimi implementation lane for OpenClaw's Non-Codex File-Edit Worker Loop v2.",
    "Return exactly one JSON object. No markdown. No explanation outside JSON.",
    "Use schemaVersion openclaw.kimi.patch-proposal.v1.",
    "Storage flags must be false. Do not store raw prompts, raw responses, or raw provider logs.",
    `Attempt: ${input.attempt}`,
    `Expanded context refs: ${input.expandedContextRefs.join(", ") || "none"}`,
    failureSummary,
    "Bounded target file snapshots:",
    boundedSnapshots(input),
    !hasExpandedContext
      ? [
          "First, prove the context expansion path. Return status needs_review with one contextRequests entry before editing.",
          `Request ${testFile} so the worker loop can provide bounded test context.`,
          "Do not include fileEdits until expanded context refs are present.",
        ].join("\n")
      : [
          "Now apply the scoped two-step edit.",
          "Step 1: in the readiness input type, add workerLoopV2TraceRefs?: string[].",
          "Step 2: in the returned readiness object, add workerLoopV2TraceRefs: input.workerLoopV2TraceRefs ?? [].",
          "Step 3: in the focused test, pass workerLoopV2TraceRefs with two runtime-tool refs and assert the same array in the expected object.",
          "Include editSteps for production helper and test update.",
          "Include evidenceClaims for commitment non_codex_worker_loop_v2.",
          "Prefer replace_text edits copied exactly from snapshots. Whole-file replacement is allowed for these small files if safer.",
        ].join("\n"),
    "Return shape:",
    "{",
    '  "schemaVersion": "openclaw.kimi.patch-proposal.v1",',
    '  "status": "patch_proposed" | "needs_review",',
    '  "contextRequests": [{"requestId":"context-1","requestedFileRefs":["..."],"reason":"...","commitmentIds":["non_codex_worker_loop_v2"]}],',
    '  "editSteps": [{"stepId":"step-1","objective":"...","targetFileRefs":["..."],"validationExpectation":"...","rollbackBoundary":"step","commitmentIdsAdvanced":["non_codex_worker_loop_v2"]}],',
    '  "fileEdits": [{"path":"...","operation":"replace_text","oldText":"...","newText":"...","rationale":"..."}],',
    `  "validationCommandRefs": ["${validationCommandRef}"],`,
    '  "limitations": [],',
    '  "evidenceClaims": [{"commitmentId":"non_codex_worker_loop_v2","evidenceRef":"runtime-work-graph://kimi/evidence/non-codex-worker-loop-v2","claimSummary":"...","changedFileRefs":["..."],"validationRefs":["validation://pending"],"limitations":[],"confidence":"medium","rawPromptStored":false,"rawResponseStored":false}],',
    '  "rawPromptStored": false,',
    '  "rawResponseStored": false,',
    '  "rawProviderLogStored": false',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

function validationRunner() {
  return {
    async run(commandRef) {
      validationAttempt += 1;
      const started = Date.now();
      if (commandRef !== validationCommandRef) {
        return {
          validationRef: `validation://${sha256(commandRef).slice(0, 16)}`,
          status: "not_run",
          summary: "Validation command was not in the approved proof allowlist.",
        };
      }
      if (validationAttempt === 1) {
        return {
          validationRef: `validation://non-codex-worker-loop-v2/${sha256(`${commandRef}:first`).slice(0, 16)}`,
          status: "failed",
          summary:
            "Controlled first validation failure to prove repair/rollback inside the same worker loop.",
        };
      }
      try {
        await execFileAsync("pnpm", ["test:file", testFile], {
          cwd: root,
          timeout: 120_000,
          maxBuffer: 256_000,
        });
        const [targetContent, testContent] = await Promise.all([
          readTextIfExists(path.join(root, targetFile)),
          readTextIfExists(path.join(root, testFile)),
        ]);
        if (
          !targetContent.includes("workerLoopV2TraceRefs") ||
          !testContent.includes("workerLoopV2TraceRefs")
        ) {
          return {
            validationRef: `validation://non-codex-worker-loop-v2/${sha256(`${commandRef}:missing-worker-loop-v2-trace-refs`).slice(0, 16)}`,
            status: "failed",
            summary:
              "Focused validation passed, but the worker-loop v2 trace refs field was not implemented with the required plural API.",
          };
        }
        return {
          validationRef: `validation://non-codex-worker-loop-v2/${sha256(commandRef).slice(0, 16)}`,
          status: "passed",
          summary: `Focused validation passed after repair in ${Date.now() - started}ms.`,
        };
      } catch {
        return {
          validationRef: `validation://non-codex-worker-loop-v2/${sha256(commandRef).slice(0, 16)}`,
          status: "failed",
          summary: `Focused validation failed after ${Date.now() - started}ms.`,
        };
      }
    },
  };
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const runId = `non-codex-worker-loop-v2-${Date.now()}`;
  await writeJson("non-codex-worker-loop-v2-preflight.json", {
    artifactKind: "non_codex_worker_loop_v2_preflight",
    runId,
    workItemId,
    openRouterConfigured: Boolean(apiKey),
    targetFile,
    testFile,
    validationCommandRef,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
  });

  const ep = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await ep.createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  try {
    const runtimeJobs = new ep.RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const runtimeWorkGraphs = new ep.RuntimeWorkGraphRepository(runtime.sqlClient);
    const workQueueEvents = new ep.WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new ep.WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const traces = new ep.RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new ep.RuntimeToolRegistry();
    ep.registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const runtimeToolKernel = new ep.RuntimeToolKernel({ registry, traces });

    if (!(await workQueue.readWorkItemTruth(workItemId))) {
      await workQueue.createWorkItem({
        workItemId,
        itemType: "implementation_slice",
        title: "Non-Codex Worker Loop v2 Context Expansion And Repair",
        description:
          "Upgrade non-Codex implementation workers with context expansion, multi-step edits, validation repair, and evidence claims.",
        metadata: { seededBy: "non_codex_worker_loop_v2_proof" },
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "non_codex_worker_loop_v2",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "non-codex-worker-loop-v2-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });
    const graphId = `${runId}-graph`;
    const nodeId = `${runId}-kimi-implementation`;
    await runtimeWorkGraphs.createGraph({
      graphId,
      rootRuntimeJobId: job.jobId,
      parentWorkItemId: workItemId,
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    await runtimeWorkGraphs.addNode({
      graphId,
      nodeId,
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "worker.kimi.file-implementation",
      nodeStatus: "running",
      metadata: {
        capabilityId: "implementation_microtask",
        targetRefs: [targetFile, testFile],
        commitmentIdsAdvanced: ["non_codex_worker_loop_v2"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    if (!apiKey) {
      const blocked = await writeJson("non-codex-worker-loop-v2-live-proof-summary.json", {
        artifactKind: "non_codex_worker_loop_v2_live_proof_summary",
        runId,
        workItemId,
        status: "needs_review",
        reasonCodes: ["openrouter_api_key_not_resolved_from_config_or_auth_registry"],
        runtimeJobId: job.jobId,
        graphId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      console.log(JSON.stringify({ status: "needs_review", proofRef: blocked.path }, null, 2));
      return;
    }

    const openRouter = new ep.OpenRouterAgentTeamModelClient({
      apiKey,
      retryPolicy: { maxAttempts: 2, timeoutMs: 360_000 },
      requestProfilesByModelId: {
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 10_000,
        },
      },
    });
    const modelClient = {
      async proposeFileEdits(input) {
        const started = Date.now();
        const result = await openRouter.callRole({
          roleId: "implementation_engineer",
          modelId: input.modelRef,
          modelCandidateId: "kimi-non-codex-worker-loop-v2-proof",
          prompt: buildKimiPrompt(input),
          responseFormat: "json_object",
          maxTokens: input.maxOutputTokens,
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxProviderAttempts,
        });
        const responseHash = result.responseHash ?? sha256(result.errorReasonCode ?? "no_response");
        return {
          modelRunRef: `openrouter://non-codex-worker-loop-v2/${responseHash.slice(0, 16)}`,
          responseText: result.responseText,
          responseHash,
          latencyMs: Date.now() - started,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    };

    const adapter = new ep.ModelAgnosticFileEditWorkerAdapter({
      runtimeToolKernel,
      kimiExecutor: new ep.KimiMicrotaskImplementationExecutor({
        adapter: new ep.KimiFileImplementationAdapter({
          modelClient,
          validationRunner: validationRunner(),
        }),
      }),
    });

    const beforeTarget = await readTextIfExists(path.join(root, targetFile));
    const beforeTest = await readTextIfExists(path.join(root, testFile));
    const result = await adapter.run({
      runtimeJobId: job.jobId,
      graphId,
      nodeId,
      workerKind: "kimi_standard_implementation",
      workerId: "worker.kimi.file-implementation",
      roleId: "implementation_engineer",
      taskId: `${runId}-task`,
      taskTitle: "Add worker-loop v2 readiness trace fields",
      exactEditObjective:
        "Add workerLoopV2TraceRefs to the bounded Kimi readiness helper and focused test.",
      rationaleForCallingThisRole:
        "The orchestrator selected Kimi because this is a scoped multi-step edit with bounded snapshots, context expansion, validation repair, and focused validation.",
      downstreamConsumer: "mission_ledger_evidence_claims",
      expectedOutput:
        "Changed-file refs, validation refs, runtime-tool refs, context expansion evidence, edit steps, and commitment-linked evidence claims.",
      contextScoutHandoff:
        "The target helper and adjacent test are small and self-contained. Preserve raw-storage flags.",
      recommendedEditPoints: [
        {
          path: targetFile,
          symbolOrRegion: "KimiLiveSourceEditReadinessInput",
          reason: "Add optional workerLoopV2TraceRefs input and return field.",
        },
        {
          path: testFile,
          symbolOrRegion: "Kimi live source-edit proof target",
          reason: "Assert the new workerLoopV2TraceRefs field.",
        },
      ],
      repoRoot: root,
      allowedFileRefs: [targetFile, testFile],
      targetFileRefs: [targetFile, testFile],
      contextPackRefs: [`runtime-work-graph://${graphId}/context/kimi-worker-loop-v2`],
      validationCommandRefs: [validationCommandRef],
      targetCommitmentIds: ["non_codex_worker_loop_v2"],
      contextExpansion: {
        async provider(request) {
          return {
            providedContextRefs: request.requestedFileRefs.map(
              (fileRef) => `context-pack://${runId}/${sha256(fileRef).slice(0, 12)}`,
            ),
          };
        },
      },
      acceptanceCriteria: [
        "Kimi requests bounded context before editing.",
        "Kimi performs ordered edit steps.",
        "A controlled validation failure repairs in the same worker loop.",
        "Changed-file refs are recorded.",
        "Focused validation passes.",
        "Commitment-linked evidence claims are emitted.",
        "Runtime tool invocation refs are recorded for worker-loop steps.",
      ],
      budgetPolicy: {
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        maxOutputTokens: 10_000,
        timeoutMs: 480_000,
        maxAttempts: 6,
      },
    });

    const afterTarget = await readTextIfExists(path.join(root, targetFile));
    const afterTest = await readTextIfExists(path.join(root, testFile));
    const traceRows = await traces.listInvocations({ graphId, limit: 100 });
    const toolIds = [...new Set(traceRows.map((row) => row.toolId))];
    const requiredToolIds = [
      "worker.context.request_more",
      "worker.context.provide_bounded_snapshot",
      "worker.file_context.inspect",
      "worker.file_edit.plan",
      "worker.file_edit.propose_patch",
      "worker.file_edit.apply_patch",
      "worker.validation.run",
      "worker.file_edit.repair",
      "worker.evidence.handoff",
    ];
    const missingToolIds = requiredToolIds.filter((toolId) => !toolIds.includes(toolId));
    const contextProvided = result.sourceResult?.contextExpansionRequests.some(
      (request) => request.status === "provided",
    );
    const editStepCount = result.sourceResult?.editPlanSteps.length ?? 0;
    const evidenceClaimCount = result.sourceResult?.evidenceClaims.length ?? 0;
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        artifactKind: "agent_team_scheduler_progress",
        graphId,
        runtimeJobId: job.jobId,
        stage: "non_codex_worker_loop_v2",
        status: result.status === "applied_change" ? "completed" : "needs_review",
        roleId: "implementation_engineer",
        nodeId,
        activeNodeKind: "implementation",
        modelRef: result.modelRef,
        providerPath: result.providerPath,
        changedFileRefs: result.changedFileRefs,
        validationRefs: result.validationRefs,
        contextRequestRefs:
          result.sourceResult?.contextExpansionRequests.map(
            (request) => `context-request://${request.requestId}`,
          ) ?? [],
        editStepIds: result.sourceResult?.editPlanSteps.map((step) => step.stepId) ?? [],
        evidenceClaimRefs:
          result.sourceResult?.evidenceClaims.map((claim) => claim.evidenceRef) ?? [],
        artifactRefs: result.artifactRefs,
        reasonCodes: result.reasonCodes,
        currentObjective: "Prove Non-Codex Worker Loop v2 with Kimi lane.",
        currentPhase: "worker_loop_v2_completed",
        evidenceProducedRefs: result.artifactRefs,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.evidence.handoff",
        schedulerToolInvocationRefs: result.runtimeToolInvocationRefs,
        eli5Progress:
          "Kimi requested bounded context, edited scoped files, repaired after validation, and handed off evidence.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    const accepted =
      result.status === "applied_change" &&
      result.changedFileRefs.length > 0 &&
      result.validationRefs.length > 0 &&
      missingToolIds.length === 0 &&
      contextProvided === true &&
      editStepCount >= 2 &&
      evidenceClaimCount > 0;
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/non-codex-worker-loop-v2`,
      closeoutHash: `sha256:${runId}:closeout`,
      accepted,
      validationRequired: true,
      validationRef: result.validationRefs.at(-1),
      sourceEditRequired: true,
      changedFileRefs: result.changedFileRefs,
      ownerReadbackRef: `artifact://execution-platform/${runId}/non-codex-worker-loop-v2-readback`,
      artifactRefs: result.artifactRefs,
      reasonCodes: [
        "non_codex_worker_loop_v2_live_proof_completed",
        ...result.reasonCodes.slice(0, 20),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const readback = await ep.buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });
    await writeJson("non-codex-worker-loop-v2-live-proof-readback.json", {
      artifactKind: "non_codex_worker_loop_v2_live_proof_readback",
      runId,
      workItemId,
      ownerProgressReadback: readback.runtimeJobs.at(-1)?.ownerProgressReadback.activeGraphProgress,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    await writeJson("non-codex-worker-loop-v2-live-proof-quality-review.json", {
      artifactKind: "non_codex_worker_loop_v2_live_proof_quality_review",
      runId,
      status: accepted ? "passed" : "needs_review",
      assessment: accepted
        ? "Kimi completed a scoped multi-step worker loop with context expansion, validation repair, evidence claims, and runtime-tool evidence."
        : "The non-Codex worker loop v2 ran but did not satisfy every closeout gate.",
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      contextExpansionRequests: result.sourceResult?.contextExpansionRequests ?? [],
      editPlanSteps: result.sourceResult?.editPlanSteps ?? [],
      evidenceClaims: result.sourceResult?.evidenceClaims ?? [],
      missingToolIds,
      limitations: result.limitations,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    const summary = {
      artifactKind: "non_codex_worker_loop_v2_live_proof_summary",
      runId,
      workItemId,
      status: accepted && closeout.status === "closed" ? "passed" : "needs_review",
      runtimeJobId: job.jobId,
      graphId,
      nodeId,
      modelRef: result.modelRef,
      providerPath: result.providerPath,
      modelRunRef: result.modelRunRef,
      workerStatus: result.status,
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      contextExpansionRequests: result.sourceResult?.contextExpansionRequests ?? [],
      editPlanSteps: result.sourceResult?.editPlanSteps ?? [],
      evidenceClaims: result.sourceResult?.evidenceClaims ?? [],
      runtimeToolInvocationRefs: result.runtimeToolInvocationRefs,
      toolIds,
      missingToolIds,
      targetBeforeHash: sha256(beforeTarget),
      targetAfterHash: sha256(afterTarget),
      testBeforeHash: sha256(beforeTest),
      testAfterHash: sha256(afterTest),
      workQueueCloseoutStatus: closeout.status,
      reasonCodes: [...new Set([...result.reasonCodes, ...closeout.reasonCodes])].slice(0, 100),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
    await writeJson("non-codex-worker-loop-v2-live-proof-summary.json", summary);
    if (summary.status !== "passed") {
      throw new Error(`non_codex_worker_loop_v2_proof_failed:${missingToolIds.join(",")}`);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.close?.();
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeJson("non-codex-worker-loop-v2-live-proof-summary.json", {
    artifactKind: "non_codex_worker_loop_v2_live_proof_summary",
    status: "failed",
    errorSummary: message.slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
