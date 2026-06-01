#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform/owner-readback-telemetry-proof");
const proofRef = ".artifacts/execution-platform/owner-readback-telemetry-proof/proof.json";
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.control-plane-07-readback-telemetry-proof";
const nextItemId = "openclaw-convergence.active-queue-34";
const now = new Date().toISOString();

const proof = JSON.parse(await readFile(path.join(root, proofRef), "utf8"));
if (proof.status !== "passed") {
  throw new Error(`owner readback telemetry proof did not pass: ${proof.status}`);
}

const closeout = {
  artifactKind: "owner_readback_telemetry_proof_closeout",
  schemaVersion: "execution-platform.owner-readback-telemetry-proof-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Owner Readback And Telemetry Proof is complete. Work Queue owner progress now exposes a bounded control-plane telemetry packet with WorkIntent, capability/executor, runtime node/frontier, readiness, refs, lifecycle, and token/walltime availability state. Future scheduler progress writes executionIntent/evidenceMode/executorKey/workerRef from NodeExecutionPacket summaries so readback no longer requires operators to infer executable semantics from nested raw events.",
  sourceProofRefs: [proof.sourceProofRef],
  proofRefs: [proofRef],
  validationRefs: proof.validationRefs,
  codeRefs: [
    "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "scripts/execution-platform-run-owner-readback-telemetry-proof.mjs",
  ],
  nextGate:
    "Run Product/Spec Planning Workflow Plugin Production Proof from the canonical prompt after confirming the live gateway/build is clean.",
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

await mkdir(artifactDir, { recursive: true });
await writeFile(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, "utf8");

const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
const sql = runtime.sqlClient;

try {
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'closed',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        completedBy: "codex",
        completedAt: now,
        completionSummary: closeout.implementationSummary,
        completionArtifactRefs: [proofRef, closeoutPath.replace(`${root}/`, "")],
        sourceProofRefs: closeout.sourceProofRefs,
        validationRefs: closeout.validationRefs,
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
        previousPreProofItemClosed: completedItemId,
        nextActiveReason:
          "Owner readback and telemetry proof passed; Product/Spec Planning proof is the next DB-ranked item.",
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
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 8
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        closeoutPath: ".artifacts/execution-platform/owner-readback-telemetry-proof/closeout.json",
        completedItemId,
        nextItemId,
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
} finally {
  await runtime.close?.();
  process.exit(0);
}
