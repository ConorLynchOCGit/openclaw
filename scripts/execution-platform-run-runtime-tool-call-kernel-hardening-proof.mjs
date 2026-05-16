import fs from "node:fs";
import {
  createExecutionPlatformDatabaseRuntime,
  RuntimeJobRepository,
  RuntimeToolKernel,
  RuntimeToolRegistry,
  RuntimeToolTraceRepository,
  buildRuntimeToolDefinition,
  WorkQueueRepository,
  RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP,
} from "../extensions/execution-platform/src/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_ID = "openclaw-convergence.toolification-01-runtime-tool-call-kernel";

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
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
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    `${ARTIFACT_DIR}/${name}`,
    `${JSON.stringify({ ...value, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function diagnosticTool(toolId, defaultTimeoutMs = null) {
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: "diagnostic.bounded",
    executorKey: toolId,
    schemaRef: `runtime-tool://diagnostic/${toolId}/v1`,
    authorityClass: "diagnostic",
    defaultTimeoutMs,
    enabled: true,
  });
}

async function main() {
  loadDotenvFiles();
  const runId = `runtime-tool-hardening-${Date.now()}`;
  const preflight = {
    artifactKind: "runtime_tool_call_kernel_hardening_preflight",
    status: "started",
    runId,
    requestedCapabilities: [
      "timeout_abort_enforcement",
      "explicit_cancel_invocation",
      "trace_retention_pruning",
      "cursor_pagination",
      "production_adoption_boundary_map",
    ],
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayChanged: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
  writeArtifact("runtime-tool-call-kernel-hardening-preflight.json", preflight);

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    const kernel = new RuntimeToolKernel({ registry, traces, defaultTimeoutMs: 5_000 });
    const successTool = diagnosticTool("diagnostic.runtime_tool_hardening_success");
    const timeoutTool = diagnosticTool("diagnostic.runtime_tool_hardening_timeout", 25);
    const cancelTool = diagnosticTool("diagnostic.runtime_tool_hardening_cancel");
    const pageTool = diagnosticTool("diagnostic.runtime_tool_hardening_page");
    const retentionTool = diagnosticTool("diagnostic.runtime_tool_hardening_retention");

    registry.register(successTool, {
      async execute(input) {
        return {
          status: "succeeded",
          outputRef: `artifact://execution-platform/${runId}/success`,
          outputHash: `sha256:${runId}:success`,
          outputSummary: "Bounded diagnostic success invocation completed.",
          reasonCodes: ["runtime_tool_hardening_success"],
          metadata: { runId, inputRef: input.inputRef ?? null },
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    });
    registry.register(timeoutTool, {
      async execute(input) {
        await new Promise((resolve) => {
          input.abortSignal?.addEventListener("abort", resolve, { once: true });
        });
        await delay(200);
        return {
          status: "succeeded",
          outputSummary: "Late timeout result should be ignored.",
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    });
    let cancelStarted;
    const cancelStartedPromise = new Promise((resolve) => {
      cancelStarted = resolve;
    });
    registry.register(cancelTool, {
      async execute(input) {
        cancelStarted();
        await new Promise((resolve) => {
          input.abortSignal?.addEventListener("abort", resolve, { once: true });
        });
        await delay(200);
        return {
          status: "succeeded",
          outputSummary: "Late cancel result should be ignored.",
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    });
    registry.register(pageTool, {
      async execute(input) {
        return {
          status: "succeeded",
          outputSummary: `Bounded page invocation ${input.idempotencyKey}.`,
          reasonCodes: ["runtime_tool_page_probe_completed"],
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    });
    registry.register(retentionTool, {
      async execute(input) {
        return {
          status: "succeeded",
          outputSummary: `Bounded retention invocation ${input.idempotencyKey}.`,
          reasonCodes: ["runtime_tool_retention_probe_completed"],
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    });

    const success = await kernel.invoke({
      toolId: successTool.toolId,
      idempotencyScope: runId,
      idempotencyKey: "success",
      inputRef: `artifact://execution-platform/${runId}/success-input`,
      inputHash: `sha256:${runId}:success-input`,
      inputSummary: "Invoke success diagnostic with bounded refs.",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const timeout = await kernel.invoke({
      toolId: timeoutTool.toolId,
      idempotencyScope: runId,
      idempotencyKey: "timeout",
      inputSummary: "Invoke timeout diagnostic with a 25ms budget.",
      budget: { timeoutMs: 25, metadata: { runId } },
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const cancelInvocationId = `${runId}-cancel`;
    const cancelRun = kernel.invoke({
      invocationId: cancelInvocationId,
      toolId: cancelTool.toolId,
      idempotencyScope: runId,
      idempotencyKey: "cancel",
      inputSummary: "Invoke cancel diagnostic and cancel it while active.",
      budget: { timeoutMs: 5_000, metadata: { runId } },
      rawPromptStored: false,
      rawResponseStored: false,
    });
    await cancelStartedPromise;
    const canceled = await kernel.cancelInvocation({
      invocationId: cancelInvocationId,
      canceledByRef: "system:runtime-tool-hardening-proof",
      cancelSummary: "Proof canceled an active diagnostic invocation.",
      reasonCodes: ["runtime_tool_hardening_cancel_probe"],
      metadata: { runId },
    });
    const cancelResult = await cancelRun;
    for (const key of ["page-1", "page-2", "page-3"]) {
      await kernel.invoke({
        toolId: pageTool.toolId,
        idempotencyScope: runId,
        idempotencyKey: key,
        inputSummary: `Invoke pagination diagnostic ${key}.`,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }
    const firstPage = await traces.listInvocationsPage({ toolId: pageTool.toolId, limit: 2 });
    const secondPage = await traces.listInvocationsPage({
      toolId: pageTool.toolId,
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    const oldTraces = new RuntimeToolTraceRepository(
      runtime.sqlClient,
      () => new Date("2026-05-01T00:00:00.000Z"),
    );
    const oldKernel = new RuntimeToolKernel({ registry, traces: oldTraces });
    for (const key of ["retention-old-1", "retention-old-2", "retention-old-3"]) {
      await oldKernel.invoke({
        toolId: retentionTool.toolId,
        idempotencyScope: runId,
        idempotencyKey: key,
        inputSummary: `Invoke old retention diagnostic ${key}.`,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }
    const dryRunRetention = await traces.pruneInvocations({
      dryRun: true,
      maxAgeDays: 7,
      idempotencyScopePrefix: runId,
      toolIdPrefix: retentionTool.toolId,
    });
    const prunedRetention = await traces.pruneInvocations({
      dryRun: false,
      maxAgeDays: 7,
      idempotencyScopePrefix: runId,
      toolIdPrefix: retentionTool.toolId,
    });

    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const workItem = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
    let workQueueAttachment = null;
    if (workItem) {
      workQueueAttachment = await workQueue.attachArtifactReference({
        workItemId: WORK_ITEM_ID,
        artifactType: "execution_platform.runtime_tool_call_kernel_hardening",
        storageKind: "artifact",
        uri: ".artifacts/execution-platform/runtime-tool-call-kernel-hardening-summary.json",
        contentType: "application/json",
        metadata: {
          runId,
          attachedToClosedKernelItem: true,
          nextActiveQueueItemUnchanged: "Cost-Aware Capability Policy",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      });
    }

    const summary = {
      artifactKind: "runtime_tool_call_kernel_hardening_summary",
      status:
        success.invocation.status === "succeeded" &&
        timeout.invocation.status === "failed" &&
        canceled.status === "canceled" &&
        cancelResult.invocation.status === "canceled" &&
        firstPage.items.length === 2 &&
        secondPage.items.length >= 1 &&
        dryRunRetention.candidateCount >= 1 &&
        prunedRetention.prunedCount >= 1
          ? "passed"
          : "needs_review",
      runId,
      database: {
        source: runtime.resolution.source,
        databaseName: runtime.resolution.databaseName,
        reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
        explicitlyApprovedSharedRuntimeDatabase:
          runtime.resolution.explicitlyApprovedSharedRuntimeDatabase ?? false,
      },
      timeoutAbort: {
        invocationId: timeout.invocation.invocationId,
        status: timeout.invocation.status,
        reasonCodes: timeout.reasonCodes,
      },
      explicitCancel: {
        invocationId: canceled.invocationId,
        cancelApiStatus: canceled.status,
        invokeReturnStatus: cancelResult.invocation.status,
        reasonCodes: canceled.reasonCodes,
      },
      cursorPagination: {
        firstPageCount: firstPage.items.length,
        secondPageCount: secondPage.items.length,
        firstPageHasMore: firstPage.hasMore,
        nextCursorPresent: Boolean(firstPage.nextCursor),
      },
      retention: {
        dryRun: dryRunRetention,
        pruned: prunedRetention,
      },
      adoptionBoundaryMap: RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP,
      workQueueAttachment: workQueueAttachment
        ? {
            artifactId: workQueueAttachment.artifactId,
            workItemId: WORK_ITEM_ID,
          }
        : {
            status: "work_item_not_found",
            workItemId: WORK_ITEM_ID,
          },
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      authorityGranted: false,
      controlsApplied: true,
      modelPromotionPerformed: false,
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayChanged: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    };
    writeArtifact("runtime-tool-call-kernel-hardening-summary.json", summary);
    writeArtifact("runtime-tool-call-kernel-hardening-live-proof.json", {
      artifactKind: "runtime_tool_call_kernel_hardening_live_proof",
      status: summary.status,
      runId,
      invocationRefs: [
        success.invocationRef,
        timeout.invocationRef,
        `runtime-tool://${canceled.invocationId}`,
      ],
      reasonCodes:
        summary.status === "passed"
          ? ["runtime_tool_call_kernel_hardening_passed"]
          : ["runtime_tool_call_kernel_hardening_needs_review"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
  } catch (error) {
    writeArtifact("runtime-tool-call-kernel-hardening-summary.json", {
      artifactKind: "runtime_tool_call_kernel_hardening_summary",
      status: "failed",
      runId,
      errorSummary:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      reasonCodes: ["runtime_tool_call_kernel_hardening_failed"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    throw error;
  } finally {
    await runtime?.pool.end();
  }
}

await main();
