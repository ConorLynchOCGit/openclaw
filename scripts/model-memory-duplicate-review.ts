import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryDuplicateReviewMarkdown,
  runModelMemoryDuplicateReview,
} from "../src/agents/model-memory.duplicate-review.js";

const DEFAULT_DUPLICATE_AUDIT_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_AUDIT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-audit.json";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const duplicateAuditPath = path.isAbsolute(DEFAULT_DUPLICATE_AUDIT_PATH)
    ? DEFAULT_DUPLICATE_AUDIT_PATH
    : path.join(repoRoot, DEFAULT_DUPLICATE_AUDIT_PATH);
  const report = await runModelMemoryDuplicateReview({
    duplicateAuditPath,
  });
  const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  const jsonPath = path.join(evidenceDir, "duplicate-escape-review.json");
  const markdownPath = path.join(evidenceDir, "duplicate-escape-review.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderModelMemoryDuplicateReviewMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
