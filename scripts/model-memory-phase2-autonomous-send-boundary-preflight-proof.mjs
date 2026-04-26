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
        `autonomous send boundary proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-autonomous-send-boundary-preflight-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-AUTONOMOUS-SEND-BOUNDARY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2AutonomousSendBoundaryObserved,
    buildPhase2AutonomousSendBoundaryReport,
    writePhase2AutonomousSendBoundaryArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-autonomous-send-boundary-preflight.ts",
    ),
    import.meta.url,
  );
  const defaultPromotionReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_ARTIFACT",
    ".artifacts/model-memory/phase2-user-facing-proactivity-default-promotion-proof/20260426T151745228Z/c649fd60-a068-5397-936e-c267258f9346.phase2-user-facing-proactivity-default-promotion.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let boundaryTurn;
  let blockedTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    boundaryTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 autonomous send boundary preflight proof.",
        `Proof marker: ${marker}-REPORT-ONLY.`,
        "Validate auto-send candidates are report-only and manual send remains required.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    blockedTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 autonomous send abuse regression proof.",
        `Proof marker: ${marker}-BLOCKED.`,
        "Validate urgency manipulation and external imperative text cannot trigger autonomous sending.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2AutonomousSendBoundaryReport({
    proofMarker: marker,
    defaultPromotionReport,
    uiEvidence: {
      sessionKey,
      proofMarker: marker,
      boundaryRunId: boundaryTurn?.turnId ?? null,
      blockedRunId: blockedTurn?.turnId ?? null,
      terminalEvidence: Boolean(boundaryTurn && blockedTurn),
      observedTextSha256: sha256(marker),
    },
  });
  assertPhase2AutonomousSendBoundaryObserved(report);

  const urgencyBlocked = await buildPhase2AutonomousSendBoundaryReport({
    proofMarker: `${marker}-URGENCY`,
    defaultPromotionReport,
    forceUrgencyManipulation: true,
  });
  const externalBlocked = await buildPhase2AutonomousSendBoundaryReport({
    proofMarker: `${marker}-EXTERNAL`,
    defaultPromotionReport,
    forceExternalImperativeText: true,
  });
  const rollbackBlocked = await buildPhase2AutonomousSendBoundaryReport({
    proofMarker: `${marker}-ROLLBACK`,
    defaultPromotionReport,
    env: { MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED: "1" },
  });
  const unknownClassBlocked = await buildPhase2AutonomousSendBoundaryReport({
    proofMarker: `${marker}-UNKNOWN-CLASS`,
    defaultPromotionReport,
    forceUnknownClass: true,
  });

  for (const blockedReport of [
    urgencyBlocked,
    externalBlocked,
    rollbackBlocked,
    unknownClassBlocked,
  ]) {
    if (blockedReport.telemetry.automaticSendExecution) {
      throw new Error("blocked autonomous send case unexpectedly executed an automatic send");
    }
    if (blockedReport.telemetry.autonomousMessageEmitted) {
      throw new Error("blocked autonomous send case unexpectedly emitted a message");
    }
  }

  const artifact = await writePhase2AutonomousSendBoundaryArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({
    report,
    urgencyBlocked,
    externalBlocked,
    rollbackBlocked,
    unknownClassBlocked,
    artifact,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        marker,
        defaultPromotionReportId: report.telemetry.defaultPromotionReportId,
        classifications: report.telemetry.classifications,
        manualSendRequired: report.policy.manualSendRequiredForDelivery,
        automaticSendExecution: report.telemetry.automaticSendExecution,
        autonomousMessageEmitted: report.telemetry.autonomousMessageEmitted,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        urgencyBlockedReasonCodes: urgencyBlocked.telemetry.blockedReasonCodes,
        externalBlockedReasonCodes: externalBlocked.telemetry.blockedReasonCodes,
        rollbackBlockedReasonCodes: rollbackBlocked.telemetry.blockedReasonCodes,
        unknownClassBlockedReasonCodes: unknownClassBlocked.telemetry.blockedReasonCodes,
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
