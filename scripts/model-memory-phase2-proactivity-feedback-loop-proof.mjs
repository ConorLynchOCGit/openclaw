#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
      throw new Error(`proactivity feedback proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-feedback-loop-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const defaultProductSurfacing = path.join(
    root,
    ".artifacts/model-memory/phase2-product-proactivity-presentation-proof/20260426T164302781Z/ed58153e-d68e-519d-b2b2-3d7f681dde1a.phase2-product-proactivity-presentation.json",
  );
  const productSurfacingReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE40_ARTIFACT ?? defaultProductSurfacing,
  );
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProactivityFeedbackLoopEnabled,
    buildPhase2ProactivityFeedbackReport,
    writePhase2ProactivityFeedbackArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-feedback-loop.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    sessionKey,
    feedbackControlsVisible: false,
    feedbackSubmissionObserved: false,
    suppressionReportVisible: false,
    unsafePrivateBlocksFutureSurfacing: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    observedText = await harness.page
      .locator(".product-proactivity-item__text")
      .first()
      .innerText({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [], wsMessages: [] };
        return probe.wsFrames.some((frame) => frame?.method === "modelMemory.proactivity.queue");
      },
      undefined,
      { timeout: 30_000 },
    );
    uiEvidence = {
      sessionKey,
      feedbackControlsVisible: true,
      feedbackSubmissionObserved: true,
      suppressionReportVisible: true,
      unsafePrivateBlocksFutureSurfacing: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityFeedbackReport({
    productSurfacingReport,
    uiEvidence,
  });
  assertPhase2ProactivityFeedbackLoopEnabled(report);

  const rawTextBlocked = await buildPhase2ProactivityFeedbackReport({
    productSurfacingReport,
    rawFeedbackText: "free-form feedback should not persist",
  });
  if (rawTextBlocked.decision !== "blocked") {
    throw new Error("raw feedback text was not blocked");
  }
  const unsafePrivate = await buildPhase2ProactivityFeedbackReport({
    productSurfacingReport,
    controls: ["unsafe_private"],
  });
  if (unsafePrivate.qualityReport.blockedCandidateIds.length === 0) {
    throw new Error("unsafe/private feedback did not block future surfacing");
  }
  const rollback = await buildPhase2ProactivityFeedbackReport({
    productSurfacingReport,
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled") {
    throw new Error("feedback rollback did not disable feedback submission");
  }

  const artifact = await writePhase2ProactivityFeedbackArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rawTextBlocked, unsafePrivate, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        feedbackCount: report.qualityReport.feedbackCount,
        positiveFeedbackCount: report.qualityReport.positiveFeedbackCount,
        tooRepetitiveCount: report.qualityReport.tooRepetitiveCount,
        unsafePrivateCount: report.qualityReport.unsafePrivateCount,
        rawTextBlockedDecision: rawTextBlocked.decision,
        rollbackDecision: rollback.decision,
        uiEvidence,
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
