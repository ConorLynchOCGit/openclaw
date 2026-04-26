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
        `hierarchical default proof artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-hierarchical-default-promotion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-HIERARCHICAL-DEFAULT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let defaultTurn;
  let rollbackTurn;
  try {
    defaultTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 hierarchical default-promotion proof.",
        `Proof marker: ${marker}-DEFAULT.`,
        "Use ordinary/default retrieval and confirm bounded hierarchical retrieval is observed only because the proof-bound default config approves it. Preserve provenance, authority labels, and stale/inspection exclusions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 hierarchical default-promotion rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Confirm the hierarchical retrieval kill switch restores single-pass/shadow behavior while graph and project_state defaults remain independently controlled.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const defaultText = assistantText(defaultTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!defaultText.trim() || !rollbackText.trim()) {
    throw new Error("operator UI hierarchical default proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    defaultRunId: defaultTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${defaultText}\n${rollbackText}`),
  };

  const {
    assertPhase2HierarchicalDefaultPromoted,
    buildPhase2HierarchicalDefaultPromotion,
    writePhase2HierarchicalDefaultPromotionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/retrieval/phase2-hierarchical-default-promotion.ts",
    ),
    import.meta.url,
  );

  const report = await buildPhase2HierarchicalDefaultPromotion({
    repoRoot: root,
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2HierarchicalDefaultPromoted(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2HierarchicalDefaultPromotionArtifact({
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
        mode: report.config.mode,
        subqueryCount: report.telemetry.subqueryCount,
        selectedMergedCandidateIds: report.telemetry.selectedMergedCandidateIds,
        duplicateMergeReasons: report.telemetry.duplicateMergeReasons,
        exclusionReasons: report.telemetry.exclusionReasons,
        exactRecentWins: report.exactRecentRegression.exactRecentWins,
        rollbackObserved: report.telemetry.rollbackObserved,
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
