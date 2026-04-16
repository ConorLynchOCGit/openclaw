import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryCoreClaimDeltaMeasurementMarkdown,
  runModelMemoryCoreClaimDeltaMeasurement,
} from "../src/agents/model-memory.core-claim-delta-measurement.js";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_DUPLICATE_AUDIT_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_AUDIT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-audit.json";
const DEFAULT_DUPLICATE_REVIEW_PATH =
  process.env.MODEL_MEMORY_DUPLICATE_REVIEW_PATH?.trim() ||
  "docs/projects/model-memory/evidence/duplicate-escape-review.json";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "core claim delta measurement",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-core-claim-delta-",
  });
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode: resolveModelMemoryRunnerDatabaseMode({
      defaultMode: "full_corpus_proof_db",
    }),
  });

  try {
    const duplicateAuditPath = path.isAbsolute(DEFAULT_DUPLICATE_AUDIT_PATH)
      ? DEFAULT_DUPLICATE_AUDIT_PATH
      : path.join(repoRoot, DEFAULT_DUPLICATE_AUDIT_PATH);
    const duplicateReviewPath = path.isAbsolute(DEFAULT_DUPLICATE_REVIEW_PATH)
      ? DEFAULT_DUPLICATE_REVIEW_PATH
      : path.join(repoRoot, DEFAULT_DUPLICATE_REVIEW_PATH);

    const report = await runModelMemoryCoreClaimDeltaMeasurement({
      runtime,
      duplicateAuditPath,
      duplicateReviewPath,
    });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const jsonPath = path.join(evidenceDir, "core-claim-delta-measurement.json");
    const markdownPath = path.join(evidenceDir, "core-claim-delta-measurement.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      markdownPath,
      `${renderModelMemoryCoreClaimDeltaMeasurementMarkdown(report)}\n`,
      "utf8",
    );
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
