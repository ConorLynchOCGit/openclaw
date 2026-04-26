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
        `action execution operator default proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-action-execution-operator-default-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-ACTION-EXECUTION-OPERATOR-DEFAULT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let defaultWorkflowTurn;
  let executionApprovalTurn;
  let rollbackTurn;
  try {
    defaultWorkflowTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 action execution operator-default proof.",
        `Proof marker: ${marker}-DEFAULT-WORKFLOW.`,
        "Verify ordinary operator surfaces can expose approved harmless execution workflows by default.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    executionApprovalTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 action execution operator-default proof.",
        `Proof marker: ${marker}-EXPLICIT-APPROVAL.`,
        "Verify execution still requires staged approval and explicit execution approval.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 action execution operator-default rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify rollback disables default-visible action execution workflow.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const text = [defaultWorkflowTurn, executionApprovalTurn, rollbackTurn].map(assistantText);
  if (text.some((entry) => !entry.trim())) {
    throw new Error("operator UI action execution operator default proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    defaultWorkflowRunId: defaultWorkflowTurn?.runId ?? null,
    executionApprovalRunId: executionApprovalTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(text.join("\n")),
  };

  const { buildPhase2ControlledActionExecutionReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-controlled-action-execution.ts"),
    import.meta.url,
  );
  const { buildPhase2ControlledActionExpansionReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-controlled-action-expansion.ts"),
    import.meta.url,
  );
  const {
    assertPhase2ActionExecutionOperatorDefaultApproved,
    buildPhase2ActionExecutionOperatorDefaultReport,
    writePhase2ActionExecutionOperatorDefaultArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-action-execution-operator-default.ts",
    ),
    import.meta.url,
  );

  const controlledActionExecutionReport = await buildPhase2ControlledActionExecutionReport({
    proofMarker: `${marker}-SLICE25`,
    now: new Date(),
    explicitExecutionApproval: true,
  });
  const controlledActionExpansionReport = await buildPhase2ControlledActionExpansionReport({
    proofMarker: `${marker}-SLICE26`,
    now: new Date(),
    explicitExecutionApproval: true,
    actionKind: "create_operator_review_note",
  });

  const missingSlice25 = await buildPhase2ActionExecutionOperatorDefaultReport({
    proofMarker: `${marker}-MISSING-SLICE25`,
    now: new Date(),
    controlledActionExecutionReport: null,
    controlledActionExpansionReport,
  });
  if (missingSlice25.decision !== "partial_approval") {
    throw new Error(
      `missing Slice 25 proof did not prevent full approval: ${missingSlice25.decision}`,
    );
  }

  const rollbackReport = await buildPhase2ActionExecutionOperatorDefaultReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    controlledActionExecutionReport,
    controlledActionExpansionReport,
    env: { MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED: "1" },
  });
  if (rollbackReport.decision !== "blocked") {
    throw new Error(
      `rollback did not disable operator default workflow: ${rollbackReport.decision}`,
    );
  }

  const report = await buildPhase2ActionExecutionOperatorDefaultReport({
    proofMarker: marker,
    now: new Date(),
    controlledActionExecutionReport,
    controlledActionExpansionReport,
    uiEvidence,
  });
  assertPhase2ActionExecutionOperatorDefaultApproved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ActionExecutionOperatorDefaultArtifact({
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
        configId: report.config.configId,
        controlledActionExecutionReportId: report.controlledActionExecutionReportId,
        controlledActionExpansionReportId: report.controlledActionExpansionReportId,
        allowedActionKinds: report.config.allowedActionKinds,
        missingSlice25Decision: missingSlice25.decision,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        defaultVisibleOperatorWorkflowObserved:
          report.telemetry.defaultVisibleOperatorWorkflowObserved,
        explicitExecutionApprovalRequired: report.telemetry.explicitExecutionApprovalRequired,
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
