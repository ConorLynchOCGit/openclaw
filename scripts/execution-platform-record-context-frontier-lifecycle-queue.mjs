#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.context-frontier-lifecycle-shard-manifests";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/context-frontier-lifecycle-and-shard-manifests.md";
const governingSpecRefs = [
  sourceSpecRef,
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
  const productRow = activeRows.rows.find((row) => row.work_item_id === productSpecItemId);
  const baseRank = Number.isFinite(Number(productRow?.queue_rank))
    ? Number(productRow.queue_rank)
    : Number(activeRows.rows[0]?.queue_rank ?? 1);

  const metadata = {
    artifactKind: "execution_platform.context_frontier_lifecycle_work_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: `${sourceSpecRef}#acceptance-criteria`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    replayEvidenceRuntimeJobId: "product-spec-replay-mpmx7eng",
    replayFailureClass: "context_frontier_shard_graph_fanout_and_output_ref_overflow",
    problemEvidence: {
      graphNodeCountApprox: 158,
      graphEdgeCountApprox: 162,
      contextScoutExecutionPacketArtifactCountApprox: 149,
      terminalReasonCodes: [
        "context_scout_payload_over_profile_bound",
        "context_scout_structural_reshard_by_commitment_required",
        "output_artifact_refs_exceeds_24_items",
        "worker_adapter_threw_unclassified",
      ],
    },
    scope: [
      "context_frontier_request",
      "context_shard_manifest",
      "context_scout_shard_execution_packet",
      "context_shard_handoff",
      "context_merge_packet",
      "workintent_context_satisfaction_state",
      "manifest_only_graph_refs_for_shards",
      "context_frontier_readback_gate",
      "single_unit_over_profile_blocker",
      "no_default_graph_node_per_context_shard",
    ],
    smallVerbTools: [
      "resource.requirement.create_frontier_request",
      "resource.requirement.split_for_profile",
      "context.frontier.persist_shard_manifest",
      "context.frontier.record_single_unit_blocker",
      "context.frontier.mark_shards_ready",
      "context_scout.get_shard_brief",
      "context_scout.request_repo_ref",
      "context_scout.report_relevant_file",
      "context_scout.report_existing_pattern",
      "context_scout.report_risk",
      "context_scout.recommend_edit_point",
      "context_scout.recommend_validation",
      "context_scout.submit_shard_handoff",
      "context_scout.mark_insufficient_context",
      "resource.requirement.merge_handoffs",
      "context.review_shard_handoffs",
      "scheduler.accept_context_for_consumer",
      "scheduler.promote_context_satisfied_intent",
    ],
    successGate:
      "Replay from completed packets reaches merged context readiness or a precise single-unit-over-profile blocker without graph-node shard explosion, graph output-ref overflow, default context synthesis, runtime semantic truncation, or generic worker_adapter_threw classification.",
    semanticJudgmentOwner:
      "model_or_human_authored_context_scope_relevance_sufficiency_limitations_and_consumer_waiver",
    runtimeAuthority:
      "ids_refs_hashes_payload_manifests_exact_provider_preflight_structural_split_lifecycle_storage_bounds_readback_projection",
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
    lifecycleMutationKind: "context_frontier_lifecycle_insert_or_reprioritize",
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
    [
      workItemId,
      "Context Frontier Lifecycle And Shard Manifests",
      "Replace graph-level context shard explosion with payload-backed context frontier requests, shard manifests, shard handoffs, merge packets, consumer context satisfaction state, and precise readback before the Product/Spec proof resumes.",
      baseRank,
      JSON.stringify(metadata),
      now,
    ],
  );

  const orderedIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => id !== workItemId && id !== productSpecItemId);
  const normalizedIds = [workItemId, productSpecItemId, ...orderedIds];

  for (const [index, id] of normalizedIds.entries()) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            metadata = CASE
              WHEN work_item_id = $3
                THEN COALESCE(metadata, '{}'::jsonb) || $4::jsonb
              ELSE metadata
            END,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
          AND queue_status IN ('active','blocked','needs_review')
      `,
      [
        baseRank + index,
        now,
        id,
        JSON.stringify(
          id === productSpecItemId
            ? {
                blockedByContextFrontierLifecycle: workItemId,
                productSpecProofSequencing:
                  "after_context_frontier_lifecycle_shard_manifests",
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
                lifecycleMutationKind: "product_spec_rank_after_context_frontier_lifecycle",
              }
            : {},
        ),
      ],
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
        metadata->>'blockedByContextFrontierLifecycle' AS blocked_by_context_frontier
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 30
    `,
  );

  const artifactRef = writeArtifact("context-frontier-lifecycle-queue-update.json", {
    artifactKind: "context_frontier_lifecycle_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    workItemId,
    productSpecItemId,
    sourceSpecRef,
    governingSpecRefs,
    baseRank,
    productRank: baseRank + 1,
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
    lifecycleMutationKind: "context_frontier_lifecycle_queue_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        status: "ok",
        artifactRef,
        workItemId,
        productSpecItemId,
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
