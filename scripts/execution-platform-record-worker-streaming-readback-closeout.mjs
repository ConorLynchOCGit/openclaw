#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-04-worker-streaming-readback";

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
    "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs",
    "scripts/execution-platform-record-worker-streaming-readback-closeout.mjs",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/roadmap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/model-agnostic-tool-worker-loop-non-codex-tool-using-worker-loop-execution-read-model",
    "validation://tsx-import/non-codex-tool-using-worker-loop",
    "validation://tsx-import/dynamic-agent-team-graph-runner",
    "validation://tsx-import/execution-read-model",
    "validation://model-lane/worker-streaming-readback/qwen-qwen3-coder-next",
  ];
  const modelLaneArtifactRef =
    "artifact://execution-platform/worker-streaming-readback-model-lane-mpcwyonc.json";
  const evidence = writeArtifact("worker-streaming-readback-closeout.json", {
    artifactKind: "worker_streaming_readback_closeout",
    workItemId,
    summary:
      "Non-Codex worker-internal progress is now production owner readback. Worker phase events carry packet/context/synthesis/code-intelligence refs, selected tool status, validation command refs, edit transaction state, provider diagnostics, output hash/content length, blocker, next decision, and ELI5; the dynamic graph runner persists those fields into scheduler progress and Work Queue active graph readback.",
    completedCapabilities: [
      "model_agnostic_worker_phase_event_streaming_fields",
      "non_codex_worker_loop_tool_validation_repair_provider_progress",
      "dynamic_graph_runner_worker_internal_progress_projection",
      "work_queue_active_graph_worker_internal_readback",
      "closed_runtime_job_worker_internal_readback",
      "bounded_model_lane_worker_readback_usability_proof",
      "raw_storage_false_flags_preserved",
    ],
    changedFileRefs,
    validationRefs,
    artifactRefs: [modelLaneArtifactRef],
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref, modelLaneArtifactRef],
    accepted: true,
    actorId: "codex:worker-streaming-readback-closeout",
    reasonCodes: [
      "worker_streaming_readback_completed",
      "worker_internal_progress_readback_tested",
      "non_codex_worker_loop_streaming_fields_wired",
      "dynamic_graph_runner_progress_projection_updated",
      "model_lane_readback_usability_passed",
      "raw_storage_false_flags_preserved",
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

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
