import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeManualUiSmokePackArtifacts,
  type ManualUiDocumentIngestionSmoke,
} from "../src/agents/model-memory.prompt-lane-proof.js";

type ToolSmokeArtifact = {
  toolName: string;
  runId: string;
  recordPath: string;
  modelId: string;
  candidateModelId: string;
  requestTimeoutMs: number;
  requestSeed: number;
  maxWordsPerWindow: number;
  chunkSize: number;
  maxConcurrency: number;
  invocation: {
    sources: string[];
    runId: string;
    recordPath: string;
    chunkSize: number;
    maxConcurrency: number;
    resume: boolean;
    modelId: string;
    candidateModelId: string;
    requestTimeoutMs: number;
    requestSeed: number;
    maxWordsPerWindow: number;
  };
  totals: {
    docsAttempted: number;
    docsCompleted: number;
    docsFailed: number;
    capturedClaimCount: number;
    ignoredWindowCount: number;
    rejectedWindowCount: number;
    writeDecisionCounts: Record<string, number>;
    rejectReasons: string[];
  };
};

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const smokeArtifactRelativePath =
    process.env.MODEL_MEMORY_UI_SMOKE_SOURCE_ARTIFACT?.trim() ||
    "docs/projects/model-memory/evidence/roadmap-document-ingestion-tool-smoke.json";
  const smokeArtifactAbsolutePath = path.resolve(repoRoot, smokeArtifactRelativePath);
  const smoke = JSON.parse(await readFile(smokeArtifactAbsolutePath, "utf8")) as ToolSmokeArtifact;

  const documentSmoke: ManualUiDocumentIngestionSmoke = {
    toolName: smoke.toolName,
    sourcePath: smoke.invocation.sources[0] ?? "docs/projects/model-memory/roadmap.md",
    runId: smoke.runId,
    recordPath: smoke.recordPath,
    invocation: smoke.invocation,
    verificationStatus: "verified_via_tool_smoke",
    observedStatus: smoke.totals.docsFailed > 0 ? "completed_with_failures" : "completed",
    observedTotals: smoke.totals,
    artifactJsonPath: smokeArtifactRelativePath,
    artifactMarkdownPath: smokeArtifactRelativePath.replace(/\.json$/u, ".md"),
    expectedOperatorChecks: [
      "Verify the OpenClaw tool surface resolves model_memory_document_ingest.",
      "Verify the run record is created at the declared checkpoints/model-memory path.",
      "Check recent captured claims and write counts after ingesting docs/projects/model-memory/roadmap.md.",
      "Confirm the run remains explicit and constrained: one source, chunkSize 1, maxConcurrency 1, nano/nano.",
    ],
  };

  const paths = await writeManualUiSmokePackArtifacts({
    repoRoot,
    documentSmoke,
  });

  process.stdout.write(
    JSON.stringify(
      {
        sourceArtifact: smokeArtifactRelativePath,
        manualUiSmokePackJsonPath: path.relative(repoRoot, paths.jsonPath),
        manualUiSmokePackMarkdownPath: path.relative(repoRoot, paths.markdownPath),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
