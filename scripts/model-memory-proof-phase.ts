import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS,
} from "../src/agents/model-memory.large-document-evidence.js";
import {
  executeModelMemoryProofPhase,
  renderAdjudicationMarkdown,
  renderProofPhaseMarkdown,
} from "../src/agents/model-memory.proof-phase.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_CANDIDATE_MODEL_REF =
  process.env.MODEL_MEMORY_CANDIDATE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;
const DEFAULT_MAX_WORDS_PER_WINDOW =
  Number.parseInt(process.env.MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
const DEFAULT_DAILY_FILE_LIMIT =
  Number.parseInt(process.env.MODEL_MEMORY_PROOF_DAILY_FILE_LIMIT?.trim() ?? "", 10) || 4;
const DEFAULT_SATURATION_RUNS =
  Number.parseInt(process.env.MODEL_MEMORY_PROOF_SATURATION_RUNS?.trim() ?? "", 10) || 3;
const DEFAULT_WORKSPACE_ROOT =
  process.env.MODEL_MEMORY_PROOF_WORKSPACE_ROOT?.trim() || "/root/.openclaw/workspace";
const DEFAULT_SOURCE_PLAN_PATH = process.env.MODEL_MEMORY_PROOF_SOURCE_PLAN?.trim() || "";
const DEFAULT_SKIP_RESET = process.env.MODEL_MEMORY_PROOF_SKIP_RESET === "1";
const DEFAULT_SKIP_INGESTION = process.env.MODEL_MEMORY_PROOF_SKIP_INGESTION === "1";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory proof phase",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "full_corpus_proof_db",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-proof-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });
  try {
    const report = await executeModelMemoryProofPhase({
      runtime,
      config,
      repoRoot,
      workspaceRoot: DEFAULT_WORKSPACE_ROOT,
      modelRef: DEFAULT_MODEL_REF,
      candidateModelRef: DEFAULT_CANDIDATE_MODEL_REF,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
      maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
      dailyFileLimit: DEFAULT_DAILY_FILE_LIMIT,
      saturationRuns: DEFAULT_SATURATION_RUNS,
      sourcePlanPath: DEFAULT_SOURCE_PLAN_PATH || undefined,
      skipReset: DEFAULT_SKIP_RESET,
      skipIngestion: DEFAULT_SKIP_INGESTION,
      onProgress: (event) => {
        process.stderr.write(`[model-memory-proof] ${event.message}\n`);
      },
    });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });

    const reportJsonPath = path.join(evidenceDir, "proof-phase-report.json");
    const reportMarkdownPath = path.join(evidenceDir, "proof-phase-report.md");
    const adjudicationJsonPath = path.join(evidenceDir, "proof-phase-adjudication.json");
    const adjudicationMarkdownPath = path.join(evidenceDir, "proof-phase-adjudication.md");

    await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(reportMarkdownPath, `${renderProofPhaseMarkdown(report)}\n`, "utf8");
    await writeFile(
      adjudicationJsonPath,
      `${JSON.stringify(report.adjudicationRows, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      adjudicationMarkdownPath,
      `${renderAdjudicationMarkdown(report.adjudicationRows)}\n`,
      "utf8",
    );

    process.stdout.write(
      [reportJsonPath, reportMarkdownPath, adjudicationJsonPath, adjudicationMarkdownPath].join(
        "\n",
      ) + "\n",
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
