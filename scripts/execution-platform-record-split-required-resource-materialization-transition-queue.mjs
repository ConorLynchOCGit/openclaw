#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.split-required-resource-materialization-transition";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/split-required-resource-materialization-transition.md";
const failureRuntimeJobId = "native-exec-55dc1cc6a3e94232";
const failureWorkItemId = "product-spec-checkpointed-64c74c8c5ece-g6svuj";
const failureGraphId = "team-run-native-exec-55dc1cc6a3e94232-runtime-work-graph";
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
    artifactKind: "execution_platform.split_required_resource_materialization_work_item",
    sourceSpecRef,
    specSectionRef: `${sourceSpecRef}#split-required-resource-materialization-transition`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    proofFailureRuntimeJobId: failureRuntimeJobId,
    proofFailureWorkItemId: failureWorkItemId,
    proofFailureGraphId: failureGraphId,
    proofFailurePromptHash: failurePromptHash,
    blockedProductSpecProofReason:
      "Latest Product/Spec proof reached resource materialization and correctly blocked a broad implementation parent that exceeded packet bounds, but scheduler did not promote split task packets into executable child nodes and surfaced the boundary as worker_adapter_threw:unclassified.",
    dependsOn: [
      "openclaw-convergence.parallel-frontier-resource-boundary-hardening",
      "openclaw-convergence.runtime-artifact-payload-store-bounded-manifests",
      "openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness",
      "openclaw-convergence.runtime-node-readiness-transition-engine",
    ],
    successGate:
      "Replay native-exec-55dc1cc6a3e94232 or equivalent split/materialization checkpoint; pass only if parent implementation node becomes aggregate/non-runnable, split task packets produce executable child nodes, child Work Queue items materialize, child NodeReadinessState refs exist, one selected child hydrates a NodeExecutionPacket and runs a bounded worker smoke when executable, and latest-run-state/readback show split state without worker_adapter_threw:unclassified.",
    scope: [
      "resource_materialization_split_required_result",
      "parent_node_aggregate_non_runnable_lifecycle",
      "split_task_packet_to_child_node_compiler",
      "child_graph_edge_and_work_queue_materialization",
      "child_node_readiness_evaluation",
      "split_required_loop_guard",
      "supervisor_resource_materialization_error_classification",
      "before_after_split_required_replay_boundary",
      "latest_run_state_split_readback",
      "product_spec_split_boundary_replay_and_child_worker_smoke",
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
        90,
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
      "Split-Required Resource Materialization Transition",
      "Make split_required a first-class scheduler/resource transition: aggregate parent nodes become non-runnable, accepted split packets compile into executable child nodes, child Work Queue items/readiness refs materialize, and Product/Spec proof can resume from the split boundary.",
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
        productSpecProofSequencing:
          "after_split_required_resource_materialization_transition_replay",
        successGate:
          "Full Product/Spec proof may rerun only after split-required resource materialization replay proves parent-to-child executable node promotion and one child worker smoke.",
        latestBlockingRuntimeJobId: failureRuntimeJobId,
        latestBlockingGraphId: failureGraphId,
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

  const activeRows = await sql.query(
    `
      SELECT work_item_id, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );

  const ids = activeRows.rows.map((row) => row.work_item_id);
  const managed = new Set([workItemId, productSpecItemId]);
  const withoutManaged = ids.filter((id) => !managed.has(id));
  const reordered = [workItemId, productSpecItemId, ...withoutManaged];
  const baseRank = 90;

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
             metadata->'blockedByWorkItemIds' AS blocked_by,
             metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 20
    `,
  );

  const artifact = writeArtifact("split-required-resource-materialization-queue-update.json", {
    ok: true,
    workItemId,
    productSpecItemId,
    sourceSpecRef,
    failureRuntimeJobId,
    failureGraphId,
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
        workItemId,
        productSpecItemId,
        artifact,
        topActiveItems: topRows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
