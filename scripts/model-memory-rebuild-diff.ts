import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  executeSupportOnlyRebuildDiff,
  renderSupportOnlyRebuildDiffMarkdown,
} from "../src/agents/model-memory.rebuild-diff.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory support-only rebuild diff",
  });
  const sanitizedConfigPath = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-rebuild-diff-",
  });
  process.env.OPENCLAW_CONFIG_PATH = sanitizedConfigPath;

  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const report = await executeSupportOnlyRebuildDiff({ runtime });
    const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
    await mkdir(evidenceDir, { recursive: true });
    const jsonPath = path.join(evidenceDir, "support-only-rebuild-diff.json");
    const markdownPath = path.join(evidenceDir, "support-only-rebuild-diff.md");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderSupportOnlyRebuildDiffMarkdown(report)}\n`, "utf8");
    process.stdout.write(`${jsonPath}\n${markdownPath}\n`);
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
