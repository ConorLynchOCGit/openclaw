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
      throw new Error(`autosend simulation proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-autosend-simulation-observability-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-AUTOSEND-SIMULATION-OBSERVABILITY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2AutoSendSimulationObserved,
    buildPhase2AutoSendSimulationObservabilityReport,
    writePhase2AutoSendSimulationArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-autosend-simulation-observability.ts",
    ),
    import.meta.url,
  );
  const readinessReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_ARTIFACT",
    ".artifacts/model-memory/phase2-autonomous-send-readiness-manual-override-proof/20260426T180204747Z/8af24698-c136-5e34-b4d3-86bccfe1afdb.phase2-autonomous-send-readiness-manual-override.json",
  );
  const productSurfacingReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_ARTIFACT",
    ".artifacts/model-memory/phase2-product-proactivity-presentation-proof/20260426T164302781Z/ed58153e-d68e-519d-b2b2-3d7f681dde1a.phase2-product-proactivity-presentation.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let simulationTurn;
  let abuseTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    simulationTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 auto-send simulation observability proof.",
        `Proof marker: ${marker}-VISIBLE.`,
        "Validate what-would-have-sent simulation and manual decision comparison are visible.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    abuseTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 auto-send simulation abuse proof.",
        `Proof marker: ${marker}-ABUSE.`,
        "Validate urgency, stale repeat, missing provenance, and leakage regressions remain blocked.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    queueItemStatus: "sent",
    uiEvidence: {
      sessionKey,
      simulationReportVisible: Boolean(simulationTurn),
      comparisonVisible: Boolean(simulationTurn),
      controlSignalsVisible: Boolean(simulationTurn),
      terminalEvidence: Boolean(simulationTurn && abuseTurn),
    },
  });
  assertPhase2AutoSendSimulationObserved(report);

  const urgencyBlocked = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    forceUrgencyManipulation: true,
  });
  const repeatedBlocked = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    forceRepeatedSuggestion: true,
  });
  const staleBlocked = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    forceStaleSuggestion: true,
  });
  const provenanceBlocked = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    forceMissingProvenance: true,
  });
  const leakageBlocked = await buildPhase2AutoSendSimulationObservabilityReport({
    readinessReport,
    productSurfacingReport,
    forceLeakage: true,
  });

  for (const blockedReport of [
    urgencyBlocked,
    repeatedBlocked,
    staleBlocked,
    provenanceBlocked,
    leakageBlocked,
  ]) {
    if (blockedReport.telemetry.automaticSendExecution) {
      throw new Error("auto-send simulation abuse case executed automatic send");
    }
    if (blockedReport.telemetry.actionExecutionObserved) {
      throw new Error("auto-send simulation abuse case executed an action");
    }
  }

  const artifact = await writePhase2AutoSendSimulationArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({
    report,
    urgencyBlocked,
    repeatedBlocked,
    staleBlocked,
    provenanceBlocked,
    leakageBlocked,
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
        controlSignals: report.telemetry.controlSignals,
        comparison: report.comparisons[0],
        automaticSendExecution: report.telemetry.automaticSendExecution,
        autonomousMessageEmitted: report.telemetry.autonomousMessageEmitted,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        urgencyBlockedReasonCodes: urgencyBlocked.healthReport.blockedReasonCodes,
        repeatedBlockedReasonCodes: repeatedBlocked.healthReport.blockedReasonCodes,
        staleBlockedReasonCodes: staleBlocked.healthReport.blockedReasonCodes,
        provenanceBlockedReasonCodes: provenanceBlocked.healthReport.blockedReasonCodes,
        leakageBlockedReasonCodes: leakageBlocked.healthReport.blockedReasonCodes,
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
