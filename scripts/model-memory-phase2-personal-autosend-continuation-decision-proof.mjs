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
      throw new Error(
        `personal autosend continuation proof contains prohibited: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-autosend-continuation-decision-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const productUxReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_ARTIFACT",
    ".artifacts/model-memory/phase2-personal-autosend-product-ux-proof/20260426T212024057Z/f3daa1c2-372f-579a-85ad-32b8ef4bd101.phase2-personal-autosend-product-ux.json",
  );
  const qualityReviewReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_ARTIFACT",
    ".artifacts/model-memory/phase2-autosend-trial-quality-review-proof/20260426T213833248Z/765087d9-b669-528b-a3af-6e27a876462b.phase2-autosend-trial-quality-review.json",
  );
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2PersonalAutoSendContinuationDecided,
    buildPhase2PersonalAutoSendContinuationReport,
    writePhase2PersonalAutoSendContinuationArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-personal-autosend-continuation-decision.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    continuationDecisionVisible: false,
    manualOnlyReturnVisible: false,
    allowedClassVisible: false,
    followUpManualOnlyVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".personal-autosend-panel", { timeout: 60_000 });
    observedText = await harness.page.locator(".personal-autosend-panel").innerText({
      timeout: 30_000,
    });
    uiEvidence = {
      continuationDecisionVisible: true,
      manualOnlyReturnVisible: observedText.includes("Return to Manual"),
      allowedClassVisible: observedText.includes("operator_approved_suggestion_available"),
      followUpManualOnlyVisible: observedText.includes("operator_approved_follow_up_available"),
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2PersonalAutoSendContinuationReport({
    productUxReport,
    qualityReviewReport,
    uiEvidence,
  });
  assertPhase2PersonalAutoSendContinuationDecided(report);

  if (qualityReviewReport.decision === "trial_quality_blocked") {
    if (report.decision !== "rollback_to_manual_only") {
      throw new Error(
        "blocked Slice 51 quality did not roll personal autosend back to manual-only",
      );
    }
  }

  const killSwitchRollback = await buildPhase2PersonalAutoSendContinuationReport({
    productUxReport,
    qualityReviewReport,
    env: { MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED: "1" },
  });
  if (killSwitchRollback.decision !== "rollback_to_manual_only") {
    throw new Error("personal autosend continuation did not roll back under kill switch");
  }

  const actionBlocked = await buildPhase2PersonalAutoSendContinuationReport({
    productUxReport,
    qualityReviewReport,
    forceActionExecution: true,
  });
  if (!actionBlocked.telemetry.blockedReasonCodes.includes("action_execution_disabled")) {
    throw new Error("personal autosend continuation did not block action execution");
  }

  const artifact = await writePhase2PersonalAutoSendContinuationArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, killSwitchRollback, actionBlocked, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        productUxDecision: report.telemetry.productUxDecision,
        qualityDecision: report.telemetry.qualityDecision,
        blockedReasonCodes: report.telemetry.blockedReasonCodes,
        rollbackToManualOnly: report.telemetry.rollbackToManualOnly,
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
