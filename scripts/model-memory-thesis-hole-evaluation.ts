import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryThesisHoleEvaluationMarkdown,
  runModelMemoryThesisHoleEvaluation,
} from "../src/agents/model-memory.thesis-hole-evaluation.js";

const DEFAULT_AGENTS_TRACE_PATH =
  process.env.MODEL_MEMORY_AGENTS_TRACE_PATH?.trim() ||
  "docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json";
const DEFAULT_COMPARISON_TRACE_PATHS = (
  process.env.MODEL_MEMORY_THESIS_COMPARISON_TRACE_PATHS?.trim() ||
  [
    "docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json",
    "docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json",
  ].join(",")
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const DEFAULT_DUPLICATE_AUDIT_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_AUDIT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-audit.json";
const DEFAULT_DUPLICATE_BENCHMARK_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_BENCHMARK_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-benchmark.json";
const DEFAULT_DUPLICATE_REVIEW_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_REVIEW_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-review.json";
const DEFAULT_PROOF_PHASE_REPORT_PATH =
  process.env.MODEL_MEMORY_PROOF_REPORT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/proof-phase-report.json";
const DEFAULT_SUPPORT_ONLY_REBUILD_DIFF_PATH =
  process.env.MODEL_MEMORY_SUPPORT_ONLY_REBUILD_DIFF_PATH?.trim() ||
  "docs/projects/model-memory/evidence/support-only-rebuild-diff.json";

function resolvePath(repoRoot: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await runModelMemoryThesisHoleEvaluation({
    agentsTracePath: DEFAULT_AGENTS_TRACE_PATH,
    comparisonTracePaths: DEFAULT_COMPARISON_TRACE_PATHS,
    duplicateAuditPath: DEFAULT_DUPLICATE_AUDIT_PATH,
    duplicateBenchmarkPath: DEFAULT_DUPLICATE_BENCHMARK_PATH,
    duplicateReviewPath: DEFAULT_DUPLICATE_REVIEW_PATH,
    proofPhaseReportPath: DEFAULT_PROOF_PHASE_REPORT_PATH,
    supportOnlyRebuildDiffPath: DEFAULT_SUPPORT_ONLY_REBUILD_DIFF_PATH,
  });
  const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, "thesis-hole-evaluation.json");
  const markdownPath = path.join(evidenceDir, "thesis-hole-evaluation.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    `${renderModelMemoryThesisHoleEvaluationMarkdown(report)}\n`,
    "utf8",
  );

  process.stdout.write(
    [
      resolvePath(repoRoot, "docs/projects/model-memory/evidence/thesis-hole-evaluation.json"),
      resolvePath(repoRoot, "docs/projects/model-memory/evidence/thesis-hole-evaluation.md"),
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
