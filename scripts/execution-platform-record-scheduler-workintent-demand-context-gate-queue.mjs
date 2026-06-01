#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.scheduler-workintent-graph-demand-context-gate";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md";
const governingSpecRefs = [
  sourceSpecRef,
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
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
    sha256: sha256(body),
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

  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const productRank = Number(productRows.rows[0]?.queue_rank);
  const baseRank = Number.isFinite(productRank)
    ? productRank
    : Number(fallbackRows.rows[0]?.rank ?? 1);

  const metadata = {
    artifactKind: "execution_platform.scheduler_workintent_graph_demand_context_gate_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: `${sourceSpecRef}#acceptance-criteria`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    replayEvidenceRuntimeJobId: "product-spec-replay-mpm4bf5q",
    replayFailureClass: "workintent_graph_resource_fulfillment_gate_mismatch",
    scope: [
      "strict_work_intent_graph_acceptance",
      "resource_requirement_packet_before_context_scout",
      "orphan_context_scout_rejection",
      "multi_node_zero_edge_graph_rejection",
      "first_open_gate_graph_invalid_projection",
      "demand_driven_context_default",
      "regression_tests_for_failed_replay_shape",
    ],
    successGate:
      "Completed-packets replay cannot advance through orphan context_scout nodes or multi-node zero-edge graphs; valid path is WorkIntentGraph -> NodeExecutionContract -> ResourceRequirementPacket -> scoped context/resource execution.",
    semanticJudgmentOwner:
      "model_authored_execution_intent_capability_fit_context_sufficiency_and_quality",
    runtimeAuthority:
      "schema_ids_refs_edges_manifests_resource_requirements_readiness_lifecycle_bounds_projection",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "scheduler_workintent_graph_demand_context_gate_insert_or_reprioritize",
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
      "Scheduler WorkIntentGraph And Demand-Context Gate",
      "Enforce strict WorkIntentGraph acceptance, consumer-bound ResourceRequirementPacket context scouts, graph edge invariants, and graph-invalid first-open-gate projection before the Product/Spec proof resumes.",
      baseRank,
      JSON.stringify(metadata),
      now,
    ],
  );

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
      baseRank + 1,
      JSON.stringify({
        blockedBySchedulerWorkIntentGraphDemandContextGate: workItemId,
        productSpecProofSequencing: "after_scheduler_workintent_graph_demand_context_gate",
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
        lifecycleMutationKind: "product_spec_rank_after_scheduler_workintent_gate",
      }),
      now,
      productSpecItemId,
    ],
  );

  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const orderedIds = activeRows.rows.map((row) => row.work_item_id);
  const withoutManaged = orderedIds.filter((id) => id !== workItemId && id !== productSpecItemId);
  const normalizedIds = [workItemId, productSpecItemId, ...withoutManaged];

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
        metadata->>'sourceSpecRef' AS source_spec_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 24
    `,
  );

  const artifactRef = writeArtifact("scheduler-workintent-demand-context-gate-queue-update.json", {
    artifactKind: "scheduler_workintent_graph_demand_context_gate_queue_update",
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
    lifecycleMutationKind: "scheduler_workintent_graph_demand_context_gate_queue_reprioritize",
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

  await runtime.pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
