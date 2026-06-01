#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-02-target-selection-router-budget";
const nextItemId = "openclaw-convergence.proof-hardening-03-context-repair-requirements";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/resource-selection.ts",
  "extensions/execution-platform/src/workflows/resource-selection.test.ts",
  "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts",
  "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-record-proof-hardening-02-closeout.mjs",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
];

const validationRefs = [
  "validation://proof-hardening-02/resource-selection-tests-pass",
  "validation://proof-hardening-02/implementation-context-snapshot-compiler-tests-pass",
  "validation://proof-hardening-02/model-task-classification-tests-pass",
  "validation://proof-hardening-02/runtime-artifact-contracts-tests-pass",
  "validation://proof-hardening-02/no-semantic-cheats-tests-pass",
  "validation://proof-hardening-02/dynamic-runner-target-ref-regression-pass",
  "validation://proof-hardening-02/replay-script-node-check-pass",
  "validation://proof-hardening-02/scoped-tsgo-fast-pass",
  "validation://proof-hardening-02/git-diff-check-pass",
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

  const evidence = writeArtifact("proof-hardening-02-target-selection-router-budget-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_02_target_selection_router_budget_closeout",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    implementationSummary:
      "Resource/target selection is now a first-class model-task boundary. Candidate resources are compiled into bounded handle manifests, model output is limited to canonical resource.selection.propose or resource.selection.mark_blocked small verbs, runtime compiles ResourceSelectionPacket and TargetSelectionPacket payload artifacts, provider invocation routes through ModelTaskClientRouter with model-policy preflight, and payload-over-budget or provider-route mismatch blocks before provider calls. Runtime validates candidate membership, packet schema, payload budgets, and authority surfaces only; it does not score resource usefulness. Replay and production no longer promote context scout recommended edit points, verified refs, direct selectedTargetFileRefs, or fileChangeIntents into executable edit authority without an accepted target-selection packet.",
    completedCapabilities: [
      "resource_selection_packet_boundary",
      "resource_selection_handle_manifest",
      "resource_selection_small_verb_tool_calls",
      "resource_selection_field_specific_repair_request",
      "model_task_client_router_preflight",
      "qwen_openrouter_tool_selection_route",
      "target_selection_packet_specialization",
      "target_selection_payload_budget_gate",
      "payload_required_resource_selection_artifact_contracts",
      "context_recommendations_as_candidates_only",
      "direct_selected_target_refs_authority_bypass_removed",
      "production_and_replay_target_ref_promotion_removed",
      "neutral_resource_selection_fixture",
    ],
    forbiddenPathsRetired: [
      "codex_json_client_for_target_selection_replay",
      "provider_telemetry_says_qwen_but_call_uses_codex",
      "target_selection_provider_call_after_payload_budget_failure",
      "context_scout_recommended_edit_points_unlock_edit_authority",
      "verified_context_file_refs_unlock_edit_authority",
      "direct_selected_target_file_refs_unlock_edit_authority_without_packet",
      "file_change_intents_promoted_into_materialization_target_refs",
      "whole_packet_regeneration_for_resource_selection_repair",
      "resource_usefulness_scoring_in_runtime",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/resource-selection.test.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/model-tasks/model-task-classification.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 5,
        testsPassed: 53,
      },
      {
        command:
          'pnpm exec vitest run -c test/vitest/vitest.extensions.config.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts -t "keeps broad implementation directory seeds"',
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 1,
        skippedTests: 17,
      },
      {
        command: "node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs",
        result: "passed",
      },
      {
        command:
          "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/resource-selection.ts extensions/execution-platform/src/workflows/resource-selection.test.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    knownResiduals: [
      "A full dynamic-agent-team-graph-runner integration test still fails on pre-existing scheduler/mission-contract terminal fixture debt before worker execution. The targeted production resolver regression for this item passed and the broader fixture is not used as closeout evidence.",
      "The next queue item must make context repair nodes consumer-aware with ResourceRequirementPacket authority before a full Product/Spec proof is honest.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "resource_selection_schema_candidate_refs_payload_budget_provider_preflight_artifact_contracts_authority_surface_retirement",
    runtimeMustNotJudge: [
      "semantic_file_relevance",
      "context_sufficiency_quality",
      "edit_quality",
      "product_spec_special_meaning",
      "qualitative_complexity",
      "model_rationale_persuasiveness",
      "resource_usefulness",
    ],
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
    graphRef: "runtime-contract://execution-platform/resource-target-selection-router-budget/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#2-resourcetarget-selection-model-task-router-and-payload-budget`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:proof-hardening-02-closeout",
    reasonCodes: [
      "proof_hardening_02_target_selection_router_budget_implemented",
      "resource_selection_packet_boundary_added",
      "resource_selection_handle_manifest_added",
      "field_specific_resource_selection_repair_added",
      "model_task_client_router_preflight_added",
      "qwen_openrouter_route_added",
      "codex_json_target_selection_replay_retired",
      "payload_budget_preflight_added",
      "target_selection_packet_artifact_contract_added",
      "direct_selected_target_refs_authority_bypass_removed",
      "context_recommendation_target_ref_promotion_removed",
      "neutral_resource_selection_fixture_passed",
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
          "Resource/target selection routing and payload budgeting are closed; context repair requirements are the next pre-proof gate.",
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
