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
      throw new Error(`planner default proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-planner-default-promotion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PLANNER-DEFAULT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let defaultTurn;
  let rollbackTurn;
  try {
    defaultTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner default-promotion proof.",
        `Proof marker: ${marker}-DEFAULT.`,
        "Verify ordinary operator-visible planner reports are available by default, remain report-only, and do not send proactive user-facing messages or execute actions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner default-promotion rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify the planner report kill-switch disables default-visible planner candidate reports and leaves planner actions disabled.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const defaultText = assistantText(defaultTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!defaultText.trim() || !rollbackText.trim()) {
    throw new Error("operator UI planner default-promotion proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    defaultOperatorRunId: defaultTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${defaultText}\n${rollbackText}`),
  };

  const { buildPhase2PlannerControlledScopeReport } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-controlled-scope.ts"),
    import.meta.url,
  );
  const {
    assertPhase2PlannerDefaultPromotionObserved,
    buildPhase2PlannerDefaultPromotionReport,
    writePhase2PlannerDefaultPromotionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-default-promotion.ts"),
    import.meta.url,
  );

  const approvedScope = { sessionKey, operatorId, projectId };
  const controlledScopeReport = await buildPhase2PlannerControlledScopeReport({
    proofMarker: `${marker}-CONTROLLED`,
    now: new Date(),
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
  });
  const rollbackReport = await buildPhase2PlannerDefaultPromotionReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    controlledScopeReport,
    env: { MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED: "1" },
  });
  if (
    rollbackReport.decision !== "blocked" ||
    rollbackReport.defaultOperatorReports.length !== 0 ||
    rollbackReport.telemetry.proactiveSurfacingEnabled ||
    rollbackReport.telemetry.plannerActionsExecuted
  ) {
    throw new Error("planner default-promotion rollback did not disable default-visible reports");
  }

  const report = await buildPhase2PlannerDefaultPromotionReport({
    proofMarker: marker,
    now: new Date(),
    controlledScopeReport,
    uiEvidence,
  });
  assertPhase2PlannerDefaultPromotionObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2PlannerDefaultPromotionArtifact({
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
        defaultOperatorReports: report.defaultOperatorReports.length,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
        defaultVisibleToOperators: report.telemetry.defaultVisibleToOperators,
        proactiveSurfacingEnabled: report.telemetry.proactiveSurfacingEnabled,
        plannerActionsExecuted: report.telemetry.plannerActionsExecuted,
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
