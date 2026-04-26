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
        `controlled action execution proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-action-execution-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-ACTION-EXECUTION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let blockedTurn;
  let approvalTurn;
  let executionTurn;
  let rollbackTurn;
  try {
    blockedTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action execution proof.",
        `Proof marker: ${marker}-BLOCKED.`,
        "Verify controlled action execution blocks before approval and outside approved scope.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    approvalTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action execution proof.",
        `Proof marker: ${marker}-APPROVAL.`,
        "Approve the staged harmless proof-artifact action for explicit execution proof only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    executionTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action execution proof.",
        `Proof marker: ${marker}-EXECUTE.`,
        "Execute only the bounded harmless proof-artifact action after explicit approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled action execution rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables controlled action execution.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const text = [blockedTurn, approvalTurn, executionTurn, rollbackTurn].map(assistantText);
  if (text.some((entry) => !entry.trim())) {
    throw new Error("operator UI controlled action execution proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    blockedRunId: blockedTurn?.runId ?? null,
    approvalRunId: approvalTurn?.runId ?? null,
    executionRunId: executionTurn?.runId ?? null,
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
    assertPhase2ControlledActionExecutionObserved,
    buildPhase2ControlledActionExecutionReport,
    writePhase2ControlledActionExecutionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-controlled-action-execution.ts"),
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

  const blockedReport = await buildPhase2ControlledActionExecutionReport({
    proofMarker: `${marker}-BLOCKED`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope: { ...requestScope, sessionKey: `${sessionKey}-outside-scope` },
    explicitExecutionApproval: true,
  });
  if (blockedReport.decision !== "blocked_scope") {
    throw new Error(
      `controlled action execution outside-scope block failed: ${blockedReport.decision}`,
    );
  }

  const missingApprovalReport = await buildPhase2ControlledActionExecutionReport({
    proofMarker: `${marker}-MISSING-APPROVAL`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    explicitExecutionApproval: false,
  });
  if (missingApprovalReport.decision !== "blocked_missing_approval") {
    throw new Error(
      `controlled action execution missing explicit approval block failed: ${missingApprovalReport.decision}`,
    );
  }

  const unsafeReport = await buildPhase2ControlledActionExecutionReport({
    proofMarker: `${marker}-UNSAFE`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    explicitExecutionApproval: true,
    actionKind: "unsafe_external_command",
  });
  if (unsafeReport.decision !== "blocked_unsafe_action_kind") {
    throw new Error(
      `controlled action execution unsafe action block failed: ${unsafeReport.decision}`,
    );
  }

  const rollbackReport = await buildPhase2ControlledActionExecutionReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    explicitExecutionApproval: true,
    env: { MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "blocked_rollback") {
    throw new Error(
      `controlled action execution rollback did not block: ${rollbackReport.decision}`,
    );
  }

  const report = await buildPhase2ControlledActionExecutionReport({
    proofMarker: marker,
    now: new Date(),
    approvalReport,
    approvedScope,
    requestScope,
    explicitExecutionApproval: true,
    uiEvidence,
  });
  assertPhase2ControlledActionExecutionObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledActionExecutionArtifact({
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
