#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md";

const preProofItems = [
  {
    id: "openclaw-convergence.pre-proof-01-execution-platform-characterization-guardrails",
    title: "Characterization And Import Boundary Guardrails",
    description:
      "Add characterization, source/import-boundary, no-semantic-cheats, and proof/runtime topology guardrails before modularizing Execution Platform runtime code.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-1-characterization-and-import-boundary-guardrails`,
    scope: [
      "production_vs_proof_import_boundaries",
      "no_semantic_cheats_regression",
      "product_spec_replay_topology_characterization",
      "scheduler_first_context_supply_guard",
      "module_ownership_map",
    ],
    successGate:
      "Focused tests prove production paths do not import proof topology, replay cannot inject context_synthesis by default, and generic runtime modules contain no Product/Spec-specific semantic substring classifiers.",
  },
  {
    id: "openclaw-convergence.post-proof-01-generic-runtime-spine-extraction",
    title: "Generic Runtime Spine Extraction",
    description:
      "Extract replay boundaries, resource materialization, NodeReadinessState transitions, branch results, superstep aggregation, repair routing, and generic Work Queue runtime events into the workflow-agnostic runtime spine before Product/Spec proof.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-2-generic-runtime-spine-extraction`,
    scope: [
      "generic_replay_boundary_registry",
      "generic_resource_materialization_boundary",
      "generic_node_readiness_transition_evaluation",
      "parallel_frontier_branch_result_contract",
      "superstep_result_aggregation",
      "repair_escalation_routing",
      "generic_work_queue_runtime_event_emission",
    ],
    successGate:
      "agent_team.coding uses generic runtime lifecycle APIs; at least one non-coding workflow resolves the same APIs in a readiness lane; no production success path bypasses readiness/evidence/profile/validation/closeout gates.",
  },
  {
    id: "openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning",
    title: "Dynamic Runner Plugin Thinning",
    description:
      "Reduce DynamicAgentTeamGraphRunner to coding plugin wiring and adapter orchestration; generic scheduler/replay/resource/readiness policy must move into runtime services before Product/Spec proof.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-3-dynamic-runner-plugin-thinning`,
    scope: [
      "coding_plugin_wiring_only",
      "single_generic_runtime_entrypoint",
      "runner_proof_branch_retirement",
      "dependency_direction_cleanup",
      "production_success_gate_unification",
    ],
    successGate:
      "Runner no longer owns generic scheduler/replay/resource/readiness policy; production construction uses one canonical runtime entrypoint; proof/replay code cannot be imported by production runner paths.",
  },
  {
    id: "openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle",
    title: "Generic Replay And Readiness Lifecycle",
    description:
      "Promote checkpoint replay into a workflow-agnostic runtime diagnostic service with boundary ids, required artifacts, versioned normalizers, resume commands, transitions, blockers, and readback.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-4-generic-replay-and-readiness-lifecycle`,
    scope: [
      "workflow_agnostic_replay_registry",
      "boundary_required_artifacts",
      "versioned_checkpoint_normalizers",
      "resume_command_contract",
      "allowed_next_transition_contract",
      "terminal_blocker_classes",
      "generic_boundary_readback_projection",
    ],
    successGate:
      "Replay can resume from router, Mission Ledger, packet, context, graph, resource materialization, worker, validation, readback, and closeout boundaries using runtime services; proof scripts are thin CLIs.",
  },
  {
    id: "openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization",
    title: "Progress, Readback, And Runtime Event Modularization",
    description:
      "Split Work Queue execution readback and scheduler progress projection into tested modules over latest-run-state, graph patch refs, artifact manifests, branch results, and token/walltime state.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-5-progress-readback-and-runtime-event-modularization`,
    scope: [
      "scheduler_graph_readiness_projection",
      "worker_internal_progress_projection",
      "runtime_artifact_manifest_projection",
      "work_queue_child_projection",
      "token_walltime_projection",
      "replay_boundary_projection",
    ],
    successGate:
      "Owner readback shows active node, branch id, phase, blocker, schema path, readiness ref, model/tool, evidence refs, usage availability, and next transition without raw logs or payload bodies.",
  },
  {
    id: "openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit",
    title: "Compatibility Retirement And Middleware Bypass Audit",
    description:
      "Audit and retire remaining production bypass surfaces: queued runner compatibility, legacy semantic fallbacks, static role sequences, proof-era adapter exports, patch-JSON worker paths, and context-synthesis replay glue.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-6-compatibility-retirement-and-bypass-audit`,
    scope: [
      "generic_queued_runner_bypass_audit",
      "legacy_semantic_fallback_retirement",
      "proof_adapter_export_hygiene",
      "patch_json_worker_path_retirement",
      "diagnostic_only_replay_import_boundaries",
      "production_success_bypass_assertions",
    ],
    successGate:
      "No production workflow success can flow through compatibility closeout, degraded closeout, generic queued fallback, proof harness replay logic, legacy semantic fallback, or patch-JSON worker paths.",
  },
  {
    id: "openclaw-convergence.model-contract-compiler-consolidation",
    title: "Model Contract Compiler Consolidation",
    description:
      "Consolidate model-output parsing, field-specific repair, normalization, provider diagnostics, runtime-owned ref compilation, and raw-storage validation across router, ledger, packets, context, scheduler, workers, validation, review, and closeout.",
    priorityClass: "P0",
    itemType: "platform_refactor",
    specSectionRef: `${sourceSpecRef}#pass-7-model-contract-compiler-consolidation`,
    scope: [
      "model_semantic_intent_contracts",
      "runtime_owned_id_ref_envelope_compilers",
      "allowed_enum_repair",
      "field_specific_repair",
      "provider_diagnostics",
      "raw_storage_flag_validation",
      "manifest_payload_ref_validation",
    ],
    successGate:
      "No model contract asks the model to invent executor keys, node kinds, runtime ids, artifact refs, Work Queue lifecycle state, storage flags, or graph envelopes; focused tests cover repair and diagnostics.",
  },
];

const postProofRefactorItems = [
  {
    id: "openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes",
    title: "Cross-Workflow Orchestration Proof Lanes",
    priorityClass: "P1",
    reason:
      "Cross-workflow proof expansion remains useful after Product/Spec, but is not required to remove stale Product/Spec proof/runtime topology before the next proof.",
  },
  {
    id: "openclaw-convergence.runtime-artifact-retention-pruning-policy",
    title: "Runtime Artifact Retention And Pruning Policy",
    priorityClass: "P2",
    reason:
      "Operational retention/pruning follows proof of the active path; not a direct blocker for stale topology or compatibility bypass cleanup.",
  },
  {
    id: "openclaw-convergence.scheduler-phase-budget-governor",
    title: "Scheduler Phase Budget Governor",
    priorityClass: "P2",
    reason:
      "Phase budgets are post-proof optimization unless the next proof exposes budget churn as the blocking failure.",
  },
  {
    id: "openclaw-convergence.work-queue-frontier-delta-stream",
    title: "Work Queue Frontier Delta Stream And Branch Controls",
    priorityClass: "P2",
    reason:
      "Delta stream/control UX follows stable compact readback; not required before the next proof.",
  },
];

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
    sha256: sha256(body),
  };
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function upsertItem(sql, item, rank, timing, now) {
  const metadata = {
    artifactKind: "execution_platform.pre_product_spec_modularization_work_item",
    sourceSpecRef,
    specSectionRef: item.specSectionRef ?? null,
    beforeProductSpec: timing === "pre_product_spec",
    postProductSpec: timing === "post_product_spec",
    priorityClass: item.priorityClass,
    promotedBeforeProductSpec: timing === "pre_product_spec",
    productSpecProofItemId: productSpecItemId,
    scope: item.scope ?? [],
    successGate: item.successGate ?? null,
    promotionReason:
      timing === "pre_product_spec"
        ? "Stale proof/runtime topology and monolithic responsibility drift are now Product/Spec proof risks."
        : (item.reason ?? null),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_insert_or_reprioritize",
  };

  await sql.query(
    `
      INSERT INTO execution_platform.work_items (
        work_item_id,
        item_type,
        title,
        description,
        queue_status,
        queue_rank,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
      ON CONFLICT (work_item_id) DO UPDATE
      SET title = EXCLUDED.title,
          description = COALESCE(NULLIF(EXCLUDED.description, ''), execution_platform.work_items.description),
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          queue_rank = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
              THEN execution_platform.work_items.queue_rank
            ELSE EXCLUDED.queue_rank
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [
      item.id,
      item.itemType ?? "platform_refactor",
      item.title,
      item.description ?? item.reason ?? "",
      rank,
      JSON.stringify(metadata),
      now,
    ],
  );
}

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const managedIds = [
    ...preProofItems.map((item) => item.id),
    productSpecItemId,
    ...postProofRefactorItems.map((item) => item.id),
  ];

  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const managedRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
        AND queue_status IN ('active','blocked','needs_review')
        AND queue_rank IS NOT NULL
    `,
    [managedIds],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS queue_rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const managedRanks = managedRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const productRank = Number(
    productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.queue_rank ?? 1,
  );
  const baseRank = managedRanks.length > 0 ? Math.min(...managedRanks) : productRank;

  for (const [index, item] of preProofItems.entries()) {
    await upsertItem(sql, item, baseRank + index, "pre_product_spec", now);
  }

  const productRankAfter = baseRank + preProofItems.length;
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_rank = CASE
            WHEN queue_status IN ('active','blocked','needs_review') THEN $1
            ELSE queue_rank
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = $3::timestamptz
      WHERE work_item_id = $4
    `,
    [
      productRankAfter,
      JSON.stringify({
        sourceSpecRef,
        blockedByPreProofModularizationWorkItemIds: preProofItems.map((item) => item.id),
        productSpecProofSequencing: "after_pre_product_spec_modularization_and_boundary_cleanup",
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_pre_proof_modularization",
      }),
      now,
      productSpecItemId,
    ],
  );

  for (const [index, item] of postProofRefactorItems.entries()) {
    await upsertItem(sql, item, productRankAfter + 1 + index, "post_product_spec", now);
  }

  const activeRows = await sql.query(
    `
      SELECT work_item_id, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );

  const managedSet = new Set(managedIds);
  const existingManagedSet = new Set(
    activeRows.rows.map((row) => row.work_item_id).filter((id) => managedSet.has(id)),
  );
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSet.has(id));
  const normalized = [...managedIds.filter((id) => existingManagedSet.has(id)), ...remaining];

  for (const [index, id] of normalized.entries()) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
          AND queue_status IN ('active','blocked','needs_review')
      `,
      [baseRank + index, now, id],
    );
  }

  const topRows = await sql.query(
    `
      SELECT
        work_item_id,
        title,
        queue_status,
        queue_rank,
        metadata->>'priorityClass' AS priority_class,
        metadata->>'beforeProductSpec' AS before_product_spec,
        metadata->>'promotedBeforeProductSpec' AS promoted_before_product_spec,
        metadata->>'sourceSpecRef' AS source_spec_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 80
    `,
  );

  const artifactRef = writeArtifact("pre-product-spec-modularization-queue-update.json", {
    artifactKind: "pre_product_spec_modularization_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    productSpecItemId,
    productRankBefore: productRank,
    productRankAfter,
    baseRank,
    preProofItemIds: preProofItems.map((item) => item.id),
    postProofRefactorItemIds: postProofRefactorItems.map((item) => item.id),
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "pre_product_spec_modularization_queue_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseName: runtime.resolution.databaseName,
        artifactRef,
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );

  if (typeof runtime.close === "function") {
    await Promise.race([runtime.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
