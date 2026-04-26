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
      throw new Error(`scope expansion proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-scope-expansion-decision-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-PROACTIVITY-SCOPE-EXPANSION-DECISION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_SCOPE_EXPANSION_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;

  const scopedArtifact = await readJson(
    root,
    ".artifacts/model-memory/phase2-controlled-user-facing-proactivity-scope-proof/20260426T140852336Z/75f2be16-f6c9-5359-a9f0-72a516c23875.phase2-controlled-user-facing-proactivity-scope.json",
  );
  const observabilityArtifact = await readJson(
    root,
    ".artifacts/model-memory/phase2-proactive-delivery-observability-proof/20260426T135018272Z/b36fea03-2d9b-5dca-9b00-ff4d31875f32.phase2-proactive-delivery-observability.json",
  );

  const {
    assertPhase2ProactivityScopeExpansionApproved,
    buildPhase2ProactivityScopeExpansionDecisionReport,
    writePhase2ProactivityScopeExpansionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactivity-scope-expansion-decision.ts",
    ),
    import.meta.url,
  );
  const { buildPhase2ProactiveDeliveryHealthReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-delivery-observability.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let uiEvidence;
  try {
    await harness.ensureAuthenticated(sessionKey);
    const proofTurn = await harness.sendPrompt(
      [
        marker,
        "Review Phase 2 proactive scope expansion telemetry using bounded proof artifacts only.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    uiEvidence = {
      sessionKey,
      proofMarker: marker,
      expansionReviewRunId: proofTurn?.turnId ?? null,
      degradedObservabilityRunId: null,
      terminalEvidence: Boolean(proofTurn),
      observedTextSha256: sha256(marker),
    };
  } finally {
    await harness.close();
  }

  const approved = await buildPhase2ProactivityScopeExpansionDecisionReport({
    proofMarker: marker,
    scopedDeliveryReport: scopedArtifact,
    observabilityReport: observabilityArtifact,
    expectedSlice34ReportId: "75f2be16-f6c9-5359-a9f0-72a516c23875",
    expectedSlice33ReportId: "b36fea03-2d9b-5dca-9b00-ff4d31875f32",
    uiEvidence,
  });
  assertPhase2ProactivityScopeExpansionApproved(approved);

  const degradedObservability = await buildPhase2ProactiveDeliveryHealthReport({
    proofMarker: marker,
    forceMissingApproval: true,
  });
  const degradedBlocked = await buildPhase2ProactivityScopeExpansionDecisionReport({
    proofMarker: `${marker}-DEGRADED`,
    scopedDeliveryReport: scopedArtifact,
    observabilityReport: degradedObservability,
  });
  if (
    degradedBlocked.decision !== "blocked" ||
    !degradedBlocked.blockedReasonCodes.includes("blocked_observability_degraded")
  ) {
    throw new Error("scope expansion proof did not block degraded observability");
  }

  const wildcardBlocked = await buildPhase2ProactivityScopeExpansionDecisionReport({
    proofMarker: `${marker}-WILDCARD`,
    scopedDeliveryReport: scopedArtifact,
    observabilityReport: observabilityArtifact,
    candidateScope: {
      environment: "live",
      rolloutMode: "expanded_controlled_user_scope",
      scopeId: "invalid-global-scope",
      allowedSessionKeys: ["*"],
      allowedProjectIds: ["openclaw"],
      allowedUserIds: ["phase2-approved-user"],
      allowedRecipientIds: ["phase2-approved-recipient"],
      allowedOperatorIds: ["phase2-operator"],
      allowedMessageClasses: [
        "operator_approved_suggestion_available",
        "operator_approved_follow_up_available",
      ],
    },
  });
  if (
    wildcardBlocked.decision !== "blocked" ||
    !wildcardBlocked.blockedReasonCodes.includes("blocked_wildcard_scope")
  ) {
    throw new Error("scope expansion proof did not reject wildcard scope");
  }

  const artifact = await writePhase2ProactivityScopeExpansionArtifact({
    report: approved,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ approved, degradedBlocked, wildcardBlocked, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: approved.decision,
        reportId: approved.reportId,
        marker,
        expandedScopeId: approved.candidate.expandedScope.scopeId,
        observabilityStatus: approved.telemetryReview.observabilityStatus,
        degradedDecision: degradedBlocked.decision,
        wildcardDecision: wildcardBlocked.decision,
        broadDefaultProactivityEnabled: approved.config.broadDefaultProactivityEnabled,
        autonomousSendingEnabled: approved.config.autonomousSendingEnabled,
        noDarkDataStatus: approved.noDarkDataStatus,
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
  process.exit(1);
});
