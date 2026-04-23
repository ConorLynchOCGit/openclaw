#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseArgs(argv) {
  return {
    runs: Number.parseInt(readArgValue(argv, "--runs") ?? "3", 10),
    miniModelId:
      readArgValue(argv, "--mini-model") ?? process.env.MODEL_MEMORY_BENCHMARK_MINI_MODEL_ID,
    nanoModelId:
      readArgValue(argv, "--nano-model") ?? process.env.MODEL_MEMORY_BENCHMARK_NANO_MODEL_ID,
    outputDir:
      readArgValue(argv, "--output-dir") ??
      ".artifacts/model-memory/pass6-live-benchmark/2026-04-23",
    requestTimeoutMs: Number.parseInt(readArgValue(argv, "--timeout-ms") ?? "120000", 10),
    apiReasoningEffort:
      readArgValue(argv, "--api-reasoning-effort") ??
      process.env.MODEL_MEMORY_BENCHMARK_API_REASONING_EFFORT ??
      "none",
    codexReasoningEffort:
      readArgValue(argv, "--codex-reasoning-effort") ??
      process.env.MODEL_MEMORY_BENCHMARK_CODEX_REASONING_EFFORT ??
      "low",
    verbosity:
      readArgValue(argv, "--verbosity") ?? process.env.MODEL_MEMORY_BENCHMARK_VERBOSITY ?? "low",
    serviceTier:
      readArgValue(argv, "--service-tier") ??
      process.env.MODEL_MEMORY_BENCHMARK_SERVICE_TIER ??
      process.env.OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER,
  };
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seed = 20260423) {
  const out = [...values];
  const next = mulberry32(seed);
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

const responseSchema = {
  type: "object",
  properties: {
    schema_version: { type: "string" },
    action: { type: "string", enum: ["capture", "ignore", "repair", "summarize"] },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_id: { type: "string" },
          candidate_type: {
            type: "string",
            enum: ["preference", "directive", "project_fact", "correction", "retrieval", "summary"],
          },
          subject: { type: "string" },
          value: { type: "string" },
          supported: { type: "boolean" },
          source_span_id: { type: "string" },
        },
        required: [
          "candidate_id",
          "candidate_type",
          "subject",
          "value",
          "supported",
          "source_span_id",
        ],
        additionalProperties: false,
      },
    },
    retrieval_intent: { type: "string" },
    correction_target_id: { type: "string" },
    repair_required: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "schema_version",
    "action",
    "candidates",
    "retrieval_intent",
    "correction_target_id",
    "repair_required",
    "notes",
  ],
  additionalProperties: false,
};

const benchmarkCases = [
  {
    caseId: "deterministic-routing-bypass",
    caseKind: "deterministic_routing_bypass",
    contractName: "capture_routing",
    expectedCandidates: 0,
    dynamicTail:
      "Source span span-routing-001 says: For this one answer only, format the response as a short checklist. This must be ignored for durable memory.",
  },
  {
    caseId: "ambiguous-model-routing",
    caseKind: "ambiguous_model_routing",
    contractName: "capture_routing",
    expectedCandidates: 1,
    dynamicTail:
      "Source span span-routing-002 says: The operator says this may matter later: model-memory benchmark output should stay artifact-only, not durable truth.",
  },
  {
    caseId: "durable-preference",
    caseKind: "durable_preference_extraction",
    contractName: "semantic_extraction",
    expectedCandidates: 1,
    dynamicTail:
      "Source span span-pref-001 says: Please remember this stable preference: validation reports should start with the result and then list evidence.",
  },
  {
    caseId: "durable-directive",
    caseKind: "durable_directive_extraction",
    contractName: "semantic_extraction",
    expectedCandidates: 1,
    dynamicTail:
      "Source span span-directive-001 says: This is a standing directive: do not restart the live gateway until rollback is explicit.",
  },
  {
    caseId: "durable-project-fact",
    caseKind: "durable_project_fact_extraction",
    contractName: "semantic_extraction",
    expectedCandidates: 1,
    dynamicTail:
      "Source span span-fact-001 says: Durable project fact: OpenClaw model-memory pre-Phase-2 gates require capture, projection, fallback, auto-fix, and soak proof.",
  },
  {
    caseId: "canonicalization",
    caseKind: "canonicalization",
    contractName: "canonicalization",
    expectedCandidates: 1,
    dynamicTail:
      "Canonicalize candidate span span-canon-001: subject=model-memory Phase 2 readiness; value=requires clean MEMMECH proof before proceeding.",
  },
  {
    caseId: "correction-targeting",
    caseKind: "correction_targeting",
    contractName: "correction_targeting",
    expectedCandidates: 1,
    dynamicTail:
      "Correction span span-correction-001 targets memory_id memory-proof-marker and says the marker should be MEMMECH-LIVE-2026-04-23.",
  },
  {
    caseId: "retrieval-interpretation",
    caseKind: "retrieval_request_interpretation",
    contractName: "retrieval_request_interpretation",
    expectedCandidates: 1,
    dynamicTail:
      "Interpret this retrieval request span span-retrieval-001: what project blockers and decisions affect model-memory Phase 2 readiness?",
  },
  {
    caseId: "strict-schema",
    caseKind: "strict_schema_adherence",
    contractName: "strict_schema_adherence",
    expectedCandidates: 1,
    dynamicTail:
      "Return exactly the strict schema for span span-schema-001. Include one supported project_fact candidate.",
  },
  {
    caseId: "empty-response",
    caseKind: "empty_response_behavior",
    contractName: "provider_boundary",
    expectedCandidates: 1,
    dynamicTail:
      "Provider-boundary span span-empty-001: respond with a valid minimal JSON object, never an empty body.",
  },
  {
    caseId: "repair-rate",
    caseKind: "repair_rate",
    contractName: "extraction_repair",
    expectedCandidates: 1,
    dynamicTail:
      "Repair this malformed candidate from span span-repair-001: {type:project_fact subject:model memory value:mechanical hardening landed}",
  },
  {
    caseId: "large-document-compression",
    caseKind: "large_document_compression",
    contractName: "source_preserving_compression",
    expectedCandidates: 1,
    dynamicTail:
      "Summarize source span span-compress-001 as source-preserving candidate hints. Preserve source_span_id and do not claim canonical truth.",
  },
];

function parseJsonOutput(text) {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

function providerFromModelId(modelId) {
  const slash = modelId.indexOf("/");
  return slash === -1 ? "openrouter" : modelId.slice(0, slash);
}

function shouldUseCodexAppServer(modelId) {
  const provider = providerFromModelId(modelId);
  return provider === "openai-codex" || provider === "codex";
}

function speedOptionsForModel(modelId, args) {
  const reasoningEffort = shouldUseCodexAppServer(modelId)
    ? args.codexReasoningEffort
    : args.apiReasoningEffort;
  return {
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(args.verbosity ? { verbosity: args.verbosity } : {}),
    ...(args.serviceTier ? { serviceTier: args.serviceTier } : {}),
  };
}

function scoreParsed(caseDef, parsed) {
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const valid = candidates.filter(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      candidate.supported === true &&
      typeof candidate.source_span_id === "string" &&
      candidate.source_span_id.startsWith("span-"),
  );
  return {
    schemaAdherent:
      typeof parsed.schema_version === "string" &&
      typeof parsed.action === "string" &&
      Array.isArray(parsed.candidates),
    repairAttempted: parsed.repair_required === true || caseDef.caseKind === "repair_rate",
    repairSucceeded: caseDef.caseKind === "repair_rate" && valid.length > 0,
    validCandidateCount: valid.length,
    invalidCandidateCount: Math.max(0, candidates.length - valid.length),
    falsePositiveCount:
      caseDef.expectedCandidates === 0 ? candidates.length : Math.max(0, candidates.length - 2),
    missedDurableFactCount: valid.length >= caseDef.expectedCandidates ? 0 : 1,
  };
}

function observationFromFailure({ caseDef, runIndex, modelId, plan, error, startedAt }) {
  const trace = error?.trace;
  return {
    caseId: caseDef.caseId,
    caseKind: caseDef.caseKind,
    runIndex,
    modelId,
    provider: trace?.provider,
    resolvedModelId: trace?.resolvedModelId,
    contractName: plan.contractName,
    contractVersion: plan.contractVersion,
    promptVersion: plan.promptVersion,
    staticPrefixHash: plan.staticPrefixHash,
    schemaHash: plan.schemaHash,
    promptCacheKey: plan.promptCacheKey,
    latencyMs: trace?.latencyMs ?? Date.now() - startedAt,
    promptTokenCount: trace?.promptTokenCount ?? 0,
    cachedInputTokenCount: trace?.cachedInputTokenCount ?? 0,
    outputTokenCount: trace?.outputTokenCount ?? 0,
    schemaAdherent: false,
    emptyResponse:
      trace?.failureStage === "provider_response" ||
      /empty|missing text/i.test(String(error?.message ?? "")),
    repairAttempted: caseDef.caseKind === "repair_rate",
    repairSucceeded: false,
    validCandidateCount: 0,
    invalidCandidateCount: 1,
    falsePositiveCount: 0,
    missedDurableFactCount: caseDef.expectedCandidates > 0 ? 1 : 0,
    failureClass: trace?.failureClass ?? error?.failureClass ?? "provider_connection",
  };
}

function timeoutError(message) {
  const error = new Error(message);
  error.failureClass = "provider_connection";
  return error;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(timeoutError(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function main() {
  const root = repoRoot();
  const args = parseArgs(process.argv.slice(2));
  const api = await tsImport(
    path.join(root, "extensions/model-memory/src/benchmark/benchmark-runner.ts"),
    import.meta.url,
  );
  const { OpenAICompatibleLiveJsonExecutor } = await tsImport(
    path.join(root, "src/agents/model-memory.live-json-executor.ts"),
    import.meta.url,
  );
  const { CodexAppServerJsonExecutor } = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );

  const miniModelId = args.miniModelId ?? api.DEFAULT_CACHE_AWARE_MINI_MODEL_ID;
  const nanoModelId = args.nanoModelId ?? api.DEFAULT_CACHE_AWARE_NANO_MODEL_ID;
  const traces = [];
  const httpExecutor = new OpenAICompatibleLiveJsonExecutor({
    requestTimeoutMs: args.requestTimeoutMs,
    onTrace: (trace) => traces.push(trace),
  });
  const codexExecutor = new CodexAppServerJsonExecutor({
    cwd: root,
    requestTimeoutMs: args.requestTimeoutMs,
    reasoningEffort: args.codexReasoningEffort,
    ...(args.serviceTier ? { serviceTier: args.serviceTier } : {}),
  });

  const work = [];
  for (const modelId of [miniModelId, nanoModelId]) {
    for (const caseDef of benchmarkCases) {
      for (let runIndex = 0; runIndex < args.runs; runIndex += 1) {
        work.push({ modelId, caseDef, runIndex });
      }
    }
  }

  const observations = [];
  for (const item of shuffled(work)) {
    const plan = api.buildCacheAwarePromptPlan({
      contractName: item.caseDef.contractName,
      contractVersion: "v1",
      promptVersion: "live-pass6-v1",
      staticPrefix:
        "You are executing an OpenClaw MMV2 benchmark contract. Return only strict JSON matching the provided schema. Use only the source span in the dynamic tail. Do not include raw prompts, transcripts, secrets, or private phrases in metadata.",
      schema: responseSchema,
      dynamicTail: item.caseDef.dynamicTail,
      sourceText: item.caseDef.dynamicTail,
    });
    const startedAt = Date.now();
    try {
      const executor = shouldUseCodexAppServer(item.modelId) ? codexExecutor : httpExecutor;
      const response = await withTimeout(
        executor.execute({
          contract: {
            contractName: item.caseDef.contractName,
            contractVersion: "v1",
            modelId: item.modelId,
          },
          systemPrompt: `${plan.staticPrefix}\n\nSchema hash: ${plan.schemaHash}.`,
          userPrompt: plan.dynamicTail,
          responseFormat: "json",
          responseOptions: {
            transport: {
              type: "json_schema",
              name: "model_memory_benchmark_result",
              strict: true,
              schema: responseSchema,
            },
            provider: { requireParameters: true },
            promptCache: { key: plan.promptCacheKey },
            maxOutputTokens: 700,
            ...speedOptionsForModel(item.modelId, args),
          },
        }),
        Math.min(args.requestTimeoutMs, shouldUseCodexAppServer(item.modelId) ? 60_000 : 60_000),
        `${item.modelId}/${item.caseDef.caseId}`,
      );
      const parsed = parseJsonOutput(response.outputText);
      const scored = scoreParsed(item.caseDef, parsed);
      observations.push({
        caseId: item.caseDef.caseId,
        caseKind: item.caseDef.caseKind,
        runIndex: item.runIndex,
        modelId: item.modelId,
        provider: providerFromModelId(item.modelId),
        resolvedModelId: response.resolvedModelId,
        contractName: plan.contractName,
        contractVersion: plan.contractVersion,
        promptVersion: plan.promptVersion,
        staticPrefixHash: plan.staticPrefixHash,
        schemaHash: plan.schemaHash,
        promptCacheKey: plan.promptCacheKey,
        latencyMs: Date.now() - startedAt,
        promptTokenCount: response.usage?.promptTokens ?? 0,
        cachedInputTokenCount: response.usage?.cachedInputTokens ?? 0,
        outputTokenCount: response.usage?.outputTokens ?? 0,
        emptyResponse: response.outputText.trim().length === 0,
        ...scored,
      });
    } catch (error) {
      const observation = observationFromFailure({
        api,
        caseDef: item.caseDef,
        runIndex: item.runIndex,
        modelId: item.modelId,
        plan,
        error,
        startedAt,
      });
      observations.push(observation);
    }
  }

  const report = api.buildCacheAwareBenchmarkReport({
    observations,
    miniModelId,
    nanoModelId,
    durableDbWrites: "disabled",
  });
  report.executionMetadata = {
    live_provider_calls_attempted: observations.length,
    randomized_order: true,
    runs_per_model_per_case: args.runs,
    db_persistence_time_included: false,
    traces_sanitized: true,
    speed_controls: {
      api_reasoning_effort: args.apiReasoningEffort,
      codex_reasoning_effort: args.codexReasoningEffort,
      verbosity: args.verbosity,
      service_tier: args.serviceTier ?? null,
      official_docs_checked: [
        "https://developers.openai.com/api/docs/guides/latest-model",
        "https://developers.openai.com/api/docs/guides/priority-processing",
      ],
    },
  };
  report.pricingAssumptionsPerMillionTokens = {
    "openai-codex/gpt-5.4-mini": { input: 0.75, cached_input: 0.075, output: 4.5 },
    "openrouter/openai/gpt-5.4-nano": { input: 0.2, cached_input: 0.02, output: 1.25 },
  };

  const outputDir = path.resolve(root, args.outputDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "benchmark-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "benchmark-report.md"),
    `${api.renderCacheAwareBenchmarkMarkdown(report)}\n`,
  );
  await writeFile(
    path.join(outputDir, "sanitized-traces.json"),
    `${JSON.stringify(
      traces.map((trace) => ({
        contractName: trace.contractName,
        contractVersion: trace.contractVersion,
        requestedModelId: trace.requestedModelId,
        provider: trace.provider,
        providerModel: trace.providerModel,
        resolvedModelId: trace.resolvedModelId,
        httpStatus: trace.httpStatus,
        responseOk: trace.responseOk,
        failureClass: trace.failureClass,
        failureStage: trace.failureStage,
        latencyMs: trace.latencyMs,
        promptTokenCount: trace.promptTokenCount,
        cachedInputTokenCount: trace.cachedInputTokenCount,
        outputTokenCount: trace.outputTokenCount,
        promptCacheKey: trace.promptCacheKey,
        prefixHash: trace.prefixHash,
        schemaHash: trace.schemaHash,
      })),
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        benchmarkReport: path.join(outputDir, "benchmark-report.json"),
        benchmarkMarkdown: path.join(outputDir, "benchmark-report.md"),
        sanitizedTraces: path.join(outputDir, "sanitized-traces.json"),
        observations: observations.length,
      },
      null,
      2,
    ),
  );
  if ([miniModelId, nanoModelId].some((modelId) => shouldUseCodexAppServer(modelId))) {
    const { clearSharedCodexAppServerClient } = await tsImport(
      path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
      import.meta.url,
    );
    clearSharedCodexAppServerClient();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
