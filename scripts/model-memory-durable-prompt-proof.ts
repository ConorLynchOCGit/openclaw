import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  DURABLE_PROMPT_PROOF_PROMPTS,
  MANUAL_UI_PROMPT_PACK,
  writeCustomSessionTurnProofArtifacts,
} from "../src/agents/model-memory.prompt-lane-proof.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";
import {
  executeSessionTurnProof,
  SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW,
  SESSION_TURN_PROOF_MODEL_REF,
  SESSION_TURN_PROOF_REQUEST_SEED,
  SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
} from "../src/agents/model-memory.session-turn-proof.js";

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory durable prompt proof",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-durable-prompt-proof-",
  });

  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const report = await executeSessionTurnProof({
      runtime,
      config,
      prompts: DURABLE_PROMPT_PROOF_PROMPTS,
      modelRef: SESSION_TURN_PROOF_MODEL_REF,
      candidateModelRef: SESSION_TURN_PROOF_MODEL_REF,
      requestSeed: SESSION_TURN_PROOF_REQUEST_SEED,
      requestTimeoutMs: SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
      maxWordsPerWindow: SESSION_TURN_PROOF_MAX_WORDS_PER_WINDOW,
      onProgress: (message) => {
        process.stderr.write(`[model-memory-durable-prompt-proof] ${message}\n`);
      },
    });

    const paths = await writeCustomSessionTurnProofArtifacts({
      repoRoot,
      prompts: DURABLE_PROMPT_PROOF_PROMPTS,
      report,
      promptsBasename: "durable-prompt-proof-prompts",
      reportBasename: "durable-prompt-proof-nano-nano",
    });

    process.stdout.write(
      JSON.stringify(
        {
          promptsCount: DURABLE_PROMPT_PROOF_PROMPTS.length,
          manualUiPromptCount: MANUAL_UI_PROMPT_PACK.length,
          paths,
          totals: report.totals,
          finalSnapshot: report.finalSnapshot,
        },
        null,
        2,
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
