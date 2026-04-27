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

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`noise budget proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-signal-noise-budget-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const {
    assertPhase2ProactivityNoiseBudgetApplied,
    buildPhase2ProactivityNoiseBudgetReport,
    writePhase2ProactivityNoiseBudgetArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactivity-signal-noise-budget.ts",
    ),
    import.meta.url,
  );
  const source = (sourceId, contentHash) => ({
    sourceId,
    sourceType: "session_runtime_event",
    signalKind: "active_work_state",
    projectId: "openclaw",
    sessionKey: "main",
    boundedSummary: `Live source ${sourceId} reports a concrete proactivity opportunity for the current session.`,
    sourceRefs: [`gateway://noise-budget/${sourceId}`],
    sourceProfileId: "tool_result_capture",
    authorityTier: "tool_grounded",
    contentHash,
    proofHash: `proof-${sourceId}`,
    freshness: "recent",
    conflictState: "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
    limitations: [],
  });
  const report = await buildPhase2ProactivityNoiseBudgetReport({
    sources: [source("first", "same-content"), source("repeat", "same-content")],
    feedbackByContentHash: {
      "feedback-suppressed": ["dismissed", "not_useful"],
    },
  });
  assertPhase2ProactivityNoiseBudgetApplied(report);
  const artifact = await writePhase2ProactivityNoiseBudgetArtifact({
    report,
    artifactDir: outputDir,
  });
  const proof = {
    reportId: report.reportId,
    decision: report.decision,
    eligibleSourceCount: report.telemetry.eligibleSourceCount,
    suppressedSourceCount: report.telemetry.suppressedSourceCount,
    whyNotShownCount: report.telemetry.whyNotShownCount,
    suppressionReasonCodes: report.suppressionDecisions.flatMap((entry) => entry.reasonCodes),
    actionExecutionObserved: report.telemetry.actionExecutionObserved,
    artifact,
  };
  assertNoProhibitedContent(proof);
  if (report.telemetry.suppressedSourceCount < 1 || report.telemetry.eligibleSourceCount < 1) {
    throw new Error("noise budget proof did not show both eligible and suppressed signals");
  }
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
