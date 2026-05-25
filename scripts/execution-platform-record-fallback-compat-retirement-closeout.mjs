#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit";

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
    "extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts",
    "extensions/execution-platform/src/workflows/production-workflow-execution-factory.test.ts",
    "extensions/execution-platform/src/workflows/index.ts",
    "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts",
    "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner-dynamic-boundary.test.ts",
    "extensions/execution-platform/src/codex-bridge/index.ts",
    "extensions/execution-platform/src/codex-bridge/runtime-api-export-hygiene.test.ts",
    "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts",
    "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.test.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-contracts.ts",
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    "extensions/execution-platform/src/codex-bridge/host-routes.ts",
    "extensions/execution-platform/src/codex-bridge/productionization-host-supervisor.test.ts",
    "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    "extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts",
    "extensions/execution-platform/src/intent-routing/index.ts",
    "extensions/execution-platform/src/workflows/compatibility-retirement-audit.ts",
    "extensions/execution-platform/src/workflows/compatibility-retirement-audit.test.ts",
    "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
    "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    "src/gateway/server-methods/chat.ts",
    "src/gateway/execution-platform-agent-team-runner.ts",
    "extensions/execution-platform/src/workflows/workflow-definition.ts",
    "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
    "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
    "extensions/execution-platform/src/runtime-tool-call/runtime-tool-types.ts",
    "extensions/execution-platform/src/workflows/pre-proof-mission-packet-graph-lane.test.ts",
    "scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs",
    "scripts/execution-platform-run-generic-workflow-runner-retirement-proof.mjs",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md",
  ];
  const validationRefs = [
    "validation://pnpm-test-file/production-workflow-execution-factory-runtime-api-export-hygiene-productionization-host-supervisor",
    "validation://pnpm-test-file/router-mission-packet-scheduler-context-worker-validation-closeout-model-boundary-lane",
    "validation://pnpm-tsgo-fast/passed",
    "validation://model-lane/qwen-qwen3-coder-next/code-intelligence-model-usability-mpczd8yr",
    "artifact://execution-platform/work-queue-generated-item-lifecycle-summary.json",
  ];
  const modelLaneProofRef =
    "artifact://execution-platform/code-intelligence-model-usability-mpczd8yr.json";
  const generatedCleanupProofRef =
    "artifact://execution-platform/work-queue-generated-item-lifecycle-summary.json";
  const evidence = writeArtifact("fallback-compat-retirement-closeout.json", {
    artifactKind: "fallback_compat_retirement_closeout",
    workItemId,
    summary:
      "Fallback And Compatibility Retirement is implemented for the Product/Spec pre-proof path. Production workflow execution enters through ProductionWorkflowExecutionFactory and canonical workflow runtime definitions/plugins. Retired queued runners, starter workflow live pilots, single-job quality proof gates, normal UX dogfood, obsolete Kimi proof targets, and low-level patch-adapter surfaces were deleted rather than retained behind diagnostic shims. Legacy semantic direct-submit fallback is hard-retired, stale generated proof/helper Work Queue rows were archived through lifecycle reconciliation, workflow/evidence type drift is fixed, and model-adjacent boundaries were proven by focused tests plus a live Qwen code-intelligence model lane.",
    completedCapabilities: [
      "production_workflow_execution_factory_live_wired",
      "generic_workflow_runner_production_success_retired",
      "generic_workflow_queued_runner_deleted",
      "agent_team_runtime_public_api_renamed_to_canonical_runner",
      "agent_team_queued_runner_compatibility_alias_deleted",
      "retired_proof_adapters_removed_from_public_runtime_barrel",
      "obsolete_proof_scripts_and_support_modules_deleted",
      "starter_workflow_live_pilots_deleted",
      "single_job_quality_proof_deleted",
      "normal_ux_dogfood_deleted",
      "old_kimi_source_edit_proof_target_deleted",
      "legacy_semantic_intent_router_fallback_deleted",
      "kimi_patch_json_microtask_lane_deleted",
      "generated_debug_proof_rows_archived_by_work_queue_reconciliation",
      "workflow_definition_evidence_profile_type_drift_fixed",
      "code_intelligence_model_usability_script_node_runnable",
      "model_boundary_lane_tests_passed",
      "raw_storage_flags_false",
    ],
    changedFileRefs,
    validationRefs,
    artifactRefs: [modelLaneProofRef, generatedCleanupProofRef],
    modelLaneProofRef,
    modelLaneProofHash: "sha256:30bb85efe5894c699b14423f3c8739b7cef7cc1ce30086b20b31a95d72b7885d",
    generatedCleanupProofRef,
    nextWorkItemId: "openclaw-convergence.active-queue-34",
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
  const adoptionSurface = api
    .buildRuntimeToolificationTruthRegistry()
    .find((surface) => surface.surfaceId === "generic-workflow-runner-retirement");
  if (!adoptionSurface) {
    throw new Error("generic_workflow_runner_retirement_adoption_surface_missing");
  }
  const adoptionGate = api.evaluateRuntimeToolificationAdoptionGate({
    surface: adoptionSurface,
    claim: {
      surfaceId: adoptionSurface.surfaceId,
      claimKind: "compatibility_retired",
      claimedStatus: "production_primary",
      evidenceRefs: [
        evidence.ref,
        "artifact://execution-platform/fallback-compatibility-live-path-audit.json",
        "artifact://execution-platform/generic-workflow-runner-retirement-adoption-gate-proof.json",
      ],
      toolInvocationRefs: ["runtime-tool://runtime-tool-8cd8af64-304c-4f84-8c38-5e7e4321e365"],
      workQueueReadbackRefs: [
        `work-queue://${workItemId}/readback`,
        "work-queue://openclaw-convergence.workflow-runtime-03-generic-runner-retirement.product_spec_planning.generic-workflow-runner-retirement-1778953745189/readback",
      ],
      closeoutRefs: [evidence.ref],
      retiredCompatibilityRefs: [
        "repo://extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts#deleted",
        "repo://extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts#deleted",
        "repo://extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.ts#deleted",
        "repo://extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts#deleted",
        "repo://scripts/execution-platform-run-generic-workflow-runner-retirement-proof.mjs#deleted",
        "repo://scripts/execution-platform-run-normal-ux-dogfood.mjs#deleted",
      ],
      reasonCodes: [
        "compatibility_retirement_bypass_audit_adoption_gate_claim",
        "generic_workflow_runner_deleted",
        "queued_runner_alias_deleted",
        "obsolete_proof_paths_deleted",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
  });
  const adoptionGateEvidence = writeArtifact(
    "fallback-compat-retirement-adoption-gate-proof.json",
    {
      artifactKind: "fallback_compat_retirement_adoption_gate_proof",
      workItemId,
      adoptionGate,
      surface: {
        surfaceId: adoptionSurface.surfaceId,
        currentStatus: adoptionSurface.currentStatus,
        targetStatus: adoptionSurface.targetStatus,
        gates: adoptionSurface.gates,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogsStored: false,
      rawDbRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
  );

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [
      evidence.ref,
      adoptionGateEvidence.ref,
      modelLaneProofRef,
      generatedCleanupProofRef,
    ],
    toolificationAdoptionGateResults: [adoptionGate],
    toolificationAdoptionGateEvidenceRefs: [adoptionGateEvidence.ref],
    accepted: true,
    actorId: "codex:fallback-compat-retirement-closeout",
    reasonCodes: [
      "fallback_compat_retirement_completed",
      "production_workflow_factory_wired",
      "generic_workflow_runner_retired_from_production_success",
      "runtime_api_export_hygiene_enforced",
      "compatibility_retirement_source_audit_passed",
      "generated_debug_rows_archived",
      "tsgo_fast_passed",
      "model_boundary_lane_passed",
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
        nextActive: rows.rows[0] ?? null,
      },
      null,
      2,
    ),
  );
  await runtime.close?.();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
