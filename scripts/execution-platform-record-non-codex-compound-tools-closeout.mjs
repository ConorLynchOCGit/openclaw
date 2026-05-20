#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.coding-leap-05-non-codex-compound-tools";

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
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
    "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
    "extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts",
    "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts",
    "extensions/execution-platform/src/codex-bridge/worker-controller-author-applicator.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs",
    "scripts/execution-platform-record-non-codex-compound-tools-closeout.mjs",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
    "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/non-codex-compound-tool-worker-loop-scheduler-tools-capability-readback",
    "validation://tsx-import/compound-worker-runtime-tools-readback",
    "validation://model-lane/qwen-qwen3-coder-next/non-codex-compound-tool-model-lane-mpcy484e",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const modelLaneProofRef =
    "artifact://execution-platform/non-codex-compound-tool-model-lane-mpcy484e.json";
  const evidence = writeArtifact("non-codex-compound-tools-closeout.json", {
    artifactKind: "non_codex_compound_coding_tools_closeout",
    workItemId,
    summary:
      "Non-Codex Compound Coding Tools are implemented as first-class Runtime Tool Kernel operations for agent_team.coding. The coding.compound tool family registers six bounded repo-write compound tools. The non-Codex worker loop executes them through runtime-owned edit transactions, validation, repair classification, evidence claims, and close. Successful compound tools satisfy changed-file, validation, evidence, and transaction gates; failures stop as needs_review with repair classification refs. Worker phase events, dynamic scheduler progress, and Work Queue readback surface compound tool id and sub-event phases.",
    completedCapabilities: [
      "runtime_tool_family_coding_compound_registered",
      "compound_tool_ids_registered_with_bounded_repo_write_authority",
      "agent_team_coding_plugin_declares_coding_compound_family",
      "non_codex_worker_loop_executes_compound_tools",
      "compound_tools_use_edit_transaction_engine",
      "compound_tools_run_validation_and_emit_evidence",
      "compound_failures_emit_repair_classification_refs",
      "compound_success_counts_as_worker_progress",
      "worker_phase_events_surface_compound_sub_events",
      "work_queue_readback_surfaces_compound_tool_state",
      "qwen_model_lane_selected_and_executed_compound_tool",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    modelLaneProofRef,
    modelLaneProofHash: "sha256:01df2d0d4059454819d208de3fc9533396cd5ecd1ce92c4648303fcc66a1c1e7",
    focusedValidationState:
      "passed_for_worker_loop_model_agnostic_phase_scheduler_tool_registry_coding_plugin_capability_registry_work_queue_readback_and_model_lane",
    fullRepoValidationState: "blocked_by_pre_existing_workflow_definition_evidence_profile_debt",
    fullRepoValidationBlockers: [
      "WorkflowDefinition workQueueProjectionPolicyRef typing drift",
      "workflow-definition-registry product/spec and architecture workflow typing drift",
      "workflow-evidence-profile duplicate identifier debt",
    ],
    nextWorkItemId: "openclaw-convergence.coding-leap-06-fallback-compat-retirement",
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
    actorId: "codex:non-codex-compound-tools-closeout",
    reasonCodes: [
      "non_codex_compound_tools_completed",
      "coding_compound_runtime_tool_family_registered",
      "compound_worker_loop_execution_wired",
      "compound_worker_readback_wired",
      "focused_validation_passed",
      "compound_model_lane_passed",
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
  await runtime.close?.();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
