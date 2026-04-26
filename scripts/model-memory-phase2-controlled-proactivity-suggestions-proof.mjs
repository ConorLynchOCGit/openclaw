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
        `controlled proactivity suggestions proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-proactivity-suggestions",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-PROACTIVITY-SUGGESTIONS-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let outsideTurn;
  let insideTurn;
  let rollbackTurn;
  try {
    outsideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled proactivity suggestions outside-scope proof.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Verify ordinary scope does not generate controlled proactivity suggestions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    insideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled proactivity suggestions inside-scope proof.",
        `Proof marker: ${marker}-INSIDE.`,
        "Generate bounded operator-visible proactivity suggestions only for explicit operator/eval scope. Do not send proactive user-facing messages and do not execute actions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled proactivity suggestions rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables controlled suggestions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const outsideText = assistantText(outsideTurn);
  const insideText = assistantText(insideTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!outsideText.trim() || !insideText.trim() || !rollbackText.trim()) {
    throw new Error(
      "operator UI controlled proactivity suggestions proof lacked terminal evidence",
    );
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    outsideScopeRunId: outsideTurn?.runId ?? null,
    insideScopeRunId: insideTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${outsideText}\n${insideText}\n${rollbackText}`),
  };

  const { buildPhase2PlannerDefaultPromotionReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-default-promotion.ts"),
    import.meta.url,
  );
  const { buildPhase2ProactivityBoundaryReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-action-boundary.ts"),
    import.meta.url,
  );
  const {
    assertPhase2ControlledProactivitySuggestionsObserved,
    buildPhase2ControlledProactivitySuggestionReport,
    writePhase2ControlledProactivitySuggestionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-proactivity-suggestions.ts",
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

  const outsideReport = await buildPhase2ControlledProactivitySuggestionReport({
    proofMarker: `${marker}-OUTSIDE`,
    now: new Date(),
    boundaryReport,
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "ordinary_chat" },
  });
  if (outsideReport.decision !== "outside_scope_report_only" || outsideReport.suggestions.length) {
    throw new Error("controlled proactivity suggestions generated outside approved scope");
  }

  const rollbackReport = await buildPhase2ControlledProactivitySuggestionReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    boundaryReport,
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
    env: { MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "rollback_disabled" || rollbackReport.suggestions.length) {
    throw new Error("controlled proactivity suggestions rollback did not disable suggestions");
  }

  const report = await buildPhase2ControlledProactivitySuggestionReport({
    proofMarker: marker,
    now: new Date(),
    boundaryReport,
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
    uiEvidence,
  });
  assertPhase2ControlledProactivitySuggestionsObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledProactivitySuggestionArtifact({
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
        suggestions: report.suggestions.length,
        outsideDecision: outsideReport.decision,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        userFacingProactiveMessagesSent: report.telemetry.userFacingProactiveMessagesSent,
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
