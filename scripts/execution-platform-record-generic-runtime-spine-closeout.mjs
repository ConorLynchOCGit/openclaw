#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform/generic-runtime-spine");
const closeoutPath = path.join(artifactDir, "closeout.json");
const sourceInventoryAuditPath = path.join(artifactDir, "source-inventory-audit.json");
const completedItemId = "openclaw-convergence.post-proof-01-generic-runtime-spine-extraction";
const nextItemId = "openclaw-convergence.post-proof-02-dynamic-runner-plugin-thinning";
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
          reason: "generic_runtime_spine_unknown_boundary_hard_blocks",
          sourceInventoryAuditRef:
            ".artifacts/execution-platform/generic-runtime-spine/source-inventory-audit.json",
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

  const closeout = {
    artifactKind: "generic_runtime_spine_extraction_closeout",
    schemaVersion: "execution-platform.generic-runtime-spine-closeout.v1",
    generatedAt: now,
    completedItemId,
    nextItemId,
    implementationSummary:
      "Generic Runtime Spine Extraction is implemented for the production orchestration boundary. The new generic runtime spine owns workflow readiness composition, scheduler option gate evaluation, scheduler-result lifecycle status, graph-evidence false-success prevention, and bounded spine readiness/lifecycle artifact metadata. GenericOrchestrationRuntime delegates those lifecycle decisions to the spine. DynamicAgentTeamGraphRunner now persists generic runtime spine readiness and lifecycle artifacts while keeping coding-specific executor/adapters in the coding plugin surface.",
    codeRefs: [
      "extensions/execution-platform/src/workflows/generic-runtime-spine.ts",
      "extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts",
      "scripts/execution-platform-record-generic-runtime-spine-closeout.mjs",
    ],
    docsRefs: [
      "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md",
      "docs/projects/execution-platform/specs/post-proof-generic-runtime-extraction.md",
      "docs/projects/execution-platform/specs/generic-orchestration-runtime.md",
      "docs/projects/execution-platform/STATUS.md",
      "docs/projects/execution-platform/CURRENT_SLICE.md",
      "docs/projects/execution-platform/DECISIONS.md",
      "docs/projects/execution-platform/roadmap.md",
    ],
    validationRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
      'pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts -t "generic orchestration runtime|scheduler-backed"',
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/generic-runtime-spine.ts extensions/execution-platform/src/workflows/generic-runtime-spine.test.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/workflows/index.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts scripts/execution-platform-record-generic-runtime-spine-closeout.mjs",
      "git diff --check -- touched-files",
    ],
    sourceInventoryAuditRef:
      ".artifacts/execution-platform/generic-runtime-spine/source-inventory-audit.json",
    sourceInventoryAuditSha256: sha256(sourceInventoryAuditBody),
    sourceInventoryAuditStatus: sourceInventoryAudit.status,
    sourceInventoryHardBlockCount: sourceInventoryAudit.hardBlockCount,
    sourceInventoryHardBlocksDeferredToCompatibilityPass: true,
    remainingRisks: [
      "DynamicAgentTeamGraphRunner still contains large coding orchestration bulk and resource materialization callbacks; Dynamic Runner Plugin Thinning remains the next queue item.",
      "Full source inventory still has deferred legacy/replay import hard blocks; Compatibility Retirement And Middleware Bypass Audit remains queued.",
    ],
    nextGate:
      "Dynamic Runner Plugin Thinning should run next, using the generic runtime spine as the production lifecycle boundary while moving remaining coding-specific bulk behind plugin interfaces.",
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
          ".artifacts/execution-platform/generic-runtime-spine/source-inventory-audit.json",
          ".artifacts/execution-platform/generic-runtime-spine/closeout.json",
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
          "Generic Runtime Spine Extraction is closed; Dynamic Runner Plugin Thinning is the next pre-proof modularization item.",
        dependsOnCompleted: [completedItemId],
        genericRuntimeSpineCloseoutRef:
          ".artifacts/execution-platform/generic-runtime-spine/closeout.json",
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
        closeoutRef: ".artifacts/execution-platform/generic-runtime-spine/closeout.json",
        sourceInventoryAuditRef:
          ".artifacts/execution-platform/generic-runtime-spine/source-inventory-audit.json",
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
