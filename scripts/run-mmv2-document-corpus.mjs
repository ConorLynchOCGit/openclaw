#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_REAL_MODEL_ID =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";

function providerFromModelId(modelId) {
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  const slashIndex = trimmed.indexOf("/");
  return slashIndex === -1 ? null : trimmed.slice(0, slashIndex);
}

function shouldUseCodexAppServer(modelId) {
  const provider = providerFromModelId(modelId);
  return provider === "codex" || provider === "openai-codex";
}

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function formatTimestampForPath(isoString) {
  return isoString.replaceAll(":", "").replaceAll(".", "-");
}

function readGitHead(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function parseArgs(argv) {
  let outputRoot = null;
  let mode = "scripted";
  let modelId = DEFAULT_REAL_MODEL_ID;
  let requestSeed;
  let compareArtifacts = null;
  const caseIds = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--output-root") {
      outputRoot = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === "--case") {
      const caseId = argv[index + 1] ?? "";
      if (caseId) {
        caseIds.push(caseId);
      }
      index += 1;
      continue;
    }
    if (current === "--mode") {
      mode = argv[index + 1] ?? mode;
      index += 1;
      continue;
    }
    if (current === "--model-id") {
      modelId = argv[index + 1] ?? modelId;
      index += 1;
      continue;
    }
    if (current === "--request-seed") {
      const next = argv[index + 1] ?? "";
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed)) {
        requestSeed = parsed;
      }
      index += 1;
      continue;
    }
    if (current === "--compare-artifacts") {
      const left = argv[index + 1] ?? null;
      const right = argv[index + 2] ?? null;
      if (left && right) {
        compareArtifacts = { left, right };
      }
      index += 2;
      continue;
    }
  }
  return { outputRoot, caseIds, mode, modelId, requestSeed, compareArtifacts };
}

function normalizeTraceKey(trace, index) {
  return `${trace.contractName}:${trace.contractVersion}:${index}`;
}

export async function compareMmV2DocumentCorpusArtifacts(input) {
  const left = JSON.parse(await readFile(input.leftArtifactPath, "utf8"));
  const right = JSON.parse(await readFile(input.rightArtifactPath, "utf8"));
  const leftByCase = new Map(left.results.map((result) => [result.caseId, result]));
  const rightByCase = new Map(right.results.map((result) => [result.caseId, result]));
  const caseIds = Array.from(new Set([...leftByCase.keys(), ...rightByCase.keys()])).toSorted(
    (left, right) => left.localeCompare(right),
  );

  const cases = caseIds.map((caseId) => {
    const leftResult = leftByCase.get(caseId) ?? null;
    const rightResult = rightByCase.get(caseId) ?? null;
    const leftFailedChecks = leftResult?.failedChecks ?? [];
    const rightFailedChecks = rightResult?.failedChecks ?? [];
    const leftTraces = leftResult?.modelCallTraces ?? [];
    const rightTraces = rightResult?.modelCallTraces ?? [];
    const maxTraceCount = Math.max(leftTraces.length, rightTraces.length);
    const traceComparisons = Array.from({ length: maxTraceCount }, (_, index) => {
      const leftTrace = leftTraces[index] ?? null;
      const rightTrace = rightTraces[index] ?? null;
      return {
        key:
          (leftTrace && normalizeTraceKey(leftTrace, index)) ??
          (rightTrace && normalizeTraceKey(rightTrace, index)) ??
          `missing:${index}`,
        promptHashMatch:
          leftTrace?.promptHash !== undefined &&
          rightTrace?.promptHash !== undefined &&
          leftTrace.promptHash === rightTrace.promptHash,
        inputHashMatch:
          leftTrace?.inputHash !== undefined &&
          rightTrace?.inputHash !== undefined &&
          leftTrace.inputHash === rightTrace.inputHash,
        normalizedInputHashMatch:
          leftTrace?.normalization?.normalizedInputHash !== undefined &&
          rightTrace?.normalization?.normalizedInputHash !== undefined &&
          leftTrace.normalization.normalizedInputHash ===
            rightTrace.normalization.normalizedInputHash,
        leftPromptHash: leftTrace?.promptHash ?? null,
        rightPromptHash: rightTrace?.promptHash ?? null,
        leftInputHash: leftTrace?.inputHash ?? null,
        rightInputHash: rightTrace?.inputHash ?? null,
        leftNormalizedInputHash: leftTrace?.normalization?.normalizedInputHash ?? null,
        rightNormalizedInputHash: rightTrace?.normalization?.normalizedInputHash ?? null,
      };
    });
    return {
      caseId,
      statusMatched: leftResult?.status === rightResult?.status,
      leftStatus: leftResult?.status ?? null,
      rightStatus: rightResult?.status ?? null,
      failedChecksMatched: JSON.stringify(leftFailedChecks) === JSON.stringify(rightFailedChecks),
      leftFailedChecks,
      rightFailedChecks,
      promptHashesMatched: traceComparisons.every((trace) => trace.promptHashMatch),
      inputHashesMatched: traceComparisons.every((trace) => trace.inputHashMatch),
      normalizedInputHashesMatched: traceComparisons.every(
        (trace) => trace.normalizedInputHashMatch,
      ),
      traceComparisons,
    };
  });

  return {
    leftArtifactPath: input.leftArtifactPath,
    rightArtifactPath: input.rightArtifactPath,
    leftSummary: left.summary,
    rightSummary: right.summary,
    failureSetsMatched:
      JSON.stringify(
        left.results
          .filter((result) => !result.pass)
          .map((result) => result.caseId)
          .toSorted(),
      ) ===
      JSON.stringify(
        right.results
          .filter((result) => !result.pass)
          .map((result) => result.caseId)
          .toSorted(),
      ),
    cases,
    driftedCases: cases.filter(
      (entry) =>
        !entry.statusMatched ||
        !entry.failedChecksMatched ||
        !entry.promptHashesMatched ||
        !entry.inputHashesMatched ||
        !entry.normalizedInputHashesMatched,
    ),
  };
}

export function renderMmV2DocumentCorpusMarkdown(report) {
  const lines = [
    "# MMV2 Document Corpus Evaluation",
    "",
    `- Run mode: ${report.runMode}`,
    `- Requested model: ${report.modelMetadata.requestedModelId}`,
    `- Resolved models: ${
      report.modelMetadata.resolvedModelIds.length > 0
        ? report.modelMetadata.resolvedModelIds.join(", ")
        : "none recorded"
    }`,
    `- Generated at: ${report.generatedAt}`,
    `- Request seed: ${report.requestSeed ?? "none"}`,
    `- Commit: ${report.commitHash}`,
    `- Command: \`${report.command.argv.join(" ")}\``,
    `- Cases: ${report.summary.totalCases}`,
    `- Passed: ${report.summary.passedCases}`,
    `- Failed: ${report.summary.failedCases}`,
    `- Comparison failures: ${report.summary.comparisonFailedCases}`,
    `- Execution failures: ${report.summary.executionFailedCases}`,
    `- Phase correctness score: ${report.summary.scores.phaseCorrectness.passed}/${report.summary.scores.phaseCorrectness.total} (${report.summary.scores.phaseCorrectness.ratio.toFixed(3)})`,
    `- Write-policy realism score: ${report.summary.scores.writePolicyRealism.passed}/${report.summary.scores.writePolicyRealism.total} (${report.summary.scores.writePolicyRealism.ratio.toFixed(3)})`,
    `- Write-policy overstatement cases: ${report.summary.writePolicySummary.overstatementCases}`,
    "",
    "## Phase Summary",
    "",
    "| Phase | Passed | Failed | Mismatches |",
    "| --- | ---: | ---: | ---: |",
  ];

  for (const [phase, summary] of Object.entries(report.summary.phaseSummary)) {
    lines.push(`| ${phase} | ${summary.passed} | ${summary.failed} | ${summary.mismatches} |`);
  }

  lines.push("", "## Case Results", "");

  for (const result of report.results) {
    lines.push(`### ${result.caseId}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Run mode: ${result.runMode}`);
    lines.push(
      `- Phase correctness: ${result.scores.phaseCorrectness.passed}/${result.scores.phaseCorrectness.total} (${result.scores.phaseCorrectness.ratio.toFixed(3)})`,
    );
    lines.push(
      `- Write-policy realism: ${result.scores.writePolicyRealism.passed}/${result.scores.writePolicyRealism.total} (${result.scores.writePolicyRealism.ratio.toFixed(3)})`,
    );
    lines.push(`- Seeded neighbors: ${result.seededNeighborCount}`);
    lines.push(
      `- Failed phases: ${result.failedPhases.length > 0 ? result.failedPhases.join(", ") : "none"}`,
    );
    lines.push(
      `- Failed checks: ${result.failedChecks.length > 0 ? result.failedChecks.join(", ") : "none"}`,
    );
    lines.push(
      `- Simulated writes: realistic=${result.writeSimulation.summary.realisticDurableMemoryCount}, shadow=${result.writeSimulation.summary.shadowDurableMemoryCount}, overstatement=${result.writeSimulation.summary.overstatementCount}`,
    );
    if (result.error) {
      lines.push(`- Error: ${result.error.message}`);
    }
    for (const phase of result.phaseResults.filter((phaseResult) => !phaseResult.pass)) {
      lines.push(`- Phase ${phase.phase}: ${phase.mismatches.length} mismatch(es)`);
      for (const mismatch of phase.mismatches) {
        lines.push(`  - ${mismatch.code}: ${mismatch.message}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeMmV2DocumentCorpusArtifacts({ outputRoot, report }) {
  const runDir = path.join(outputRoot, formatTimestampForPath(report.generatedAt));
  await mkdir(runDir, { recursive: true });

  const summaryJsonPath = path.join(runDir, "summary.json");
  const caseResultsJsonPath = path.join(runDir, "case-results.json");
  const summaryMarkdownPath = path.join(runDir, "summary.md");
  const adjudicationJsonPath = path.join(runDir, "adjudication-template.json");
  const adjudicationMarkdownPath = path.join(runDir, "adjudication-template.md");

  await writeFile(summaryJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(caseResultsJsonPath, `${JSON.stringify(report.results, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdownPath, `${renderMmV2DocumentCorpusMarkdown(report)}\n`, "utf8");
  await writeFile(
    adjudicationJsonPath,
    `${JSON.stringify(report.adjudicationEntries, null, 2)}\n`,
    "utf8",
  );
  await writeFile(adjudicationMarkdownPath, `${report.adjudicationMarkdown}\n`, "utf8");

  return {
    runDir,
    summaryJsonPath,
    caseResultsJsonPath,
    summaryMarkdownPath,
    adjudicationJsonPath,
    adjudicationMarkdownPath,
  };
}

export async function runMmV2DocumentCorpus(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const parsedArgs = options.args ?? parseArgs(process.argv.slice(2));
  const moduleExports = await tsImport("../extensions/model-memory/src/mmv2/index.ts", {
    parentURL: import.meta.url,
  });
  const allCases = moduleExports.MMV2_DOCUMENT_PROOF_CASES;
  const selectedCases =
    parsedArgs.caseIds.length === 0
      ? allCases
      : allCases.filter((proofCase) => parsedArgs.caseIds.includes(proofCase.id));
  if (selectedCases.length === 0) {
    throw new Error("No MMV2 proof cases matched the requested filters.");
  }

  let runResult;
  if (parsedArgs.mode === "real-model") {
    const executor =
      options.executor ??
      (shouldUseCodexAppServer(parsedArgs.modelId)
        ? new moduleExports.CodexAppServerJsonExecutor({
            requestTimeoutMs: options.requestTimeoutMs,
          })
        : new (
            options.liveExecutorModule ??
            (await tsImport("../src/agents/model-memory.live-json-executor.ts", {
              parentURL: import.meta.url,
            }))
          ).OpenAICompatibleLiveJsonExecutor({
            requestTimeoutMs: options.requestTimeoutMs,
            requestSeed: options.requestSeed ?? parsedArgs.requestSeed,
          }));
    runResult = await moduleExports.runMmV2ProofCorpusReal({
      proofCases: selectedCases,
      modelId: parsedArgs.modelId,
      executor,
    });
  } else {
    runResult = await moduleExports.runMmV2ProofCorpus(selectedCases);
  }
  const reportBase = {
    generatedAt: runResult.generatedAt,
    runMode: runResult.runMode,
    modelMetadata: runResult.modelMetadata,
    summary: runResult.summary,
    results: runResult.results,
  };
  const adjudicationEntries = moduleExports.buildAdjudicationEntries(reportBase);
  const report = {
    ...reportBase,
    requestSeed: options.requestSeed ?? parsedArgs.requestSeed ?? null,
    commitHash: readGitHead(repoRoot),
    command: {
      cwd: repoRoot,
      argv: options.commandArgv ?? [
        "node",
        "scripts/run-mmv2-document-corpus.mjs",
        ...process.argv.slice(2),
      ],
    },
    adjudicationEntries,
    adjudicationMarkdown: moduleExports.renderAdjudicationMarkdown(adjudicationEntries),
  };
  const outputRoot =
    parsedArgs.outputRoot ??
    options.outputRoot ??
    path.join(repoRoot, ".artifacts/model-memory/mmv2", parsedArgs.mode);
  const artifacts = await writeMmV2DocumentCorpusArtifacts({
    outputRoot,
    report,
  });

  return {
    report,
    artifacts,
    executionFailureCount: report.results.filter((result) => result.status === "execution_failed")
      .length,
  };
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.compareArtifacts) {
    const comparison = await compareMmV2DocumentCorpusArtifacts({
      leftArtifactPath: parsedArgs.compareArtifacts.left,
      rightArtifactPath: parsedArgs.compareArtifacts.right,
    });
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return;
  }
  const result = await runMmV2DocumentCorpus({ args: parsedArgs });
  if (result.executionFailureCount > 0) {
    throw new Error(
      `MMV2 document corpus encountered ${result.executionFailureCount} execution failure(s). See ${result.artifacts.summaryJsonPath}`,
    );
  }
  process.stdout.write(
    [
      `MMV2 document corpus (${result.report.runMode}): ${result.report.summary.passedCases}/${result.report.summary.totalCases} passed`,
      `artifacts: ${result.artifacts.runDir}`,
    ].join("\n") + "\n",
  );
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
