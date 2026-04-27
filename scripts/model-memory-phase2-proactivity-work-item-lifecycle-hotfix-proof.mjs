#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  DEFAULT_TAILNET_ORIGIN,
  OperatorBrowserHarness,
  markProbe,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
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
      throw new Error(`lifecycle hotfix proof contains prohibited marker: ${marker}`);
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
      queueItems: app.productProactivityQueue?.map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        layer: item.layer,
        status: item.status,
        planTitle: item.planTitle,
      })),
    };
  });
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Proactivity Work Item Lifecycle Hotfix Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- workItemId: ${summary.workItemId}`,
    `- heartbeatWorkItemId: ${summary.heartbeatWorkItemId}`,
    `- inboxWorkItemId: ${summary.inboxWorkItemId}`,
    `- plannedWorkItemId: ${summary.plannedWorkItemId}`,
    `- actionableCountBefore: ${summary.actionableCountBefore}`,
    `- actionableCountAfterFailure: ${summary.actionableCountAfterFailure}`,
    `- actionableCountAfterSuccess: ${summary.actionableCountAfterSuccess}`,
    `- plannedCountAfterSuccess: ${summary.plannedCountAfterSuccess}`,
    `- handoffPreviewSha256: ${summary.handoffPreviewSha256}`,
    `- inboxTextSha256: ${summary.inboxTextSha256}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-work-item-lifecycle-hotfix-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_WORK_ITEM_LIFECYCLE_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedInboxText = "";
  let handoffPreview = "";
  let effectiveSessionKey = sessionKey;
  const uiEvidence = {
    authWorks: false,
    entryPointVisible: false,
    heartbeatVisible: false,
    sameWorkItemAcrossHeartbeatAndInbox: false,
    noPrimarySuggestedActionDuplication: false,
    handoffFailureVisible: false,
    failureKeepsItemActionable: false,
    planStartsBoundedTurn: false,
    handoffLooksStructured: false,
    itemLeavesActionable: false,
    itemAppearsInPlannedHistory: false,
    sameWorkItemAcrossInboxAndHistory: false,
    noChatInjectForPlan: false,
    openInChatVisible: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    workItemId: null,
    heartbeatWorkItemId: null,
    inboxWorkItemId: null,
    plannedWorkItemId: null,
    actionableCountBefore: 0,
    actionableCountAfterFailure: 0,
    actionableCountAfterSuccess: 0,
    plannedCountAfterSuccess: 0,
    handoffPreviewSha256: "",
    inboxTextSha256: "",
    ok: false,
  };

  try {
    await harness.ensureAuthenticated(sessionKey);
    uiEvidence.authWorks = true;
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    uiEvidence.entryPointVisible = true;
    effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || "main";
      })) ?? sessionKey;
    summary.sessionKey = effectiveSessionKey;
    const boundedSummary =
      "OpenClaw proactivity lifecycle cleanup now needs a canonical planning-state verification for the active session.";
    await harness.page.evaluate(async (summaryText) => {
      const app = document.querySelector("openclaw-app");
      if (!app?.client) {
        throw new Error("openclaw app client is unavailable");
      }
      return await app.client.request("system-event", {
        text: summaryText,
        reason: "model-memory-proactivity-lifecycle-hotfix-proof",
        mode: "lifecycle-hotfix-proof",
      });
    }, boundedSummary);
    await refreshProactivityInUi(harness.page);

    await harness.page.waitForSelector(".heartbeat-proactivity-review", { timeout: 60_000 });
    const heartbeatCard = harness.page.locator(".heartbeat-proactivity-review__card").first();
    const heartbeatWorkItemId = await heartbeatCard.getAttribute("data-work-item-id", {
      timeout: 30_000,
    });
    uiEvidence.heartbeatVisible = Boolean(heartbeatWorkItemId);
    summary.heartbeatWorkItemId = heartbeatWorkItemId;

    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    const actionableArticle = harness.page
      .locator(
        ".chat-sidebar .proactivity-inbox .product-proactivity-item[data-layer='actionable']",
      )
      .first();
    const inboxWorkItemId = await actionableArticle.getAttribute("data-work-item-id", {
      timeout: 30_000,
    });
    summary.workItemId = inboxWorkItemId;
    summary.inboxWorkItemId = inboxWorkItemId;
    uiEvidence.sameWorkItemAcrossHeartbeatAndInbox =
      Boolean(heartbeatWorkItemId) &&
      Boolean(inboxWorkItemId) &&
      heartbeatWorkItemId === inboxWorkItemId;

    const primaryLabels = await actionableArticle.evaluate((article) =>
      Array.from(
        article.querySelectorAll(
          ":scope > .product-proactivity-item__main > .product-proactivity-item__section > span",
        ),
      ).map((node) => node.textContent?.trim() ?? ""),
    );
    uiEvidence.noPrimarySuggestedActionDuplication =
      primaryLabels.includes("What happens next") && !primaryLabels.includes("Suggested action");

    const actionableTabText = await harness.page
      .locator(".chat-sidebar [data-filter='actionable']")
      .innerText({ timeout: 30_000 });
    const actionableBefore = actionableTabText.match(/\d+/u);
    summary.actionableCountBefore = actionableBefore ? Number(actionableBefore[0]) : 0;

    await harness.page.evaluate(() => {
      const app = document.querySelector("openclaw-app");
      if (!app) {
        throw new Error("openclaw-app root not found");
      }
      const original = app.handleSendChat.bind(app);
      app.__phase2LifecycleProofOriginalHandleSendChat = original;
      app.handleSendChat = async () => {
        throw new Error("forced lifecycle hotfix proof failure");
      };
    });
    await actionableArticle
      .locator(".product-proactivity-item__actions button")
      .filter({ hasText: "Plan this" })
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () =>
        (document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "").includes(
          "forced lifecycle hotfix proof failure",
        ),
      undefined,
      { timeout: 30_000 },
    );
    uiEvidence.handoffFailureVisible = true;
    const afterFailureActionableTab = await harness.page
      .locator(".chat-sidebar [data-filter='actionable']")
      .innerText({ timeout: 30_000 });
    const actionableAfterFailure = afterFailureActionableTab.match(/\d+/u);
    summary.actionableCountAfterFailure = actionableAfterFailure
      ? Number(actionableAfterFailure[0])
      : 0;
    uiEvidence.failureKeepsItemActionable =
      summary.actionableCountAfterFailure >= summary.actionableCountBefore &&
      (await actionableArticle.count()) > 0;

    await harness.page.evaluate(() => {
      const app = document.querySelector("openclaw-app");
      const original = app?.__phase2LifecycleProofOriginalHandleSendChat;
      if (!app || typeof original !== "function") {
        throw new Error("missing original handleSendChat for lifecycle hotfix proof");
      }
      app.handleSendChat = original;
    });
    const mark = await markProbe(harness.page);
    await actionableArticle
      .locator(".product-proactivity-item__actions button")
      .filter({ hasText: "Plan this" })
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return text.includes("Planning started in chat.") && text.includes("Open in chat");
      },
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
    const latestUserBubble = await harness.page
      .locator(".chat-thread .chat-group.user .chat-text")
      .last()
      .innerText({ timeout: 30_000 });
    handoffPreview = latestUserBubble;
    uiEvidence.planStartsBoundedTurn =
      handoffPreview.includes("Start a bounded plan this") || Boolean(chatSendFrame?.message);
    uiEvidence.handoffLooksStructured =
      handoffPreview.includes("Title:") &&
      handoffPreview.includes("Why now:") &&
      handoffPreview.includes("Context to use:") &&
      handoffPreview.includes("Evidence summary:") &&
      handoffPreview.includes("Expected output:") &&
      handoffPreview.includes("Safety boundary:") &&
      !handoffPreview.includes("Action requested:") &&
      !handoffPreview.includes("Goal: produce");

    const postSuccessActionableTab = await harness.page
      .locator(".chat-sidebar [data-filter='actionable']")
      .innerText({ timeout: 30_000 });
    const actionableAfterSuccess = postSuccessActionableTab.match(/\d+/u);
    summary.actionableCountAfterSuccess = actionableAfterSuccess
      ? Number(actionableAfterSuccess[0])
      : 0;
    uiEvidence.itemLeavesActionable = summary.actionableCountAfterSuccess === 0;

    await harness.page.locator(".chat-sidebar [data-filter='planned']").click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () =>
        (document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "").includes(
          "Planning started in chat.",
        ),
      undefined,
      { timeout: 30_000 },
    );
    const plannedArticle = harness.page
      .locator(".chat-sidebar .proactivity-inbox .product-proactivity-item[data-layer='history']")
      .first();
    const plannedWorkItemId = await plannedArticle.getAttribute("data-work-item-id", {
      timeout: 30_000,
    });
    summary.plannedWorkItemId = plannedWorkItemId;
    const plannedTabText = await harness.page
      .locator(".chat-sidebar [data-filter='planned']")
      .innerText({ timeout: 30_000 });
    const plannedCount = plannedTabText.match(/\d+/u);
    summary.plannedCountAfterSuccess = plannedCount ? Number(plannedCount[0]) : 0;
    uiEvidence.itemAppearsInPlannedHistory =
      summary.plannedCountAfterSuccess >= 1 && (await plannedArticle.count()) > 0;
    uiEvidence.sameWorkItemAcrossInboxAndHistory =
      Boolean(inboxWorkItemId) &&
      Boolean(plannedWorkItemId) &&
      inboxWorkItemId === plannedWorkItemId;

    observedInboxText = await harness.page
      .locator(".chat-sidebar .proactivity-inbox")
      .innerText({ timeout: 30_000 });
    uiEvidence.noChatInjectForPlan = !observedInboxText.includes("Sent via chat.inject");
    uiEvidence.openInChatVisible = observedInboxText.includes("Open in chat");
  } finally {
    await harness.close();
  }

  summary.handoffPreviewSha256 = sha256(handoffPreview);
  summary.inboxTextSha256 = sha256(observedInboxText);
  summary.ok = Object.values(uiEvidence).every(Boolean);

  if (!summary.ok) {
    throw new Error(`lifecycle hotfix proof failed: ${JSON.stringify(uiEvidence)}`);
  }

  const jsonPath = path.join(
    outputDir,
    `${summary.workItemId ?? "unknown"}.phase2-proactivity-work-item-lifecycle-hotfix.json`,
  );
  const markdownPath = path.join(
    outputDir,
    `${summary.workItemId ?? "unknown"}.phase2-proactivity-work-item-lifecycle-hotfix.md`,
  );
  const jsonPayload = {
    ok: true,
    decision: "proactivity_lifecycle_hotfix_verified",
    summary,
    uiEvidence,
  };
  const markdown = toMarkdown(summary);
  assertNoProhibitedContent({ jsonPayload, markdown });
  await writeFile(jsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: jsonPayload.decision,
        workItemId: summary.workItemId,
        jsonPath,
        markdownPath,
        handoffPreviewSha256: summary.handoffPreviewSha256,
        inboxTextSha256: summary.inboxTextSha256,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
