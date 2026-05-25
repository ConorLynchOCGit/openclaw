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
  "docs/projects/execution-platform/specs/model-task-classification-and-resource-materialization.md";
const runtimeNodeReadinessSpecRef =
  "docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md";

const preProofItems = [
  {
    id: "openclaw-convergence.model-task-classification-utility-router-v2",
    title: "Model Task Classification And Utility Router v2",
    description:
      "Classify every model call by canonical task class and compile model policy, reasoning mode, timeout, retry, escalation, parser, and telemetry rules from workflow/runtime policy before dispatch.",
    specSection: "queue-item-1-model-task-classification-and-utility-router-v2",
    scope: [
      "global_reasoning",
      "local_semantic_extraction",
      "schema_normalization",
      "tool_selection",
      "resource_materialization_runtime_only",
      "implementation_patch",
      "validation_classification",
      "closeout_judgment",
      "model_policy_telemetry",
    ],
  },
  {
    id: "openclaw-convergence.generic-node-resource-materialization-layer",
    title: "Generic Node Resource Materialization Layer",
    description:
      "Build the workflow-agnostic NodeExecutionPacket and resource compiler so graph nodes execute only after runtime materializes domain resources, readiness status, authority, validation refs, and evidence expectations.",
    specSection: "queue-item-2-generic-node-resource-materialization-layer",
    scope: [
      "node_execution_packet",
      "domain_resource_packet_compilers",
      "node_compile_execution_packet_tool",
      "node_evaluate_readiness_tool",
      "node_promote_ready_packet",
      "node_plan_resource_repair",
      "work_queue_resource_readback",
    ],
  },
  {
    id: "openclaw-convergence.implementation-context-snapshot-compiler",
    title: "Implementation Context Snapshot Compiler",
    description:
      "Fix the Product/Spec implementation blocker by compiling accepted context handoffs into resolved target refs, file snapshots, hashes, allowed edit scopes, validation refs, and ImplementationTaskPackets before worker invocation.",
    specSection: "queue-item-3-implementation-context-snapshot-compiler",
    scope: [
      "context_resolve_target_refs",
      "repo_snapshot_target_files",
      "context_compile_implementation_context_packet",
      "implementation_compile_task_packet",
      "implementation_evaluate_readiness",
      "directory_refs_not_executable",
      "new_file_intent_parent_snapshots",
    ],
  },
  {
    id: "openclaw-convergence.structured-tool-schema-adapter-hardening",
    title: "Structured Tool/Schema Adapter Hardening",
    description:
      "Make fast models operate through small typed contracts with provider profile gates for no-thinking mode, output limits, finish reason, empty-output retry, parser mode, schema latency, and constrained-output compatibility.",
    specSection: "queue-item-4-structured-toolschema-adapter-hardening",
    scope: [
      "provider_profile_gates",
      "no_thinking_mode",
      "small_typed_contracts",
      "empty_output_retry",
      "native_finish_reason_telemetry",
      "schema_repair_field_paths",
      "exceptional_gpt55_rescue_visibility",
    ],
  },
  {
    id: "openclaw-convergence.scheduler-readiness-state-unification",
    title: "Scheduler Readiness State Unification",
    description:
      "Unify scheduler, compiler, replay harness, executor, and Work Queue readiness into one NodeReadinessState so context freshness cannot contradict missing implementation snapshots.",
    specSection: "queue-item-5-scheduler-readiness-state-unification",
    scope: [
      "node_readiness_state",
      "context_freshness_not_implementation_readiness",
      "snapshot_status",
      "validation_status",
      "authority_status",
      "evidence_status",
      "readiness_repair_action",
      "contradictory_state_rejection",
    ],
  },
  {
    id: "openclaw-convergence.product-spec-replay-proof-resource-materialization",
    title: "Product/Spec Replay Proof",
    description:
      "Replay the failed Product/Spec wu-002 class boundary and pass only if context handoff compiles into target refs, snapshots, hashes, ImplementationTaskPacket, canonical readiness, and worker-ready packet or a precise upstream blocker.",
    specSection: "queue-item-6-productspec-replay-proof",
    scope: [
      "failed_wu_002_replay",
      "context_handoff_to_snapshots",
      "implementation_task_packet_replay",
      "node_readiness_state_replay",
      "worker_ready_packet_gate",
      "owner_readback_replay_evidence",
    ],
  },
  {
    id: "openclaw-convergence.runtime-node-readiness-transition-engine",
    title: "Runtime Node Readiness And Transition Engine",
    description:
      "Make graph acceptance, dependency readiness, context readiness, resource readiness, and worker executability separate production lifecycle states so accepted work-intent graphs cannot invoke workers before transition preconditions are satisfied.",
    sourceSpecRef: runtimeNodeReadinessSpecRef,
    specSection: "work-queue-item",
    scope: [
      "runtime_node_readiness_transition_engine",
      "frontier_readiness_evaluation",
      "capability_execution_preconditions",
      "work_intent_not_executable",
      "prerequisite_node_materialization",
      "approve_and_run_first_node_fail_closed",
      "node_execution_packet_gate_not_bypassable",
      "worker_adapter_threw_precondition_retirement",
      "work_queue_transition_readback",
      "product_spec_failure_replay_no_worker_invocation",
    ],
  },
];

const supersededItems = [
  {
    id: "openclaw-convergence.scheduler-first-node-scoped-context-supply",
    reason: "Detailed sub-spec absorbed into the generic resource-materialization block.",
    supersededBy: "openclaw-convergence.generic-node-resource-materialization-layer",
  },
  {
    id: "openclaw-convergence.post-context-implementation-task-compiler",
    reason: "Detailed sub-spec absorbed into the implementation context snapshot compiler item.",
    supersededBy: "openclaw-convergence.implementation-context-snapshot-compiler",
  },
  {
    id: "openclaw-convergence.toolification-16-capability-policy-compiler-hardening",
    reason: "Pre-proof policy scope absorbed into Model Task Classification And Utility Router v2.",
    supersededBy: "openclaw-convergence.model-task-classification-utility-router-v2",
  },
  {
    id: "openclaw-convergence.non-codex-tool-using-worker",
    reason:
      "Old needs-review worker proof item is superseded by completed non-Codex worker runtime work and current resource-materialization blockers.",
    supersededBy: "openclaw-convergence.implementation-context-snapshot-compiler",
  },
];

const retainedButEditedItems = [
  {
    id: "openclaw-convergence.model-contract-compiler-consolidation",
    retainedAs: "post_proof_residual_consolidation",
    dependsOn: "openclaw-convergence.structured-tool-schema-adapter-hardening",
    note: "Do not run as a pre-proof duplicate of structured adapter hardening; use after Product/Spec proof for cross-system cleanup if residual scope remains.",
  },
  {
    id: "openclaw-convergence.product-spec-proof-latency-parallelism",
    retainedAs: "post_proof_latency_cleanup",
    dependsOn: "openclaw-convergence.active-queue-34",
    note: "Keep after Product/Spec proof unless latency itself becomes a blocker; resource materialization has priority.",
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

async function upsertItem(sql, item, rank) {
  const now = new Date().toISOString();
  const itemSourceSpecRef = item.sourceSpecRef ?? sourceSpecRef;
  const metadata = {
    artifactKind: "execution_platform.resource_materialization_work_item",
    sourceSpecRef: itemSourceSpecRef,
    specSectionRef: `${itemSourceSpecRef}#${item.specSection}`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    scope: item.scope,
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
      VALUES ($1, 'platform_hardening', $2, $3, 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
      ON CONFLICT (work_item_id) DO UPDATE
      SET title = EXCLUDED.title,
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
  const baseRank = Number(productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);

  const staleRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
        AND work_item_id <> $1
        AND (
          work_item_id LIKE 'product-spec-direct-%'
          OR work_item_id LIKE 'product-spec-checkpointed-%'
          OR (
            work_item_id LIKE '%-execution-work'
            AND title ILIKE '%Product/Spec%'
          )
          OR (
            work_item_id LIKE 'runtime-graph:team-run-native-exec-%'
            AND (
              metadata #>> '{actionGraph,parentWorkItemId}' LIKE 'product-spec%'
              OR metadata #>> '{generatedItemLifecycle,parentWorkItemId}' LIKE 'product-spec%'
              OR title ILIKE '%Product/Spec%'
              OR title ILIKE '%Planning%'
              OR title ILIKE '%workflow%'
            )
          )
        )
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
    [productSpecItemId],
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'archived',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = ANY($3::text[])
        AND queue_status IN ('active','blocked','needs_review')
    `,
    [
      JSON.stringify({
        archivedBy: "resource_materialization_queue_reconciliation",
        archivedBySpecRef: sourceSpecRef,
        reason:
          "Stale generated Product/Spec proof/direct runtime child rows are runtime diagnostics, not active roadmap work.",
        terminalPolicy: "diagnostic_archive",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      }),
      now,
      staleRows.rows.map((row) => row.work_item_id),
    ],
  );

  for (const item of supersededItems) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_status = CASE
              WHEN queue_status IN ('closed', 'archived') THEN queue_status
              ELSE 'superseded'
            END,
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
      `,
      [
        JSON.stringify({
          supersededBy: item.supersededBy,
          supersededBySpecRef: sourceSpecRef,
          reason: item.reason,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        }),
        now,
        item.id,
      ],
    );
  }

  for (const item of retainedButEditedItems) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
      `,
      [
        JSON.stringify({
          retainedAs: item.retainedAs,
          dependsOn: item.dependsOn,
          queueReconciliationNote: item.note,
          sourceSpecRef,
          recommendedBeforeProductSpec: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        }),
        now,
        item.id,
      ],
    );
  }

  for (const [index, item] of preProofItems.entries()) {
    await upsertItem(sql, item, baseRank + index);
  }

  const productRank = baseRank + preProofItems.length;
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET title = 'Product/Spec Planning Workflow Plugin Production Proof',
          queue_rank = CASE
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
        runtimeNodeReadinessSpecRef,
        beforeProductSpec: false,
        productSpecProofSequencing: "after_runtime_node_readiness_transition_replay",
        blockedByWorkItemIds: preProofItems.map((item) => item.id),
        successGate:
          "Full Product/Spec proof may run only after resource-materialization replay and runtime node readiness transition replay pass.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      }),
      now,
      productSpecItemId,
    ],
  );

  const managedIds = new Set([...preProofItems.map((item) => item.id), productSpecItemId]);
  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const remainder = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedIds.has(id));
  const ordered = [...preProofItems.map((item) => item.id), productSpecItemId, ...remainder];
  for (const [index, workItemId] of ordered.entries()) {
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
      SELECT work_item_id, title, queue_status, queue_rank, metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );
  const archivedSummary = staleRows.rows.slice(0, 80);
  const artifactRef = writeArtifact("resource-materialization-work-queue-update.json", {
    artifactKind: "resource_materialization_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    sourceSpecRef,
    runtimeNodeReadinessSpecRef,
    productSpecItemId,
    baseRank,
    productRank,
    insertedBeforeProductSpecIds: preProofItems.map((item) => item.id),
    supersededItems,
    retainedButEditedItems,
    archivedStaleGeneratedCount: staleRows.rows.length,
    archivedStaleGeneratedSample: archivedSummary,
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactRef,
        archivedStaleGeneratedCount: staleRows.rows.length,
        supersededItems: supersededItems.map((item) => item.id),
        retainedButEditedItems: retainedButEditedItems.map((item) => item.id),
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
