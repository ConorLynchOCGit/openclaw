#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const sourceSpecRef =
  "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";

const preProofItems = [
  {
    id: "openclaw-convergence.graphpatch-payload-progress-compaction",
    title: "GraphPatch Payload Store And Progress Compaction",
    description:
      "Move large runtime graph mutations and scheduler progress bodies into payload-backed GraphPatch artifacts with compact manifest-only progress/latest-run-state refs so large workflows cannot fail from scheduler_progress metadata overflow.",
    specRef:
      "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md#recommendation-1-graphpatch-payload-store",
    priorityClass: "P0",
    scope: [
      "runtime_graph_patch_payload_store",
      "scheduler_progress_manifest_only",
      "latest_run_state_graph_patch_refs",
      "large_graph_progress_metadata_guard",
      "work_queue_graph_patch_readback",
      "failed_product_spec_graph_replay_no_metadata_overflow",
    ],
    successGate:
      "The latest failed Product/Spec graph and a synthetic large graph write graph patches/progress with bounded metadata, full graph bodies in payload refs, and Work Queue readback can show patch counts/current phase without artifact metadata overflow.",
  },
  {
    id: "openclaw-convergence.demand-driven-context-broker-lazy-readiness",
    title: "Demand-Driven Context Broker And Lazy Readiness",
    description:
      "Add a runtime-owned context broker so implementation-bearing nodes request missing context/resources as needed, inherit parent context where valid, dedupe requests, and keep edits blocked until NodeReadinessState is executable.",
    specRef:
      "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md#recommendation-9-demand-driven-context-broker",
    priorityClass: "P0",
    scope: [
      "context_request_contract",
      "context_broker_dedupe_cache_inheritance",
      "lazy_context_scout_dispatch",
      "consumer_scoped_context_limitations",
      "node_readiness_context_request_state",
      "implementation_plan_allowed_before_edit",
      "edit_blocked_until_executable_readiness",
    ],
    successGate:
      "Implementation nodes can request context/resources and continue local planning without editing; unrelated ready branches continue; missing context is branch-local readiness evidence, not worker failure.",
  },
  {
    id: "openclaw-convergence.expansion-controller-dynamic-fanout-admission",
    title: "Expansion Controller And Dynamic Fanout Admission",
    description:
      "Add graph expansion admission budgets, paging, fanout justification, and ready-frontier deferral so scheduler iterations cannot create huge speculative context/resource graphs before useful execution.",
    specRef:
      "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md#recommendation-2-expansion-controller",
    priorityClass: "P0",
    scope: [
      "expansion_admission_decision",
      "new_node_edge_budget",
      "fanout_cost_estimate",
      "ready_frontier_defers_speculative_expansion",
      "paged_split_task_graph_mutations",
      "no_consumer_fanout_rejection",
    ],
    successGate:
      "Large split/fanout decisions are paged or deferred when a ready frontier exists; fanout without consumers is diagnostic-only; expansion no-progress halts with root cause.",
  },
  {
    id: "openclaw-convergence.superstep-frontier-runtime-branch-results",
    title: "Superstep Frontier Runtime And Branch Results",
    description:
      "Promote parallel ready-frontier execution into supersteps with branch-local result records, lock-aware parallelism, sibling evidence survival, and recoverable branch repair routing.",
    specRef:
      "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md#recommendation-4-superstep-frontier-runtime",
    priorityClass: "P0",
    scope: [
      "superstep_frontier_evaluation",
      "branch_result_contract",
      "lock_aware_parallel_execution",
      "sibling_evidence_survival",
      "branch_local_failure_repair",
      "mission_ledger_claim_batched_evaluation",
    ],
    successGate:
      "Independent ready implementation/resource branches run concurrently; one branch failure does not terminalize the whole worker adapter; branch results drive repair/evidence/readback.",
  },
  {
    id: "openclaw-convergence.readback-projection-replay-boundary-expansion",
    title: "Readback Projection And Replay Boundary Expansion",
    description:
      "Rewrite owner readback around compact latest-run-state plus payload manifests and add replay boundaries around graph patch, context request, resource materialization, worker invocation, validation, and closeout.",
    specRef:
      "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md#recommendation-7-replay-boundary-expansion",
    priorityClass: "P0",
    scope: [
      "compact_readback_projection",
      "graph_patch_replay_boundary",
      "context_request_replay_boundary",
      "resource_materialization_replay_boundary",
      "worker_invocation_replay_boundary",
      "validation_replay_boundary",
      "stale_gate_disagreement_guard",
    ],
    successGate:
      "The latest Product/Spec failure can restart at the graph/resource boundary without rerunning Mission Ledger/packets/context scouts, and Work Queue readback shows current node/branch/model/tool/blocker/next transition from compact state.",
  },
];

const diagnosticAfterProofItems = [
  {
    id: "openclaw-convergence.mission-ledger-stability-diagnostics",
    title: "Mission Ledger Stability Diagnostics",
    description:
      "Keep Mission Ledger/packet variance measurement as diagnostic proof infrastructure after the demand-driven frontier proof unless packet coverage or rescue dependence becomes the active blocker again.",
    specRef:
      "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md#mission-ledger-stability-diagnostics",
    priorityClass: "P1",
  },
  {
    id: "openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler",
    title: "Staged Mission Ledger Obligation Candidate Compiler",
    description:
      "Retain the staged Mission Ledger compiler as diagnostic/proof-only infrastructure behind explicit flags; it is not the production path for the next Product/Spec proof.",
    specRef:
      "docs/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler.md",
    priorityClass: "P2",
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
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

async function upsertWorkItem(sql, item, rank, beforeProductSpec) {
  const now = new Date().toISOString();
  const metadata = {
    artifactKind: "execution_platform.demand_driven_frontier_work_item",
    sourceSpecRef,
    specSectionRef: item.specRef,
    beforeProductSpec,
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    scope: item.scope ?? [],
    successGate: item.successGate ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_insert_and_reprioritize",
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
      SET title = EXCLUDED.title,
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
    [item.id, item.title, item.description, rank, JSON.stringify(metadata), now],
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
    ...diagnosticAfterProofItems.map((item) => item.id),
  ];

  const rankRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
        AND (work_item_id = $1 OR work_item_id = ANY($2::text[]))
        AND queue_rank IS NOT NULL
    `,
    [productSpecItemId, diagnosticAfterProofItems.map((item) => item.id)],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const baseRank =
    rankRows.rows.length > 0
      ? Math.min(...rankRows.rows.map((row) => Number(row.queue_rank)).filter(Number.isFinite))
      : Number(fallbackRows.rows[0]?.rank ?? 1);

  for (const [index, item] of preProofItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, true);
  }

  const productRank = baseRank + preProofItems.length;
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
        blockedByDemandDrivenFrontierWorkItemIds: preProofItems.map((item) => item.id),
        productSpecProofSequencing:
          "after_graphpatch_payload_progress_compaction_context_broker_expansion_controller_superstep_frontier_readback_replay",
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      now,
      productSpecItemId,
    ],
  );

  for (const [index, item] of diagnosticAfterProofItems.entries()) {
    await upsertWorkItem(sql, item, productRank + 1 + index, false);
  }

  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const managedSet = new Set(managedIds);
  const existingManaged = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => managedSet.has(id));
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSet.has(id));
  const normalized = [...existingManaged, ...remaining];

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
        metadata->>'specSectionRef' AS spec_section_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );

  const artifactRef = writeArtifact("demand-driven-frontier-work-queue-update.json", {
    artifactKind: "demand_driven_frontier_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    productSpecItemId,
    baseRank,
    preProofItemIds: preProofItems.map((item) => item.id),
    diagnosticAfterProofItemIds: diagnosticAfterProofItems.map((item) => item.id),
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_insert_and_reprioritize",
  });

  console.log(JSON.stringify({ ok: true, artifactRef, topActiveItems: topRows.rows }, null, 2));

  if (typeof runtime.close === "function") {
    await Promise.race([runtime.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
