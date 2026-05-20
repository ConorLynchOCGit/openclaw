#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps";

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
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "extensions/execution-platform/src/workflows/post-synthesis-graph-policy.ts",
    "extensions/execution-platform/src/workflows/workflow-plugin.ts",
    "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/runtime-work-graph-scheduler",
    "validation://pnpm-test-file/execution-read-model",
    "validation://pnpm-tsgo-fast",
  ];
  const evidence = writeArtifact("post-synthesis-parallel-supersteps-closeout.json", {
    artifactKind: "post_synthesis_parallel_supersteps_closeout",
    workItemId,
    summary:
      "Runtime Work Graph scheduler now executes dependency-ready post-synthesis frontiers as bounded supersteps, surfaces frontier readback, rejects broad Codex chokepoints, and defers production coding closeout while executable graph nodes remain.",
    completedCapabilities: [
      "runtime_dependency_layer_readback",
      "runtime_selected_parallel_frontier_supersteps",
      "conflict_domain_locks_for_parallel_execution",
      "single_ready_node_runtime_execution_without_model_selection_roundtrip",
      "completed_sibling_branch_preservation",
      "production_coding_closeout_defers_pending_executable_nodes",
      "post_synthesis_broad_codex_chokepoint_rejection",
      "work_queue_parallel_frontier_readback",
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
    actorId: "codex:post-synthesis-parallel-supersteps-closeout",
    reasonCodes: [
      "post_synthesis_parallel_supersteps_completed",
      "runtime_work_graph_scheduler_frontier_tested",
      "work_queue_parallel_frontier_readback_tested",
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
