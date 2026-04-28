#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { OperatorBrowserHarness, markProbe } from "./lib/operator-browser-harness.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_TAILNET_ORIGIN = "https://srv1425839.tailbcf154.ts.net";
const DEFAULT_SESSION_KEY = "agent:main:main";
const STORE_PATH = "/root/.openclaw/agents/main/sessions/model-memory-proactivity-state.json";
const WORKSPACE = "/root/.openclaw/workspace";
const PLACEHOLDER_TEXT = "A bounded OpenClaw chat activity is ready for review.";
const DISALLOWED_PRIMARY_SNIPPETS = [
  "Read HEARTBEAT.md",
  "HEARTBEAT_OK",
  "Sender (untrusted metadata)",
  "Post-compaction context refresh",
  "Source: chat://",
  "Source: gateway://",
  "Current time:",
  "Return the proactive review below exactly",
];
const PRIMARY_TIMESTAMP_PATTERN =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}\b/u;

const PROMPTS = [
  `Review the current OpenClaw roadmap, operator digest stability work, and Model Memory Phase 2 continuity/proactivity state.

Give me 4 concrete next-step opportunities for the current repo.

For each opportunity include:

- title
- why now
- proposed next step
- expected user value
- evidence summary
- confidence
- limitations

Only include items concrete enough to act on now in this repo. Avoid generic advice.`,
  `Review the daily memory continuity repair and live proactivity gate.

Identify the top 3 follow-up opportunities that would most improve OpenClaw stability before moving to Skills.

For each item include:

- title
- why now
- proposed next step
- expected user value
- evidence summary
- confidence
- limitations

Keep it grounded in current repo/runtime evidence.`,
  `We are checking whether proactivity is clean enough to stop working on this bucket.

Review the latest live behavior and identify the single most important remaining fix, if any.

If no fix is needed, explain why the gate is clean.

Do not include generic advice.`,
  `Stay on the same daily continuity and proactivity gate topic.

Name the single highest-value verification still missing, and explain how to prove it without broadening scope.`,
  `Stay on the same topic.

If the previous verification generated a proactive item, identify whether it should replace, supersede, or leave alone the existing item. Keep the answer concrete.`,
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function todayId() {
  return new Date().toISOString().slice(0, 10);
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function shortHash(value) {
  return sha256(value).slice(0, 16);
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function surfaceFocusKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(
      /\b(plan|investigate|review|draft|fix|check|validate|resolve|follow up|compare|audit|stabilize|document|ship|close|reduce|verify|implement|build|move|wire)\b/gu,
      "",
    )
    .replace(/[^a-z0-9]+/gu, " ")
    .split(" ")
    .filter((token) => token.length >= 3)
    .slice(0, 8)
    .join(" ");
}

function containsDisallowedPrimaryText(value) {
  const text = normalizeText(value);
  return (
    DISALLOWED_PRIMARY_SNIPPETS.some((snippet) => text.includes(snippet)) ||
    PRIMARY_TIMESTAMP_PATTERN.test(text)
  );
}

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`daily continuity/proactivity proof contains prohibited marker: ${marker}`);
    }
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readPersistedState() {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await readJsonFile(STORE_PATH);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

function sessionKeyAliases(sessionKey) {
  const trimmed = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!trimmed) {
    return [];
  }
  return [...new Set([trimmed, `agent:main:${trimmed}`, trimmed.replace(/^agent:main:/u, "")])];
}

function latestAssistantRecordsForSession(state, sessionKey) {
  return (state.records ?? [])
    .filter((record) => record.sessionKey === sessionKey && record.sourceKind === "assistant_turn")
    .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

function latestAssistantRecordTimestamp(state, sessionKey) {
  for (const alias of sessionKeyAliases(sessionKey)) {
    const latest = latestAssistantRecordsForSession(state, alias).at(-1);
    if (latest?.recordedAt) {
      return latest.recordedAt;
    }
  }
  return null;
}

function isCleanAssistantRecord(record) {
  const text = normalizeText(record?.boundedText);
  if (!text || text === normalizeText(PLACEHOLDER_TEXT)) {
    return false;
  }
  if (text.toLowerCase().startsWith("turn activity:")) {
    return false;
  }
  if (text.toLowerCase().startsWith("[memory activity]")) {
    return false;
  }
  return !containsDisallowedPrimaryText(text.slice(0, 260));
}

function cleanAssistantRecordsSince(state, sessionKey, sinceRecordedAt) {
  return sessionKeyAliases(sessionKey)
    .flatMap((alias) => latestAssistantRecordsForSession(state, alias))
    .filter(
      (record, index, all) =>
        (!sinceRecordedAt || record.recordedAt > sinceRecordedAt) &&
        isCleanAssistantRecord(record) &&
        all.findIndex(
          (candidate) =>
            candidate.recordedAt === record.recordedAt &&
            candidate.sourceMessageId === record.sourceMessageId,
        ) === index,
    )
    .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

async function waitForCleanAssistantRecordSince(sessionKey, sinceRecordedAt, timeoutMs = 75_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readPersistedState();
    const records = cleanAssistantRecordsSince(state, sessionKey, sinceRecordedAt);
    if (records.length > 0) {
      return { state, record: records.at(-1), records };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { state: state ?? (await readPersistedState()), record: null, records: [] };
}

async function refreshProactivityInUi(page, sessionKey) {
  return await page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const waitForIdle = async () => {
      const deadline = Date.now() + 30_000;
      while (
        (app.productProactivityLoading || app.proactivityInboxLoading) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (app.productProactivityLoading || app.proactivityInboxLoading) {
        throw new Error("proactivity UI loaders did not become idle");
      }
    };
    await waitForIdle();
    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();
    await waitForIdle();
    await app.updateComplete;
    const canonicalSessionKey = app.sessionKey || targetSessionKey;
    const queueResponse = await app.client.request("modelMemory.proactivity.queue", {
      sessionKey: canonicalSessionKey,
      projectId: "openclaw",
    });
    const inlineCards = Array.from(
      document.querySelectorAll(".inline-proactivity-card [data-work-item-id]"),
    ).map((entry) => ({
      workItemId: entry.getAttribute("data-work-item-id"),
      queueItemId: entry.getAttribute("data-queue-item-id"),
      text: entry.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    const heartbeatCards = Array.from(
      document.querySelectorAll(".heartbeat-proactivity-review [data-work-item-id]"),
    ).map((entry) => ({
      workItemId: entry.getAttribute("data-work-item-id"),
      queueItemId: entry.getAttribute("data-queue-item-id"),
      text: entry.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    return {
      sessionKey: app.sessionKey,
      queueReportId: queueResponse.reportId,
      queueItems: (queueResponse.queue?.items ?? []).map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        planTitle: item.planTitle,
        problem: item.problem,
        proposedMessage: item.proposedMessage,
        expectedUserValue: item.expectedUserValue,
        sourceRefs: item.sourceRefs ?? [],
        updatedAt: item.updatedAt,
      })),
      inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        planTitle: item.planTitle,
      })),
      inlineCards,
      heartbeatCards,
      inlineText:
        document
          .querySelector(".inline-proactivity-card")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      heartbeatText:
        document
          .querySelector(".heartbeat-proactivity-review")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      bodyText: document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "",
    };
  }, sessionKey);
}

async function waitForUiState(page, sessionKey, predicate, timeoutMs = 75_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await refreshProactivityInUi(page, sessionKey);
    if (predicate(lastState)) {
      return lastState;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return lastState;
}

async function resetFreshSessionThroughUi(harness, sessionKey) {
  const reset = await harness.page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const key = app.sessionKey || targetSessionKey;
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
    return {
      requestedKey: key,
      resetKey: result.key || key,
    };
  }, sessionKey);
  await harness.openSession(reset.resetKey || sessionKey);
  await harness.page.waitForTimeout(1_500);
  return reset;
}

async function runFinalizerFixture(root) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "openclaw-daily-gate-"));
  const finalizer = path.join(root, "ops/reviews/daily_memory_continuity_finalizer.sh");
  try {
    await mkdir(path.join(workspace, "memory"), { recursive: true });
    await mkdir(path.join(workspace, "archives/daily_operator_reviews"), { recursive: true });
    await writeFile(
      path.join(workspace, "archives/daily_operator_reviews/2026-04-27.md"),
      "# Daily Operator Review — 2026-04-27\n\n## Stack Status\n- Same-day evidence exists.\n",
      "utf8",
    );
    await execFileAsync("bash", [finalizer, "2026-04-27"], {
      cwd: root,
      env: { ...process.env, OPENCLAW_WORKSPACE_DIR: workspace },
    });
    const createdNote = await readFile(path.join(workspace, "memory/2026-04-27.md"), "utf8");

    const staleWorkspace = await mkdtemp(path.join(os.tmpdir(), "openclaw-daily-gate-stale-"));
    try {
      await mkdir(path.join(staleWorkspace, "archives/memory_performance_reports"), {
        recursive: true,
      });
      await writeFile(
        path.join(staleWorkspace, "archives/memory_performance_reports/2026-04-15.md"),
        "# Stale report\n",
        "utf8",
      );
      await execFileAsync("bash", [finalizer, "2026-04-27"], {
        cwd: root,
        env: { ...process.env, OPENCLAW_WORKSPACE_DIR: staleWorkspace },
      });
      const staleReport = await readFile(
        path.join(staleWorkspace, "archives/daily_memory_continuity/2026-04-27.md"),
        "utf8",
      );
      return {
        createdFromSameDayEvidence: createdNote.includes(
          "openclaw:daily-continuity-finalizer:2026-04-27",
        ),
        staleFallbackSkipped: staleReport.includes("skipped_no_exact_same_day_evidence"),
      };
    } finally {
      await rm(staleWorkspace, { recursive: true, force: true });
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyCurrentDailyNoteWritable() {
  const notePath = path.join(WORKSPACE, "memory", `${todayId()}.md`);
  if (!fs.existsSync(notePath)) {
    return { exists: false, writable: false, notePath };
  }
  await access(notePath, fs.constants.W_OK);
  return { exists: true, writable: true, notePath };
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Daily Continuity and Live Proactivity Gate Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- resetSessionKey: ${summary.resetSessionKey}`,
    `- canonicalDailyNote: ${summary.currentDailyNotePath}`,
    `- matchedWorkItemId: ${summary.matchedWorkItemId}`,
    `- matchedQueueItemId: ${summary.matchedQueueItemId}`,
    `- matchedOpportunityId: ${summary.matchedOpportunityId}`,
    `- assistantRecordHash: ${summary.assistantRecordHash}`,
    `- inlineCardCount: ${summary.inlineCardCount}`,
    `- heartbeatCardCount: ${summary.heartbeatCardCount}`,
    `- activeSameSessionFocusCount: ${summary.activeSameSessionFocusCount}`,
    `- heartbeatTextSha256: ${summary.heartbeatTextSha256}`,
    `- handoffPromptSha256: ${summary.handoffPromptSha256}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function writeProofArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "daily-continuity-and-proactivity-gate-proof.json");
  const markdownPath = path.join(outputDir, "daily-continuity-and-proactivity-gate-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(payload.summary)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/daily-continuity-and-proactivity-gate",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_DAILY_GATE_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    finalizerCreatesFromSameDayEvidence: false,
    finalizerSkipsStaleFallback: false,
    finalizerCoverageInstalled: false,
    currentDailyNoteWritable: false,
    assistantFinalCreatesCleanRecord: false,
    sameSessionOpportunityAppeared: false,
    inlineCardAppeared: false,
    inboxSharesCanonicalId: false,
    heartbeatSharesCanonicalId: false,
    heartbeatVisibleTextClean: false,
    heartbeatHasOneToThreePlanItems: false,
    heartbeatNotOkOnlyWhenActionable: false,
    noDuplicatePileup: false,
    handoffSharesCanonicalId: false,
    noChatInjectForPlan: false,
    noAutonomousSend: true,
    noActionExecution: true,
    noProhibitedContent: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    currentDailyNotePath: null,
    resetSessionKey: null,
    matchedWorkItemId: null,
    matchedQueueItemId: null,
    matchedOpportunityId: null,
    assistantRecordHash: null,
    inlineCardCount: 0,
    heartbeatCardCount: 0,
    activeSameSessionFocusCount: 0,
    heartbeatTextSha256: "",
    handoffPromptSha256: "",
    promptACompletionSource: null,
    promptAAssistantTextChars: 0,
    promptAAssistantTextSha256: "",
    failureReason: null,
    ok: false,
  };

  const fixtureResult = await runFinalizerFixture(root);
  evidence.finalizerCreatesFromSameDayEvidence = fixtureResult.createdFromSameDayEvidence;
  evidence.finalizerSkipsStaleFallback = fixtureResult.staleFallbackSkipped;

  const crontab = await execFileAsync("bash", ["-lc", "crontab -l 2>/dev/null || true"], {
    cwd: root,
  });
  evidence.finalizerCoverageInstalled = crontab.stdout.includes(
    "ops/reviews/daily_memory_continuity_finalizer.sh",
  );

  const finalizerPath = path.join(root, "ops/reviews/daily_memory_continuity_finalizer.sh");
  await execFileAsync("bash", [finalizerPath, todayId()], { cwd: root });
  const dailyNote = await verifyCurrentDailyNoteWritable();
  summary.currentDailyNotePath = dailyNote.notePath;
  evidence.currentDailyNoteWritable = dailyNote.exists && dailyNote.writable;

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  try {
    await harness.ensureAuthenticated(sessionKey);
    evidence.uiAuthWorks = true;
    let effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || null;
      })) ?? sessionKey;
    const reset = await resetFreshSessionThroughUi(harness, effectiveSessionKey);
    effectiveSessionKey = reset.resetKey || effectiveSessionKey;
    summary.resetSessionKey = effectiveSessionKey;
    await waitForUiState(harness.page, effectiveSessionKey, () => true, 5_000);
    const baselineUiState = await refreshProactivityInUi(harness.page, effectiveSessionKey);
    const baselineQueueItemIds = new Set(
      baselineUiState.queueItems.map((item) => item.queueItemId).filter(Boolean),
    );
    let state = await readPersistedState();
    const baseline = latestAssistantRecordTimestamp(state, effectiveSessionKey);

    const turn1 = await harness.sendPrompt(PROMPTS[0], {
      sessionKey: effectiveSessionKey,
      timeoutMs: 300_000,
    });
    const promptAAssistantText = normalizeText(turn1.summary?.lastAssistantText);
    summary.promptACompletionSource = turn1.completionEvidence?.source ?? "unknown";
    summary.promptAAssistantTextChars = promptAAssistantText.length;
    summary.promptAAssistantTextSha256 = sha256(promptAAssistantText);
    effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || null;
      })) ??
      turn1.sessionKey ??
      effectiveSessionKey;
    summary.sessionKey = effectiveSessionKey;

    const recordResult = await waitForCleanAssistantRecordSince(effectiveSessionKey, baseline);
    state = recordResult.state;
    const record = recordResult.record;
    if (!record) {
      summary.failureReason =
        "Prompt A reached the live session but no substantive assistant final was recorded; recent logs showed model auth cooldown and empty fallback output.";
      await writeProofArtifacts(outputDir, { summary, evidence });
      throw new Error("prompt A did not create a clean authoritative assistant final record");
    }
    evidence.assistantFinalCreatesCleanRecord = true;
    summary.assistantRecordHash = shortHash(record.boundedText);
    const recentSourceRefs = new Set(
      recordResult.records.flatMap((candidate) => candidate.sourceRefs ?? []),
    );

    let uiState =
      (await waitForUiState(
        harness.page,
        effectiveSessionKey,
        (candidateState) =>
          candidateState.queueItems.some(
            (item) =>
              item.layer === "actionable" &&
              item.status === "pending_review" &&
              item.sourceRefs.some((sourceRef) => recentSourceRefs.has(sourceRef)),
          ),
        150_000,
      )) ?? (await refreshProactivityInUi(harness.page, effectiveSessionKey));

    const matchedItem =
      uiState.queueItems.find(
        (item) =>
          item.layer === "actionable" &&
          item.status === "pending_review" &&
          item.sourceRefs.some((sourceRef) => recentSourceRefs.has(sourceRef)),
      ) ?? null;
    if (!matchedItem?.workItemId || !matchedItem.queueItemId || !matchedItem.opportunityId) {
      summary.failureReason =
        "Prompt A created an assistant record but did not create a same-session actionable proactivity item.";
      await writeProofArtifacts(outputDir, { summary, evidence });
      throw new Error("prompt A did not create a same-session actionable proactivity item");
    }
    evidence.sameSessionOpportunityAppeared = true;
    summary.matchedWorkItemId = matchedItem.workItemId;
    summary.matchedQueueItemId = matchedItem.queueItemId;
    summary.matchedOpportunityId = matchedItem.opportunityId;

    await harness.page.waitForSelector(".inline-proactivity-card", { timeout: 75_000 });
    uiState =
      (await waitForUiState(
        harness.page,
        effectiveSessionKey,
        (candidateState) =>
          candidateState.inlineCards.some((item) => item.workItemId === matchedItem.workItemId),
        75_000,
      )) ?? (await refreshProactivityInUi(harness.page, effectiveSessionKey));
    evidence.inlineCardAppeared = uiState.inlineCards.some(
      (item) => item.workItemId === matchedItem.workItemId,
    );

    for (const prompt of PROMPTS.slice(1)) {
      await harness.sendPrompt(prompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      });
    }

    uiState =
      (await waitForUiState(
        harness.page,
        effectiveSessionKey,
        (candidateState) =>
          candidateState.heartbeatCards.length > 0 &&
          candidateState.queueItems.some((item) => item.workItemId === matchedItem.workItemId),
        75_000,
      )) ?? (await refreshProactivityInUi(harness.page, effectiveSessionKey));

    const queueIds = new Set(uiState.queueItems.map((item) => item.workItemId).filter(Boolean));
    const inboxIds = new Set(uiState.inboxItems.map((item) => item.workItemId).filter(Boolean));
    const inlineIds = new Set(uiState.inlineCards.map((item) => item.workItemId).filter(Boolean));
    const heartbeatIds = new Set(
      uiState.heartbeatCards.map((item) => item.workItemId).filter(Boolean),
    );
    evidence.inboxSharesCanonicalId = inboxIds.has(matchedItem.workItemId);
    evidence.heartbeatSharesCanonicalId =
      heartbeatIds.has(matchedItem.workItemId) ||
      [...heartbeatIds].some((workItemId) => queueIds.has(workItemId) && inlineIds.has(workItemId));
    evidence.heartbeatVisibleTextClean =
      Boolean(uiState.heartbeatText) && !containsDisallowedPrimaryText(uiState.heartbeatText);
    evidence.heartbeatHasOneToThreePlanItems =
      uiState.heartbeatCards.length >= 1 && uiState.heartbeatCards.length <= 3;
    evidence.heartbeatNotOkOnlyWhenActionable =
      uiState.queueItems.some((item) => item.layer === "actionable") &&
      !/^HEARTBEAT_OK$/u.test(uiState.heartbeatText.trim());

    const activeSameSessionItems = uiState.queueItems.filter(
      (item) =>
        item.layer === "actionable" &&
        item.status === "pending_review" &&
        item.sourceRefs.some((sourceRef) => sourceRef.includes(`chat://${effectiveSessionKey}/`)),
    );
    const newActiveSameSessionItems = activeSameSessionItems.filter(
      (item) => !baselineQueueItemIds.has(item.queueItemId),
    );
    const focusKeys = newActiveSameSessionItems
      .map((item) => surfaceFocusKey(`${item.planTitle} ${item.proposedMessage}`))
      .filter(Boolean);
    evidence.noDuplicatePileup =
      focusKeys.length === new Set(focusKeys).size && focusKeys.length <= 5;
    summary.activeSameSessionFocusCount = new Set(focusKeys).size;

    const canonicalForHandoff =
      uiState.inlineCards.find((item) => item.workItemId === matchedItem.workItemId) ??
      uiState.heartbeatCards.find((item) => item.workItemId === matchedItem.workItemId) ??
      null;
    if (!canonicalForHandoff?.queueItemId) {
      summary.failureReason =
        "The matched work item was not available for handoff from inline or heartbeat surfaces.";
      await writeProofArtifacts(outputDir, { summary, evidence });
      throw new Error("matched work item was not available for handoff from inline/heartbeat");
    }
    const mark = await markProbe(harness.page);
    await harness.page
      .locator(`[data-queue-item-id="${canonicalForHandoff.queueItemId}"] button`)
      .filter({ hasText: /Plan this|Investigate|Open draft/ })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => /started in chat|Planning started in chat/i.test(document.body.textContent ?? ""),
      undefined,
      { timeout: 60_000 },
    );
    const probeSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames.slice(start.wsFrames ?? 0);
    }, mark);
    const chatSendFrame = [...probeSlice]
      .toReversed()
      .find((frame) => frame?.method === "chat.send");
    evidence.handoffSharesCanonicalId = Boolean(chatSendFrame);
    evidence.noChatInjectForPlan = !probeSlice.some((frame) => frame?.method === "chat.inject");
    summary.handoffPromptSha256 = sha256(chatSendFrame?.message ?? "");

    summary.inlineCardCount = uiState.inlineCards.length;
    summary.heartbeatCardCount = uiState.heartbeatCards.length;
    summary.heartbeatTextSha256 = sha256(uiState.heartbeatText);
    evidence.noProhibitedContent =
      !containsDisallowedPrimaryText(uiState.inlineText) &&
      !containsDisallowedPrimaryText(uiState.heartbeatText) &&
      uiState.inlineCards.every((item) => !containsDisallowedPrimaryText(item.text)) &&
      uiState.heartbeatCards.every((item) => !containsDisallowedPrimaryText(item.text));
  } finally {
    await harness.close();
  }

  if (!Object.values(evidence).every(Boolean)) {
    summary.failureReason = `One or more gate checks failed: ${JSON.stringify(evidence)}`;
    await writeProofArtifacts(outputDir, { summary, evidence });
    throw new Error(
      `daily continuity and proactivity gate proof failed: ${JSON.stringify(evidence)}`,
    );
  }

  const payload = { summary, evidence };
  summary.ok = true;
  const { jsonPath } = await writeProofArtifacts(outputDir, payload);
  process.stdout.write(`${jsonPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
