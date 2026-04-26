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
      throw new Error(`controlled autosend proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-low-risk-autosend-controlled-scope-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-LOW-RISK-AUTOSEND-CONTROLLED-SCOPE-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2LowRiskAutoSendControlledScope,
    buildPhase2LowRiskAutoSendControlledScopeReport,
    writePhase2LowRiskAutoSendControlledScopeArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-low-risk-autosend-controlled-scope.ts",
    ),
    import.meta.url,
  );
  const simulationObservabilityReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_ARTIFACT",
    ".artifacts/model-memory/phase2-autosend-simulation-observability-proof/20260426T184430474Z/2c635434-82d8-5e89-b991-db1dea7040c1.phase2-autosend-simulation-observability.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let insideTurn;
  let outsideTurn;
  let rollbackTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    insideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 low-risk autosend controlled scope proof.",
        `Proof marker: ${marker}-INSIDE.`,
        "Validate exact opted-in scope can auto-send only the low-risk suggestion class.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    outsideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 low-risk autosend outside-scope proof.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Validate non-scoped sessions remain manual-send only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 low-risk autosend rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Validate rollback disables controlled auto-send.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    uiEvidence: {
      sessionKey,
      controlledOptInVisible: Boolean(insideTurn),
      insideScopeAutoSendObserved: Boolean(insideTurn),
      outsideScopeManualOnlyObserved: Boolean(outsideTurn),
      rollbackBlocksAutoSend: Boolean(rollbackTurn),
      terminalEvidence: Boolean(insideTurn && outsideTurn && rollbackTurn),
    },
  });
  assertPhase2LowRiskAutoSendControlledScope(report);

  const outsideScope = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    forceOutsideScope: true,
  });
  const missingOptIn = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    forceMissingOptIn: true,
  });
  const degradedObservability = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    forceDegradedObservability: true,
  });
  const staleBlocked = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    forceStaleCandidate: true,
  });
  const rollbackBlocked = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    env: { MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED: "1" },
  });
  const followUpManualOnly = await buildPhase2LowRiskAutoSendControlledScopeReport({
    simulationObservabilityReport,
    messageClass: "operator_approved_follow_up_available",
  });

  for (const blockedReport of [
    outsideScope,
    missingOptIn,
    degradedObservability,
    staleBlocked,
    rollbackBlocked,
    followUpManualOnly,
  ]) {
    if (blockedReport.telemetry.actionExecutionObserved) {
      throw new Error("controlled autosend proof executed an action");
    }
    if (
      blockedReport.telemetry.automaticSendExecution &&
      blockedReport.telemetry.messageClass !== "operator_approved_suggestion_available"
    ) {
      throw new Error("controlled autosend proof sent a forbidden message class");
    }
  }

  const artifact = await writePhase2LowRiskAutoSendControlledScopeArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({
    report,
    outsideScope,
    missingOptIn,
    degradedObservability,
    staleBlocked,
    rollbackBlocked,
    followUpManualOnly,
    artifact,
    markerHash: sha256(marker),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        marker,
        allowedMessageClass: report.policy.allowedMessageClasses[0],
        automaticSendExecution: report.telemetry.automaticSendExecution,
        outsideScopeDecision: outsideScope.decision,
        missingOptInDecision: missingOptIn.decision,
        degradedObservabilityDecision: degradedObservability.decision,
        staleBlockedDecision: staleBlocked.decision,
        rollbackBlockedDecision: rollbackBlocked.decision,
        followUpManualOnlyDecision: followUpManualOnly.decision,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        observedTextSha256: sha256(marker),
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
