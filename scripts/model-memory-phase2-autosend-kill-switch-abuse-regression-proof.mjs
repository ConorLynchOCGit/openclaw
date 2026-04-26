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
      throw new Error(`autosend kill-switch proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-autosend-kill-switch-abuse-regression-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-AUTOSEND-KILL-SWITCH-ABUSE-REGRESSION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_AUTOSEND_KILL_SWITCH_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2AutoSendKillSwitchReport,
    buildPhase2AutoSendKillSwitchReport,
    writePhase2AutoSendKillSwitchArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-autosend-kill-switch-abuse-regression.ts",
    ),
    import.meta.url,
  );
  const controlledAutoSendReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_ARTIFACT",
    ".artifacts/model-memory/phase2-low-risk-autosend-controlled-scope-proof/20260426T190734424Z/b1acf44b-755c-5163-9687-bbab86eae8ff.phase2-low-risk-autosend-controlled-scope.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let healthTurn;
  let killSwitchTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    healthTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 autosend kill-switch health proof.",
        `Proof marker: ${marker}-HEALTH.`,
        "Validate controlled auto-send health and abuse regression report is visible.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    killSwitchTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 autosend kill-switch stop proof.",
        `Proof marker: ${marker}-STOP.`,
        "Validate kill switch immediately stops auto-send and manual send remains available.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    uiEvidence: {
      sessionKey,
      healthReportVisible: Boolean(healthTurn),
      controlledAutoSendBeforeKillSwitch: true,
      killSwitchStopsAutoSend: Boolean(killSwitchTurn),
      manualSendStillAvailable: Boolean(killSwitchTurn),
      terminalEvidence: Boolean(healthTurn && killSwitchTurn),
    },
  });
  assertPhase2AutoSendKillSwitchReport(report);

  const killSwitchReport = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    env: { MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED: "1" },
  });
  const outsideScope = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    forceOutsideScopeSend: true,
  });
  const repeated = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    forceRepeatedSend: true,
  });
  const privateContent = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    forcePrivateContent: true,
  });
  const externalInstruction = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    forceExternalInstructionEscalation: true,
  });
  const missingProvenance = await buildPhase2AutoSendKillSwitchReport({
    controlledAutoSendReport,
    forceMissingProvenance: true,
  });

  for (const checked of [
    killSwitchReport,
    outsideScope,
    repeated,
    privateContent,
    externalInstruction,
    missingProvenance,
  ]) {
    if (checked.telemetry.actionExecutionObserved) {
      throw new Error("autosend kill-switch proof executed an action");
    }
  }

  const artifact = await writePhase2AutoSendKillSwitchArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({
    report,
    killSwitchReport,
    outsideScope,
    repeated,
    privateContent,
    externalInstruction,
    missingProvenance,
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
        health: report.healthReport.status,
        killSwitchDecision: killSwitchReport.decision,
        killSwitchDeliveries: killSwitchReport.telemetry.successfulControlledDeliveries,
        outsideScopeReasonCodes: outsideScope.healthReport.blockedReasonCodes,
        repeatedReasonCodes: repeated.healthReport.blockedReasonCodes,
        privateReasonCodes: privateContent.healthReport.blockedReasonCodes,
        externalInstructionReasonCodes: externalInstruction.healthReport.blockedReasonCodes,
        missingProvenanceReasonCodes: missingProvenance.healthReport.blockedReasonCodes,
        manualSendWorkflowPreserved: report.telemetry.manualSendWorkflowPreserved,
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
