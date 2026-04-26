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
      throw new Error(`ingestion default proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-ingestion-default-promotion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-INGESTION-DEFAULT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_INGESTION_DEFAULT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let ingestionTurn;
  let rollbackTurn;
  try {
    ingestionTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 ingestion default-promotion proof.",
        `Proof marker: ${marker}-DEFAULT.`,
        "Verify default-enabled tool-grounded, daily-continuity, researcher/cited-soft, and cited-fact ingestion preserve source profile, authority tier, source refs, and lower-authority labels.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 ingestion rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify the ingestion kill switch returns default ingestion paths to operator-enabled only and raw/private material remains rejected or inspection-only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const ingestionText = assistantText(ingestionTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!ingestionText.trim() || !rollbackText.trim()) {
    throw new Error("operator UI ingestion default proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    ingestionRunId: ingestionTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${ingestionText}\n${rollbackText}`),
  };

  const {
    assertPhase2IngestionDefaultPromoted,
    buildPhase2IngestionDefaultPromotion,
    writePhase2IngestionDefaultPromotionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-ingestion-default-promotion.ts"),
    import.meta.url,
  );

  const report = await buildPhase2IngestionDefaultPromotion({
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2IngestionDefaultPromoted(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2IngestionDefaultPromotionArtifact({
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
        defaultEnabledCapabilities: report.telemetry.defaultEnabledCapabilities,
        blockedSourceIds: report.telemetry.blockedSourceIds,
        noDarkDataStatus: report.noDarkDataStatus,
        rollbackObserved: report.telemetry.rollbackObserved,
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
