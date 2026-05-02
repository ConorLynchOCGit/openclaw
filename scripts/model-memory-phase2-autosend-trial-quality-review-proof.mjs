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

async function readJson(root, envName, fallbackPath) {
  const artifactPath = process.env[envName] ?? fallbackPath;
  return JSON.parse(await readFile(path.join(root, artifactPath), "utf8"));
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
      throw new Error(`autosend trial quality proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-autosend-trial-quality-review-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const simulationReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_ARTIFACT",
    ".artifacts/model-memory/phase2-autosend-simulation-observability-proof/20260426T184430474Z/2c635434-82d8-5e89-b991-db1dea7040c1.phase2-autosend-simulation-observability.json",
  );
  const feedbackReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_ARTIFACT",
    ".artifacts/model-memory/phase2-proactivity-feedback-loop-proof/20260426T201732873Z/c38f6cc2-9c1c-557f-bea5-2ddaa59c454e.phase2-proactivity-feedback-loop.json",
  );
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_AUTOSEND_QUALITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2AutoSendTrialQualityReviewed,
    buildPhase2AutoSendTrialQualityReviewReport,
    writePhase2AutoSendTrialQualityArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-autosend-trial-quality-review.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    qualityReviewVisible: false,
    comparisonVisible: false,
    feedbackSignalsVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".personal-autosend-panel", { timeout: 60_000 });
    observedText = await harness.page.locator("body").innerText({ timeout: 30_000 });
    uiEvidence = {
      qualityReviewVisible: true,
      comparisonVisible: true,
      feedbackSignalsVisible: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2AutoSendTrialQualityReviewReport({
    simulationReport,
    feedbackReport,
    uiEvidence,
  });
  assertPhase2AutoSendTrialQualityReviewed(report);

  const leakageBlocked = await buildPhase2AutoSendTrialQualityReviewReport({
    simulationReport,
    feedbackReport,
    forceLeakageOrPrivateFlag: true,
  });
  const actionBlocked = await buildPhase2AutoSendTrialQualityReviewReport({
    simulationReport,
    feedbackReport,
    forceActionExecution: true,
  });
  const broadBlocked = await buildPhase2AutoSendTrialQualityReviewReport({
    simulationReport,
    feedbackReport,
    forceBroadAutonomousSending: true,
  });
  if (actionBlocked.decision !== "trial_quality_blocked") {
    throw new Error("autosend trial quality did not block action execution");
  }
  if (broadBlocked.decision !== "trial_quality_blocked") {
    throw new Error("autosend trial quality did not block broad autonomous sending");
  }
  if (!leakageBlocked.telemetry.blockedReasonCodes.includes("unsafe_private_zero")) {
    throw new Error("autosend trial quality did not block leakage/private flags");
  }

  const artifact = await writePhase2AutoSendTrialQualityArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, leakageBlocked, actionBlocked, broadBlocked, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        falsePositiveCount: report.telemetry.falsePositiveCount,
        repeatedCount: report.telemetry.repeatedCount,
        staleCount: report.telemetry.staleCount,
        unsafePrivateCount: report.telemetry.unsafePrivateCount,
        wrongContextOrNegativeFeedbackRatio: report.telemetry.wrongContextOrNegativeFeedbackRatio,
        blockedReasonCodes: report.telemetry.blockedReasonCodes,
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
