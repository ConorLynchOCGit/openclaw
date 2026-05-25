#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";

const preProofItems = [
  {
    id: "openclaw-convergence.control-plane-01-spec-reconciliation",
    title: "Execution Platform Spec Reconciliation And Control-Plane Reset",
    description:
      "Reconcile Execution Platform specs, decisions, indexes, and Work Queue ordering around the control-plane-first Product/Spec recovery path.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#pre-proof-implementation-slice`,
    scope: [
      "spec_index_reconciliation",
      "decision_record_update",
      "current_slice_update",
      "work_queue_reprioritization",
      "post_proof_tool_facade_preservation",
    ],
    successGate:
      "Docs and DB Work Queue agree that the next proof is gated by WorkIntent-first worker execution, with context synthesis retired from the default coding proof path and full tool facade expansion preserved after proof.",
  },
  {
    id: "openclaw-convergence.control-plane-02-workintent-contract-compiler",
    title: "WorkIntent Contract And Runtime Compiler",
    description:
      "Add the canonical WorkIntent contract and compile staged scheduler work units into non-runnable intent nodes before capability validation, context supply, resource materialization, or worker dispatch.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${workIntentSpecRef}#workintent`,
    scope: [
      "workintent_schema",
      "runtime_compiler",
      "execution_intent_required",
      "capability_intent_required",
      "non_runnable_intent_nodes",
      "no_runtime_semantic_guessing",
    ],
    successGate:
      "Focused scheduler tests prove complex work units compile into WorkIntent nodes with explicit execution intent and cannot run workers before capability validation and resource requirements are satisfied.",
  },
  {
    id: "openclaw-convergence.control-plane-03-context-synthesis-retirement-replay-alignment",
    title: "Coding Path Context Synthesis Retirement And Replay Alignment",
    description:
      "Remove default context synthesis from coding-team production and replay success paths, preserving it only for explicit workflow-defined coordination or diagnostic boundary inspection.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#task-dag-first-scheduler`,
    scope: [
      "deterministic_context_synthesis_default_disabled",
      "post_synthesis_graph_compile_not_production_success",
      "replay_topology_matches_production",
      "after_context_synthesis_diagnostic_only",
      "no_context_synthesis_to_implementation_regression",
    ],
    successGate:
      "Production and replay tests prove accepted packet/context boundaries do not inject context_synthesis and no coding-team production proof can pass through context_synthesis group -> implementation node.",
  },
  {
    id: "openclaw-convergence.control-plane-04-node-scoped-context-readiness",
    title: "Node-Scoped Context Broker And Readiness Enforcement",
    description:
      "Connect WorkIntent consumers to demand-driven context requests and canonical NodeReadinessState so accepted-with-limitations context blocks affected implementation consumers without a valid waiver.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#task-dag-first-scheduler`,
    scope: [
      "workintent_context_requirements",
      "context_broker_requests",
      "consumer_scoped_limitations",
      "node_readiness_state",
      "context_repair_transition",
      "consumer_waiver_enforcement",
    ],
    successGate:
      "Focused readiness tests prove WorkIntent consumers request missing context/resources through the broker and accepted-with-limitations context cannot unlock implementation without a consumer waiver.",
  },
  {
    id: "openclaw-convergence.control-plane-05-resource-materialization-worker-gate",
    title: "Resource Materialization And NodeExecutionPacket Worker Gate",
    description:
      "Materialize source-edit WorkIntents into hydrated NodeExecutionPackets and prevent file-edit worker dispatch for read-only or resource-incomplete nodes.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#canonical-worker-packet`,
    scope: [
      "source_edit_node_execution_packet",
      "read_only_resource_packet",
      "intent_capability_evidence_conflict_block",
      "file_snapshot_or_new_file_intent_required",
      "validation_ref_or_discovery_required",
      "worker_dispatch_guard",
    ],
    successGate:
      "Focused materialization tests prove only hydrated source-edit packets reach file-edit workers and read-only/source-grounding work routes or blocks without changed-file expectations.",
  },
  {
    id: "openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke",
    title: "Worker Small-Verb Edit Smoke Proof",
    description:
      "Run one Product/Spec-derived source-edit node through the small-verb worker loop until it makes a bounded source edit, runs structural or targeted validation, and emits commitment evidence or a precise upstream blocker.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#worker-execution-proof`,
    scope: [
      "hydrated_node_execution_packet",
      "worker_edit_plan",
      "forced_patch_author",
      "bounded_source_edit",
      "structural_or_targeted_validation",
      "commitment_evidence_claim",
      "changed_file_review_before_persistence",
    ],
    successGate:
      "At least one ready Product/Spec source-edit node produces a reviewed source diff plus validation/evidence refs, or the runtime reports a non-worker upstream blocker with exact missing resources.",
  },
  {
    id: "openclaw-convergence.control-plane-07-readback-telemetry-proof",
    title: "Owner Readback And Telemetry Proof",
    description:
      "Prove owner-facing readback for the worker proof shows WorkIntent, execution intent, evidence mode, readiness, current node, branch, phase, model, tool, blocker, usage availability, artifacts, and next transition from compact runtime state.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#owner-readback-and-telemetry-proof`,
    scope: [
      "workintent_readback",
      "execution_intent_evidence_mode_readback",
      "readiness_ref_readback",
      "latest_run_state_projection",
      "current_node_branch_phase",
      "model_tool_progress_readback",
      "token_walltime_readback",
      "blocker_and_next_transition",
      "artifact_manifest_refs",
    ],
    successGate:
      "During and after the worker proof, Work Queue/readback exposes active model/tool/node/phase and bounded usage/artifact refs without requiring raw log scans.",
  },
];

const postProofItems = [
  {
    id: "openclaw-convergence.post-proof-full-tool-facade-expansion",
    title: "Full Tool Facade Expansion",
    description:
      "Implement the full control-plane toolification catalog across task, repo, context, edit, checks, worktree, artifact, review, message, approval, memory, and telemetry surfaces after the initial Product/Spec worker proof.",
    itemType: "platform_hardening",
    priorityClass: "P1",
    specSectionRef: `${sourceSpecRef}#full-toolification-catalog`,
    scope: [
      "task_tools",
      "repo_tools",
      "context_tools",
      "edit_tools",
      "checks_tools",
      "worktree_tools",
      "artifact_tools",
      "review_tools",
      "message_tools",
      "approval_tools",
      "memory_tools",
      "telemetry_tools",
      "contract_compiler",
      "schema_fuzz_tests",
    ],
    successGate:
      "All model-facing worker roles operate through small verb tools while control-plane internals own rich DAG/state/schema/policy, with contract compiler docs/tests generated from source types.",
  },
];

const diagnosticOnlyIds = [
  "openclaw-convergence.staged-mission-ledger-obligation-candidate-compiler",
];

const supersededQueueItems = [
  {
    id: "openclaw-convergence.control-plane-02-task-dag-node-scoped-context",
    supersededBy: "openclaw-convergence.control-plane-02-workintent-contract-compiler",
  },
  {
    id: "openclaw-convergence.control-plane-03-coding-tool-facade",
    supersededBy: "openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke",
  },
  {
    id: "openclaw-convergence.control-plane-04-node-execution-packet-worker-gate",
    supersededBy: "openclaw-convergence.control-plane-05-resource-materialization-worker-gate",
  },
  {
    id: "openclaw-convergence.control-plane-05-non-codex-worker-edit-proof",
    supersededBy: "openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke",
  },
  {
    id: "openclaw-convergence.control-plane-06-readback-telemetry-proof",
    supersededBy: "openclaw-convergence.control-plane-07-readback-telemetry-proof",
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
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function upsertWorkItem(sql, item, rank, timing, now) {
  const metadata = {
    artifactKind: "execution_platform.control_plane_coding_recovery_work_item",
    sourceSpecRef,
    governingSpecRefs: [sourceSpecRef, workIntentSpecRef],
    specSectionRef: item.specSectionRef,
    beforeProductSpec: timing === "pre_product_spec",
    postProductSpec: timing === "post_product_spec",
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    scope: item.scope,
    successGate: item.successGate,
    semanticJudgmentOwner: "model",
    runtimeAuthority: "schema_refs_bounds_storage_lifecycle_tool_execution_policy_validation",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "control_plane_recovery_queue_insert_or_reprioritize",
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
      VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
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
    [item.id, item.itemType, item.title, item.description, rank, JSON.stringify(metadata), now],
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
  const supersededIds = supersededQueueItems.map((item) => item.id);

  const rankRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
        AND queue_status IN ('active','blocked','needs_review')
        AND queue_rank IS NOT NULL
    `,
    [[...managedIds, ...diagnosticOnlyIds, ...supersededIds]],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const rankValues = rankRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const baseRank =
    rankValues.length > 0 ? Math.min(...rankValues) : Number(fallbackRows.rows[0]?.rank ?? 1);

  for (const [index, item] of preProofItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, "pre_product_spec", now);
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
        blockedByControlPlaneRecoveryWorkItemIds: preProofItems.map((item) => item.id),
        productSpecProofSequencing: "after_control_plane_worker_edit_and_readback_proofs",
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_control_plane_recovery",
      }),
      now,
      productSpecItemId,
    ],
  );

  for (const [index, item] of postProofItems.entries()) {
    await upsertWorkItem(sql, item, productRank + 1 + index, "post_product_spec", now);
  }

  for (const id of diagnosticOnlyIds) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_status = CASE
              WHEN queue_status IN ('closed', 'archived') THEN queue_status
              ELSE 'superseded'
            END,
            queue_rank = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
      `,
      [
        JSON.stringify({
          sourceSpecRef,
          supersededBy: "control_plane_recovery_product_spec_path",
          diagnosticOnly: true,
          productionPathDisabled: true,
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "diagnostic_only_supersession",
        }),
        now,
        id,
      ],
    );
  }

  for (const item of supersededQueueItems) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_status = CASE
              WHEN queue_status IN ('closed', 'archived') THEN queue_status
              ELSE 'superseded'
            END,
            queue_rank = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
      `,
      [
        JSON.stringify({
          sourceSpecRef,
          governingSpecRefs: [sourceSpecRef, workIntentSpecRef],
          supersededBy: item.supersededBy,
          supersededReason: "control_plane_recovery_queue_replaced_stale_preproof_item_shape",
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "stale_control_plane_item_supersession",
        }),
        now,
        item.id,
      ],
    );
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
  const existingManaged = new Set(
    activeRows.rows.map((row) => row.work_item_id).filter((id) => managedSet.has(id)),
  );
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSet.has(id));
  const normalized = [...managedIds.filter((id) => existingManaged.has(id)), ...remaining];

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
        metadata->>'postProductSpec' AS post_product_spec,
        metadata->>'sourceSpecRef' AS source_spec_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );

  const artifactRef = writeArtifact("control-plane-coding-recovery-queue-update.json", {
    artifactKind: "control_plane_coding_recovery_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    workIntentSpecRef,
    productSpecItemId,
    baseRank,
    productRank,
    preProofItemIds: preProofItems.map((item) => item.id),
    postProofItemIds: postProofItems.map((item) => item.id),
    diagnosticOnlyIds,
    supersededQueueItems,
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "control_plane_recovery_queue_reprioritize",
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
