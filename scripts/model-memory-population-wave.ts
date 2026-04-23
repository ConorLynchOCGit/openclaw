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
  executePopulationWave,
  renderPopulationWaveMarkdown,
  renderPopulationWavePlanMarkdown,
} from "../src/agents/model-memory.population-wave.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
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
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;
const DEFAULT_MAX_WORDS_PER_WINDOW =
  Number.parseInt(process.env.MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
const DEFAULT_LIMIT =
  Number.parseInt(process.env.MODEL_MEMORY_POPULATION_LIMIT?.trim() ?? "", 10) || 100;
const DEFAULT_CHUNK_SIZE =
  Number.parseInt(process.env.MODEL_MEMORY_POPULATION_CHUNK_SIZE?.trim() ?? "", 10) || 10;

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory population wave",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "full_corpus_proof_db",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-population-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });

  try {
    const report = await executePopulationWave({
      runtime,
      config,
      repoRoot,
      modelRef: DEFAULT_MODEL_REF,
      candidateModelRef: DEFAULT_CANDIDATE_MODEL_REF,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
      maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
      limit: DEFAULT_LIMIT,
      chunkSize: DEFAULT_CHUNK_SIZE,
      onProgress: (event) => {
        process.stderr.write(`[model-memory-population] ${event.message}\n`);
      },
    });

    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });

    const planJsonPath = path.join(evidenceDir, "first-100-population-plan.json");
    const planMarkdownPath = path.join(evidenceDir, "first-100-population-plan.md");
    const reportJsonPath = path.join(evidenceDir, "first-100-population-run.json");
    const reportMarkdownPath = path.join(evidenceDir, "first-100-population-run.md");

    await writeFile(planJsonPath, `${JSON.stringify(report.plan, null, 2)}\n`, "utf8");
    await writeFile(planMarkdownPath, `${renderPopulationWavePlanMarkdown(report.plan)}\n`, "utf8");
    await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(reportMarkdownPath, `${renderPopulationWaveMarkdown(report)}\n`, "utf8");

    process.stdout.write(
      [planJsonPath, planMarkdownPath, reportJsonPath, reportMarkdownPath].join("\n") + "\n",
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
