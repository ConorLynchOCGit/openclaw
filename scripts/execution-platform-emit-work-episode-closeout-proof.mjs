#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_EVIDENCE_PATH = ".artifacts/execution-platform/live-smoke-supabase-8k-result.json";
const DEFAULT_OUTPUT_ROOT = ".artifacts/execution-platform";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readAllArgs(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function splitFields(value, expected, fallback = "") {
  const parts = value.split("|").map((part) => part.trim());
  while (parts.length < expected) {
    parts.push(fallback);
  }
  return parts;
}

function parseTests() {
  return readAllArgs("--test").map((value) => {
    const [command, status, summary] = splitFields(value, 3, "unknown");
    return {
      command,
      status: ["passed", "failed", "skipped", "unknown"].includes(status) ? status : "unknown",
      summary: summary || "Bounded validation summary supplied by closeout proof.",
    };
  });
}

function parseFiles() {
  return readAllArgs("--file").map((value) => {
    const [filePath, changeKind, summary] = splitFields(value, 3, "unknown");
    return {
      path: filePath,
      changeKind: ["created", "modified", "deleted", "unknown"].includes(changeKind)
        ? changeKind
        : "unknown",
      summary: summary || "Touched during Execution Platform closeout integration.",
    };
  });
}

async function main() {
  const root = repoRoot();
  const evidencePath = path.resolve(root, readArg("--evidence") ?? DEFAULT_EVIDENCE_PATH);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const runtimeJobId = readArg("--runtime-job-id") ?? evidence.runtimeJobId;
  if (!runtimeJobId) {
    throw new Error("runtime job id is required via --runtime-job-id or evidence.runtimeJobId");
  }

  const { createExecutionPlatformDatabaseRuntime } = await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
  const { RuntimeJobRepository } = await tsImport(
    path.join(root, "extensions/execution-platform/src/runtime-job-repository.ts"),
    import.meta.url,
  );
  const { ExecutionPlatformWorkEpisodeCloseoutRepository } = await tsImport(
    path.join(root, "extensions/execution-platform/src/codex-bridge/work-episode-closeout.ts"),
    import.meta.url,
  );

  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  try {
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, {
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const closeout = new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, {
      artifactRoot: readArg("--artifact-root"),
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const result = await closeout.emitCloseoutForRuntimeJob({
      runtimeJobId,
      filesTouched: parseFiles(),
      testsRun: parseTests(),
      sourceRefs: [
        `artifact:${path.relative(root, evidencePath)}`,
        "artifact:.artifacts/execution-platform/live-supabase-model-memory-persistence-proof-8k.json",
      ],
      followUpCandidates: [
        {
          title: "Implement Pause Redirect Cancel Control Bridge",
          rationale:
            "The runtime substrate correction showed OpenClaw needs durable pause and redirect controls for the separate executor session.",
          sourceRefs: [`runtime-job://${runtimeJobId}`],
        },
      ],
      skillImprovementEvidence: [
        {
          workflowName: "Work Queue UX Review",
          evidence:
            "Execution Platform closeout evidence should be checked before reviewing proactivity, skill, or Work Queue artifacts.",
          suggestedDirection:
            "Use Work Episode Outcome Packs as the completion substrate and treat missing packs as process gaps.",
          sourceRefs: [`runtime-job://${runtimeJobId}`],
        },
      ],
    });
    const proof = {
      schemaVersion: "execution_platform_work_episode_closeout_proof.v1",
      generatedAt: new Date().toISOString(),
      runtimeJobId,
      databaseSource: runtime.resolution.source,
      databaseName: runtime.resolution.databaseName,
      reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
      migrationNames: runtime.migrationNames,
      evidencePath,
      episodeId: result.pack.episodeId,
      packHash: result.packArtifact.packHash,
      packPath: result.packArtifact.jsonPath,
      markdownPath: result.packArtifact.markdownPath,
      runtimeArtifactId: result.runtimeArtifact.artifactId,
      runtimeArtifactType: result.runtimeArtifact.artifactType,
      eligibility: result.eligibility,
      discoverableByModelMemory: result.metadata.discoverableByModelMemory,
      codexCliInvoked: false,
      commandExecuted: false,
      workQueueLifecycleMutated: false,
    };
    const outputRoot = path.resolve(root, readArg("--output-root") ?? DEFAULT_OUTPUT_ROOT);
    await mkdir(outputRoot, { recursive: true });
    const proofPath = path.join(outputRoot, "work-episode-closeout-proof.json");
    await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, proofPath, ...proof }, null, 2));
  } finally {
    await runtime.pool.end();
  }
}

await main();
