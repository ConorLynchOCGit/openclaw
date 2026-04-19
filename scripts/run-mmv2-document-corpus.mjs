#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

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
  }
  return { outputRoot, caseIds };
}

export function renderMmV2DocumentCorpusMarkdown(report) {
  const lines = [
    "# MMV2 Document Corpus Evaluation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Commit: ${report.commitHash}`,
    `- Command: \`${report.command.argv.join(" ")}\``,
    `- Cases: ${report.summary.totalCases}`,
    `- Passed: ${report.summary.passedCases}`,
    `- Failed: ${report.summary.failedCases}`,
    `- Comparison failures: ${report.summary.comparisonFailedCases}`,
    `- Execution failures: ${report.summary.executionFailedCases}`,
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
    lines.push(`- Seeded neighbors: ${result.seededNeighborCount}`);
    lines.push(
      `- Failed phases: ${result.failedPhases.length > 0 ? result.failedPhases.join(", ") : "none"}`,
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

  await writeFile(summaryJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(caseResultsJsonPath, `${JSON.stringify(report.results, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdownPath, `${renderMmV2DocumentCorpusMarkdown(report)}\n`, "utf8");

  return {
    runDir,
    summaryJsonPath,
    caseResultsJsonPath,
    summaryMarkdownPath,
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

  const runResult = await moduleExports.runMmV2ProofCorpus(selectedCases);
  const report = {
    generatedAt: runResult.generatedAt,
    commitHash: readGitHead(repoRoot),
    command: {
      cwd: repoRoot,
      argv: options.commandArgv ?? [
        "node",
        "scripts/run-mmv2-document-corpus.mjs",
        ...process.argv.slice(2),
      ],
    },
    summary: runResult.summary,
    results: runResult.results,
  };
  const outputRoot =
    parsedArgs.outputRoot ??
    options.outputRoot ??
    path.join(repoRoot, ".artifacts/model-memory/mmv2");
  const artifacts = await writeMmV2DocumentCorpusArtifacts({
    outputRoot,
    report,
  });

  return {
    report,
    artifacts,
  };
}

async function main() {
  const result = await runMmV2DocumentCorpus();
  process.stdout.write(
    [
      `MMV2 document corpus: ${result.report.summary.passedCases}/${result.report.summary.totalCases} passed`,
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
