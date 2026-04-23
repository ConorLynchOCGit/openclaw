import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExecutorBackedSemanticCollisionAdjudicator } from "../extensions/model-memory/runtime-api.js";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import { OpenAICompatibleLiveJsonExecutor } from "../src/agents/model-memory.live-json-executor.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";
import {
  renderModelMemoryZeroCandidateRecoveryEvalMarkdown,
  runModelMemoryZeroCandidateRecoveryEval,
} from "../src/agents/model-memory.zero-candidate-recovery-eval.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_CANDIDATE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CANDIDATE_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) || 180_000;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) || 7;

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "bounded candidate adjudication evaluation",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-zero-candidate-recovery-eval-",
  });

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode: "full_corpus_proof_db",
  });

  try {
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
    });
    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    const report = await runModelMemoryZeroCandidateRecoveryEval({
      runtime,
      adjudicator,
      duplicateAuditPath: path.join(
        repoRoot,
        "docs/projects/model-memory/evidence/duplicate-escape-audit.json",
      ),
      duplicateReviewPath: path.join(
        repoRoot,
        "docs/projects/model-memory/evidence/duplicate-escape-review.json",
      ),
      modelId: DEFAULT_MODEL_REF,
    });
    const markdown = renderModelMemoryZeroCandidateRecoveryEvalMarkdown(report);
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(evidenceDir, "zero-candidate-recovery-eval.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(evidenceDir, "zero-candidate-recovery-eval.md"),
      `${markdown}\n`,
      "utf8",
    );
    process.stdout.write(
      [
        `[zero-candidate-recovery-eval] database=${report.databaseName}`,
        `sample=${report.sampleSize}`,
        `overallConversionRate=${report.summary.overallConversionRate}`,
        `retainedCandidateOnlySuccessRate=${report.summary.retainedCandidateOnlySuccessRate}`,
        `zeroCandidateFallbackSuccessRate=${report.summary.zeroCandidateFallbackSuccessRate}`,
        `falseMergeRate=${report.summary.falseMergeRate}`,
        `ambiguousRate=${report.summary.ambiguousRate}`,
      ].join(" ") + "\n",
    );
  } finally {
    await runtime.pool.end();
  }
}

await main();
