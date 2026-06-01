#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRef =
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const supersededWorkItemIds = [
  "openclaw-convergence.context-frontier-shard-execution-merge-lifecycle",
  "openclaw-convergence.context-frontier-lifecycle-shard-manifests",
];

const governingSpecRefs = [
  sourceSpecRef,
  "docs/projects/execution-platform/specs/context-frontier-shard-execution-and-merge-lifecycle.md",
  "docs/projects/execution-platform/specs/context-frontier-lifecycle-and-shard-manifests.md",
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md",
  "docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md",
  "docs/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair.md",
  "docs/projects/execution-platform/specs/post-resource-implementation-task-compiler.md",
  "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
];

const blockerItems = [
  {
    id: "openclaw-convergence.blocker-closure-01-context-frontier-shard-tools",
    title: "Context Frontier Shard Tools And Handoff Merge",
    description:
      "Implement the missing context frontier small-verb lifecycle from shard manifest to shard execution, model-authored shard handoff, handoff review, merge packet, accepted consumer context state, and promotion to the next legal transition.",
    priorityClass: "P0",
    blockerNumbers: [1, 8, 9],
    scope: [
      "context.frontier.execute_shard_packet",
      "context.frontier.record_shard_result",
      "context_scout.report_relevant_file",
      "context_scout.report_existing_pattern",
      "context_scout.report_risk",
      "context_scout.recommend_edit_point",
      "context_scout.recommend_validation",
      "context_scout.submit_shard_handoff",
      "context_scout.mark_insufficient_context",
      "context.review_shard_handoffs",
      "resource.requirement.merge_handoffs",
      "scheduler.accept_context_for_consumer",
      "scheduler.promote_context_satisfied_intent",
      "accepted_with_limitations_context_waiver_preservation",
    ],
    modelTest:
      "Run a Product/Spec-class Qwen context shard handoff model test using real replay/source refs; require substantive relevant-file, existing-pattern, edit-point, validation, limitation, and final handoff tool calls.",
    successGate:
      "Replay from a ready ContextShardManifest executes shard packets, persists accepted model-authored ContextShardHandoff refs, merges them into consumer-bound context state, and never asks the scheduler to repair graph shape as a lifecycle substitute.",
  },
  {
    id: "openclaw-convergence.blocker-closure-02-scope-revision-repair-payloads",
    title: "Scope Revision And Field-Specific Repair Payloads",
    description:
      "Add a model-authored scope revision lane for single-unit over-profile blockers and replace full-prompt context scout repair with field-specific repair packets that cannot re-bloat provider inputs.",
    priorityClass: "P0",
    blockerNumbers: [2, 7],
    scope: [
      "ContextSingleUnitOverProfileBlocker",
      "ContextScopeRevisionRequest",
      "ContextScopeRevisionProposal",
      "scheduler.request_context_scope_revision",
      "context.scope.select_legal_subset",
      "context.frontier.accept_scope_revision",
      "ContextScoutRepairRequest",
      "context_scout.repair_missing_field",
      "context_scout.repair_invalid_ref",
      "context_scout.repair_handoff_summary",
      "context_scout.mark_repair_blocked",
      "provider_preflight_before_repair",
    ],
    modelTest:
      "Run a Product/Spec-class over-profile scope revision test where Qwen selects legal narrower refs/windows from real source/context units; runtime validates budget without truncating or ranking semantic content.",
    successGate:
      "Single-unit over-profile cases produce accepted model-authored narrower scope or precise unshardable blocker, and context scout repair prompts contain only accepted prior fields, exact missing fields, legal refs, and bounded context.",
  },
  {
    id: "openclaw-convergence.blocker-closure-03-workintent-context-target-selection",
    title: "WorkIntent Context Resolution And Target Selection",
    description:
      "Wire shard handoff refs into WorkIntentContextResolution and require model-authored target selection plus file-change intent after accepted context and before NodeExecutionPacket hydration.",
    priorityClass: "P0",
    blockerNumbers: [3, 4, 9, 10],
    scope: [
      "WorkIntentContextResolution_shard_handoff_refs",
      "ContextMergePacket.acceptedShardHandoffRefs",
      "ContextSatisfactionDecision",
      "ConsumerContextWaiver",
      "TargetSelectionRequest",
      "TargetSelectionProposal",
      "TargetSelectionDecision",
      "FileChangeIntent",
      "implementation.target_selection.request",
      "resource.selection.propose",
      "implementation.target_selection.accept",
      "implementation.target_selection.request_revision",
    ],
    modelTest:
      "Run a Product/Spec-class target selection model test from accepted context handoffs; require concrete target refs and FileChangeIntent objects, and reject broad directory authority as executable source-edit scope.",
    successGate:
      "Accepted context handoff refs satisfy WorkIntent context requirements, accepted-with-limitations remains blocked without consumer waiver, and source-edit NodeExecutionPacket hydration requires concrete model-authored target refs plus file-change intent.",
  },
  {
    id: "openclaw-convergence.blocker-closure-04-worker-readiness-edit-evidence",
    title: "Worker Readiness, Forced Edit, Validation, And Evidence",
    description:
      "Harden the worker boundary so a source-edit worker starts only from hydrated NodeExecutionPacket, snapshots, target selection, file-change intents, validation refs or structural fallback, commitment mapping, and context handoff refs.",
    priorityClass: "P0",
    blockerNumbers: [11],
    scope: [
      "NodeExecutionPacket_worker_readiness",
      "ImplementationTaskPacket",
      "WorkerSnapshotWindow",
      "WorkerPlanReadinessState",
      "worker.task.get_brief",
      "worker.context.request_file_snapshot",
      "worker.edit.plan",
      "worker.patch.force_author_from_plan",
      "worker.patch.author_edit",
      "worker.repair.mark_upstream_blocker",
      "worker.validation.run_structural_default",
      "worker.evidence.claim_from_validation",
    ],
    modelTest:
      "Run one meaningful Product/Spec-derived worker edit smoke on real Execution Platform source, with Codex review before persistence; the worker must produce a bounded edit or precise upstream blocker.",
    successGate:
      "The worker never receives an ambiguous source-edit job; plan -> forced patch author -> apply/blocker -> validation -> evidence is the only legal progress path once an edit plan is accepted.",
  },
  {
    id: "openclaw-convergence.blocker-closure-05-readback-rootcause-provider-diagnostics",
    title: "Readback, Root-Cause Collapse, And Provider Diagnostics",
    description:
      "Fix firstOpenGate/latest-run-state projection, collapse repeated frontier blockers, and project bounded Qwen/Kimi provider diagnostics for preflight, provider no-content, timeout, parser, and malformed tool-call cases.",
    priorityClass: "P0",
    blockerNumbers: [5, 6, 12],
    scope: [
      "canonical_first_open_gate_projection",
      "context_frontier_gate_names",
      "latest_run_state_frontier_projection",
      "frontier.record_no_progress_signature",
      "frontier.halt_repeated_root_cause",
      "readback.project_root_cause",
      "provider_diagnostics_response_shape",
      "structured_adapter_preflight_vs_provider_distinction",
      "usage_or_usage_unavailable_reason",
      "input_bundle_ref_hash_projection",
    ],
    modelTest:
      "Run replay/readback evidence against the latest Product/Spec boundary artifacts and at least one real provider event; prove owner readback reports actual gate, blocker, provider state, and next transition.",
    successGate:
      "Repeated equivalent blockers collapse once, sibling evidence survives, and readback reports context_frontier/context_shard_execution/context_single_unit_over_profile/work_intent_context_resolution/target_selection accurately with provider diagnostics.",
  },
  {
    id: "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
    title: "Product/Spec Middle-Lane Replay And Full Proof Gates",
    description:
      "Run the required middle-lane real-model tests, replay from completed packets and context-frontier/resource boundaries, then run the full Product/Spec proof only after the closure tranche passes.",
    priorityClass: "P0",
    blockerNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    scope: [
      "middle_lane_context_shard_model_test",
      "middle_lane_scope_revision_model_test",
      "middle_lane_target_selection_model_test",
      "middle_lane_worker_edit_smoke",
      "completed_packets_replay",
      "context_frontier_boundary_replay",
      "resource_materialization_boundary_replay",
      "full_product_spec_planning_proof",
      "walltime_phase_model_token_readback",
      "failure_catalogue_backlog_update",
    ],
    modelTest:
      "Use Product/Spec-class real work slices for all middle-lane gates before running the full long-form Product/Spec proof.",
    successGate:
      "The proof path reaches at least one real implementation edit, validation, evidence, reviewable diff, and owner readback, or stops with a precise architectural/toolification blocker that is not hidden behind generic needs_review.",
  },
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

async function executionPlatformApi() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function upsertWorkItem(sql, item, rank, now) {
  const metadata = {
    artifactKind: "execution_platform.code_verified_blocker_closure_work_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: `${sourceSpecRef}#${item.id.split(".").pop()}`,
    beforeProductSpec: true,
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    supersedesWorkItemIds: supersededWorkItemIds,
    blockerNumbers: item.blockerNumbers,
    scope: item.scope,
    modelTest: item.modelTest,
    successGate: item.successGate,
    semanticJudgmentOwner:
      "model_or_human_authored_scope_relevance_sufficiency_limitations_waivers_target_selection_file_change_intent_patch_semantics_closeout_judgment",
    runtimeAuthority:
      "schemas_refs_hashes_payloads_profile_bounds_lifecycle_authority_validation_execution_evidence_structure_readback_projection",
    deterministicSemanticJudgmentAllowed: false,
    productSpecSpecificSemanticClassifierAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "code_verified_blocker_closure_insert_or_reprioritize",
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
      VALUES ($1, 'platform_hardening', $2, $3, 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
      ON CONFLICT (work_item_id) DO UPDATE
      SET item_type = EXCLUDED.item_type,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          queue_rank = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived')
              THEN execution_platform.work_items.queue_rank
            ELSE EXCLUDED.queue_rank
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [item.id, item.title, item.description, rank, JSON.stringify(metadata), now],
  );
}

async function main() {
  const api = await executionPlatformApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const rankRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = $1
         OR work_item_id = ANY($2::text[])
         OR work_item_id = ANY($3::text[])
    `,
    [productSpecItemId, supersededWorkItemIds, blockerItems.map((item) => item.id)],
  );
  const fallbackRows = await sql.query(
    `
      SELECT COALESCE(MIN(queue_rank), 1) AS rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
    `,
  );
  const existingRanks = rankRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const baseRank =
    existingRanks.length > 0
      ? Math.min(...existingRanks)
      : Number(fallbackRows.rows[0]?.rank ?? 1);

  for (const [index, item] of blockerItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, now);
  }

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived') THEN queue_status
            ELSE 'superseded'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = ANY($3::text[])
    `,
    [
      JSON.stringify({
        supersededByCodeVerifiedBlockerClosureWorkItemIds: blockerItems.map((item) => item.id),
        supersededBySpecRef: sourceSpecRef,
        supersededReason:
          "Narrow context-frontier work split exposed additional code-verified blockers; active execution must close the complete tranche before Product/Spec proof.",
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "code_verified_blocker_closure_supersede_narrow_context_items",
      }),
      now,
      supersededWorkItemIds,
    ],
  );

  const productRank = baseRank + blockerItems.length;
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
      productRank,
      JSON.stringify({
        sourceSpecRef,
        blockedByCodeVerifiedBlockerClosureWorkItemIds: blockerItems.map((item) => item.id),
        productSpecProofSequencing:
          "after_code_verified_blocker_closure_middle_lane_replays_and_model_tests",
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_code_verified_blocker_closure",
      }),
      now,
      productSpecItemId,
    ],
  );

  const managedIds = new Set([
    ...blockerItems.map((item) => item.id),
    productSpecItemId,
    ...supersededWorkItemIds,
  ]);
  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const desiredHead = [...blockerItems.map((item) => item.id), productSpecItemId];
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedIds.has(id));
  const normalized = [...desiredHead, ...remaining];

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
        metadata->>'sourceSpecRef' AS source_spec_ref,
        metadata->'blockerNumbers' AS blocker_numbers,
        metadata->>'modelTest' AS model_test
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );
  const supersededRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank, metadata->>'supersededBySpecRef' AS superseded_by_spec_ref
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
      ORDER BY work_item_id ASC
    `,
    [supersededWorkItemIds],
  );

  const artifactRef = writeArtifact("code-verified-blocker-closure-queue-update.json", {
    artifactKind: "code_verified_blocker_closure_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    governingSpecRefs,
    productSpecItemId,
    baseRank,
    blockerWorkItemIds: blockerItems.map((item) => item.id),
    supersededWorkItemIds,
    supersededRows: supersededRows.rows,
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "code_verified_blocker_closure_queue_insert_supersede_and_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        status: "ok",
        artifactRef,
        blockerWorkItemIds: blockerItems.map((item) => item.id),
        supersededRows: supersededRows.rows,
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
