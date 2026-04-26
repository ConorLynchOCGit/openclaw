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
      throw new Error(`planner controlled proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-planner-controlled-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PLANNER-CONTROLLED-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let outsideTurn;
  let insideTurn;
  let rollbackTurn;
  try {
    outsideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner controlled-scope outside-scope proof.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Verify planner candidate plans are not generated outside approved operator/eval scope.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    insideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner controlled-scope proof.",
        `Proof marker: ${marker}-INSIDE.`,
        "Generate bounded report-only planner candidate plans from durable memory plus approved project docs and artifact evidence. Do not surface proactive behavior or execute planner actions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner controlled-scope rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify planner candidate-plan generation disables under rollback and remains report-only.",
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
    throw new Error("operator UI planner controlled proof lacked terminal evidence");
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

  const {
    assertPhase2PlannerControlledScopeObserved,
    buildPhase2PlannerControlledScopeReport,
    writePhase2PlannerControlledScopeArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-controlled-scope.ts"),
    import.meta.url,
  );

  const approvedScope = { sessionKey, operatorId, projectId };
  const outsideReport = await buildPhase2PlannerControlledScopeReport({
    proofMarker: `${marker}-OUTSIDE`,
    now: new Date(),
    approvedScope,
    requestScope: {
      sessionKey: `${sessionKey}-outside`,
      operatorId,
      projectId,
      purpose: "operator_eval",
    },
  });
  if (outsideReport.candidatePlans.length !== 0) {
    throw new Error("outside-scope planner controlled proof generated candidate plans");
  }

  const rollbackReport = await buildPhase2PlannerControlledScopeReport({
    proofMarker: `${marker}-ROLLBACK`,
    now: new Date(),
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
    env: { MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED: "1" },
  });
  if (
    rollbackReport.candidatePlans.length !== 0 ||
    rollbackReport.decision !== "rollback_disabled"
  ) {
    throw new Error("rollback did not disable planner controlled candidate plans");
  }

  const report = await buildPhase2PlannerControlledScopeReport({
    proofMarker: marker,
    now: new Date(),
    approvedScope,
    requestScope: { sessionKey, operatorId, projectId, purpose: "operator_eval" },
    uiEvidence,
  });
  assertPhase2PlannerControlledScopeObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2PlannerControlledScopeArtifact({
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
        candidatePlans: report.candidatePlans.length,
        outsideScopePlans: outsideReport.candidatePlans.length,
        rollbackDecision: rollbackReport.decision,
        noDarkDataStatus: report.noDarkDataStatus,
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
