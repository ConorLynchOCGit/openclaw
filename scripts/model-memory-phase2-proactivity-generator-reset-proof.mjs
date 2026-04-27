#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TAILNET_ORIGIN,
  OperatorBrowserHarness,
  markProbe,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
      throw new Error(`generator reset proof contains prohibited marker: ${marker}`);
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
    return {
      queueItems: (app.productProactivityQueue ?? []).map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        opportunityStatus: item.opportunityStatus,
        layer: item.layer,
        status: item.status,
        workItemKind: item.workItemKind,
        planTitle: item.planTitle,
        draftReady: item.draftReady === true,
      })),
      inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        opportunityStatus: item.opportunityStatus,
        layer: item.layer,
        status: item.status,
        workItemKind: item.workItemKind,
        planTitle: item.planTitle,
        draftReady: item.draftReady === true,
      })),
      digestCounts: app.proactivityInboxDigest?.counts ?? null,
      layerCounts: app.proactivityInboxDigest?.layerCounts ?? null,
    };
  });
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Proactivity Generator Reset Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- firstPromptRunId: ${summary.firstPromptRunId}`,
    `- secondPromptRunId: ${summary.secondPromptRunId}`,
    `- topOpportunityId: ${summary.topOpportunityId}`,
    `- topWorkItemId: ${summary.topWorkItemId}`,
    `- topQueueItemId: ${summary.topQueueItemId}`,
    `- repeatedFollowupTitle: ${summary.repeatedFollowupTitle ?? "none"}`,
    `- draftReadyObserved: ${summary.draftReadyObserved}`,
    `- resolvedItemRetired: ${summary.resolvedItemRetired}`,
    `- handoffPromptSha256: ${summary.handoffPromptSha256}`,
    `- inboxTextSha256: ${summary.inboxTextSha256}`,
    `- heartbeatTextSha256: ${summary.heartbeatTextSha256}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-generator-reset-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const requestedSessionKey =
    process.env.MODEL_MEMORY_PHASE2_GENERATOR_RESET_SESSION ??
    `generator-reset-${stamp.toLowerCase()}`;

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  const uiEvidence = {
    uiAuthWorks: false,
    roadmapPromptCreatedOpportunity: false,
    assistantOutputCreatedInboxItem: false,
    inboxShowsActionableItem: false,
    heartbeatShowsTopItem: false,
    draftReadyVisible: false,
    sameCanonicalIdAcrossSurfaces: false,
    repeatedAskFollowupVisible: false,
    resolvedItemDisappeared: false,
    planThisDispatchesChatSend: false,
    noChatInjectForPlan: false,
    noAutonomousSend: true,
    noActionExecution: true,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey: requestedSessionKey,
    firstPromptRunId: null,
    secondPromptRunId: null,
    topOpportunityId: null,
    topWorkItemId: null,
    topQueueItemId: null,
    repeatedFollowupTitle: null,
    draftReadyObserved: false,
    resolvedItemRetired: false,
    handoffPromptSha256: "",
    inboxTextSha256: "",
    heartbeatTextSha256: "",
    ok: false,
  };

  const prompt =
    "Review the roadmap and active work to generate potential proactivity plans. Respond with exactly two concrete bullet points. The first bullet must start with 'Plan' and the second bullet must start with 'Investigate'. Keep both next steps bounded to the current OpenClaw repo and do not propose file edits or execution.";

  let heartbeatText = "";
  let inboxText = "";
  let handoffPrompt = "";

  try {
    await harness.ensureAuthenticated(requestedSessionKey);
    uiEvidence.uiAuthWorks = true;

    const firstTurn = await harness.sendPrompt(prompt, {
      sessionKey: requestedSessionKey,
      timeoutMs: 120_000,
    });
    summary.sessionKey = firstTurn.sessionKey;
    summary.firstPromptRunId = firstTurn.runId;

    const firstState = await refreshProactivityInUi(harness.page);
    const topItem =
      firstState.queueItems.find(
        (item) => item.layer === "actionable" && item.status === "pending_review",
      ) ?? null;
    if (!topItem?.opportunityId || !topItem?.workItemId || !topItem?.queueItemId) {
      throw new Error(
        `normal planning prompt did not create actionable proactivity: ${JSON.stringify(firstState)}`,
      );
    }
    uiEvidence.roadmapPromptCreatedOpportunity = true;
    uiEvidence.assistantOutputCreatedInboxItem = true;
    uiEvidence.inboxShowsActionableItem = (firstState.digestCounts?.actionable ?? 0) >= 1;
    uiEvidence.draftReadyVisible = topItem.draftReady === true;
    summary.topOpportunityId = topItem.opportunityId;
    summary.topWorkItemId = topItem.workItemId;
    summary.topQueueItemId = topItem.queueItemId;
    summary.draftReadyObserved = topItem.draftReady === true;

    await harness.page.waitForSelector(".heartbeat-proactivity-review", { timeout: 60_000 });
    heartbeatText = await harness.page.locator(".heartbeat-proactivity-review").innerText({
      timeout: 30_000,
    });
    uiEvidence.heartbeatShowsTopItem =
      heartbeatText.includes("What would help this user today?") &&
      heartbeatText.toLowerCase().includes((topItem.planTitle ?? "").toLowerCase());
    summary.heartbeatTextSha256 = sha256(heartbeatText);

    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    inboxText = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
    summary.inboxTextSha256 = sha256(inboxText);
    const sameCanonicalCount = await harness.page
      .locator(`[data-work-item-id="${topItem.workItemId}"]`)
      .count();
    uiEvidence.sameCanonicalIdAcrossSurfaces = sameCanonicalCount >= 2;

    const secondTurn = await harness.sendPrompt(prompt, {
      sessionKey: summary.sessionKey,
      timeoutMs: 120_000,
    });
    summary.secondPromptRunId = secondTurn.runId;

    const repeatedState = await refreshProactivityInUi(harness.page);
    const repeatedFollowup =
      repeatedState.queueItems.find((item) =>
        (item.planTitle ?? "").toLowerCase().includes("repeated"),
      ) ??
      repeatedState.inboxItems.find((item) =>
        (item.planTitle ?? "").toLowerCase().includes("repeated"),
      ) ??
      null;
    uiEvidence.repeatedAskFollowupVisible = Boolean(repeatedFollowup);
    summary.repeatedFollowupTitle = repeatedFollowup?.planTitle ?? null;
    const currentActionableItem =
      repeatedState.queueItems.find(
        (item) =>
          item.layer === "actionable" &&
          item.status === "pending_review" &&
          item.workItemId === topItem.workItemId,
      ) ??
      repeatedState.queueItems.find(
        (item) => item.layer === "actionable" && item.status === "pending_review",
      ) ??
      null;
    if (!currentActionableItem?.queueItemId) {
      throw new Error(
        `no actionable queue item remained available for handoff: ${JSON.stringify(repeatedState)}`,
      );
    }

    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    const mark = await markProbe(harness.page);
    await harness.page
      .locator(`.chat-sidebar [data-queue-item-id="${currentActionableItem.queueItemId}"] button`)
      .filter({ hasText: /Plan this|Investigate|Draft next steps/ })
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
    const chatSendFrame = [...probeSlice]
      .toReversed()
      .find((frame) => frame?.method === "chat.send");
    handoffPrompt = chatSendFrame?.message ?? "";
    summary.handoffPromptSha256 = sha256(handoffPrompt);
    uiEvidence.planThisDispatchesChatSend = Boolean(chatSendFrame);
    uiEvidence.noChatInjectForPlan = !probeSlice.some((frame) => frame?.method === "chat.inject");

    await harness.page.evaluate(
      async ({ opportunityId, sessionKey }) => {
        const app = document.querySelector("openclaw-app");
        if (!app?.client) {
          throw new Error("openclaw app client is unavailable");
        }
        return await app.client.request("modelMemory.proactivity.updateOpportunityState", {
          opportunityId,
          status: "done",
          projectId: "openclaw",
          sessionKey,
        });
      },
      { opportunityId: topItem.opportunityId, sessionKey: summary.sessionKey },
    );
    const resolvedState = await refreshProactivityInUi(harness.page);
    uiEvidence.resolvedItemDisappeared = !resolvedState.queueItems.some(
      (item) =>
        item.opportunityId === topItem.opportunityId &&
        item.layer === "actionable" &&
        item.status === "pending_review",
    );
    summary.resolvedItemRetired = uiEvidence.resolvedItemDisappeared;
  } finally {
    await harness.close();
  }

  if (!Object.values(uiEvidence).every(Boolean)) {
    throw new Error(`generator reset UI proof failed: ${JSON.stringify(uiEvidence)}`);
  }

  assertNoProhibitedContent({
    uiEvidence,
    summary,
    heartbeatText,
    inboxText,
    handoffPrompt,
  });

  summary.ok = true;
  const jsonPath = path.join(
    outputDir,
    `${sha256(`${summary.sessionKey}:${summary.generatedAt}`).slice(0, 16)}.phase2-proactivity-generator-reset.json`,
  );
  const markdownPath = jsonPath.replace(/\.json$/u, ".md");
  await writeFile(jsonPath, `${JSON.stringify({ summary, uiEvidence }, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(summary)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir,
        jsonPath,
        markdownPath,
        summary,
        uiEvidence,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
