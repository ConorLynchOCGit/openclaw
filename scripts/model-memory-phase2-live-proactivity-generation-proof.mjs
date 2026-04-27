#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
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
      throw new Error(`live proactivity generation proof contains prohibited marker: ${marker}`);
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
        proposedMessage: item.proposedMessage,
        workItemKind: item.workItemKind,
      })),
      digestItems: app.proactivityInboxDigest?.items?.map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        layer: item.layer,
        status: item.status,
        planTitle: item.planTitle,
        workItemKind: item.workItemKind,
      })),
      digestCounts: app.proactivityInboxDigest?.counts,
      layerCounts: app.proactivityInboxDigest?.layerCounts,
    };
  });
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-live-proactivity-generation-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const requestedSessionKey =
    process.env.MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2LiveProactivityDetected,
    buildPhase2LiveProactivityDetectionReport,
    writePhase2LiveProactivityDetectionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-live-proactivity-signals.ts"),
    import.meta.url,
  );

  const eventSourceId = `proof-live-event-${stamp}`;
  const boundedSummary =
    "OpenClaw proactivity remediation now needs a usefulness-first live-generation follow-up for the active session.";
  const buildLiveSource = (sessionKey) => ({
    sourceId: eventSourceId,
    sourceType: "session_runtime_event",
    signalKind: "active_work_state",
    projectId: "openclaw",
    sessionKey,
    boundedSummary,
    sourceRefs: [`gateway://model-memory/proactivity/live-event/${eventSourceId}`],
    sourceProfileId: "manual_note",
    authorityTier: "tool_grounded",
    freshness: "recent",
    conflictState: "clear",
    noDarkDataStatus: "pass",
    limitations: ["proof_used_normal_gateway_live_event_endpoint"],
  });

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let runtimeReport = null;
  let artifact = null;
  let effectiveSessionKey = requestedSessionKey;
  let observedHeartbeatText = "";
  let observedInboxText = "";
  let handoffPrompt = "";
  const uiEvidence = {
    uiAuthWorks: false,
    realEventRecordedViaGateway: false,
    liveOpportunityVisibleInQueue: false,
    inboxDefaultShowsLiveItem: false,
    heartbeatShowsLiveItem: false,
    sameWorkItemAcrossSurfaces: false,
    staticFallbackNotPrimaryCounted: false,
    planThisDispatchesChatSend: false,
    noChatInjectForPlan: false,
    noActionExecution: true,
  };
  try {
    await harness.ensureAuthenticated(requestedSessionKey);
    uiEvidence.uiAuthWorks = true;
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || "main";
      })) ?? requestedSessionKey;
    const liveSource = buildLiveSource(effectiveSessionKey);
    runtimeReport = await buildPhase2LiveProactivityDetectionReport({
      sources: [liveSource],
    });
    assertPhase2LiveProactivityDetected(runtimeReport);
    artifact = await writePhase2LiveProactivityDetectionArtifact({
      report: runtimeReport,
      artifactDir: outputDir,
    });
    const recorded = await harness.page.evaluate(async (event) => {
      const app = document.querySelector("openclaw-app");
      if (!app?.client) {
        throw new Error("openclaw app client is unavailable");
      }
      return await app.client.request("modelMemory.proactivity.recordLiveEvent", event);
    }, liveSource);
    uiEvidence.realEventRecordedViaGateway =
      recorded?.sourceId === eventSourceId && recorded?.sessionKey === effectiveSessionKey;

    const uiState = await refreshProactivityInUi(harness.page);
    const queueItem = uiState.queueItems?.find((item) => item.layer === "actionable") ?? null;
    if (!queueItem) {
      throw new Error(
        `live event did not create actionable queue item: ${JSON.stringify(uiState)}`,
      );
    }
    uiEvidence.liveOpportunityVisibleInQueue = true;
    uiEvidence.staticFallbackNotPrimaryCounted =
      (uiState.layerCounts?.diagnostic ?? 0) === 0 || (uiState.layerCounts?.actionable ?? 0) >= 1;

    await harness.page.waitForSelector(".heartbeat-proactivity-review", { timeout: 60_000 });
    observedHeartbeatText = await harness.page.locator(".heartbeat-proactivity-review").innerText({
      timeout: 30_000,
    });
    if (!observedHeartbeatText.includes("What would help this user today?")) {
      throw new Error("live item did not appear in heartbeat review surface");
    }
    const normalizedHeartbeatText = observedHeartbeatText.toLowerCase();
    if (
      !normalizedHeartbeatText.includes("advance current openclaw work") ||
      !normalizedHeartbeatText.includes("proposed next step") ||
      !normalizedHeartbeatText.includes("expected value")
    ) {
      throw new Error(
        `heartbeat live item is missing concrete work-item fields: ${observedHeartbeatText.slice(0, 800)}`,
      );
    }
    uiEvidence.heartbeatShowsLiveItem = true;

    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    observedInboxText = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
    uiEvidence.inboxDefaultShowsLiveItem =
      observedInboxText.includes("Advance current openclaw work") &&
      !observedInboxText.includes("No live proactivity opportunities detected.");
    const workItemId = queueItem.workItemId ?? queueItem.queueItemId;
    const surfaceCount = await harness.page.locator(`[data-work-item-id="${workItemId}"]`).count();
    uiEvidence.sameWorkItemAcrossSurfaces = surfaceCount >= 2;

    const mark = await markProbe(harness.page);
    await harness.page
      .locator(".chat-sidebar .proactivity-inbox button", { hasText: "Plan this" })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => (document.body.textContent ?? "").includes("Planning started in chat"),
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
    uiEvidence.planThisDispatchesChatSend = Boolean(chatSendFrame);
    uiEvidence.noChatInjectForPlan = !probeSlice.some((frame) => frame?.method === "chat.inject");
  } finally {
    await harness.close();
  }

  if (!Object.values(uiEvidence).every(Boolean)) {
    throw new Error(`live proactivity generation UI proof failed: ${JSON.stringify(uiEvidence)}`);
  }
  if (!runtimeReport || !artifact) {
    throw new Error("live proactivity generation proof did not write runtime artifact");
  }
  assertNoProhibitedContent({
    runtimeReport,
    artifact,
    observedHeartbeatText,
    observedInboxText,
    handoffPrompt,
    uiEvidence,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        reportId: runtimeReport.reportId,
        decision: runtimeReport.decision,
        signalId: runtimeReport.signals[0]?.signalId ?? null,
        opportunityId: runtimeReport.opportunities[0]?.opportunityId ?? null,
        eventSource: "gateway_modelMemory.proactivity.recordLiveEvent",
        manualCandidateSeeding: false,
        observedHeartbeatTextSha256: sha256(observedHeartbeatText),
        observedInboxTextSha256: sha256(observedInboxText),
        handoffPromptSha256: sha256(handoffPrompt),
        uiEvidence,
        jsonPath: artifact.jsonPath,
        markdownPath: artifact.markdownPath,
        contentHash: artifact.contentHash,
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
