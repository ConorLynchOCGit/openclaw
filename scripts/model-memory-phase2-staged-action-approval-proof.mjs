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
      throw new Error(`staged action approval proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-staged-action-approval-workflow",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-STAGED-ACTION-APPROVAL-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let stageTurn;
  let approveTurn;
  let rejectTurn;
  let rollbackTurn;
  try {
    stageTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 staged action approval proof.",
        `Proof marker: ${marker}-STAGE.`,
        "Stage approval-required planner/proactivity actions only as non-executing operator proposal artifacts.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    approveTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 staged action approval proof.",
        `Proof marker: ${marker}-APPROVE.`,
        "Approve the staged proposal for audit only. Do not execute any action.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rejectTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 staged action approval proof.",
        `Proof marker: ${marker}-REJECT.`,
        "Reject a staged proposal with deterministic reason codes. Blocked actions must not stage.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 staged action approval rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables proposal staging and approval workflow.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const text = [stageTurn, approveTurn, rejectTurn, rollbackTurn].map(assistantText);
  if (text.some((entry) => !entry.trim())) {
    throw new Error("operator UI staged action approval proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    stageRunId: stageTurn?.runId ?? null,
    approvalRunId: approveTurn?.runId ?? null,
    rejectionRunId: rejectTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(text.join("\n")),
  };

  const { buildPhase2PlannerDefaultPromotionReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-default-promotion.ts"),
    import.meta.url,
  );
  const { buildPhase2ProactivityBoundaryReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-action-boundary.ts"),
    import.meta.url,
  );
  const { buildPhase2ControlledProactivitySuggestionReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-proactivity-suggestions.ts",
    ),
    import.meta.url,
  );
  const {
    assertPhase2StagedActionApprovalObserved,
    buildPhase2StagedActionApprovalReport,
    writePhase2StagedActionApprovalArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-staged-action-approval-workflow.ts",
    ),
    import.meta.url,
  );

  const approvedScope = { sessionKey, operatorId, projectId };
  const plannerDefaultPromotionReport = await buildPhase2PlannerDefaultPromotionReport({
    proofMarker: `${marker}-PLANNER-DEFAULT`,
    now: new Date(),
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
  });
  const boundaryReport = await buildPhase2ProactivityBoundaryReport({
    proofMarker: `${marker}-BOUNDARY`,
    now: new Date(),
    plannerDefaultPromotionReport,
  });
  const controlledSuggestionReport = await buildPhase2ControlledProactivitySuggestionReport({
    proofMarker: `${marker}-CONTROLLED-SUGGESTIONS`,
    now: new Date(),
    boundaryReport,
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
  });
  const rollbackReport = await buildPhase2StagedActionApprovalReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    boundaryReport,
    controlledSuggestionReport,
    operatorDecision: "approve",
    operatorId,
    env: { MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "rollback_disabled" || rollbackReport.proposals.length) {
    throw new Error("staged action approval rollback did not disable proposal staging");
  }
  const rejectionReport = await buildPhase2StagedActionApprovalReport({
    proofMarker: `${marker}-REJECT`,
    now: new Date(),
    boundaryReport,
    controlledSuggestionReport,
    operatorDecision: "reject",
    operatorId,
  });
  if (!rejectionReport.telemetry.rejectedProposalIds.length) {
    throw new Error("staged action approval proof did not observe rejection path");
  }

  const report = await buildPhase2StagedActionApprovalReport({
    proofMarker: marker,
    now: new Date(),
    boundaryReport,
    controlledSuggestionReport,
    operatorDecision: "approve",
    operatorId,
    uiEvidence,
  });
  assertPhase2StagedActionApprovalObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2StagedActionApprovalArtifact({
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
        proposals: report.proposals.length,
        approvedProposalIds: report.telemetry.approvedProposalIds,
        rejectedProbeDecision: rejectionReport.decision,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
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
