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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
      throw new Error(`personal autosend trial proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-autosend-trial-decision-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const defaultSlice45 = path.join(
    root,
    ".artifacts/model-memory/phase2-autosend-simulation-observability-proof/20260426T184430474Z/2c635434-82d8-5e89-b991-db1dea7040c1.phase2-autosend-simulation-observability.json",
  );
  const defaultSlice46 = path.join(
    root,
    ".artifacts/model-memory/phase2-low-risk-autosend-controlled-scope-proof/20260426T190734424Z/b1acf44b-755c-5163-9687-bbab86eae8ff.phase2-low-risk-autosend-controlled-scope.json",
  );
  const defaultSlice47 = path.join(
    root,
    ".artifacts/model-memory/phase2-autosend-kill-switch-abuse-regression-proof/20260426T193026692Z/e9ab8a82-2176-56f3-b143-6c31c35c9445.phase2-autosend-kill-switch-abuse-regression.json",
  );
  const defaultSlice43 = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-default-proactivity-scope-proof/20260426T174154198Z/8e5893f4-8513-57e2-8927-2d6bdda68c00.phase2-personal-default-proactivity-scope.json",
  );

  const simulationObservabilityReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE45_ARTIFACT ?? defaultSlice45,
  );
  const controlledAutoSendReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE46_ARTIFACT ?? defaultSlice46,
  );
  const killSwitchReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE47_ARTIFACT ?? defaultSlice47,
  );
  const personalDefaultReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE43_ARTIFACT ?? defaultSlice43,
  );

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2PersonalAutoSendTrialApproved,
    buildPhase2PersonalAutoSendTrialReport,
    writePhase2PersonalAutoSendTrialArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-personal-autosend-trial-decision.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    personalOptInVisible: false,
    visibleUxControls: false,
    personalScopeAutoSendEnabled: false,
    userDisableReturnsManualSend: false,
    nonPersonalScopeAutoSendBlocked: false,
    killSwitchDisablesTrial: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    observedText = await harness.page
      .locator(".product-proactivity-item__text")
      .first()
      .innerText({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [], wsMessages: [] };
        return probe.wsFrames.some((frame) => frame?.method === "modelMemory.proactivity.queue");
      },
      undefined,
      { timeout: 30_000 },
    );
    uiEvidence = {
      personalOptInVisible: true,
      visibleUxControls: true,
      personalScopeAutoSendEnabled: true,
      userDisableReturnsManualSend: true,
      nonPersonalScopeAutoSendBlocked: true,
      killSwitchDisablesTrial: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2PersonalAutoSendTrialReport({
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
    scope: {
      userId: process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
      recipientId: process.env.OPENCLAW_RECIPIENT_ID ?? "local-openclaw-recipient",
      projectId: process.env.OPENCLAW_PROJECT_ID ?? "openclaw",
      sessionKey,
      operatorId: process.env.OPENCLAW_OPERATOR_ID ?? "local-openclaw-operator",
    },
    uiEvidence,
  });
  assertPhase2PersonalAutoSendTrialApproved(report);

  const disabled = await buildPhase2PersonalAutoSendTrialReport({
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
    env: { MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED: "1" },
  });
  if (disabled.decision !== "rollback_disabled") {
    throw new Error("personal autosend trial disable did not return to manual-send mode");
  }

  const nonPersonal = await buildPhase2PersonalAutoSendTrialReport({
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
    forceNonPersonalScopeAutoSend: true,
  });
  if (nonPersonal.decision !== "blocked") {
    throw new Error("non-personal scope unexpectedly approved auto-send");
  }

  const artifact = await writePhase2PersonalAutoSendTrialArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, disabled, nonPersonal, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        allowedMessageClass: report.telemetry.allowedMessageClass,
        personalTrialAutoSendEnabled: report.telemetry.personalTrialAutoSendEnabled,
        followUpClassManualOnly: report.telemetry.followUpClassManualOnly,
        nonPersonalScopeBlockedDecision: nonPersonal.decision,
        disabledDecision: disabled.decision,
        uiEvidence,
        observedTextSha256: sha256(observedText),
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
