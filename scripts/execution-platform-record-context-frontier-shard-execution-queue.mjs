#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.context-frontier-shard-execution-merge-lifecycle";
const parentWorkItemId = "openclaw-convergence.context-frontier-lifecycle-shard-manifests";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/context-frontier-shard-execution-and-merge-lifecycle.md";
const parentSpecRef =
  "docs/projects/execution-platform/specs/context-frontier-lifecycle-and-shard-manifests.md";
const governingSpecRefs = [
  sourceSpecRef,
  parentSpecRef,
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md",
  "docs/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair.md",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
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

async function main() {
  const api = await executionPlatformApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const activeRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const parentRow = activeRows.rows.find((row) => row.work_item_id === parentWorkItemId);
  const productRow = activeRows.rows.find((row) => row.work_item_id === productSpecItemId);
  const activeRanks = activeRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const baseRank = Number.isFinite(Number(parentRow?.queue_rank))
    ? Number(parentRow.queue_rank)
    : Number.isFinite(Number(productRow?.queue_rank))
      ? Number(productRow.queue_rank)
      : activeRanks.length > 0
        ? Math.min(...activeRanks)
        : 1;

  const metadata = {
    artifactKind: "execution_platform.context_frontier_shard_execution_work_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: `${sourceSpecRef}#acceptance-criteria`,
    beforeProductSpec: true,
    priorityClass: "P0",
    parentWorkItemId,
    productSpecProofItemId: productSpecItemId,
    replayEvidenceRuntimeJobId: "product-spec-replay-mpmz6z7v",
    replayFailureClass: "context_frontier_shard_execution_required_without_handoff_merge_lifecycle",
    problemEvidence: {
      graphNodeCount: 17,
      graphEdgeCount: 21,
      contextFrontierRequestArtifactCount: 8,
      contextShardManifestArtifactCount: 5,
      contextMergePacketArtifactCount: 5,
      singleUnitBlockerArtifactCount: 3,
      terminalRootCauseBoundary: "resource_requirement_repair",
      repeatedBlocker:
        "work_intent_context_failed_supply_nodes_present_and_resource_handoff_refs_missing",
      terminalReasonCodes: [
        "context_frontier_shard_manifest_ready",
        "context_frontier_shard_execution_required",
        "context_frontier_merge_required_before_consumer_readiness",
        "work_intent_resource_handoff_refs_missing",
        "scheduler_frontier_root_cause_boundary:resource_requirement_repair",
      ],
    },
    scope: [
      "context_frontier_execute_shard_packet",
      "context_frontier_record_shard_result",
      "context_scout_shard_brief",
      "context_scout_model_authored_shard_handoff",
      "context_shard_handoff_contract",
      "context_merge_packet_acceptance",
      "context_review_shard_handoffs",
      "workintent_context_satisfaction_state",
      "scheduler_accept_context_for_consumer",
      "scheduler_promote_context_satisfied_intent",
      "single_unit_scope_revision",
      "completed_packets_replay_repeat",
    ],
    smallVerbTools: [
      "context.frontier.execute_shard_packet",
      "context.frontier.record_shard_result",
      "context.frontier.record_single_unit_blocker",
      "resource.requirement.merge_handoffs",
      "context.review_shard_handoffs",
      "scheduler.accept_context_for_consumer",
      "scheduler.promote_context_satisfied_intent",
      "scheduler.request_context_scope_revision",
      "context_scout.get_shard_brief",
      "context_scout.request_repo_ref",
      "context_scout.report_relevant_file",
      "context_scout.report_existing_pattern",
      "context_scout.report_risk",
      "context_scout.recommend_edit_point",
      "context_scout.recommend_validation",
      "context_scout.submit_shard_handoff",
      "context_scout.mark_insufficient_context",
    ],
    successGate:
      "Replay from completed packets reaches context shard execution, model-authored shard handoffs, merge packet acceptance or precise single-unit blocker, and canonical WorkIntent context state without graph-node shard explosion, default synthesis, graph repair/no-progress relapse, runtime semantic truncation, or generic worker adapter failure.",
    anticipatedDownstreamFailureClasses: [
      "single_unit_over_profile_scope_revision",
      "weak_shard_handoff_substance",
      "target_selection_resource_materialization_gap",
      "implementation_worker_edit_loop_failure",
      "validation_evidence_closure_gap",
      "readback_drift",
      "provider_diagnostics_latency_gap",
    ],
    semanticJudgmentOwner:
      "model_or_human_authored_context_relevance_scope_sufficiency_limitations_target_selection_and_consumer_waiver",
    runtimeAuthority:
      "ids_refs_hashes_payload_manifests_exact_provider_preflight_structural_split_shard_execution_lifecycle_storage_bounds_readback_projection",
    deterministicSemanticJudgmentAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "context_frontier_shard_execution_insert_or_reprioritize",
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
      workItemId,
      "Context Frontier Shard Execution And Merge Lifecycle",
      "Execute payload-backed context shard packets, collect model-authored shard handoffs, merge them into canonical WorkIntent context satisfaction, and repeat the failed Product/Spec completed-packets replay before the full proof.",
      baseRank,
      JSON.stringify(metadata),
      now,
    ],
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        decomposedByContextFrontierShardExecutionItem: workItemId,
        parentFoundationForContextFrontierShardExecution: true,
        sourceSpecRef: parentSpecRef,
        followUpSpecRef: sourceSpecRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "context_frontier_parent_metadata_follow_up",
      }),
      now,
      parentWorkItemId,
    ],
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        blockedByContextFrontierShardExecutionMergeLifecycle: workItemId,
        productSpecProofSequencing: "after_context_frontier_shard_execution_merge_lifecycle",
        sourceSpecRef,
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_context_frontier_shard_execution",
      }),
      now,
      productSpecItemId,
    ],
  );

  const activeAfterInsert = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const managedIds = new Set([workItemId, parentWorkItemId, productSpecItemId]);
  const remainingIds = activeAfterInsert.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedIds.has(id));
  const normalizedIds = [workItemId, parentWorkItemId, productSpecItemId, ...remainingIds];

  for (const [index, id] of normalizedIds.entries()) {
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
        metadata->>'blockedByContextFrontierShardExecutionMergeLifecycle' AS blocked_by_context_frontier_shard_execution,
        metadata->>'decomposedByContextFrontierShardExecutionItem' AS decomposed_by_context_frontier_shard_execution
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 30
    `,
  );

  const artifactRef = writeArtifact("context-frontier-shard-execution-queue-update.json", {
    artifactKind: "context_frontier_shard_execution_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    workItemId,
    parentWorkItemId,
    productSpecItemId,
    sourceSpecRef,
    governingSpecRefs,
    baseRank,
    parentRank: baseRank + 1,
    productRank: baseRank + 2,
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
    lifecycleMutationKind: "context_frontier_shard_execution_queue_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        status: "ok",
        artifactRef,
        workItemId,
        parentWorkItemId,
        productSpecItemId,
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
