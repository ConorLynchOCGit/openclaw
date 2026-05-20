#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { OpenRouterAgentTeamModelClient } from "../extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts";
import { NonCodexToolUsingWorkerLoop } from "../extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts";
import { applyExecutionPlatformMigrations } from "../extensions/execution-platform/src/db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../extensions/execution-platform/src/db/pg-test.ts";
import { RuntimeJobRepository } from "../extensions/execution-platform/src/runtime-job-repository.ts";
import { RuntimeToolKernel } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-trace-repository.ts";
import { RuntimeWorkGraphRepository } from "../extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts";

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
    artifactHash: `sha256:${sha256(body)}`,
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

async function createRuntime({ graphId, jobId, nodeId }) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  const traces = new RuntimeToolTraceRepository(database.sql);
  const kernel = new RuntimeToolKernel({ registry, traces });
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const graphs = new RuntimeWorkGraphRepository(database.sql);
  await runtimeJobs.enqueueJob({
    jobId,
    jobType: "executor.agent_team",
    queueName: "agent-team",
    payload: { workflowId: "agent_team.coding" },
  });
  await graphs.createGraph({
    graphId,
    rootRuntimeJobId: jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });
  await graphs.addNode({
    graphId,
    nodeId,
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    nodeStatus: "running",
  });
  return { database, kernel, traces };
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelRef =
    process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_MODEL ?? "qwen/qwen3-coder-next";
  const proofId = `non-codex-compound-tool-model-lane-${Date.now().toString(36)}`;
  if (!apiKey) {
    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "non_codex_compound_tool_model_lane_proof",
      proofId,
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY not configured in loaded environment refs.",
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    return;
  }

  const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-compound-model-lane-"));
  const fileRef = "extensions/execution-platform/src/codex-bridge/compound-lane-target.ts";
  const graphId = `graph-${proofId}`;
  const jobId = `job-${proofId}`;
  const nodeId = "implementation-compound-lane";
  const { database, kernel, traces } = await createRuntime({ graphId, jobId, nodeId });
  try {
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function compoundLaneLabel() {\n  return 'before';\n}\n",
      "utf8",
    );

    const prompt = [
      "You are the controller for an OpenClaw non-Codex compound coding tool lane.",
      "Return strict JSON only with one toolCalls array. Do not include markdown.",
      "Use one compound coding tool, not atomic worker tools, because target refs, validation refs, and commitment refs are already bounded.",
      "Runtime owns file reads, patch application, validation execution, evidence refs, storage, and lifecycle. You choose the compound tool and semantic edit intent.",
      "Allowed compound tools: coding.inspect_edit_validate, coding.add_test_and_validate, coding.update_docs_and_cross_refs, coding.refactor_symbol_with_lsp, coding.fix_type_errors, coding.apply_small_patch_with_evidence.",
      'Return exactly this shape: {"toolCalls":[{"callId":"compound-edit","toolId":"coding.inspect_edit_validate","reason":"...","input":{"targetFileRefs":["extensions/execution-platform/src/codex-bridge/compound-lane-target.ts"],"contextRefs":["context-synthesis://compound-lane"],"validationCommandRefs":["pnpm test:file compound-lane-target.test.ts"],"fileEdits":[{"path":"extensions/execution-platform/src/codex-bridge/compound-lane-target.ts","operation":"replace_text","oldText":"return \'before\';","newText":"return \'after\';","rationale":"..."}],"evidenceClaims":[{"commitmentId":"commitment-compound-lane","claimSummary":"...","changedFileRefs":["extensions/execution-platform/src/codex-bridge/compound-lane-target.ts"],"validationRefs":["validation://compound-lane/passed"],"confidence":"high","rawPromptStored":false,"rawResponseStored":false}]}}]}.',
      `Task: change ${fileRef} so compoundLaneLabel returns 'after'.`,
      `Current bounded target snapshot:\nexport function compoundLaneLabel() {\n  return 'before';\n}`,
    ].join("\n");

    const client = new OpenRouterAgentTeamModelClient({
      apiKey,
      retryPolicy: {
        maxAttempts: 1,
        timeoutMs: Number(process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_TIMEOUT_MS ?? 120000),
      },
      requestProfilesByModelId: {
        [modelRef]: {
          responseFormatMode: "prompt_only",
          reasoningMode: process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_REASONING ?? "none",
          maxTokens: Number(process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_MAX_TOKENS ?? 1200),
        },
      },
    });
    const startedAt = Date.now();
    const response = await client.callRole({
      roleId: "implementation_engineer",
      modelId: modelRef,
      modelCandidateId: proofId,
      prompt,
      responseFormat: "json_object",
      maxTokens: Number(process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_MAX_TOKENS ?? 1200),
      timeoutMs: Number(process.env.OPENCLAW_NON_CODEX_COMPOUND_MODEL_LANE_TIMEOUT_MS ?? 120000),
      maxAttempts: 1,
    });
    const providerLatencyMs = Date.now() - startedAt;
    const parsed = parseJsonObject(response.responseText ?? "{}");
    const phaseEvents = [];
    const loop = new NonCodexToolUsingWorkerLoop({
      runtimeToolKernel: kernel,
      phaseSink(event) {
        phaseEvents.push({
          phase: event.phase,
          toolId: event.toolId,
          toolStatus: event.toolStatus,
          compoundToolId: event.compoundToolId,
          compoundSubEventCount: event.compoundSubEventCount,
          compoundSubEventPhases: event.compoundSubEventPhases,
          changedFileRefs: event.changedFileRefs,
          validationRefs: event.validationRefs,
          rawPromptStored: event.rawPromptStored,
          rawResponseStored: event.rawResponseStored,
          rawToolLogStored: event.rawToolLogStored,
        });
      },
      modelClient: {
        async nextTurn() {
          return {
            modelRunRef: response.modelRunRef ?? `openrouter://${modelRef}/${proofId}`,
            responseText: JSON.stringify(parsed),
            responseHash: sha256(JSON.stringify(parsed)),
            latencyMs: providerLatencyMs,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      validationRunner: {
        async run(commandRef) {
          return {
            validationRef: "validation://compound-lane/passed",
            status:
              commandRef === "pnpm test:file compound-lane-target.test.ts" ? "passed" : "failed",
            summary: `compound lane validation for ${commandRef}`,
          };
        },
      },
    });

    const result = await loop.run({
      runtimeJobId: jobId,
      graphId,
      nodeId,
      workerId: "worker.kimi.file-implementation",
      roleId: "implementation_engineer",
      taskId: `task-${proofId}`,
      taskTitle: "Non-Codex compound tool model lane proof",
      exactEditObjective:
        "Use a compound coding tool to change compoundLaneLabel from before to after.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
      targetFileRefs: [fileRef],
      contextPackRefs: ["context-synthesis://compound-lane"],
      validationCommandRefs: ["pnpm test:file compound-lane-target.test.ts"],
      acceptanceCriteria: ["source edit applied", "validation passed", "evidence claimed"],
      targetCommitmentIds: ["commitment-compound-lane"],
      expectedEvidenceClaimKinds: ["source_change", "test_validation"],
      budgetPolicy: {
        modelRef,
        providerPath: "openrouter",
        maxOutputTokens: 4_000,
        timeoutMs: 240_000,
        maxTurns: 1,
        maxAttempts: 1,
      },
    });
    const finalContent = await readFile(path.join(repoRoot, fileRef), "utf8");
    const invocations = await traces.listInvocations({ runtimeJobId: jobId, limit: 20 });
    const passed =
      response.status === "succeeded" &&
      result.status === "completed" &&
      result.toolResults.some((tool) => tool.toolId === "coding.inspect_edit_validate") &&
      result.validationRefs.includes("validation://compound-lane/passed") &&
      result.evidenceClaims.some((claim) => claim.commitmentId === "commitment-compound-lane") &&
      finalContent.includes("return 'after';") &&
      invocations.some((invocation) => invocation.toolId === "coding.inspect_edit_validate") &&
      phaseEvents.some(
        (event) =>
          event.phase === "worker.tool.completed" &&
          event.compoundToolId === "coding.inspect_edit_validate",
      );

    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "non_codex_compound_tool_model_lane_proof",
      proofId,
      status: passed ? "passed" : "failed",
      modelRef,
      providerPath: "openrouter",
      providerStatus: response.status,
      providerLatencyMs,
      modelRunRef: response.modelRunRef,
      modelResponseHash: sha256(response.responseText ?? ""),
      parsedToolIds: Array.isArray(parsed.toolCalls)
        ? parsed.toolCalls.map((call) => call?.toolId).filter(Boolean)
        : [],
      workerStatus: result.status,
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      evidenceClaimRefs: result.evidenceClaims.map((claim) => claim.evidenceRef),
      editTransactionRefs: result.editTransactionRefs,
      runtimeToolInvocationRefs: invocations.map(
        (invocation) => `runtime-tool://${invocation.invocationId}`,
      ),
      phaseEvents,
      finalContentHash: sha256(finalContent),
      reasonCodes: result.reasonCodes,
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: passed ? "passed" : "failed", ...artifact }, null, 2));
    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    await database.close();
    await rm(repoRoot, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const proofId = `non-codex-compound-tool-model-lane-error-${Date.now().toString(36)}`;
  const artifact = await writeArtifact(`${proofId}.json`, {
    artifactKind: "non_codex_compound_tool_model_lane_proof",
    proofId,
    status: "failed",
    errorSummary: message.slice(0, 1000),
    ...boundedSafety(),
  });
  console.error(JSON.stringify({ status: "failed", ...artifact }, null, 2));
  process.exitCode = 1;
});
