#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    modelId:
      readArgValue(argv, "--model") ??
      process.env.MODEL_MEMORY_LARGE_DOC_COMPRESSION_MODEL_ID ??
      "openai-codex/gpt-5.4-mini",
    sourcePath: readArgValue(argv, "--source") ?? "docs/projects/model-memory/DECISIONS.md",
    outputDir:
      readArgValue(argv, "--output-dir") ??
      ".artifacts/model-memory/large-doc-compression/2026-04-23",
    requestTimeoutMs: Number.parseInt(readArgValue(argv, "--timeout-ms") ?? "180000", 10),
    apiReasoningEffort:
      readArgValue(argv, "--api-reasoning-effort") ??
      process.env.MODEL_MEMORY_LARGE_DOC_API_REASONING_EFFORT ??
      "none",
    codexReasoningEffort:
      readArgValue(argv, "--codex-reasoning-effort") ??
      process.env.MODEL_MEMORY_LARGE_DOC_CODEX_REASONING_EFFORT ??
      "low",
    verbosity:
      readArgValue(argv, "--verbosity") ?? process.env.MODEL_MEMORY_LARGE_DOC_VERBOSITY ?? "low",
    serviceTier:
      readArgValue(argv, "--service-tier") ??
      process.env.MODEL_MEMORY_LARGE_DOC_SERVICE_TIER ??
      process.env.OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return {
    reasoningEffort: shouldUseCodexAppServer(modelId)
      ? args.codexReasoningEffort
      : args.apiReasoningEffort,
    ...(args.verbosity ? { verbosity: args.verbosity } : {}),
    ...(args.serviceTier ? { serviceTier: args.serviceTier } : {}),
  };
}

function stripFence(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/iu, "");
}

function sectionMapText(sections) {
  return sections
    .map((section) => {
      const excerpt = section.text.replace(/\s+/gu, " ").slice(0, 700);
      return `[${section.id}] ${section.title}\nsha256:${section.hash}\n${excerpt}`;
    })
    .join("\n\n");
}

const compressionSchema = {
  type: "object",
  properties: {
    schema_version: { type: "string" },
    strategy: {
      type: "string",
      enum: [
        "direct_rigid_capture",
        "source_preserving_summary_then_rigid_capture",
        "section_map_candidate_hints",
      ],
    },
    source_id: { type: "string" },
    section_window_ids: { type: "array", items: { type: "string" } },
    source_span_ids: { type: "array", items: { type: "string" } },
    quote_hashes: { type: "array", items: { type: "string" } },
    bounded_evidence_quotes: { type: "array", items: { type: "string" } },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidate_id: { type: "string" },
          candidate_type: { type: "string", enum: ["claim", "procedure", "decision"] },
          claim: { type: "string" },
          source_span_ids: { type: "array", items: { type: "string" } },
          bounded_evidence_quote: { type: "string" },
        },
        required: [
          "candidate_id",
          "candidate_type",
          "claim",
          "source_span_ids",
          "bounded_evidence_quote",
        ],
        additionalProperties: false,
      },
    },
    omitted_sections: { type: "array", items: { type: "string" } },
    uncertain_sections: { type: "array", items: { type: "string" } },
    canonical_truth: { type: "boolean", enum: [false] },
  },
  required: [
    "schema_version",
    "strategy",
    "source_id",
    "section_window_ids",
    "source_span_ids",
    "quote_hashes",
    "bounded_evidence_quotes",
    "candidates",
    "omitted_sections",
    "uncertain_sections",
    "canonical_truth",
  ],
  additionalProperties: false,
};

function buildRequest({ args, modelId, strategy, sourceId, dynamicTail, promptCacheKey }) {
  return {
    contract: {
      contractName: "large_document_source_preserving_compression",
      contractVersion: "v1",
      modelId,
    },
    systemPrompt:
      "Compress or extract the provided OpenClaw source document using only source-preserving evidence. Return strict JSON only. Summaries are projection/cache artifacts and are not canonical truth. Every candidate must cite source_span_ids and bounded evidence from the original source. bounded_evidence_quotes and candidate bounded_evidence_quote values must be exact copied substrings from the supplied source text or excerpts, preferably under 160 characters; do not paraphrase evidence quotes.",
    userPrompt: `Strategy: ${strategy}\nSource id: ${sourceId}\n\n${dynamicTail}`,
    responseFormat: "json",
    responseOptions: {
      transport: {
        type: "json_schema",
        name: "source_preserving_compression",
        strict: true,
        schema: compressionSchema,
      },
      provider: { requireParameters: true },
      promptCache: { key: promptCacheKey },
      maxOutputTokens: 2400,
      ...speedOptionsForModel(modelId, args),
    },
  };
}

function validateArtifact(parsed, sourceText) {
  const failures = [];
  const normalizedSourceText = sourceText.replace(/\s+/gu, " ");
  const quoteFoundInSource = (quote) =>
    sourceText.includes(quote) ||
    normalizedSourceText.includes(String(quote).replace(/\s+/gu, " "));
  if (parsed.canonical_truth !== false) {
    failures.push("summary_marked_canonical_truth");
  }
  if (!Array.isArray(parsed.source_span_ids) || parsed.source_span_ids.length === 0) {
    failures.push("missing_source_span_ids");
  }
  for (const quote of parsed.bounded_evidence_quotes ?? []) {
    if (typeof quote !== "string" || quote.length === 0 || !quoteFoundInSource(quote)) {
      failures.push("bounded_quote_not_found_in_original_source");
      break;
    }
  }
  for (const candidate of parsed.candidates ?? []) {
    if (!candidate.source_span_ids?.length) {
      failures.push(`candidate_missing_span:${candidate.candidate_id ?? "unknown"}`);
    }
    if (
      typeof candidate.bounded_evidence_quote === "string" &&
      candidate.bounded_evidence_quote.length > 0 &&
      !quoteFoundInSource(candidate.bounded_evidence_quote)
    ) {
      failures.push(`candidate_quote_not_found:${candidate.candidate_id ?? "unknown"}`);
    }
  }
  return failures;
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

async function executeStrategy({
  executor,
  api,
  args,
  modelId,
  strategy,
  sourceId,
  dynamicTail,
  sourceText,
}) {
  const plan = api.buildCacheAwarePromptPlan({
    contractName: "large_document_source_preserving_compression",
    contractVersion: "v1",
    promptVersion: "live-large-doc-v1",
    staticPrefix:
      "Source-preserving compression contract. Static prompt and schema are cacheable; document text appears only in the dynamic tail.",
    schema: compressionSchema,
    dynamicTail,
    sourceText: dynamicTail,
  });
  const startedAt = Date.now();
  const response = await withTimeout(
    executor.execute(
      buildRequest({
        args,
        modelId,
        strategy,
        sourceId,
        dynamicTail,
        promptCacheKey: plan.promptCacheKey,
      }),
    ),
    shouldUseCodexAppServer(modelId) ? 60_000 : 120_000,
    `${modelId}/${strategy}`,
  );
  const parsed = JSON.parse(stripFence(response.outputText));
  const validationFailures = validateArtifact(parsed, sourceText);
  const validCandidates = (parsed.candidates ?? []).filter((candidate) =>
    validationFailures.every((failure) => !failure.includes(candidate.candidate_id)),
  );
  return {
    parsed,
    validationFailures,
    observation: {
      strategy,
      modelCalls: 1,
      uncachedInputTokens: Math.max(
        0,
        (response.usage?.promptTokens ?? 0) - (response.usage?.cachedInputTokens ?? 0),
      ),
      cachedInputTokens: response.usage?.cachedInputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      latencyMs: Date.now() - startedAt,
      extractionFailureRate: parsed.candidates?.length ? 0 : 1,
      canonicalizationFailureRate: 0,
      validMemoriesAdmitted: validCandidates.length,
      missedKnownFacts: Math.max(0, 3 - validCandidates.length),
      hallucinatedUnsupportedCandidates: validationFailures.filter((failure) =>
        failure.includes("quote_not_found"),
      ).length,
      evidenceValidationFailures: validationFailures.length,
    },
  };
}

async function main() {
  const root = repoRoot();
  const args = parseArgs(process.argv.slice(2));
  const api = await tsImport(
    path.join(root, "extensions/model-memory/src/benchmark/benchmark-runner.ts"),
    import.meta.url,
  );
  const sectionMapApi = await tsImport(
    path.join(root, "extensions/model-memory/src/ingestion/section-map-candidate-hints.ts"),
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
  const sourceAbsolutePath = path.resolve(root, args.sourcePath);
  const sourceText = await readFile(sourceAbsolutePath, "utf8");
  const sourceId = `source:${args.sourcePath}:${sha256(sourceText).slice(0, 16)}`;
  const sectionMap = sectionMapApi.buildSectionMapDocument({
    sourceId,
    sourcePath: args.sourcePath,
    text: sourceText,
  });
  const sections = sectionMap.sections.map((section) => ({
    id: section.sectionId,
    title: section.title,
    text: section.text,
    hash: section.sectionHash,
    spanId: section.spanId,
  }));
  const executor = shouldUseCodexAppServer(args.modelId)
    ? new CodexAppServerJsonExecutor({
        cwd: root,
        requestTimeoutMs: args.requestTimeoutMs,
        reasoningEffort: args.codexReasoningEffort,
        ...(args.serviceTier ? { serviceTier: args.serviceTier } : {}),
      })
    : new OpenAICompatibleLiveJsonExecutor({ requestTimeoutMs: args.requestTimeoutMs });
  const strategies = [
    {
      strategy: "direct_rigid_capture",
      dynamicTail: `Full source text follows. Use source_span_ids from section ids.\n\n${sections
        .map((section) => `[${section.id}] ${section.text}`)
        .join("\n\n")}`,
    },
    {
      strategy: "source_preserving_summary_then_rigid_capture",
      dynamicTail: `Create a source-preserving summary artifact first, then emit candidate hints. Original section windows follow.\n\n${sectionMapText(sections)}`,
    },
    {
      strategy: "section_map_candidate_hints",
      dynamicTail: `Use this section map plus excerpts to produce candidate hints. Do not infer beyond excerpts.\n\n${sectionMapText(sections)}`,
    },
  ];

  const artifacts = [];
  const observations = [];
  for (const strategyInput of strategies) {
    try {
      const result = await executeStrategy({
        executor,
        api,
        args,
        modelId: args.modelId,
        sourceId,
        sourceText,
        ...strategyInput,
      });
      artifacts.push({
        strategy: strategyInput.strategy,
        artifact: result.parsed,
        validationFailures: result.validationFailures,
      });
      observations.push(result.observation);
    } catch (error) {
      artifacts.push({
        strategy: strategyInput.strategy,
        error: error instanceof Error ? error.message : String(error),
        trace: error?.trace
          ? {
              failureClass: error.trace.failureClass,
              failureStage: error.trace.failureStage,
              httpStatus: error.trace.httpStatus,
              requestedModelId: error.trace.requestedModelId,
              provider: error.trace.provider,
              providerModel: error.trace.providerModel,
            }
          : error?.failureClass
            ? { failureClass: error.failureClass }
            : undefined,
      });
      observations.push({
        strategy: strategyInput.strategy,
        modelCalls: 1,
        uncachedInputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        extractionFailureRate: 1,
        canonicalizationFailureRate: 1,
        validMemoriesAdmitted: 0,
        missedKnownFacts: 3,
        hallucinatedUnsupportedCandidates: 0,
        evidenceValidationFailures: 1,
      });
    }
  }

  const report = api.buildLargeDocumentCompressionReport({
    sourceId,
    observations,
  });
  report.sourcePath = args.sourcePath;
  report.modelId = args.modelId;
  report.sourceHash = sha256(sourceText);
  report.sectionCount = sections.length;
  report.sectionMapStrategy = {
    strategy: "section_map_candidate_hints",
    sourceId,
    sourceHash: sectionMap.sourceHash,
    sectionIds: sectionMap.sections.map((section) => section.sectionId),
    rawContentPersisted: false,
    canonicalTruth: false,
  };
  report.speedControls = {
    api_reasoning_effort: args.apiReasoningEffort,
    codex_reasoning_effort: args.codexReasoningEffort,
    verbosity: args.verbosity,
    service_tier: args.serviceTier ?? null,
  };
  report.validationArtifacts = artifacts.map((entry) => ({
    strategy: entry.strategy,
    validationFailures: entry.validationFailures ?? ["model_call_failed"],
    candidateCount: entry.artifact?.candidates?.length ?? 0,
    sourceSpanCount: entry.artifact?.source_span_ids?.length ?? 0,
    quoteHashCount: entry.artifact?.quote_hashes?.length ?? 0,
    error: entry.error,
    trace: entry.trace,
  }));

  const outputDir = path.resolve(root, args.outputDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "large-doc-compression.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "source-preserving-artifacts.json"),
    `${JSON.stringify(artifacts, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        report: path.join(outputDir, "large-doc-compression.json"),
        artifacts: path.join(outputDir, "source-preserving-artifacts.json"),
      },
      null,
      2,
    ),
  );
  if (shouldUseCodexAppServer(args.modelId)) {
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
