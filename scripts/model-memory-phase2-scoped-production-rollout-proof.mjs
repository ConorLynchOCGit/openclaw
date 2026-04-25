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
        `scoped production rollout artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-scoped-production-rollout-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-SCOPED-PRODUCTION-ROLLOUT-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_SCOPED_ROLLOUT_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const goLiveArtifactPath =
    process.env.MODEL_MEMORY_PHASE2_GO_LIVE_ARTIFACT ??
    ".artifacts/model-memory/phase2-controlled-production-go-live-validation/20260425T225103347Z/70f68365-992a-5c3d-98a4-420579455687.phase2-go-live-validation.json";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let outsideTurn;
  let insideTurn;
  try {
    outsideTurn = await harness.sendPrompt(
      [
        "Operator scoped production rollout outside-scope default-off check for Model Memory Phase 2.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Confirm the UI path is reachable. Do not enable scoped controlled production behavior in this prompt.",
      ].join("\n"),
      {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 180_000,
      },
    );
    insideTurn = await harness.sendPrompt(
      [
        "Operator scoped production rollout inside-scope controlled behavior proof for Model Memory Phase 2.",
        `Proof marker: ${marker}-INSIDE.`,
        "Use only the bounded approved scoped production rollout path. Do not promote broad default behavior.",
      ].join("\n"),
      {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 180_000,
      },
    );
  } finally {
    await harness.close();
  }

  const outsideText = assistantText(outsideTurn);
  const insideText = assistantText(insideTurn);
  if (!outsideText.trim() || !insideText.trim()) {
    throw new Error("operator UI scoped rollout proof did not produce terminal assistant evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    outsideRunId: outsideTurn?.runId ?? null,
    insideRunId: insideTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${outsideText}\n${insideText}`),
  };

  const {
    APPROVED_PHASE2_GO_LIVE_CONFIG_ID,
    APPROVED_PHASE2_GO_LIVE_REPORT_ID,
    APPROVED_PHASE2_GO_LIVE_SCOPE_ID,
    assertPhase2ScopedProductionObserved,
    buildPhase2ScopedProductionObservation,
    writePhase2ScopedProductionObservationArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/retrieval/phase2-scoped-production-rollout.ts",
    ),
    import.meta.url,
  );

  const report = await buildPhase2ScopedProductionObservation({
    goLiveArtifactPath,
    expectedReportId: APPROVED_PHASE2_GO_LIVE_REPORT_ID,
    expectedScopeId: APPROVED_PHASE2_GO_LIVE_SCOPE_ID,
    expectedConfigId: APPROVED_PHASE2_GO_LIVE_CONFIG_ID,
    sessionKey,
    projectId: "phase2-controlled-config-ui-proof-project",
    operatorId: "operator",
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2ScopedProductionObserved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ScopedProductionObservationArtifact({
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
        profileId: report.profileId,
        goLiveReportId: report.goLiveReportId,
        rolloutScopeId: report.rolloutScopeId,
        rolloutConfigId: report.rolloutConfigId,
        graphReadObserved: report.insideScope.graphReadObserved,
        capsuleRetrievalObserved: report.insideScope.capsuleRetrievalObserved,
        capsuleContextObserved: report.insideScope.capsuleContextObserved,
        hierarchicalShadowOnly: report.insideScope.hierarchicalShadowOnly,
        defaultRetrievalChanged: report.defaultRetrievalChanged,
        defaultContextInjectionChanged: report.defaultContextInjectionChanged,
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
