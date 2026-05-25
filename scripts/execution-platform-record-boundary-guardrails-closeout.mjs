#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform/pre-proof-boundary-guardrails");
const auditPath = path.join(artifactDir, "audit.json");
const sourceInventoryAuditPath = path.join(artifactDir, "source-inventory-audit.json");
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId =
  "openclaw-convergence.pre-proof-01-execution-platform-characterization-guardrails";
const nextItemId = "openclaw-convergence.post-proof-01-generic-runtime-spine-extraction";
const now = new Date().toISOString();

const auditedFiles = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
  "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
  "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
];

const knownCompatibilitySurfacesForLaterPass = [
  "extensions/execution-platform/src/codex-bridge/index.ts",
  "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/coding-team-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts",
  "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts",
  "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
  "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
];

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function readAuditedFiles() {
  const files = [];
  for (const filePath of auditedFiles) {
    files.push({
      path: filePath,
      source: await readFile(path.join(root, filePath), "utf8"),
    });
  }
  return files;
}

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      files.push(...(await collectFiles(absolutePath, predicate)));
      continue;
    }
    const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
    if (predicate(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

async function readSourceInventoryFiles() {
  const sourceFiles = await collectFiles(
    path.join(root, "extensions/execution-platform/src"),
    (relativePath) => /\.[cm]?[jt]sx?$/.test(relativePath),
  );
  const scriptFiles = await collectFiles(path.join(root, "scripts"), (relativePath) =>
    /^scripts\/execution-platform-.*\.mjs$/.test(relativePath),
  );
  const uniqueFiles = [...new Set([...sourceFiles, ...scriptFiles])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const files = [];
  for (const filePath of uniqueFiles) {
    files.push({
      path: filePath,
      source: await readFile(path.join(root, filePath), "utf8"),
    });
  }
  return files;
}

function isDeferredCompatibilityFinding(finding) {
  return knownCompatibilitySurfacesForLaterPass.some(
    (surfacePath) => finding.path === surfacePath || finding.importedPath === surfacePath,
  );
}

async function main() {
  const guardrails = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
    ),
    import.meta.url,
  );
  const { createExecutionPlatformDatabaseRuntime } = await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );

  const audit = guardrails.evaluateExecutionPlatformBoundaryGuardrails(await readAuditedFiles());
  const sourceInventoryAudit = guardrails.evaluateExecutionPlatformBoundaryGuardrails(
    await readSourceInventoryFiles(),
  );
  await mkdir(artifactDir, { recursive: true });
  const auditBody = `${JSON.stringify(audit, null, 2)}\n`;
  const sourceInventoryAuditBody = `${JSON.stringify(sourceInventoryAudit, null, 2)}\n`;
  await writeFile(auditPath, auditBody, "utf8");
  await writeFile(sourceInventoryAuditPath, sourceInventoryAuditBody, "utf8");

  const sourceInventoryHardBlocks = sourceInventoryAudit.findings.filter(
    (finding) => finding.severity === "hard_block",
  );
  const sourceInventoryHardBlocksAreFullyVisible =
    sourceInventoryHardBlocks.length === sourceInventoryAudit.hardBlockCount;
  const unknownSourceInventoryHardBlocks = sourceInventoryHardBlocks.filter(
    (finding) => !isDeferredCompatibilityFinding(finding),
  );

  const closeout = {
    artifactKind: "pre_product_spec_boundary_guardrails_closeout",
    schemaVersion: "execution-platform.pre-proof-boundary-guardrails-closeout.v1",
    generatedAt: now,
    completedItemId,
    nextItemId,
    auditRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/audit.json",
    auditSha256: sha256(auditBody),
    auditStatus: audit.status,
    sourceInventoryAuditRef:
      ".artifacts/execution-platform/pre-proof-boundary-guardrails/source-inventory-audit.json",
    sourceInventoryAuditSha256: sha256(sourceInventoryAuditBody),
    sourceInventoryAuditStatus: sourceInventoryAudit.status,
    sourceInventoryHardBlockCount: sourceInventoryAudit.hardBlockCount,
    sourceInventoryHardBlocksDeferredToCompatibilityPass:
      sourceInventoryHardBlocksAreFullyVisible && unknownSourceInventoryHardBlocks.length === 0,
    implementationSummary:
      "Characterization and import-boundary guardrails are implemented. A typed boundary classifier now separates production runtime, workflow plugins, coding/worker adapters, Work Queue readback, Runtime Tool Kernel, model-task contracts, replay harnesses, proof scripts, diagnostic scripts, test fixtures, and deprecated legacy surfaces. The critical pre-proof audit blocks production imports of replay/proof/diagnostic/test/legacy modules, flags default context_synthesis replay glue, records a module ownership map, and preserves raw-storage false flags. A full source inventory audit is also written; its remaining hard blocks are explicitly deferred compatibility surfaces for the extraction/retirement passes. Work Queue readback no longer imports the deleted generic workflow runner just to read its retirement artifact constant.",
    codeRefs: [
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts",
      "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      "extensions/execution-platform/src/workflows/generic-workflow-runner-retirement-contract.ts",
      "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
      "scripts/execution-platform-record-boundary-guardrails-closeout.mjs",
    ],
    docsRefs: [
      "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md",
      "docs/projects/execution-platform/STATUS.md",
      "docs/projects/execution-platform/CURRENT_SLICE.md",
      "docs/projects/execution-platform/DECISIONS.md",
    ],
    validationRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/codex-bridge/runtime-api-export-hygiene.test.ts extensions/execution-platform/src/workers/middleware-bypass-audit.test.ts",
      'pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts -t "node-scoped|context synthesis|synthesis"',
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/generic-workflow-runner-retirement-contract.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts extensions/execution-platform/src/workflows/index.ts scripts/execution-platform-record-boundary-guardrails-closeout.mjs",
      "git diff --check -- docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md docs/projects/execution-platform/STATUS.md docs/projects/execution-platform/CURRENT_SLICE.md docs/projects/execution-platform/DECISIONS.md extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/generic-workflow-runner-retirement-contract.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts extensions/execution-platform/src/workflows/index.ts scripts/execution-platform-record-boundary-guardrails-closeout.mjs",
    ],
    remainingRisks: [
      "Broader compatibility surfaces remain for the promoted Compatibility Retirement And Middleware Bypass Audit item; they are listed explicitly, verified by the source inventory audit, and are not closed by this characterization pass.",
      "This pass adds guardrails and removes a constant-only production import of deleted generic workflow runner, but it intentionally does not perform the runner deletion completed by the compatibility-retirement pass.",
    ],
    knownCompatibilitySurfacesForLaterPass,
    nextGate:
      "Generic Runtime Spine Extraction should run next, using these guardrails to prevent proof/replay topology and compatibility paths from entering the production runtime spine.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
  };
  await writeFile(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, "utf8");

  if (audit.status !== "passed") {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "boundary_guardrail_audit_not_passed",
          auditStatus: audit.status,
          auditRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/audit.json",
          closeoutRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/closeout.json",
          reasonCodes: audit.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }
  if (!sourceInventoryHardBlocksAreFullyVisible || unknownSourceInventoryHardBlocks.length > 0) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "source_inventory_has_unknown_boundary_hard_blocks",
          sourceInventoryAuditStatus: sourceInventoryAudit.status,
          sourceInventoryAuditRef:
            ".artifacts/execution-platform/pre-proof-boundary-guardrails/source-inventory-audit.json",
          sourceInventoryHardBlockCount: sourceInventoryAudit.hardBlockCount,
          visibleHardBlockCount: sourceInventoryHardBlocks.length,
          unknownSourceInventoryHardBlocks,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
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
        completionArtifactRefs: [
          ".artifacts/execution-platform/pre-proof-boundary-guardrails/audit.json",
          ".artifacts/execution-platform/pre-proof-boundary-guardrails/source-inventory-audit.json",
          ".artifacts/execution-platform/pre-proof-boundary-guardrails/closeout.json",
        ],
        completionSummary: closeout.implementationSummary,
        validationRefs: closeout.validationRefs,
        knownCompatibilitySurfacesForLaterPass,
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
        nextActiveReason:
          "Boundary characterization and import guardrails are closed; Generic Runtime Spine Extraction is the next pre-proof modularization item.",
        dependsOnCompleted: [completedItemId],
        guardrailAuditRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/audit.json",
        sourceInventoryAuditRef:
          ".artifacts/execution-platform/pre-proof-boundary-guardrails/source-inventory-audit.json",
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
      LIMIT 12
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        completedItemId,
        nextItemId,
        auditRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/audit.json",
        closeoutRef: ".artifacts/execution-platform/pre-proof-boundary-guardrails/closeout.json",
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

  if (typeof runtime.close === "function") {
    await Promise.race([runtime.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
