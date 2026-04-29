#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/phase2-candidate-review-validation";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const root = repoRoot();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, timestampId());
  await mkdir(outputDir, { recursive: true });

  const { buildPhase2CandidateReviewGoldenCorpus, buildPassingGoldenCorpusProposalFixtures } =
    await tsImport(
      path.join(
        root,
        "extensions/model-memory/src/runtime/phase2-candidate-review-golden-corpus.ts",
      ),
      import.meta.url,
    );
  const { renderCandidateReviewValidationMarkdown, validateCandidateReviewGoldenCorpus } =
    await tsImport(
      path.join(root, "extensions/model-memory/src/runtime/phase2-candidate-review-validation.ts"),
      import.meta.url,
    );

  const cases = buildPhase2CandidateReviewGoldenCorpus();
  let proposalsByCaseId = buildPassingGoldenCorpusProposalFixtures();
  let liveModelReport = null;

  if (hasFlag("--live-model")) {
    const { reviewEpisodeForCandidates } = await tsImport(
      path.join(
        root,
        "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
      ),
      import.meta.url,
    );
    const { OpenAICompatibleLiveJsonExecutor } = await tsImport(
      path.join(root, "src/agents/model-memory.live-json-executor.ts"),
      import.meta.url,
    );
    const modelId =
      readArg("--model") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL ??
      "openai-codex/gpt-5.4";
    const reasoningEffort =
      readArg("--reasoning-effort") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_REASONING_EFFORT ??
      "high";
    const verbosity =
      readArg("--verbosity") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_VERBOSITY ??
      "medium";
    const timeoutMs = Number.parseInt(
      readArg("--timeout-ms") ??
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_TIMEOUT_MS ??
        "180000",
      10,
    );
    const maxOutputTokens = Number.parseInt(
      readArg("--max-output-tokens") ??
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS ??
        "6000",
      10,
    );
    proposalsByCaseId = {};
    const routeReports = [];
    for (const testCase of cases) {
      const review = await reviewEpisodeForCandidates(testCase.packet, {
        enabled: true,
        executor: new OpenAICompatibleLiveJsonExecutor({ requestTimeoutMs: timeoutMs }),
        modelId,
        reasoningEffort,
        verbosity,
        maxOutputTokens,
      });
      proposalsByCaseId[testCase.caseId] = review.proposals;
      routeReports.push({
        caseId: testCase.caseId,
        report: review.report,
      });
    }
    liveModelReport = {
      schemaVersion: "candidate_review_validation_live_model_report.v1",
      modelId,
      reasoningEffort,
      verbosity,
      timeoutMs,
      maxOutputTokens,
      routeReports,
    };
  }

  const report = validateCandidateReviewGoldenCorpus({
    cases,
    proposalsByCaseId,
  });
  const payload = {
    schemaVersion: "candidate_review_validation_script_result.v1",
    generatedAt: new Date().toISOString(),
    mode: hasFlag("--live-model") ? "live_model" : "fixture",
    noGatewayRebuildRequired: true,
    report,
    proposalsByCaseId,
    liveModelReport,
  };
  const jsonPath = path.join(outputDir, "candidate-review-validation.json");
  const markdownPath = path.join(outputDir, "candidate-review-validation.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(markdownPath, renderCandidateReviewValidationMarkdown(report));

  console.log(
    JSON.stringify(
      {
        schemaVersion: "candidate_review_validation_script_summary.v1",
        jsonPath,
        markdownPath,
        mode: payload.mode,
        noGatewayRebuildRequired: true,
        passCount: report.passCount,
        failCount: report.failCount,
        aggregateRecall: report.aggregateRecall,
        aggregatePrecision: report.aggregatePrecision,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
