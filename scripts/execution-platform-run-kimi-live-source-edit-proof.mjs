#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const targetFile = "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts";
const testFile =
  "extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts";
const validationCommandRef = `pnpm test:file ${testFile}`;

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(path.join(artifactRoot, name), body, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const text = await readTextIfExists(filePath);
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
}

function boundedValidationRunner() {
  return {
    async run(commandRef) {
      if (commandRef !== validationCommandRef) {
        return {
          validationRef: `validation://${sha256(commandRef).slice(0, 16)}`,
          status: "not_run",
          summary: "Validation command was not in the approved proof allowlist.",
        };
      }
      const started = Date.now();
      return await new Promise((resolve) => {
        const child = execFile(
          "pnpm",
          ["test:file", testFile],
          { cwd: root, timeout: 120_000, maxBuffer: 256_000 },
          (error) => {
            resolve({
              validationRef: `validation://kimi-live-source-edit/${sha256(commandRef).slice(0, 16)}`,
              status: error ? "failed" : "passed",
              summary: error
                ? `Focused validation failed after ${Date.now() - started}ms.`
                : `Focused validation passed after ${Date.now() - started}ms.`,
            });
          },
        );
        child.stdin?.end?.();
      });
    },
  };
}

function buildKimiPrompt(input) {
  return [
    "You are the Kimi implementation lane for OpenClaw.",
    "Return exactly one JSON object with a fileEdits array. Do not include markdown.",
    "Each file edit must have path and complete content.",
    "Do not include raw prompts, logs, secrets, or unrelated edits.",
    `Task: ${input.taskSummary}`,
    `Allowed file: ${targetFile}`,
    `Validation: ${validationCommandRef}`,
    "Required implementation contract:",
    "- export type KimiLiveSourceEditReadinessInput with modelRef, providerPath, validationRef strings.",
    "- export function buildKimiLiveSourceEditReadiness(input: KimiLiveSourceEditReadinessInput).",
    "- The function must return exactly this object shape:",
    "{",
    "  artifactKind: 'kimi_live_source_edit_readiness',",
    "  adapterProofVersion: 'kimi-live-source-edit.v2',",
    "  status: 'ready',",
    "  modelRef: input.modelRef,",
    "  providerPath: input.providerPath,",
    "  validationRef: input.validationRef,",
    "  liveSourceEditProof: true,",
    "  reasonCodes: ['kimi_live_source_edit_adapter_ready'],",
    "  rawPromptStored: false,",
    "  rawResponseStored: false,",
    "  rawProviderLogStored: false,",
    "  workQueueLifecycleMutated: false",
    "}",
    "- Include reasonCodes ['kimi_live_source_edit_adapter_ready'].",
    "- Include adapterProofVersion 'kimi-live-source-edit.v2'.",
    "- Set rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated to false.",
  ].join("\n");
}

async function main() {
  await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  await writeJson("kimi-live-source-edit-preflight.json", {
    artifactKind: "kimi_live_source_edit_preflight",
    providerPath: "openrouter",
    modelRef: "moonshotai/kimi-k2.6",
    openRouterConfigured: Boolean(apiKey),
    targetFile,
    validationCommandRef,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  if (!apiKey) {
    await writeJson("kimi-live-source-edit-proof.json", {
      artifactKind: "kimi_live_source_edit_proof",
      status: "blocked",
      reasonCodes: ["openrouter_api_key_not_resolved_from_config_or_auth_registry"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
    return;
  }

  const ep = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const { KimiFileImplementationAdapter, OpenRouterAgentTeamModelClient } = ep;
  const openRouter = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: { maxAttempts: 2, timeoutMs: 300_000 },
    requestProfilesByModelId: {
      "moonshotai/kimi-k2.6": {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: 8_000,
      },
    },
  });
  const modelClient = {
    async proposeFileEdits(input) {
      const started = Date.now();
      const result = await openRouter.callRole({
        roleId: "implementation_engineer",
        modelId: input.modelRef,
        modelCandidateId: "kimi-2-6-live-source-edit-proof",
        prompt: buildKimiPrompt(input),
        responseFormat: "json_object",
        maxTokens: input.maxOutputTokens,
      });
      return {
        modelRunRef: `openrouter://kimi-live-source-edit/${sha256(result.responseHash ?? result.errorReasonCode ?? Date.now()).slice(0, 16)}`,
        responseText: result.responseText,
        responseHash: result.responseHash ?? sha256(result.errorReasonCode ?? "no_response"),
        latencyMs: Date.now() - started,
        usage: result.usage,
        retryEvidence: result.retryEvidence,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    },
  };
  const adapter = new KimiFileImplementationAdapter({
    modelClient,
    validationRunner: boundedValidationRunner(),
  });
  const before = await readTextIfExists(path.join(root, targetFile));
  const result = await adapter.run({
    taskSummary:
      "Create the tiny bounded Runtime Work Graph Kimi live source-edit readiness helper required by the adjacent focused test.",
    repoRoot: root,
    allowedFileRefs: [targetFile],
    contextPackRefs: ["context-pack://runtime-work-graph/kimi-live-source-edit-proof"],
    validationCommandRefs: [validationCommandRef],
    budgetPolicy: {
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      maxOutputTokens: 8_000,
      timeoutMs: 300_000,
    },
  });
  const after = await readTextIfExists(path.join(root, targetFile));
  const proof = await writeJson("kimi-live-source-edit-proof.json", {
    ...result,
    artifactKind: "kimi_live_source_edit_proof",
    liveKimiCallMade: true,
    providerPath: "openrouter",
    sourceEditTarget: targetFile,
    sourceBeforeHash: sha256(before),
    sourceAfterHash: sha256(after),
    validationCommandRef,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  await writeJson("kimi-live-source-edit-quality-review.json", {
    artifactKind: "kimi_live_source_edit_quality_review",
    status: result.status === "completed" ? "passed" : "needs_review",
    modelRef: result.modelRef,
    providerPath: result.providerPath,
    changedFileRefs: result.changedFileRefs,
    validationRefs: result.validationRefs,
    assessment:
      result.status === "completed"
        ? "Kimi produced a scoped source edit with validation evidence through the adapter."
        : "Kimi did not yet satisfy the scoped source-edit proof contract.",
    proofRef: proof.path,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
}

main().catch(async (error) => {
  await writeJson("kimi-live-source-edit-proof.json", {
    artifactKind: "kimi_live_source_edit_proof",
    status: "blocked",
    reasonCodes: [error instanceof Error ? error.message.slice(0, 180) : "kimi_live_proof_failed"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
