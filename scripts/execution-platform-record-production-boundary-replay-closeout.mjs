#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-09-production-boundary-replay";

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
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/boundary-replay-checkpoints",
    "validation://pnpm-test-file/boundary-replay-readback-ux-parity",
    "validation://pnpm-test-file/requested-focused-set-blocked-by-pre-existing-dynamic-runner-worker-invoke",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("production-boundary-replay-closeout.json", {
    artifactKind: "production_boundary_replay_closeout",
    workItemId,
    summary:
      "Boundary replay checkpoints now bind input/output hashes, repo/worktree/authority identity, and identity binding hashes. Replay plans evaluate the latest checkpoint per required boundary, reject stale/latest mismatches, and produce a production continuation contract through GenericOrchestrationRuntime.runSchedulerGraph and RuntimeWorkGraphScheduler.run. Work Queue readback exposes exact continuation action, latest accepted checkpoint, skipped boundaries, resume refs, and invalid replay diagnostics.",
    completedCapabilities: [
      "boundary_checkpoint_input_output_hashes",
      "boundary_checkpoint_repo_worktree_authority_identity",
      "latest_checkpoint_per_boundary_replay_gate",
      "stale_latest_checkpoint_rejects_replay",
      "production_continuation_contract_generic_runtime_scheduler_path",
      "replay_plan_resume_artifact_refs_and_skipped_boundary_readback",
      "work_queue_boundary_replay_continuation_readback",
      "ux_replay_payload_parity_existing_gate_preserved",
    ],
    changedFileRefs,
    validationRefs,
    focusedValidationState: "passed_for_boundary_replay_readback_and_payload_parity",
    focusedValidationLimitations: [
      "dynamic-agent-team-graph-runner broad production-path test still fails in pre-existing worker.invoke path after context scout; failure was present before this slice and is not introduced by boundary replay service changes.",
    ],
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition workQueueProjectionPolicyRef typing drift",
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
    actorId: "codex:production-boundary-replay-closeout",
    reasonCodes: [
      "production_boundary_replay_completed",
      "boundary_replay_latest_checkpoint_gate_tested",
      "boundary_replay_production_continuation_contract_tested",
      "work_queue_boundary_replay_readback_tested",
      "ux_replay_payload_parity_preserved",
      "work_queue_status_db_runtime_closeout",
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
