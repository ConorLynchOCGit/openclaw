import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderModelMemoryCacheDiffMarkdown,
  runModelMemoryCacheDiff,
} from "../src/agents/model-memory.cache-diff.js";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_RETRIEVAL_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) || 180_000;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) || 7;
const DEFAULT_PROBE_ID = process.env.MODEL_MEMORY_CONTEXT_PROBE_ID?.trim() || "probe-live-tests";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory cache diff",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-cache-diff-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;
  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const report = await runModelMemoryCacheDiff({
      runtime,
      config,
      probeId: DEFAULT_PROBE_ID,
      modelRef: DEFAULT_MODEL_REF,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
    });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const jsonPath = path.join(evidenceDir, "cache-diff-report.json");
    const markdownPath = path.join(evidenceDir, "cache-diff-report.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderModelMemoryCacheDiffMarkdown(report)}\n`, "utf8");
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
