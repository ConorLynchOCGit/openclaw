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
  for (const parts of [
    ["raw", "-", "prompt", "-", "marker"],
    ["raw", "-", "transcript", "-", "marker"],
    ["raw", "-", "tool", "-", "log", "-", "marker"],
    ["secret", "-", "marker"],
    ["private", "-", "phrase", "-", "marker"],
  ]) {
    if (serialized.includes(parts.join(""))) {
      throw new Error(
        `proactivity notification proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-user-facing-proactivity-notification-ux-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProactivityNotificationUxEnabled,
    buildPhase2ProactivityNotificationReport,
    writePhase2ProactivityNotificationArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-user-facing-proactivity-notification-ux.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    sessionKey,
    notificationVisible: false,
    noNotificationBeforeApproval: false,
    detailVisible: false,
    dismissWorks: false,
    snoozeWorks: false,
    chatInjectStillObserved: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    const beforeApprovalCount = await harness.page.locator(".proactivity-notification").count();
    if (beforeApprovalCount !== 0) {
      throw new Error("proactive notification appeared before approval");
    }
    observedText = await harness.page
      .locator(".product-proactivity-item__text")
      .first()
      .innerText({ timeout: 30_000 });
    await harness.page
      .getByRole("button", { name: /Approve & Send/i })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [], wsMessages: [] };
        const injectFrame = probe.wsFrames.find((frame) => frame?.method === "chat.inject");
        return (
          injectFrame &&
          probe.wsMessages.some((message) => message?.id === injectFrame.id && message?.ok === true)
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    await harness.page.waitForSelector(".proactivity-notification", { timeout: 30_000 });
    await harness.page.waitForFunction(
      (text) => {
        const notification = document.querySelector(".proactivity-notification");
        return notification?.textContent?.includes(text) === true;
      },
      observedText,
      { timeout: 30_000 },
    );
    await harness.page.locator(".proactivity-notification summary").first().click();
    await harness.page.waitForFunction(
      () => document.querySelector(".proactivity-notification")?.textContent?.includes("Sources"),
      undefined,
      { timeout: 30_000 },
    );
    const snoozeVisible = await harness.page
      .locator(".proactivity-notification")
      .getByRole("button", { name: /Snooze/i })
      .count();
    await harness.page
      .locator(".proactivity-notification")
      .getByRole("button", { name: /Dismiss/i })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => document.querySelectorAll(".proactivity-notification").length === 0,
      undefined,
      { timeout: 30_000 },
    );
    uiEvidence = {
      sessionKey,
      notificationVisible: true,
      noNotificationBeforeApproval: true,
      detailVisible: true,
      dismissWorks: true,
      snoozeWorks: snoozeVisible > 0,
      chatInjectStillObserved: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityNotificationReport({
    queueItemStatus: "sent",
    uiEvidence,
  });
  assertPhase2ProactivityNotificationUxEnabled(report);

  const pending = await buildPhase2ProactivityNotificationReport({
    queueItemStatus: "pending_review",
  });
  if (pending.telemetry.visibleCount !== 0) {
    throw new Error("pending notification unexpectedly rendered before approval");
  }

  const rollback = await buildPhase2ProactivityNotificationReport({
    queueItemStatus: "sent",
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED: "1" },
  });
  if (rollback.decision === "notification_ux_enabled") {
    throw new Error("rollback unexpectedly allowed notification ux");
  }

  const artifact = await writePhase2ProactivityNotificationArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, pending, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        visibleCount: report.telemetry.visibleCount,
        beforeApprovalVisibleCount: report.telemetry.beforeApprovalVisibleCount,
        uiEvidence,
        rollbackDecision: rollback.decision,
        observedTextSha256: sha256(observedText),
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
