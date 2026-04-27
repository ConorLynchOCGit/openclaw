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
      throw new Error(`daily review proactivity proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-daily-review-heartbeat-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_DAILY_REVIEW_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2ProactivityDailyReviewHeartbeatReport,
    buildPhase2ProactivityDailyReviewHeartbeatReport,
    writePhase2ProactivityDailyReviewHeartbeatArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactivity-daily-review-heartbeat.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".operator-experience-panel__toggle", { timeout: 60_000 });
    await harness.page.locator(".operator-experience-panel__toggle").click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text =
          document.querySelector(".operator-card--proactivity-review")?.textContent ?? "";
        return (
          text.includes("Daily review / heartbeat proactivity") &&
          text.includes("Grouped lower-priority/background") &&
          text.includes("Open inbox detail/send")
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    observedText = await harness.page.locator(".operator-card--proactivity-review").innerText({
      timeout: 30_000,
    });
    await harness.page.locator(".proactivity-review-open").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityDailyReviewHeartbeatReport();
  assertPhase2ProactivityDailyReviewHeartbeatReport(report);
  const rollback = await buildPhase2ProactivityDailyReviewHeartbeatReport({
    env: { MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled") {
    throw new Error("daily review proactivity rollback did not disable review surfacing");
  }
  const artifact = await writePhase2ProactivityDailyReviewHeartbeatArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rollback, artifact, observedText });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        reviewItemCount: report.telemetry.reviewItemCount,
        groupedCount: report.telemetry.groupedCount,
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
