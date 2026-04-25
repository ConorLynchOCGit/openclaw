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
      throw new Error(`go-live validation artifact contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-production-go-live-validation",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-PRODUCTION-GO-LIVE-${stamp}`;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_GO_LIVE_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const slice13ArtifactPath =
    process.env.MODEL_MEMORY_PHASE2_SLICE13_PROOF_ARTIFACT ??
    ".artifacts/model-memory/phase2-controlled-config-ui-proof/20260425T221153292Z/report.json";

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let defaultTurn;
  let scopedTurn;
  try {
    defaultTurn = await harness.sendPrompt(
      [
        "Operator go-live validation default-off check for Model Memory Phase 2.",
        `Proof marker: ${marker}-DEFAULT.`,
        "Confirm the UI path is reachable. Do not enable controlled production behavior in this prompt.",
      ].join("\n"),
      {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 180_000,
      },
    );
    scopedTurn = await harness.sendPrompt(
      [
        "Operator go-live validation scoped controlled-production proof for Model Memory Phase 2.",
        `Proof marker: ${marker}-SCOPED.`,
        "Use only the bounded proof/eval controlled config path. Do not promote broad default behavior.",
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

  const defaultText = assistantText(defaultTurn);
  const scopedText = assistantText(scopedTurn);
  if (!defaultText.trim() || !scopedText.trim()) {
    throw new Error("operator UI go-live proof did not produce terminal assistant evidence");
  }

  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    runId: scopedTurn?.runId ?? null,
    terminalEvidence: true,
    assistantTextSha256: sha256(`${defaultText}\n${scopedText}`),
  };

  const {
    assertPhase2ControlledProductionGoLiveValidationPassed,
    buildPhase2ControlledProductionGoLiveValidation,
    writePhase2ControlledProductionGoLiveValidationArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/proof/phase2-controlled-production-go-live.ts"),
    import.meta.url,
  );

  const report = await buildPhase2ControlledProductionGoLiveValidation({
    artifactRoot: root,
    slice13ArtifactPath,
    sessionKey,
    projectId: "phase2-controlled-config-ui-proof-project",
    operatorId: "operator",
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2ControlledProductionGoLiveValidationPassed(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledProductionGoLiveValidationArtifact({
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
        rolloutScopeId: report.rolloutScope.scopeId,
        rolloutConfigId: report.rolloutReport.configId,
        approvedCapabilities: report.telemetry.approvedCapabilities,
        blockedCapabilities: report.telemetry.blockedCapabilities,
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
