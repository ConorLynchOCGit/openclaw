#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-harness-04-validation-executor-repair";

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
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/validation-qa-runtime-tools",
    "validation://pnpm-test-file/execution-read-model",
    "validation://pnpm-tsgo-fast",
  ];
  const evidence = writeArtifact("validation-executor-repair-closeout.json", {
    artifactKind: "validation_executor_repair_closeout",
    workItemId,
    summary:
      "Validation nodes now build canonical ValidationTaskPacket handoffs, execute only approved validation command refs through validation/QA runtime tools, record bounded result/failure/repair evidence, materialize same-job repair graph nodes and edges for recoverable failures, and expose validation repair state in Work Queue readback.",
    completedCapabilities: [
      "validation_task_packet_contract",
      "validation_task_packet_readiness_gate",
      "approved_validation_command_ref_derivation",
      "validation_runtime_tool_plan_run_summarize_classify_map_repair_accept_flow",
      "same_job_validation_repair_node_materialization",
      "validation_failed_and_repair_requested_edges",
      "validation_qa_evidence_packet_repair_refs",
      "work_queue_validation_task_and_repair_readback",
    ],
    changedFileRefs,
    validationRefs,
    knownValidationNote:
      "The broader dynamic-agent-team graph runner test still fails on a pre-existing production-path closeout/result assertion; focused validation/QA and Work Queue readback tests plus tsgo passed for this slice.",
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
    actorId: "codex:validation-executor-repair-closeout",
    reasonCodes: [
      "validation_executor_repair_completed",
      "validation_task_packet_tested",
      "validation_qa_runtime_tools_tested",
      "work_queue_validation_readback_tested",
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
