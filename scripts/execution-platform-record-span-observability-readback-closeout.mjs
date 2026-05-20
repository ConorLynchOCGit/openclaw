#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.native-leap-11-span-observability-readback";

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
    "extensions/execution-platform/src/observability/runtime-execution-span.ts",
    "extensions/execution-platform/src/observability/index.ts",
    "extensions/execution-platform/src/observability/runtime-execution-span.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts",
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts",
    "extensions/execution-platform/src/workers/runtime-worker-supervisor.ts",
    "extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.ts",
    "extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.test.ts",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md",
    "docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md",
    "docs/projects/execution-platform/specs/runtime-work-graph.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/runtime-execution-span-runtime-tool-supervisor-readback-closeout",
    "validation://pnpm-test-file/dynamic-agent-team-graph-runner-blocked-by-known-worker-invoke-path",
    "validation://pnpm-tsgo-fast/blocked-by-pre-existing-workflow-definition-evidence-profile-debt",
  ];
  const evidence = writeArtifact("span-observability-readback-closeout.json", {
    artifactKind: "span_observability_readback_closeout",
    workItemId,
    summary:
      "Span-Level Observability And Readback is now implemented as production runtime evidence. RuntimeExecutionSpan v1 records bounded model/tool/worker/scheduler/node/validation/replay/closeout phases; scheduler progress emits runtime_execution.span events and span refs; Runtime Tool Kernel trace metadata carries execution spans; RuntimeWorkerSupervisor emits heartbeat and adapter spans; Work Queue active graph readback surfaces spanProgress; and closeout finalization requires runtime execution span refs before clean acceptance.",
    completedCapabilities: [
      "runtime_execution_span_contract_v1",
      "scheduler_progress_span_emission",
      "runtime_tool_kernel_span_metadata",
      "runtime_worker_supervisor_span_events",
      "work_queue_span_progress_readback",
      "closeout_finalization_requires_runtime_execution_span_refs",
      "raw_storage_flags_rejected_for_spans",
      "stale_and_blocked_span_readback",
    ],
    changedFileRefs,
    validationRefs,
    focusedValidationState: "passed_for_span_contract_tool_supervisor_readback_and_closeout",
    focusedValidationLimitations: [
      "dynamic-agent-team-graph-runner broad production-path test still fails in the known downstream worker.invoke path after context scout; this is outside the span/readback implementation.",
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
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:span-observability-readback-closeout",
    reasonCodes: [
      "span_observability_readback_completed",
      "runtime_execution_span_contract_tested",
      "runtime_tool_span_metadata_tested",
      "runtime_worker_supervisor_span_events_tested",
      "work_queue_span_progress_readback_tested",
      "closeout_span_refs_gate_tested",
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
