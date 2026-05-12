#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const boundedQuerySummary =
  "Research current official structured-output guidance and store bounded citation refs only.";
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

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const text = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const fullPath = path.join(artifactRoot, name);
  await writeFile(fullPath, text, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(text) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of (await readTextIfExists(filePath)).split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    configSourceRef: readiness.boundary.configSourceRef,
    runtimeSubstrateRef: readiness.boundary.runtimeSubstrateRef,
    databaseName: readiness.boundary.databaseName,
    capability: readiness.boundary.capability,
    readinessState: readiness.readinessState,
    schemaPresent: readiness.schemaPresent,
    missingTables: readiness.missingTables,
    writeAccessAllowed: readiness.writeAccessAllowed,
    reasonCodes: readiness.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function sourceFixture() {
  return [
    {
      sourceRef: "official-openai-docs://structured-outputs",
      sourceKind: "official_docs",
      urlHash: sha256("https://platform.openai.com/docs/guides/structured-outputs"),
      contentHash: "fixture-content-hash",
      titleSummary: "OpenAI structured outputs guide",
      citationSummary:
        "Official documentation source ref for structured outputs; fixture mode stores no page body.",
      retrievedAt: new Date().toISOString(),
    },
  ];
}

async function fetchLiveReadOnlySource() {
  const sourceRef = "official-openai-docs://structured-outputs";
  const url = "https://platform.openai.com/docs/guides/structured-outputs";
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "OpenClaw-WebResearchLivePilot/1.0 bounded-readonly",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    const body = await response.text();
    return {
      source: {
        sourceRef,
        sourceKind: "official_docs",
        urlHash: sha256(url),
        contentHash: sha256(body),
        titleSummary: "OpenAI structured outputs guide",
        citationSummary: `Official docs were fetched read-only; HTTP ${response.status}; page body discarded after hashing.`,
        retrievedAt: new Date().toISOString(),
      },
      readOnlyFetch: {
        status: response.status,
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        sourceRef,
        urlHash: sha256(url),
        contentHash: sha256(body),
        rawPageStored: false,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizePilotResult(result) {
  return {
    artifactKind: result.artifactKind,
    pilotVersion: result.pilotVersion,
    status: result.status,
    mode: result.mode,
    runtimeJobId: result.runtimeJobId,
    researchRunId: result.researchRunId,
    queryHash: result.queryHash,
    boundedQuerySummary: result.boundedQuerySummary,
    boundedAnswerSummary: result.boundedAnswerSummary,
    sourceCount: result.sourceCount,
    citationCount: result.citationCount,
    eventTypes: result.eventTypes,
    artifactTypes: result.artifactTypes,
    humanCloseoutSummary: result.humanCloseoutSummary,
    workQueueReadback: result.workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawPageStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    runtimeJobsCreated: result.runtimeJobsCreated,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    externalWritePerformed: false,
    workQueueLifecycleMutated: false,
  };
}

async function runFixture() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    RuntimeJobRepository,
    WorkQueueRepository,
    runWebResearchLivePilot,
  } = await ep();
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const result = await runWebResearchLivePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: "web-research-live-pilot-fixture-job",
      researchRunId: "web-research-live-pilot-fixture-run",
      boundedQuerySummary,
      boundedAnswerSummary:
        "Fixture research result stores only bounded source refs, hashes, timestamps, and citation summaries.",
      sources: sourceFixture(),
    });
    await writeJson("web-researcher-live-pilot-fixture-run-proof.json", {
      artifactKind: "web_researcher_live_pilot_fixture_run_proof",
      status: result.status,
      result: summarizePilotResult(result),
    });
    await writeJson("web-researcher-live-pilot-work-queue-readback-proof.json", {
      artifactKind: "web_researcher_live_pilot_work_queue_readback_proof",
      status: result.workQueueReadback ? "completed" : "blocked",
      workQueueReadback: result.workQueueReadback,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    });
    return result;
  } finally {
    await database.close();
  }
}

async function inspectLiveAndMaybeRun() {
  let runtime;
  try {
    const {
      createExecutionPlatformDatabaseRuntime,
      inspectExecutionPlatformDbReadiness,
      resolveExecutionPlatformDbBoundaryContract,
      evaluateWorkQueueLiveLinkageGate,
      RuntimeJobRepository,
      WorkQueueRepository,
      runWebResearchLivePilot,
    } = await ep();
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const liveWorkQueueLinked = hasArg("--run-live-work-queue-linked");
    await writeJson("web-researcher-live-pilot-live-db-readiness.json", {
      artifactKind: "web_researcher_live_pilot_live_db_readiness",
      status: "inspected",
      readiness: summarizeReadiness(readiness),
      liveRuntimeRunRequested: hasArg("--run-live-runtime-only"),
      liveWorkQueueLinkedRunRequested: liveWorkQueueLinked,
      liveReadOnlyRetrievalRequested: hasArg("--live-readonly-retrieval"),
      workQueueLiveLinkageGate: {
        decision: gate.decision,
        enabled: gate.enabled,
        reasonCodes: gate.reasonCodes,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    if (!hasArg("--run-live-runtime-only") && !liveWorkQueueLinked) {
      await writeJson("web-researcher-live-pilot-live-runtime-blocker.json", {
        artifactKind: "web_researcher_live_pilot_live_runtime_blocker",
        status: "blocked_live_runtime_run_not_requested",
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        reasonCodes: ["live_runtime_run_requires_run_live_runtime_only_or_work_queue_linked_flag"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return null;
    }
    if (liveWorkQueueLinked && !gate.enabled) {
      await writeJson("web-research-work-queue-linked-pilot-blocker.json", {
        artifactKind: "web_research_work_queue_linked_pilot_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: summarizeReadiness(readiness),
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
      return null;
    }
    if (readiness.missingTables.length > 0 || !readiness.writeAccessAllowed) {
      await writeJson("web-researcher-live-pilot-live-runtime-blocker.json", {
        artifactKind: "web_researcher_live_pilot_live_runtime_blocker",
        status: "blocked_runtime_db_not_writable",
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        reasonCodes: readiness.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return null;
    }
    let sources = sourceFixture();
    let readOnlyFetch = null;
    if (hasArg("--live-readonly-retrieval")) {
      try {
        const fetched = await fetchLiveReadOnlySource();
        sources = [fetched.source];
        readOnlyFetch = fetched.readOnlyFetch;
        await writeJson("web-researcher-live-pilot-live-readonly-proof.json", {
          artifactKind: "web_researcher_live_pilot_live_readonly_proof",
          status: fetched.readOnlyFetch.ok ? "completed" : "needs_review",
          readOnlyFetch,
          rawPageStored: false,
          externalWritePerformed: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        });
      } catch (error) {
        await writeJson("web-researcher-live-pilot-live-readonly-blocker.json", {
          artifactKind: "web_researcher_live_pilot_live_readonly_blocker",
          status: "blocked_readonly_fetch_error",
          reasonCodes: [
            error instanceof Error ? error.message.slice(0, 240) : "unknown_readonly_fetch_error",
          ],
          rawPageStored: false,
          externalWritePerformed: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        });
      }
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = liveWorkQueueLinked
      ? new WorkQueueRepository(runtime.sqlClient, runtimeJobs)
      : null;
    const result = await runWebResearchLivePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: liveWorkQueueLinked,
      createWorkQueueFixture: false,
      runtimeJobId: `web-research-live-pilot-${Date.now()}`,
      boundedQuerySummary,
      boundedAnswerSummary:
        "Live runtime-only web research result stores bounded source refs, hashes, timestamps, and citation summaries only.",
      sources,
    });
    const proofName = liveWorkQueueLinked
      ? "web-research-work-queue-linked-pilot-proof.json"
      : "web-researcher-live-pilot-runtime-job-proof.json";
    await writeJson(proofName, {
      artifactKind: "web_researcher_live_pilot_runtime_job_proof",
      status: result.status,
      readiness: summarizeReadiness(readiness),
      readOnlyFetch,
      result: summarizePilotResult(result),
      workQueueReadbackAvailable: Boolean(result.workQueueReadback),
      workQueueReadbackBlocker: result.workQueueReadback
        ? null
        : "runtime_only_live_pilot_did_not_create_work_item",
    });
    if (liveWorkQueueLinked) {
      await writeJson("web-research-work-queue-readback-proof.json", {
        artifactKind: "web_research_work_queue_readback_proof",
        status: result.workQueueReadback ? "completed" : "blocked",
        runtimeJobId: result.runtimeJobId,
        researchRunId: result.researchRunId,
        workQueueReadback: result.workQueueReadback,
        rawPromptStored: false,
        rawResponseStored: false,
        rawPageStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      });
      await writeJson("web-research-bounded-source-evidence-proof.json", {
        artifactKind: "web_research_bounded_source_evidence_proof",
        status:
          result.sourceCount > 0 && result.rawPageStored === false ? "passed" : "needs_review",
        runtimeJobId: result.runtimeJobId,
        researchRunId: result.researchRunId,
        sourceCount: result.sourceCount,
        citationCount: result.citationCount,
        sourceRefs: result.evidence.sources.map((source) => source.sourceRef).slice(0, 20),
        rawPageStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      });
    }
    return result;
  } catch (error) {
    await writeJson("web-researcher-live-pilot-live-runtime-blocker.json", {
      artifactKind: "web_researcher_live_pilot_live_runtime_blocker",
      status: "blocked_live_runtime_error",
      reasonCodes: [
        error instanceof Error ? error.message.slice(0, 240) : "unknown_live_runtime_error",
      ],
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    return null;
  } finally {
    await runtime?.pool.end();
  }
}

async function main() {
  await loadDotenvFiles();
  const artifacts = [];
  let fixture = null;
  let live = null;
  if (hasArg("--fixture")) {
    fixture = await runFixture();
    artifacts.push(
      ".artifacts/execution-platform/web-researcher-live-pilot-fixture-run-proof.json",
      ".artifacts/execution-platform/web-researcher-live-pilot-work-queue-readback-proof.json",
    );
  }
  if (
    hasArg("--inspect-live") ||
    hasArg("--run-live-runtime-only") ||
    hasArg("--run-live-work-queue-linked")
  ) {
    live = await inspectLiveAndMaybeRun();
    artifacts.push(
      ".artifacts/execution-platform/web-researcher-live-pilot-live-db-readiness.json",
      live
        ? hasArg("--run-live-work-queue-linked")
          ? ".artifacts/execution-platform/web-research-work-queue-linked-pilot-proof.json"
          : ".artifacts/execution-platform/web-researcher-live-pilot-runtime-job-proof.json"
        : ".artifacts/execution-platform/web-researcher-live-pilot-live-runtime-blocker.json",
    );
    if (hasArg("--run-live-work-queue-linked") && live) {
      artifacts.push(
        ".artifacts/execution-platform/web-research-work-queue-readback-proof.json",
        ".artifacts/execution-platform/web-research-bounded-source-evidence-proof.json",
      );
    }
    if (hasArg("--live-readonly-retrieval")) {
      artifacts.push(
        fs.existsSync(path.join(artifactRoot, "web-researcher-live-pilot-live-readonly-proof.json"))
          ? ".artifacts/execution-platform/web-researcher-live-pilot-live-readonly-proof.json"
          : ".artifacts/execution-platform/web-researcher-live-pilot-live-readonly-blocker.json",
      );
    }
  }
  if (!fixture && !live) {
    await writeJson("web-researcher-live-pilot-runner-not-requested.json", {
      artifactKind: "web_researcher_live_pilot_runner_not_requested",
      status: "blocked_not_requested",
      reasonCodes: ["pass_fixture_or_inspect_live_or_run_live_runtime_only"],
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    return;
  }
  await writeJson("web-researcher-live-pilot-script-summary.json", {
    artifactKind: "web_researcher_live_pilot_script_summary",
    status: live?.status ?? fixture?.status ?? "blocked",
    fixtureResult: fixture ? summarizePilotResult(fixture) : null,
    liveRuntimeResult: live ? summarizePilotResult(live) : null,
    artifactRefs: artifacts,
    rawPromptStored: false,
    rawResponseStored: false,
    rawPageStored: false,
    rawLogsStored: false,
    runtimeJobsCreated: Boolean(live || fixture),
    workQueueLifecycleMutated: false,
  });
}

await main();
