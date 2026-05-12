#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = ".artifacts/execution-platform";
let executionPlatform;

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    `${ARTIFACT_DIR}/${name}`,
    `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function boundedSource() {
  return {
    sourceRef: "official-docs://research-to-coding-linked-fixture",
    sourceKind: "official_docs",
    urlHash: sha256("https://platform.openai.com/docs/guides/structured-outputs"),
    contentHash: "linked-handoff-fixture-content-hash",
    titleSummary: "Official structured-output guidance source",
    citationSummary: "Bounded source ref used to prove research-to-coding handoff linkage.",
    retrievedAt: new Date().toISOString(),
  };
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    reasonCodes: readiness.reasonCodes,
  };
}

async function main() {
  if (!hasArg("--live")) {
    writeArtifact("web-research-to-coding-linked-handoff-blocker.json", {
      artifactKind: "web_research_to_coding_linked_handoff_blocker",
      status: "blocked_not_requested",
      reasonCodes: ["linked_handoff_requires_live_flag"],
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    return;
  }

  const {
    RuntimeJobRepository,
    WorkQueueRepository,
    createExecutionPlatformDatabaseRuntime,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    runResearchToCodingHandoffPilot,
  } = await ep();

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const readinessSummary = summarizeReadiness(readiness);

    if (!gate.enabled) {
      writeArtifact("web-research-to-coding-linked-handoff-blocker.json", {
        artifactKind: "web_research_to_coding_linked_handoff_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: readinessSummary,
        gate: {
          decision: gate.decision,
          enabled: gate.enabled,
          reasonCodes: gate.reasonCodes,
        },
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawPageStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return;
    }

    const suffix = Date.now();
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const result = await runResearchToCodingHandoffPilot({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: true,
      parentRuntimeJobId: `research-to-coding-linked-parent-${suffix}`,
      childRuntimeJobId: `research-to-coding-linked-child-${suffix}`,
      teamRunId: `research-to-coding-linked-team-run-${suffix}`,
      researchRunId: `research-to-coding-linked-research-run-${suffix}`,
      objectiveSummary: "Use bounded current-doc research refs before coding.",
      boundedResearchSummary: "Linked handoff stores bounded source refs and hashes only.",
      sources: [boundedSource()],
    });

    writeArtifact("web-research-to-coding-linked-handoff-proof.json", {
      artifactKind: "web_research_to_coding_linked_handoff_proof",
      status: result.status,
      readiness: readinessSummary,
      parentRuntimeJobId: result.parentRuntimeJobId,
      childRuntimeJobId: result.childRuntimeJobId,
      teamRunId: result.teamRunId,
      researchRunId: result.researchRunId,
      handoffAccepted: result.handoffAccepted,
      handoffReasonCodes: result.handoffReasonCodes,
      workQueueReadback: result.workQueueReadback,
      parentArtifactRefs: result.parentArtifactRefs,
      childArtifactRefs: result.childArtifactRefs,
      runtimeJobsCreated: true,
      liveWorkQueueItemsCreated: Boolean(result.workQueueReadback),
      liveWorkQueueRunsCreated: Boolean(result.workQueueReadback),
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      dependencyInstallPerformed: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
  } catch (error) {
    writeArtifact("web-research-to-coding-linked-handoff-blocker.json", {
      artifactKind: "web_research_to_coding_linked_handoff_blocker",
      status: "blocked_runtime_error",
      reasonCodes: ["linked_handoff_runtime_error"],
      errorSummary:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      liveWorkQueueRunsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    process.exitCode = 2;
  } finally {
    if (runtime) {
      await runtime.pool.end();
    }
  }
}

await main();
