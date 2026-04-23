import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  executeLargeDocumentEvidencePhase,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS,
  renderLargeDocumentEvidenceMarkdown,
  TIER_ONE_LARGE_DOCUMENT_CASES,
} from "../src/agents/model-memory.large-document-evidence.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_CANDIDATE_MODEL_REF =
  process.env.MODEL_MEMORY_CANDIDATE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CANDIDATE_MODEL_ID?.trim() ||
  DEFAULT_MODEL_REF;
const CASE_FILTER = process.env.MODEL_MEMORY_EVIDENCE_CASES?.trim();
const DEFAULT_RERUN_MODE =
  process.env.MODEL_MEMORY_EVIDENCE_RERUN_MODE?.trim() === "first_run_only"
    ? "first_run_only"
    : "full";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory large document evidence",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-large-document-",
  });
  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const selectedCases = CASE_FILTER
      ? TIER_ONE_LARGE_DOCUMENT_CASES.filter((entry) =>
          CASE_FILTER.split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .includes(entry.relativePath),
        )
      : undefined;
    const report = await executeLargeDocumentEvidencePhase({
      runtime,
      repoRoot,
      modelRef: DEFAULT_MODEL_REF,
      candidateModelRef: DEFAULT_CANDIDATE_MODEL_REF,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
      rerunMode: DEFAULT_RERUN_MODE,
      cases: selectedCases,
      onCaseStart: (entry) => {
        console.error(`[model-memory] running ${entry.relativePath}`);
      },
      onCaseComplete: (entry) => {
        console.error(
          `[model-memory] completed ${entry.relativePath} capture=${entry.firstRun.capturedObjectCount} secondRun=${JSON.stringify(entry.secondRun.writeDecisionCounts)}`,
        );
      },
    });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const jsonPath = path.join(evidenceDir, "large-document-tier1.json");
    const markdownPath = path.join(evidenceDir, "large-document-tier1.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderLargeDocumentEvidenceMarkdown(report)}\n`, "utf8");
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
