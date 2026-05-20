#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline";

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
    "extensions/execution-platform/src/workflows/context-snapshot.ts",
    "extensions/execution-platform/src/workflows/context-snapshot.test.ts",
    "extensions/execution-platform/src/workflows/source-prompt-context.ts",
    "extensions/execution-platform/src/workflows/source-prompt-context.test.ts",
    "extensions/execution-platform/src/workflows/mission-work-packets.ts",
    "extensions/execution-platform/src/workflows/mission-work-packets.test.ts",
    "extensions/execution-platform/src/workflows/context-synthesis.ts",
    "extensions/execution-platform/src/workflows/context-synthesis.test.ts",
    "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
    "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "extensions/execution-platform/src/workflows/workflow-plugin.ts",
    "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
    "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
    "extensions/execution-platform/src/workflows/architecture-red-team-plugin.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/context-snapshot-source-prompt-mission-packets-replay-synthesis-scheduler-readback-plugin",
    "validation://pnpm-test-file/context-snapshot-runtime-work-graph-scheduler-execution-read-model",
    "validation://pnpm-tsgo-full/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("context-freshness-snapshot-discipline-closeout.json", {
    artifactKind: "context_freshness_snapshot_discipline_closeout",
    workItemId,
    summary:
      "Context freshness is now a bounded runtime contract across source prompt refs, work packets, scout handoffs, synthesis, replay checkpoints, scheduler worker gates, and Work Queue readback. Production workflow plugins require fresh context snapshots before worker execution, and the scheduler blocks stale/missing/rejected/unknown context before provider invocation.",
    completedCapabilities: [
      "context_snapshot_ref_contract",
      "source_prompt_index_excerpt_snapshot_refs",
      "commitment_work_packet_context_freshness",
      "context_handoff_packet_snapshot_refs",
      "implementation_task_packet_context_readiness",
      "context_synthesis_snapshot_propagation",
      "boundary_replay_checkpoint_snapshot_freshness",
      "production_scheduler_worker_freshness_gate",
      "workflow_plugin_fresh_context_policy",
      "work_queue_active_graph_context_freshness_readback",
      "context_insufficient_vs_model_failure_reasoning",
    ],
    changedFileRefs,
    validationRefs,
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition-registry product/spec workflow definition typing drift",
      "workflow-evidence-profile duplicate identifier debt",
    ],
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
    actorId: "codex:context-freshness-snapshot-discipline-closeout",
    reasonCodes: [
      "context_freshness_snapshot_discipline_completed",
      "context_snapshot_contract_tested",
      "scheduler_freshness_gate_tested",
      "work_queue_context_freshness_readback_tested",
      "workflow_plugin_fresh_context_policy_tested",
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
