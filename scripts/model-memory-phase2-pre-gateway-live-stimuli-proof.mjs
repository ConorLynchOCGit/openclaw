#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const OUTPUT_ROOT = ".artifacts/model-memory/phase2-pre-gateway-live-stimuli-validation";
const MEMORY_MODEL_ID =
  process.env.MODEL_MEMORY_CODEX_CAPTURE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_CAPTURE_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function readGitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function boundedText(value, maxChars = 1600) {
  const text = String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, "[redacted-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/gu, "[redacted-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/gu, "[redacted-token]")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/gu, "[redacted-long-token]");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[bounded-truncated]`;
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values ?? []) {
    const key = keyFn(value) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function summarizeTrace(trace) {
  return {
    contractName: trace.contractName,
    contractVersion: trace.contractVersion,
    requestedModelId: trace.requestedModelId,
    resolvedModelId: trace.resolvedModelId,
    provider: trace.provider,
    providerModel: trace.providerModel,
    providerApi: trace.providerApi,
    responseFormatMode: trace.responseFormatMode,
    httpStatus: trace.httpStatus,
    responseOk: trace.responseOk,
    responseBodyReceived: trace.responseBodyReceived,
    finishReason: trace.finishReason,
    promptTokenCount: trace.promptTokenCount,
    outputTokenCount: trace.outputTokenCount,
    cachedInputTokenCount: trace.cachedInputTokenCount,
    latencyMs: trace.latencyMs,
    failureStage: trace.failureStage,
    failureClass: trace.failureClass,
    errorMessage: trace.errorMessage ? boundedText(trace.errorMessage, 800) : undefined,
  };
}

function assertNoProhibitedArtifactContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
    "hidden-reasoning-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`pre-gateway proof artifact contains prohibited marker: ${marker}`);
    }
  }
}

function createProgressLogger(outputDir) {
  const progressPath = path.join(outputDir, "progress.jsonl");
  return {
    path: progressPath,
    async write(stage, status, details = {}) {
      const entry = {
        timestamp: new Date().toISOString(),
        stage,
        status,
        ...details,
      };
      await appendFile(progressPath, `${JSON.stringify(entry)}\n`);
      console.error(`[pre-gateway-proof] ${stage}: ${status}`);
    },
  };
}

function openClawLongPromptText(stamp, markers) {
  return [
    `Please remember these project model-memory validation facts from live gateway proof ${stamp}.`,
    `Validation marker ${markers[0]} identifies this durable preference: long OpenClaw prompts should use document-style bounded windows rather than deterministic interesting-snippet selection.`,
    `Validation marker ${markers[1]} identifies this durable architecture decision: retrieval final inclusion must remain model-owned after deterministic lexical, graph, vector, and recency recall has gathered candidates.`,
    `Validation marker ${markers[2]} identifies this scoped project decision: Codex capture should stay enabled through heartbeat and closeout hooks, with user turns user-authoritative and assistant/tool evidence lower authority.`,
    `Validation marker ${markers[3]} identifies this temporary validation note: this live gateway proof is scoped to pre-Milestone-4 validation and may receive TTL or project-local scope if admitted.`,
    "Reply with one short acknowledgement only.",
  ].join("\n\n");
}

function summarizeMmv2Core(run) {
  if (!run) {
    return undefined;
  }
  return {
    sourceId: run.source?.id,
    sourceKind: run.source?.sourceKind,
    rawEventId: run.rawEvent?.event_id,
    windowCount: run.windows?.length ?? 0,
    windows: (run.windows ?? []).map((window, index) => ({
      index,
      id: window.id,
      hash: sha256(window.normalizedText ?? ""),
      tokenEstimate: window.tokenEstimate,
      boundedText: boundedText(window.normalizedText, 1200),
    })),
    segmentCount: run.segmented?.segments?.length ?? 0,
    routingDecisionCount: run.routing?.routing_decisions?.length ?? 0,
    routeCounts: countBy(run.routing?.routing_decisions, (decision) => decision.route),
    routedCandidateCount: run.routedCandidates?.routed_candidates?.length ?? 0,
    atomicCandidateCount: run.atomicExtraction?.atomic_candidates?.length ?? 0,
    compositeCandidateCount: run.compositeExtraction?.composite_candidates?.length ?? 0,
    compositeComponentCount: (run.compositeExtraction?.composite_candidates ?? []).reduce(
      (sum, candidate) => sum + (candidate.components?.length ?? 0),
      0,
    ),
    canonicalCandidateCount: run.canonicalization?.canonical_candidates?.length ?? 0,
    canonicalCandidates: (run.canonicalization?.canonical_candidates ?? []).map((candidate) => ({
      candidateId: candidate.candidate_id,
      kind: candidate.kind,
      canonicalText: boundedText(candidate.canonical_text, 700),
      evidenceQuote: boundedText(candidate.source?.evidence_quote, 500),
      sourceSegmentId: candidate.source?.segment_id,
      scope: candidate.scope,
      payloadType: candidate.payload?.payload_type ?? candidate.payload?.claim_type ?? undefined,
    })),
    admissionCounts: countBy(run.admission?.decisions, (decision) => decision.decision),
    admissionDecisions: (run.admission?.decisions ?? []).map((decision) => ({
      candidateId: decision.candidate_id,
      decision: decision.decision,
      reasonCodes: decision.reason_codes,
      requiresReconciliation: decision.requires_reconciliation,
    })),
    reconciliationCounts: countBy(run.reconciliation, (decision) => decision.action),
    reconciliation: (run.reconciliation ?? []).map((decision) => ({
      candidateId: decision.candidate_id,
      action: decision.action,
      targetMemoryId: decision.target_memory_id,
      reasonCodes: decision.reason_codes,
    })),
  };
}

function summarizeLiveCapture(result) {
  const writeCounts = countBy(result.writeResults, (entry) => entry.decision);
  return {
    sourceId: result.source?.id,
    sourceKind: result.source?.sourceKind,
    sourceHash: result.source?.sourceFingerprint,
    windowCount: result.windows?.length ?? 0,
    capturedObjectCount: result.capturedObjects?.length ?? 0,
    writeCounts,
    memoryIds: (result.writeResults ?? [])
      .map((entry) => entry.memoryId)
      .filter((entry) => typeof entry === "string" && entry.length > 0),
    deferredCandidateCount: result.persistenceResult?.deferredCandidates?.length ?? 0,
    durableMemoriesWrittenCount: result.persistenceResult?.durableMemoriesWritten?.length ?? 0,
    mmv2Core: summarizeMmv2Core(result.mmv2Core),
  };
}

async function queryMarkerEvidence(sqlClient, marker) {
  const result = await sqlClient.query(
    `
      SELECT
        memory_id,
        status,
        kind,
        artifact_type,
        canonical_text,
        payload,
        tags,
        source_refs,
        created_at
      FROM model_memory.durable_memories
      WHERE canonical_text ILIKE $1
         OR search_text ILIKE $1
         OR payload::text ILIKE $1
         OR source_refs::text ILIKE $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [`%${marker}%`],
  );
  return result.rows.map((row) => ({
    memoryId: row.memory_id,
    status: row.status,
    kind: row.kind,
    artifactType: row.artifact_type,
    canonicalTextExcerpt: boundedText(row.canonical_text, 700),
    payloadHash: sha256(row.payload ?? {}),
    tags: row.tags,
    sourceRefs: Array.isArray(row.source_refs)
      ? row.source_refs.map((ref) => ({
          sourceType: ref.source_type,
          sourceId: ref.source_id,
          segmentId: ref.segment_id,
          evidenceQuoteHash: ref.evidence_quote ? sha256(ref.evidence_quote) : undefined,
        }))
      : [],
    createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
  }));
}

async function runOpenClawCapture(input) {
  const sourceAuthority = input.sourceAuthority.buildSourceAuthorityMetadata("explicit_user_turn");
  const result = await input.capture.captureOrdinaryTurnLive({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
    memoryStore: input.runtime.memoryStore,
    rebuildRuntime: false,
    env: process.env,
    traceId: input.traceId,
    capture: {
      turn: {
        currentTurnText: input.text,
        currentTurnSpeaker: "user",
        projectId: "model-memory",
        sessionId: input.sessionId,
        maxWordsPerWindow: input.maxWordsPerWindow,
        sourceMetadata: {
          sourceRuntime: "openclaw",
          sourceAuthority,
          proofMarker: input.marker,
          proofKind: input.proofKind,
          rawFullTranscriptPersisted: false,
        },
      },
      modelId: input.modelId,
      candidateModelId: input.modelId,
      interpreter: input.interpreter,
    },
  });
  return summarizeLiveCapture(result);
}

async function runCodexCapture(input) {
  const { loadConfig } = await tsImport("../src/config/config.ts", { parentURL: import.meta.url });
  const { runCodexMemoryCaptureRuntimeHook } = await tsImport(
    "../src/infra/model-memory-codex-capture-runtime.ts",
    { parentURL: import.meta.url },
  );
  const cfg = loadConfig();
  return await runCodexMemoryCaptureRuntimeHook({
    cfg,
    cadence: "heartbeat",
    projectId: "openclaw",
    env: {
      ...process.env,
      MODEL_MEMORY_CODEX_CAPTURE_ENABLED: "true",
      MODEL_MEMORY_CODEX_CAPTURE_COOLDOWN_MS: "0",
      MODEL_MEMORY_CODEX_CAPTURE_MAX_PER_RUN:
        process.env.MODEL_MEMORY_PHASE2_LIVE_UI_CODEX_MAX_PER_RUN ?? "2",
      MODEL_MEMORY_CODEX_CAPTURE_MAX_ACTIVITIES:
        process.env.MODEL_MEMORY_PHASE2_LIVE_UI_CODEX_MAX_ACTIVITIES ?? "300",
      MODEL_MEMORY_CODEX_CAPTURE_MAX_WORDS_PER_WINDOW:
        process.env.MODEL_MEMORY_PHASE2_LIVE_UI_CODEX_MAX_WORDS_PER_WINDOW ?? "500",
      MODEL_MEMORY_CODEX_CAPTURE_STATE_PATH: path.join(
        input.outputDir,
        `codex-capture-hook-state-${input.stamp}.json`,
      ),
      MODEL_MEMORY_CODEX_CAPTURE_PROGRESS_PATH: path.join(
        input.outputDir,
        `codex-capture-progress-${input.stamp}.jsonl`,
      ),
      MODEL_MEMORY_CODEX_CAPTURE_MODEL: input.modelId,
    },
  });
}

async function runRetrievalMarkerProof(input) {
  const [retrieval, requestInterpreter, runtimeReadModels] = await Promise.all([
    tsImport("../extensions/model-memory/src/retrieval.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/real-retrieval-request-interpreter.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/runtime-read-models.ts", {
      parentURL: import.meta.url,
    }),
  ]);
  const memoryObjects = await runtimeReadModels.listRuntimeMemoryRecords(
    input.runtime.canonicalRepository,
  );
  const projectionVersions = await input.runtime.runtimeRepository.listProjectionVersions();
  const result = await retrieval.executeRetrieval({
    envelope: {
      queryText: [
        "Use model-memory evidence to find the project model-memory preference about model-owned capture and retrieval final inclusion.",
        `Select the memory containing proof marker ${input.marker}.`,
      ].join(" "),
      requestPurpose: "live_context_injection",
      scope: {
        projectId: "model-memory",
        memoryTraceId: `pre-gateway-retrieval-${input.marker}`,
      },
      sessionId: input.sessionId,
      maxResults: 8,
    },
    interpreter: new requestInterpreter.ExecutorBackedRetrievalRequestInterpreter(input.executor),
    memoryObjects,
    modelId: input.modelId,
    finalInclusionReviewer: new retrieval.ExecutorBackedRetrievalFinalInclusionReviewer(
      input.executor,
      {
        modelId: input.modelId,
        reasoningEffort: "low",
        maxOutputTokens: 1200,
      },
    ),
    finalInclusionModelId: input.modelId,
    store: input.runtime.retrievalStore,
    projectionVersions,
    createdAt: new Date(),
  });
  const markerRows = await queryMarkerEvidence(input.runtime.sqlClient, input.marker);
  const markerMemoryIds = new Set(markerRows.map((row) => row.memoryId));
  const selectedMemoryObjectIds = result?.finalInclusionReport?.selectedMemoryObjectIds ?? [];
  const recalledCandidateIds =
    result?.retrievalCandidates?.map((candidate) => candidate.memory?.id).filter(Boolean) ?? [];
  return {
    recalledCandidateIds,
    recalledMarkerMemoryIds: recalledCandidateIds.filter((id) => markerMemoryIds.has(id)),
    markerRows,
    selectedMemoryObjectIds,
    selectedMarkerMemoryIds: selectedMemoryObjectIds.filter((id) => markerMemoryIds.has(id)),
    finalInclusionReport: result?.finalInclusionReport,
    selectedItems:
      result?.retrievalResultItems
        ?.filter((item) => item.selectedForContext)
        .map((item) => ({
          memoryObjectId: item.memoryObjectId,
          rankIndex: item.rankIndex,
          reasonCodes: item.retrievalReasonCodes,
        })) ?? [],
    rawPromptPersisted: false,
    rawModelResponsePersisted: false,
  };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, OUTPUT_ROOT, stamp);
  await mkdir(outputDir, { recursive: true });
  const progress = createProgressLogger(outputDir);

  const ordinaryMarker = `PHASE2-LIVE-GW-ORDINARY-${stamp}`;
  const longMarkers = [
    `PHASE2-LIVE-GW-LONG-A-${stamp}`,
    `PHASE2-LIVE-GW-LONG-B-${stamp}`,
    `PHASE2-LIVE-GW-LONG-C-${stamp}`,
    `PHASE2-LIVE-GW-LONG-D-${stamp}`,
  ];
  const traces = [];
  const [database, capture, liveExecutor, modelExecution, sourceAuthority] = await Promise.all([
    tsImport("../src/agents/model-memory.database.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/live-ordinary-turn-capture-service.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../src/agents/model-memory.live-json-executor.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/model-execution.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/source-authority.ts", { parentURL: import.meta.url }),
  ]);
  const { loadConfig } = await tsImport("../src/config/config.ts", { parentURL: import.meta.url });
  const config = loadConfig();
  const runtime = await database.createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });
  const executor = new liveExecutor.OpenAICompatibleLiveJsonExecutor({
    config,
    requestTimeoutMs: Number(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS ?? 180_000),
    onTrace(trace) {
      traces.push(summarizeTrace(trace));
    },
  });
  class LiveInterpreter {
    async interpret(input) {
      const response = await executor.execute({
        contract: input.prompt.contract,
        systemPrompt: input.prompt.systemPrompt,
        userPrompt: input.prompt.userPrompt,
        responseFormat: input.prompt.responseFormat,
        responseOptions: input.prompt.responseOptions,
      });
      const parsed = modelExecution.parseJsonModelOutput(
        response,
        input.prompt.contract,
        z.unknown(),
      );
      return {
        action: "capture",
        objects: Array.isArray(parsed) ? parsed : [parsed],
      };
    }
  }
  const interpreter = new LiveInterpreter();
  const report = {
    schemaVersion: "phase2_pre_gateway_live_stimuli_validation.v1",
    generatedAt: new Date().toISOString(),
    commitHash: readGitHead(root),
    outputDir,
    modelRoutes: {
      memoryCaptureRetrieval: MEMORY_MODEL_ID,
    },
    prompts: {
      ordinaryPromptHash: null,
      longPromptHash: null,
      ordinaryMarker,
      longMarkers,
    },
    runs: {},
    checks: {},
    safety: {
      rawFullTranscriptPersisted: false,
      rawPromptPersisted: false,
      rawProviderLogPersisted: false,
      rawToolLogPersisted: false,
      hiddenReasoningPersisted: false,
      secretsPrivatePhrasesPersisted: false,
      deterministicSemanticFallback: false,
      outboundSending: false,
      actionExecution: false,
      skillInstallOrPromotion: false,
    },
  };

  try {
    await progress.write("openclaw_ordinary_turn", "started", { marker: ordinaryMarker });
    const ordinaryPrompt = [
      `Please remember this exact project fact for model-memory: validation marker ${ordinaryMarker} identifies the project rule that OpenClaw should use model-owned memory capture and retrieval final inclusion.`,
      "Reply with one short acknowledgement only.",
    ].join("\n");
    const longPrompt = openClawLongPromptText(stamp, longMarkers);
    report.prompts.ordinaryPromptHash = sha256(ordinaryPrompt);
    report.prompts.longPromptHash = sha256(longPrompt);

    report.runs.openClawOrdinaryTurn = await runOpenClawCapture({
      runtime,
      capture,
      sourceAuthority,
      interpreter,
      modelId: MEMORY_MODEL_ID,
      text: ordinaryPrompt,
      marker: ordinaryMarker,
      proofKind: "ordinary_live_gateway_stimulus",
      sessionId: `pre-gateway-ordinary-${stamp}`,
      traceId: `pre-gateway-ordinary-${stamp}`,
    });
    report.runs.openClawOrdinaryTurn.markerRows = await queryMarkerEvidence(
      runtime.sqlClient,
      ordinaryMarker,
    );
    await progress.write("openclaw_ordinary_turn", "completed", {
      markerRows: report.runs.openClawOrdinaryTurn.markerRows.length,
      writeCounts: report.runs.openClawOrdinaryTurn.writeCounts,
    });

    await progress.write("openclaw_long_prompt", "started", { markerCount: longMarkers.length });
    report.runs.openClawLongPrompt = await runOpenClawCapture({
      runtime,
      capture,
      sourceAuthority,
      interpreter,
      modelId: MEMORY_MODEL_ID,
      text: longPrompt,
      marker: longMarkers[0],
      proofKind: "long_prompt_live_gateway_stimulus",
      sessionId: `pre-gateway-long-${stamp}`,
      traceId: `pre-gateway-long-${stamp}`,
      maxWordsPerWindow: Number(
        process.env.MODEL_MEMORY_PHASE2_LIVE_UI_LONG_PROMPT_MAX_WORDS_PER_WINDOW ?? "500",
      ),
    });
    report.runs.openClawLongPrompt.markerRowsByMarker = {};
    for (const marker of longMarkers) {
      report.runs.openClawLongPrompt.markerRowsByMarker[marker] = await queryMarkerEvidence(
        runtime.sqlClient,
        marker,
      );
    }
    await progress.write("openclaw_long_prompt", "completed", {
      durableMemoriesWrittenCount: report.runs.openClawLongPrompt.durableMemoriesWrittenCount,
      writeCounts: report.runs.openClawLongPrompt.writeCounts,
      markerRowsByMarker: Object.fromEntries(
        Object.entries(report.runs.openClawLongPrompt.markerRowsByMarker).map(([marker, rows]) => [
          marker,
          rows.length,
        ]),
      ),
    });

    await progress.write("codex_regular_capture", "started");
    report.runs.codexRegularCapture = await runCodexCapture({
      outputDir,
      stamp,
      modelId: MEMORY_MODEL_ID,
    });
    await progress.write("codex_regular_capture", "completed", {
      status: report.runs.codexRegularCapture?.status,
      activityCounts: report.runs.codexRegularCapture?.report?.activityCounts,
    });

    await progress.write("retrieval_marker_proof", "started", { marker: ordinaryMarker });
    report.runs.retrievalMarkerProof = await runRetrievalMarkerProof({
      runtime,
      executor,
      modelId: MEMORY_MODEL_ID,
      marker: ordinaryMarker,
      sessionId: `pre-gateway-retrieval-${stamp}`,
    });
    await progress.write("retrieval_marker_proof", "completed", {
      recalledMarkerMemoryIds: report.runs.retrievalMarkerProof.recalledMarkerMemoryIds,
      selectedMarkerMemoryIds: report.runs.retrievalMarkerProof.selectedMarkerMemoryIds,
    });
  } finally {
    await runtime.pool.end();
  }

  const longMarkerRows = Object.values(report.runs.openClawLongPrompt?.markerRowsByMarker ?? {});
  const codexCaptures = report.runs.codexRegularCapture?.report?.captures ?? [];
  report.checks = {
    openClawOrdinaryTurnAdmitted: (report.runs.openClawOrdinaryTurn?.markerRows?.length ?? 0) > 0,
    openClawLongPromptAdmitted:
      longMarkerRows.some((rows) => rows.length > 0) ||
      (report.runs.openClawLongPrompt?.durableMemoriesWrittenCount ?? 0) > 0,
    codexUserTurnCovered:
      (report.runs.codexRegularCapture?.report?.activityCounts?.user ?? 0) > 0 &&
      codexCaptures.some((captureResult) => {
        return (
          captureResult.role === "user" &&
          (captureResult.status === "captured" ||
            (captureResult.status === "skipped" && captureResult.reason === "already_ingested"))
        );
      }),
    codexRegularCaptureNoFailures:
      (report.runs.codexRegularCapture?.report?.activityCounts?.failed ?? 0) === 0,
    retrievalFinalInclusionSelected:
      (report.runs.retrievalMarkerProof?.selectedMarkerMemoryIds?.length ?? 0) > 0,
    noProhibitedArtifactContent: true,
  };
  assertNoProhibitedArtifactContent(report);

  const failures = Object.entries(report.checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  const jsonPath = path.join(outputDir, "pre-gateway-live-stimuli-proof.json");
  const markdownPath = path.join(outputDir, "summary.md");
  report.artifacts = { jsonPath, markdownPath };
  report.traces = traces;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      "# Phase 2 Pre-Gateway Live-Stimuli Validation",
      "",
      `- generatedAt: ${report.generatedAt}`,
      `- memoryModel: ${MEMORY_MODEL_ID}`,
      `- ordinaryRows: ${report.runs.openClawOrdinaryTurn?.markerRows?.length ?? 0}`,
      `- longMarkersWithRows: ${longMarkerRows.filter((rows) => rows.length > 0).length}`,
      `- codexStatus: ${report.runs.codexRegularCapture?.status ?? "unknown"}`,
      `- codexUserTurnCovered: ${report.checks.codexUserTurnCovered}`,
      `- retrievalSelected: ${report.checks.retrievalFinalInclusionSelected}`,
      `- failures: ${failures.length ? failures.join(", ") : "none"}`,
      `- json: ${jsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify({ ok: failures.length === 0, failures, jsonPath }, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
