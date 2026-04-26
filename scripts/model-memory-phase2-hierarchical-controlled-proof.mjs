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
        `hierarchical controlled proof artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-hierarchical-controlled-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-HIERARCHICAL-CONTROLLED-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let outsideTurn;
  let insideTurn;
  let rollbackTurn;
  try {
    outsideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 hierarchical controlled proof outside-scope check.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Keep hierarchical retrieval shadow-only and report terminal evidence only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    insideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 hierarchical controlled proof inside-scope check.",
        `Proof marker: ${marker}-INSIDE.`,
        "Use explicit bounded hierarchical retrieval proof mode over default-promoted graph and project_state capsule context. Do not make hierarchical retrieval default.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 hierarchical controlled rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Confirm rollback disables hierarchical retrieval and leaves default graph/capsule behavior intact.",
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
    throw new Error("operator UI hierarchical controlled proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    outsideRunId: outsideTurn?.runId ?? null,
    insideRunId: insideTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${outsideText}\n${insideText}\n${rollbackText}`),
  };

  const {
    assertPhase2HierarchicalControlledLive,
    buildPhase2HierarchicalControlledPromotion,
    writePhase2HierarchicalControlledPromotionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/retrieval/phase2-hierarchical-controlled-promotion.ts",
    ),
    import.meta.url,
  );

  const report = await buildPhase2HierarchicalControlledPromotion({
    repoRoot: root,
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2HierarchicalControlledLive(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2HierarchicalControlledPromotionArtifact({
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
        outsideScopeMode: report.outsideScope.mode,
        insideScopeMode: report.insideScope.mode,
        rollbackMode: report.rollback.mode,
        subqueryCount: report.telemetry.subqueryCount,
        lanesUsed: report.telemetry.lanesUsed,
        selectedMergedCandidateIds: report.telemetry.selectedMergedCandidateIds,
        duplicateMergeReasons: report.telemetry.duplicateMergeReasons,
        exclusionReasons: report.telemetry.exclusionReasons,
        noDarkDataStatus: report.noDarkDataStatus,
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
