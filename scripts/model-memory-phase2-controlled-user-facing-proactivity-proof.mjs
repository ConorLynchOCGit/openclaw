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
        `controlled user-facing proactivity proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-user-facing-proactivity-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-USER-FACING-PROACTIVITY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let blockedTurn;
  let approvalTurn;
  let deliveryTurn;
  let rollbackTurn;
  try {
    blockedTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity proof.",
        `Proof marker: ${marker}-BLOCKED.`,
        "Verify no proactive message sends outside scope or before approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    approvalTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity proof.",
        `Proof marker: ${marker}-APPROVAL.`,
        "Approve only the low-risk operator_approved_suggestion_available proof message.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    deliveryTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity proof.",
        `Proof marker: ${marker}-PROOF-DELIVERY.`,
        "Proof-deliver the approved low-risk message artifact after explicit send approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables controlled proactive message delivery.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const text = [blockedTurn, approvalTurn, deliveryTurn, rollbackTurn].map(assistantText);
  if (text.some((entry) => !entry.trim())) {
    throw new Error(
      "operator UI controlled user-facing proactivity proof lacked terminal evidence",
    );
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    blockedRunId: blockedTurn?.runId ?? null,
    approvalRunId: approvalTurn?.runId ?? null,
    deliveryRunId: deliveryTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(text.join("\n")),
  };

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
    assertPhase2ControlledUserFacingProactivityProven,
    buildPhase2ControlledUserFacingProactivityReport,
    writePhase2ControlledUserFacingProactivityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-user-facing-proactivity.ts",
    ),
    import.meta.url,
  );

  const approvedScope = { sessionKey, operatorId, projectId };
  const requestScope = { sessionKey, operatorId, projectId, purpose: "operator_eval" };
  const suggestionReport = await buildPhase2ControlledProactivitySuggestionReport({
    proofMarker: `${marker}-SUGGESTION`,
    now: new Date(),
    approvedScope,
    requestScope,
  });
  const approvalReport = await buildPhase2StagedActionApprovalReport({
    proofMarker: `${marker}-APPROVAL`,
    now: new Date(),
    controlledSuggestionReport: suggestionReport,
    approvedScope,
    requestScope,
    operatorDecision: "approve",
    operatorId,
  });

  const outsideScopeReport = await buildPhase2ControlledUserFacingProactivityReport({
    proofMarker: `${marker}-OUTSIDE-SCOPE`,
    now: new Date(),
    suggestionReport,
    approvalReport,
    approvedScope,
    requestScope: { ...requestScope, operatorId: "outside-operator" },
    explicitSendApproval: true,
  });
  if (outsideScopeReport.decision !== "blocked_scope") {
    throw new Error(
      `controlled proactivity outside-scope block failed: ${outsideScopeReport.decision}`,
    );
  }

  const missingSendApprovalReport = await buildPhase2ControlledUserFacingProactivityReport({
    proofMarker: `${marker}-MISSING-SEND-APPROVAL`,
    now: new Date(),
    suggestionReport,
    approvalReport,
    approvedScope,
    requestScope,
    explicitSendApproval: false,
  });
  if (missingSendApprovalReport.decision !== "blocked_missing_send_approval") {
    throw new Error(
      `controlled proactivity missing send approval block failed: ${missingSendApprovalReport.decision}`,
    );
  }

  const blockedClassReport = await buildPhase2ControlledUserFacingProactivityReport({
    proofMarker: `${marker}-BLOCKED-CLASS`,
    now: new Date(),
    suggestionReport,
    approvalReport,
    approvedScope,
    requestScope,
    messageClass: "external_instruction_message",
    explicitSendApproval: true,
  });
  if (blockedClassReport.decision !== "blocked_message_class") {
    throw new Error(`controlled proactivity blocked class failed: ${blockedClassReport.decision}`);
  }

  const rollbackReport = await buildPhase2ControlledUserFacingProactivityReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    suggestionReport,
    approvalReport,
    approvedScope,
    requestScope,
    explicitSendApproval: true,
    env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "blocked_rollback") {
    throw new Error(`controlled proactivity rollback did not block: ${rollbackReport.decision}`);
  }

  const report = await buildPhase2ControlledUserFacingProactivityReport({
    proofMarker: marker,
    now: new Date(),
    suggestionReport,
    approvalReport,
    approvedScope,
    requestScope,
    explicitSendApproval: true,
    uiEvidence,
  });
  assertPhase2ControlledUserFacingProactivityProven(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledUserFacingProactivityArtifact({
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
        messageId: report.message?.messageId,
        deliveryId: report.deliveryResult.deliveryId,
        deliveryMode: report.deliveryResult.deliveryMode,
        outsideScopeDecision: outsideScopeReport.decision,
        missingSendApprovalDecision: missingSendApprovalReport.decision,
        blockedClassDecision: blockedClassReport.decision,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        liveUserMessageSent: report.telemetry.liveUserMessageSent,
        broadDefaultProactivityEnabled: report.telemetry.broadDefaultProactivityEnabled,
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
