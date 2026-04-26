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
        `production observability proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-production-observability-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PRODUCTION-OBSERVABILITY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCTION_OBSERVABILITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let healthTurn;
  let rollbackTurn;
  try {
    healthTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 production observability proof.",
        `Proof marker: ${marker}-HEALTH.`,
        "Verify live promoted graph reads, project_state capsule retrieval/context, hierarchical retrieval, health telemetry, no-dark-data status, and stale/conflict/inspection exclusions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 rollback observability proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Verify promoted retrieval capabilities can roll back to disabled or shadow-only modes and ordinary retrieval falls back safely.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const healthText = assistantText(healthTurn);
  const rollbackText = assistantText(rollbackTurn);
  if (!healthText.trim() || !rollbackText.trim()) {
    throw new Error("operator UI production observability proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    healthRunId: healthTurn?.runId ?? null,
    rollbackRunId: rollbackTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${healthText}\n${rollbackText}`),
  };

  const {
    assertPhase2ProductionObservable,
    buildPhase2ProductionObservabilityReport,
    writePhase2ProductionObservabilityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/retrieval/phase2-production-observability.ts",
    ),
    import.meta.url,
  );

  const report = await buildPhase2ProductionObservabilityReport({
    repoRoot: root,
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2ProductionObservable(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ProductionObservabilityArtifact({
    report,
    artifactDir: outputDir,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        status: report.status,
        reportId: report.reportId,
        marker,
        observedCapabilities: report.telemetry.observedCapabilities,
        alerts: report.alerts.map((alert) => alert.reasonCode),
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
