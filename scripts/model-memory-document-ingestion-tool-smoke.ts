import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentIngestionRunnerRunRecord } from "../extensions/model-memory/runtime-api.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";
import type { OpenClawConfig } from "../src/config/config.ts";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_DOCUMENT_INGEST_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_REQUEST_SEED = 7;
const DEFAULT_MAX_WORDS_PER_WINDOW = 1500;
const DEFAULT_RUN_ID = "model-memory-tool-smoke";
const DEFAULT_RECORD_PATH = "checkpoints/model-memory/model-memory-tool-smoke.json";
const DEFAULT_ARTIFACT_BASENAME = "document-ingestion-tool-smoke";
const DEFAULT_ARTIFACT_TITLE = "Document Ingestion Tool Smoke";

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function mergeToolConfig(config: OpenClawConfig, repoRoot: string): OpenClawConfig {
  const existingLoadPaths = Array.isArray(config.plugins?.load?.paths)
    ? config.plugins.load.paths.filter((value): value is string => typeof value === "string")
    : [];
  const existingAllow = Array.isArray(config.plugins?.allow)
    ? config.plugins.allow.filter((value): value is string => typeof value === "string")
    : [];

  return {
    ...config,
    plugins: {
      ...config.plugins,
      enabled: true,
      allow: unique([...existingAllow, "model-memory"]),
      load: {
        ...config.plugins?.load,
        paths: unique([...existingLoadPaths, path.join(repoRoot, "extensions", "model-memory")]),
      },
      entries: {
        ...config.plugins?.entries,
        "model-memory": {
          ...config.plugins?.entries?.["model-memory"],
          enabled: true,
        },
      },
    },
  };
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sources = process.argv
    .slice(2)
    .map((value) => value.trim())
    .filter(Boolean);
  if (sources.length === 0) {
    throw new Error(
      "usage: node --import tsx scripts/model-memory-document-ingestion-tool-smoke.ts <workspace-relative-source> [...]",
    );
  }

  const config = mergeToolConfig(
    await loadSanitizedModelMemoryRunnerConfig({
      purpose: "model-memory document ingestion tool smoke",
    }),
    repoRoot,
  );
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-tool-smoke-",
  });

  const { resolvePluginTools } = await import("../src/plugins/tools.ts");
  const tools = resolvePluginTools({
    context: {
      config,
      workspaceDir: repoRoot,
      sandboxed: false,
    } as never,
    toolAllowlist: ["model-memory"],
  });

  const tool = tools.find((entry) => entry.name === "model_memory_document_ingest");
  if (!tool) {
    throw new Error(
      "model_memory_document_ingest was not resolved from the OpenClaw plugin registry",
    );
  }

  const result = await tool.execute("tool-call-model-memory-smoke", {
    sources,
    runId: process.env.MODEL_MEMORY_TOOL_SMOKE_RUN_ID?.trim() || DEFAULT_RUN_ID,
    recordPath: process.env.MODEL_MEMORY_TOOL_SMOKE_RECORD_PATH?.trim() || DEFAULT_RECORD_PATH,
    chunkSize:
      Number.parseInt(process.env.MODEL_MEMORY_TOOL_SMOKE_CHUNK_SIZE?.trim() ?? "", 10) || 2,
    maxConcurrency:
      Number.parseInt(process.env.MODEL_MEMORY_TOOL_SMOKE_MAX_CONCURRENCY?.trim() ?? "", 10) || 1,
    resume: process.env.MODEL_MEMORY_TOOL_SMOKE_RESUME?.trim() !== "0",
    modelId: DEFAULT_MODEL_REF,
    candidateModelId: DEFAULT_MODEL_REF,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    requestSeed: DEFAULT_REQUEST_SEED,
    maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
  });

  const details = (result as { details?: Record<string, unknown> }).details ?? {};
  const recordRelativePath =
    (typeof details.recordPath === "string" && details.recordPath.length > 0
      ? details.recordPath
      : process.env.MODEL_MEMORY_TOOL_SMOKE_RECORD_PATH?.trim()) ?? DEFAULT_RECORD_PATH;
  const recordAbsolutePath = path.resolve(repoRoot, recordRelativePath);
  const record = JSON.parse(
    await readFile(recordAbsolutePath, "utf8"),
  ) as DocumentIngestionRunnerRunRecord;

  const artifactBasename =
    process.env.MODEL_MEMORY_TOOL_SMOKE_ARTIFACT_BASENAME?.trim() || DEFAULT_ARTIFACT_BASENAME;
  const artifactTitle =
    process.env.MODEL_MEMORY_TOOL_SMOKE_ARTIFACT_TITLE?.trim() || DEFAULT_ARTIFACT_TITLE;
  const evidenceDir = path.join(repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });
  const artifactJsonPath = path.join(evidenceDir, `${artifactBasename}.json`);
  const artifactMarkdownPath = path.join(evidenceDir, `${artifactBasename}.md`);

  const report = {
    generatedAt: new Date().toISOString(),
    title: artifactTitle,
    toolName: tool.name,
    runId: record.runId,
    recordPath: recordRelativePath,
    modelId: record.modelId,
    candidateModelId: record.candidateModelId,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    requestSeed: DEFAULT_REQUEST_SEED,
    maxWordsPerWindow: record.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW,
    chunkSize: record.chunkSize,
    maxConcurrency: record.maxConcurrency,
    invocation: {
      sources,
      runId: record.runId,
      recordPath: recordRelativePath,
      chunkSize: record.chunkSize,
      maxConcurrency: record.maxConcurrency,
      resume: process.env.MODEL_MEMORY_TOOL_SMOKE_RESUME?.trim() !== "0",
      modelId: record.modelId,
      candidateModelId: record.candidateModelId,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
      maxWordsPerWindow: record.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW,
    },
    sources: record.sources.map((source) => ({
      displayPath: source.displayPath,
      status: source.status,
      windowCount: source.windowCount,
      capturedClaimCount: source.capturedClaimCount,
      writeDecisionCounts: source.writeDecisionCounts,
      ignoredWindowCount: source.ignoredWindowCount,
      rejectedWindowCount: source.rejectedWindowCount,
      rejectReasons: source.rejectReasons,
      errorMessage: source.errorMessage,
    })),
    totals: record.totals,
    manualUiSteps: [
      `Use the OpenClaw operator tool \`${tool.name}\`.`,
      `Pass sources [${sources.map((source) => `"${source}"`).join(", ")}].`,
      `Keep chunkSize=${record.chunkSize}, maxConcurrency=${record.maxConcurrency}, resume=true, modelId=${record.modelId}, candidateModelId=${record.candidateModelId}.`,
      `After the run, inspect ${recordRelativePath} and the model-memory operator evidence surfaces for captured claims and write decisions.`,
    ],
  };

  const markdownLines: string[] = [];
  markdownLines.push(`# ${artifactTitle}`);
  markdownLines.push("");
  markdownLines.push(`- Tool: \`${tool.name}\``);
  markdownLines.push(`- Run ID: \`${record.runId}\``);
  markdownLines.push(`- Record path: \`${recordRelativePath}\``);
  markdownLines.push(`- Pass 1 model: \`${record.candidateModelId}\``);
  markdownLines.push(`- Pass 2 model: \`${record.modelId}\``);
  markdownLines.push(`- Request seed: \`${DEFAULT_REQUEST_SEED}\``);
  markdownLines.push(`- Request timeout ms: \`${DEFAULT_REQUEST_TIMEOUT_MS}\``);
  markdownLines.push(
    `- Max words per window: \`${record.maxWordsPerWindow ?? DEFAULT_MAX_WORDS_PER_WINDOW}\``,
  );
  markdownLines.push(`- Chunk size: \`${record.chunkSize}\``);
  markdownLines.push(`- Max concurrency: \`${record.maxConcurrency}\``);
  markdownLines.push(`- Docs attempted: \`${record.totals.docsAttempted}\``);
  markdownLines.push(`- Docs completed: \`${record.totals.docsCompleted}\``);
  markdownLines.push(`- Docs failed: \`${record.totals.docsFailed}\``);
  markdownLines.push(`- Captured claims: \`${record.totals.capturedClaimCount}\``);
  markdownLines.push(`- Ignored windows: \`${record.totals.ignoredWindowCount}\``);
  markdownLines.push(`- Rejected windows: \`${record.totals.rejectedWindowCount}\``);
  markdownLines.push(`- Write decisions: \`${JSON.stringify(record.totals.writeDecisionCounts)}\``);
  markdownLines.push("");
  markdownLines.push("## Invocation");
  markdownLines.push("");
  markdownLines.push("```json");
  markdownLines.push(JSON.stringify(report.invocation, null, 2));
  markdownLines.push("```");
  markdownLines.push("");
  markdownLines.push("## Sources");
  markdownLines.push("");
  markdownLines.push("| Source | Status | Windows | Captured | Decisions | Rejects |");
  markdownLines.push("| --- | --- | ---: | ---: | --- | --- |");
  for (const source of report.sources) {
    markdownLines.push(
      `| \`${source.displayPath}\` | ${source.status} | ${source.windowCount} | ${source.capturedClaimCount} | \`${JSON.stringify(source.writeDecisionCounts)}\` | ${source.rejectReasons.join("; ")} |`,
    );
  }
  markdownLines.push("");
  markdownLines.push("## Manual UI Steps");
  markdownLines.push("");
  for (const step of report.manualUiSteps) {
    markdownLines.push(`- ${step}`);
  }
  markdownLines.push("");

  await writeFile(artifactJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(artifactMarkdownPath, `${markdownLines.join("\n")}\n`, "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        result,
        artifactJsonPath: path.relative(repoRoot, artifactJsonPath),
        artifactMarkdownPath: path.relative(repoRoot, artifactMarkdownPath),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
