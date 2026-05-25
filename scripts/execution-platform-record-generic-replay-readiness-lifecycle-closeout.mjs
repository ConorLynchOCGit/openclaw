#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/generic-replay-readiness-lifecycle",
);
const closeoutPath = path.join(artifactDir, "closeout.json");
const sourceInventoryAuditPath = path.join(artifactDir, "source-inventory-audit.json");
const completedItemId = "openclaw-convergence.post-proof-03-generic-replay-readiness-lifecycle";
const nextItemId =
  "openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization";
const now = new Date().toISOString();

const knownDeferredBoundarySurfaces = [
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
    files.push({ path: filePath, source: await readFile(path.join(root, filePath), "utf8") });
  }
  return files;
}

function isDeferredBoundaryFinding(finding) {
  return knownDeferredBoundarySurfaces.some(
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
  const runtimeApi = await tsImport(
    path.join(root, "extensions/execution-platform/runtime-api.ts"),
    import.meta.url,
  );
  const { createExecutionPlatformDatabaseRuntime } = await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );

  const sourceInventoryAudit = guardrails.evaluateExecutionPlatformBoundaryGuardrails(
    await readSourceInventoryFiles(),
  );
  const sourceInventoryHardBlocks = sourceInventoryAudit.findings.filter(
    (finding) => finding.severity === "hard_block",
  );
  const unknownSourceInventoryHardBlocks = sourceInventoryHardBlocks.filter(
    (finding) => !isDeferredBoundaryFinding(finding),
  );

  await mkdir(artifactDir, { recursive: true });
  const sourceInventoryAuditBody = `${JSON.stringify(sourceInventoryAudit, null, 2)}\n`;
  await writeFile(sourceInventoryAuditPath, sourceInventoryAuditBody, "utf8");

  if (
    sourceInventoryHardBlocks.length !== sourceInventoryAudit.hardBlockCount ||
    unknownSourceInventoryHardBlocks.length > 0
  ) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "generic_replay_readiness_lifecycle_unknown_boundary_hard_blocks",
          sourceInventoryAuditRef:
            ".artifacts/execution-platform/generic-replay-readiness-lifecycle/source-inventory-audit.json",
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

  const registrySummary = runtimeApi.boundaryReplayRegistrySummary();
  const closeout = {
    artifactKind: "generic_replay_readiness_lifecycle_closeout",
    schemaVersion: "execution-platform.generic-replay-readiness-lifecycle-closeout.v1",
    generatedAt: now,
    completedItemId,
    nextItemId,
    implementationSummary:
      "Generic Replay And Readiness Lifecycle made boundary replay registry-backed runtime state. The registry owns boundary dependencies, versioned normalizers, resume command defaults, allowed transitions, blocker classes, readback fields, and diagnostic-only policy. BoundaryReplayService compiles replay plans and production continuations from the registry, after_context_synthesis is diagnostic-only, Work Queue readback surfaces registry-backed replay fields, and the Product/Spec replay CLI now resolves supported boundary policy through the runtime registry.",
    registrySummary,
    codeRefs: [
      "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts",
      "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      "scripts/execution-platform-record-generic-replay-readiness-lifecycle-closeout.mjs",
    ],
    docsRefs: [
      "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md",
      "docs/projects/execution-platform/specs/post-proof-generic-runtime-extraction.md",
      "docs/projects/execution-platform/STATUS.md",
      "docs/projects/execution-platform/CURRENT_SLICE.md",
      "docs/projects/execution-platform/DECISIONS.md",
      "docs/projects/execution-platform/roadmap.md",
    ],
    validationRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.test.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/boundary-replay-registry.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/index.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs scripts/execution-platform-record-generic-replay-readiness-lifecycle-closeout.mjs",
      "node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      "node --check scripts/execution-platform-record-generic-replay-readiness-lifecycle-closeout.mjs",
      "git diff --check -- touched-files",
    ],
    sourceInventoryAuditRef:
      ".artifacts/execution-platform/generic-replay-readiness-lifecycle/source-inventory-audit.json",
    sourceInventoryAuditSha256: sha256(sourceInventoryAuditBody),
    sourceInventoryAuditStatus: sourceInventoryAudit.status,
    sourceInventoryHardBlockCount: sourceInventoryAudit.hardBlockCount,
    sourceInventoryHardBlocksDeferredToCompatibilityPass: true,
    remainingRisks: [
      "Product/Spec boundary replay script remains a large diagnostic CLI and still contains worker smoke logic; it now uses registry-backed boundary policy, but full CLI thinning remains coupled to progress/readback modularization and compatibility retirement.",
      "Full source inventory still has deferred legacy/replay import hard blocks; Compatibility Retirement And Middleware Bypass Audit remains queued.",
    ],
    nextGate:
      "Progress, Readback, And Runtime Event Modularization should run next so owner readback and event projections are smaller generic modules before the Product/Spec proof.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
  };
  await writeFile(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, "utf8");

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
          ".artifacts/execution-platform/generic-replay-readiness-lifecycle/source-inventory-audit.json",
          ".artifacts/execution-platform/generic-replay-readiness-lifecycle/closeout.json",
        ],
        completionSummary: closeout.implementationSummary,
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
        nextActiveReason:
          "Generic Replay And Readiness Lifecycle is closed; Progress, Readback, And Runtime Event Modularization is the next pre-proof modularization item.",
        dependsOnCompleted: [completedItemId],
        genericReplayReadinessLifecycleCloseoutRef:
          ".artifacts/execution-platform/generic-replay-readiness-lifecycle/closeout.json",
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
        closeoutRef:
          ".artifacts/execution-platform/generic-replay-readiness-lifecycle/closeout.json",
        sourceInventoryAuditRef:
          ".artifacts/execution-platform/generic-replay-readiness-lifecycle/source-inventory-audit.json",
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
