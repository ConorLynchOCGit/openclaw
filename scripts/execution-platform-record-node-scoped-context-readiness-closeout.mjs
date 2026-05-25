#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const completedItemId = "openclaw-convergence.control-plane-04-node-scoped-context-readiness";
const nextItemId = "openclaw-convergence.control-plane-05-resource-materialization-worker-gate";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";
const nodeScopedContextSpecRef =
  "docs/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply.md";
const contextBrokerSpecRef =
  "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md";
const contextScoutPacketSpecRef =
  "docs/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair.md";

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    result: "passed",
    testFilesPassed: 4,
    testsPassed: 114,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 14,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 168,
  },
  {
    command:
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/context-broker.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
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

async function closeItem(sql, itemId, metadata, now) {
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'closed',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [JSON.stringify(metadata), now, itemId],
  );
}

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({
    applyMigrations: false,
  });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const artifactRef = writeArtifact("node-scoped-context-readiness-closeout.json", {
    artifactKind: "execution_platform.node_scoped_context_readiness_closeout",
    completedItemId,
    nextItemId,
    sourceSpecRef,
    governingSpecRefs: [
      sourceSpecRef,
      workIntentSpecRef,
      nodeScopedContextSpecRef,
      contextBrokerSpecRef,
      contextScoutPacketSpecRef,
    ],
    implementedSurfaces: [
      "workintent_context_handoff_readiness_block",
      "accepted_with_limitations_consumer_waiver_gate",
      "context_broker_request_from_node_readiness",
      "broker_backed_context_scout_prerequisite_compile",
      "context_scout_execution_packet_broker_request_summary",
      "context_supplies_edges_with_broker_request_refs",
      "scheduler_snapshot_context_readiness_readback",
      "work_queue_readback_context_status_projection",
      "focused_no_semantic_cheats_regression",
      "product_spec_replay_topology_regression",
    ],
    forbiddenPathsRetired: [
      "work_intent_with_context_handoff_materializes_without_context",
      "accepted_with_limitations_unlocks_implementation_without_consumer_waiver",
      "context_scout_runs_without_consumer_request_ref_when_broker_dispatched",
      "runtime_semantic_guessing_from_context_status_prose",
    ],
    validationCommands,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_bounds_storage_lifecycle_tool_execution_policy_validation_readiness_transitions",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  });

  const commonMetadata = {
    completedBy: "codex",
    completedAt: now,
    sourceSpecRef,
    governingSpecRefs: [
      sourceSpecRef,
      workIntentSpecRef,
      nodeScopedContextSpecRef,
      contextBrokerSpecRef,
      contextScoutPacketSpecRef,
    ],
    completionArtifactRefs: [artifactRef.path],
    validationCommands,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
  };

  await closeItem(
    sql,
    completedItemId,
    {
      ...commonMetadata,
      lifecycleMutationKind: "node_scoped_context_readiness_closeout",
      completionSummary:
        "Node-scoped context broker and readiness enforcement implemented. WorkIntent context-handoff requirements now block at consumer-scoped context supply; accepted-with-limitations context requires a consumer waiver before implementation; broker-backed context scout prerequisites carry request refs, target nodes, semantic questions, reason codes, and readback fields.",
    },
    now,
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived', 'superseded') THEN queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        nextActiveReason:
          "Node-scoped context broker/readiness gate is closed; next pre-proof blocker is resource materialization and NodeExecutionPacket worker gate.",
        dependsOnCompleted: [completedItemId],
        preProofReadinessRefs: [artifactRef.path],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "resource_materialization_worker_gate_next_active_marker",
      }),
      now,
      nextItemId,
    ],
  );

  const rows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 12
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseName: runtime.resolution.databaseName,
        completedItemId,
        nextItemId,
        artifactRef,
        topActiveItems: rows.rows,
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
