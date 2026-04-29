#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-acceptance-gate-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const {
    assertPhase2ProactivityAcceptanceGateDecided,
    buildPhase2ProactivityAcceptanceGateReport,
    writePhase2ProactivityAcceptanceGateArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-acceptance-gate.ts"),
    import.meta.url,
  );
  const report = await buildPhase2ProactivityAcceptanceGateReport({
    metrics: {
      liveSignalsObserved: 5,
      opportunitiesGenerated: 4,
      actionableWorkItemsGenerated: 3,
      inboxSurfaced: 3,
      heartbeatSurfaced: 2,
      contextualSurfaced: 1,
      handoffsStarted: 2,
      plansInvestigationsDraftsProduced: 2,
      dismissedSnoozedIgnored: 0,
      markedOperatorPositiveOrActioned: 1,
      markedWrongContext: 0,
      suppressedNoiseBudgeted: 1,
      leakagePrivateFailures: 0,
      unsafeActionAttempts: 0,
      autonomousSendAttempts: 0,
      autonomousSendExpansions: 0,
      staticFallbackPrimaryCount: 0,
      heartbeatInboxSharedSource: true,
    },
  });
  assertPhase2ProactivityAcceptanceGateDecided(report);
  const artifact = await writePhase2ProactivityAcceptanceGateArtifact({
    report,
    artifactDir: outputDir,
  });
  console.log(
    JSON.stringify(
      {
        reportId: report.reportId,
        decision: report.decision,
        recommendation: report.recommendation,
        positiveFeedbackRate: report.telemetry.positiveFeedbackRate,
        noiseRate: report.telemetry.noiseRate,
        broadAutonomousSendingEnabled: report.telemetry.broadAutonomousSendingEnabled,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        artifact,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
