#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_MODEL_ID =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";

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
  let reuseMmV2Artifact = null;
  let reuseV1Artifact = null;
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
    if (current === "--reuse-mmv2-artifact") {
      reuseMmV2Artifact = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (current === "--reuse-v1-artifact") {
      reuseV1Artifact = argv[index + 1] ?? null;
      index += 1;
    }
  }
  return { outputRoot, modelId, files, requestSeed, reuseMmV2Artifact, reuseV1Artifact };
}

async function fileDocumentsToSplitDocuments(repoRoot, files) {
  return Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = path.resolve(repoRoot, relativePath);
      const text = await readFile(absolutePath, "utf8");
      return {
        id: relativePath,
        title: path.basename(relativePath),
        text,
        origin: {
          type: "file",
          path: relativePath,
        },
      };
    }),
  );
}

async function loadArtifact(reportPath) {
  return JSON.parse(await readFile(reportPath, "utf8"));
}

function extractArtifactDocuments(artifact) {
  if (Array.isArray(artifact)) {
    return artifact;
  }
  if (artifact && typeof artifact === "object" && Array.isArray(artifact.documents)) {
    return artifact.documents;
  }
  throw new Error("Artifact does not contain a reusable documents collection.");
}

function buildExistingMmV2ByDocumentId(report, documents) {
  const artifactDocuments = extractArtifactDocuments(report);
  const artifactIds = new Set(artifactDocuments.map((document) => document.documentId));
  const requestedIds = new Set(documents.map((document) => document.id));
  if (artifactIds.size !== requestedIds.size) {
    throw new Error("MMV2 artifact document set does not match the requested split document set.");
  }
  for (const document of documents) {
    if (!artifactIds.has(document.id)) {
      throw new Error(`MMV2 artifact is missing requested document ${document.id}.`);
    }
  }

  return Object.fromEntries(
    artifactDocuments.map((document) => {
      if (document.status !== "pass" || !document.run) {
        throw new Error(
          `MMV2 artifact document ${document.documentId} is not reusable because it did not complete with a stored run.`,
        );
      }
      return [
        document.documentId,
        {
          documentId: document.documentId,
          title: document.title,
          origin: document.origin,
          modelMetadata: document.modelMetadata,
          run: document.run,
          status: document.status,
        },
      ];
    }),
  );
}

function buildExistingV1ByDocumentId(report, documents) {
  const artifactDocuments = extractArtifactDocuments(report);
  const artifactIds = new Set(artifactDocuments.map((document) => document.documentId));
  const requestedIds = new Set(documents.map((document) => document.id));
  if (artifactIds.size !== requestedIds.size) {
    throw new Error("v1 artifact document set does not match the requested split document set.");
  }
  for (const document of documents) {
    if (!artifactIds.has(document.id)) {
      throw new Error(`v1 artifact is missing requested document ${document.id}.`);
    }
  }

  return Object.fromEntries(
    artifactDocuments.map((document) => {
      if (document.status !== "pass" || !document.v1 || !Array.isArray(document.v1.items)) {
        throw new Error(
          `v1 artifact document ${document.documentId} is not reusable because it does not contain a completed v1 payload.`,
        );
      }
      return [
        document.documentId,
        {
          documentId: document.documentId,
          title: document.title,
          origin: document.origin,
          modelMetadata: document.modelMetadata,
          status: document.status,
          v1: document.v1,
        },
      ];
    }),
  );
}

function renderMarkdown(report) {
  const lines = [
    "# Model Memory Split Evaluation",
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
    `- Execution-failed documents: ${report.summary.executionFailedDocuments}`,
    "",
    "## Fair Comparison",
    "",
    `- v1 fair units: ${report.fairComparisonSummary.totalV1Units}`,
    `- MMV2 retained units: ${report.fairComparisonSummary.totalMmV2RetainedUnits}`,
    `- Direct shared units: ${report.fairComparisonSummary.totalDirectSharedUnits}`,
    `- Covered by parent composite: ${report.fairComparisonSummary.totalCoveredByParentCompositeUnits}`,
    `- True v1-only units: ${report.fairComparisonSummary.totalTrueV1OnlyUnits}`,
    `- True MMV2-only units: ${report.fairComparisonSummary.totalTrueMmV2OnlyUnits}`,
    `- Semantic coverage ratio: ${report.fairComparisonSummary.semanticCoverageRatio.toFixed(3)}`,
    `- Average semantic coverage ratio: ${report.fairComparisonSummary.averageSemanticCoverageRatio.toFixed(3)}`,
    `- Structure fidelity wins: ${report.fairComparisonSummary.totalStructureFidelityWins}`,
    `- Raw capture aggressiveness delta (v1 captured - MMV2 retained): ${report.fairComparisonSummary.rawCaptureAggressivenessDelta}`,
    "",
    "## Raw Diagnostic Comparison",
    "",
    `- v1 captured: ${report.summary.totalV1Captured}`,
    `- v1 write-like: ${report.summary.totalV1WriteLike}`,
    `- MMV2 canonical: ${report.summary.totalMmV2Canonical}`,
    `- MMV2 retained: ${report.summary.totalMmV2Retained}`,
    `- MMV2 realistic writes: ${report.summary.totalMmV2RealisticWrites}`,
    `- Shared semantic items: ${report.summary.totalShared}`,
    `- v1-only items: ${report.summary.totalV1Only}`,
    `- MMV2-only items: ${report.summary.totalMmV2Only}`,
    `- Average overlap ratio: ${report.summary.averageOverlapRatio.toFixed(3)}`,
    `- Artifact reuse: MMV2=${report.artifactReuse?.usedMmV2 ? (report.artifactReuse.mmv2ArtifactPath ?? "yes") : "none"}, v1=${report.artifactReuse?.usedV1 ? (report.artifactReuse.v1ArtifactPath ?? "yes") : "none"}`,
    "",
    "## Per Document",
    "",
  ];

  for (const document of report.documents) {
    lines.push(`### ${document.documentId}`);
    lines.push(`- Title: ${document.title}`);
    lines.push(
      `- Origin: ${
        document.origin.type === "file"
          ? document.origin.path
          : `proof case ${document.origin.caseId}`
      }`,
    );
    lines.push(`- Status: ${document.status}`);
    lines.push(`- Seeded neighbors: ${document.seededNeighborCount}`);
    if (document.error) {
      lines.push(`- Error: ${document.error.name}: ${document.error.message}`);
      lines.push("");
      continue;
    }
    lines.push(
      `- Fair direct shared / covered-by-parent / true v1-only / true MMV2-only: ${document.fairComparison.directSharedUnitCount}/${document.fairComparison.coveredByParentCompositeCount}/${document.fairComparison.trueV1OnlyCount}/${document.fairComparison.trueMmV2OnlyCount}`,
    );
    lines.push(
      `- Fair semantic coverage ratio: ${document.fairComparison.semanticCoverageRatio.toFixed(3)}`,
    );
    if (document.fairComparison.structureFidelityObservations.length > 0) {
      lines.push(
        `- Structure fidelity: ${document.fairComparison.structureFidelityObservations.join(" | ")}`,
      );
    }
    if (document.fairComparison.coveredByParentComposite.length > 0) {
      lines.push("- Covered-by-parent examples:");
      for (const item of document.fairComparison.coveredByParentComposite.slice(0, 3)) {
        lines.push(
          `  - ${item.headingPath.length > 0 ? item.headingPath.join(" > ") : "(local cluster)"} -> ${item.mmv2Title ?? item.mmv2CanonicalText}`,
        );
      }
    }
    lines.push(
      `- Raw v1 captured/write-like: ${document.v1.capturedCount}/${document.v1.writeLikeCount}`,
    );
    lines.push(
      `- Raw MMV2 canonical/retained/realistic writes: ${document.mmv2.canonicalCount}/${document.mmv2.retainedCount}/${document.mmv2.realisticWriteCount}`,
    );
    lines.push(
      `- Raw shared/v1-only/MMV2-only: ${document.comparison.sharedCount}/${document.comparison.v1OnlyCount}/${document.comparison.mmv2OnlyCount}`,
    );
    lines.push(
      `- Evidence grounding: v1=${document.comparison.evidenceGrounding.v1WithProvenance}, MMV2=${document.comparison.evidenceGrounding.mmv2WithExactEvidence}`,
    );
    if (document.comparison.strongerSignals.length > 0) {
      lines.push(`- Signals: ${document.comparison.strongerSignals.join(" | ")}`);
    }
    if (document.comparison.shared.length > 0) {
      lines.push("- Shared examples:");
      for (const match of document.comparison.shared.slice(0, 3)) {
        lines.push(
          `  - v1 ${match.v1Kind} <-> MMV2 ${match.mmv2ArtifactType ?? match.mmv2Kind ?? "unknown"}: ${match.mmv2CanonicalText}`,
        );
      }
    }
    if (document.comparison.v1Only.length > 0) {
      lines.push("- v1-only examples:");
      for (const item of document.comparison.v1Only.slice(0, 3)) {
        lines.push(`  - ${item.kind}: ${item.semanticText}`);
      }
    }
    if (document.comparison.mmv2Only.length > 0) {
      lines.push("- MMV2-only examples:");
      for (const item of document.comparison.mmv2Only.slice(0, 3)) {
        lines.push(`  - ${item.artifactType ?? item.kind ?? item.category}: ${item.canonicalText}`);
      }
    }
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

export async function runModelMemoryDocumentSplit(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const args = options.args ?? parseArgs(process.argv.slice(2));
  const mmv2Module = await tsImport("../extensions/model-memory/src/mmv2/v1-vs-mmv2-split.ts", {
    parentURL: import.meta.url,
  });
  const liveExecutorExports =
    options.liveExecutorModule ??
    (await tsImport("../src/agents/model-memory.live-json-executor.ts", {
      parentURL: import.meta.url,
    }));
  const executor =
    options.executor ??
    new liveExecutorExports.OpenAICompatibleLiveJsonExecutor({
      requestTimeoutMs: options.requestTimeoutMs,
      requestSeed: options.requestSeed ?? args.requestSeed,
    });

  const documents =
    args.files.length > 0
      ? await fileDocumentsToSplitDocuments(repoRoot, args.files)
      : mmv2Module.proofCasesToSplitDocuments();

  const existingMmV2ByDocumentId = args.reuseMmV2Artifact
    ? buildExistingMmV2ByDocumentId(
        await loadArtifact(path.resolve(repoRoot, args.reuseMmV2Artifact)),
        documents,
      )
    : undefined;
  const existingV1ByDocumentId = args.reuseV1Artifact
    ? buildExistingV1ByDocumentId(
        await loadArtifact(path.resolve(repoRoot, args.reuseV1Artifact)),
        documents,
      )
    : undefined;

  const runResult = await mmv2Module.runV1VsMmV2DocumentSplit({
    documents,
    modelId: args.modelId,
    executor,
    existingMmV2ByDocumentId,
    existingV1ByDocumentId,
    mmv2ArtifactReusePath: args.reuseMmV2Artifact
      ? path.resolve(repoRoot, args.reuseMmV2Artifact)
      : undefined,
    v1ArtifactReusePath: args.reuseV1Artifact
      ? path.resolve(repoRoot, args.reuseV1Artifact)
      : undefined,
  });

  const report = {
    ...runResult,
    requestSeed: options.requestSeed ?? args.requestSeed ?? null,
    commitHash: readGitHead(repoRoot),
    command: {
      cwd: repoRoot,
      argv: options.commandArgv ?? [
        "node",
        "scripts/run-model-memory-document-split.mjs",
        ...process.argv.slice(2),
      ],
    },
  };
  const outputRoot =
    args.outputRoot ?? options.outputRoot ?? path.join(repoRoot, ".artifacts/model-memory/split");
  const artifacts = await writeArtifacts({ outputRoot, report });

  return { report, artifacts };
}

async function main() {
  const result = await runModelMemoryDocumentSplit();
  process.stdout.write(
    [
      `model-memory split: ${result.report.summary.totalDocuments} documents`,
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
