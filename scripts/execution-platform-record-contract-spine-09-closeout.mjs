#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-09-model-policy-bindings";
const nextItemId = "openclaw-convergence.contract-spine-10-replay-proof";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";
const modelTaskSpecRef =
  "docs/projects/execution-platform/specs/model-task-classification-and-resource-materialization.md";

const changedFileRefs = [
  "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
  "extensions/execution-platform/src/model-tasks/model-task-classification.test.ts",
  "extensions/execution-platform/src/model-tasks/model-task-repository.ts",
  "extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts",
  "extensions/execution-platform/src/workflows/scheduler-model-call-envelope.ts",
  "extensions/execution-platform/src/workflows/scheduler-model-call-envelope.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  sourceSpecRef,
  modelTaskSpecRef,
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
  "scripts/execution-platform-record-contract-spine-09-closeout.mjs",
];

const validationRefs = [
  "validation://contract-spine-09/model-task-classification-tests-pass",
  "validation://contract-spine-09/model-task-repository-tests-pass",
  "validation://contract-spine-09/structured-adapter-tests-pass",
  "validation://contract-spine-09/scheduler-envelope-tests-pass",
  "validation://contract-spine-09/readback-projections-tests-pass",
  "validation://contract-spine-09/latest-run-state-tests-pass",
  "validation://contract-spine-09/no-semantic-cheats-tests-pass",
  "validation://contract-spine-09/runtime-work-graph-scheduler-tests-pass",
  "validation://contract-spine-09/scoped-tsgo-fast-pass",
  "validation://contract-spine-09/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-09-model-policy-bindings-closeout.json", {
    artifactKind: "execution_platform.contract_spine_09_model_policy_bindings_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    modelTaskSpecRef,
    implementationSummary:
      "Model policy is now bound to canonical task class and exact contract boundary. Runtime emits model contract boundary policy bindings, preflights provider calls for task/model/profile/reasoning/parser/timeout/input/output/tool/output-contract mismatches, blocks runtime-only resource materialization provider calls, exposes proof-cleanliness state for rescue/escalation, and projects boundary/policy diagnostics through scheduler envelopes, latest-run-state, and Work Queue readback.",
    completedCapabilities: [
      "model_contract_boundary_policy_binding_registry",
      "exact_callsite_boundary_binding_without_substring_semantics",
      "model_policy_binding_preflight",
      "resource_materialization_provider_call_hard_block",
      "reasoning_parser_response_format_timeout_input_output_preflight",
      "allowed_tool_family_and_output_contract_preflight",
      "proof_cleanliness_rescue_escalation_visibility",
      "scheduler_model_call_boundary_policy_envelope",
      "latest_run_state_model_policy_current_projection",
      "work_queue_model_policy_readback_projection",
      "generic_model_task_runtime_tool_classification_metadata",
    ],
    forbiddenPathsRetired: [
      "hidden_gpt_rescue_counts_as_clean_proof",
      "runtime_only_resource_materialization_provider_call",
      "fast_lane_reasoning_mode_drift",
      "model_policy_contract_mismatch_without_readback",
      "generic_model_task_model_call_without_classification_metadata",
      "semantic_substring_model_policy_routing",
      "product_spec_specific_model_policy_branching",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/model-tasks/model-task-classification.test.ts extensions/execution-platform/src/model-tasks/model-task-repository.test.ts extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts extensions/execution-platform/src/workflows/scheduler-model-call-envelope.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
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
    knownResiduals: [
      "dynamic-agent-team-graph-runner.test.ts still exposes pre-existing fixture debt where the default production-path fixture terminalizes with open Mission Ledger commitments before worker execution; that is not closed by model-policy bindings and belongs to replay/proof readiness work.",
      "Contract-spine replay proof remains assigned to item 10 before full Product/Spec proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "task_class_boundary_schema_refs_bounds_provider_call_permission_lifecycle_telemetry_readback_projection",
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
    graphRef: "runtime-contract://execution-platform/model-policy-bindings/v1",
    ownerReadbackRef: `${sourceSpecRef}#9-model-policy`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-09-closeout",
    reasonCodes: [
      "contract_spine_09_model_policy_bindings_implemented",
      "model_contract_boundary_policy_binding_registry_added",
      "model_policy_binding_preflight_added",
      "proof_cleanliness_rescue_escalation_visibility_added",
      "resource_materialization_provider_call_forbidden",
      "scheduler_latest_run_work_queue_policy_readback_added",
      "generic_model_task_runtime_tool_classification_metadata_added",
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
          "Model policy contract bindings are closed; contract-spine replay proof is the next pre-Product/Spec gate.",
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
      LIMIT 10
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
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
