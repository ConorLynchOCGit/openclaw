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
        `operator ingestion proof artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-operator-ingestion-maintenance-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-OPERATOR-INGESTION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let ingestionTurn;
  let maintenanceTurn;
  try {
    ingestionTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 ingestion rollout proof.",
        `Proof marker: ${marker}-INGESTION.`,
        "Exercise operator-enabled tool-grounded capture, daily continuity capture, researcher cited-soft capture, and reject assistant prose/raw/private material. Report terminal evidence only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    maintenanceTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 maintenance surfacing proof.",
        `Proof marker: ${marker}-MAINTENANCE.`,
        "Show operator-visible maintenance candidates for active, archived, and pinned lifecycle states. Keep this report-only and bounded.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const ingestionText = assistantText(ingestionTurn);
  const maintenanceText = assistantText(maintenanceTurn);
  if (!ingestionText.trim() || !maintenanceText.trim()) {
    throw new Error("operator ingestion proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    ingestionRunId: ingestionTurn?.runId ?? null,
    maintenanceRunId: maintenanceTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${ingestionText}\n${maintenanceText}`),
  };

  const {
    assertPhase2OperatorIngestionRolledOut,
    buildPhase2OperatorIngestionRollout,
    writePhase2OperatorIngestionRolloutArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-operator-ingestion-rollout.ts"),
    import.meta.url,
  );

  const report = buildPhase2OperatorIngestionRollout({
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2OperatorIngestionRolledOut(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2OperatorIngestionRolloutArtifact({
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
        sourceProfileIds: report.telemetry.sourceProfileIds,
        authorityTiers: report.telemetry.authorityTiers,
        admittedSourceIds: report.telemetry.admittedSourceIds,
        rejectedSourceIds: report.telemetry.rejectedSourceIds,
        inspectionOnlySourceIds: report.telemetry.inspectionOnlySourceIds,
        maintenanceCandidateIds: report.telemetry.maintenanceCandidateIds,
        noDarkDataStatus: report.noDarkDataStatus,
        jsonPath: written.jsonPath,
        markdownPath: written.markdownPath,
        maintenanceArtifactPath: written.maintenanceArtifactPath,
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
