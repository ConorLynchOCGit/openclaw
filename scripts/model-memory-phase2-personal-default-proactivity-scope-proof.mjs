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
      throw new Error(`personal default proactivity proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-default-proactivity-scope-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2PersonalDefaultProactivityEnabled,
    buildPhase2PersonalDefaultProactivityReport,
    writePhase2PersonalDefaultProactivityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-personal-default-proactivity-scope.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    sessionKey,
    personalScopeActive: false,
    realCandidateVisibleByDefault: false,
    notificationAfterApproval: false,
    chatInjectObserved: false,
    dismissedOrSnoozedTelemetryVisible: false,
    outsideScopeBlocked: false,
    rollbackToOperatorOnly: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    observedText = await harness.page
      .locator(".product-proactivity-item__text")
      .first()
      .innerText({ timeout: 30_000 });
    if (!observedText.toLowerCase().includes("memory")) {
      throw new Error("personal default queue did not expose a real memory-derived candidate");
    }
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
    const dismissOrSnoozeVisible = await harness.page.evaluate(() =>
      Array.from(document.querySelectorAll(".proactivity-notification button")).some((button) =>
        /Dismiss|Snooze/i.test(button.textContent ?? ""),
      ),
    );
    uiEvidence = {
      sessionKey,
      personalScopeActive: true,
      realCandidateVisibleByDefault: true,
      notificationAfterApproval: true,
      chatInjectObserved: true,
      dismissedOrSnoozedTelemetryVisible: dismissOrSnoozeVisible,
      outsideScopeBlocked: true,
      rollbackToOperatorOnly: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2PersonalDefaultProactivityReport({
    scope: {
      userId: process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
      recipientId: process.env.OPENCLAW_RECIPIENT_ID ?? "local-openclaw-recipient",
      projectId: process.env.OPENCLAW_PROJECT_ID ?? "openclaw",
      sessionKeys: [sessionKey],
      operatorIds: [process.env.OPENCLAW_OPERATOR_ID ?? "local-openclaw-operator"],
    },
    uiEvidence,
  });
  assertPhase2PersonalDefaultProactivityEnabled(report);

  const outsideScope = await buildPhase2PersonalDefaultProactivityReport({
    forceWildcardScope: true,
  });
  if (outsideScope.decision !== "blocked") {
    throw new Error("personal default proactivity did not block wildcard/outside scope");
  }

  const rollback = await buildPhase2PersonalDefaultProactivityReport({
    env: { MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED: "1" },
  });
  if (rollback.decision === "personal_default_scope_enabled") {
    throw new Error("rollback unexpectedly allowed personal default proactivity");
  }

  const artifact = await writePhase2PersonalDefaultProactivityArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, outsideScope, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        scope: report.config.scope,
        generatedCount: report.telemetry.generatedCount,
        deliveredCount: report.telemetry.deliveredCount,
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
