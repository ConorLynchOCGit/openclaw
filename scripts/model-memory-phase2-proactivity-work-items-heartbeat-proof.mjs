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
      throw new Error(`work-items heartbeat proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-work-items-heartbeat-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_WORK_ITEMS_HEARTBEAT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2ProactivityWorkItemsEnabled,
    buildPhase2ProactivityWorkItemReport,
    writePhase2ProactivityWorkItemArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-work-items.ts"),
    import.meta.url,
  );
  const modelReviewedPlanningCandidate = {
    candidateId: "work-items-proof-model-reviewed-planning-candidate",
    queueItemId: "work-items-proof-model-reviewed-planning-queue-item",
    kind: "planning_request",
    title: "Model-reviewed heartbeat planning handoff",
    whyNow: "A model-reviewed proof fixture identified a bounded planning handoff.",
    proposedNextStep: "Review the bounded plan request before any file edits or execution.",
    expectedUserValue: "Keeps heartbeat planning explicit while preserving approval boundaries.",
    evidenceSummary: "Evidence comes from bounded proof fixture refs.",
    confidence: "high",
    sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["curated_authoritative"],
    contentHashes: ["work-items-proof-model-reviewed-content-hash"],
    proofHashes: ["work-items-proof-model-reviewed-proof-hash"],
    noDarkDataStatus: "pass",
    freshnessLabels: [],
    conflictLabels: [],
    blockedReasonCodes: [],
  };

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  const uiEvidence = {
    heartbeatVisible: false,
    heartbeatConcretePlanVisible: false,
    inboxSameWorkItemVisible: false,
    headerCountVisible: false,
    diagnosticsHiddenByDefault: false,
    planThisStartedChat: false,
    openInChatVisible: false,
    noChatInjectForPlan: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    await harness.page.waitForSelector(".heartbeat-proactivity-review", { timeout: 60_000 });
    observedText = await harness.page.locator(".heartbeat-proactivity-review").innerText({
      timeout: 30_000,
    });
    if (!observedText.includes("What would help this user today?")) {
      throw new Error("heartbeat review question is not visible in the primary surface");
    }
    if (!observedText.includes("Plan this") && !observedText.includes("Investigate")) {
      throw new Error("heartbeat plan card did not expose an intent-specific CTA");
    }
    const workItemId = await harness.page
      .locator(".heartbeat-proactivity-review__card")
      .first()
      .getAttribute("data-work-item-id", { timeout: 30_000 });
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    const inboxWorkItemCount = workItemId
      ? await harness.page.locator(`[data-work-item-id="${workItemId}"]`).count()
      : 0;
    const inboxDefaultText = await harness.page
      .locator(".chat-sidebar .proactivity-inbox")
      .innerText({ timeout: 30_000 });
    await harness.page
      .locator(".chat-sidebar .proactivity-inbox button", { hasText: /Plan this|Investigate/ })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.body.textContent ?? "";
        return (
          text.includes("Planning started in chat") ||
          text.includes("Investigation started in chat") ||
          text.includes("Drafting started in chat")
        );
      },
      undefined,
      { timeout: 60_000 },
    );
    const afterHandoff = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
    Object.assign(uiEvidence, {
      heartbeatVisible: true,
      heartbeatConcretePlanVisible: (() => {
        const normalizedObservedText = observedText.toLowerCase();
        return (
          normalizedObservedText.includes("why now") &&
          normalizedObservedText.includes("expected value")
        );
      })(),
      inboxSameWorkItemVisible: inboxWorkItemCount > 0,
      headerCountVisible: (
        await harness.page.locator(".proactivity-entrypoint__button").innerText()
      )
        .toLowerCase()
        .includes("actionable"),
      diagnosticsHiddenByDefault: !inboxDefaultText.includes("Auto-send simulation"),
      planThisStartedChat:
        afterHandoff.includes("Planning started in chat") ||
        afterHandoff.includes("Investigation started in chat"),
      openInChatVisible: afterHandoff.includes("Open in chat"),
      noChatInjectForPlan: !afterHandoff.includes("Sent via chat.inject"),
    });
  } finally {
    await harness.close();
  }

  if (!Object.values(uiEvidence).every(Boolean)) {
    throw new Error(`work-items heartbeat UI proof failed: ${JSON.stringify(uiEvidence)}`);
  }
  const report = await buildPhase2ProactivityWorkItemReport({
    candidates: [modelReviewedPlanningCandidate],
  });
  assertPhase2ProactivityWorkItemsEnabled(report);
  const blocked = await buildPhase2ProactivityWorkItemReport({
    candidates: [modelReviewedPlanningCandidate],
    forceSendMessageOnNonMessage: true,
  });
  if (blocked.decision !== "blocked") {
    throw new Error("work item proof did not block send_message on non-message candidate");
  }
  const rollback = await buildPhase2ProactivityWorkItemReport({
    candidates: [modelReviewedPlanningCandidate],
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_WORK_ITEMS_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled") {
    throw new Error("work item rollback did not disable work-item handoff");
  }
  const artifact = await writePhase2ProactivityWorkItemArtifact({ report, artifactDir: outputDir });
  assertNoProhibitedContent({ report, blocked, rollback, artifact, observedText, uiEvidence });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        workItemCount: report.telemetry.workItemCount,
        handoffCount: report.telemetry.handoffCount,
        observedTextSha256: sha256(observedText),
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
