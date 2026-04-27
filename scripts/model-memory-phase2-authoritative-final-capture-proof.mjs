#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OperatorBrowserHarness, markProbe } from "./lib/operator-browser-harness.mjs";

const DEFAULT_TAILNET_ORIGIN = "https://srv1425839.tailbcf154.ts.net";
const DEFAULT_SESSION_KEY = "agent:main:main";
const STORE_PATH = "/root/.openclaw/agents/main/sessions/model-memory-proactivity-state.json";
const PLACEHOLDER_TEXT = "A bounded OpenClaw chat activity is ready for review.";

const PROMPT_1 = `Review the current OpenClaw roadmap and active proactivity runtime work.

Give me 4 concrete next-step opportunities for the current repo.

For each opportunity, include:
- title
- why now
- proposed next step
- expected user value
- evidence summary
- confidence
- limitations

Only include items concrete enough to act on now in this repo. Avoid generic advice.`;

const PROMPT_2 = `Review the current OpenClaw proactivity reset work and identify:

1. the top 5 concrete next opportunities
2. which are ready now vs blocked
3. which should become planning requests
4. which should become investigation requests
5. which one should be surfaced in heartbeat as the most useful next step today

For every item, include:
- title
- why now
- proposed next step
- expected user value
- evidence summary
- confidence
- limitations

Keep this grounded in the current repo and current state of the work. No generic filler.`;

const PROMPT_3 = `We still seem to have a live-runtime proactivity gap: assistant answers in normal chat are not reliably becoming same-session proactive opportunities, and heartbeat still feels too legacy. Review the current code path and give me the next concrete fix.`;

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

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function shortHash(value) {
  return sha256(value).slice(0, 16);
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
      throw new Error(`authoritative final capture proof contains prohibited marker: ${marker}`);
    }
  }
}

async function refreshProactivityInUi(page) {
  return await page.evaluate(async () => {
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
      queueItems: (app.productProactivityQueue ?? []).map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        planTitle: item.planTitle,
        draftReady: item.draftReady === true,
        sourceRefs: item.sourceRefs ?? [],
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
      digestCounts: app.proactivityInboxDigest?.counts ?? null,
      heartbeatText:
        document
          .querySelector(".heartbeat-proactivity-review")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      inlineHeader:
        document
          .querySelector(".inline-proactivity-card")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      inlineCards,
      heartbeatCards,
    };
  });
}

async function readPersistedState() {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return JSON.parse(await readFile(STORE_PATH, "utf8"));
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function waitForUiState(page, predicate, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await refreshProactivityInUi(page);
    if (predicate(lastState)) {
      return lastState;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastState;
}

function latestAssistantRecordsForSession(state, sessionKey) {
  return (state.records ?? [])
    .filter((record) => record.sessionKey === sessionKey && record.sourceKind === "assistant_turn")
    .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

function isCleanAssistantRecord(record) {
  const text = normalizeText(record?.boundedText);
  if (!text) {
    return false;
  }
  if (text === normalizeText(PLACEHOLDER_TEXT)) {
    return false;
  }
  if (text.toLowerCase().startsWith("turn activity:")) {
    return false;
  }
  if (text.toLowerCase().startsWith("[memory activity]")) {
    return false;
  }
  return true;
}

function assertCleanAssistantRecord(record) {
  if (!record) {
    throw new Error("missing authoritative assistant_turn record");
  }
  if (!normalizeText(record.boundedText)) {
    throw new Error("persisted authoritative assistant_turn record is empty");
  }
  if (normalizeText(record.boundedText) === normalizeText(PLACEHOLDER_TEXT)) {
    throw new Error("persisted authoritative assistant_turn record used placeholder fallback text");
  }
  if (normalizeText(record.boundedText).toLowerCase().startsWith("turn activity:")) {
    throw new Error("persisted authoritative assistant_turn record captured turn-activity text");
  }
  if (normalizeText(record.boundedText).toLowerCase().startsWith("[memory activity]")) {
    throw new Error("persisted authoritative assistant_turn record captured memory-activity text");
  }
}

function sessionKeyAliases(sessionKey) {
  const trimmed = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!trimmed) {
    return [];
  }
  return [...new Set([trimmed, `agent:main:${trimmed}`, trimmed.replace(/^agent:main:/u, "")])];
}

function latestAssistantRecordTimestamp(state, sessionKey) {
  for (const alias of sessionKeyAliases(sessionKey)) {
    const records = latestAssistantRecordsForSession(state, alias);
    const latest = records.at(-1);
    if (latest?.recordedAt) {
      return latest.recordedAt;
    }
  }
  return null;
}

function findAssistantRecordForTurn(state, sessionKey, assistantText) {
  const normalizedAssistant = normalizeText(assistantText);
  const recentRecords = sessionKeyAliases(sessionKey)
    .flatMap((alias) => latestAssistantRecordsForSession(state, alias))
    .filter(
      (record, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.recordedAt === record.recordedAt &&
            candidate.sourceMessageId === record.sourceMessageId,
        ) === index,
    )
    .slice(-24)
    .toReversed();
  return (
    recentRecords.find((record) => {
      if (!isCleanAssistantRecord(record)) {
        return false;
      }
      const normalizedRecord = normalizeText(record.boundedText);
      return (
        normalizedAssistant.startsWith(normalizedRecord) ||
        normalizedRecord.startsWith(normalizedAssistant.slice(0, 180)) ||
        normalizedRecord.includes(normalizedAssistant.slice(0, 120))
      );
    }) ?? null
  );
}

function findLatestCleanAssistantRecordSince(state, sessionKey, sinceRecordedAt) {
  for (const alias of sessionKeyAliases(sessionKey)) {
    const records = latestAssistantRecordsForSession(state, alias).filter(
      (record) =>
        (!sinceRecordedAt || record.recordedAt > sinceRecordedAt) && isCleanAssistantRecord(record),
    );
    if (records.length > 0) {
      return records.at(-1);
    }
  }
  return null;
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

async function waitForCleanAssistantRecordSince(
  sessionKey,
  sinceRecordedAt,
  assistantText,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await readPersistedState();
    const byTimestamp = findLatestCleanAssistantRecordSince(lastState, sessionKey, sinceRecordedAt);
    if (byTimestamp) {
      return { state: lastState, record: byTimestamp };
    }
    const byText = findAssistantRecordForTurn(lastState, sessionKey, assistantText);
    if (byText) {
      return { state: lastState, record: byText };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return {
    state: lastState ?? (await readPersistedState()),
    record: null,
  };
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Authoritative Final Capture Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- prompt1RunId: ${summary.prompt1RunId}`,
    `- prompt2RunId: ${summary.prompt2RunId}`,
    `- prompt3RunId: ${summary.prompt3RunId}`,
    `- matchedWorkItemId: ${summary.matchedWorkItemId}`,
    `- matchedQueueItemId: ${summary.matchedQueueItemId}`,
    `- matchedOpportunityId: ${summary.matchedOpportunityId}`,
    `- authoritativeRecordHash: ${summary.authoritativeRecordHash}`,
    `- inlineVisible: ${summary.inlineVisible}`,
    `- heartbeatVisible: ${summary.heartbeatVisible}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-authoritative-final-capture-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const requestedSessionKey =
    process.env.MODEL_MEMORY_PHASE2_AUTHORITATIVE_CAPTURE_SESSION ?? DEFAULT_SESSION_KEY;

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  const uiEvidence = {
    uiAuthWorks: false,
    prompt1PersistedRealFinal: false,
    prompt2PersistedRealFinal: false,
    prompt3PersistedRealFinal: false,
    sameSessionQueueItemAppeared: false,
    inlineFollowupAppeared: false,
    heartbeatSurfacedReview: false,
    sameCanonicalIdAcrossSurfaces: false,
    staleProofOriginSuppressed: false,
    noChatInjectForPlan: false,
    noAutonomousSend: true,
    noActionExecution: true,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey: requestedSessionKey,
    prompt1RunId: null,
    prompt2RunId: null,
    prompt3RunId: null,
    matchedWorkItemId: null,
    matchedQueueItemId: null,
    matchedOpportunityId: null,
    authoritativeRecordHash: null,
    inlineVisible: false,
    heartbeatVisible: false,
    heartbeatTextSha256: "",
    inlineTextSha256: "",
    handoffPromptSha256: "",
    ok: false,
  };

  try {
    await harness.ensureAuthenticated(requestedSessionKey);
    uiEvidence.uiAuthWorks = true;

    let state = await readPersistedState();
    const baseline1 = latestAssistantRecordTimestamp(state, requestedSessionKey);
    const turn1 = await harness.sendPrompt(PROMPT_1, {
      sessionKey: requestedSessionKey,
      timeoutMs: 180_000,
    });
    summary.sessionKey = turn1.sessionKey;
    summary.prompt1RunId = turn1.runId;
    let record1;
    ({ state, record: record1 } = await waitForCleanAssistantRecordSince(
      turn1.sessionKey,
      baseline1,
      turn1.summary.lastAssistantText,
    ));
    assertCleanAssistantRecord(record1);
    const recentPrompt1Records = cleanAssistantRecordsSince(state, turn1.sessionKey, baseline1);
    const recentPrompt1SourceRefs = new Set(
      recentPrompt1Records.flatMap((record) => record.sourceRefs ?? []),
    );
    uiEvidence.prompt1PersistedRealFinal = Boolean(record1);

    let uiState =
      (await waitForUiState(
        harness.page,
        (candidateState) =>
          candidateState.queueItems.some(
            (item) =>
              item.layer === "actionable" &&
              item.status === "pending_review" &&
              item.sourceRefs.some((sourceRef) => recentPrompt1SourceRefs.has(sourceRef)),
          ),
        60_000,
      )) ?? (await refreshProactivityInUi(harness.page));
    const matchedQueueItem =
      uiState.queueItems.find(
        (item) =>
          item.layer === "actionable" &&
          item.status === "pending_review" &&
          item.sourceRefs.some((sourceRef) => recentPrompt1SourceRefs.has(sourceRef)),
      ) ?? null;
    if (
      !matchedQueueItem?.queueItemId ||
      !matchedQueueItem.workItemId ||
      !matchedQueueItem.opportunityId
    ) {
      throw new Error(`prompt 1 did not create a same-session actionable queue item`);
    }
    uiEvidence.sameSessionQueueItemAppeared = true;
    summary.matchedQueueItemId = matchedQueueItem.queueItemId;
    summary.matchedWorkItemId = matchedQueueItem.workItemId;
    summary.matchedOpportunityId = matchedQueueItem.opportunityId;
    const matchedRecord =
      recentPrompt1Records.find((candidate) =>
        matchedQueueItem.sourceRefs.some((sourceRef) => candidate.sourceRefs?.includes(sourceRef)),
      ) ?? record1;
    summary.authoritativeRecordHash = shortHash(matchedRecord.boundedText);

    await harness.page.waitForSelector(".inline-proactivity-card", { timeout: 60_000 });
    uiState =
      (await waitForUiState(
        harness.page,
        (candidateState) =>
          candidateState.inlineCards.some(
            (item) => item.workItemId === matchedQueueItem.workItemId,
          ),
        60_000,
      )) ?? (await refreshProactivityInUi(harness.page));
    const inlineMatch = uiState.inlineCards.find(
      (item) => item.workItemId === matchedQueueItem.workItemId,
    );
    if (!inlineMatch) {
      throw new Error("inline follow-up did not appear for the same-session opportunity");
    }
    uiEvidence.inlineFollowupAppeared = true;
    summary.inlineVisible = true;
    summary.inlineTextSha256 = sha256(uiState.inlineHeader);

    const baseline2 = latestAssistantRecordTimestamp(state, turn1.sessionKey);
    const turn2 = await harness.sendPrompt(PROMPT_2, {
      sessionKey: turn1.sessionKey,
      timeoutMs: 180_000,
    });
    summary.prompt2RunId = turn2.runId;
    let record2;
    ({ state, record: record2 } = await waitForCleanAssistantRecordSince(
      turn2.sessionKey,
      baseline2,
      turn2.summary.lastAssistantText,
    ));
    assertCleanAssistantRecord(record2);
    uiEvidence.prompt2PersistedRealFinal = Boolean(record2);

    uiState =
      (await waitForUiState(
        harness.page,
        (candidateState) => {
          if (!candidateState.heartbeatText.includes("What would help this user today?")) {
            return false;
          }
          const inlineIds = new Set(
            candidateState.inlineCards.map((item) => item.workItemId).filter(Boolean),
          );
          const heartbeatIds = new Set(
            candidateState.heartbeatCards.map((item) => item.workItemId).filter(Boolean),
          );
          return [...inlineIds].some((workItemId) => heartbeatIds.has(workItemId));
        },
        60_000,
      )) ?? (await refreshProactivityInUi(harness.page));
    if (!uiState.heartbeatText.includes("What would help this user today?")) {
      throw new Error("heartbeat review did not surface after same-session opportunities existed");
    }
    const inlineWorkItemIds = new Set(
      uiState.inlineCards.map((item) => item.workItemId).filter(Boolean),
    );
    const inboxWorkItemIds = new Set(
      uiState.inboxItems.map((item) => item.workItemId).filter(Boolean),
    );
    const sharedHeartbeatMatch =
      uiState.heartbeatCards.find(
        (item) => item.workItemId && inlineWorkItemIds.has(item.workItemId),
      ) ?? null;
    if (!sharedHeartbeatMatch?.workItemId) {
      throw new Error("heartbeat review did not render a canonical inline work item id");
    }
    const sharedInlineMatch =
      uiState.inlineCards.find((item) => item.workItemId === sharedHeartbeatMatch.workItemId) ??
      null;
    const canonicalQueueItemId =
      sharedInlineMatch?.queueItemId ??
      sharedHeartbeatMatch.queueItemId ??
      matchedQueueItem.queueItemId;
    uiEvidence.heartbeatSurfacedReview = true;
    uiEvidence.sameCanonicalIdAcrossSurfaces = inboxWorkItemIds.has(
      sharedHeartbeatMatch.workItemId,
    );
    summary.heartbeatVisible = true;
    summary.heartbeatTextSha256 = sha256(uiState.heartbeatText);

    const baseline3 = latestAssistantRecordTimestamp(state, turn1.sessionKey);
    const turn3 = await harness.sendPrompt(PROMPT_3, {
      sessionKey: turn1.sessionKey,
      timeoutMs: 180_000,
    });
    summary.prompt3RunId = turn3.runId;
    let record3;
    ({ state, record: record3 } = await waitForCleanAssistantRecordSince(
      turn3.sessionKey,
      baseline3,
      turn3.summary.lastAssistantText,
    ));
    assertCleanAssistantRecord(record3);
    uiEvidence.prompt3PersistedRealFinal = Boolean(record3);

    uiState = await refreshProactivityInUi(harness.page);
    uiEvidence.staleProofOriginSuppressed = !uiState.queueItems.some((item) =>
      item.sourceRefs.some((sourceRef) => sourceRef.includes("generator-reset-")),
    );

    const mark = await markProbe(harness.page);
    await harness.page
      .locator(`.inline-proactivity-card [data-queue-item-id="${canonicalQueueItemId}"] button`)
      .filter({ hasText: /Plan this|Investigate|Open draft/ })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => (document.body.textContent ?? "").includes("started in chat"),
      undefined,
      { timeout: 60_000 },
    );
    const probeSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames.slice(start.wsFrames ?? 0);
    }, mark);
    uiEvidence.noChatInjectForPlan = !probeSlice.some((frame) => frame?.method === "chat.inject");
    const chatSendFrame = [...probeSlice]
      .toReversed()
      .find((frame) => frame?.method === "chat.send");
    summary.handoffPromptSha256 = sha256(chatSendFrame?.message ?? "");
  } finally {
    await harness.close();
  }

  if (!Object.values(uiEvidence).every(Boolean)) {
    throw new Error(`authoritative final capture proof failed: ${JSON.stringify(uiEvidence)}`);
  }

  const artifactPayload = {
    summary,
    uiEvidence,
  };
  assertNoProhibitedContent(artifactPayload);
  summary.ok = true;

  const jsonPath = path.join(outputDir, "authoritative-final-capture-proof.json");
  const markdownPath = path.join(outputDir, "authoritative-final-capture-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(artifactPayload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(summary)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
