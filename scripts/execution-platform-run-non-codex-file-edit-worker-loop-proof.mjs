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
const workItemId = "openclaw-convergence.active-queue-21";
const targetFile = "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts";
const testFile =
  "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts";
const validationCommandRef = `pnpm test:file ${testFile}`;

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

function buildKimiPrompt(input) {
  const snapshots = input.fileSnapshots
    .slice(0, 4)
    .map((snapshot) =>
      [
        `--- ${snapshot.path} sha256:${snapshot.contentHash} truncated:${snapshot.truncated ? "true" : "false"} ---`,
        snapshot.boundedContent,
      ].join("\n"),
    )
    .join("\n\n");
  return [
    "You are the Kimi implementation lane for OpenClaw's Non-Codex File-Edit Worker Loop.",
    "Return exactly one JSON object. No markdown. No explanation outside JSON.",
    "Use schemaVersion openclaw.kimi.patch-proposal.v1 and status patch_proposed.",
    "The JSON must include fileEdits, validationCommandRefs, limitations, rawPromptStored false, rawResponseStored false, rawProviderLogStored false.",
    "Make the smallest safe source edit needed by the task. Do not broaden scope.",
    `Task summary: ${input.taskSummary}`,
    `Allowed files: ${input.allowedFileRefs.join(", ")}`,
    `Validation refs: ${input.validationCommandRefs.join(", ")}`,
    input.previousFailureSummary
      ? `Previous bounded failure summary: ${input.previousFailureSummary}`
      : "",
    "Bounded target file snapshots:",
    snapshots,
    "Required edit:",
    "- In the readiness helper input type, add workerLoopTraceRef?: string.",
    "- In the returned readiness object, add workerLoopTraceRef: input.workerLoopTraceRef ?? null.",
    '- In the focused test, pass workerLoopTraceRef: "runtime-tool://worker/evidence/handoff" into buildKimiLiveSourceEditReadiness.',
    '- In the focused test expected object, assert workerLoopTraceRef: "runtime-tool://worker/evidence/handoff".',
    "- Preserve every existing readiness field and raw-storage flag.",
    "- Update the adjacent focused test to assert workerLoopTraceRef is returned.",
    "Prefer replace_text edits with exact oldText/newText copied from the snapshots above. If exact replace_text is awkward, use replace_file with the full updated file content for these two small files.",
    "Return shape:",
    "{",
    '  "schemaVersion": "openclaw.kimi.patch-proposal.v1",',
    '  "status": "patch_proposed",',
    '  "fileEdits": [{"path":"...","operation":"replace_text","oldText":"...","newText":"...","rationale":"..."}],',
    `  "validationCommandRefs": ["${validationCommandRef}"],`,
    '  "limitations": [],',
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
      const started = Date.now();
      if (commandRef !== validationCommandRef) {
        return {
          validationRef: `validation://${sha256(commandRef).slice(0, 16)}`,
          status: "not_run",
          summary: "Validation command was not in the approved proof allowlist.",
        };
      }
      try {
        await execFileAsync("pnpm", ["test:file", testFile], {
          cwd: root,
          timeout: 120_000,
          maxBuffer: 256_000,
        });
        return {
          validationRef: `validation://non-codex-file-edit-worker/${sha256(commandRef).slice(0, 16)}`,
          status: "passed",
          summary: `Focused validation passed after ${Date.now() - started}ms.`,
        };
      } catch {
        return {
          validationRef: `validation://non-codex-file-edit-worker/${sha256(commandRef).slice(0, 16)}`,
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
  const runId = `non-codex-file-edit-worker-${Date.now()}`;
  await writeJson("non-codex-file-edit-worker-loop-preflight.json", {
    artifactKind: "non_codex_file_edit_worker_loop_preflight",
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
        title:
          "Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane Hardening",
        description: "Harden non-Codex file-edit worker loops and Kimi implementation lane.",
        metadata: { seededBy: "non_codex_file_edit_worker_loop_proof" },
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "non_codex_file_edit_worker_loop",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "non-codex-file-edit-worker-loop-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });
    const graphId = `${runId}-graph`;
    const nodeId = `${runId}-kimi-implementation`;
    await runtimeWorkGraphs.createGraph({
      graphId,
      rootRuntimeJobId: job.jobId,
      workflowId: "agent_team.coding",
      parentWorkItemId: workItemId,
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
        commitmentIdsAdvanced: ["non_codex_worker_loop"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    if (!apiKey) {
      const blocked = await writeJson("non-codex-file-edit-worker-live-proof-summary.json", {
        artifactKind: "non_codex_file_edit_worker_live_proof_summary",
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
          maxTokens: 8_000,
        },
      },
    });
    const modelClient = {
      async proposeFileEdits(input) {
        const started = Date.now();
        const result = await openRouter.callRole({
          roleId: "implementation_engineer",
          modelId: input.modelRef,
          modelCandidateId: "kimi-non-codex-file-edit-worker-loop-proof",
          prompt: buildKimiPrompt(input),
          responseFormat: "json_object",
          maxTokens: input.maxOutputTokens,
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxProviderAttempts,
        });
        const responseHash = result.responseHash ?? sha256(result.errorReasonCode ?? "no_response");
        return {
          modelRunRef: `openrouter://non-codex-file-edit-worker/${responseHash.slice(0, 16)}`,
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
      taskTitle: "Add worker-loop readiness trace field",
      exactEditObjective:
        "Add workerLoopTraceRef to the bounded Kimi readiness helper and focused test.",
      rationaleForCallingThisRole:
        "The orchestrator selected Kimi because this is a two-file scoped standard edit with exact target files and focused validation.",
      downstreamConsumer: "test_engineer",
      expectedOutput:
        "Changed-file refs, validation refs, runtime-tool refs, and bounded evidence.",
      contextScoutHandoff:
        "The target helper and adjacent test are small and self-contained. Preserve raw-storage flags.",
      recommendedEditPoints: [
        {
          path: targetFile,
          symbolOrRegion: "KimiLiveSourceEditReadinessInput",
          reason: "Add optional workerLoopTraceRef input and return field.",
        },
        {
          path: testFile,
          symbolOrRegion: "Kimi live source-edit proof target",
          reason: "Assert the new workerLoopTraceRef field.",
        },
      ],
      repoRoot: root,
      allowedFileRefs: [targetFile, testFile],
      targetFileRefs: [targetFile, testFile],
      contextPackRefs: [`runtime-work-graph://${graphId}/context/kimi-worker-loop`],
      validationCommandRefs: [validationCommandRef],
      acceptanceCriteria: [
        "Kimi attempts the scoped edit first.",
        "Changed-file refs are recorded.",
        "Focused validation passes.",
        "Runtime tool invocation refs are recorded for worker-loop steps.",
      ],
      budgetPolicy: {
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        maxOutputTokens: 8_000,
        timeoutMs: 360_000,
        maxAttempts: 2,
      },
    });
    const afterTarget = await readTextIfExists(path.join(root, targetFile));
    const afterTest = await readTextIfExists(path.join(root, testFile));
    const traceRows = await traces.listInvocations({ graphId, limit: 100 });
    const toolIds = [...new Set(traceRows.map((row) => row.toolId))];
    const requiredToolIds = [
      "worker.file_context.inspect",
      "worker.file_edit.plan",
      "worker.file_edit.propose_patch",
      "worker.file_edit.apply_patch",
      "worker.validation.run",
      "worker.evidence.handoff",
    ];
    const missingToolIds = requiredToolIds.filter((toolId) => !toolIds.includes(toolId));
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        artifactKind: "agent_team_scheduler_progress",
        graphId,
        runtimeJobId: job.jobId,
        stage: "non_codex_file_edit_worker_loop",
        status: result.status === "applied_change" ? "completed" : "needs_review",
        roleId: "implementation_engineer",
        nodeId,
        activeNodeKind: "implementation",
        modelRef: result.modelRef,
        providerPath: result.providerPath,
        changedFileRefs: result.changedFileRefs,
        validationRefs: result.validationRefs,
        artifactRefs: result.artifactRefs,
        reasonCodes: result.reasonCodes,
        currentObjective: "Prove Non-Codex File-Edit Worker Loop with Kimi lane.",
        currentPhase: "worker_loop_completed",
        evidenceProducedRefs: result.artifactRefs,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.evidence.handoff",
        schedulerToolInvocationRefs: result.runtimeToolInvocationRefs,
        eli5Progress:
          "Kimi attempted a scoped code edit through the non-Codex file-edit worker loop.",
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
      missingToolIds.length === 0;
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/non-codex-file-edit-worker-loop`,
      closeoutHash: `sha256:${runId}:closeout`,
      accepted,
      validationRequired: true,
      validationRef: result.validationRefs[0],
      sourceEditRequired: true,
      changedFileRefs: result.changedFileRefs,
      ownerReadbackRef: `artifact://execution-platform/${runId}/non-codex-file-edit-worker-readback`,
      artifactRefs: result.artifactRefs,
      reasonCodes: [
        "non_codex_file_edit_worker_loop_live_proof_completed",
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
    await writeJson("non-codex-file-edit-worker-live-proof-readback.json", {
      artifactKind: "non_codex_file_edit_worker_live_proof_readback",
      runId,
      workItemId,
      ownerProgressReadback: readback.runtimeJobs.at(-1)?.ownerReadback.activeGraphProgress,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    await writeJson("non-codex-file-edit-worker-live-proof-quality-review.json", {
      artifactKind: "non_codex_file_edit_worker_live_proof_quality_review",
      runId,
      status: accepted ? "passed" : "needs_review",
      assessment: accepted
        ? "Kimi produced scoped source edits through the generic non-Codex worker loop with validation and runtime-tool evidence."
        : "The non-Codex worker loop ran but did not satisfy every closeout gate.",
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      missingToolIds,
      limitations: result.limitations,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    const summary = {
      artifactKind: "non_codex_file_edit_worker_live_proof_summary",
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
      runtimeToolInvocationRefs: result.runtimeToolInvocationRefs,
      toolIds,
      missingToolIds,
      targetBeforeHash: sha256(beforeTarget),
      targetAfterHash: sha256(afterTarget),
      testBeforeHash: sha256(beforeTest),
      testAfterHash: sha256(afterTest),
      workQueueCloseoutStatus: closeout.status,
      reasonCodes: [...new Set([...result.reasonCodes, ...closeout.reasonCodes])].slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
    await writeJson("non-codex-file-edit-worker-live-proof-summary.json", summary);
    if (summary.status !== "passed") {
      throw new Error(`non_codex_file_edit_worker_proof_failed:${missingToolIds.join(",")}`);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.close?.();
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeJson("non-codex-file-edit-worker-live-proof-summary.json", {
    artifactKind: "non_codex_file_edit_worker_live_proof_summary",
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
