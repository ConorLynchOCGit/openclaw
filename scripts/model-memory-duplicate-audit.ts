import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  renderModelMemoryDuplicateAuditMarkdown,
  runModelMemoryDuplicateAudit,
} from "../src/agents/model-memory.duplicate-audit.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_PROOF_REPORT_PATH =
  process.env.MODEL_MEMORY_PROOF_REPORT_PATH?.trim() ||
  "docs/projects/model-memory/evidence/proof-phase-report.json";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory duplicate audit",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "full_corpus_proof_db",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-duplicate-audit-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });
  try {
    const report = await runModelMemoryDuplicateAudit({
      runtime,
      proofPhaseReportPath: path.isAbsolute(DEFAULT_PROOF_REPORT_PATH)
        ? DEFAULT_PROOF_REPORT_PATH
        : path.join(repoRoot, DEFAULT_PROOF_REPORT_PATH),
    });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const jsonPath = path.join(evidenceDir, "duplicate-escape-audit.json");
    const markdownPath = path.join(evidenceDir, "duplicate-escape-audit.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderModelMemoryDuplicateAuditMarkdown(report)}\n`, "utf8");
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
