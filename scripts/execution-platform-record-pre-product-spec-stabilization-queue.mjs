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
  "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md";

const preProofItems = [
  {
    id: "openclaw-convergence.runtime-artifact-contract-registry-payload-boundary",
    title: "Runtime Artifact Contract Registry And Payload Boundary",
    description:
      "Add typed runtime artifact contracts and enforce payload-backed body storage plus bounded manifest metadata for packet, context, resource, scheduler, and runtime-result artifacts before the next Product/Spec proof.",
    specRef:
      "docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md",
    priorityClass: "P0",
    scope: [
      "runtime_artifact_contract_registry",
      "contract_aware_attach_api",
      "contract_aware_hydration_api",
      "body_bearing_artifacts_payload_required",
      "metadata_manifest_only_enforcement",
      "raw_storage_flag_guard",
      "legacy_checkpoint_hydration_diagnostics",
      "repo_guard_for_registered_artifact_types",
    ],
    successGate:
      "Latest failed Product/Spec graph and a large synthetic graph can attach/hydrate body-bearing artifacts through payload refs with bounded metadata manifests; registered body-bearing artifacts reject metadata body writes; raw storage flags remain false.",
  },
  {
    id: "openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle",
    title: "Scheduler Frontier, No-Progress, And Evaluation Throttle",
    description:
      "Make the scheduler run ready executable frontiers before more prerequisite expansion, treat reused-only graph decisions as no-progress, and batch Mission Ledger evaluation for context-only phases.",
    specRef:
      "docs/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle.md",
    priorityClass: "P0",
    scope: [
      "ready_frontier_priority",
      "no_progress_signature",
      "reused_node_edge_no_progress",
      "root_cause_halt",
      "context_only_mission_ledger_evaluation_throttle",
      "semantic_repair_intent_runtime_graph_compile",
      "work_queue_frontier_readback",
    ],
    successGate:
      "Replay shows executable frontier branches run before new context/prerequisite expansion; reused-only graph decisions halt with root-cause diagnostics; context-only events do not spam global Mission Ledger evaluation.",
  },
  {
    id: "openclaw-convergence.operator-frontier-readback-latest-run-state",
    title: "Operator Frontier Readback And Latest Run State",
    description:
      "Extend compact latest-run-state and Work Queue active graph readback with branch-level model/tool/node/phase/blocker/readiness/evidence/next-transition state for long graph executions.",
    specRef:
      "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
    priorityClass: "P0",
    scope: [
      "latest_run_active_frontier",
      "branch_level_readback",
      "boundary_state_writes",
      "stale_pending_retry_prevention",
      "token_walltime_projection",
      "work_queue_active_graph_projection",
    ],
    successGate:
      "Operator readback can identify current selected/running/blocked nodes, branch blockers, readiness refs, tool/model state, token/wall-clock state, and next legal transition without scanning artifact trees.",
  },
  {
    id: "openclaw-convergence.product-spec-large-graph-storage-scheduler-lane",
    title: "Large Graph Storage And Scheduler Lane",
    description:
      "Run a provider-free large-graph lane using the latest Product/Spec failure shape and a synthetic 75-100 node graph to prove artifact contracts, scheduler no-progress handling, frontier priority, and bounded readback before the proof.",
    specRef:
      "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md#large-graph-storage-and-scheduler-lane",
    priorityClass: "P0",
    scope: [
      "large_graph_fixture",
      "latest_failed_graph_replay",
      "payload_backed_packet_context_resource_artifacts",
      "bounded_runtime_result_manifest",
      "scheduler_ready_frontier_fixture",
      "scheduler_no_progress_fixture",
      "mission_ledger_context_throttle_fixture",
      "compact_readback_fixture",
    ],
    successGate:
      "Large graph storage stays under metadata limits, ready frontier executes first, no-progress guard trips in the repeated-reuse fixture, and readback captures current state compactly.",
  },
  {
    id: "openclaw-convergence.mission-ledger-stability-diagnostics",
    title: "Mission Ledger Stability Diagnostics",
    description:
      "Run a diagnostic preflight comparing repeated Product/Spec Mission Ledger and Commitment Work Packet outputs for commitment coverage, packet completeness, no-content retry, GPT rescue, token, and wall-clock stability.",
    specRef:
      "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md#mission-ledger-stability-diagnostics",
    priorityClass: "P1",
    scope: [
      "mission_ledger_repeated_run_comparison",
      "commitment_coverage_diff",
      "commitment_work_packet_completeness_diff",
      "qwen_no_content_retry_diagnostics",
      "gpt_rescue_count_gate",
      "token_walltime_variance_report",
    ],
    successGate:
      "Preflight records whether Mission Ledger/packet variance is acceptable; proof reports rescue/no-content events as proof concerns instead of hiding them as success.",
  },
  {
    id: "openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler",
    title: "Staged Mission Ledger Obligation Candidate Compiler",
    description:
      "Replace unstable Mission Ledger commitment identity and packet rescue dependence with model-authored source-anchored obligation candidates, runtime-compiled canonical commitments, packet briefs from canonical commitments only, exact fast-model no-content diagnostics, and failed-packet replay gates.",
    specRef:
      "docs/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler.md",
    priorityClass: "P0",
    scope: [
      "source_prompt_structural_anchors",
      "objective_constraints_extraction",
      "obligation_candidate_extraction",
      "runtime_compiled_candidate_refs",
      "model_authored_candidate_review_plan",
      "runtime_compiled_canonical_commitments",
      "commitment_packet_semantic_briefs",
      "fast_model_no_content_reason_classes",
      "failed_packet_replay_lane",
      "mission_ledger_stability_v2_cleanliness_gate",
    ],
    successGate:
      "Repeated Product/Spec packet-boundary proof produces stable canonical commitment ids/counts, one packet per canonical commitment, classified no-content diagnostics when provider failures occur, and no silent GPT-5.5 rescue dependence.",
  },
];

const postProofFollowUps = [
  {
    id: "openclaw-convergence.runtime-artifact-retention-pruning-policy",
    title: "Runtime Artifact Retention And Pruning Policy",
    description:
      "Add domain-aware retention, pruning, compaction, and archival policy for payload-backed runtime artifacts after Product/Spec proves the path.",
    specRef:
      "docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md#natural-follow-ons",
    priorityClass: "P2",
  },
  {
    id: "openclaw-convergence.scheduler-phase-budget-governor",
    title: "Scheduler Phase Budget Governor",
    description:
      "Add workflow-specific phase budgets, graph growth ratio guards, and model-cost governor integration after Product/Spec proof.",
    specRef:
      "docs/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle.md#natural-follow-ons",
    priorityClass: "P2",
  },
  {
    id: "openclaw-convergence.work-queue-frontier-delta-stream",
    title: "Work Queue Frontier Delta Stream And Branch Controls",
    description:
      "Promote active frontier readback into a live delta stream with branch-level pause/resume/cancel controls after Product/Spec proof.",
    specRef:
      "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md#natural-follow-ons",
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

async function upsertWorkItem(sql, item, rank, timing) {
  const now = new Date().toISOString();
  const beforeProductSpec = timing === "pre_product_spec";
  const metadata = {
    artifactKind: "execution_platform.pre_product_spec_stabilization_work_item",
    sourceSpecRef,
    specSectionRef: item.specRef,
    beforeProductSpec,
    recommendedImmediatelyAfterProductSpec: timing === "post_product_spec",
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
    ...postProofFollowUps.map((item) => item.id),
  ];

  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const currentManagedRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
        AND work_item_id = ANY($1::text[])
        AND queue_rank IS NOT NULL
    `,
    [managedIds],
  );
  const managedRanks = currentManagedRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const productRank = Number(productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);
  const baseRank = managedRanks.length > 0 ? Math.min(...managedRanks) : productRank;

  for (const [index, item] of preProofItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, "pre_product_spec");
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
        blockedByStabilizationWorkItemIds: preProofItems.map((item) => item.id),
        preflightDiagnosticWorkItemId: preProofItems[4].id,
        stagedMissionLedgerRepairWorkItemId: preProofItems[5].id,
        productSpecProofSequencing:
          "after_runtime_artifact_contract_registry_scheduler_frontier_readback_large_graph_lane_mission_ledger_stability_and_staged_obligation_compiler",
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

  for (const [index, item] of postProofFollowUps.entries()) {
    await upsertWorkItem(sql, item, productRankAfter + 1 + index, "post_product_spec");
  }

  const activeRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );

  const managedSet = new Set(managedIds);
  const existingManaged = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => managedSet.has(id));
  const existingManagedSet = new Set(existingManaged);
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
        metadata->>'specSectionRef' AS spec_section_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 80
    `,
  );

  const artifactRef = writeArtifact("pre-product-spec-stabilization-work-queue-update.json", {
    artifactKind: "pre_product_spec_stabilization_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    productSpecItemId,
    productRankBefore: productRank,
    productRankAfter,
    baseRank,
    preProofItemIds: preProofItems.map((item) => item.id),
    postProofFollowUpIds: postProofFollowUps.map((item) => item.id),
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
