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
      throw new Error(`user-facing default proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-user-facing-proactivity-default-promotion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-USER-FACING-PROACTIVITY-DEFAULT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_USER_FACING_DEFAULT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2UserFacingProactivityDefaultPromotionApproved,
    buildPhase2UserFacingProactivityDefaultPromotionReport,
    writePhase2UserFacingProactivityDefaultPromotionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-user-facing-proactivity-default-promotion.ts",
    ),
    import.meta.url,
  );
  const readinessReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PROACTIVITY_DEFAULT_READINESS_ARTIFACT",
    ".artifacts/model-memory/phase2-proactivity-default-readiness-proof/20260426T150305056Z/211f7ed7-15c1-5b43-9170-ce4eaefaf950.phase2-proactivity-default-readiness.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let eligibleTurn;
  let nonEligibleTurn;
  let rollbackTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    eligibleTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 user-facing proactivity default-promotion proof.",
        `Proof marker: ${marker}-ELIGIBLE.`,
        "Validate eligible users receive approved messages only after explicit send approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    nonEligibleTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 non-eligible user blocking proof.",
        `Proof marker: ${marker}-NON-ELIGIBLE.`,
        "Validate non-eligible users receive no proactive message.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 user-facing default rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Validate rollback disables default-eligible user-facing delivery.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2UserFacingProactivityDefaultPromotionReport({
    proofMarker: marker,
    readinessReport,
    messageClass: "operator_approved_follow_up_available",
    uiEvidence: {
      sessionKey,
      proofMarker: marker,
      eligibleDeliveryRunId: eligibleTurn?.turnId ?? null,
      nonEligibleBlockedRunId: nonEligibleTurn?.turnId ?? null,
      rollbackRunId: rollbackTurn?.turnId ?? null,
      terminalEvidence: Boolean(eligibleTurn && nonEligibleTurn && rollbackTurn),
      observedTextSha256: sha256(marker),
    },
  });
  assertPhase2UserFacingProactivityDefaultPromotionApproved(report);

  const nonEligible = await buildPhase2UserFacingProactivityDefaultPromotionReport({
    proofMarker: `${marker}-NON-ELIGIBLE`,
    readinessReport,
    eligibleUserScope: false,
  });
  if (nonEligible.decision === "approved_for_default_eligible_user_facing_delivery") {
    throw new Error("non-eligible user unexpectedly approved for default delivery");
  }

  const rollback = await buildPhase2UserFacingProactivityDefaultPromotionReport({
    proofMarker: `${marker}-ROLLBACK`,
    readinessReport,
    env: { MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED: "1" },
  });
  if (rollback.decision === "approved_for_default_eligible_user_facing_delivery") {
    throw new Error("rollback unexpectedly allowed default-eligible delivery");
  }

  const blockedClass = await buildPhase2UserFacingProactivityDefaultPromotionReport({
    proofMarker: `${marker}-BLOCKED-CLASS`,
    readinessReport,
    messageClass: "external_instruction_message",
  });
  if (blockedClass.decision === "approved_for_default_eligible_user_facing_delivery") {
    throw new Error("blocked message class unexpectedly approved");
  }

  const artifact = await writePhase2UserFacingProactivityDefaultPromotionArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, nonEligible, rollback, blockedClass, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        marker,
        readinessReportId: report.telemetry.readinessReportId,
        approvedMessageClasses: report.telemetry.approvedMessageClasses,
        nonEligibleDecision: nonEligible.decision,
        rollbackDecision: rollback.decision,
        blockedClassDecision: blockedClass.decision,
        explicitSendApprovalRequired: report.telemetry.explicitSendApprovalRequired,
        autonomousSendingEnabled: report.telemetry.autonomousSendingEnabled,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
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
