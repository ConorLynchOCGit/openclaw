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
      throw new Error(`product proactivity proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-product-proactivity-presentation-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProductProactivitySurfacingEnabled,
    buildPhase2ProductProactivitySurfacingReport,
    writePhase2ProductProactivitySurfacingArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-product-proactivity-presentation.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let uiEvidence = {
    sessionKey,
    queueVisible: false,
    approveSendClicked: false,
    chatInjectObserved: false,
    deliveredMessageId: null,
    dismissedOrSnoozedVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    const queueVisible = await harness.page
      .locator(".product-proactivity-panel")
      .filter({ hasText: "Pending proactive suggestions" })
      .count();
    if (queueVisible < 1) {
      throw new Error("normal product UI did not show pending proactive suggestions");
    }
    const expectedText = await harness.page
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
    await harness.page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      expectedText,
      { timeout: 30_000 },
    );
    const state = await harness.snapshotChat();
    const text = state.transcriptTailText ?? "";
    if (!text.includes(expectedText)) {
      throw new Error("approved product proactive message was not visible in real chat/session");
    }
    const probe = await harness.page.evaluate(() => window.__OPENCLAW_OPERATOR_PROMPT_PROBE__);
    const injectFrame = probe.wsFrames.find((frame) => frame?.method === "chat.inject") ?? null;
    const injectResponse =
      injectFrame && probe.wsMessages.find((message) => message?.id === injectFrame.id) != null;
    const dismissOrSnoozeVisible = await harness.page.evaluate(() =>
      Array.from(document.querySelectorAll(".product-proactivity-item__actions button")).some(
        (button) => /Dismiss|Snooze/i.test(button.textContent ?? ""),
      ),
    );
    uiEvidence = {
      sessionKey,
      queueVisible: true,
      approveSendClicked: true,
      chatInjectObserved: Boolean(injectResponse),
      deliveredMessageId: null,
      dismissedOrSnoozedVisible: dismissOrSnoozeVisible,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProductProactivitySurfacingReport({
    uiEvidence,
    eligibilityScope: {
      sessionKey,
      projectId: process.env.OPENCLAW_PROJECT_ID ?? "openclaw",
      userId: process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
      recipientId: process.env.OPENCLAW_RECIPIENT_ID ?? "local-openclaw-recipient",
      operatorId: process.env.OPENCLAW_OPERATOR_ID ?? "local-openclaw-operator",
    },
  });
  assertPhase2ProductProactivitySurfacingEnabled(report);

  const rollback = await buildPhase2ProductProactivitySurfacingReport({
    env: { MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED: "1" },
  });
  if (rollback.decision === "product_queue_enabled") {
    throw new Error("rollback unexpectedly allowed product proactivity surfacing");
  }

  const artifact = await writePhase2ProductProactivitySurfacingArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        queueId: report.queue.queueId,
        queueItemCount: report.telemetry.queueItemCount,
        uiEvidence,
        rollbackDecision: rollback.decision,
        observedTextSha256: sha256(report.queue.items[0]?.boundedDisplayText ?? ""),
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
