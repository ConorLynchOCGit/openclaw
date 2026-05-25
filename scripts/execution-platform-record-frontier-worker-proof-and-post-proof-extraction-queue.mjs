#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const parallelFrontierItemId = "openclaw-convergence.parallel-frontier-resource-boundary-hardening";
const productSpecItemId = "openclaw-convergence.active-queue-34";

const frontierGateSpecRef =
  "docs/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate.md";
const parallelFrontierSpecRef =
  "docs/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening.md";
const postProofSpecRef =
  "docs/projects/execution-platform/specs/post-proof-generic-runtime-extraction.md";

const postProofItems = [
  {
    id: "openclaw-convergence.post-proof-01-generic-runtime-spine-extraction",
    title: "Generic Runtime Spine Extraction",
    description:
      "Extract replay boundaries, resource materialization, NodeReadinessState transitions, branch results, superstep aggregation, repair routing, and generic Work Queue event emission into the workflow-agnostic runtime spine after Product/Spec proof.",
    specSection: "generic-runtime-spine-extraction",
    scope: [
      "generic_replay_boundary_registry",
      "generic_resource_materialization_boundary",
      "generic_node_readiness_transition_evaluation",
      "parallel_frontier_branch_result_contract",
      "superstep_result_aggregation",
      "repair_escalation_routing",
      "generic_work_queue_runtime_event_emission",
    ],
  },
  {
    id: "openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning",
    title: "Dynamic Runner Plugin Thinning",
    description:
      "Reduce DynamicAgentTeamGraphRunner to coding plugin wiring and adapter orchestration after Product/Spec proof; generic lifecycle decisions must live in the runtime spine.",
    specSection: "dynamic-runner-plugin-thinning",
    scope: [
      "coding_plugin_wiring_only",
      "single_generic_runtime_entrypoint",
      "runner_proof_branch_retirement",
      "dependency_direction_cleanup",
      "production_success_gate_unification",
    ],
  },
  {
    id: "openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle",
    title: "Generic Replay And Readiness Lifecycle",
    description:
      "Promote replay/checkpoint boundaries into a workflow-agnostic registry with boundary ids, required artifacts, versioned normalizers, resume commands, allowed transitions, blockers, and readback projection.",
    specSection: "generic-replay-and-readiness-lifecycle",
    scope: [
      "workflow_agnostic_replay_registry",
      "boundary_required_artifacts",
      "versioned_checkpoint_normalizers",
      "resume_command_contract",
      "allowed_next_transition_contract",
      "terminal_blocker_classes",
      "generic_boundary_readback_projection",
    ],
  },
  {
    id: "openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes",
    title: "Cross-Workflow Orchestration Proof Lanes",
    description:
      "Prove the generic runtime outside coding with planning/research, docs or QA, and architecture/design/marketing readiness lanes using workflow plugins, domain resource packets, evidence claims, closeout gates, and no generic queued-runner compatibility success.",
    specSection: "cross-workflow-orchestration-proof-lanes",
    scope: [
      "planning_research_runtime_lane",
      "docs_or_qa_runtime_lane",
      "architecture_design_marketing_readiness_lane",
      "domain_resource_packet_contract",
      "generic_evidence_claim_contract",
      "generic_closeout_contract",
      "generic_runner_compat_success_block",
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

async function upsertPostProofItem(sql, item, now) {
  const metadata = {
    artifactKind: "execution_platform.post_proof_generic_runtime_extraction_work_item",
    sourceSpecRef: postProofSpecRef,
    specSectionRef: `${postProofSpecRef}#${item.specSection}`,
    beforeProductSpec: false,
    priorityClass: "P1",
    productSpecProofItemId: productSpecItemId,
    postProductSpec: true,
    scope: item.scope,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "post_proof_queue_item_insert_or_refresh",
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
      VALUES ($1, 'platform_architecture', $2, $3, 'active', 0, $4::jsonb, $5::timestamptz, $5::timestamptz)
      ON CONFLICT (work_item_id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('archived', 'closed', 'superseded')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [item.id, item.title, item.description, JSON.stringify(metadata), now],
  );
}

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        artifactKind: "execution_platform.pre_product_spec_frontier_worker_proof_gate_queue_update",
        sourceSpecRef: parallelFrontierSpecRef,
        closureGateSpecRef: frontierGateSpecRef,
        beforeProductSpec: true,
        priorityClass: "P0",
        productSpecProofItemId: productSpecItemId,
        closeOrSupersedeWithEvidence: true,
        requiredProofLanes: [
          "parallel_frontier_closure_lane",
          "executable_frontier_worker_smoke",
          "owner_readback_trace_gate",
          "context_limitation_negative_test",
        ],
        successGate:
          "Close or supersede only when branch failures isolate, sibling evidence survives, context repair nodes have consumers or diagnostic-only lifecycle, accepted-with-limitations context cannot unlock implementation without consumer waiver, Work Queue readback shows branch/node/blocker/schema/readiness/next transition, one executable frontier worker smoke receives a hydrated NodeExecutionPacket and validates bounded edits or returns a precise upstream blocker, and the context-limitation negative test blocks implementation.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "queue_item_metadata_refresh_and_reprioritize",
      }),
      now,
      parallelFrontierItemId,
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
        sourceSpecRef:
          "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
        blockedByWorkItemIds: [parallelFrontierItemId],
        postProofFollowUpSpecRef: postProofSpecRef,
        productSpecProofSequencing: "after_pre_product_spec_frontier_worker_proof_gate",
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

  for (const item of postProofItems) {
    await upsertPostProofItem(sql, item, now);
  }

  const activeRows = await sql.query(
    `
      SELECT work_item_id, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );

  const managedIds = new Set([
    parallelFrontierItemId,
    productSpecItemId,
    ...postProofItems.map((item) => item.id),
  ]);
  const originalIds = activeRows.rows.map((row) => row.work_item_id);
  const productIndex = originalIds.indexOf(productSpecItemId);
  const anchorIndex =
    productIndex >= 0 ? productIndex : Math.max(0, originalIds.indexOf(parallelFrontierItemId));
  const before = originalIds.slice(0, anchorIndex).filter((id) => !managedIds.has(id));
  const after = originalIds.slice(anchorIndex).filter((id) => !managedIds.has(id));
  const reordered = [
    ...before,
    parallelFrontierItemId,
    productSpecItemId,
    ...postProofItems.map((item) => item.id),
    ...after,
  ];

  const baseRank =
    activeRows.rows.reduce((lowest, row) => {
      const rank = Number(row.queue_rank);
      return Number.isFinite(rank) && rank > 0 ? Math.min(lowest, rank) : lowest;
    }, Number.POSITIVE_INFINITY) || 1;

  for (const [index, id] of reordered.entries()) {
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
      SELECT work_item_id,
             title,
             queue_status,
             queue_rank,
             metadata->>'beforeProductSpec' AS before_product_spec,
             metadata->>'postProductSpec' AS post_product_spec,
             metadata->>'closureGateSpecRef' AS closure_gate_spec_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );

  const artifactRef = writeArtifact(
    "frontier-worker-proof-post-proof-extraction-queue-update.json",
    {
      artifactKind: "frontier_worker_proof_post_proof_extraction_queue_update",
      databaseName: runtime.resolution.databaseName,
      reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
      parallelFrontierItemId,
      productSpecItemId,
      frontierGateSpecRef,
      postProofSpecRef,
      postProofItemIds: postProofItems.map((item) => item.id),
      queueOrderingPolicy:
        "parallel frontier closure gate immediately before Product/Spec; generic runtime extraction items immediately after Product/Spec",
      topActiveItems: topRows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
    },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseName: runtime.resolution.databaseName,
        artifact: artifactRef,
        frontierGateSpecRef,
        postProofSpecRef,
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
