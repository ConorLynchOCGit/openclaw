#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-harness-05-boundary-replay-checkpoints";

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
    "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
    "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "extensions/execution-platform/src/workflows/index.ts",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/boundary-replay-checkpoints",
    "validation://pnpm-test-file/dynamic-agent-team-graph-runner",
    "validation://pnpm-test-file/execution-read-model",
    "validation://pnpm-tsgo-fast",
  ];
  const evidence = writeArtifact("boundary-replay-checkpoints-closeout.json", {
    artifactKind: "boundary_replay_checkpoints_closeout",
    workItemId,
    summary:
      "Boundary replay checkpoints are now first-class bounded runtime artifacts and Work Queue readback surfaces replay state. Production coding-team execution records replay checkpoints across major pipeline boundaries, passes plugin max parallelism into the scheduler, and can terminalize from runtime-owned graph completion when Mission Ledger commitments and closeout evidence are accepted.",
    completedCapabilities: [
      "boundary_replay_checkpoint_contract",
      "boundary_replay_plan_contract",
      "idempotent_checkpoint_recording",
      "upstream_checkpoint_acceptance_gate",
      "dynamic_coding_runner_boundary_checkpoint_wiring",
      "work_queue_boundary_replay_readback",
      "scheduler_plugin_max_parallelism_passthrough",
      "runtime_owned_graph_completion_readiness",
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
    actorId: "codex:boundary-replay-checkpoints-closeout",
    reasonCodes: [
      "boundary_replay_checkpoints_completed",
      "boundary_replay_service_tested",
      "dynamic_scheduler_production_path_tested",
      "work_queue_boundary_replay_readback_tested",
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
