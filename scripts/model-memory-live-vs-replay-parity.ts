import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryLiveVsReplayParityMarkdown,
  runModelMemoryLiveVsReplayParity,
} from "../src/agents/model-memory.live-vs-replay-parity.js";

const DEFAULT_DUPLICATE_REVIEW_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_REVIEW_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-review.json";
const DEFAULT_DUPLICATE_AUDIT_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_AUDIT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-audit.json";
const DEFAULT_CORE_CLAIM_DELTA_MEASUREMENT_PATH =
  process.env.MODEL_MEMORY_CORE_CLAIM_DELTA_MEASUREMENT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/core-claim-delta-measurement.json";
const DEFAULT_TRACE_PATHS = (
  process.env.MODEL_MEMORY_PARITY_TRACE_PATHS?.trim() ||
  [
    "docs/projects/model-memory/evidence/agents-md-collision-hinge-trace.json",
    "docs/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace.json",
    "docs/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace.json",
  ].join(",")
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

function resolvePath(repoRoot: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const report = await runModelMemoryLiveVsReplayParity({
    duplicateReviewPath: resolvePath(repoRoot, DEFAULT_DUPLICATE_REVIEW_PATH),
    duplicateAuditPath: resolvePath(repoRoot, DEFAULT_DUPLICATE_AUDIT_PATH),
    coreClaimDeltaMeasurementPath: resolvePath(repoRoot, DEFAULT_CORE_CLAIM_DELTA_MEASUREMENT_PATH),
    tracePaths: DEFAULT_TRACE_PATHS.map((tracePath) => resolvePath(repoRoot, tracePath)),
  });
  const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, "live-vs-replay-parity.json");
  const markdownPath = path.join(evidenceDir, "live-vs-replay-parity.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderModelMemoryLiveVsReplayParityMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
