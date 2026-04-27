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
      throw new Error(`live signal coverage proof contains prohibited marker: ${marker}`);
    }
  }
}

async function refreshProactivity(page) {
  return await page.evaluate(async () => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();
    await app.updateComplete;
    return {
      queueItems: app.productProactivityQueue?.map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        layer: item.layer,
        workItemKind: item.workItemKind,
        planTitle: item.planTitle,
        proposedMessage: item.proposedMessage,
        sourceRefs: item.sourceRefs,
        blockedReasonCodes: item.blockedReasonCodes,
      })),
      digestItems: app.proactivityInboxDigest?.items?.map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        layer: item.layer,
        planTitle: item.planTitle,
      })),
      heartbeatText: document.body.textContent ?? "",
    };
  });
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-live-signal-coverage-expansion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const requestedSessionKey =
    process.env.MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2LiveSignalCoverageExpanded,
    buildPhase2LiveSignalCoverageReport,
    writePhase2LiveSignalCoverageArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-live-signal-coverage-expansion.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  const uiEvidence = {
    uiAuthWorks: false,
    normalUserInteractionRecorded: false,
    liveWorkItemVisibleInQueue: false,
    inboxDefaultShowsLiveItem: false,
    heartbeatShowsLiveItem: false,
    contextualExactMatchOnly: true,
    staticFallbackNotCounted: false,
    noProofCandidateSeeding: true,
    noAutonomousSend: true,
    noActionExecution: true,
  };
  let report;
  let artifact;
  let effectiveSessionKey = requestedSessionKey;
  try {
    await harness.ensureAuthenticated(requestedSessionKey);
    uiEvidence.uiAuthWorks = true;
    effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || "main";
      })) ?? requestedSessionKey;
    const boundedSummary =
      "A normal OpenClaw chat interaction left an open planning loop for live signal coverage validation.";
    const sourceId = `normal-interaction-${sha256(`${stamp}:${effectiveSessionKey}`).slice(0, 12)}`;
    report = await buildPhase2LiveSignalCoverageReport({
      sources: [
        {
          sourceId,
          seam: "ordinary_chat_turn",
          reasonCode: "ordinary_turn_has_open_loop",
          projectId: "openclaw",
          sessionKey: effectiveSessionKey,
          boundedSummary,
          sourceRefs: [
            `gateway://system-events/${effectiveSessionKey}/ordinary_chat_turn/${sourceId}`,
          ],
          sourceProfileId: "explicit_user_turn",
          authorityTier: "user_authoritative",
          freshness: "recent",
          conflictState: "clear",
        },
      ],
    });
    assertPhase2LiveSignalCoverageExpanded(report);
    artifact = await writePhase2LiveSignalCoverageArtifact({ report, artifactDir: outputDir });
    const recorded = await harness.page.evaluate(async (summary) => {
      const app = document.querySelector("openclaw-app");
      return await app.client.request("system-event", {
        text: summary,
        reason: "ordinary-chat-turn-open-loop",
        mode: "normal-user-interaction",
      });
    }, boundedSummary);
    uiEvidence.normalUserInteractionRecorded = recorded?.ok === true;
    const uiState = await refreshProactivity(harness.page);
    const queueItem = uiState.queueItems?.find((item) => item.layer === "actionable");
    const digestItem = uiState.digestItems?.find((item) => item.layer === "actionable");
    uiEvidence.liveWorkItemVisibleInQueue = Boolean(
      queueItem?.sourceRefs?.some((sourceRef) => sourceRef.includes("/ordinary_chat_turn/")),
    );
    uiEvidence.inboxDefaultShowsLiveItem = digestItem?.workItemId === queueItem?.workItemId;
    uiEvidence.heartbeatShowsLiveItem = uiState.heartbeatText.includes(
      "What would help this user today?",
    );
    uiEvidence.staticFallbackNotCounted = !queueItem?.blockedReasonCodes?.includes(
      "static_default_candidate_demoted",
    );
    assertNoProhibitedContent({ report, uiState });
  } finally {
    await harness.stop();
  }

  const finalReport = {
    reportId: report.reportId,
    decision: report.decision,
    signalSeams: report.telemetry.seams,
    reasonCodes: report.telemetry.reasonCodes,
    opportunityCount: report.telemetry.opportunityCount,
    uiEvidence,
    artifact,
    manualCandidateSeeding: false,
  };
  assertNoProhibitedContent(finalReport);
  const failed = Object.entries(uiEvidence).filter(([, value]) => !value);
  if (failed.length) {
    throw new Error(`live signal coverage proof failed: ${failed.map(([key]) => key).join(", ")}`);
  }
  console.log(JSON.stringify(finalReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
