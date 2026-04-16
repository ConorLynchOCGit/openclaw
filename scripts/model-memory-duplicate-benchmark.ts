import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryDuplicateBenchmarkMarkdown,
  runModelMemoryDuplicateBenchmark,
} from "../src/agents/model-memory.duplicate-benchmark.js";

const DEFAULT_DUPLICATE_AUDIT_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_AUDIT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-audit.json";
const DEFAULT_DUPLICATE_REVIEW_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_REVIEW_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-review.json";

type DuplicateAuditMetadata = {
  databaseMode?: string;
  databaseName?: string;
};

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const duplicateAuditPath = path.isAbsolute(DEFAULT_DUPLICATE_AUDIT_PATH)
    ? DEFAULT_DUPLICATE_AUDIT_PATH
    : path.join(repoRoot, DEFAULT_DUPLICATE_AUDIT_PATH);
  const duplicateReviewPath = path.isAbsolute(DEFAULT_DUPLICATE_REVIEW_PATH)
    ? DEFAULT_DUPLICATE_REVIEW_PATH
    : path.join(repoRoot, DEFAULT_DUPLICATE_REVIEW_PATH);
  const duplicateAudit = JSON.parse(
    await readFile(duplicateAuditPath, "utf8"),
  ) as DuplicateAuditMetadata;
  const priorBenchmarkPath = path.join(
    repoRoot,
    "docs/projects/model-memory/evidence/duplicate-escape-benchmark.json",
  );
  const report = await runModelMemoryDuplicateBenchmark({
    duplicateAuditPath,
    duplicateReviewPath,
    databaseMode: duplicateAudit.databaseMode,
    databaseName: duplicateAudit.databaseName,
    priorBenchmarkPath,
  });
  const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, "duplicate-escape-benchmark.json");
  const markdownPath = path.join(evidenceDir, "duplicate-escape-benchmark.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderModelMemoryDuplicateBenchmarkMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
