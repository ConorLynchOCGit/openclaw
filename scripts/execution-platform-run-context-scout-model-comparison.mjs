#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  OpenRouterAgentTeamModelClient,
  runParallelContextScoutBoundaryReplay,
} from "../extensions/execution-platform/runtime-api.js";
import { CommitmentWorkPacketSchema } from "../extensions/execution-platform/src/workflows/mission-work-packets.ts";
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
    if (!process.env[key]) {
      process.env[key] = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return { path: target, sha256: sha256(body), bytes: Buffer.byteLength(body, "utf8") };
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function latestArtifact(artifacts, artifactType) {
  return (
    artifacts
      .filter((artifact) => artifact.artifactType === artifactType)
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

async function sourcePackets(runtime, artifacts, limit) {
  const packetsByCommitment = new Map();
  for (const artifact of artifacts
    .filter((candidate) => candidate.artifactType === "execution_platform.commitment_work_packet")
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const hydrated = await runtime.runtimeJobs.hydrateRuntimeArtifactByContract(artifact);
    const parsed = CommitmentWorkPacketSchema.safeParse(hydrated.body);
    if (parsed.success) {
      packetsByCommitment.set(parsed.data.commitmentId, parsed.data);
    }
  }
  return [...packetsByCommitment.values()].slice(0, limit);
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
      timeoutMs: Number(process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_TIMEOUT_MS ?? 300_000),
    },
    requestProfilesByModelId: {
      "qwen/qwen3-coder-next": {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: Number(process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_MAX_TOKENS ?? 4_000),
      },
      "deepseek/deepseek-v4-pro": {
        responseFormatMode: "prompt_only",
        reasoningMode: "omit",
        maxTokens: Number(process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_MAX_TOKENS ?? 4_000),
      },
    },
  });
}

async function main() {
  const sourceRuntimeJobId = flag("--source-runtime-job-id", "native-exec-942b8624b57d0b7e");
  const modelId = flag("--model-id", "qwen/qwen3-coder-next");
  const modelCandidateId = flag("--model-candidate-id", "qwen3-coder-next-context-scout");
  const limit = Number(flag("--limit", process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_LIMIT ?? "14"));
  const concurrency = Number(
    flag("--concurrency", process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_CONCURRENCY ?? "8"),
  );
  await loadEnvFile(".env");
  await loadEnvFile(".env.execution-platform-staging");
  const runtime = await getExecutionPlatformRuntime(loadConfig());
  const sourceJob = await runtime.runtimeJobs.getJob(sourceRuntimeJobId);
  if (!sourceJob) {
    throw new Error(`source_runtime_job_not_found:${sourceRuntimeJobId}`);
  }
  const artifacts = await runtime.runtimeJobs.listArtifacts(sourceRuntimeJobId);
  const packets = await sourcePackets(runtime, artifacts, limit);
  if (packets.length === 0) {
    throw new Error(`source_commitment_packets_missing:${sourceRuntimeJobId}`);
  }
  const runId = `context-scout-model-compare-${Date.now().toString(36)}`;
  const job = await runtime.runtimeJobs.enqueueJob({
    jobId: runId,
    jobType: "diagnostic.context_scout_model_comparison",
    queueName: "diagnostic",
    payload: {
      sourceRuntimeJobId,
      modelId,
      modelCandidateId,
      packetCount: packets.length,
      diagnosticOnly: true,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    idempotencyScope: "context-scout-model-comparison",
    idempotencyKey: `${sourceRuntimeJobId}:${modelId}:${Date.now()}`,
    maxAttempts: 1,
  });
  const graph = await runtime.runtimeWorkGraphs.createGraph({
    graphId: `${runId}-graph`,
    rootRuntimeJobId: job.jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: modelId,
    graphStatus: "running",
    metadata: {
      diagnosticOnly: true,
      sourceRuntimeJobId,
      modelId,
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
  const mission = latestArtifact(artifacts, "execution_platform.mission_contract_ledger");
  const sourcePrompt = latestArtifact(artifacts, "execution_platform.source_prompt_context_index");
  if (mission) {
    await runtime.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: mission.artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/comparison/source-mission-ledger`,
      contentType: "application/json",
      metadata: {
        ...record(mission.metadata),
        comparisonSourceRuntimeJobId: sourceRuntimeJobId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  }
  if (sourcePrompt) {
    await runtime.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: sourcePrompt.artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/comparison/source-prompt-context-index`,
      contentType: "application/json",
      metadata: {
        ...record(sourcePrompt.metadata),
        comparisonSourceRuntimeJobId: sourceRuntimeJobId,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
  }
  for (const packet of packets) {
    const packetRef = `runtime-job://${job.jobId}/comparison/commitment-work-packet/${packet.commitmentId}`;
    await runtime.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: job.jobId,
      artifactType: "execution_platform.commitment_work_packet",
      uri: packetRef,
      contentType: "application/json",
      body: packet,
      boundedSummary: packet.workerObjective,
      targetCommitmentIds: [packet.commitmentId],
      resourcePacketKind: "commitment_work_packet",
      readinessStatus: packet.qualityStatus,
      reasonCodes: ["context_scout_model_comparison_packet_persisted_by_contract"],
      metadata: {
        artifactKind: "execution_platform.commitment_work_packet",
        commitmentId: packet.commitmentId,
        packetRef: packet.packetRef,
        packetId: packet.packetId,
        comparisonSourceRuntimeJobId: sourceRuntimeJobId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  }
  await writeJson("context-scout-model-comparison-preflight.json", {
    artifactKind: "context_scout_model_comparison_preflight",
    generatedAt: new Date().toISOString(),
    sourceRuntimeJobId,
    runtimeJobId: job.jobId,
    graphId: graph.graphId,
    modelId,
    modelCandidateId,
    packetCount: packets.length,
    concurrency,
    diagnosticOnly: true,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "context_scout_model_comparison_start",
      runtimeJobId: job.jobId,
      graphId: graph.graphId,
      modelId,
      packetCount: packets.length,
      concurrency,
    })}\n`,
  );
  const result = await runParallelContextScoutBoundaryReplay({
    runtimeJobs: runtime.runtimeJobs,
    runtimeWorkGraphs: runtime.runtimeWorkGraphs,
    runtimeToolKernel: runtime.runtimeToolKernel,
    runtimeJobId: job.jobId,
    graphId: graph.graphId,
    repoRoot: process.cwd(),
    roleModelClient: createRoleModelClient(),
    modelId,
    modelCandidateId,
    concurrency,
    maxRuntimeMs: Number(process.env.OPENCLAW_CONTEXT_SCOUT_COMPARE_TIMEOUT_MS ?? 300_000),
    onProgress(event) {
      process.stdout.write(
        `${JSON.stringify({
          event: "context_scout_model_comparison_progress",
          at: new Date().toISOString(),
          modelId,
          ...event,
        })}\n`,
      );
    },
  });
  const resultArtifact = await writeJson("context-scout-model-comparison-result.json", {
    generatedAt: new Date().toISOString(),
    modelId,
    modelCandidateId,
    ...result,
  });
  await writeJson("context-scout-model-comparison-artifact-index.json", {
    artifactKind: "context_scout_model_comparison_artifact_index",
    generatedAt: new Date().toISOString(),
    artifacts: [resultArtifact.path],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "context_scout_model_comparison_result",
      status: result.status,
      runtimeJobId: job.jobId,
      graphId: graph.graphId,
      modelId,
      acceptedCount: result.acceptedCount,
      needsReviewCount: result.needsReviewCount,
      failedCount: result.failedCount,
      reasonCodes: result.reasonCodes,
    })}\n`,
  );
  if (result.status !== "succeeded") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const summary = {
    artifactKind: "context_scout_model_comparison_error",
    generatedAt: new Date().toISOString(),
    errorName: error?.name ?? "unknown_error",
    errorSummary: String(error?.message ?? error).slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  await writeJson("context-scout-model-comparison-error.json", summary);
  process.stderr.write(`${JSON.stringify(summary)}\n`);
  process.exitCode = 1;
});
