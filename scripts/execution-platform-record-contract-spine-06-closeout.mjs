#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-06-scheduler-observability-envelope";
const nextItemId = "openclaw-convergence.contract-spine-07-validation-phase-semantics";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/scheduler-model-call-envelope.ts",
  "extensions/execution-platform/src/workflows/scheduler-model-call-envelope.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-coding-team-orchestrator.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-06/scheduler-envelope-runtime-readback-tests-29-pass",
  "validation://contract-spine-06/scoped-tsgo-fast-pass",
  "validation://contract-spine-06/git-diff-check-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
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

  const evidence = writeArtifact("contract-spine-06-scheduler-observability-closeout.json", {
    artifactKind: "execution_platform.contract_spine_06_scheduler_observability_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Scheduler model-call observability is now a bounded runtime contract. Live dynamic scheduler model progress emits SchedulerModelCallEnvelope snapshots for preflight, heartbeat, completion, rejection, and repair. Scheduler rejection tools attach rejected decision diagnostics, schema/policy paths, repair hints, and missing fields. Latest-run-state and Work Queue owner readback project model/provider/profile, decision slot, allowed tool family, output contract, byte counts, graph/frontier counts, heartbeat age, finish reason, provider response shape summary, and accepted/rejected tool summaries without hidden reasoning or raw provider bodies.",
    completedCapabilities: [
      "scheduler_model_call_envelope_contract",
      "scheduler_model_call_preflight_heartbeat_completion_rejection_repair_phases",
      "dynamic_scheduler_model_progress_envelope_emission",
      "scheduler_rejection_envelope_diagnostics",
      "scheduler_record_model_call_envelope_runtime_tool_registration",
      "latest_run_state_scheduler_envelope_projection",
      "work_queue_active_graph_scheduler_envelope_projection",
      "execution_read_model_scheduler_envelope_type",
      "bounded_provider_response_shape_summary",
      "raw_free_no_hidden_reasoning_envelope_guardrails",
    ],
    forbiddenPathsRetired: [
      "long_scheduler_model_call_with_no_owner_visible_decision_slot",
      "scheduler_rejection_hidden_behind_generic_needs_review",
      "schema_policy_rejection_without_path_or_missing_fields",
      "provider_body_or_hidden_reasoning_stored_in_readback",
      "work_queue_readback_without_scheduler_model_provider_profile",
      "stale_latest_run_state_without_active_scheduler_envelope",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/scheduler-model-call-envelope.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
        result: "passed",
        testFilesPassed: 5,
        testsPassed: 29,
      },
      {
        command: "pnpm tsgo:fast",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Validation phase semantics remain assigned to contract-spine item 07.",
      "Canonical firstOpenGate/readback gate remains assigned to contract-spine item 08.",
      "Model policy bindings remain assigned to contract-spine item 09.",
      "This slice does not run the full Product/Spec proof; it closes live scheduler observability required before replay proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_bounds_storage_lifecycle_tool_execution_model_call_observability_readback_projection",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    graphRef: "runtime-contract://execution-platform/scheduler-model-call-envelope/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-06-closeout",
    reasonCodes: [
      "contract_spine_06_scheduler_observability_envelope_implemented",
      "scheduler_model_call_envelope_contract_added",
      "scheduler_progress_envelope_emission_added",
      "scheduler_rejection_envelope_diagnostics_added",
      "latest_run_state_scheduler_envelope_projected",
      "work_queue_scheduler_envelope_projected",
      "raw_free_hidden_reasoning_guardrails_passed",
      "focused_validation_passed",
      "scoped_type_validation_passed",
      "git_diff_check_passed",
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

  await runtime.sqlClient.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = now()
      WHERE work_item_id = $2
    `,
    [
      JSON.stringify({
        previousPreProofItemClosed: workItemId,
        nextActiveReason:
          "Scheduler model-call observability is closed; validation phase semantics are the next contract-spine boundary.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      }),
      nextItemId,
    ],
  );

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
