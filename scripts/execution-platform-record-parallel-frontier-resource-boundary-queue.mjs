#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.parallel-frontier-resource-boundary-hardening";
const completedContextScoutItemId =
  "openclaw-convergence.context-scout-execution-packet-request-context-repair";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening.md";
const failureRuntimeJobId = "native-exec-68321aa82d7d6146";
const failureWorkItemId = "product-spec-checkpointed-64c74c8c5ece-fc8awb";
const failurePromptHash = "64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922";

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

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const metadata = {
    artifactKind: "execution_platform.parallel_frontier_resource_boundary_work_item",
    sourceSpecRef,
    specSectionRef: `${sourceSpecRef}#parallel-frontier-resource-boundary-hardening`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    proofFailureRuntimeJobId: failureRuntimeJobId,
    proofFailureWorkItemId: failureWorkItemId,
    proofFailurePromptHash: failurePromptHash,
    blockedProductSpecProofReason:
      "Latest checkpointed Product/Spec proof reached parallel frontier execution but failed before implementation because resource packet bounds threw through the adapter, accepted_with_limitations context was not consumer-gated, context repair nodes could lack consumers, and parallel branch failures were not isolated.",
    dependsOn: [
      "openclaw-convergence.context-scout-execution-packet-request-context-repair",
      "openclaw-convergence.runtime-node-readiness-transition-engine",
      "openclaw-convergence.generic-node-resource-materialization-layer",
      "openclaw-convergence.scheduler-readiness-state-unification",
    ],
    successGate:
      "Replay native-exec-68321aa82d7d6146 or equivalent frontier checkpoint; pass only if resource packet oversize returns split/context-repair readiness evidence, runtime-fallback context limitations do not unlock implementation without consumer-specific waiver, context repair nodes have consumer edges or diagnostic lifecycle, branch failures are isolated, sibling evidence survives, and Work Queue readback shows exact schema path/bound/branch/node/blocker.",
    scope: [
      "safe_resource_materialization_result",
      "implementation_context_packet_bound_unification",
      "context_sufficiency_state_enforcement",
      "consumer_specific_context_limitation_waivers",
      "context_repair_consumer_edges",
      "diagnostic_only_context_nodes",
      "parallel_frontier_branch_isolation",
      "node_level_failure_classification",
      "latest_run_state_boundary_diagnostics",
      "work_queue_active_graph_boundary_readback",
      "product_spec_parallel_frontier_boundary_replay",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
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
      VALUES (
        $1,
        'platform_hardening',
        $2,
        $3,
        'active',
        0,
        $4::jsonb,
        $5::timestamptz,
        $5::timestamptz
      )
      ON CONFLICT (work_item_id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [
      workItemId,
      "Parallel Frontier Resource Boundary Hardening",
      "Make resource materialization, context limitation enforcement, context repair consumer edges, and parallel frontier branch isolation production-safe before the next Product/Spec proof.",
      JSON.stringify(metadata),
      now,
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
        sourceSpecRef,
        blockedByWorkItemIds: [workItemId],
        productSpecProofSequencing: "after_parallel_frontier_resource_boundary_replay",
        successGate:
          "Full Product/Spec proof may rerun only after parallel frontier/resource boundary replay from native-exec-68321aa82d7d6146 or equivalent checkpoint passes.",
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

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived') THEN queue_status
            ELSE 'closed'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        closedByEvidenceRef: `runtime-job://${failureRuntimeJobId}/checkpointed-proof/context-scout-packet-boundary-advanced`,
        closedReason:
          "Latest checkpointed Product/Spec proof advanced beyond the original context-scout oversized prompt/provider-timeout/request-context-envelope blocker; remaining failures are tracked by parallel-frontier-resource-boundary-hardening.",
        supersededByWorkItemId: workItemId,
        sourceSpecRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      now,
      completedContextScoutItemId,
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

  const ids = activeRows.rows.map((row) => row.work_item_id);
  const baseRank =
    activeRows.rows.reduce((lowest, row) => {
      const rank = Number(row.queue_rank);
      return Number.isFinite(rank) && rank > 0 ? Math.min(lowest, rank) : lowest;
    }, Number.POSITIVE_INFINITY) || 1;

  const withoutWorkItem = ids.filter((id) => id !== workItemId);
  const productPosition = withoutWorkItem.indexOf(productSpecItemId);
  const withoutManaged = withoutWorkItem.filter((id) => id !== productSpecItemId);
  const productExists = ids.includes(productSpecItemId);
  const insertAt = productExists ? Math.max(0, productPosition) : 0;
  const reordered = [...withoutManaged];
  reordered.splice(insertAt, 0, workItemId);
  if (productExists) {
    reordered.splice(insertAt + 1, 0, productSpecItemId);
  }

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
             metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 30
    `,
  );

  const artifactRef = writeArtifact("parallel-frontier-resource-boundary-work-queue-update.json", {
    artifactKind: "parallel_frontier_resource_boundary_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    sourceSpecRef,
    workItemId,
    completedContextScoutItemId,
    productSpecItemId,
    failureRuntimeJobId,
    failureWorkItemId,
    failurePromptHash,
    insertedBeforeProductSpec: true,
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactRef,
        workItemId,
        productSpecItemId,
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );

  if (typeof runtime.close === "function") {
    const closeTimeout = new Promise((resolve) => {
      setTimeout(resolve, 2_000);
    });
    await Promise.race([runtime.close(), closeTimeout]);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
