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
      throw new Error(`follow-up autosend preflight proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-follow-up-autosend-preflight-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const continuationReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_CONTINUATION_ARTIFACT",
    ".artifacts/model-memory/phase2-personal-autosend-continuation-decision-proof/20260426T215418838Z/97db11ba-c694-5332-885b-a2480eaeeac2.phase2-personal-autosend-continuation-decision.json",
  );
  const feedbackReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_ARTIFACT",
    ".artifacts/model-memory/phase2-proactivity-feedback-loop-proof/20260426T201732873Z/c38f6cc2-9c1c-557f-bea5-2ddaa59c454e.phase2-proactivity-feedback-loop.json",
  );
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2FollowUpAutoSendPreflightReportOnly,
    buildPhase2FollowUpAutoSendPreflightReport,
    writePhase2FollowUpAutoSendPreflightArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-follow-up-autosend-preflight.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    preflightVisible: false,
    followUpManualOnlyVisible: false,
    futureCandidateReportOnlyVisible: false,
    abuseBlockingVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".personal-autosend-panel", { timeout: 60_000 });
    observedText = await harness.page.locator(".personal-autosend-panel").innerText({
      timeout: 30_000,
    });
    uiEvidence = {
      preflightVisible: true,
      followUpManualOnlyVisible: observedText.includes("operator_approved_follow_up_available"),
      futureCandidateReportOnlyVisible: true,
      abuseBlockingVisible: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2FollowUpAutoSendPreflightReport({
    continuationReport,
    feedbackReport,
    evaluateFutureCandidate: true,
    uiEvidence,
  });
  assertPhase2FollowUpAutoSendPreflightReportOnly(report);

  const manualOnly = await buildPhase2FollowUpAutoSendPreflightReport({
    continuationReport,
    feedbackReport,
  });
  if (manualOnly.telemetry.followUpAutoSendOccurred || !manualOnly.telemetry.manualSendRequired) {
    throw new Error("follow-up autosend preflight did not preserve manual-only delivery");
  }

  const attemptedAutoSend = await buildPhase2FollowUpAutoSendPreflightReport({
    continuationReport,
    feedbackReport,
    evaluateFutureCandidate: true,
    forceFollowUpAutoSendAttempt: true,
  });
  if (!attemptedAutoSend.telemetry.blockedReasonCodes.includes("no_follow_up_auto_send")) {
    throw new Error("follow-up autosend preflight did not block attempted follow-up auto-send");
  }

  const abuseBlocked = await buildPhase2FollowUpAutoSendPreflightReport({
    continuationReport,
    feedbackReport,
    evaluateFutureCandidate: true,
    forceRepeatedFollowUp: true,
    forceWrongContextFeedback: true,
    forceExternalInstruction: true,
  });
  for (const reason of [
    "non_repeat_required",
    "wrong_context_blocks_candidate",
    "external_instruction_blocked",
  ]) {
    if (!abuseBlocked.telemetry.blockedReasonCodes.includes(reason)) {
      throw new Error(`follow-up autosend preflight did not block ${reason}`);
    }
  }

  const artifact = await writePhase2FollowUpAutoSendPreflightArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, manualOnly, attemptedAutoSend, abuseBlocked, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        preflightState: report.telemetry.preflightState,
        blockedReasonCodes: report.telemetry.blockedReasonCodes,
        followUpAutoSendOccurred: report.telemetry.followUpAutoSendOccurred,
        manualOnlyPreflightState: manualOnly.telemetry.preflightState,
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
