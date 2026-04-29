#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/phase2-deterministic-judgment-audit";
const DEFAULT_SCAN_ROOTS = [
  "extensions/model-memory/src",
  "src/infra",
  "src/gateway/server-methods",
  "src/agents",
  "scripts",
  "ui/src/ui",
];
const DEFAULT_INCLUDE_PATTERNS = [
  /^extensions\/model-memory\/src\//u,
  /^src\/agents\/model-memory/u,
  /^src\/infra\/(?:model-memory|heartbeat-runner)/u,
  /^src\/gateway\/server-methods\/model-memory/u,
  /^scripts\/model-memory/u,
  /^ui\/src\/ui\//u,
];
const SKIP_DIRS = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  ".artifacts",
  "evidence",
]);

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function collectFiles(root, relativeDir, files) {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir);
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const relativePath = path.join(relativeDir, entry);
    const absolutePath = path.join(root, relativePath);
    const info = await stat(absolutePath);
    if (info.isDirectory()) {
      await collectFiles(root, relativePath, files);
      continue;
    }
    if (!/\.(?:ts|tsx|js|mjs)$/u.test(entry)) {
      continue;
    }
    if (!DEFAULT_INCLUDE_PATTERNS.some((pattern) => pattern.test(relativePath))) {
      continue;
    }
    files.push(relativePath);
  }
}

async function main() {
  const root = repoRoot();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, timestampId());
  await mkdir(outputDir, { recursive: true });

  const scanRoots = (readArg("--scan-roots") ?? DEFAULT_SCAN_ROOTS.join(","))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const paths = [];
  for (const scanRoot of scanRoots) {
    await collectFiles(root, scanRoot, paths);
  }
  const files = await Promise.all(
    paths
      .toSorted((left, right) => left.localeCompare(right))
      .map(async (relativePath) => ({
        path: relativePath,
        text: await readFile(path.join(root, relativePath), "utf8"),
      })),
  );

  const { buildDeterministicJudgmentAuditReport, renderDeterministicJudgmentAuditMarkdown } =
    await tsImport(
      path.join(root, "extensions/model-memory/src/runtime/phase2-deterministic-judgment-audit.ts"),
      import.meta.url,
    );
  const report = buildDeterministicJudgmentAuditReport({ files });
  const jsonPath = path.join(outputDir, "deterministic-judgment-audit.json");
  const markdownPath = path.join(outputDir, "deterministic-judgment-audit.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderDeterministicJudgmentAuditMarkdown(report));

  console.log(
    JSON.stringify(
      {
        schemaVersion: "deterministic_judgment_audit_script_result.v1",
        jsonPath,
        markdownPath,
        fileCount: report.fileCount,
        semanticJudgmentReviewCount: report.semanticJudgmentReviewCount,
        ambiguousReviewCount: report.ambiguousReviewCount,
        allowedGuardrailCount: report.allowedGuardrailCount,
        runtimeFindingCount: report.runtimeFindingCount,
        nonRuntimeFindingCount: report.nonRuntimeFindingCount,
        runtimeEliminationDebtCount: report.runtimeEliminationDebtCount,
        testEnshrinementDebtCount: report.testEnshrinementDebtCount,
        fixtureReferenceNoiseCount: report.fixtureReferenceNoiseCount,
        aggressiveEliminationRequiredCount: report.aggressiveEliminationRequiredCount,
        classificationCounts: report.classificationCounts,
        runtimeClassificationCounts: report.runtimeClassificationCounts,
        topRuntimeDebtHotspots: report.topRuntimeDebtHotspots.slice(0, 10),
        topTestDebtHotspots: report.topTestDebtHotspots.slice(0, 10),
        topPriorityHotspots: report.priorityHotspots.slice(0, 10),
      },
      null,
      2,
    ),
  );
  if (hasFlag("--fail-on-value-judgment") && report.aggressiveEliminationRequiredCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
