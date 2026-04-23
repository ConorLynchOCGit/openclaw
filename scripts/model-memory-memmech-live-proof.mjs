#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const APPROVED_PAYLOAD =
  "For OpenClaw model-memory Phase 2 readiness, the approved live proof marker is MEMMECH-LIVE-2026-04-23 and it means capture seams, rich projections, Safe Level 1 Memory Ops, and current-runtime soak gates were validated before Phase 2.";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileHash(filePath) {
  return sha256(await readFile(filePath, "utf8"));
}

function stripFence(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/iu, "");
}

function providerFromModelId(modelId) {
  const slash = modelId.indexOf("/");
  return slash === -1 ? "openrouter" : modelId.slice(0, slash);
}

function shouldUseCodexAppServer(modelId) {
  const provider = providerFromModelId(modelId);
  return provider === "openai-codex" || provider === "codex";
}

function readSpeedArgs(argv) {
  return {
    apiReasoningEffort:
      readArgValue(argv, "--api-reasoning-effort") ??
      process.env.MODEL_MEMORY_MEMMECH_API_REASONING_EFFORT ??
      "none",
    codexReasoningEffort:
      readArgValue(argv, "--codex-reasoning-effort") ??
      process.env.MODEL_MEMORY_MEMMECH_CODEX_REASONING_EFFORT ??
      "low",
    verbosity:
      readArgValue(argv, "--verbosity") ?? process.env.MODEL_MEMORY_MEMMECH_VERBOSITY ?? "low",
    serviceTier:
      readArgValue(argv, "--service-tier") ??
      process.env.MODEL_MEMORY_MEMMECH_SERVICE_TIER ??
      process.env.OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER,
  };
}

function speedOptionsForModel(modelId, speedArgs) {
  return {
    reasoningEffort: shouldUseCodexAppServer(modelId)
      ? speedArgs.codexReasoningEffort
      : speedArgs.apiReasoningEffort,
    ...(speedArgs.verbosity ? { verbosity: speedArgs.verbosity } : {}),
    ...(speedArgs.serviceTier ? { serviceTier: speedArgs.serviceTier } : {}),
  };
}

async function main() {
  const root = repoRoot();
  const argv = process.argv.slice(2);
  const outputDir = path.resolve(
    root,
    readArgValue(argv, "--output-dir") ?? ".artifacts/model-memory/memmech-proof/2026-04-23-live",
  );
  const modelId =
    readArgValue(argv, "--model") ??
    process.env.MODEL_MEMORY_MEMMECH_PROOF_MODEL_ID ??
    "openai-codex/gpt-5.4-mini";
  const speedArgs = readSpeedArgs(argv);
  if (speedArgs.codexReasoningEffort) {
    process.env.MODEL_MEMORY_CODEX_REASONING_EFFORT = speedArgs.codexReasoningEffort;
  }
  if (speedArgs.serviceTier) {
    process.env.OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER = speedArgs.serviceTier;
  }
  await mkdir(outputDir, { recursive: true });
  const userPath = "/root/.openclaw/workspace/USER.md";
  const memoryPath = "/root/.openclaw/workspace/MEMORY.md";
  const beforeRootHashes = {
    user: await fileHash(userPath),
    memory: await fileHash(memoryPath),
  };

  const liveRuntime = await tsImport(
    path.join(root, "src/agents/model-memory.live-runtime.ts"),
    import.meta.url,
  );
  const { loadConfig } = await tsImport(path.join(root, "src/config/config.ts"), import.meta.url);
  const captureJobs = await tsImport(
    path.join(root, "src/agents/model-memory.capture-jobs.ts"),
    import.meta.url,
  );
  const dbApi = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const { buildToolResultProofLiveCapture } = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/tool-result-proof-capture.ts"),
    import.meta.url,
  );
  const { OpenAICompatibleLiveJsonExecutor, buildModelMemoryStrictPreflightRequests } =
    await tsImport(
      path.join(root, "src/agents/model-memory.live-json-executor.ts"),
      import.meta.url,
    );
  const { CodexAppServerJsonExecutor } = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  const baseConfig = loadConfig();
  const proofConfig = {
    ...baseConfig,
    plugins: {
      ...baseConfig.plugins,
      entries: {
        ...baseConfig.plugins?.entries,
        "model-memory": {
          ...baseConfig.plugins?.entries?.["model-memory"],
          config: {
            ...baseConfig.plugins?.entries?.["model-memory"]?.config,
            live: {
              ...baseConfig.plugins?.entries?.["model-memory"]?.config?.live,
              enabled: true,
              includeRetrievalPacks: true,
              modelId,
              candidateModelId: modelId,
              retrievalModelId: modelId,
            },
          },
        },
      },
    },
  };

  const captureBefore = captureJobs.createMemoryCaptureJobStore();
  const jobsBefore = await captureBefore.listJobs();
  let approvedCaptureError;
  let approvedCaptureSkippedReason;
  const existingWrittenProofJob = jobsBefore.find(
    (job) =>
      (job.sessionId === "memmech-live-2026-04-23" ||
        job.sessionId === "memmech-debug-2026-04-23") &&
      job.status === "written",
  );
  if (existingWrittenProofJob) {
    approvedCaptureSkippedReason = "existing_written_approved_payload_job";
  } else {
    try {
      await liveRuntime.captureModelMemoryAssistantTurn({
        sessionId: "memmech-live-2026-04-23",
        sessionKey: "agent:main:memmech-live-2026-04-23",
        agentId: "main",
        userText: APPROVED_PAYLOAD,
        assistantText:
          "Acknowledged. I will treat that as approved durable OpenClaw model-memory project state.",
        sourceMetadata: {
          provider: "operator-approved",
          model: "memmech-live-proof",
          proofMarker: "MEMMECH-LIVE-2026-04-23",
        },
        config: proofConfig,
      });
    } catch (error) {
      approvedCaptureError = error instanceof Error ? error.message : String(error);
    }
  }

  const noStoreTexts = [
    "Do not store this MEMMECH-NOSTORE-2026-04-23 validation turn; it is one answer only.",
    "Do not remember this MEMMECH-PRIVACY-2026-04-23 private validation phrase.",
    "For this session only, MEMMECH-TEMP-2026-04-23 should not become durable memory.",
  ];
  const skippedProofs = [];
  for (const [index, text] of noStoreTexts.entries()) {
    try {
      await liveRuntime.captureModelMemoryAssistantTurn({
        sessionId: `memmech-skip-${index}`,
        sessionKey: `agent:main:memmech-skip-${index}`,
        agentId: "main",
        userText: text,
        assistantText: "Acknowledged for this turn only.",
        sourceMetadata: { provider: "operator-approved", model: "memmech-live-proof-skip" },
        config: proofConfig,
      });
      skippedProofs.push({ index, status: "completed", textHash: sha256(text) });
    } catch (error) {
      skippedProofs.push({
        index,
        status: "failed",
        textHash: sha256(text),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const captureAfter = captureJobs.createMemoryCaptureJobStore();
  const jobsAfter = await captureAfter.listJobs();
  const newJobs = jobsAfter.filter(
    (job) => !jobsBefore.some((before) => before.jobId === job.jobId),
  );
  const approvedWrittenJobIds = new Set(
    jobsAfter
      .filter(
        (job) =>
          (job.sessionId === "memmech-live-2026-04-23" ||
            job.sessionId === "memmech-debug-2026-04-23") &&
          job.status === "written",
      )
      .map((job) => job.jobId),
  );
  const historicalNonBlockingCaptureFailures = jobsAfter.filter(
    (job) =>
      (job.sessionId === "memmech-live-2026-04-23" ||
        job.sessionId === "memmech-debug-2026-04-23") &&
      job.status === "failed" &&
      !newJobs.some((candidate) => candidate.jobId === job.jobId),
  );
  const proofJobs = jobsAfter.filter(
    (job) =>
      approvedWrittenJobIds.has(job.jobId) ||
      newJobs.some((candidate) => candidate.jobId === job.jobId) ||
      (approvedWrittenJobIds.size === 0 && job.sessionId === "memmech-live-2026-04-23"),
  );
  const captureEventsPath = path.join(captureAfter.baseDir, "events.jsonl");
  const captureEventsText = await readFile(captureEventsPath, "utf8").catch(() => "");
  const proofEvents = captureEventsText
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((event) => event && proofJobs.some((job) => job.jobId === event.jobId));

  const runtime = await dbApi.createModelMemoryDatabaseRuntime({ applyMigrations: false });
  let durableRows = [];
  let skipRows = [];
  let poolTelemetry;
  try {
    durableRows = (
      await runtime.sqlClient.query(
        `
          SELECT dm.memory_id, dm.created_at, dm.updated_at, dm.status, dm.kind, dm.unit_type
          FROM model_memory.durable_memories dm
          WHERE dm.canonical_text ILIKE $1 OR dm.payload::text ILIKE $1
          ORDER BY dm.created_at DESC
          LIMIT 10
        `,
        ["%MEMMECH-LIVE-2026-04-23%"],
      )
    ).rows;
    skipRows = (
      await runtime.sqlClient.query(
        `
          SELECT dm.memory_id
          FROM model_memory.durable_memories dm
          WHERE dm.canonical_text ILIKE ANY($1::text[]) OR dm.payload::text ILIKE ANY($1::text[])
        `,
        [
          [
            "%MEMMECH-NOSTORE-2026-04-23%",
            "%MEMMECH-PRIVACY-2026-04-23%",
            "%MEMMECH-TEMP-2026-04-23%",
          ],
        ],
      )
    ).rows;
    poolTelemetry = runtime.dbLaneController.snapshot();
  } finally {
    await runtime.pool.end?.();
  }

  const dirtySnapshot = await liveRuntime.getModelMemoryRuntimeDirtySnapshot();
  const toolResultBuild = buildToolResultProofLiveCapture({
    toolName: "memmech-proof",
    toolCallId: "toolcall-memmech-live-proof",
    runId: "memmech-live-proof",
    sessionId: "memmech-live-2026-04-23",
    sessionKey: "agent:main:memmech-live-2026-04-23",
    agentId: "main",
    result: {
      status: "success",
      details: {
        filePath: ".artifacts/model-memory/memmech-proof/2026-04-23-live/memmech-live-proof.json",
        fileCount: 1,
      },
    },
    observedAt: new Date(),
  });

  const preflightExecutor = shouldUseCodexAppServer(modelId)
    ? new CodexAppServerJsonExecutor({
        cwd: root,
        requestTimeoutMs: 120000,
        reasoningEffort: speedArgs.codexReasoningEffort,
        ...(speedArgs.serviceTier ? { serviceTier: speedArgs.serviceTier } : {}),
      })
    : new OpenAICompatibleLiveJsonExecutor({ config: proofConfig, requestTimeoutMs: 120000 });
  const preflightResults = [];
  for (const request of buildModelMemoryStrictPreflightRequests(modelId).slice(0, 4)) {
    if (shouldUseCodexAppServer(modelId)) {
      const startedAt = Date.now();
      try {
        const response = await preflightExecutor.execute({
          ...request,
          systemPrompt:
            "Preflight this OpenClaw MMV2 contract. Return only JSON matching the requested contract shape. Do not include raw prompts, transcripts, tool logs, secrets, or private phrases.",
          userPrompt: `Contract ${request.contract.contractName}/${request.contract.contractVersion}; schema ${request.responseOptions?.transport?.name ?? "unknown"}. Return a minimal valid JSON object for this schema.`,
          responseOptions: {
            ...request.responseOptions,
            ...speedOptionsForModel(modelId, speedArgs),
          },
        });
        JSON.parse(stripFence(response.outputText));
        preflightResults.push({
          ok: true,
          requestedModelId: modelId,
          provider: providerFromModelId(modelId),
          providerModel: modelId.split("/").slice(1).join("/"),
          requestUrl: "codex-app-server",
          contractName: request.contract.contractName,
          contractVersion: request.contract.contractVersion,
          schemaName: request.responseOptions?.transport?.name,
          strictSchema: true,
          resolvedModelId: response.resolvedModelId,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        preflightResults.push({
          ok: false,
          requestedModelId: modelId,
          provider: providerFromModelId(modelId),
          providerModel: modelId.split("/").slice(1).join("/"),
          requestUrl: "codex-app-server",
          contractName: request.contract.contractName,
          contractVersion: request.contract.contractVersion,
          schemaName: request.responseOptions?.transport?.name,
          strictSchema: true,
          failureStage: "provider_parse",
          failureClass: "provider_json_boundary",
          errorMessage:
            error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
        });
      }
      continue;
    }
    preflightResults.push(await preflightExecutor.preflightContract(request));
  }

  let cacheMetricProof = null;
  const benchmarkPath = path.join(
    root,
    ".artifacts/model-memory/pass6-live-benchmark/2026-04-23/benchmark-report.json",
  );
  try {
    const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
    cacheMetricProof = {
      reportPath: path.relative(root, benchmarkPath),
      totalCalls: benchmark.cacheHealth?.totalCalls,
      cacheHits: benchmark.cacheHealth?.cacheHits,
      cachedTokenPercentage: benchmark.cacheHealth?.cachedTokenPercentage,
    };
  } catch {
    cacheMetricProof = { reportPath: path.relative(root, benchmarkPath), status: "missing" };
  }

  const afterRootHashes = {
    user: await fileHash(userPath),
    memory: await fileHash(memoryPath),
  };
  const leakageText = JSON.stringify({
    jobs: proofJobs,
    events: proofEvents,
    dirtySnapshot,
  });
  const leakagePatterns = [
    "raw prompt",
    "full transcript",
    "raw tool log",
    "MEMMECH-NOSTORE-2026-04-23 validation turn",
    "MEMMECH-PRIVACY-2026-04-23 private validation phrase",
  ];
  const report = {
    schema_version: "model_memory_memmech_live_proof.v1",
    generated_at: new Date().toISOString(),
    proof_marker: "MEMMECH-LIVE-2026-04-23",
    approved_payload_sha256: sha256(APPROVED_PAYLOAD),
    approved_capture_error: approvedCaptureError,
    approved_capture_skipped_reason: approvedCaptureSkippedReason,
    historical_nonblocking_capture_failures: historicalNonBlockingCaptureFailures.map((job) => ({
      jobId: job.jobId,
      sourceKind: job.sourceKind,
      status: job.status,
      stage: job.stage,
      failureClass: job.failureClass,
    })),
    capture_jobs: proofJobs.map((job) => ({
      jobId: job.jobId,
      sourceKind: job.sourceKind,
      status: job.status,
      stage: job.stage,
      safeRelatedIds: job.safeRelatedIds,
      metrics: job.metrics,
    })),
    capture_events: proofEvents.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      jobId: event.jobId,
      status: event.status,
      safeRelatedIds: event.safeRelatedIds,
      metrics: event.metrics,
    })),
    durable_row_proof: {
      rowCount: durableRows.length,
      rows: durableRows,
    },
    skipped_no_store_privacy_temp: {
      prompts: skippedProofs,
      durableRowCount: skipRows.length,
    },
    dirty_state: dirtySnapshot,
    pool_telemetry: poolTelemetry,
    strict_schema_preflight: preflightResults,
    cache_metric_proof: cacheMetricProof,
    speed_controls: {
      api_reasoning_effort: speedArgs.apiReasoningEffort,
      codex_reasoning_effort: speedArgs.codexReasoningEffort,
      verbosity: speedArgs.verbosity,
      service_tier: speedArgs.serviceTier ?? null,
    },
    tool_result_capture_contract_isolated: toolResultBuild
      ? {
          sourceId: toolResultBuild.source.id,
          segmentIds: toolResultBuild.windows.map((window) => window.id),
          memoryIds: toolResultBuild.liveMemoryBatch.durableMemories.map(
            (memory) => memory.memory_id,
          ),
          eventIds: toolResultBuild.liveMemoryBatch.memoryEvents.map(
            (event) => event.memory_event_id,
          ),
          persistedToLiveDb: false,
        }
      : { status: "no_bounded_fact", persistedToLiveDb: false },
    root_hashes: {
      before: beforeRootHashes,
      after: afterRootHashes,
      unchanged:
        beforeRootHashes.user === afterRootHashes.user &&
        beforeRootHashes.memory === afterRootHashes.memory,
    },
    no_dark_data_scan: {
      checkedPatterns: leakagePatterns,
      leaked: leakagePatterns.filter((pattern) => leakageText.includes(pattern)),
    },
    acceptance: {
      captureWritten: proofEvents.some((event) => event.eventType === "capture_written"),
      durableApprovedRowCreated: durableRows.length > 0,
      noStorePrivacyTempNoRows: skipRows.length === 0,
      rootHashesUnchanged:
        beforeRootHashes.user === afterRootHashes.user &&
        beforeRootHashes.memory === afterRootHashes.memory,
    },
  };
  await writeFile(
    path.join(outputDir, "memmech-live-proof.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ report: path.join(outputDir, "memmech-live-proof.json") }, null, 2));
  if (shouldUseCodexAppServer(modelId)) {
    const { clearSharedCodexAppServerClient } = await tsImport(
      path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
      import.meta.url,
    );
    clearSharedCodexAppServerClient();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
