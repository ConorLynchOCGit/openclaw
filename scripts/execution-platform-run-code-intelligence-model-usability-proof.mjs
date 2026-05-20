#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODE_INTELLIGENCE_RUNTIME_TOOL_IDS = [
  "code.search_symbols",
  "code.get_definition",
  "code.get_references",
  "code.get_hover",
  "code.get_diagnostics",
  "code.get_document_symbols",
  "code.get_workspace_symbols",
  "code.get_call_hierarchy",
  "code.get_implementation",
  "code.plan_rename",
  "code.get_code_actions",
  "code.find_related_tests",
  "code.resolve_import_graph",
  "code.find_impact_radius",
  "code.summarize_file_structure",
  "code.backend_status",
];

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

function boundedJsonParse(text) {
  const trimmed = String(text ?? "").trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  return JSON.parse(unfenced);
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

function boundedString(value, max = 800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function arrayOfStrings(value, maxItems = 20) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, maxItems)
    : [];
}

function normalizeToolCalls(value) {
  return Array.isArray(value)
    ? value
        .map((call, index) => {
          const record = call && typeof call === "object" && !Array.isArray(call) ? call : {};
          return {
            index,
            toolId: boundedString(record.toolId, 120),
            args:
              record.args && typeof record.args === "object" && !Array.isArray(record.args)
                ? {
                    query: boundedString(record.args.query, 200),
                    symbolName: boundedString(record.args.symbolName, 200),
                    filePath: boundedString(record.args.filePath, 240),
                    targetFilePath: boundedString(record.args.targetFilePath, 240),
                    targetSymbol: boundedString(record.args.targetSymbol, 200),
                    limit:
                      typeof record.args.limit === "number"
                        ? Math.max(1, Math.min(80, record.args.limit))
                        : undefined,
                  }
                : {},
            why: boundedString(record.why, 400),
          };
        })
        .filter((call) => CODE_INTELLIGENCE_RUNTIME_TOOL_IDS.includes(call.toolId))
        .slice(0, 5)
    : [];
}

async function createFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "openclaw-code-intelligence-model-"));
  await fs.writeFile(
    path.join(rootDir, "feature-runtime.ts"),
    [
      'import { recordFeatureMetric } from "./feature-metrics";',
      "",
      "export interface FeatureRuntimeContract {",
      "  featureId: string;",
      "  enabled: boolean;",
      "}",
      "",
      "export function runFeatureRuntime(contract: FeatureRuntimeContract): string {",
      "  if (!contract.enabled) {",
      '    return "disabled";',
      "  }",
      "  recordFeatureMetric(contract.featureId);",
      "  return `enabled:${contract.featureId}`;",
      "}",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(rootDir, "feature-metrics.ts"),
    [
      "export function recordFeatureMetric(featureId: string): void {",
      "  if (!featureId) {",
      '    throw new Error("feature_id_missing");',
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(rootDir, "feature-runtime.test.ts"),
    [
      'import { runFeatureRuntime } from "./feature-runtime";',
      "",
      'it("runs enabled feature", () => {',
      "  expect(runFeatureRuntime({ featureId: 'alpha', enabled: true })).toBe('enabled:alpha');",
      "});",
    ].join("\n"),
    "utf8",
  );
  return rootDir;
}

async function main() {
  await loadDotenvFiles();
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const liveRunnerApi = await tsImport(
    path.join(root, "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts"),
    import.meta.url,
  );
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelRef =
    process.env.OPENCLAW_CODE_INTELLIGENCE_MODEL_TEST_MODEL ?? "qwen/qwen3-coder-next";
  const proofId = `code-intelligence-model-usability-${Date.now().toString(36)}`;
  if (!apiKey) {
    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "code_intelligence_model_usability_proof",
      status: "needs_review",
      providerCallMade: false,
      blocker: "OPENROUTER_API_KEY not configured in loaded environment refs.",
      ...boundedSafety(),
    });
    console.log(JSON.stringify({ status: "needs_review", ...artifact }, null, 2));
    return;
  }

  const fixtureRoot = await createFixture();
  const database = await api.createExecutionPlatformPgMemTestDatabase();
  try {
    await api.applyExecutionPlatformMigrations(database.sql);
    const registry = new api.RuntimeToolRegistry();
    api.registerSchedulerRuntimeTools({
      registry,
      codeIntelligenceService: api.createCodeIntelligenceService({ rootDir: fixtureRoot }),
    });
    const traces = new api.RuntimeToolTraceRepository(database.sql);
    const kernel = new api.RuntimeToolKernel({ registry, traces });
    const client = new liveRunnerApi.OpenRouterAgentTeamModelClient({
      apiKey,
      retryPolicy: {
        maxAttempts: 1,
        timeoutMs: Number(process.env.OPENCLAW_CODE_INTELLIGENCE_MODEL_TEST_TIMEOUT_MS ?? 180_000),
      },
      requestProfilesByModelId: {
        [modelRef]: {
          responseFormatMode: "prompt_only",
          reasoningMode: "none",
          maxTokens: Number(process.env.OPENCLAW_CODE_INTELLIGENCE_MODEL_TEST_MAX_TOKENS ?? 1_200),
        },
      },
    });

    const toolCatalog = CODE_INTELLIGENCE_RUNTIME_TOOL_IDS.map((toolId) => ({
      toolId,
      args: ["query", "symbolName", "filePath", "targetFilePath", "targetSymbol", "limit"],
    }));
    const selectionPrompt = [
      "You are testing whether OpenClaw code-intelligence tools are usable by a model.",
      "Return JSON only with: toolCalls: [{toolId,args,why}], expectedAnswerSummary, rawPromptStored:false, rawResponseStored:false.",
      "Select the minimum useful code-intelligence calls to answer this task: find where runFeatureRuntime is defined, where it is referenced, and which related test should validate edits.",
      `Available tools: ${JSON.stringify(toolCatalog)}`,
      "Use only listed tool ids. Do not invent executor keys, node kinds, file contents, or runtime refs.",
    ].join("\n");
    const selectionStartedAt = Date.now();
    const selection = await client.callRole({
      roleId: "context_scout",
      modelId: modelRef,
      modelCandidateId: "code-intelligence-model-usability",
      prompt: selectionPrompt,
      responseFormat: "json_object",
      maxTokens: 1_200,
      timeoutMs: Number(process.env.OPENCLAW_CODE_INTELLIGENCE_MODEL_TEST_TIMEOUT_MS ?? 180_000),
      maxAttempts: 1,
    });
    const selectionLatencyMs = Date.now() - selectionStartedAt;
    const parsedSelection = boundedJsonParse(selection.responseText ?? "{}");
    const toolCalls = normalizeToolCalls(parsedSelection.toolCalls);

    const toolResults = [];
    for (const call of toolCalls) {
      const invoked = await kernel.invoke({
        toolId: call.toolId,
        runtimeJobId: null,
        graphId: null,
        nodeId: null,
        roleRef: "context_scout",
        modelRef,
        idempotencyScope: proofId,
        idempotencyKey: `tool-${call.index}-${call.toolId}`,
        inputSummary: `Model-selected ${call.toolId}: ${call.why}`,
        volatileInput: call.args,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
      });
      const metadata = invoked.invocation.metadata ?? {};
      toolResults.push({
        toolId: call.toolId,
        invocationRef: invoked.invocationRef,
        status: invoked.invocation.status,
        outputRef: invoked.invocation.outputRef,
        outputHash: invoked.invocation.outputHash,
        outputSummary: invoked.invocation.outputSummary,
        reasonCodes: invoked.invocation.reasonCodes,
        semanticMode: metadata.semanticMode ?? null,
        backendId: metadata.backendId ?? null,
        backendHealthRef: metadata.backendHealthRef ?? null,
        workspaceSnapshotRef: metadata.workspaceSnapshotRef ?? null,
        semanticConfidence: metadata.semanticConfidence ?? null,
        fallbackUsed: metadata.fallbackUsed ?? null,
        fallbackReasonCodes: arrayOfStrings(metadata.fallbackReasonCodes, 12),
        diagnosticVersionRef: metadata.diagnosticVersionRef ?? null,
        projectConfigRefs: arrayOfStrings(metadata.projectConfigRefs, 12),
        backendLatencyMs:
          typeof metadata.backendLatencyMs === "number" ? metadata.backendLatencyMs : null,
        resultCounts: metadata.resultCounts ?? null,
        symbolRefs: arrayOfStrings(metadata.symbolRefs, 12),
        relatedTestRefs: arrayOfStrings(metadata.relatedTestRefs, 12),
        impactRefs: arrayOfStrings(metadata.impactRefs, 12),
      });
    }

    const interpretationPrompt = [
      "You are reviewing bounded code-intelligence tool results.",
      "Return JSON only with: usable:boolean, answerSummary, evidenceRefs:string[], missingCapabilities:string[], rawPromptStored:false, rawResponseStored:false.",
      "Judge whether the tool outputs are enough for a context scout or implementation worker to identify definition, references, and related tests.",
      `Tool result summaries: ${JSON.stringify(toolResults)}`,
    ].join("\n");
    const interpretationStartedAt = Date.now();
    const interpretation = await client.callRole({
      roleId: "context_scout",
      modelId: modelRef,
      modelCandidateId: "code-intelligence-model-usability-review",
      prompt: interpretationPrompt,
      responseFormat: "json_object",
      maxTokens: 1_000,
      timeoutMs: Number(process.env.OPENCLAW_CODE_INTELLIGENCE_MODEL_TEST_TIMEOUT_MS ?? 180_000),
      maxAttempts: 1,
    });
    const interpretationLatencyMs = Date.now() - interpretationStartedAt;
    const parsedInterpretation = boundedJsonParse(interpretation.responseText ?? "{}");
    const semanticBackendUsable =
      toolResults.length > 0 &&
      toolResults.every(
        (result) =>
          result.semanticMode === "typescript_semantic" &&
          result.backendId === "typescript_language_service" &&
          result.fallbackUsed === false &&
          typeof result.backendHealthRef === "string" &&
          typeof result.workspaceSnapshotRef === "string",
      );
    const usable = parsedInterpretation.usable === true && semanticBackendUsable;
    const artifact = await writeArtifact(`${proofId}.json`, {
      artifactKind: "code_intelligence_model_usability_proof",
      proofId,
      status: usable ? "passed" : "needs_review",
      providerCallMade: true,
      modelRef,
      selection: {
        status: selection.status,
        latencyMs: selectionLatencyMs,
        responseHash: selection.responseHash,
        usage: selection.usage ?? null,
        retryEvidence: selection.retryEvidence ?? null,
        selectedToolIds: toolCalls.map((call) => call.toolId),
        toolCallCount: toolCalls.length,
        expectedAnswerSummary: boundedString(parsedSelection.expectedAnswerSummary, 800),
      },
      semanticBackendGate: {
        usable: semanticBackendUsable,
        requiredSemanticMode: "typescript_semantic",
        requiredBackendId: "typescript_language_service",
        requiredFallbackUsed: false,
      },
      runtimeToolResults: toolResults,
      interpretation: {
        status: interpretation.status,
        latencyMs: interpretationLatencyMs,
        responseHash: interpretation.responseHash,
        usage: interpretation.usage ?? null,
        retryEvidence: interpretation.retryEvidence ?? null,
        usable,
        answerSummary: boundedString(parsedInterpretation.answerSummary, 1_000),
        evidenceRefs: arrayOfStrings(parsedInterpretation.evidenceRefs, 20),
        missingCapabilities: arrayOfStrings(parsedInterpretation.missingCapabilities, 20),
      },
      promptHashes: {
        selectionPromptHash: sha256(selectionPrompt),
        interpretationPromptHash: sha256(interpretationPrompt),
      },
      ...boundedSafety(),
    });
    console.log(
      JSON.stringify(
        {
          status: usable ? "passed" : "needs_review",
          modelRef,
          selectedToolIds: toolCalls.map((call) => call.toolId),
          toolResultCount: toolResults.length,
          interpretationUsable: usable,
          artifact,
        },
        null,
        2,
      ),
    );
  } finally {
    await database.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

main().catch(async (error) => {
  const artifact = await writeArtifact(
    `code-intelligence-model-usability-error-${Date.now().toString(36)}.json`,
    {
      artifactKind: "code_intelligence_model_usability_proof",
      status: "failed",
      errorSummary:
        error instanceof Error ? error.message.slice(0, 800) : String(error).slice(0, 800),
      ...boundedSafety(),
    },
  );
  console.error(
    JSON.stringify(
      { status: "failed", error: error instanceof Error ? error.message : String(error), artifact },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
