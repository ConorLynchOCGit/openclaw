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
      throw new Error(`multi-user proactivity proof contains prohibited marker: ${parts.join("")}`);
    }
  }
}

async function latestExpansionArtifact(root) {
  const explicit =
    process.env.MODEL_MEMORY_PHASE2_SCOPE_EXPANSION_ARTIFACT ??
    ".artifacts/model-memory/phase2-proactivity-scope-expansion-decision-proof/20260426T143223623Z/26bdec31-8b76-5b3d-a936-46e395dc82f6.phase2-proactivity-scope-expansion-decision.json";
  return JSON.parse(await readFile(path.join(root, explicit), "utf8"));
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-multi-user-proactivity-rollout-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-MULTI-USER-PROACTIVITY-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ControlledMultiUserProactivityObserved,
    buildPhase2ControlledMultiUserProactivityReport,
    writePhase2ControlledMultiUserProactivityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-multi-user-proactivity-rollout.ts",
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
  const scopeExpansionReport = await latestExpansionArtifact(root);
  const observabilityReport = await buildPhase2ProactiveDeliveryHealthReport({
    proofMarker: marker,
  });

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let insideTurn;
  let outsideTurn;
  let rollbackTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    insideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled multi-user proactivity proof.",
        `Proof marker: ${marker}-INSIDE.`,
        "Validate approved cohort recipients only; per-recipient send approval is required.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    outsideTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 non-cohort blocking proof.",
        `Proof marker: ${marker}-OUTSIDE.`,
        "Validate non-cohort recipients receive no proactive message.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
    rollbackTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 multi-user rollback proof.",
        `Proof marker: ${marker}-ROLLBACK.`,
        "Validate rollback disables cohort proactive delivery.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );
  } finally {
    await harness.close();
  }

  const inside = await buildPhase2ControlledMultiUserProactivityReport({
    proofMarker: marker,
    scopeExpansionReport,
    observabilityReport,
    messageClass: "operator_approved_follow_up_available",
    uiEvidence: {
      sessionKey,
      proofMarker: marker,
      insideCohortRunId: insideTurn?.turnId ?? null,
      outsideCohortRunId: outsideTurn?.turnId ?? null,
      rollbackRunId: rollbackTurn?.turnId ?? null,
      terminalEvidence: Boolean(insideTurn && outsideTurn && rollbackTurn),
      observedTextSha256: sha256(marker),
    },
  });
  assertPhase2ControlledMultiUserProactivityObserved(inside);

  const outside = await buildPhase2ControlledMultiUserProactivityReport({
    proofMarker: `${marker}-OUTSIDE`,
    scopeExpansionReport,
    observabilityReport,
    requestRecipient: {
      recipientId: "non-cohort-recipient",
      userId: "non-cohort-user",
      sessionKey: "non-cohort-session",
      projectId: "openclaw",
      operatorId: "phase2-operator",
      sendApprovalIds: ["non-cohort-approval"],
    },
  });
  if (outside.decision !== "blocked_non_cohort_recipient") {
    throw new Error(`expected non-cohort recipient to block, got ${outside.decision}`);
  }

  const rollback = await buildPhase2ControlledMultiUserProactivityReport({
    proofMarker: `${marker}-ROLLBACK`,
    scopeExpansionReport,
    observabilityReport,
    env: { MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED: "1" },
  });
  if (rollback.decision !== "blocked_rollback") {
    throw new Error(`expected rollback to block cohort delivery, got ${rollback.decision}`);
  }

  const artifact = await writePhase2ControlledMultiUserProactivityArtifact({
    report: inside,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ inside, outside, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: inside.decision,
        reportId: inside.reportId,
        marker,
        cohortId: inside.config.rolloutScope.cohortId,
        deliveredRecipientIds: inside.telemetry.deliveredRecipientIds,
        outsideDecision: outside.decision,
        rollbackDecision: rollback.decision,
        broadDefaultProactivityEnabled: inside.telemetry.broadDefaultProactivityEnabled,
        autonomousSendingEnabled: inside.telemetry.autonomousSendingEnabled,
        noDarkDataStatus: inside.noDarkDataStatus,
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
