#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_MODEL_ID =
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
  let modelId = DEFAULT_MODEL_ID;
  let requestSeed;
  let compareArtifacts = null;
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--output-root") {
      outputRoot = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === "--model-id") {
      modelId = argv[index + 1] ?? modelId;
      index += 1;
      continue;
    }
    if (current === "--file") {
      const file = argv[index + 1] ?? "";
      if (file) {
        files.push(file);
      }
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
    }
  }
  return { outputRoot, modelId, files, requestSeed, compareArtifacts };
}

async function fileDocuments(repoRoot, files) {
  return Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = path.resolve(repoRoot, relativePath);
      const text = await readFile(absolutePath, "utf8");
      return {
        id: relativePath,
        title: path.basename(relativePath),
        text,
        path: relativePath,
      };
    }),
  );
}

function renderMarkdown(report) {
  const lines = [
    "# MMV2 Document File-Pack Evaluation",
    "",
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
    `- Documents: ${report.summary.totalDocuments}`,
    `- Execution failures: ${report.summary.executionFailedDocuments}`,
    `- Canonical count: ${report.summary.canonicalCount}`,
    `- Retained count: ${report.summary.retainedCount}`,
    `- Realistic write count: ${report.summary.realisticWriteCount}`,
    `- Retained parents: ${report.summary.retainedParents}`,
    `- Rejected parents: ${report.summary.rejectedParents}`,
    `- Embedded children: ${report.summary.embeddedChildCount}`,
    `- Promoted children: ${report.summary.promotedChildCount}`,
    `- Blocked children: ${report.summary.blockedChildCount}`,
    "",
    "## Per Document",
    "",
  ];

  for (const document of report.documents) {
    lines.push(`### ${document.documentId}`);
    lines.push(`- Path: ${document.path}`);
    lines.push(`- Status: ${document.status}`);
    if (document.error) {
      lines.push(`- Error: ${document.error.name}: ${document.error.message}`);
      lines.push("");
      continue;
    }
    lines.push(
      `- Canonical/retained/realistic writes: ${document.canonicalCount}/${document.retainedCount}/${document.realisticWriteCount}`,
    );
    lines.push(
      `- Parent retention: retained=${document.compositePolicy.retainedParents}, rejected=${document.compositePolicy.rejectedParents}`,
    );
    lines.push(
      `- Child promotion: embedded=${document.compositePolicy.embeddedChildCount}, promoted=${document.compositePolicy.promotedChildCount}, blocked=${document.compositePolicy.blockedChildCount}`,
    );
    lines.push(
      `- Admission counts: ${
        Object.entries(document.admissionCounts)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(", ") || "none"
      }`,
    );
    lines.push(
      `- Reconciliation counts: ${
        Object.entries(document.reconciliationCounts)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(", ") || "none"
      }`,
    );
    lines.push(
      `- Realistic write dispositions: ${Object.entries(
        document.writeSimulation.summary.dispositionCounts,
      )
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ")}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

async function writeArtifacts({ outputRoot, report }) {
  const runDir = path.join(outputRoot, formatTimestampForPath(report.generatedAt));
  await mkdir(runDir, { recursive: true });

  const summaryJsonPath = path.join(runDir, "summary.json");
  const documentsJsonPath = path.join(runDir, "documents.json");
  const summaryMarkdownPath = path.join(runDir, "summary.md");

  await writeFile(summaryJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(documentsJsonPath, `${JSON.stringify(report.documents, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdownPath, `${renderMarkdown(report)}\n`, "utf8");

  return {
    runDir,
    summaryJsonPath,
    documentsJsonPath,
    summaryMarkdownPath,
  };
}

function stableJson(value) {
  return JSON.stringify(value ?? null, Object.keys(value ?? {}).toSorted());
}

function normalizeTraceKey(trace, index) {
  return `${trace.contractName}:${trace.contractVersion}:${index}`;
}

function compareTraceHashes(leftTraces, rightTraces) {
  const maxTraceCount = Math.max(leftTraces.length, rightTraces.length);
  return Array.from({ length: maxTraceCount }, (_, index) => {
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
}

function documentMetricSignature(document) {
  if (!document) {
    return null;
  }
  return {
    status: document.status,
    canonicalCount: document.canonicalCount,
    retainedCount: document.retainedCount,
    realisticWriteCount: document.realisticWriteCount,
    admissionCounts: document.admissionCounts,
    reconciliationCounts: document.reconciliationCounts,
    writeDispositionCounts: document.writeSimulation?.summary?.dispositionCounts,
    compositePolicy: document.compositePolicy,
    errorName: document.error?.name ?? null,
    errorContractName: document.error?.contractName ?? null,
    errorContractVersion: document.error?.contractVersion ?? null,
  };
}

function classifyFilePackDrift(input) {
  if (!input.leftDocument || !input.rightDocument) {
    return "artifact_shape_difference";
  }
  if (
    input.leftDocument.status === "execution_failed" ||
    input.rightDocument.status === "execution_failed"
  ) {
    return "json_boundary_or_execution_failure";
  }
  if (
    input.metricsMatched &&
    input.normalizedInputHashesMatched &&
    (!input.promptHashesMatched || !input.inputHashesMatched)
  ) {
    return "comparator_strictness_issue";
  }
  if (!input.promptHashesMatched || !input.inputHashesMatched) {
    return "deterministic_input_drift";
  }
  if (!input.metricsMatched) {
    return input.modelAndSeedMatched ? "real_semantic_regression" : "provider_output_variance";
  }
  return "stable_match";
}

export async function compareMmV2DocumentFilePackArtifacts(input) {
  const left = JSON.parse(await readFile(input.leftArtifactPath, "utf8"));
  const right = JSON.parse(await readFile(input.rightArtifactPath, "utf8"));
  const leftByDocument = new Map(left.documents.map((document) => [document.documentId, document]));
  const rightByDocument = new Map(
    right.documents.map((document) => [document.documentId, document]),
  );
  const documentIds = Array.from(
    new Set([...leftByDocument.keys(), ...rightByDocument.keys()]),
  ).toSorted((left, right) => left.localeCompare(right));
  const modelMatched = stableJson(left.modelMetadata) === stableJson(right.modelMetadata);
  const requestSeedMatched = left.requestSeed === right.requestSeed;
  const modelAndSeedMatched = modelMatched && requestSeedMatched;

  const documents = documentIds.map((documentId) => {
    const leftDocument = leftByDocument.get(documentId) ?? null;
    const rightDocument = rightByDocument.get(documentId) ?? null;
    const traceComparisons = compareTraceHashes(
      leftDocument?.modelCallTraces ?? [],
      rightDocument?.modelCallTraces ?? [],
    );
    const promptHashesMatched = traceComparisons.every((trace) => trace.promptHashMatch);
    const inputHashesMatched = traceComparisons.every((trace) => trace.inputHashMatch);
    const normalizedInputHashesMatched = traceComparisons.every(
      (trace) => trace.normalizedInputHashMatch,
    );
    const leftMetricSignature = documentMetricSignature(leftDocument);
    const rightMetricSignature = documentMetricSignature(rightDocument);
    const metricsMatched = stableJson(leftMetricSignature) === stableJson(rightMetricSignature);
    const statusMatched = leftDocument?.status === rightDocument?.status;

    return {
      documentId,
      statusMatched,
      leftStatus: leftDocument?.status ?? null,
      rightStatus: rightDocument?.status ?? null,
      metricsMatched,
      promptHashesMatched,
      inputHashesMatched,
      normalizedInputHashesMatched,
      driftClass: classifyFilePackDrift({
        leftDocument,
        rightDocument,
        metricsMatched,
        promptHashesMatched,
        inputHashesMatched,
        normalizedInputHashesMatched,
        modelAndSeedMatched,
      }),
      leftMetricSignature,
      rightMetricSignature,
      traceComparisons,
    };
  });

  const driftCounts = documents.reduce((counts, document) => {
    counts[document.driftClass] = (counts[document.driftClass] ?? 0) + 1;
    return counts;
  }, {});

  return {
    leftArtifactPath: input.leftArtifactPath,
    rightArtifactPath: input.rightArtifactPath,
    leftSummary: left.summary,
    rightSummary: right.summary,
    summaryMatched: stableJson(left.summary) === stableJson(right.summary),
    modelMatched,
    requestSeedMatched,
    documents,
    driftCounts,
    driftedDocuments: documents.filter((document) => document.driftClass !== "stable_match"),
  };
}

export async function runMmV2DocumentFilePackCli(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const args = options.args ?? parseArgs(process.argv.slice(2));
  if (args.compareArtifacts) {
    return {
      comparison: await compareMmV2DocumentFilePackArtifacts({
        leftArtifactPath: args.compareArtifacts.left,
        rightArtifactPath: args.compareArtifacts.right,
      }),
      artifacts: null,
      report: null,
    };
  }
  if (args.files.length === 0) {
    throw new Error("At least one --file path is required.");
  }

  const mmv2Module = await tsImport("../extensions/model-memory/src/mmv2/index.ts", {
    parentURL: import.meta.url,
  });
  const codexExecutorModule = shouldUseCodexAppServer(args.modelId)
    ? await tsImport("../extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts", {
        parentURL: import.meta.url,
      })
    : null;
  const executor =
    options.executor ??
    (shouldUseCodexAppServer(args.modelId)
      ? new codexExecutorModule.CodexAppServerJsonExecutor({
          requestTimeoutMs: options.requestTimeoutMs,
        })
      : new (
          options.liveExecutorModule ??
          (await tsImport("../src/agents/model-memory.live-json-executor.ts", {
            parentURL: import.meta.url,
          }))
        ).OpenAICompatibleLiveJsonExecutor({
          requestTimeoutMs: options.requestTimeoutMs,
          requestSeed: options.requestSeed ?? args.requestSeed,
        }));

  const documents = await fileDocuments(repoRoot, args.files);
  const runResult = await mmv2Module.runMmV2DocumentFilePack({
    documents,
    modelId: args.modelId,
    executor,
  });

  const report = {
    ...runResult,
    requestSeed: options.requestSeed ?? args.requestSeed ?? null,
    commitHash: readGitHead(repoRoot),
    command: {
      cwd: repoRoot,
      argv: options.commandArgv ?? [
        "node",
        "scripts/run-mmv2-document-file-pack.mjs",
        ...process.argv.slice(2),
      ],
    },
  };

  const outputRoot =
    args.outputRoot ??
    options.outputRoot ??
    path.join(repoRoot, ".artifacts/model-memory/mmv2/file-pack");
  const artifacts = await writeArtifacts({ outputRoot, report });

  return { report, artifacts };
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.compareArtifacts) {
    const comparison = await compareMmV2DocumentFilePackArtifacts({
      leftArtifactPath: parsedArgs.compareArtifacts.left,
      rightArtifactPath: parsedArgs.compareArtifacts.right,
    });
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return;
  }
  const result = await runMmV2DocumentFilePackCli({ args: parsedArgs });
  process.stdout.write(
    [
      `MMV2 file-pack: ${result.report.summary.totalDocuments} documents`,
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
