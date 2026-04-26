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
      throw new Error(`planner readiness proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-planner-readiness-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PLANNER-READINESS-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PLANNER_READINESS_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let readinessTurn;
  try {
    readinessTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 planner-readiness preflight proof.",
        `Proof marker: ${marker}.`,
        "Generate report-only planner readiness evidence across durable memories, project docs, curated docs, tool-grounded artifacts, researcher/cited-soft artifacts, daily continuity, graph summaries, project_state capsules, retrieval packs, hierarchical plans, maintenance reports, production observability reports, and rollout proof reports.",
        "Do not surface proactive behavior or execute planner actions.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const readinessText = assistantText(readinessTurn);
  if (!readinessText.trim()) {
    throw new Error("operator UI planner readiness proof lacked terminal evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    plannerReadinessRunId: readinessTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(readinessText),
  };

  const {
    assertPhase2PlannerReadinessReportOnly,
    buildPhase2PlannerReadinessReport,
    writePhase2PlannerReadinessArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-planner-readiness.ts"),
    import.meta.url,
  );

  const report = await buildPhase2PlannerReadinessReport({
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2PlannerReadinessReportOnly(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2PlannerReadinessArtifact({
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
        readableArtifactKinds: report.telemetry.readableArtifactKinds,
        candidates: report.candidates.length,
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
