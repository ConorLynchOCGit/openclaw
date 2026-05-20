#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { OpenRouterAgentTeamModelClient } from "../extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    await loadEnvFile(path.resolve(filePath));
  }
}

async function writeArtifact(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    artifactRef: target,
    artifactHash: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function boundedSafety() {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function parseJsonObject(text) {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("model_output_not_json_object");
  }
  return parsed;
}

function normalizeStringArray(value, maxItems = 20, maxLength = 240) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim().slice(0, maxLength))
        .slice(0, maxItems)
    : [];
}

function createWorkerInternalReadback() {
  return {
    artifactKind: "worker_internal_streaming_readback_lane_input",
    schemaVersion: "execution-platform.worker-internal-readback-lane.v1",
    runtimeJobId: "worker-streaming-readback-lane-runtime-job",
    workItemId: "openclaw-convergence.coding-leap-04-worker-streaming-readback",
    activeGraphProgress: {
      state: "present",
      graphId: "worker-streaming-readback-lane-graph",
      activeNodeId: "implementation-worker-1",
      activeNodeKind: "implementation_microtask",
      currentPhase: "worker.tool.completed",
      nextDecision: "review_worker_evidence",
      workerInternal: {
        state: "present",
        phase: "worker.tool.completed",
        phaseStatus: "succeeded",
        objective: "Apply a scoped non-Codex file edit and produce evidence claims.",
        whySelected: "The task is bounded, has accepted context, and is cheaper than broad Codex.",
        roleId: "implementation_engineer",
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        workerRef: "non_codex_tool_worker",
        capabilityId: "implementation_microtask",
        selectedToolId: "worker.edit.apply_patch",
        toolStatus: "succeeded",
        toolInvocationRefs: ["runtime-tool://worker-edit-apply-patch-1"],
        targetRefs: ["repo-file://extensions/execution-platform/src/codex-bridge/proof.ts"],
        inputPacketRefs: ["implementation-task-packet://worker-streaming-readback-lane"],
        contextRefs: [
          "context-handoff://worker-streaming-readback-lane/context",
          "context-synthesis://worker-streaming-readback-lane/synthesis",
        ],
        contextSynthesisRefs: ["context-synthesis://worker-streaming-readback-lane/synthesis"],
        codeIntelligenceRefs: ["code-intelligence://worker-streaming-readback-lane/symbols"],
        currentValidationCommandRef: "validation-command://worker-streaming-readback-lane/focused",
        currentValidationCommandSummary: "Run focused worker streaming readback regression.",
        currentValidationCommandStatus: "succeeded",
        editTransactionRefs: ["edit-transaction://worker-streaming-readback-lane"],
        editTransactionPhase: "closed",
        editTransactionStatus: "closed",
        editTransactionRepairCount: 1,
        changedFileRefs: ["repo-file://extensions/execution-platform/src/codex-bridge/proof.ts"],
        validationRefs: ["validation://worker-streaming-readback-lane/focused"],
        evidenceRefs: ["runtime-tool://worker-edit-apply-patch-1"],
        evidenceClaimRefs: ["evidence-claim://worker-streaming-readback-lane/edit"],
        outputHash: "sha256:worker-streaming-readback-lane-output",
        outputContentLength: 240,
        providerLatencyMs: 1234,
        providerTimeoutMs: 480000,
        providerFinishReason: "content",
        providerTokenCount: 512,
        blockerSummary: null,
        nextDecision: "review_worker_evidence",
        eli5: "The non-Codex worker made the edit, validated it, and handed off evidence.",
        reasonCodes: ["worker_internal_progress_recorded"],
        ...boundedSafety(),
      },
    },
    ...boundedSafety(),
  };
}

function normalizeReview(value) {
  return {
    usable: value.usable === true,
    whatIsRunning:
      typeof value.whatIsRunning === "string" ? value.whatIsRunning.trim().slice(0, 400) : "",
    modelAndProvider:
      typeof value.modelAndProvider === "string" ? value.modelAndProvider.trim().slice(0, 240) : "",
    selectedTool:
      typeof value.selectedTool === "string" ? value.selectedTool.trim().slice(0, 240) : "",
    currentBlocker:
      typeof value.currentBlocker === "string" ? value.currentBlocker.trim().slice(0, 300) : "",
    nextDecision:
      typeof value.nextDecision === "string" ? value.nextDecision.trim().slice(0, 240) : "",
    evidenceRefs: normalizeStringArray(value.evidenceRefs, 10, 240),
    validationRefs: normalizeStringArray(value.validationRefs, 10, 240),
    missingCriticalFields: normalizeStringArray(value.missingCriticalFields, 10, 160),
    rawPromptStored: value.rawPromptStored === true,
    rawResponseStored: value.rawResponseStored === true,
    rawProviderLogStored: value.rawProviderLogStored === true,
    rawToolLogStored: value.rawToolLogStored === true,
    rawDbRowsStored: value.rawDbRowsStored === true,
  };
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelRef =
    process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_MODEL ?? "qwen/qwen3-coder-next";
  const proofId = `worker-streaming-readback-model-lane-${Date.now().toString(36)}`;
  const readback = createWorkerInternalReadback();
  const promptInputHash = sha256(JSON.stringify(readback));

  if (!apiKey) {
    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "worker_streaming_readback_model_lane_proof",
      proofId,
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY not configured in loaded environment refs.",
      promptInputHash,
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    return;
  }

  const client = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: {
      maxAttempts: 1,
      timeoutMs: Number(
        process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_TIMEOUT_MS ?? 120000,
      ),
    },
    requestProfilesByModelId: {
      [modelRef]: {
        responseFormatMode: "prompt_only",
        reasoningMode:
          process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_REASONING ?? "none",
        maxTokens: Number(
          process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_MAX_TOKENS ?? 900,
        ),
      },
    },
  });

  const prompt = [
    "You are reviewing an OpenClaw Work Queue owner-facing readback packet.",
    "Return strict JSON only. Do not include markdown. Do not store or request raw prompts, raw responses, transcripts, provider logs, tool logs, command logs, DB rows, secrets, or hidden reasoning.",
    "Determine whether an operator can understand what the worker is doing, why, which model/provider/tool is active, which input/context refs are being used, what validation/evidence exists, whether there is a blocker, and what decision is next.",
    'Return exactly this object shape: {"usable":boolean,"whatIsRunning":string,"modelAndProvider":string,"selectedTool":string,"currentBlocker":string,"nextDecision":string,"evidenceRefs":string[],"validationRefs":string[],"missingCriticalFields":string[],"rawPromptStored":false,"rawResponseStored":false,"rawProviderLogStored":false,"rawToolLogStored":false,"rawDbRowsStored":false}.',
    `Bounded readback packet: ${JSON.stringify(readback)}`,
  ].join("\n");

  const startedAt = Date.now();
  const response = await client.callRole({
    roleId: "reviewer",
    modelId: modelRef,
    modelCandidateId: proofId,
    prompt,
    responseFormat: "json_object",
    maxTokens: Number(process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_MAX_TOKENS ?? 900),
    timeoutMs: Number(
      process.env.OPENCLAW_WORKER_STREAMING_READBACK_MODEL_LANE_TIMEOUT_MS ?? 120000,
    ),
    maxAttempts: 1,
  });
  const latencyMs = Date.now() - startedAt;
  const review = normalizeReview(parseJsonObject(response.responseText ?? "{}"));
  const rawFlagsOk =
    !review.rawPromptStored &&
    !review.rawResponseStored &&
    !review.rawProviderLogStored &&
    !review.rawToolLogStored &&
    !review.rawDbRowsStored;
  const passed =
    response.status === "succeeded" &&
    review.usable &&
    review.whatIsRunning.length >= 20 &&
    review.modelAndProvider.includes("moonshotai/kimi-k2.6") &&
    review.selectedTool.includes("worker.edit.apply_patch") &&
    review.currentBlocker.toLowerCase() === "none" &&
    review.nextDecision.includes("review_worker_evidence") &&
    review.evidenceRefs.includes("runtime-tool://worker-edit-apply-patch-1") &&
    review.validationRefs.includes("validation://worker-streaming-readback-lane/focused") &&
    review.missingCriticalFields.length === 0 &&
    rawFlagsOk;

  const artifact = await writeArtifact(`${proofId}.json`, {
    artifactKind: "worker_streaming_readback_model_lane_proof",
    proofId,
    status: passed ? "passed" : "needs_review",
    providerCallMade: true,
    modelRef,
    promptInputHash,
    latencyMs,
    response: {
      status: response.status,
      responseHash: response.responseHash,
      usage: response.usage ?? null,
      retryEvidence: response.retryEvidence ?? null,
      providerResponseDiagnostics: response.providerResponseDiagnostics ?? null,
    },
    parsedOutputHash: sha256(JSON.stringify(review)),
    review,
    ...boundedSafety(),
  });

  console.log(
    JSON.stringify(
      {
        status: passed ? "passed" : "needs_review",
        modelRef,
        latencyMs,
        review,
        artifactRef: artifact.artifactRef,
        artifactHash: artifact.artifactHash,
      },
      null,
      2,
    ),
  );
  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const proofId = `worker-streaming-readback-model-lane-error-${Date.now().toString(36)}`;
  const artifact = await writeArtifact(`${proofId}.json`, {
    artifactKind: "worker_streaming_readback_model_lane_proof",
    proofId,
    status: "needs_review",
    error: error instanceof Error ? error.message : String(error),
    ...boundedSafety(),
  });
  console.error(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
  process.exitCode = 1;
});
