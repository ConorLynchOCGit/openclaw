#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/mission-ledger-stability-diagnostics",
);
const proofPath = path.join(artifactDir, "proof.json");
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.mission-ledger-stability-diagnostics";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const now = new Date().toISOString();

const proof = JSON.parse(await readFile(proofPath, "utf8"));
const verdict = proof.diagnosticPair?.verdict ?? proof.verdict ?? null;
const passed = verdict?.safeToRunProductSpecProof === true;

const closeout = {
  artifactKind: "mission_ledger_stability_diagnostics_closeout",
  schemaVersion: "execution-platform.mission-ledger-stability-diagnostics-closeout.v1",
  generatedAt: now,
  completedItemId,
  productSpecItemId,
  status: passed ? "closed" : "needs_review",
  verdictStatus: verdict?.status ?? "unknown",
  safeToRunProductSpecProof: passed,
  qwenNoContentCount: verdict?.qwenNoContentCount ?? null,
  gptRescueCount: verdict?.gptRescueCount ?? null,
  structuralDriftScore: verdict?.structuralDriftScore ?? null,
  summary: verdict?.summary ?? "Mission Ledger stability diagnostic did not produce a verdict.",
  blockerSummary: verdict?.blockerSummary ?? null,
  proofRefs: [
    ".artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json",
    ".artifacts/execution-platform/mission-ledger-stability-diagnostics/diagnostic-pair.json",
    ".artifacts/execution-platform/mission-ledger-stability-diagnostics/verdict.json",
    ".artifacts/execution-platform/mission-ledger-stability-diagnostics/run-a-diagnostic.json",
    ".artifacts/execution-platform/mission-ledger-stability-diagnostics/run-b-diagnostic.json",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
    "node scripts/execution-platform-run-mission-ledger-stability-diagnostics.mjs",
  ],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
};

await mkdir(artifactDir, { recursive: true });
await writeFile(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, "utf8");

const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
const sql = runtime.sqlClient;

await sql.query(
  `
    UPDATE execution_platform.work_items
    SET queue_status = $1,
        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
        updated_at = $3::timestamptz
    WHERE work_item_id = $4
  `,
  [
    passed ? "closed" : "needs_review",
    JSON.stringify({
      completedBy: "codex",
      completedAt: now,
      completionArtifactRefs: closeout.proofRefs,
      completionSummary: closeout.summary,
      missionLedgerStabilityDiagnostics: {
        verdictStatus: closeout.verdictStatus,
        safeToRunProductSpecProof: closeout.safeToRunProductSpecProof,
        qwenNoContentCount: closeout.qwenNoContentCount,
        gptRescueCount: closeout.gptRescueCount,
        structuralDriftScore: closeout.structuralDriftScore,
        blockerSummary: closeout.blockerSummary,
        proofRef: ".artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json",
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    }),
    now,
    completedItemId,
  ],
);

if (passed) {
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        nextActiveReason:
          "Mission Ledger Stability Diagnostics passed; Product/Spec Planning proof is the next pre-proof target.",
        dependsOnCompleted: [completedItemId],
        missionLedgerStabilityProofRef:
          ".artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      }),
      now,
      productSpecItemId,
    ],
  );
}

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
      ok: passed,
      closeoutPath:
        ".artifacts/execution-platform/mission-ledger-stability-diagnostics/closeout.json",
      completedItemId,
      productSpecItemId,
      verdictStatus: closeout.verdictStatus,
      safeToRunProductSpecProof: closeout.safeToRunProductSpecProof,
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
process.exit(passed ? 0 : 1);
