#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff";

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
    "extensions/execution-platform/src/workflows/context-synthesis.ts",
    "extensions/execution-platform/src/workflows/context-synthesis.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs",
    "scripts/execution-platform-record-context-synthesis-scheduler-handoff-closeout.mjs",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/context-synthesis-scheduler-handoff",
    "validation://tsx-import/context-synthesis",
    "validation://tsx-import/dynamic-agent-team-graph-runner",
    "validation://model-lane/qwen-qwen3-coder-next/context-synthesis-model-lane-mpcw7p7r",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const modelLaneProofRef =
    "artifact://execution-platform/context-synthesis-model-lane-mpcw7p7r.json";
  const evidence = writeArtifact("context-synthesis-scheduler-handoff-closeout.json", {
    artifactKind: "context_synthesis_scheduler_handoff_closeout",
    workItemId,
    summary:
      "Context Synthesis Barrier And Scheduler Handoff is implemented as a production scheduler handoff contract. Accepted context synthesis now carries worker-ready implementation groups, file ownership, cheaper-worker suitability, Codex escalation rationale, expected output, evidence expectations, validation/review needs, stop-if-missing blockers, risks, integration requirements, semantic code-intelligence refs, scout states, graph-compile readiness, and Work Queue readback progress. Runtime-owned context snapshot refs are preserved even when the model omits them. A bounded model lane with qwen/qwen3-coder-next produced a scheduler-ready synthesis artifact in one attempt and validated through the production normalizer/validator.",
    completedCapabilities: [
      "context_synthesis_scheduler_handoff_contract",
      "worker_ready_implementation_groups",
      "file_ownership_and_worker_fit_metadata",
      "validation_review_evidence_expectation_fields",
      "runtime_owned_context_snapshot_ref_preservation",
      "context_synthesis_validation_hardening",
      "dynamic_runner_full_synthesis_payload",
      "scheduler_post_synthesis_metadata_handoff",
      "work_queue_context_synthesis_readback",
      "bounded_model_lane_proof_passed",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    modelLaneProofRef,
    focusedValidationState:
      "passed_for_context_synthesis_contract_runner_handoff_scheduler_metadata_readback_and_model_lane",
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "workflow-definition workQueueProjectionPolicyRef typing drift",
      "workflow-definition-registry product/spec and architecture workflow typing drift",
      "workflow-evidence-profile duplicate identifier debt",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    rawLogsStored: false,
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
    artifactRefs: [evidence.ref, modelLaneProofRef],
    accepted: true,
    actorId: "codex:context-synthesis-scheduler-handoff-closeout",
    reasonCodes: [
      "context_synthesis_scheduler_handoff_completed",
      "context_synthesis_model_lane_passed",
      "runtime_owned_snapshot_refs_preserved",
      "work_queue_context_synthesis_readback_added",
      "focused_validation_passed",
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

main().catch((error) => {
  console.error(
    JSON.stringify(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
