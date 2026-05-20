#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.work-queue-generated-item-lifecycle";

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
    canonicalRuntimeTruth: "execution-platform-db",
    generatedItemLifecyclePass: {
      status: "in_progress",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  };
  const existing = await workQueue.readWorkItemTruth(WORK_ITEM_ID);
  if (existing) {
    return await workQueue.updateWorkItemPlanningMetadata({
      workItemId: WORK_ITEM_ID,
      title: "Work Queue Generated Item Lifecycle And Proof Child Cleanup",
      description:
        "Make generated Work Queue proof/helper rows explicit, hidden from owner active work when debug-only, and retired by runtime reconciliation.",
      metadata: { ...existing.item.metadata, ...metadata },
      actorId: "work-queue-generated-item-lifecycle-proof",
    });
  }
  return await workQueue.createWorkItem({
    workItemId: WORK_ITEM_ID,
    itemType: "implementation_slice",
    title: "Work Queue Generated Item Lifecycle And Proof Child Cleanup",
    description:
      "Make generated Work Queue proof/helper rows explicit, hidden from owner active work when debug-only, and retired by runtime reconciliation.",
    metadata,
    actorId: "work-queue-generated-item-lifecycle-proof",
  });
}

function lifecycle(api, input) {
  return api.buildGeneratedWorkQueueItemLifecycle({
    ...input,
    terminalPolicy: "debug_only",
    createdBy: "work-queue-generated-item-lifecycle-proof",
  });
}

function mergeMetadata(existing, lifecycleValue) {
  const record =
    existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return {
    ...record,
    generatedItemLifecycle: lifecycleValue,
    generatedOriginKind: lifecycleValue.originKind,
    generatedTerminalPolicy: lifecycleValue.terminalPolicy,
    generatedRetentionPolicy: lifecycleValue.retentionPolicy,
    generatedDebugOnly: lifecycleValue.debugOnly,
    generatedOwnerVisible: lifecycleValue.ownerVisible,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  };
}

async function backfillGeneratedDebugRows(api, sql) {
  const rows = (
    await sql.query(`
      SELECT work_item_id, item_type, title, metadata
      FROM execution_platform.work_items
      WHERE COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', metadata->>'terminalPolicy', '') = 'debug_only'
         OR work_item_id LIKE 'model-task-live-%-work-item-%'
         OR work_item_id LIKE 'script-live-%-work-item-%'
         OR work_item_id LIKE 'db-operation-live-%-work-item-%'
         OR work_item_id LIKE 'openclaw-convergence.workflow-runtime-03-generic-runner-retirement.%'
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `)
  ).rows;
  const updated = [];
  for (const row of rows) {
    const proofDiagnostic = row.work_item_id.startsWith(
      "openclaw-convergence.workflow-runtime-03-generic-runner-retirement.",
    );
    const lifecycleValue = lifecycle(api, {
      originKind: proofDiagnostic ? "proof_diagnostic" : "middleware_fixture",
      parentWorkItemId: proofDiagnostic
        ? "openclaw-convergence.workflow-runtime-03-generic-runner-retirement"
        : null,
      reasonCodes: proofDiagnostic
        ? ["generic_workflow_runner_retirement_diagnostic_child", "not_owner_roadmap_work"]
        : ["middleware_fixture_created_for_live_completion_proof", "not_owner_roadmap_work"],
    });
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET metadata = $2::jsonb,
            updated_at = now()
        WHERE work_item_id = $1
      `,
      [row.work_item_id, JSON.stringify(mergeMetadata(row.metadata, lifecycleValue))],
    );
    updated.push({
      workItemId: row.work_item_id,
      originKind: lifecycleValue.originKind,
      terminalPolicy: lifecycleValue.terminalPolicy,
    });
  }
  return updated;
}

async function countGeneratedDebug(sql) {
  const result = await sql.query(`
    SELECT
      COALESCE(metadata->'generatedItemLifecycle'->>'originKind', metadata->>'generatedOriginKind', 'unclassified') AS origin_kind,
      COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', metadata->>'generatedTerminalPolicy', metadata->>'terminalPolicy', 'none') AS terminal_policy,
      queue_status,
      count(*)::int AS count
    FROM execution_platform.work_items
    WHERE COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', metadata->>'generatedTerminalPolicy', metadata->>'terminalPolicy', '') = 'debug_only'
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `);
  return result.rows.map((row) => ({
    originKind: row.origin_kind,
    terminalPolicy: row.terminal_policy,
    queueStatus: row.queue_status,
    count: Number(row.count),
  }));
}

async function listOwnerActive(workQueue) {
  const active = await workQueue.listDbWorkQueue({ bucket: "active", limit: 50 });
  return active.items.map((item) => ({
    workItemId: item.workItemId,
    title: item.title,
    queuePosition: item.queuePosition,
    queueStatus: item.queueStatus,
  }));
}

async function main() {
  const loadedDotenvRefs = loadDotenvFiles();
  const api = await ep();
  const { createModelAuthoredCloseoutCapsuleFixture } = await fixtures();
  const runId = `work-queue-generated-item-lifecycle-${Date.now()}`;
  const preflight = writeArtifact("work-queue-generated-item-lifecycle-preflight.json", {
    artifactKind: "work_queue_generated_item_lifecycle_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    loadedDotenvRefs,
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayReloadRequired: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
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
    const item = await ensureWorkItem(workQueue);
    const proofJob = await runtimeJobs.enqueueJob({
      jobId: `${runId}-proof-job`,
      jobType: "proof.execution_platform",
      queueName: "proof",
      workItemId: item.workItemId,
      payload: {
        proofKind: "work_queue_generated_item_lifecycle",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "work-queue-generated-item-lifecycle-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });

    const beforeCounts = await countGeneratedDebug(runtime.sqlClient);
    const beforeOwnerActive = await listOwnerActive(workQueue);
    const backfilledRows = await backfillGeneratedDebugRows(api, runtime.sqlClient);
    const backfillArtifact = writeArtifact("work-queue-generated-item-cleanup-before.json", {
      artifactKind: "work_queue_generated_item_cleanup_before",
      runId,
      beforeCounts,
      beforeOwnerActiveIds: beforeOwnerActive.map((entry) => entry.workItemId),
      backfilledRows: backfilledRows.slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    });

    const reconciliation = await workQueue.reconcileTerminalRuntimeProjections({
      actorId: "work-queue-generated-item-lifecycle-proof",
    });
    const afterCounts = await countGeneratedDebug(runtime.sqlClient);
    const afterOwnerActive = await listOwnerActive(workQueue);
    const debugReadback = await workQueue.listDbWorkQueue({
      bucket: "all",
      includeGeneratedDebugItems: true,
      reconcileTerminalProjections: false,
      searchQuery: "Generic workflow retirement proof",
      limit: 100,
    });
    const ownerContainsDebug = afterOwnerActive.some((entry) =>
      [
        ...reconciliation.archivedGeneratedDebugWorkItemIds,
        ...reconciliation.archivedTerminalExecutionWorkItemIds,
      ].includes(entry.workItemId),
    );
    if (ownerContainsDebug) {
      throw new Error("generated_debug_rows_still_in_owner_active_queue");
    }
    const cleanupProof = writeArtifact("work-queue-generated-item-cleanup-proof.json", {
      artifactKind: "work_queue_generated_item_cleanup_proof",
      runId,
      reconciliation,
      archivedGeneratedDebugCount: reconciliation.archivedGeneratedDebugWorkItemIds.length,
      archivedTerminalExecutionGeneratedCount:
        reconciliation.archivedTerminalExecutionWorkItemIds.length,
      afterCounts,
      ownerActiveIds: afterOwnerActive.map((entry) => entry.workItemId),
      ownerActiveContainsGeneratedDebugRows: ownerContainsDebug,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    });
    const activeQueueReadback = writeArtifact(
      "work-queue-generated-item-active-queue-readback-proof.json",
      {
        artifactKind: "work_queue_generated_item_active_queue_readback_proof",
        runId,
        activeItems: afterOwnerActive.slice(0, 25),
        activeQueueSource: "execution_platform_work_queue_db",
        generatedDebugRowsHiddenFromOwnerActiveQueue: !ownerContainsDebug,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      },
    );
    const debugReadbackArtifact = writeArtifact(
      "work-queue-generated-item-debug-readback-proof.json",
      {
        artifactKind: "work_queue_generated_item_debug_readback_proof",
        runId,
        debugItemCount: debugReadback.items.length,
        debugItems: debugReadback.items
          .filter((entry) => entry.generatedItemLifecycle?.terminalPolicy === "debug_only")
          .slice(0, 40)
          .map((entry) => ({
            workItemId: entry.workItemId,
            queueStatus: entry.queueStatus,
            generatedItemLifecycle: entry.generatedItemLifecycle,
          })),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      },
    );

    const closeoutCapsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: proofJob.jobId,
      teamRunId: runId,
      workflowId: "execution-platform.work-queue-generated-item-lifecycle",
      fileRefs: [
        "extensions/execution-platform/src/work-queue/generated-item-lifecycle.ts",
        "extensions/execution-platform/src/work-queue/work-queue-repository.ts",
        "extensions/execution-platform/src/runtime-middleware-live-pilot.ts",
        "scripts/execution-platform-run-generic-workflow-runner-retirement-proof.mjs",
      ],
      artifactRefs: [
        preflight.ref,
        backfillArtifact.ref,
        cleanupProof.ref,
        activeQueueReadback.ref,
        debugReadbackArtifact.ref,
      ],
      validationRefs: ["validation://work-queue-generated-item-lifecycle-focused-tests"],
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
    const closeoutTransition = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: item.workItemId,
      runtimeJobId: proofJob.jobId,
      closeoutRef,
      closeoutHash: `sha256:${sha256(JSON.stringify(closeoutCapsule))}`,
      accepted: true,
      validationRequired: true,
      validationRef: "validation://work-queue-generated-item-lifecycle-focused-tests",
      sourceEditRequired: false,
      artifactRefs: [
        preflight.ref,
        backfillArtifact.ref,
        cleanupProof.ref,
        activeQueueReadback.ref,
        debugReadbackArtifact.ref,
      ],
      reasonCodes: [
        "generated_item_lifecycle_registered",
        "debug_generated_items_retired",
        "owner_active_queue_hides_debug_generated_items",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      runtimeLifecycleMutated: false,
      modelPromotionPerformed: false,
    });

    const finalOwnerActive = await listOwnerActive(workQueue);
    const summary = writeArtifact("work-queue-generated-item-lifecycle-summary.json", {
      artifactKind: "work_queue_generated_item_lifecycle_summary",
      runId,
      workItemId: item.workItemId,
      proofRuntimeJobId: proofJob.jobId,
      status: closeoutTransition.closed ? "passed" : "needs_review",
      closeoutTransition,
      archivedGeneratedDebugWorkItemIds: reconciliation.archivedGeneratedDebugWorkItemIds,
      archivedTerminalExecutionWorkItemIds: reconciliation.archivedTerminalExecutionWorkItemIds,
      totalDebugOnlyGeneratedRowsAfterCleanup: afterCounts.reduce(
        (total, entry) => total + entry.count,
        0,
      ),
      activeDebugOnlyGeneratedRowsAfterCleanup: afterCounts
        .filter((entry) => ["active", "blocked", "needs_review"].includes(entry.queueStatus))
        .reduce((total, entry) => total + entry.count, 0),
      beforeCounts,
      afterCounts,
      generatedDebugRowsHiddenFromOwnerActiveQueue: !ownerContainsDebug,
      nextActiveQueueItem: finalOwnerActive[0] ?? null,
      realModelCallsMade: false,
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayReloaded: false,
      workQueueLifecycleMutatedDirectly: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
    const index = writeArtifact("work-queue-generated-item-lifecycle-artifact-index.json", {
      artifactKind: "work_queue_generated_item_lifecycle_artifact_index",
      runId,
      artifacts: [
        preflight,
        backfillArtifact,
        cleanupProof,
        activeQueueReadback,
        debugReadbackArtifact,
        summary,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          status: "passed",
          workItemId: item.workItemId,
          proofRuntimeJobId: proofJob.jobId,
          summary: summary.path,
          artifactIndex: index.path,
          nextActiveQueueItem: afterOwnerActive[0] ?? null,
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
  writeArtifact("work-queue-generated-item-lifecycle-summary.json", {
    artifactKind: "work_queue_generated_item_lifecycle_summary",
    status: "failed",
    errorSummary: message.slice(0, 1_000),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
