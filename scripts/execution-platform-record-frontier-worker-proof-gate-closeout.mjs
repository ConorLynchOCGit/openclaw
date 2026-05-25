#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const completedItemId = "openclaw-convergence.parallel-frontier-resource-boundary-hardening";
const nextItemId = "openclaw-convergence.active-queue-34";
const proofRef =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";
const specRef =
  "docs/projects/execution-platform/specs/pre-product-spec-frontier-worker-proof-gate.md";

const proof = JSON.parse(fs.readFileSync(path.join(root, proofRef), "utf8"));
if (proof.status !== "succeeded" || proof.workerSmokeResult?.status !== "succeeded") {
  throw new Error("frontier_worker_proof_gate_requires_succeeded_worker_smoke");
}

const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
const sql = runtime.sqlClient;
const now = new Date().toISOString();

await sql.query(
  `
    UPDATE execution_platform.work_items
    SET queue_status = 'closed',
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
        updated_at = $2::timestamptz,
        closed_at = COALESCE(closed_at, $2::timestamptz)
    WHERE work_item_id = $3
  `,
  [
    JSON.stringify({
      completedBy: "codex",
      completedAt: now,
      sourceSpecRef: specRef,
      completionArtifactRefs: [proofRef],
      runtimeJobId: proof.runtimeJobId,
      graphId: proof.graphId,
      selectedNodeId: proof.selectedBoundaryNode?.nodeId ?? null,
      completedCapabilities: [
        "parallel_frontier_branch_isolation_regression_tests",
        "context_limitation_consumer_waiver_gate",
        "payload_backed_node_execution_packet_readiness",
        "direct_after_resource_worker_smoke",
        "owner_readback_trace_gate",
      ],
      completionSummary:
        "Frontier worker proof gate closed. The after-resource checkpoint hydrated NodeExecutionPacket, coding resource packet, implementation-context packet, and NodeReadinessState payloads; direct worker smoke selected one ready implementation node; Qwen/Kimi worker loop emitted model/tool/phase progress, requested context through the controller lane, applied bounded edits, ran validation, and recorded commitment-linked evidence. Codex reviewed and repaired worker-generated source changes before persistence.",
      workerSmokeChangedFileRefs: proof.workerSmokeResult.changedFileRefs ?? [],
      workerSmokeValidationRefs: proof.workerSmokeResult.validationRefs ?? [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    }),
    now,
    completedItemId,
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
      blockedByWorkItemIds: [],
      frontierWorkerProofGateCompleted: true,
      frontierWorkerProofGateRef: proofRef,
      nextActiveReason:
        "Promoted after pre-proof frontier worker gate closed with payload-backed worker smoke evidence.",
      requiredPreflightProofRefs: [proofRef],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    }),
    now,
    nextItemId,
  ],
);

const rows = await sql.query(
  `
    SELECT work_item_id, title, queue_status, queue_rank, metadata->'blockedByWorkItemIds' AS blocked_by
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
      completedItemId,
      nextItemId,
      proofRef,
      topActiveItems: rows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    },
    null,
    2,
  ),
);

await runtime.close?.();
process.exit(0);
