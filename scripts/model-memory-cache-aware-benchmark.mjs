#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main() {
  const root = repoRoot();
  const api = await tsImport(
    path.join(root, "extensions/model-memory/src/benchmark/benchmark-runner.ts"),
    import.meta.url,
  );
  const plan = api.buildCacheAwarePromptPlan({
    contractName: "extraction",
    contractVersion: "v1",
    promptVersion: "pass6-fixture-v1",
    staticPrefix: "Extract MMV2 candidates with strict JSON schema. Do not store raw prompts.",
    schema: { type: "object", properties: { candidates: { type: "array" } } },
    dynamicTail: "fixture source hash only",
  });
  const observations = [
    {
      caseId: "deterministic-routing-bypass",
      caseKind: "deterministic_routing_bypass",
      runIndex: 0,
      modelId: api.DEFAULT_CACHE_AWARE_MINI_MODEL_ID,
      contractName: "routing",
      contractVersion: "v1",
      promptVersion: "pass6-fixture-v1",
      staticPrefixHash: plan.staticPrefixHash,
      schemaHash: plan.schemaHash,
      promptCacheKey: plan.promptCacheKey,
      latencyMs: 420,
      promptTokenCount: 600,
      cachedInputTokenCount: 500,
      outputTokenCount: 30,
      schemaAdherent: true,
      emptyResponse: false,
      repairAttempted: false,
      repairSucceeded: false,
      validCandidateCount: 1,
      invalidCandidateCount: 0,
      falsePositiveCount: 0,
      missedDurableFactCount: 0,
    },
    {
      caseId: "durable-project-fact",
      caseKind: "durable_project_fact_extraction",
      runIndex: 0,
      modelId: api.DEFAULT_CACHE_AWARE_MINI_MODEL_ID,
      contractName: "extraction",
      contractVersion: "v1",
      promptVersion: "pass6-fixture-v1",
      staticPrefixHash: plan.staticPrefixHash,
      schemaHash: plan.schemaHash,
      promptCacheKey: plan.promptCacheKey,
      latencyMs: 980,
      promptTokenCount: 1200,
      cachedInputTokenCount: 900,
      outputTokenCount: 120,
      schemaAdherent: true,
      emptyResponse: false,
      repairAttempted: false,
      repairSucceeded: false,
      validCandidateCount: 2,
      invalidCandidateCount: 0,
      falsePositiveCount: 0,
      missedDurableFactCount: 0,
    },
    {
      caseId: "durable-project-fact",
      caseKind: "durable_project_fact_extraction",
      runIndex: 0,
      modelId: api.DEFAULT_CACHE_AWARE_NANO_MODEL_ID,
      contractName: "extraction",
      contractVersion: "v1",
      promptVersion: "pass6-fixture-v1",
      staticPrefixHash: plan.staticPrefixHash,
      schemaHash: plan.schemaHash,
      promptCacheKey: plan.promptCacheKey,
      latencyMs: 720,
      promptTokenCount: 1200,
      cachedInputTokenCount: 450,
      outputTokenCount: 90,
      schemaAdherent: true,
      emptyResponse: false,
      repairAttempted: true,
      repairSucceeded: true,
      validCandidateCount: 1,
      invalidCandidateCount: 1,
      falsePositiveCount: 0,
      missedDurableFactCount: 1,
    },
  ];
  const benchmark = api.buildCacheAwareBenchmarkReport({
    observations,
    generatedAt: new Date("2026-04-22T00:00:00.000Z"),
  });
  const compression = api.buildLargeDocumentCompressionReport({
    sourceId: "docs/projects/model-memory/DECISIONS.md",
    generatedAt: new Date("2026-04-22T00:00:00.000Z"),
    observations: [
      {
        strategy: "direct_rigid_capture",
        modelCalls: 6,
        uncachedInputTokens: 9000,
        cachedInputTokens: 3200,
        outputTokens: 1800,
        latencyMs: 6800,
        extractionFailureRate: 0.15,
        canonicalizationFailureRate: 0.05,
        validMemoriesAdmitted: 14,
        missedKnownFacts: 2,
        hallucinatedUnsupportedCandidates: 0,
        evidenceValidationFailures: 0,
      },
      {
        strategy: "source_preserving_summary_then_rigid_capture",
        modelCalls: 3,
        uncachedInputTokens: 3200,
        cachedInputTokens: 1400,
        outputTokens: 900,
        latencyMs: 3100,
        extractionFailureRate: 0,
        canonicalizationFailureRate: 0,
        validMemoriesAdmitted: 14,
        missedKnownFacts: 0,
        hallucinatedUnsupportedCandidates: 0,
        evidenceValidationFailures: 0,
      },
      {
        strategy: "section_map_candidate_hints",
        modelCalls: 3,
        uncachedInputTokens: 4200,
        cachedInputTokens: 1200,
        outputTokens: 800,
        latencyMs: 3300,
        extractionFailureRate: 0,
        canonicalizationFailureRate: 0,
        validMemoriesAdmitted: 13,
        missedKnownFacts: 1,
        hallucinatedUnsupportedCandidates: 0,
        evidenceValidationFailures: 0,
      },
    ],
  });
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/pass6-cache-aware-benchmark/2026-04-22-pass6",
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "benchmark-report.json"),
    `${JSON.stringify(benchmark, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "benchmark-report.md"),
    `${api.renderCacheAwareBenchmarkMarkdown(benchmark)}\n`,
  );
  await writeFile(
    path.join(outputDir, "large-doc-compression.json"),
    `${JSON.stringify(compression, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        benchmarkReport: path.join(outputDir, "benchmark-report.json"),
        benchmarkMarkdown: path.join(outputDir, "benchmark-report.md"),
        largeDocCompression: path.join(outputDir, "large-doc-compression.json"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
