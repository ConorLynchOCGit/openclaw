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
        `default promotion proof artifact contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-default-promotion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-DEFAULT-PROMOTION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;

  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let defaultTurn;
  let rollbackTurn;
  try {
    defaultTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 default-promotion proof for Model Memory.",
        `Proof marker: ${marker}-DEFAULT.`,
        "Use ordinary/default retrieval behavior and report whether Phase 2 default-promoted graph, project_state capsule retrieval, and gated capsule context evidence are available. Do not enable hierarchical retrieval.",
      ].join("\n"),
      {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 180_000,
      },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 default-promotion rollback proof for Model Memory.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Confirm the rollback/kill-switch path disables the default-promoted graph and capsule context behavior. Keep hierarchical retrieval shadow-only.",
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
  const rollbackText = assistantText(rollbackTurn);
  if (!defaultText.trim() || !rollbackText.trim()) {
    throw new Error(
      "operator UI default-promotion proof did not produce terminal assistant evidence",
    );
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
    assertPhase2DefaultPromotionApproved,
    buildPhase2DefaultPromotionDecision,
    writePhase2DefaultPromotionArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/retrieval/phase2-default-promotion.ts"),
    import.meta.url,
  );

  const report = await buildPhase2DefaultPromotionDecision({
    repoRoot: root,
    proofMarker: marker,
    now: new Date(),
    uiEvidence,
  });
  assertPhase2DefaultPromotionApproved(report);
  assertNoProhibitedContent(report);

  const written = await writePhase2DefaultPromotionArtifact({
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
        configId: report.defaultPromotionConfig.configId,
        promotedCapabilities: report.telemetry.promotedCapabilities,
        shadowOnlyCapabilities: report.telemetry.shadowOnlyCapabilities,
        graphReadObserved: Boolean(report.defaultControlledPack.runtimeGraph?.readOnly),
        capsuleRetrievalObserved:
          (report.defaultControlledPack.capsuleRetrievalShadow?.packs.length ?? 0) > 0,
        capsuleContextObserved:
          (report.defaultControlledPack.capsuleContext?.blocks.length ?? 0) > 0,
        hierarchicalReadiness: report.hierarchicalReadiness.status,
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
