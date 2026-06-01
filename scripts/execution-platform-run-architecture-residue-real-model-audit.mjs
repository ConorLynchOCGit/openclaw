#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/architecture-residue-real-model-audit",
);
const sourceInventoryArtifactNamespace = "source-inventory-domain-lifecycle-residue-gate";
const sourceInventoryWorkItemId =
  "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate";
const MODEL_ID =
  process.env.OPENCLAW_ARCHITECTURE_RESIDUE_AUDIT_MODEL_ID?.trim() ||
  "qwen/qwen3-coder-next";
const MODEL_CANDIDATE_ID =
  process.env.OPENCLAW_ARCHITECTURE_RESIDUE_AUDIT_MODEL_CANDIDATE_ID?.trim() ||
  "qwen3-coder-next-architecture-residue-audit";
const MAX_TOKENS = Number(process.env.OPENCLAW_ARCHITECTURE_RESIDUE_AUDIT_MAX_TOKENS ?? 2_800);
const TIMEOUT_MS = Number(process.env.OPENCLAW_ARCHITECTURE_RESIDUE_AUDIT_TIMEOUT_MS ?? 90_000);

const safety = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function bounded(value, max = 1_000) {
  return String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

async function writeJson(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: path.relative(root, target),
    ref: `artifact://execution-platform/architecture-residue-real-model-audit/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function exists(filePath) {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  let loaded = false;
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
      loaded = true;
    }
  }
  return loaded;
}

async function loadDotenvFiles() {
  const refs = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    const loaded = await loadEnvFile(filePath);
    if (loaded || (await exists(filePath))) {
      refs.push(`dotenv://${path.relative(root, filePath) || filePath}`);
    }
  }
  return refs;
}

function extractJsonObject(text) {
  const source = String(text ?? "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizedRecommendationArray(value) {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return {
      file: bounded(record.file, 260),
      recommendation:
        record.recommendation === "delete" ||
        record.recommendation === "rename" ||
        record.recommendation === "keep_guard" ||
        record.recommendation === "move_to_docs" ||
        record.recommendation === "needs_human_review"
          ? record.recommendation
          : "needs_human_review",
      rationale: bounded(record.rationale, 360),
      riskIfKept: bounded(record.riskIfKept, 280),
      riskIfDeleted: bounded(record.riskIfDeleted, 280),
    };
  });
}

function providerDiagnosticFromResult(input) {
  const diagnostics =
    input.providerResponseDiagnostics &&
    typeof input.providerResponseDiagnostics === "object" &&
    !Array.isArray(input.providerResponseDiagnostics)
      ? input.providerResponseDiagnostics
      : {};
  const contentLengths = Array.isArray(diagnostics.contentLengthByChoice)
    ? diagnostics.contentLengthByChoice
    : input.responseText
      ? [Buffer.byteLength(input.responseText, "utf8")]
      : [];
  return {
    modelRef: MODEL_ID,
    providerId: "openrouter",
    providerPath: "openrouter",
    requestByteCount: input.promptBytes,
    timeoutMs: TIMEOUT_MS,
    timeoutState: input.status === "failed" && input.errorReasonCode === "timeout" ? "timed_out" : "not_timed_out",
    nativeFinishReason:
      typeof diagnostics.nativeFinishReason === "string"
        ? diagnostics.nativeFinishReason
        : typeof diagnostics.finishReason === "string"
          ? diagnostics.finishReason
          : input.errorReasonCode ?? null,
    choiceCount:
      typeof diagnostics.choiceCount === "number" ? diagnostics.choiceCount : input.responseText ? 1 : 0,
    contentLengths,
    parsedContentLength: input.responseText ? Buffer.byteLength(input.responseText, "utf8") : 0,
    retryNumber: 0,
    concurrencySlot: "architecture-residue-real-model-audit",
    inputBundleHash: `sha256:${input.promptHash}`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function buildPrompt(report) {
  const topFiles = report.manifest.topSurvivorFiles.slice(0, 18);
  const blocked = report.blockedSurvivorRefs.slice(0, 30);
  const survivors = report.survivorRefs
    .filter((ref) => !ref.file.startsWith("docs/"))
    .slice(0, 70)
    .map((ref) => ({
      file: ref.file,
      term: ref.term,
      count: ref.count,
      disposition: ref.disposition,
      reasonCode: ref.reasonCode,
      maxAllowedCount: ref.maxAllowedCount,
    }));
  return [
    "You are auditing an OpenClaw Execution Platform architecture-residue source inventory.",
    "This is advisory model review only. The runtime gate owns deterministic pass/fail from exact files, terms, and counts. Do not rewrite canonical state. Do not use hidden reasoning in the output.",
    "Goal: identify any surviving retired topology references that are likely real architecture debt, likely harmless negative tests, or should move to docs. Focus on general orchestrator robustness, not on passing a narrow proof.",
    "",
    "Return one compact JSON object. Stay under 1600 output tokens. No markdown, no prose outside JSON. At most 8 recommendations; each rationale/risk field must be one short sentence.",
    '{ "overallRisk": "low|medium|high|blocking", "summary": string, "recommendations": [{ "file": string, "recommendation": "delete|rename|keep_guard|move_to_docs|needs_human_review", "rationale": string, "riskIfKept": string, "riskIfDeleted": string }], "missingGateIdeas": [string], "nextCleanupFocus": [string] }',
    "",
    "Inventory manifest:",
    JSON.stringify(
      {
        status: report.status,
        hardFailureCount: report.hardFailureCount,
        blockedSurvivorRefCount: report.blockedSurvivorRefCount,
        survivorRefCount: report.survivorRefCount,
        lineReduction: report.lineReduction,
        topFiles,
      },
      null,
      2,
    ),
    "",
    "Blocked survivor refs:",
    JSON.stringify(blocked, null, 2),
    "",
    "Non-doc survivor refs sample:",
    JSON.stringify(survivors, null, 2),
  ].join("\n");
}

async function main() {
  const inventoryModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts",
    ),
    import.meta.url,
  );
  const report = inventoryModule.runArchitectureResidueSourceInventory({
    repoRoot: root,
    fullReportRef:
      `artifact://execution-platform/${sourceInventoryArtifactNamespace}/full-report.json`,
  });
  const loadedConfigRefs = await loadDotenvFiles();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    const artifact = await writeJson("audit.json", {
      artifactKind: "execution_platform.architecture_residue_model_audit",
      schemaVersion: "execution-platform.architecture-residue-model-audit.v1",
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY was unavailable after dotenv discovery.",
      loadedConfigRefs,
      generatedAt: new Date().toISOString(),
      ...safety,
    });
    console.log(JSON.stringify({ status: "needs_review", artifact }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { OpenRouterAgentTeamModelClient } = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const prompt = buildPrompt(report);
  const promptHash = sha256(prompt);
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const client = new OpenRouterAgentTeamModelClient({
    apiKey,
    requestProfilesByModelId: {
      [MODEL_ID]: {
        reasoningMode: "none",
        responseFormatMode: "prompt_only",
        maxTokens: MAX_TOKENS,
      },
    },
  });
  const started = Date.now();
  const response = await client.callRole({
    roleId: "reviewer",
    modelId: MODEL_ID,
    modelCandidateId: MODEL_CANDIDATE_ID,
    prompt,
    responseFormat: "json_object",
    requestProfileOverride: {
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxTokens: MAX_TOKENS,
    },
    maxTokens: MAX_TOKENS,
    timeoutMs: TIMEOUT_MS,
    maxAttempts: 1,
    taskClass: "validation_classification",
    modelTaskCallSite: "architecture_residue.real_model_audit",
  });
  const latencyMs = Date.now() - started;
  const parsed = extractJsonObject(response.responseText);
  const diagnostic = providerDiagnosticFromResult({
    ...response,
    promptBytes,
    promptHash,
  });
  const audit = {
    artifactKind: "execution_platform.architecture_residue_model_audit",
    schemaVersion: "execution-platform.architecture-residue-model-audit.v1",
    status: response.status === "succeeded" && parsed ? "passed" : "needs_review",
    workItemId: sourceInventoryWorkItemId,
    generatedAt: new Date().toISOString(),
    modelId: MODEL_ID,
    modelCandidateId: MODEL_CANDIDATE_ID,
    loadedConfigRefs,
    inventory: {
      status: report.status,
      hardFailureCount: report.hardFailureCount,
      blockedSurvivorRefCount: report.blockedSurvivorRefCount,
      survivorRefCount: report.survivorRefCount,
      reportHash: report.manifest.reportHash,
    },
    providerCall: {
      status: response.status,
      latencyMs,
      promptBytes,
      promptHash: `sha256:${promptHash}`,
      responseHash: response.responseHash ? `sha256:${response.responseHash}` : null,
      responseBytes: Buffer.byteLength(response.responseText ?? "", "utf8"),
      usage: response.usage ?? null,
      errorReasonCode: response.errorReasonCode ?? null,
      httpStatus: response.httpStatus ?? null,
      providerDiagnostic: diagnostic,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    normalizedAudit: parsed
      ? {
          overallRisk:
            parsed.overallRisk === "low" ||
            parsed.overallRisk === "medium" ||
            parsed.overallRisk === "high" ||
            parsed.overallRisk === "blocking"
              ? parsed.overallRisk
              : "medium",
          summary: bounded(parsed.summary, 1_200),
          recommendations: normalizedRecommendationArray(parsed.recommendations),
          missingGateIdeas: (Array.isArray(parsed.missingGateIdeas) ? parsed.missingGateIdeas : [])
            .slice(0, 12)
            .map((item) => bounded(item, 300)),
          nextCleanupFocus: (Array.isArray(parsed.nextCleanupFocus) ? parsed.nextCleanupFocus : [])
            .slice(0, 12)
            .map((item) => bounded(item, 300)),
        }
      : null,
    ...safety,
  };
  const artifact = await writeJson("audit.json", audit);
  console.log(
    JSON.stringify(
      {
        status: audit.status,
        artifact,
        providerLatencyMs: latencyMs,
        promptBytes,
        responseBytes: audit.providerCall.responseBytes,
        usage: audit.providerCall.usage,
        overallRisk: audit.normalizedAudit?.overallRisk ?? null,
        recommendationCount: audit.normalizedAudit?.recommendations.length ?? 0,
      },
      null,
      2,
    ),
  );
  if (audit.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const artifact = await writeJson("error.json", {
    artifactKind: "execution_platform.architecture_residue_model_audit_error",
    schemaVersion: "execution-platform.architecture-residue-model-audit-error.v1",
    status: "failed",
    errorName: error?.name ?? "unknown_error",
    errorSummary: String(error?.message ?? error).slice(0, 1_200),
    generatedAt: new Date().toISOString(),
    ...safety,
  });
  console.error(JSON.stringify({ status: "failed", artifact }, null, 2));
  process.exitCode = 1;
});
