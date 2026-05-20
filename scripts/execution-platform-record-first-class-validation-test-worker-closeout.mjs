#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-10-first-class-validation-test-worker";

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
    "extensions/execution-platform/src/workflows/validation-qa-runtime-tools.ts",
    "extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/specs/runtime-work-graph.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/validation-qa-runtime-tools",
    "validation://pnpm-test-file/validation-qa-runtime-tools-work-queue-readback",
    "validation://pnpm-test-file/dynamic-agent-team-graph-runner-blocked-by-pre-existing-worker-invoke",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("first-class-validation-test-worker-closeout.json", {
    artifactKind: "first_class_validation_test_worker_closeout",
    workItemId,
    summary:
      "Validation is now a first-class scheduler/runtime worker surface. ValidationTaskPacket v2 carries workflow, Mission Ledger, Commitment Work Packet, context snapshot, approved command definition, scope, evidence, failure mapping, repair handoff, budget, and raw-storage metadata. validation.select_commands is registered as a runtime tool, validation.run_command requires runtime-owned command definitions, unsupported shell-shaped strings no longer become approved command refs, scheduler validation nodes emit command-level progress and same-job repair handoffs, and Work Queue readback surfaces validation command, result, repair, evidence, blocker, and ELI5 state.",
    completedCapabilities: [
      "validation_task_packet_v2_worker_ready_contract",
      "validation_select_commands_runtime_tool",
      "validation_run_command_requires_command_definition",
      "unsupported_shell_validation_strings_fail_closed",
      "scheduler_validation_node_command_level_progress",
      "validation_failure_classification_and_repair_handoff",
      "validation_repair_node_edge_materialization",
      "validation_boundary_checkpoint_recording_preserved",
      "work_queue_validation_worker_readback",
    ],
    changedFileRefs,
    validationRefs,
    focusedValidationState: "passed_for_validation_tools_and_work_queue_readback",
    focusedValidationLimitations: [
      "dynamic-agent-team-graph-runner broad production-path test still fails in pre-existing worker.invoke path after context scout; failure is downstream of first-class validation worker changes.",
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
    rawCommandLogsStored: false,
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
    actorId: "codex:first-class-validation-test-worker-closeout",
    reasonCodes: [
      "first_class_validation_test_worker_completed",
      "validation_task_packet_v2_tested",
      "validation_runtime_tools_tested",
      "validation_command_definition_gate_tested",
      "work_queue_validation_readback_tested",
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
