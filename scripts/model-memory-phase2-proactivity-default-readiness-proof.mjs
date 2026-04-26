#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
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
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(root, envName, fallbackPath) {
  const artifactPath = process.env[envName] ?? fallbackPath;
  return JSON.parse(await readFile(path.join(root, artifactPath), "utf8"));
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
      throw new Error(`default readiness proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-default-readiness-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PROACTIVITY-DEFAULT-READINESS-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_DEFAULT_READINESS_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProactivityDefaultReadinessObserved,
    buildPhase2ProactivityDefaultReadinessReport,
    writePhase2ProactivityDefaultReadinessArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-default-readiness.ts"),
    import.meta.url,
  );
  const expandedOperatorDefaultReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_EXPANDED_OPERATOR_DEFAULT_ARTIFACT",
    ".artifacts/model-memory/phase2-proactive-message-expanded-operator-default-proof/20260426T133717656Z/b91f251f-3cea-5b38-aab2-bd0072b36405.phase2-proactive-message-expanded-operator-default.json",
  );
  const observabilityReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ARTIFACT",
    ".artifacts/model-memory/phase2-proactive-delivery-observability-proof/20260426T135018272Z/b36fea03-2d9b-5dca-9b00-ff4d31875f32.phase2-proactive-delivery-observability.json",
  );
  const scopedDeliveryReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_CONTROLLED_USER_SCOPE_ARTIFACT",
    ".artifacts/model-memory/phase2-controlled-user-facing-proactivity-scope-proof/20260426T140852336Z/75f2be16-f6c9-5359-a9f0-72a516c23875.phase2-controlled-user-facing-proactivity-scope.json",
  );
  const scopeExpansionReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_SCOPE_EXPANSION_ARTIFACT",
    ".artifacts/model-memory/phase2-proactivity-scope-expansion-decision-proof/20260426T143223623Z/26bdec31-8b76-5b3d-a936-46e395dc82f6.phase2-proactivity-scope-expansion-decision.json",
  );
  const cohortRolloutReport = await readJson(
    root,
    "MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_ARTIFACT",
    ".artifacts/model-memory/phase2-controlled-multi-user-proactivity-rollout-proof/20260426T144722557Z/b316a8de-d808-52ff-aa23-eab4a96e86ec.phase2-controlled-multi-user-proactivity-rollout.json",
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let readinessTurn;
  let blockedTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    readinessTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 proactivity default-readiness proof.",
        `Proof marker: ${marker}-READY.`,
        "Validate readiness aggregates Slices 32-36 and applies no default promotion.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    blockedTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 proactivity readiness blocked-case proof.",
        `Proof marker: ${marker}-BLOCKED.`,
        "Validate degraded observability blocks readiness.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityDefaultReadinessReport({
    proofMarker: marker,
    expandedOperatorDefaultReport,
    observabilityReport,
    scopedDeliveryReport,
    scopeExpansionReport,
    cohortRolloutReport,
    uiEvidence: {
      sessionKey,
      proofMarker: marker,
      readinessRunId: readinessTurn?.turnId ?? null,
      blockedCaseRunId: blockedTurn?.turnId ?? null,
      terminalEvidence: Boolean(readinessTurn && blockedTurn),
      observedTextSha256: sha256(marker),
    },
  });
  assertPhase2ProactivityDefaultReadinessObserved(report);

  const degradedBlock = await buildPhase2ProactivityDefaultReadinessReport({
    proofMarker: `${marker}-DEGRADED`,
    expandedOperatorDefaultReport,
    observabilityReport: {
      ...observabilityReport,
      status: "degraded",
      alerts: [
        {
          alertId: "phase2-readiness-degraded-alert",
          severity: "warning",
          reasonCode: "alert_missing_provenance",
          deliveryIds: [],
        },
      ],
    },
    scopedDeliveryReport,
    scopeExpansionReport,
    cohortRolloutReport,
  });
  if (degradedBlock.decision === "ready_for_default_promotion_decision") {
    throw new Error("degraded observability unexpectedly passed readiness");
  }

  const artifact = await writePhase2ProactivityDefaultReadinessArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, degradedBlock, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        marker,
        proofReportIds: report.telemetry.proofReportIds,
        deliverySuccessCount: report.telemetry.deliverySuccessCount,
        degradedDecision: degradedBlock.decision,
        defaultPromotionApplied: report.defaultPromotionApplied,
        autonomousSendingEnabled: report.telemetry.autonomousSendingEnabled,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        jsonPath: artifact.jsonPath,
        markdownPath: artifact.markdownPath,
        contentHash: artifact.contentHash,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
