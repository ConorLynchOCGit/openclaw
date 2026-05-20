#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  OpenRouterAgentTeamModelClient,
  runParallelContextScoutBoundaryReplay,
} from "../extensions/execution-platform/runtime-api.js";
import { loadConfig } from "../src/config/config.ts";
import { getExecutionPlatformRuntime } from "../src/gateway/execution-platform-http.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) {
      continue;
    }
    process.env[key] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function createRoleModelClient() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: {
      maxAttempts: 1,
      timeoutMs: Number(process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_TIMEOUT_MS ?? 300_000),
    },
    requestProfilesByModelId: {
      "deepseek/deepseek-v4-pro": {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: Number(process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_MAX_TOKENS ?? 4_000),
      },
      "moonshotai/kimi-k2": {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: Number(process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_MAX_TOKENS ?? 4_000),
      },
      "qwen/qwen3-coder-next": {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: Number(process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_MAX_TOKENS ?? 6_000),
      },
    },
  });
}

async function main() {
  const runtimeJobId = flag("--runtime-job-id");
  if (!runtimeJobId) {
    throw new Error("runtime_job_id_required");
  }
  const graphId = flag("--graph-id");
  const concurrency = Number(
    flag("--concurrency", process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_CONCURRENCY ?? "6"),
  );
  const maxRuntimeMs = Number(
    flag("--max-runtime-ms", process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_TIMEOUT_MS ?? "300000"),
  );
  await loadEnvFile(".env");
  await loadEnvFile(".env.execution-platform-staging");
  const runtime = await getExecutionPlatformRuntime(loadConfig());
  const preflight = {
    artifactKind: "parallel_context_scout_boundary_replay_preflight",
    generatedAt: new Date().toISOString(),
    runtimeJobId,
    graphId,
    concurrency,
    maxRuntimeMs,
    replayBoundary: "parallel_commitment_context_scout_nodes",
    promptOrJobReplayUsed: false,
    runtimeJobCreated: false,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    schedulerDecompositionRerun: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const preflightArtifact = await writeJson(
    "parallel-context-scout-boundary-replay-preflight.json",
    preflight,
  );
  process.stdout.write(
    `${JSON.stringify({
      event: "parallel_context_scout_boundary_replay_start",
      at: preflight.generatedAt,
      runtimeJobId,
      graphId,
      concurrency,
      maxRuntimeMs,
    })}\n`,
  );
  const result = await runParallelContextScoutBoundaryReplay({
    runtimeJobs: runtime.runtimeJobs,
    runtimeWorkGraphs: runtime.runtimeWorkGraphs,
    runtimeToolKernel: runtime.runtimeToolKernel,
    runtimeJobId,
    graphId,
    repoRoot: process.cwd(),
    roleModelClient: createRoleModelClient(),
    modelId: process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_MODEL_ID ?? "deepseek/deepseek-v4-pro",
    modelCandidateId:
      process.env.OPENCLAW_PARALLEL_CONTEXT_SCOUT_MODEL_CANDIDATE_ID ??
      "deepseek-v4-pro-context-scout",
    concurrency,
    maxRuntimeMs,
    onProgress(event) {
      process.stdout.write(
        `${JSON.stringify({
          event: "parallel_context_scout_boundary_replay_progress",
          at: new Date().toISOString(),
          ...event,
        })}\n`,
      );
    },
  });
  const resultArtifact = await writeJson("parallel-context-scout-boundary-replay-result.json", {
    generatedAt: new Date().toISOString(),
    ...result,
  });
  const indexArtifact = await writeJson(
    "parallel-context-scout-boundary-replay-artifact-index.json",
    {
      artifactKind: "parallel_context_scout_boundary_replay_artifact_index",
      generatedAt: new Date().toISOString(),
      artifacts: [preflightArtifact, resultArtifact],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  );
  process.stdout.write(
    `${JSON.stringify({
      event: "parallel_context_scout_boundary_replay_result",
      at: new Date().toISOString(),
      status: result.status,
      runtimeJobId: result.sourceRuntimeJobId,
      graphId: result.graphId,
      packetCount: result.packetCount,
      acceptedCount: result.acceptedCount,
      needsReviewCount: result.needsReviewCount,
      failedCount: result.failedCount,
      aggregateContextSupplyRef: result.aggregateContextSupplyRef,
      reasonCodes: result.reasonCodes,
      artifactIndexPath: indexArtifact.path,
    })}\n`,
  );
  if (result.status !== "succeeded") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const summary = {
    artifactKind: "parallel_context_scout_boundary_replay_error",
    generatedAt: new Date().toISOString(),
    errorName: error?.name ?? "unknown_error",
    errorMessageHash: sha256(error?.message ?? String(error)),
    errorSummary: String(error?.message ?? error).slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  await writeJson("parallel-context-scout-boundary-replay-error.json", summary);
  process.stderr.write(`${JSON.stringify(summary)}\n`);
  process.exitCode = 1;
});
