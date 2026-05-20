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
  "docs/projects/execution-platform/specs/coding-executor-team-capability-leap.md";

const preProofItems = [
  {
    id: "openclaw-convergence.coding-leap-01-code-intelligence-substrate",
    title: "Code Intelligence Substrate",
    description:
      "Build the shared LSP, Tree-sitter, repo search, and persistent code graph service for diagnostics, definitions, references, symbols, impact analysis, and test discovery.",
    specSection: "code-intelligence-substrate",
    scope: [
      "lsp_clients",
      "tree_sitter_structure",
      "persistent_code_graph",
      "diagnostics_definitions_references_hover",
      "impact_and_test_discovery",
      "runtime_tool_traces_and_spans",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-02-context-scout-code-intelligence",
    title: "Context Scout Over Code Intelligence",
    description:
      "Upgrade context scout into a tool loop over prompt excerpts, repo search, code intelligence, bounded reads, related-test discovery, and model-reviewed context packets.",
    specSection: "context-scout-over-code-intelligence",
    scope: [
      "parallel_commitment_scouts",
      "prompt_excerpt_request",
      "code_intelligence_tool_loop",
      "context_packet_contract",
      "sufficiency_review",
      "blocking_context_repair",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend",
    title: "Code Intelligence Semantic Backend And LSP Parity",
    description:
      "Promote code intelligence from explicit TS/JS structural mode to a semantic-backed TypeScript/LSP backend with health, stale-ref, diagnostics, hover, references, rename planning, Work Queue readback, and model usability proof.",
    specSection: "code-intelligence-semantic-backend-and-lsp-parity",
    scope: [
      "typescript_language_service_backend",
      "lsp_lifecycle_contract",
      "semantic_mode_result_envelope",
      "backend_health_and_stale_ref_readback",
      "semantic_diagnostics_references_hover",
      "semantic_model_usability_proof",
    ],
    dependencyNotes: [
      "Run after context scout consumes the structural substrate so scout failure evidence can calibrate semantic requirements.",
      "Run before context synthesis and scheduler handoff so downstream graph planning is not built on weak code context.",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff",
    title: "Context Synthesis Barrier And Scheduler Handoff",
    description:
      "Make context synthesis a required barrier for complex coding jobs and pass full synthesis substance into scheduler graph selection instead of only artifact refs.",
    specSection: "context-synthesis-barrier-and-scheduler-handoff",
    scope: [
      "synthesis_join_barrier",
      "implementation_groups",
      "dependency_and_parallelism_plan",
      "worker_fit_summary",
      "graph_planning_checkpoint",
      "scheduler_receives_full_synthesis",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-04-worker-streaming-readback",
    title: "Worker-Internal Streaming And Operator Readback",
    description:
      "Emit span-level owner readback from long model calls, worker phases, tool calls, validation, repair, and scheduler decisions so runtime progress is inspectable live.",
    specSection: "worker-internal-streaming-and-operator-readback",
    scope: [
      "worker_phase_spans",
      "model_call_diagnostics",
      "provider_latency_finish_reason",
      "active_tool_target_refs",
      "retry_repair_progress",
      "work_queue_active_readback",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-05-non-codex-compound-tools",
    title: "Non-Codex Compound Coding Tools",
    description:
      "Add traceable compound tools for inspect-edit-validate, test addition, docs/cross-ref updates, LSP refactors, type-error fixes, and evidence-claim generation.",
    specSection: "non-codex-compound-coding-tools",
    scope: [
      "inspect_edit_validate_tool",
      "test_addition_tool",
      "lsp_refactor_tool",
      "type_error_fix_tool",
      "edit_transaction_sub_events",
      "compound_tool_evidence_claims",
    ],
  },
  {
    id: "openclaw-convergence.coding-leap-06-fallback-compat-retirement",
    title: "Fallback And Compatibility Retirement",
    description:
      "Remove or hard-disable production access to legacy queued runners, fallback-only transports, degraded closeout success, inferred evidence closure, and proof-shaped production readback; also perform the bounded production-path refactor needed to keep the canonical runner path and full TypeScript validation clean.",
    specSection: "fallback-and-compatibility-retirement",
    scope: [
      "production_workflow_execution_factory",
      "legacy_runner_production_block",
      "queued_runner_collapse_to_migration_or_test_shim",
      "fallback_transport_retirement",
      "degraded_closeout_non_success",
      "inferred_evidence_retirement",
      "proof_diagnostic_test_only",
      "public_runtime_api_export_hygiene",
      "workflow_definition_evidence_profile_type_convergence",
      "compatibility_map_registry_derivation",
      "proof_harness_lifecycle_isolation",
      "stale_generated_product_spec_child_cleanup",
      "dynamic_runner_production_boundary_extraction",
      "single_production_coding_path",
    ],
    dependencyNotes: [
      "Diagnosis found live gateway/chat/host construction paths that still instantiate queued-runner classes; the pass should replace those with one canonical workflow execution factory or fail-closed diagnostics.",
      "pnpm tsgo:fast currently fails on workflow-definition/evidence-profile drift; this item must remove that validation exception before Product/Spec proof.",
      "Retired/proof adapters remain public through runtime barrels; export hygiene is part of the production hardening target.",
      "DB readback still contains active/blocked Product/Spec proof child rows from prior attempts; the pass should retire generated debug/proof remnants through lifecycle policy and prevent recurrence.",
    ],
  },
];

const postProofItems = [
  {
    id: "openclaw-convergence.coding-leap-07-parallel-worktree-supersteps",
    title: "Parallel Worktree Supersteps",
    description:
      "Add per-node worktrees or patch workspaces for independent implementation groups with isolated validation, merge candidates, conflict diagnostics, cleanup, and readback.",
    specSection: "parallel-worktree-supersteps",
  },
  {
    id: "openclaw-convergence.coding-leap-08-runtime-lifecycle-hooks",
    title: "Runtime Lifecycle Hooks",
    description:
      "Add typed project-configurable lifecycle hooks for model calls, tools, edits, validation, stop, closeout, compaction, interrupt, retry, and escalation.",
    specSection: "runtime-lifecycle-hooks",
  },
  {
    id: "openclaw-convergence.coding-leap-09-agent-role-configuration",
    title: "Agent Role Configuration Surface",
    description:
      "Move role definitions into project/runtime config and compile model, tool, permission, context, evidence, budget, and escalation profiles into workflow/capability registry entries.",
    specSection: "agent-role-configuration-surface",
  },
  {
    id: "openclaw-convergence.coding-leap-10-tool-search-capability-catalog",
    title: "Tool Search And Capability Catalog",
    description:
      "Expose bounded model-facing tool discovery where models request tools by capability and runtime returns ranked tool refs with authority, budgets, contracts, and examples.",
    specSection: "tool-search-and-capability-catalog",
  },
  {
    id: "openclaw-convergence.coding-leap-11-role-model-benchmark-registry",
    title: "Role/Model Benchmark Registry",
    description:
      "Promote model and provider choices only from bounded benchmark evidence covering valid output, latency, cost, edit success, repair success, context quality, validation, and closeout.",
    specSection: "rolemodel-benchmark-registry",
  },
  {
    id: "openclaw-convergence.coding-leap-12-memory-execution-context-packs",
    title: "Memory-To-Execution Context Packs",
    description:
      "Feed model memory into execution through explicit retrieval, ranking, freshness, conflict, usefulness, and insertion refs instead of hidden prompt stuffing.",
    specSection: "memory-to-execution-context-packs",
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
  const specRef = `${sourceSpecRef}#${item.specSection}`;
  const metadata = {
    artifactKind: "execution_platform.coding_executor_capability_leap_work_item",
    sourceSpecRef,
    specSectionRef: specRef,
    beforeProductSpec: timing === "pre_product_spec",
    priorityClass: timing === "pre_product_spec" ? "P0" : "P1",
    productSpecProofItemId: productSpecItemId,
    scope: item.scope ?? [],
    dependencyNotes: item.dependencyNotes ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
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
      VALUES ($1, 'platform_capability_leap', $2, $3, 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
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
    ...postProofItems.map((item) => item.id),
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
  const activeManagedRanks = currentManagedRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const productRank = Number(productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);
  const baseRank = activeManagedRanks.length > 0 ? Math.min(...activeManagedRanks) : productRank;

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
        blockedByCapabilityLeapIds: preProofItems.map((item) => item.id),
        proofReadinessSpecRef: `${sourceSpecRef}#productspec-planning-production-upgrade-proof`,
      }),
      now,
      productSpecItemId,
    ],
  );

  for (const [index, item] of postProofItems.entries()) {
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
  const managedActiveSet = new Set(managedIds);
  const activeManagedIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => managedActiveSet.has(id));
  const activeManagedIdSet = new Set(activeManagedIds);
  const remainingActiveIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedActiveSet.has(id));
  const normalizedOrder = [
    ...managedIds.filter((id) => activeManagedIdSet.has(id)),
    ...remainingActiveIds,
  ];

  for (const [index, workItemId] of normalizedOrder.entries()) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
          AND queue_status IN ('active','blocked','needs_review')
      `,
      [baseRank + index, now, workItemId],
    );
  }

  const topRows = await sql.query(
    `
      SELECT
        work_item_id,
        title,
        queue_status,
        queue_rank,
        metadata->>'specSectionRef' AS spec_section_ref,
        metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 80
    `,
  );

  const artifactRef = writeArtifact("coding-executor-capability-leap-work-queue-update.json", {
    artifactKind: "coding_executor_capability_leap_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    productSpecItemId,
    baseRank,
    productRankBefore: productRank,
    productRankAfter,
    preProofItemIds: preProofItems.map((item) => item.id),
    postProofItemIds: postProofItems.map((item) => item.id),
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  });

  console.log(JSON.stringify({ ok: true, artifactRef, topActiveItems: topRows.rows }, null, 2));
  await runtime.close?.();
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
