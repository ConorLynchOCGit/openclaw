#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const productSpecItemId = "openclaw-convergence.active-queue-34";
const massiveLeapSpecRef =
  "docs/projects/execution-platform/specs/native-agentic-coding-massive-leap.md";
const legacyPreProofItemIds = [
  "openclaw-convergence.native-harness-01-supervision-model-call-progress",
  "openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps",
  "openclaw-convergence.native-harness-03-non-codex-worker-convergence",
  "openclaw-convergence.native-harness-04-validation-executor-repair",
  "openclaw-convergence.native-harness-05-boundary-replay-checkpoints",
  "openclaw-convergence.non-codex-tool-worker-runtime",
];

const preProductSpecItems = [
  {
    id: "openclaw-convergence.native-leap-01-provider-tool-call-capability-separation",
    title: "Provider Tool-Call Capability Separation And Kimi Controller Retirement",
    description:
      "Separate controller, patch-author, repair, and evidence model slots; retire unqualified Kimi-as-controller behavior for critical edits while preserving qualified Kimi patch-author use.",
    scope: [
      "provider_role_slot_separation",
      "kimi_controller_retirement_until_qualified",
      "worker_model_policy_slots",
      "reasoning_none_patch_author_policy",
      "work_queue_model_slot_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-02-edit-transaction-engine",
    title: "Edit Transaction Engine",
    description:
      "Replace giant patch JSON and natural-language edit claims with runtime-owned edit transactions for reads, scoped patch application, validation, repair, rollback, changed-file refs, and evidence.",
    scope: [
      "edit_transaction_start",
      "runtime_owned_patch_apply",
      "before_after_snapshots",
      "validation_within_transaction",
      "rollback_and_conflict_refs",
      "commitment_evidence_claims",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-03-worker-controller-author-applicator-split",
    title: "Worker Controller Author Applicator Split",
    description:
      "Split implementation workers into controller, patch author, and runtime applicator phases so no single model call owns context discovery, schema, editing, validation, repair, and evidence.",
    scope: [
      "worker_control_decision",
      "edit_author_request",
      "runtime_applicator_result",
      "context_request_before_authoring",
      "phase_specific_model_slots",
      "replayable_applicator_results",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-04-provider-capability-profiles",
    title: "Provider Capability Profiles",
    description:
      "Promote provider/model capability profiles into runtime truth for cost-aware worker selection, qualification, ideal task size, tool access, failure modes, and escalation rules.",
    scope: [
      "capability_profile_v3",
      "qualified_evidence_kinds",
      "cost_latency_context_classes",
      "anti_codex_monopoly_selection",
      "unqualified_profile_selection_block",
      "selection_rejection_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline",
    title: "Context Freshness And Snapshot Discipline",
    description:
      "Require worker-facing context snapshot refs with prompt hash, repo revision, capture time, commitment ids, freshness policy, and refresh/block behavior before implementation.",
    scope: [
      "context_snapshot_ref",
      "repo_revision_binding",
      "source_prompt_hash_binding",
      "stale_context_block_or_refresh",
      "missing_context_not_model_failure",
      "work_queue_context_freshness_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-06-repo-analysis-context-scout",
    title: "Repo-Analysis Context Scout",
    description:
      "Replace JSON-only context scout behavior with a real repo-analysis tool-loop worker that searches, reads, inspects symbols/tests, emits model-authored handoffs, and fans out per commitment packet.",
    scope: [
      "repo_search_tool_loop",
      "file_read_symbol_inspection",
      "related_test_discovery",
      "context_handoff_artifact",
      "runtime_refs_only_limited_acceptance",
      "parallel_scout_fanout",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-07-safe-parallelism-supersteps",
    title: "Safe Parallelism And Supersteps",
    description:
      "Run independent context scouts and graph frontier nodes concurrently through runtime-owned dependency layers, conflict domains, provider concurrency limits, and Work Queue frontier readback.",
    scope: [
      "dependency_layer_compile",
      "runtime_supersteps",
      "conflict_domain_locks",
      "provider_concurrency_budget",
      "accepted_sibling_checkpoint_preservation",
      "parallel_frontier_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-09-production-boundary-replay",
    title: "Production Boundary Replay",
    description:
      "Promote boundary replay into a production-faithful runtime service across router, Mission Ledger, packets, context, synthesis, graph compile, node selection, worker transaction, validation, review, closeout, and Work Queue readback.",
    scope: [
      "router_payload_checkpoint",
      "mission_ledger_checkpoint",
      "packet_context_synthesis_checkpoints",
      "graph_node_worker_validation_checkpoints",
      "freshness_identity_authority_validation",
      "ux_native_payload_parity",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-10-first-class-validation-test-worker",
    title: "First-Class Validation And Test Worker",
    description:
      "Make validation a scheduler node with model-authored validation planning, runtime-owned command execution, failure-to-commitment mapping, repair handoff, and success-blocking validation evidence.",
    scope: [
      "validation_plan_tool",
      "approved_command_execution",
      "failure_to_commitment_mapping",
      "repair_request_node",
      "validation_evidence_gate",
      "validation_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-11-span-observability-readback",
    title: "Span-Level Observability And Readback",
    description:
      "Emit bounded spans for every model call, tool call, worker phase, scheduler decision, validation command, transaction, repair, replay checkpoint, and closeout step so Work Queue can show what is running and why.",
    scope: [
      "runtime_span_schema",
      "model_call_heartbeat",
      "tool_call_progress",
      "worker_phase_progress",
      "active_blocker_next_event_readback",
      "bounded_raw_storage_safe_spans",
    ],
  },
  {
    id: "openclaw-convergence.native-leap-12-repair-classification-before-retry",
    title: "Repair Classification Before Retry",
    description:
      "Require every repair loop to classify failures before retry, cite the failed span/decision/field/ref, resume upstream when needed, and avoid blind same-kind retries.",
    scope: [
      "failure_classification_tool",
      "field_specific_repair_refs",
      "upstream_boundary_resume",
      "provider_timeout_no_content_handling",
      "schema_context_validation_failure_classes",
      "repair_readback",
    ],
  },
];

const postProductSpecItems = [
  {
    id: "openclaw-convergence.native-leap-08-worktree-per-implementation-node",
    title: "Worktree Per Implementation Node",
    description:
      "Isolate parallel implementation nodes in per-node worktrees or patch workspaces, validate branches independently, merge accepted edit transactions, and surface conflicts as scheduler evidence.",
    scope: [
      "worktree_allocate",
      "branch_snapshot",
      "transaction_merge_candidate",
      "branch_validation",
      "conflict_evidence",
      "workspace_cleanup_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-harness-06-context-pack-supply-chain",
    title: "Native Harness Context Pack Supply Chain",
    description:
      "Promote commitment packets, context handoffs, synthesis artifacts, worker results, validation summaries, closeout capsules, skills, and Work Queue readback into reusable Context Engine/Model Memory context packs.",
    scope: [
      "context_pack_registry_integration",
      "worker_supervisor_context_pack_insertion",
      "runtime_state_pack_freshness",
      "skill_context_pack_usage",
      "model_memory_context_pack_quality_review",
    ],
  },
  {
    id: "openclaw-convergence.native-harness-07-work-queue-event-push-control",
    title: "Work Queue Event Push And Control UX",
    description:
      "Move high-volume parallel runtime visibility beyond polling by using Work Queue event cursors, gateway push foundations, and pause/redirect/cancel controls for active graph branches.",
    scope: [
      "work_queue_event_cursor_push",
      "parallel_group_visibility",
      "control_bridge_pause_redirect_cancel",
      "human_task_resume_visibility",
      "operator_interrupt_readback",
    ],
  },
  {
    id: "openclaw-convergence.native-harness-08-skill-role-harness-integration",
    title: "Skill And Role Harness Integration",
    description:
      "Use skill inventory, skill triggers, and role guidance as bounded context for scheduler nodes and worker loops without padding every orchestrator prompt.",
    scope: [
      "skill_inventory_context_pack",
      "role_contract_context",
      "scheduler_node_skill_selection",
      "worker_loop_skill_handoff",
      "skill_usage_quality_evidence",
    ],
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

async function upsertItem(sql, item, rank, beforeProductSpec) {
  const now = new Date().toISOString();
  const metadata = {
    artifactKind: "execution_platform.native_agentic_coding_harness_work_item",
    sourceSpecRef: item.sourceSpecRef ?? massiveLeapSpecRef,
    beforeProductSpec,
    priorityClass: beforeProductSpec ? "P0" : "P1",
    productSpecProofItemId: productSpecItemId,
    scope: item.scope,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
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
          metadata = EXCLUDED.metadata,
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

  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const productRank = Number(productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);
  const managedSequenceIds = [
    ...preProductSpecItems.map((item) => item.id),
    productSpecItemId,
    ...postProductSpecItems.map((item) => item.id),
    "openclaw-convergence.product-spec-proof-latency-parallelism",
  ];

  const activeManagedRowsBefore = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
        AND work_item_id = ANY($1::text[])
        AND queue_rank IS NOT NULL
    `,
    [managedSequenceIds],
  );
  const activeManagedRanksBefore = activeManagedRowsBefore.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const fallbackRank = Number(fallbackRows.rows[0]?.rank ?? productRank ?? 1);
  const baseRank =
    activeManagedRanksBefore.length > 0
      ? Math.min(...activeManagedRanksBefore)
      : Number.isFinite(productRank)
        ? productRank
        : fallbackRank;

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
        supersededBy: "native_agentic_coding_massive_leap_plan",
        supersededBySpecRef: massiveLeapSpecRef,
        reason:
          "Overlapping pre-proof native harness work was split into explicit massive-leap work queue items.",
      }),
      now,
      legacyPreProofItemIds,
    ],
  );

  for (const [index, item] of preProductSpecItems.entries()) {
    await upsertItem(sql, item, baseRank + index, true);
  }

  const updatedProductRank = baseRank + preProductSpecItems.length;
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_rank = CASE
            WHEN queue_status IN ('active','blocked','needs_review')
              THEN $1
            ELSE queue_rank
          END,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [updatedProductRank, now, productSpecItemId],
  );

  for (const [index, item] of postProductSpecItems.entries()) {
    await upsertItem(sql, item, updatedProductRank + 1 + index, false);
  }

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          queue_rank = CASE
            WHEN queue_status IN ('active','blocked','needs_review')
              THEN $2
            ELSE queue_rank
          END,
          updated_at = $3::timestamptz
      WHERE work_item_id = 'openclaw-convergence.product-spec-proof-latency-parallelism'
    `,
    [
      JSON.stringify({
        absorbedByNativeHarnessItems: [
          "openclaw-convergence.native-leap-07-safe-parallelism-supersteps",
          "openclaw-convergence.native-harness-07-work-queue-event-push-control",
        ],
        recommendedBeforeProductSpec: false,
        residualPostProductSpecCleanup: true,
      }),
      updatedProductRank + 1 + postProductSpecItems.length,
      now,
    ],
  );

  const activeRows = await sql.query(
    `
      SELECT work_item_id, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const activeManagedIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => managedSequenceIds.includes(id));
  const activeManagedIdSet = new Set(activeManagedIds);
  const remainingActiveIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSequenceIds.includes(id));
  const normalizedOrder = [
    ...managedSequenceIds.filter((id) => activeManagedIdSet.has(id)),
    ...remainingActiveIds,
  ];
  const normalizedStartRank = baseRank;
  for (const [index, workItemId] of normalizedOrder.entries()) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
          AND queue_status IN ('active','blocked','needs_review')
      `,
      [normalizedStartRank + index, now, workItemId],
    );
  }

  const rows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank, metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 60
    `,
  );

  const artifactRef = writeArtifact("native-agentic-coding-harness-work-queue-update.json", {
    artifactKind: "native_agentic_coding_harness_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    productSpecItemId,
    supersededLegacyPreProofIds: legacyPreProofItemIds,
    insertedBeforeProductSpecIds: preProductSpecItems.map((item) => item.id),
    insertedPostProductSpecIds: postProductSpecItems.map((item) => item.id),
    productRankBefore: productRank,
    productRankAfter: updatedProductRank,
    baseRank,
    normalizedStartRank,
    topActiveItems: rows.rows,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });

  console.log(JSON.stringify({ ok: true, artifactRef, topActiveItems: rows.rows }, null, 2));
  await runtime.close?.();
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
