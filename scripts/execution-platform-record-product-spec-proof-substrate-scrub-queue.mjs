#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/product-spec-proof-failure-ledger-2026-05-20.md",
];
const productSpecItemId = "openclaw-convergence.active-queue-34";
const blocker06ItemId = "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates";

const items = [
  {
    id: "openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure",
    title: "Product/Spec Proof Substrate Scrub And Run-Scoped Closure",
    description:
      "Make stale Product/Spec proof artifacts impossible to count as closure: run-scoped proof manifests, manifest-required closeout, stale runtime/graph negative fixtures, retired topology admission blockers, and source inventory guards for shared mutable proof files.",
    rankOffset: 0,
    scope: [
      "ProductSpecProofRunManifest",
      "ProductSpecProofCleanlinessGate",
      "boundary_replay_run_scoped_artifacts",
      "manifest_required_closeout",
      "stale_replay_negative_fixture",
      "source_inventory_shared_artifact_guard",
    ],
    successGate:
      "A stale after-resource replay with retired context topology blocks as negative evidence, while a fresh Product/Spec replay can close only from a run-scoped manifest and run-scoped proof/admission/result artifacts.",
  },
  {
    id: "openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard",
    title: "Gateway Submit OOM Diagnostics And Memory Guard",
    description:
      "Add bounded submit-phase heap/payload diagnostics so a 4GB gateway OOM can be attributed to a measured submit phase without hiding the prompt from the router or storing raw prompt/provider/tool/DB bodies.",
    rankOffset: 1,
    scope: [
      "front_door_submit_heap_diagnostics",
      "workflow_summary_bytes",
      "conversation_context_bytes",
      "router_payload_bytes",
      "model_provider_phase_projection",
      "gateway_submit_oom_diagnostics_artifact",
    ],
    successGate:
      "Accepted and rejected front-door submit paths return bounded phase diagnostics, accepted runtime jobs attach submit diagnostics, and OOM investigation can distinguish prompt size from router/provider/artifact/enqueue/container memory pressure.",
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

async function main() {
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();
  const rankRows = await sql.query(
    `
      SELECT COALESCE(MIN(queue_rank), 1) AS rank
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
         OR queue_status IN ('active','blocked','needs_review')
    `,
    [[blocker06ItemId, productSpecItemId, ...items.map((item) => item.id)]],
  );
  const baseRank = Number(rankRows.rows[0]?.rank ?? 1);
  for (const item of items) {
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
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            queue_status = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived')
                THEN execution_platform.work_items.queue_status
              ELSE 'active'
            END,
            queue_rank = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived')
                THEN execution_platform.work_items.queue_rank
              ELSE EXCLUDED.queue_rank
            END,
            metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
      `,
      [
        item.id,
        item.title,
        item.description,
        baseRank + item.rankOffset,
        JSON.stringify({
          artifactKind: "execution_platform.product_spec_proof_substrate_scrub_queue_item",
          sourceSpecRefs,
          beforeProductSpec: true,
          priorityClass: "P0",
          scope: item.scope,
          successGate: item.successGate,
          semanticJudgmentOwner: "model_or_human",
          runtimeAuthority:
            "refs_hashes_lifecycle_status_topology_flags_memory_counters_payload_sizes_no_raw_storage",
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
          lifecycleMutationKind: "product_spec_proof_substrate_scrub_queue_upsert",
        }),
        now,
      ],
    );
  }
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
      baseRank + items.length,
      JSON.stringify({
        blockedByProductSpecProofSubstrateScrubItems: items.map((item) => item.id),
        sourceSpecRefs,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_proof_rank_after_substrate_scrub",
      }),
      now,
      blocker06ItemId,
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
      baseRank + items.length + 1,
      JSON.stringify({
        blockedByProductSpecProofSubstrateScrubItems: [
          ...items.map((item) => item.id),
          blocker06ItemId,
        ],
        sourceSpecRefs,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_proof_rank_after_substrate_scrub_and_middle_lane",
      }),
      now,
      productSpecItemId,
    ],
  );
  const managedIds = new Set([productSpecItemId, blocker06ItemId, ...items.map((item) => item.id)]);
  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const desiredHead = [...items.map((item) => item.id), blocker06ItemId, productSpecItemId];
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedIds.has(id));
  for (const [index, id] of [...desiredHead, ...remaining].entries()) {
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
  const rows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 12
    `,
  );
  const artifact = writeArtifact("product-spec-proof-substrate-scrub-queue-update.json", {
    artifactKind: "execution_platform.product_spec_proof_substrate_scrub_queue_update",
    databaseName: runtime.resolution.databaseName,
    sourceSpecRefs,
    itemIds: items.map((item) => item.id),
    blocker06ItemId,
    productSpecItemId,
    topActiveItems: rows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "product_spec_proof_substrate_scrub_queue_upsert",
  });
  console.log(JSON.stringify({ ok: true, artifact, topActiveItems: rows.rows }, null, 2));
  await runtime.pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
