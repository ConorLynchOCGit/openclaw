import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";
import {
  executeSessionTurnProof,
  SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW,
  SESSION_TURN_PROOF_MODEL_REF,
  SESSION_TURN_PROOF_REQUEST_SEED,
  SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
  writeSessionTurnProofArtifacts,
} from "../src/agents/model-memory.session-turn-proof.js";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory session turn proof",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "targeted_trace_scratch_db",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-session-turn-proof-",
  });

  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });
  try {
    const report = await executeSessionTurnProof({
      runtime,
      config,
      modelRef: SESSION_TURN_PROOF_MODEL_REF,
      candidateModelRef: SESSION_TURN_PROOF_MODEL_REF,
      requestSeed: SESSION_TURN_PROOF_REQUEST_SEED,
      requestTimeoutMs: SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
      maxWordsPerWindow: SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW,
      onProgress: (message) => {
        process.stderr.write(`[model-memory-turn-proof] ${message}\n`);
      },
    });

    const paths = await writeSessionTurnProofArtifacts({
      repoRoot,
      report,
    });

    process.stdout.write(
      [
        paths.promptsJsonPath,
        paths.promptsMarkdownPath,
        paths.reportJsonPath,
        paths.reportMarkdownPath,
      ].join("\n") + "\n",
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
