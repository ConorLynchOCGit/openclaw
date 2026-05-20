#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-harness-01-supervision-model-call-progress";

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
    sha256: `sha256:${sha256(body)}`,
  };
}

async function main() {
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const changedFileRefs = [
    "extensions/execution-platform/src/codex-bridge/dynamic-coding-team-orchestrator.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "extensions/execution-platform/src/workers/runtime-worker-supervisor.ts",
    "extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts",
    "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/execution-read-model-runtime-worker-supervisor",
    "validation://pnpm-tsgo-fast",
  ];
  const evidence = writeArtifact("supervision-model-call-progress-closeout.json", {
    artifactKind: "supervision_model_call_progress_closeout",
    workItemId,
    summary:
      "Runtime model-call spans now flow through Codex app-server scheduler calls, role model calls, replay model calls, supervisor adapter events, and Work Queue owner readback.",
    completedCapabilities: [
      "dynamic_coding_team_model_call_progress_contract",
      "codex_app_server_scheduler_progress_spans",
      "role_model_call_progress_span_projection",
      "context_synthesis_model_call_progress_spans",
      "boundary_replay_model_call_progress_and_handle_close",
      "runtime_worker_adapter_start_complete_failed_events",
      "work_queue_active_model_call_progress_readback",
    ],
    changedFileRefs,
    validationRefs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:supervision-model-call-progress-closeout",
    reasonCodes: [
      "supervision_model_call_progress_completed",
      "model_call_progress_readback_tested",
      "runtime_worker_supervisor_events_tested",
      "tsgo_fast_passed",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    runtimeLifecycleMutated: false,
  });

  const rows = await runtime.sqlClient.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 20
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: transition.closed,
        transition,
        evidence,
        nextActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );
  await runtime.pool.end();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
