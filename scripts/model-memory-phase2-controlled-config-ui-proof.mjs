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
        `controlled config proof artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-config-ui-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-CONFIG-UI-PROOF-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_CONFIG_UI_PROOF_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let turn;
  try {
    turn = await harness.sendPrompt(
      [
        "Operator proof trigger for Model Memory Phase 2 controlled config UI proof.",
        `Proof marker: ${marker}.`,
        "Acknowledge that the operator UI path is reachable. Do not change default memory retrieval behavior.",
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

  const text = assistantText(turn);
  const uiEvidence = {
    sessionKey,
    proofMarker: marker,
    runId: turn?.runId ?? null,
    terminalEvidence: text.trim().length > 0,
    assistantTextSha256: sha256(text),
  };
  if (!uiEvidence.terminalEvidence) {
    throw new Error(
      "operator UI controlled config proof did not produce terminal assistant evidence",
    );
  }

  const {
    assertPhase2ControlledConfigUiProofPassed,
    buildPhase2ControlledConfigUiProof,
    writePhase2ControlledConfigUiProofArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/proof/phase2-controlled-config-ui-proof.ts"),
    import.meta.url,
  );
  const report = buildPhase2ControlledConfigUiProof({
    projectId: "phase2-controlled-config-ui-proof-project",
    proofRunId: `phase2-controlled-config-ui-proof-${stamp}`,
    markers: [marker],
    now: new Date(),
    uiEvidence,
  });
  assertPhase2ControlledConfigUiProofPassed(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2ControlledConfigUiProofArtifact({
    report,
    artifactDir: outputDir,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        reportId: report.reportId,
        proofRunId: report.proofRunId,
        marker,
        rolloutConfigId: report.rollout.configId,
        prerequisiteReportId: report.proofPrerequisites.reportId,
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
