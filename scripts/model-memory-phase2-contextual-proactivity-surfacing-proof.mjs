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
      throw new Error(`contextual proactivity proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-contextual-proactivity-surfacing-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTEXTUAL_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2ContextualProactivitySurfacingReport,
    buildPhase2ContextualProactivitySurfacingReport,
    writePhase2ContextualProactivitySurfacingArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-contextual-proactivity-surfacing.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".contextual-proactivity-card")?.textContent ?? "";
        return (
          text.includes("Suggested action") &&
          text.includes("Message preview") &&
          text.includes("Shown because this session matches project") &&
          text.includes("Approve & Send")
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    observedText = await harness.page.locator(".contextual-proactivity-card").innerText({
      timeout: 30_000,
    });
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ContextualProactivitySurfacingReport({
    lane: "context_surface",
  });
  assertPhase2ContextualProactivitySurfacingReport(report);
  const background = await buildPhase2ContextualProactivitySurfacingReport({
    forceBackgroundOnly: true,
  });
  if (
    background.contextualCards.length !== 0 ||
    background.relevanceDecisions[0]?.inboxOnly !== true
  ) {
    throw new Error("background-only candidate surfaced inline");
  }
  const stale = await buildPhase2ContextualProactivitySurfacingReport({ forceStale: true });
  if (stale.contextualCards.length !== 0 || stale.telemetry.suppressedCount === 0) {
    throw new Error("stale candidate was not suppressed");
  }
  const artifact = await writePhase2ContextualProactivitySurfacingArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, background, stale, artifact, observedText });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        inlineCardCount: report.telemetry.inlineCardCount,
        inboxOnlyBackground: background.telemetry.inboxOnlyCount,
        suppressedStale: stale.telemetry.suppressedCount,
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
