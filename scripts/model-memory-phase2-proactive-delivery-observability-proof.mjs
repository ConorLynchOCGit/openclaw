#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  DEFAULT_TAILNET_ORIGIN,
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
        `proactive delivery observability proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactive-delivery-observability-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PROACTIVE-DELIVERY-OBSERVABILITY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;

  const { buildPhase2ProactiveMessageExpandedOperatorDefaultReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-message-expanded-operator-default.ts",
    ),
    import.meta.url,
  );
  const {
    assertPhase2ProactiveDeliveryObservabilityHealthy,
    buildPhase2ProactiveDeliveryHealthReport,
    writePhase2ProactiveDeliveryObservabilityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-delivery-observability.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let healthTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    healthTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 proactive delivery observability proof.",
        `Proof marker: ${marker}-HEALTH.`,
        "Review bounded proactive delivery health, rollback, and abuse regression reports.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );

    const expandedOperatorDefaultReport =
      await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
        proofMarker: `${marker}-EXPANDED-DEFAULT`,
        now: new Date(),
      });
    const rollbackReport = await buildPhase2ProactiveDeliveryHealthReport({
      proofMarker: `${marker}-ROLLBACK`,
      now: new Date(),
      expandedOperatorDefaultReport,
      env: { MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK: "1" },
    });
    if (!rollbackReport.rollbackProof.allProactiveDeliveryDisabled) {
      throw new Error("rollback proof did not disable proactive delivery");
    }
    const abuseRegressionReport = await buildPhase2ProactiveDeliveryHealthReport({
      proofMarker: `${marker}-ABUSE-REGRESSION`,
      now: new Date(),
      expandedOperatorDefaultReport,
      forceDeliveryOutsideScope: true,
      forceMissingApproval: true,
      forceMissingSendApproval: true,
      forceBlockedMessageClassDelivery: true,
      forceExternalInstruction: true,
      forceRepeatedSuggestion: true,
      forceStaleSuggestion: true,
    });
    if (abuseRegressionReport.status !== "degraded") {
      throw new Error(`abuse regression status unexpected: ${abuseRegressionReport.status}`);
    }
    const leakageReport = await buildPhase2ProactiveDeliveryHealthReport({
      proofMarker: `${marker}-LEAKAGE`,
      now: new Date(),
      expandedOperatorDefaultReport,
      forceRawPrivateContentLeakage: true,
    });
    if (leakageReport.status !== "blocked") {
      throw new Error(`leakage regression did not block: ${leakageReport.status}`);
    }

    const report = await buildPhase2ProactiveDeliveryHealthReport({
      proofMarker: `${marker}-HEALTH`,
      now: new Date(),
      expandedOperatorDefaultReport,
      uiEvidence: {
        sessionKey,
        proofMarker: marker,
        healthRunId: healthTurn?.runId ?? null,
        rollbackRunId: rollbackReport.reportId,
        terminalEvidence: Boolean(assistantText(healthTurn).trim()),
        assistantTextSha256: sha256(assistantText(healthTurn)),
      },
    });
    assertPhase2ProactiveDeliveryObservabilityHealthy(report);
    assertNoProhibitedContent(report);

    const artifact = await writePhase2ProactiveDeliveryObservabilityArtifact({
      report,
      artifactDir: outputDir,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: report.status,
          reportId: report.reportId,
          marker,
          expandedOperatorDefaultReportId: report.expandedOperatorDefaultReportId,
          allowedMessageClasses: report.telemetry.allowedMessageClasses,
          deliveryIds: report.telemetry.deliveryIds,
          sendApprovalIds: report.telemetry.sendApprovalIds,
          noDarkDataStatus: report.noDarkDataStatus,
          rollbackDisabledAllDelivery: report.rollbackProof.allProactiveDeliveryDisabled,
          rollbackReportStatus: rollbackReport.status,
          abuseRegressionStatus: abuseRegressionReport.status,
          abuseRegressionReasonCodes: abuseRegressionReport.telemetry.alertReasonCodes,
          leakageStatus: leakageReport.status,
          jsonPath: artifact.jsonPath,
          markdownPath: artifact.markdownPath,
          contentHash: artifact.contentHash,
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
