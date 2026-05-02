#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

const OUTPUT_ROOT = ".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation";
const DEFAULT_TAILNET_ORIGIN = "https://srv1425839.tailbcf154.ts.net";
const MEMORY_MODEL_ID =
  process.env.MODEL_MEMORY_CODEX_CAPTURE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_CAPTURE_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const SKILL_PROACTIVITY_MODEL_ID =
  process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL?.trim() || "openai-codex/gpt-5.4";
const BAD_CARD_SNIPPETS = [
  "Turns a recent idea into a bounded next step",
  "without digging through the inbox",
  "Source:",
  "chat://",
  "gateway://",
  "HEARTBEAT_OK",
];

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

function boundedText(value, maxChars = 1600) {
  const text = String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, "[redacted-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/gu, "[redacted-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/gu, "[redacted-token]")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/gu, "[redacted-long-token]");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[bounded-truncated]`;
}

function normalizedText(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function assistantText(turn) {
  return (
    turn?.completionEvidence?.transcript?.assistantText ?? turn?.summary?.lastAssistantText ?? ""
  );
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

function runCommand(root, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 20,
    timeout: options.timeoutMs,
  });
  return {
    command: [command, ...args].join(" "),
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    ok: result.status === 0,
    timedOut: result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM",
    signal: result.signal,
    stdout: boundedText(result.stdout, options.maxStdoutChars ?? 4000),
    stderr: boundedText(result.stderr, options.maxStderrChars ?? 4000),
  };
}

function parseLastJsonObject(stdout) {
  const text = String(stdout ?? "").trim();
  for (let index = text.lastIndexOf("{"); index >= 0; index = text.lastIndexOf("{", index - 1)) {
    try {
      return JSON.parse(text.slice(index));
    } catch {
      // Keep scanning backwards.
    }
  }
  return null;
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
      throw new Error(`live gateway proof artifact contains prohibited marker: ${marker}`);
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
      console.error(`[live-gateway-proof] ${stage}: ${status}`);
    },
  };
}

function cardTextLooksModelAuthored(card) {
  const text = normalizedText(card?.primaryText ?? card?.text ?? "");
  return text.length > 0 && BAD_CARD_SNIPPETS.every((snippet) => !text.includes(snippet));
}

function cardTitleLooksReadable(title) {
  const text = normalizedText(title);
  if (!text) {
    return false;
  }
  const withoutKindPrefix = text.replace(
    /^(?:New skill|Improve skill|Merge skill|Proactive plan|Follow-up|Question|Draft ready|Repair):\s*/iu,
    "",
  );
  if (/\b[a-z0-9]+(?:[-_][a-z0-9]+){2,}\b/u.test(withoutKindPrefix)) {
    return false;
  }
  if (/^[a-z0-9 _-]+$/u.test(withoutKindPrefix) && /[a-z]/u.test(withoutKindPrefix)) {
    return false;
  }
  return true;
}

function assistantTextLooksActionFree(text) {
  const normalized = normalizedText(text).toLowerCase();
  return ![
    "committed as:",
    "i'll commit",
    "i will commit",
    "i’m recording",
    "i am recording",
    "recorded and committed",
    "remembered and logged",
  ].some((snippet) => normalized.includes(snippet));
}

async function resetFreshSessionThroughUi(harness, sessionKey) {
  const reset = await harness.page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const key = app.sessionKey || targetSessionKey;
    let lastError = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const result = await app.client.request("sessions.reset", { key, reason: "new" });
        if (!result?.ok) {
          throw new Error(`sessions.reset did not return ok for ${key}`);
        }
        app.chatMessages = [];
        app.chatQueue = [];
        app.chatRunId = null;
        app.chatSending = false;
        app.chatStream = null;
        app.chatSideResult = null;
        app.productProactivityQueue = [];
        app.productProactivityQueueResult = null;
        app.proactivityInboxDigest = null;
        return { requestedKey: key, resetKey: result.key || key };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("still active")) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }, sessionKey);
  await harness.openSession(reset.resetKey || sessionKey);
  await harness.page.waitForTimeout(1_500);
  return reset;
}

async function queryMarkerEvidence(sqlClient, marker, sinceIso) {
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
      WHERE (
          canonical_text ILIKE $1
          OR search_text ILIKE $1
          OR payload::text ILIKE $1
          OR source_refs::text ILIKE $1
        )
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [`%${marker}%`, sinceIso ?? null],
  );
  return result.rows.map((row) => ({
    memoryId: row.memory_id,
    status: row.status,
    kind: row.kind,
    artifactType: row.artifact_type,
    canonicalTextExcerpt: boundedText(row.canonical_text, 500),
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

async function queryRecentRetrievalEvidence(sqlClient, sinceIso, sessionKey) {
  const result = await sqlClient.query(
    `
      SELECT
        rr.id AS request_id,
        rr.session_id,
        rr.query_text,
        rr.request_purpose,
        rr.model_id,
        rr.created_at,
        rs.id AS result_set_id,
        rs.result_count,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'memoryObjectId', ri.memory_object_id,
              'rankIndex', ri.rank_index,
              'rankBand', ri.rank_band,
              'selectedForContext', ri.selected_for_context,
              'reasonCodes', ri.retrieval_reason_codes
            )
            ORDER BY ri.rank_index ASC
          ) FILTER (WHERE ri.id IS NOT NULL),
          '[]'::jsonb
        ) AS items
      FROM runtime_context.retrieval_requests rr
      LEFT JOIN runtime_context.retrieval_result_sets rs
        ON rs.retrieval_request_id = rr.id
      LEFT JOIN runtime_context.retrieval_result_items ri
        ON ri.retrieval_result_set_id = rs.id
      WHERE rr.created_at >= $1
        AND ($2::text IS NULL OR rr.session_id = $2 OR rr.session_id IS NULL)
      GROUP BY rr.id, rs.id
      ORDER BY rr.created_at DESC
      LIMIT 12
    `,
    [sinceIso, sessionKey ?? null],
  );
  return result.rows.map((row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      requestId: row.request_id,
      resultSetId: row.result_set_id,
      sessionId: row.session_id,
      requestPurpose: row.request_purpose,
      queryHash: sha256(row.query_text ?? ""),
      queryExcerpt: boundedText(row.query_text, 500),
      modelId: row.model_id,
      resultCount: row.result_count,
      candidateCount: items.length,
      selectedCount: items.filter((item) => item.selectedForContext).length,
      selectedMemoryObjectIds: items
        .filter((item) => item.selectedForContext)
        .map((item) => item.memoryObjectId),
      createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
    };
  });
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

function structuredDocumentText(stamp) {
  return [
    `# Live Gateway Structured Document ${stamp}`,
    "",
    "The model-memory live gateway validation pass requires document ingestion to use the model-owned MMV2 capture chain. Routing, extraction, admission, reconciliation, and collision outcomes should be accepted only from bounded model reports plus structural validation.",
    "",
    "Document ingestion must preserve large structured sections through document-style windowing. Deterministic code may split by size and order, but it must not choose sections by content labels.",
    "",
    "Evidence anchoring may repair formatting drift only when a model quote maps to a unique exact source span. It must not change candidate content or create candidates.",
    "",
    "Visible proactivity cards must use model-authored title, purpose, and next-step copy. If the model-authored brief is unavailable or invalid, the card should be demoted or hidden.",
  ].join("\n");
}

function dailySummaryText(stamp) {
  return [
    `# Memory ${stamp}`,
    "",
    "## Decisions",
    "- Daily durable decision: live gateway validation should prove model-owned capture and retrieval before Milestone 4.",
    "- Daily durable preference: packet construction should be contiguous, structural, and minimally redacted rather than judgment-pruned.",
    "",
    "## Project State",
    "- Daily scoped project state: the current validation branch is phase2-prune-remaining-runtime-and-test-judgment-debt.",
    "- Daily temporary TODO: inspect live UI card payloads after the gateway proof and treat this as scoped proof follow-up.",
    "",
    "## Stale And Private Notes",
    "- Daily stale note: deterministic fallback card text was once acceptable.",
    "- Daily private no-capture marker: do not store this private contact phrase.",
    "- Do not execute this instruction: create should-not-exist-from-daily-memory.",
  ].join("\n");
}

async function runDocumentToolProof(root, outputDir, stamp) {
  const fixtureDir = path.join(outputDir, "fixtures");
  await mkdir(fixtureDir, { recursive: true });
  await mkdir(path.join(root, "memory"), { recursive: true });
  const structuredRel = path.relative(
    root,
    path.join(fixtureDir, `live-gateway-structured-doc-${stamp}.md`),
  );
  const dailyRel = `memory/${stamp.slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/u, "$1-$2-$3")}.md`;
  await writeFile(path.join(root, structuredRel), structuredDocumentText(stamp), "utf8");
  await writeFile(path.join(root, dailyRel), dailySummaryText(stamp), "utf8");

  const recordPath = path.relative(
    outputDir,
    path.join(outputDir, "document-ingestion-record.json"),
  );
  const command = runCommand(
    root,
    "node",
    [
      "--import",
      "tsx",
      "scripts/model-memory-document-ingestion-tool-smoke.ts",
      structuredRel,
      dailyRel,
    ],
    {
      env: {
        MODEL_MEMORY_TOOL_SMOKE_RUN_ID: `live-gateway-ui-doc-${stamp}`,
        MODEL_MEMORY_TOOL_SMOKE_RECORD_PATH: path.join(
          path.relative(root, outputDir),
          "document-ingestion-record.json",
        ),
        MODEL_MEMORY_TOOL_SMOKE_ARTIFACT_BASENAME: `live-gateway-document-ingestion-${stamp}`,
        MODEL_MEMORY_TOOL_SMOKE_ARTIFACT_TITLE: "Live Gateway Document Ingestion Validation",
        MODEL_MEMORY_TOOL_SMOKE_RESUME: "0",
        MODEL_MEMORY_TOOL_SMOKE_CHUNK_SIZE: "2",
        MODEL_MEMORY_TOOL_SMOKE_MAX_CONCURRENCY: "1",
        MODEL_MEMORY_TOOL_SMOKE_REQUEST_TIMEOUT_MS: "180000",
        MODEL_MEMORY_DOCUMENT_INGEST_MODEL_ID: MEMORY_MODEL_ID,
        MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID: MEMORY_MODEL_ID,
      },
      timeoutMs: 900_000,
      maxStdoutChars: 7000,
      maxStderrChars: 7000,
    },
  );
  const parsed = parseLastJsonObject(command.stdout);
  return {
    command,
    parsed,
    fixturePaths: { structuredRel, dailyRel },
    recordPath,
  };
}

async function runCodexCaptureHook(root, outputDir, stamp) {
  const { loadConfig } = await tsImport(path.join(root, "src/config/config.ts"), import.meta.url);
  const { runCodexMemoryCaptureRuntimeHook } = await tsImport(
    path.join(root, "src/infra/model-memory-codex-capture-runtime.ts"),
    import.meta.url,
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
        outputDir,
        `codex-capture-hook-state-${stamp}.json`,
      ),
      MODEL_MEMORY_CODEX_CAPTURE_PROGRESS_PATH: path.join(
        outputDir,
        `codex-capture-progress-${stamp}.jsonl`,
      ),
      MODEL_MEMORY_CODEX_CAPTURE_MODEL: MEMORY_MODEL_ID,
    },
  });
}

async function readRecentCaptureJobEvents(baseDir, sinceIso, sessionKey) {
  const eventsPath = path.join(baseDir, "events.jsonl");
  try {
    const text = await readFile(eventsPath, "utf8");
    return text
      .split(/\r?\n/u)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
      .filter(
        (event) =>
          typeof event.observedAt === "string" &&
          event.observedAt >= sinceIso &&
          (!sessionKey || event.sessionKey === sessionKey),
      )
      .map((event) => ({
        observedAt: event.observedAt,
        eventType: event.eventType,
        status: event.status,
        jobId: event.jobId,
        sourceKind: event.sourceKind,
        sessionId: event.sessionId,
        sessionKey: event.sessionKey,
        failureClass: event.failureClass,
        stage: event.stage,
        safeRelatedIds: event.safeRelatedIds,
        metrics: event.metrics,
      }));
  } catch (error) {
    return [
      {
        observedAt: new Date().toISOString(),
        eventType: "capture_diagnostics_unavailable",
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

async function readProactivityUiState(page, sessionKey, screenshotPath) {
  await page
    .waitForSelector(".proactivity-entrypoint__button", { timeout: 90_000 })
    .catch(() => {});
  const state = await page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const waitForIdle = async () => {
      const deadline = Date.now() + 180_000;
      while (
        (app.productProactivityLoading || app.proactivityInboxLoading) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (app.productProactivityLoading || app.proactivityInboxLoading) {
        throw new Error("proactivity loaders did not become idle");
      }
    };
    const key = app.sessionKey || targetSessionKey;
    await waitForIdle();
    const queueResponse = await app.client.request("modelMemory.proactivity.queue", {
      sessionKey: key,
      projectId: "openclaw",
      candidateReviewCooldownMs: 0,
      candidateReviewForceRun: true,
    });
    app.productProactivityQueueResult = queueResponse ?? null;
    app.productProactivityQueue = Array.isArray(queueResponse?.queue?.items)
      ? queueResponse.queue.items
      : [];
    await app.loadProactivityInbox();
    app.sidebarOpen = true;
    app.sidebarContent = { kind: "proactivityInbox" };
    await waitForIdle();
    await app.updateComplete;
    const textWithoutDetails = (entry) => {
      const clone = entry.cloneNode(true);
      clone.querySelectorAll("details").forEach((details) => details.remove());
      return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
    };
    const cards = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((entry) => ({
        queueItemId: entry.getAttribute("data-queue-item-id") || null,
        workItemId: entry.getAttribute("data-work-item-id") || null,
        skillCandidateId: entry.getAttribute("data-skill-candidate-id") || null,
        primaryText: textWithoutDetails(entry),
      }));
    const queueItems = (app.productProactivityQueue ?? []).map((item) => ({
      queueItemId: item.queueItemId,
      workItemId: item.workItemId,
      opportunityId: item.opportunityId,
      opportunityClass: item.opportunityClass,
      status: item.status,
      layer: item.layer,
      primaryActionType: item.primaryAction?.actionType ?? null,
      skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
      sourceRefs: item.sourceRefs ?? [],
      blockedReasonCodes: item.blockedReasonCodes ?? [],
      briefTitle: item.userFacingBrief?.title ?? null,
      briefKindLabel: item.userFacingBrief?.kindLabel ?? null,
      briefPurpose: item.userFacingBrief?.oneLinePurpose ?? null,
      briefNextStep: item.userFacingBrief?.recommendedNextStep ?? null,
      briefQuality: item.userFacingBrief?.quality ?? null,
      briefAuthorship: item.userFacingBrief?.authorship ?? null,
    }));
    const firstVisible =
      queueItems.find((item) => item.briefAuthorship?.source === "model") ?? null;
    const handoffMessage =
      firstVisible && typeof app.buildProactivityHandoffMessage === "function"
        ? app.buildProactivityHandoffMessage(
            firstVisible.queueItemId,
            firstVisible.primaryActionType || "plan_this",
          )
        : null;
    return {
      sessionKey: key,
      queueResponse: {
        ok: queueResponse?.ok === true,
        reportId: queueResponse?.reportId ?? null,
        candidateReviewTriggerReport: queueResponse?.candidateReviewTriggerReport ?? null,
        candidateReviewReport: queueResponse?.candidateReviewReport ?? null,
        candidateReviewCodexAdapterReport: queueResponse?.candidateReviewCodexAdapterReport ?? null,
      },
      queueItems,
      inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityClass: item.opportunityClass,
        status: item.status,
        layer: item.layer,
        skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
        briefTitle: item.userFacingBrief?.title ?? null,
        briefKindLabel: item.userFacingBrief?.kindLabel ?? null,
        briefQuality: item.userFacingBrief?.quality ?? null,
        briefAuthorship: item.userFacingBrief?.authorship ?? null,
        blockedReasonCodes: item.blockedReasonCodes ?? [],
      })),
      inlineCards: cards(".inline-proactivity-card__item"),
      heartbeatCards: cards(".heartbeat-proactivity-review__card"),
      inboxCards: cards(".proactivity-inbox__item"),
      handoff: handoffMessage
        ? {
            queueItemId: firstVisible?.queueItemId ?? null,
            primaryText: handoffMessage
              .split(/\r?\n/u)
              .filter((line) => /^(?:Title|Purpose|Recommended next step):/u.test(line))
              .join(" "),
            hash: String(handoffMessage.length),
          }
        : null,
    };
  }, sessionKey);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return state;
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, OUTPUT_ROOT, stamp);
  await mkdir(outputDir, { recursive: true });
  const progress = createProgressLogger(outputDir);
  const generatedAt = new Date().toISOString();
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_LIVE_GATEWAY_UI_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const ordinaryMarker = `PHASE2-LIVE-GW-ORDINARY-${stamp}`;
  const longMarkers = [
    `PHASE2-LIVE-GW-LONG-A-${stamp}`,
    `PHASE2-LIVE-GW-LONG-B-${stamp}`,
    `PHASE2-LIVE-GW-LONG-C-${stamp}`,
    `PHASE2-LIVE-GW-LONG-D-${stamp}`,
  ];
  const retrievalStartedAt = new Date().toISOString();
  const report = {
    schemaVersion: "phase2_live_gateway_ui_model_owned_validation.v1",
    generatedAt,
    commitHash: readGitHead(root),
    sessionKey,
    modelRoutes: {
      memoryCaptureRetrieval: MEMORY_MODEL_ID,
      skillsProactivityCandidateReview: SKILL_PROACTIVITY_MODEL_ID,
    },
    safety: {
      rawFullTranscriptPersisted: false,
      rawPromptPersisted: false,
      rawProviderLogPersisted: false,
      rawToolLogPersisted: false,
      hiddenReasoningPersisted: false,
      secretsPrivatePhrasesPersisted: false,
      outboundSending: false,
      actionExecution: false,
      skillInstallOrPromotion: false,
      deterministicSemanticFallback: false,
    },
    commands: {},
    liveCapture: {},
    retrieval: {},
    proactivitySkills: {},
    uiCards: {},
    artifacts: {
      outputDir,
      progressPath: progress.path,
    },
    checks: {},
  };

  const { createModelMemoryDatabaseRuntime } = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const { resolveDefaultMemoryCaptureJobStoreDir } = await tsImport(
    path.join(root, "src/agents/model-memory.capture-jobs.ts"),
    import.meta.url,
  );
  const { loadConfig } = await tsImport(path.join(root, "src/config/config.ts"), import.meta.url);
  const config = loadConfig();

  await progress.write("browser_harness", "starting", { origin });
  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let effectiveSessionKey = sessionKey;
  const turns = [];
  try {
    await progress.write("browser_auth", "started", { sessionKey });
    await harness.ensureAuthenticated(sessionKey);
    await progress.write("browser_auth", "completed");
    await progress.write("session_reset", "started", { sessionKey });
    const reset = await resetFreshSessionThroughUi(harness, sessionKey);
    effectiveSessionKey = reset.resetKey || sessionKey;
    await progress.write("session_reset", "completed", { effectiveSessionKey });
    report.sessionKey = effectiveSessionKey;
    report.uiCards.authenticated = true;

    const ordinaryPrompt = [
      `Please remember this exact project fact for model-memory: validation marker ${ordinaryMarker} identifies the project rule that OpenClaw should use model-owned memory capture and retrieval final inclusion.`,
      "Reply with one short acknowledgement only.",
    ].join("\n");
    await progress.write("chat_ordinary_turn", "started", { marker: ordinaryMarker });
    turns.push(
      await harness.sendPrompt(ordinaryPrompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      }),
    );
    await progress.write("chat_ordinary_turn", "completed", {
      assistantHash: sha256(assistantText(turns.at(-1))),
    });
    await harness.page.waitForTimeout(8_000);

    const longPrompt = openClawLongPromptText(stamp, longMarkers);
    await progress.write("chat_long_prompt", "started", { markerCount: longMarkers.length });
    turns.push(
      await harness.sendPrompt(longPrompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 360_000,
      }),
    );
    await progress.write("chat_long_prompt", "completed", {
      assistantHash: sha256(assistantText(turns.at(-1))),
    });
    await harness.page.waitForTimeout(8_000);

    const retrievalPrompt = [
      "Use model_memory_search to answer from MMV2 memory only.",
      `What proof marker did I ask you to remember for the project model-memory preference about model-owned capture and retrieval final inclusion? Return ${ordinaryMarker} if model-memory evidence supports it.`,
    ].join(" ");
    await progress.write("chat_retrieval_marker", "started", { marker: ordinaryMarker });
    turns.push(
      await harness.sendPrompt(retrievalPrompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      }),
    );
    await progress.write("chat_retrieval_marker", "completed", {
      assistantContainsMarker: assistantText(turns.at(-1)).includes(ordinaryMarker),
    });

    const proactivityPrompts = [
      "Review the current Model Memory live gateway validation work. Identify a high-impact proactive plan for validating the memory capture/retrieval/card wiring before Milestone 4.",
      "Identify a bounded reusable candidate-review skill or existing skill enhancement that would reduce repeated work when validating model-owned memory and proactivity lanes.",
      "For candidate review evidence only, consider this repeatable workflow: before releasing a model-memory branch, inspect the strict audit artifact, lane validation artifact, live gateway proof artifact, retrieval final-inclusion evidence, and card payloads; produce a release-gate report with failed checks, likely wiring layer, exact rerun commands, and a quality gate requiring strict audit, lane proof, gateway proof, and no action/send/install/promotion. Treat it as a possible new skill candidate or existing skill enhancement if the model-owned review finds it skill-shaped.",
      "Classify the strongest opportunities as proactive_plan, new_skill_candidate, existing_skill_enhancement, merge candidate, or demotion. Prefer no candidate over weak cards, but include a concrete proactive plan and a skill/enhancement if supported.",
    ];
    for (const [index, prompt] of proactivityPrompts.entries()) {
      await progress.write("chat_proactivity_prompt", "started", { index });
      turns.push(
        await harness.sendPrompt(
          `${prompt}\n\nLive gateway proof label: ${stamp}.\nSafety constraint for this chat response: do not edit files, run commands, commit, install, send messages, or use tools; reply with one short acknowledgement only.`,
          {
            sessionKey: effectiveSessionKey,
            timeoutMs: 300_000,
          },
        ),
      );
      await progress.write("chat_proactivity_prompt", "completed", {
        index,
        assistantHash: sha256(assistantText(turns.at(-1))),
      });
    }

    const screenshotPath = path.join(outputDir, "proactivity-cards.png");
    await progress.write("proactivity_ui_state", "started");
    const proactivityUiState = await readProactivityUiState(
      harness.page,
      effectiveSessionKey,
      screenshotPath,
    );
    await progress.write("proactivity_ui_state", "completed", {
      queueItemCount: proactivityUiState.queueItems.length,
      inlineCardCount: proactivityUiState.inlineCards.length,
      heartbeatCardCount: proactivityUiState.heartbeatCards.length,
      inboxCardCount: proactivityUiState.inboxCards.length,
    });
    report.artifacts.proactivityScreenshot = screenshotPath;
    report.proactivitySkills = {
      queueResponse: proactivityUiState.queueResponse,
      acceptedProposalKinds:
        proactivityUiState.queueResponse.candidateReviewReport?.acceptedProposalKinds ?? [],
      sourceRuntimes: proactivityUiState.queueResponse.candidateReviewReport?.sourceRuntimes ?? [],
      queueItems: proactivityUiState.queueItems.map((item) => ({
        queueItemId: item.queueItemId,
        opportunityClass: item.opportunityClass,
        status: item.status,
        layer: item.layer,
        primaryActionType: item.primaryActionType,
        skillCandidateId: item.skillCandidateId,
        briefTitle: item.briefTitle,
        briefKindLabel: item.briefKindLabel,
        briefQuality: item.briefQuality,
        briefAuthorship: item.briefAuthorship,
        blockedReasonCodes: item.blockedReasonCodes,
        sourceRefCount: item.sourceRefs.length,
      })),
    };
    report.uiCards = {
      ...report.uiCards,
      inlineCards: proactivityUiState.inlineCards,
      heartbeatCards: proactivityUiState.heartbeatCards,
      inboxCards: proactivityUiState.inboxCards,
      handoff: proactivityUiState.handoff,
    };
  } finally {
    await harness.close();
    await progress.write("browser_harness", "closed");
  }

  report.liveCapture.turns = turns.map((turn, index) => ({
    index,
    runId: turn.runId,
    sessionKey: turn.sessionKey,
    promptHash: sha256(turn.prompt),
    assistantExcerpt: boundedText(assistantText(turn), 800),
    assistantTextHash: sha256(assistantText(turn)),
  }));

  await progress.write("document_ingestion_tool", "started");
  const documentProof = await runDocumentToolProof(root, outputDir, stamp);
  await progress.write("document_ingestion_tool", "completed", {
    ok: documentProof.command.ok,
    timedOut: documentProof.command.timedOut,
  });
  report.liveCapture.documentIngestion = {
    command: documentProof.command,
    artifactJsonPath: documentProof.parsed?.artifactJsonPath ?? null,
    artifactMarkdownPath: documentProof.parsed?.artifactMarkdownPath ?? null,
    fixturePaths: documentProof.fixturePaths,
    totals: documentProof.parsed?.artifactJsonPath ? documentProof.parsed?.result?.details : null,
  };

  await progress.write("codex_regular_capture", "started");
  report.liveCapture.codexRegularCapture = await runCodexCaptureHook(root, outputDir, stamp);
  await progress.write("codex_regular_capture", "completed", {
    status: report.liveCapture.codexRegularCapture?.status,
    activityCounts: report.liveCapture.codexRegularCapture?.report?.activityCounts,
  });
  await progress.write("capture_job_events", "started");
  report.liveCapture.captureJobEvents = await readRecentCaptureJobEvents(
    resolveDefaultMemoryCaptureJobStoreDir(process.env),
    generatedAt,
    effectiveSessionKey,
  );
  await progress.write("capture_job_events", "completed", {
    eventCount: report.liveCapture.captureJobEvents.length,
  });

  await progress.write("database_evidence_queries", "started");
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    applyMigrations: false,
  });
  try {
    const ordinaryRows = await queryMarkerEvidence(runtime.sqlClient, ordinaryMarker);
    const longRowsByMarker = {};
    for (const marker of longMarkers) {
      longRowsByMarker[marker] = await queryMarkerEvidence(runtime.sqlClient, marker, generatedAt);
    }
    const longRowsByContent = {
      boundedWindows: await queryMarkerEvidence(
        runtime.sqlClient,
        "document-style bounded windows",
        generatedAt,
      ),
      retrievalFinalInclusion: await queryMarkerEvidence(
        runtime.sqlClient,
        "retrieval final inclusion",
        generatedAt,
      ),
      codexCapture: await queryMarkerEvidence(runtime.sqlClient, "Codex capture", generatedAt),
    };
    // Gateway telemetry stores the internal session UUID, while the UI proof
    // drives the stable operator alias. Scope by proof start time here so we
    // do not miss valid model-owned inclusion rows due alias/UUID translation.
    const retrievalEvidence = await queryRecentRetrievalEvidence(
      runtime.sqlClient,
      retrievalStartedAt,
      null,
    );
    const ordinaryMarkerMemoryIds = new Set(ordinaryRows.map((row) => row.memoryId));
    const selectedMemoryObjectIds = [
      ...new Set(retrievalEvidence.flatMap((entry) => entry.selectedMemoryObjectIds)),
    ];
    report.liveCapture.openClawOrdinaryTurn = {
      marker: ordinaryMarker,
      admittedRows: ordinaryRows,
    };
    report.liveCapture.openClawLongPrompt = {
      markers: longMarkers,
      admittedRowsByMarker: longRowsByMarker,
      admittedMarkerCount: Object.values(longRowsByMarker).filter((rows) => rows.length > 0).length,
      admittedRowsByContent: longRowsByContent,
      admittedContentCount: Object.values(longRowsByContent).filter((rows) => rows.length > 0)
        .length,
    };
    report.retrieval = {
      assistantAnsweredWithMarker: assistantText(turns[2]).includes(ordinaryMarker),
      assistantExcerpt: boundedText(assistantText(turns[2]), 1200),
      recentRetrievalRequests: retrievalEvidence,
      selectedMemoryObjectIds,
      selectedMarkerMemoryIds: selectedMemoryObjectIds.filter((id) =>
        ordinaryMarkerMemoryIds.has(id),
      ),
    };
  } finally {
    await runtime.pool.end();
  }
  await progress.write("database_evidence_queries", "completed", {
    ordinaryRows: report.liveCapture.openClawOrdinaryTurn?.admittedRows?.length ?? 0,
    selectedMarkerMemoryIds: report.retrieval.selectedMarkerMemoryIds?.length ?? 0,
  });

  const modelAuthoredItems =
    report.proactivitySkills.queueItems?.filter(
      (item) => item.briefAuthorship?.source === "model" && item.briefQuality?.status !== "demote",
    ) ?? [];
  const allVisibleCards = [
    ...(report.uiCards.inlineCards ?? []),
    ...(report.uiCards.heartbeatCards ?? []),
    ...(report.uiCards.inboxCards ?? []),
  ];
  const acceptedKinds = report.proactivitySkills.acceptedProposalKinds ?? [];
  report.checks = {
    openClawOrdinaryTurnAdmitted: report.liveCapture.openClawOrdinaryTurn?.admittedRows?.length > 0,
    openClawLongPromptAdmitted:
      report.liveCapture.openClawLongPrompt?.admittedMarkerCount > 0 ||
      report.liveCapture.openClawLongPrompt?.admittedContentCount > 0,
    documentIngestionCommandPassed:
      report.liveCapture.documentIngestion?.command?.ok === true &&
      (report.liveCapture.documentIngestion?.totals?.totals?.docsCompleted ?? 0) > 0,
    codexRegularCaptureExercised:
      report.liveCapture.codexRegularCapture?.status === "loaded" ||
      report.liveCapture.codexRegularCapture?.status === "degraded",
    codexUserTurnCovered:
      (report.liveCapture.codexRegularCapture?.report?.activityCounts?.user ?? 0) > 0 &&
      (report.liveCapture.codexRegularCapture?.report?.captures ?? []).some(
        (capture) =>
          capture.role === "user" &&
          (capture.status === "captured" ||
            (capture.status === "skipped" && capture.reason === "already_ingested")),
      ),
    codexRegularCaptureNoFailures:
      (report.liveCapture.codexRegularCapture?.report?.activityCounts?.failed ?? 0) === 0,
    retrievalAssistantReturnedMarker: report.retrieval.assistantAnsweredWithMarker === true,
    retrievalFinalInclusionSelected: (report.retrieval.selectedMarkerMemoryIds?.length ?? 0) > 0,
    candidateReviewRan:
      report.proactivitySkills.queueResponse?.candidateReviewReport?.source === "model" &&
      report.proactivitySkills.queueResponse?.candidateReviewReport?.validationStatus === "pass",
    proactivePlanSurfaced:
      acceptedKinds.includes("proactive_plan") ||
      (report.proactivitySkills.queueItems ?? []).some(
        (item) =>
          item.opportunityClass === "proactive_plan" &&
          item.status === "pending_review" &&
          item.layer === "actionable",
      ),
    skillOrEnhancementSurfaced: acceptedKinds.some((kind) =>
      ["new_skill_candidate", "existing_skill_enhancement", "merge_or_extend_candidate"].includes(
        kind,
      ),
    ),
    modelAuthoredCardsVisible: modelAuthoredItems.length > 0,
    modelAuthoredCardTitlesReadable: modelAuthoredItems.every((item) =>
      cardTitleLooksReadable(item.briefTitle),
    ),
    visibleCardsAvoidDeterministicFallback: allVisibleCards.every(cardTextLooksModelAuthored),
    noSendActionInstallPromotion: (report.proactivitySkills.queueItems ?? []).every(
      (item) =>
        item.primaryActionType !== "send_message" &&
        item.primaryActionType !== "install_skill" &&
        item.primaryActionType !== "promote_skill",
    ),
    assistantResponsesAvoidWorkspaceActionClaims: (report.liveCapture.turns ?? []).every((turn) =>
      assistantTextLooksActionFree(turn.assistantExcerpt),
    ),
    noProhibitedArtifactContent: true,
  };
  await progress.write("checks", "completed", {
    failures: Object.entries(report.checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name),
  });

  assertNoProhibitedArtifactContent(report);
  const failures = Object.entries(report.checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  const jsonPath = path.join(outputDir, "live-gateway-ui-validation-proof.json");
  const markdownPath = path.join(outputDir, "summary.md");
  report.artifacts.jsonPath = jsonPath;
  report.artifacts.markdownPath = markdownPath;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      "# Phase 2 Live Gateway/UI Model-Owned Validation",
      "",
      `- generatedAt: ${report.generatedAt}`,
      `- commit: ${report.commitHash}`,
      `- sessionKey: ${report.sessionKey}`,
      `- memoryModel: ${MEMORY_MODEL_ID}`,
      `- skillsProactivityModel: ${SKILL_PROACTIVITY_MODEL_ID}`,
      `- ordinaryTurnRows: ${report.liveCapture.openClawOrdinaryTurn?.admittedRows?.length ?? 0}`,
      `- longPromptAdmittedMarkers: ${report.liveCapture.openClawLongPrompt?.admittedMarkerCount ?? 0}`,
      `- documentCommandPassed: ${report.checks.documentIngestionCommandPassed}`,
      `- codexStatus: ${report.liveCapture.codexRegularCapture?.status ?? "unknown"}`,
      `- codexUserTurnCovered: ${report.checks.codexUserTurnCovered}`,
      `- retrievalSelected: ${report.checks.retrievalFinalInclusionSelected}`,
      `- acceptedProposalKinds: ${(report.proactivitySkills.acceptedProposalKinds ?? []).join(", ")}`,
      `- modelAuthoredCardsVisible: ${report.checks.modelAuthoredCardsVisible}`,
      `- modelAuthoredCardTitlesReadable: ${report.checks.modelAuthoredCardTitlesReadable}`,
      `- failures: ${failures.length ? failures.join(", ") : "none"}`,
      `- json: ${jsonPath}`,
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
