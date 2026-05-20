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
const workItemId = "openclaw-convergence.non-codex-tool-using-worker";
const targetFile = "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts";
const testFile =
  "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts";
const validationCommandRef = `pnpm test:file ${testFile}`;
const proofTimeoutMs = Number.parseInt(
  process.env.OPENCLAW_NON_CODEX_TOOL_WORKER_PROOF_TIMEOUT_MS ?? "900000",
  10,
);
let validationAttempt = 0;
let proofTraceFieldName = "toolUsingWorkerTraceRefs";

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

function safeArtifactSegment(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function summarizeWorkerPhaseEvent(event, extra = {}) {
  return {
    artifactKind: "non_codex_tool_using_worker_progress_event",
    phase: event.phase,
    runtimeJobId: event.runtimeJobId,
    graphId: event.graphId,
    nodeId: event.nodeId,
    roleId: event.roleId,
    workerId: event.workerId,
    modelRef: event.modelRef,
    providerPath: event.providerPath,
    toolId: event.toolId,
    toolInvocationRef: event.toolInvocationRef,
    objectiveSummary: event.objectiveSummary,
    targetRefs: event.targetRefs,
    changedFileRefs: event.changedFileRefs,
    validationRefs: event.validationRefs,
    blockerSummary: event.blockerSummary,
    nextAction: event.nextAction,
    eli5Progress: event.eli5Progress,
    reasonCodes: event.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
    ...extra,
  };
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
          validationRef: `validation://non-codex-tool-using-worker/${sha256(`${commandRef}:first`).slice(0, 16)}`,
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
          !targetContent.includes(proofTraceFieldName) ||
          !testContent.includes(proofTraceFieldName)
        ) {
          return {
            validationRef: `validation://non-codex-tool-using-worker/${sha256(`${commandRef}:missing-tool-using-worker-trace-refs`).slice(0, 16)}`,
            status: "failed",
            summary: `Focused validation passed, but the fresh-run tool-using worker trace refs field ${proofTraceFieldName} was not implemented.`,
          };
        }
        return {
          validationRef: `validation://non-codex-tool-using-worker/${sha256(commandRef).slice(0, 16)}`,
          status: "passed",
          summary: `Focused validation passed after repair in ${Date.now() - started}ms.`,
        };
      } catch {
        return {
          validationRef: `validation://non-codex-tool-using-worker/${sha256(commandRef).slice(0, 16)}`,
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
  const runId = `non-codex-tool-using-worker-${Date.now()}`;
  proofTraceFieldName = `toolUsingWorkerTraceRefs${sha256(runId).slice(0, 8)}`;
  await writeJson("non-codex-tool-using-worker-preflight.json", {
    artifactKind: "non_codex_tool_using_worker_preflight",
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
        title: "Non-Codex Tool-Using Worker Context Expansion And Repair",
        description:
          "Upgrade non-Codex implementation workers with context expansion, multi-step edits, validation repair, and evidence claims.",
        metadata: { seededBy: "non_codex_tool_using_worker_proof" },
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "non_codex_tool_using_worker",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "non-codex-tool-using-worker-proof",
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
        commitmentIdsAdvanced: ["non_codex_tool_using_worker"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    if (!apiKey) {
      const blocked = await writeJson("non-codex-tool-using-worker-live-proof-summary.json", {
        artifactKind: "non_codex_tool_using_worker_live_proof_summary",
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
          reasoningMode: "none",
          maxTokens: 10_000,
        },
        "qwen/qwen3-coder-next": {
          responseFormatMode: "prompt_only",
          reasoningMode: "none",
          maxTokens: 4_000,
        },
      },
    });
    const liveValidationRunner = validationRunner();
    const workerPhaseEvents = [];
    let workerPhaseEventIndex = 0;
    const adapter = new ep.ModelAgnosticFileEditWorkerAdapter({
      runtimeToolKernel,
      toolUsingKimiWorkerLoop: new ep.NonCodexToolUsingWorkerLoop({
        runtimeToolKernel,
        async phaseSink(event) {
          workerPhaseEvents.push(event);
          workerPhaseEventIndex += 1;
          const progressEvent = summarizeWorkerPhaseEvent(event, {
            runId,
            eventIndex: workerPhaseEventIndex,
          });
          await writeJson("non-codex-tool-using-worker-live-state.json", progressEvent);
          await writeJson(
            `non-codex-tool-using-worker-state-${String(workerPhaseEventIndex).padStart(3, "0")}-${safeArtifactSegment(event.phase)}.json`,
            progressEvent,
          );
          console.log(
            JSON.stringify({
              kind: "non_codex_worker_progress",
              runId,
              eventIndex: workerPhaseEventIndex,
              phase: event.phase,
              modelRef: event.modelRef,
              toolId: event.toolId,
              nextAction: event.nextAction,
              blockerSummary: event.blockerSummary,
              eli5Progress: event.eli5Progress,
              reasonCodes: event.reasonCodes,
            }),
          );
          await runtimeJobs.recordEvent({
            jobId: job.jobId,
            eventType: "agent_team.scheduler_progress",
            data: {
              artifactKind: "agent_team_scheduler_progress",
              graphId,
              runtimeJobId: job.jobId,
              stage: "model_agnostic_worker_loop",
              status: event.phase.endsWith(".completed") ? "completed" : "running",
              roleId: event.roleId,
              nodeId,
              activeNodeKind: "implementation",
              modelRef: event.modelRef,
              providerPath: event.providerPath,
              currentObjective: event.objectiveSummary,
              currentPhase: event.phase,
              schedulerPhase: "execution_in_progress",
              schedulerToolId: event.toolId,
              schedulerToolInvocationRefs: event.toolInvocationRef ? [event.toolInvocationRef] : [],
              workerToolIds: event.toolId ? [event.toolId] : [],
              targetRefs: event.targetRefs,
              changedFileRefs: event.changedFileRefs,
              validationRefs: event.validationRefs,
              evidenceProducedRefs: event.toolInvocationRef ? [event.toolInvocationRef] : [],
              remainingOpenCommitmentIds: [],
              nextDecisionNeeded: event.nextAction,
              blockerSummary: event.blockerSummary,
              eli5Progress: event.eli5Progress,
              reasonCodes: event.reasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            },
          });
        },
        modelClient: {
          async nextTurn(input) {
            const started = Date.now();
            const result = await openRouter.callRole({
              roleId: "implementation_engineer",
              modelId: input.modelRef,
              modelCandidateId: "kimi-non-codex-tool-selection-proof",
              prompt: input.taskSummary,
              responseFormat: "json_object",
              requestProfileOverride: {
                responseFormatMode: input.responseFormatMode ?? "prompt_only",
                reasoningMode: input.reasoningMode ?? "none",
                maxTokens: Math.min(input.maxOutputTokens, 8_000),
              },
              maxTokens: Math.min(input.maxOutputTokens, 8_000),
              timeoutMs: Math.min(input.timeoutMs, 480_000),
              maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 1, 2)),
            });
            const responseHash =
              result.responseHash ?? sha256(result.errorReasonCode ?? "no_response");
            return {
              modelRunRef: `openrouter://non-codex-tool-using-worker/tool-selection/${responseHash.slice(0, 16)}`,
              responseText: result.responseText,
              responseHash,
              latencyMs: Date.now() - started,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: liveValidationRunner,
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
      taskTitle: "Add tool-using worker readiness trace fields",
      exactEditObjective: `Add ${proofTraceFieldName} to the bounded Kimi readiness helper and focused test.`,
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
          reason: `Add optional ${proofTraceFieldName} input and return field.`,
        },
        {
          path: testFile,
          symbolOrRegion: "Kimi live source-edit proof target",
          reason: `Assert the new ${proofTraceFieldName} field.`,
        },
      ],
      repoRoot: root,
      allowedFileRefs: [targetFile, testFile],
      targetFileRefs: [targetFile, testFile],
      contextPackRefs: [`runtime-work-graph://${graphId}/context/kimi-tool-using-worker`],
      validationCommandRefs: [validationCommandRef],
      targetCommitmentIds: ["non_codex_tool_using_worker"],
      acceptanceCriteria: [
        "Kimi requests repo search/read/test-inspection tools before editing.",
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
        maxTurns: 8,
        maxToolCalls: 12,
        maxAttempts: 6,
        modelPolicy: {
          controller: { modelRef: "qwen/qwen3-coder-next" },
          patch: { modelRef: "moonshotai/kimi-k2.6", reasoningMode: "none" },
          validation_repair: { modelRef: "qwen/qwen3-coder-next" },
          evidence: { modelRef: "qwen/qwen3-coder-next" },
          context_decision: { modelRef: "qwen/qwen3-coder-next" },
          escalation: { modelRef: "qwen/qwen3-coder-next" },
        },
      },
    });

    const afterTarget = await readTextIfExists(path.join(root, targetFile));
    const afterTest = await readTextIfExists(path.join(root, testFile));
    const traceRows = await traces.listInvocations({ graphId, limit: 100 });
    const toolIds = [...new Set(traceRows.map((row) => row.toolId))];
    const requiredToolIds = [
      "worker.repo.search",
      "worker.repo.read_files",
      "worker.repo.inspect_tests",
      "worker.edit.plan",
      "worker.edit.apply_patch",
      "worker.validation.run",
      "worker.validation.explain_failure",
      "worker.evidence.claim",
    ];
    const missingToolIds = requiredToolIds.filter((toolId) => !toolIds.includes(toolId));
    const toolUsed = [
      "worker.repo.search",
      "worker.repo.read_files",
      "worker.repo.inspect_tests",
    ].every((toolId) => toolIds.includes(toolId));
    const editStepCount = result.sourceResult?.editPlanSteps.length ?? 0;
    const evidenceClaimCount = result.sourceResult?.evidenceClaims.length ?? 0;
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        artifactKind: "agent_team_scheduler_progress",
        graphId,
        runtimeJobId: job.jobId,
        stage: "non_codex_tool_using_worker",
        status: result.status === "applied_change" ? "completed" : "needs_review",
        roleId: "implementation_engineer",
        nodeId,
        activeNodeKind: "implementation",
        modelRef: result.modelRef,
        providerPath: result.providerPath,
        changedFileRefs: result.changedFileRefs,
        validationRefs: result.validationRefs,
        contextRequestRefs:
          result.sourceResult?.toolResults
            ?.filter((tool) => tool.toolId.startsWith("worker.repo."))
            .map((tool) => tool.invocationRef) ?? [],
        workerToolIds: toolIds,
        editStepIds: result.sourceResult?.editPlanSteps.map((step) => step.stepId) ?? [],
        evidenceClaimRefs:
          result.sourceResult?.evidenceClaims.map((claim) => claim.evidenceRef) ?? [],
        artifactRefs: result.artifactRefs,
        reasonCodes: result.reasonCodes,
        currentObjective: "Prove Non-Codex Tool-Using Worker with Kimi lane.",
        currentPhase: "tool_using_worker_completed",
        evidenceProducedRefs: result.artifactRefs,
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.evidence.claim",
        schedulerToolInvocationRefs: result.runtimeToolInvocationRefs,
        eli5Progress:
          "Kimi used repo tools, edited scoped files, repaired after validation, and handed off evidence.",
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
      toolUsed &&
      editStepCount >= 2 &&
      evidenceClaimCount > 0;
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/non-codex-tool-using-worker`,
      closeoutHash: `sha256:${runId}:closeout`,
      accepted,
      validationRequired: true,
      validationRef: result.validationRefs.at(-1),
      sourceEditRequired: true,
      changedFileRefs: result.changedFileRefs,
      ownerReadbackRef: `artifact://execution-platform/${runId}/non-codex-tool-using-worker-readback`,
      artifactRefs: result.artifactRefs,
      reasonCodes: [
        "non_codex_tool_using_worker_live_proof_completed",
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
    await writeJson("non-codex-tool-using-worker-live-proof-readback.json", {
      artifactKind: "non_codex_tool_using_worker_live_proof_readback",
      runId,
      workItemId,
      ownerProgressReadback: readback.runtimeJobs.at(-1)?.ownerProgressReadback.activeGraphProgress,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    await writeJson("non-codex-tool-using-worker-live-proof-quality-review.json", {
      artifactKind: "non_codex_tool_using_worker_live_proof_quality_review",
      runId,
      status: accepted ? "passed" : "needs_review",
      assessment: accepted
        ? "Kimi completed a scoped tool-using worker loop with repo search/read/test inspection, validation repair, evidence claims, and runtime-tool evidence."
        : "The Non-Codex tool-using worker loop ran but did not satisfy every closeout gate.",
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      proofTraceFieldName,
      workerPhaseEventCount: workerPhaseEvents.length,
      workerPhases: workerPhaseEvents.map((event) => event.phase).slice(0, 80),
      toolResults: result.sourceResult?.toolResults ?? [],
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
      artifactKind: "non_codex_tool_using_worker_live_proof_summary",
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
      proofTraceFieldName,
      workerPhaseEventCount: workerPhaseEvents.length,
      workerPhaseEvents: workerPhaseEvents.map((event) => ({
        phase: event.phase,
        toolId: event.toolId,
        toolInvocationRef: event.toolInvocationRef,
        eli5Progress: event.eli5Progress,
        reasonCodes: event.reasonCodes,
      })),
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
    await writeJson("non-codex-tool-using-worker-live-proof-summary.json", summary);
    if (summary.status !== "passed") {
      throw new Error(`non_codex_tool_using_worker_proof_failed:${missingToolIds.join(",")}`);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.close?.();
  }
}

async function runWithProofTimeout() {
  let timeoutFired = false;
  const timer = setTimeout(
    () => {
      timeoutFired = true;
      void writeJson("non-codex-tool-using-worker-live-proof-summary.json", {
        artifactKind: "non_codex_tool_using_worker_live_proof_summary",
        status: "failed",
        errorSummary: `non_codex_tool_using_worker_proof_timeout:${proofTimeoutMs}`,
        reasonCodes: ["non_codex_tool_using_worker_proof_timeout"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawLogsStored: false,
        secretsStored: false,
      }).finally(() => {
        console.error(`non_codex_tool_using_worker_proof_timeout:${proofTimeoutMs}`);
        process.exit(1);
      });
    },
    Math.max(1, proofTimeoutMs),
  );
  timer.unref?.();
  try {
    await main();
  } finally {
    if (!timeoutFired) {
      clearTimeout(timer);
    }
  }
}

runWithProofTimeout().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeJson("non-codex-tool-using-worker-live-proof-summary.json", {
    artifactKind: "non_codex_tool_using_worker_live_proof_summary",
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
