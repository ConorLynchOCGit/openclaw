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
      throw new Error(
        `controlled action expansion proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-action-expansion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-ACTION-EXPANSION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXPANSION_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let blockedTurn;
  let approvalTurn;
  let reviewNoteTurn;
  let rollbackTurn;
  try {
    blockedTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action expansion proof.",
        `Proof marker: ${marker}-BLOCKED.`,
        "Verify expanded controlled action execution blocks before approval, outside scope, and for unsafe action kinds.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    approvalTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action expansion proof.",
        `Proof marker: ${marker}-APPROVAL.`,
        "Approve the harmless create_operator_review_note action for explicit execution proof only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    reviewNoteTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action expansion proof.",
        `Proof marker: ${marker}-REVIEW-NOTE.`,
        "Execute only the bounded operator review note action after explicit approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action expansion rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables expanded controlled action execution.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const text = [blockedTurn, approvalTurn, reviewNoteTurn, rollbackTurn].map(assistantText);
  if (text.some((entry) => !entry.trim())) {
    throw new Error("operator UI controlled action expansion proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    blockedRunId: blockedTurn?.runId ?? null,
    approvalRunId: approvalTurn?.runId ?? null,
    reviewNoteRunId: reviewNoteTurn?.runId ?? null,
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
  const { buildPhase2StagedActionApprovalReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-staged-action-approval-workflow.ts",
    ),
    import.meta.url,
  );
  const {
    assertPhase2ControlledActionExpansionObserved,
    buildPhase2ControlledActionExpansionReport,
    writePhase2ControlledActionExpansionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-controlled-action-expansion.ts"),
    import.meta.url,
  );

  const approvedScope = { sessionKey, operatorId, projectId };
  const requestScope = { sessionKey, operatorId, projectId, purpose: "operator_eval" };
  const plannerDefaultPromotionReport = await buildPhase2PlannerDefaultPromotionReport({
    proofMarker: `${marker}-PLANNER-DEFAULT`,
    now: new Date(),
    approvedScope,
    requestScope,
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
    requestScope,
  });
  const approvalReport = await buildPhase2StagedActionApprovalReport({
    proofMarker: `${marker}-APPROVAL`,
    now: new Date(),
    boundaryReport,
    controlledSuggestionReport,
    operatorDecision: "approve",
    operatorId,
  });

  const blockedReport = await buildPhase2ControlledActionExpansionReport({
    proofMarker: `${marker}-BLOCKED`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope: { ...requestScope, projectId: `${projectId}-outside-scope` },
    actionKind: "create_operator_review_note",
    explicitExecutionApproval: true,
  });
  if (blockedReport.decision !== "blocked_scope") {
    throw new Error(
      `controlled action expansion outside-scope block failed: ${blockedReport.decision}`,
    );
  }

  const missingApprovalReport = await buildPhase2ControlledActionExpansionReport({
    proofMarker: `${marker}-MISSING-APPROVAL`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    actionKind: "create_operator_review_note",
    explicitExecutionApproval: false,
  });
  if (missingApprovalReport.decision !== "blocked_missing_approval") {
    throw new Error(
      `controlled action expansion missing explicit approval block failed: ${missingApprovalReport.decision}`,
    );
  }

  const unsafeReport = await buildPhase2ControlledActionExpansionReport({
    proofMarker: `${marker}-UNSAFE`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    actionKind: "unsafe_file_mutation",
    explicitExecutionApproval: true,
  });
  if (unsafeReport.decision !== "blocked_unsafe_action_kind") {
    throw new Error(
      `controlled action expansion unsafe action block failed: ${unsafeReport.decision}`,
    );
  }

  const rollbackReport = await buildPhase2ControlledActionExpansionReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    actionKind: "create_operator_review_note",
    explicitExecutionApproval: true,
    env: { MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXPANSION_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "blocked_rollback") {
    throw new Error(
      `controlled action expansion rollback did not block: ${rollbackReport.decision}`,
    );
  }

  const report = await buildPhase2ControlledActionExpansionReport({
    proofMarker: marker,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    actionKind: "create_operator_review_note",
    explicitExecutionApproval: true,
    uiEvidence,
  });
  assertPhase2ControlledActionExpansionObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledActionExpansionArtifact({
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
        approvalReportId: report.approvalReportId,
        resultId: report.result?.resultId,
        reviewNoteId: report.result?.reviewNoteId,
        blockedDecision: blockedReport.decision,
        missingApprovalDecision: missingApprovalReport.decision,
        unsafeDecision: unsafeReport.decision,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        userFacingProactiveMessagesSent: report.telemetry.userFacingProactiveMessagesSent,
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
