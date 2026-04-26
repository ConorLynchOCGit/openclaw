#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

function assistantText(turn) {
  const transcriptText = turn?.completionEvidence?.transcript?.assistantText;
  if (typeof transcriptText === "string" && transcriptText.trim().length > 0) {
    return transcriptText;
  }
  return turn?.summary?.lastAssistantText ?? "";
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
      throw new Error(`proactivity boundary proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-boundary-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PROACTIVITY-BOUNDARY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let boundaryTurn;
  let rollbackTurn;
  try {
    boundaryTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 proactivity action-boundary proof.",
        `Proof marker: ${marker}-BOUNDARY.`,
        "Classify planner outputs as report-only, suggestion-only, approval-required, or blocked. Do not execute actions and do not send proactive user-facing messages.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 proactivity action-boundary rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables suggestions and approval-required proposals while keeping planner reports non-actionable.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const boundaryText = assistantText(boundaryTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!boundaryText.trim() || !rollbackText.trim()) {
    throw new Error("operator UI proactivity boundary proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    boundaryRunId: boundaryTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${boundaryText}\n${rollbackText}`),
  };

  const { buildPhase2PlannerDefaultPromotionReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-default-promotion.ts"),
    import.meta.url,
  );
  const {
    assertPhase2ProactivityBoundaryObserved,
    buildPhase2ProactivityBoundaryReport,
    writePhase2ProactivityBoundaryArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-action-boundary.ts"),
    import.meta.url,
  );

  const plannerDefaultPromotionReport = await buildPhase2PlannerDefaultPromotionReport({
    proofMarker: `${marker}-PLANNER-DEFAULT`,
    now: new Date(),
    approvedScope: { sessionKey, operatorId, projectId },
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
  });
  const rollbackReport = await buildPhase2ProactivityBoundaryReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    plannerDefaultPromotionReport,
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED: "1" },
  });
  if (
    rollbackReport.decision !== "rollback_disabled" ||
    rollbackReport.outputs.length !== 0 ||
    rollbackReport.telemetry.proactiveUserMessagesSent ||
    rollbackReport.telemetry.actionExecutionObserved
  ) {
    throw new Error("proactivity boundary rollback did not disable suggestions/proposals");
  }

  const report = await buildPhase2ProactivityBoundaryReport({
    proofMarker: marker,
    now: new Date(),
    plannerDefaultPromotionReport,
    uiEvidence,
  });
  assertPhase2ProactivityBoundaryObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ProactivityBoundaryArtifact({
    report,
    artifactDir: outputDir,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        marker,
        classificationCounts: report.telemetry.classificationCounts,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        proactiveUserMessagesSent: report.telemetry.proactiveUserMessagesSent,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        jsonPath: written.jsonPath,
        markdownPath: written.markdownPath,
        contentHash: written.contentHash,
      },
      null,
      2,
    )}\n`,
  );
}

await main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
