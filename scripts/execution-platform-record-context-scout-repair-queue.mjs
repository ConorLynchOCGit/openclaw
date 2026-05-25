#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const workItemId = "openclaw-convergence.context-scout-execution-packet-request-context-repair";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair.md";
const failureRuntimeJobId = "native-exec-06e162ea7066ac2e";
const failurePromptHash = "da653d2e62b859d27dd1ae409bcdec4ca638dac97c2b2338429651e7641731ea";

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
    artifactKind: "execution_platform.context_scout_repair_work_item",
    sourceSpecRef,
    specSectionRef: `${sourceSpecRef}#work-queue-item`,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    proofFailureRuntimeJobId: failureRuntimeJobId,
    proofFailurePromptHash: failurePromptHash,
    blockedProductSpecProofReason:
      "Context scout provider calls preflight-blocked from oversized monolithic prompts and provider-timeout policy mismatch; request-context repair still exposed model-authored runtime envelope fields.",
    dependsOn: [
      "openclaw-convergence.runtime-node-readiness-transition-engine",
      "openclaw-convergence.structured-tool-schema-adapter-hardening",
      "openclaw-convergence.scheduler-readiness-state-unification",
    ],
    successGate:
      "Replay native-exec-06e162ea7066ac2e context-supply boundary; pass only if context scout execution packets compile within policy, provider calls can start, context blockers/handoffs are visible in readback, and request-context repair compiles runtime-owned prerequisite nodes/edges without model-authored envelopes.",
    scope: [
      "context_scout_execution_packet",
      "context_scout_build_execution_packet_tool",
      "context_scout_prompt_excerpt_tool",
      "context_scout_repo_context_tool",
      "context_scout_handoff_packet_tool",
      "provider_timeout_policy_derivation",
      "context_scout_preflight_policy_alignment",
      "semantic_request_context_intent",
      "runtime_compiled_context_prerequisite_nodes",
      "request_context_repair_diagnostics",
      "work_queue_context_supply_readback",
      "product_spec_context_supply_boundary_replay",
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
      "Context Scout Execution Packet And Request-Context Repair Compiler",
      "Replace monolithic context-scout role prompt assembly with bounded runtime-compiled ContextScoutExecutionPackets, derive provider-call timeouts from model-task policy, and compile request-context repair from semantic model intent into runtime-owned context prerequisite nodes and edges.",
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
          "after_context_scout_execution_packet_request_context_repair_boundary_replay",
        successGate:
          "Full Product/Spec proof may rerun only after context-supply boundary replay from native-exec-06e162ea7066ac2e passes.",
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

  const artifactRef = writeArtifact("context-scout-repair-work-queue-update.json", {
    artifactKind: "context_scout_repair_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    sourceSpecRef,
    workItemId,
    productSpecItemId,
    failureRuntimeJobId,
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

  await runtime.close?.();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
