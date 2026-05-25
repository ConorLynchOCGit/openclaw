#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/semantic-microtask-worker-packet-quality",
);
const completedItemId = "openclaw-convergence.semantic-microtask-refinement-worker-packet-quality";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality.md";
const proofRef =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";

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
    path: `.artifacts/execution-platform/semantic-microtask-worker-packet-quality/${name}`,
    ref: `artifact://execution-platform/semantic-microtask-worker-packet-quality/${name}`,
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

  const closeoutArtifact = writeArtifact("closeout.json", {
    artifactKind: "semantic_microtask_worker_packet_quality_closeout",
    status: "completed",
    completedItemId,
    sourceSpecRef,
    proofRef,
    completionSummary:
      "Implemented worker-packet quality enforcement. ImplementationTaskPacket carries fileChangeIntents; coding resource packets and non-Codex prompts expose file-change intent refs; context scout recommended edit points are preserved into context handoff/replay; repoScopeRefs are no longer executable target refs in boundary replay; existing ready checkpoint packets are rehydrated and validated before replay can treat them as executable; stale old Product/Spec packets now block before worker invocation with exact missing semantic intent reason codes.",
    validationRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
      "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/mission-work-packets.ts extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/post-context-implementation-task-compiler.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      "node scripts/execution-platform-run-product-spec-boundary-replay.mjs --runtime-job-id product-spec-replay-mpido4ii --graph-id team-run-native-exec-18072005944f479c-checkpoint-replay-mpido4i8-runtime-work-graph --boundary before-resource-materialization --max-parallel-node-executions 6 --max-iterations 2",
    ],
    replayOutcome:
      "The latest failed checkpoint is no longer accepted as executable from stale readiness metadata. Replay blocks before worker invocation with implementation_task_packet_file_change_intents_missing and implementation_task_packet_file_change_intent_coverage_missing for the six stale packets.",
    nextProofDirection:
      "Run Product/Spec from a fresh top-of-pipe or a checkpoint that regenerates context handoffs so recommended edit points/file-change intents can be carried into implementation packets. Do not resume from old after-resource packets that predate this contract.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_closeout",
  });

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'closed',
          closed_at = $1::timestamptz,
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = $1::timestamptz
      WHERE work_item_id = $3
    `,
    [
      now,
      JSON.stringify({
        completedBy: "codex",
        completedAt: now,
        sourceSpecRef,
        completionArtifactRefs: [closeoutArtifact.path, proofRef],
        completionSummary:
          "Worker packet quality gate is production-wired; stale materialized packets cannot bypass current semantic microtask/file-change-intent validation.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      completedItemId,
    ],
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_rank = $1,
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = $3::timestamptz
      WHERE work_item_id = $4
        AND queue_status IN ('active','blocked','needs_review')
    `,
    [
      100,
      JSON.stringify({
        unblockedByWorkItemIds: [completedItemId],
        productSpecProofSequencing:
          "fresh_product_spec_run_or_checkpoint_before_context_handoff_required",
        sourceSpecRef,
        priorStaleCheckpointBlockedByCurrentPacketGate: true,
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

  const rows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 20
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        completedItemId,
        closeoutArtifact,
        topActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
