import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.ts";
import { parseConfigJson5, resolveConfigPath } from "../config/config.ts";
import { loadGlobalRuntimeDotEnvFiles } from "../infra/dotenv.ts";
import type { ModelMemoryDatabaseMode } from "./model-memory.database.ts";

const STALE_RUNNER_PLUGIN_IDS = ["brave", "browser", "firecrawl"] as const;
const MODEL_MEMORY_RUNNER_DATABASE_MODES = [
  "full_corpus_proof_db",
  "targeted_trace_scratch_db",
] as const satisfies readonly ModelMemoryDatabaseMode[];

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isModelMemoryDatabaseMode(value: string): value is ModelMemoryDatabaseMode {
  return (MODEL_MEMORY_RUNNER_DATABASE_MODES as readonly string[]).includes(value);
}

export function sanitizeModelMemoryRunnerConfig(config: OpenClawConfig): OpenClawConfig {
  const next: JsonRecord = structuredClone(config);

  if (isRecord(next.tools) && isRecord(next.tools.web) && isRecord(next.tools.web.fetch)) {
    delete next.tools.web.fetch.firecrawl;
  }

  if (isRecord(next.plugins) && isRecord(next.plugins.entries)) {
    for (const pluginId of STALE_RUNNER_PLUGIN_IDS) {
      delete next.plugins.entries[pluginId];
    }
  }

  if (isRecord(next.meta)) {
    delete next.meta.lastTouchedVersion;
  }

  return next as OpenClawConfig;
}

export async function loadSanitizedModelMemoryRunnerConfig(input: {
  purpose: string;
}): Promise<OpenClawConfig> {
  const configPath = resolveConfigPath(process.env);
  loadGlobalRuntimeDotEnvFiles({
    quiet: true,
    stateEnvPath: path.join(path.dirname(configPath), ".env"),
  });
  const raw = await readFile(configPath, "utf8");
  const parsed = parseConfigJson5(raw);
  if (!parsed.ok || !parsed.parsed || !isRecord(parsed.parsed)) {
    throw new Error(`failed to parse config for ${input.purpose}: ${configPath}`);
  }
  return sanitizeModelMemoryRunnerConfig(parsed.parsed as OpenClawConfig);
}

export async function writeSanitizedModelMemoryRunnerConfig(input: {
  config: OpenClawConfig;
  tempPrefix: string;
}): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), input.tempPrefix));
  const configPath = path.join(tempDir, "openclaw.json");
  await writeFile(configPath, `${JSON.stringify(input.config, null, 2)}\n`, "utf8");
  return configPath;
}

export function resolveModelMemoryRunnerDatabaseMode(input: {
  defaultMode: ModelMemoryDatabaseMode;
  env?: NodeJS.ProcessEnv;
}): ModelMemoryDatabaseMode {
  const env = input.env ?? process.env;
  const requestedMode = env.MODEL_MEMORY_DB_MODE?.trim();
  if (!requestedMode) {
    return input.defaultMode;
  }
  if (!isModelMemoryDatabaseMode(requestedMode)) {
    throw new Error(
      `unsupported MODEL_MEMORY_DB_MODE: ${requestedMode}. Expected one of ${MODEL_MEMORY_RUNNER_DATABASE_MODES.join(", ")}`,
    );
  }
  return requestedMode;
}
