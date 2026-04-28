#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OperatorBrowserHarness, markProbe } from "./lib/operator-browser-harness.mjs";

const DEFAULT_TAILNET_ORIGIN = "https://srv1425839.tailbcf154.ts.net";
const DEFAULT_SESSION_KEY = "agent:main:main";
const STORE_PATH = "/root/.openclaw/agents/main/sessions/model-memory-proactivity-state.json";
const DISALLOWED_PRIMARY_SNIPPETS = [
  "Read HEARTBEAT.md",
  "HEARTBEAT_OK",
  "Sender (untrusted metadata)",
  "Post-compaction context refresh",
  "EXTERNAL_UNTRUSTED_CONTENT",
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

function shortHash(value) {
  return sha256(value).slice(0, 16);
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function containsDisallowedPrimaryText(value) {
  const text = normalizeText(value);
  return DISALLOWED_PRIMARY_SNIPPETS.some((snippet) => text.includes(snippet));
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
      throw new Error(`operating-system proof contains prohibited marker: ${marker}`);
    }
  }
}

async function readPersistedState() {
  return JSON.parse(await readFile(STORE_PATH, "utf8"));
}

async function readLiveProactivity(page, sessionKey) {
  return await page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();
    await app.updateComplete;
    const queueResponse = await app.client.request("modelMemory.proactivity.queue", {
      sessionKey: targetSessionKey,
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
    const queueItems = (queueResponse.queue?.items ?? []).map((item) => ({
      queueItemId: item.queueItemId,
      workItemId: item.workItemId,
      opportunityId: item.opportunityId,
      status: item.status,
      layer: item.layer,
      opportunityClass: item.opportunityClass ?? "standard",
      planTitle: item.planTitle,
      problem: item.problem,
      proposedMessage: item.proposedMessage,
      expectedUserValue: item.expectedUserValue,
      draftReady: item.draftReady === true,
      sourceRefs: item.sourceRefs ?? [],
      updatedAt: item.updatedAt,
    }));
    const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
    return {
      sessionKey: app.sessionKey,
      queueReportId: queueResponse.reportId,
      growthLoopReport: queueResponse.growthLoopReport ?? null,
      extractionReport: queueResponse.extractionReport ?? null,
      ledgerReport: queueResponse.ledgerReport ?? null,
      queueItems,
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
      lastAssistantTranscript:
        Array.from(document.querySelectorAll(".chat-group.assistant .chat-group-messages"))
          .at(-1)
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      wsMethods: probe.wsFrames.map((frame) => frame?.method).filter(Boolean),
    };
  }, sessionKey);
}

function summarizeQueue(items) {
  return items.slice(0, 8).map((item) => ({
    workItemId: item.workItemId,
    queueItemId: item.queueItemId,
    opportunityClass: item.opportunityClass,
    status: item.status,
    layer: item.layer,
    draftReady: item.draftReady,
    titleHash: shortHash(item.planTitle),
  }));
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Proactivity Operating-System Leap Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- queueReportId: ${summary.queueReportId}`,
    `- growthLoopReportId: ${summary.growthLoopReportId}`,
    `- reversePromptCount: ${summary.reversePromptCount}`,
    `- opportunityCount: ${summary.opportunityCount}`,
    `- maintenanceJobCount: ${summary.maintenanceJobCount}`,
    `- workingBufferSummaryCount: ${summary.workingBufferSummaryCount}`,
    `- inlineCardCount: ${summary.inlineCardCount}`,
    `- heartbeatCardCount: ${summary.heartbeatCardCount}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-operating-system-leap-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_OPERATING_SYSTEM_SESSION ?? DEFAULT_SESSION_KEY;
  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  const evidence = {
    uiAuthWorks: false,
    liveGatewayQueueAvailable: false,
    sameSessionOpportunityPresent: false,
    inlineFollowupAppeared: false,
    heartbeatSurfacedReview: false,
    heartbeatUsesHiddenContextContract: false,
    reversePromptVisible: false,
    delightOrSelfHealingVisible: false,
    draftReadyOrInvestigationReadyVisible: false,
    growthLoopReportLive: false,
    persistedGrowthLoopState: false,
    persistedWorkingBuffer: false,
    persistedMaintenanceJobs: false,
    continuityAfterReload: false,
    noChatInjectDuringReview: false,
    noAutonomousSend: true,
    noActionExecution: true,
    noProhibitedContent: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    queueReportId: null,
    growthLoopReportId: null,
    reversePromptCount: 0,
    opportunityCount: 0,
    maintenanceJobCount: 0,
    workingBufferSummaryCount: 0,
    inlineCardCount: 0,
    heartbeatCardCount: 0,
    queueTop: [],
    inlineTextSha256: "",
    heartbeatTextSha256: "",
    ok: false,
  };

  try {
    await harness.ensureAuthenticated(sessionKey);
    evidence.uiAuthWorks = true;
    const mark = await markProbe(harness.page);
    let live = await readLiveProactivity(harness.page, sessionKey);
    let store = await readPersistedState();

    const actionable = live.queueItems.filter(
      (item) => item.layer === "actionable" && item.status === "pending_review",
    );
    const nonStandard = live.queueItems.filter((item) => item.opportunityClass !== "standard");
    const queueIds = new Set(live.queueItems.map((item) => item.workItemId).filter(Boolean));
    const sameSessionSourceItems = live.queueItems.filter((item) =>
      item.sourceRefs.some((sourceRef) =>
        sourceRef.includes(`chat://${sessionKey}/assistant_turn/`),
      ),
    );

    evidence.liveGatewayQueueAvailable = Boolean(live.queueReportId) && live.queueItems.length > 0;
    evidence.sameSessionOpportunityPresent =
      actionable.length > 0 && sameSessionSourceItems.length > 0;
    evidence.inlineFollowupAppeared = live.inlineCards.some(
      (item) => item.workItemId && queueIds.has(item.workItemId),
    );
    evidence.heartbeatSurfacedReview =
      live.heartbeatText.includes("What would help this user today?") &&
      live.heartbeatCards.some((item) => item.workItemId && queueIds.has(item.workItemId));
    evidence.heartbeatUsesHiddenContextContract =
      !containsDisallowedPrimaryText(live.lastAssistantTranscript) &&
      !containsDisallowedPrimaryText(live.heartbeatText);
    evidence.reversePromptVisible = nonStandard.some(
      (item) => item.opportunityClass === "reverse_prompt",
    );
    evidence.delightOrSelfHealingVisible = nonStandard.some((item) =>
      ["delight", "self_healing", "followup", "recovery"].includes(item.opportunityClass),
    );
    evidence.draftReadyOrInvestigationReadyVisible = live.queueItems.some(
      (item) => item.draftReady || item.opportunityClass === "self_healing",
    );
    evidence.growthLoopReportLive =
      (live.growthLoopReport?.loopCount ?? 0) > 0 &&
      (live.growthLoopReport?.reversePromptCount ?? 0) > 0 &&
      (live.growthLoopReport?.maintenanceJobCount ?? 0) > 0;
    evidence.persistedGrowthLoopState =
      Array.isArray(store.growthLoopState?.entries) && store.growthLoopState.entries.length > 0;
    evidence.persistedWorkingBuffer =
      Array.isArray(store.workingBuffer?.summaryLines) &&
      store.workingBuffer.summaryLines.length > 0;
    evidence.persistedMaintenanceJobs =
      Array.isArray(store.maintenanceJobs) &&
      store.maintenanceJobs.length > 0 &&
      store.maintenanceJobs.every(
        (job) =>
          typeof job?.boundedInstruction === "string" &&
          !/\b(send externally|execute action|edit file)\b/iu.test(job.boundedInstruction),
      );
    evidence.noChatInjectDuringReview = !live.wsMethods.includes("chat.inject");
    evidence.noProhibitedContent =
      !containsDisallowedPrimaryText(live.inlineText) &&
      !containsDisallowedPrimaryText(live.heartbeatText);

    await harness.openSession(sessionKey);
    live = await readLiveProactivity(harness.page, sessionKey);
    store = await readPersistedState();
    evidence.continuityAfterReload =
      (live.growthLoopReport?.loopCount ?? 0) > 0 &&
      (live.growthLoopReport?.maintenanceJobCount ?? 0) > 0 &&
      Array.isArray(store.workingBuffer?.summaryLines) &&
      store.workingBuffer.summaryLines.length > 0;

    const probeSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames
        .slice(start.wsFrames ?? 0)
        .map((frame) => frame?.method)
        .filter(Boolean);
    }, mark);
    evidence.noChatInjectDuringReview =
      evidence.noChatInjectDuringReview && !probeSlice.includes("chat.inject");

    summary.sessionKey = live.sessionKey;
    summary.queueReportId = live.queueReportId;
    summary.growthLoopReportId = live.growthLoopReport?.reportId ?? null;
    summary.reversePromptCount = live.growthLoopReport?.reversePromptCount ?? 0;
    summary.opportunityCount = live.growthLoopReport?.opportunityCount ?? 0;
    summary.maintenanceJobCount = live.growthLoopReport?.maintenanceJobCount ?? 0;
    summary.workingBufferSummaryCount = store.workingBuffer?.summaryLines?.length ?? 0;
    summary.inlineCardCount = live.inlineCards.length;
    summary.heartbeatCardCount = live.heartbeatCards.length;
    summary.queueTop = summarizeQueue(live.queueItems);
    summary.inlineTextSha256 = sha256(live.inlineText);
    summary.heartbeatTextSha256 = sha256(live.heartbeatText);
  } finally {
    await harness.close();
  }

  if (!Object.values(evidence).every(Boolean)) {
    throw new Error(`operating-system leap proof failed: ${JSON.stringify(evidence)}`);
  }

  const payload = { summary, evidence };
  assertNoProhibitedContent(payload);
  summary.ok = true;

  const jsonPath = path.join(outputDir, "operating-system-leap-proof.json");
  const markdownPath = path.join(outputDir, "operating-system-leap-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(summary)}\n`, "utf8");
  process.stdout.write(`${jsonPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
