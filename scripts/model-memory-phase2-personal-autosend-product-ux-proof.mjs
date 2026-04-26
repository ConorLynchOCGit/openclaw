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
      throw new Error(`personal autosend product UX proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-autosend-product-ux-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const defaultSlice48 = path.join(
    root,
    ".artifacts/model-memory/phase2-personal-autosend-trial-decision-proof/20260426T195449560Z/f442f74e-c7f0-5641-975a-cc59e5b3b05a.phase2-personal-autosend-trial-decision.json",
  );
  const personalTrialReport = await readJson(
    process.env.MODEL_MEMORY_PHASE2_SLICE48_ARTIFACT ?? defaultSlice48,
  );
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2PersonalAutoSendProductUxVisible,
    buildPhase2PersonalAutoSendProductUxReport,
    writePhase2PersonalAutoSendProductUxArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-personal-autosend-product-ux.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    settingsVisible: false,
    modeVisible: false,
    allowedClassVisible: false,
    followUpManualOnlyVisible: false,
    toggleOffReturnsManual: false,
    killSwitchStateVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".personal-autosend-panel", { timeout: 60_000 });
    await harness.page.waitForFunction(
      () =>
        document
          .querySelector(".personal-autosend-panel")
          ?.textContent?.includes("operator_approved_suggestion_available"),
      undefined,
      { timeout: 60_000 },
    );
    observedText = await harness.page.locator(".personal-autosend-panel").innerText({
      timeout: 30_000,
    });
    await harness.page.locator(".personal-autosend-disable").click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => document.body.textContent?.includes("manual only"),
      undefined,
      { timeout: 30_000 },
    );
    uiEvidence = {
      settingsVisible: true,
      modeVisible:
        observedText.includes("controlled autosend trial") ||
        observedText.includes("manual only") ||
        observedText.includes("disabled by kill switch"),
      allowedClassVisible: observedText.includes("operator_approved_suggestion_available"),
      followUpManualOnlyVisible: observedText.includes("operator_approved_follow_up_available"),
      toggleOffReturnsManual: true,
      killSwitchStateVisible: observedText.includes("MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED"),
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2PersonalAutoSendProductUxReport({
    personalTrialReport,
    uiEvidence,
  });
  assertPhase2PersonalAutoSendProductUxVisible(report);

  const manual = await buildPhase2PersonalAutoSendProductUxReport({
    personalTrialReport,
    userDisabled: true,
  });
  if (manual.settings.mode !== "manual_only") {
    throw new Error("personal autosend product UX did not return to manual-only");
  }
  const disabled = await buildPhase2PersonalAutoSendProductUxReport({
    personalTrialReport,
    env: { MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED: "1" },
  });
  if (disabled.settings.mode !== "disabled_by_kill_switch") {
    throw new Error("personal autosend product UX did not show kill-switch-disabled mode");
  }

  const artifact = await writePhase2PersonalAutoSendProductUxArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, manual, disabled, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        mode: report.settings.mode,
        allowedAutoSendClass: report.settings.allowedAutoSendClass,
        followUpManualOnly: report.telemetry.followUpClassManualOnly,
        manualModeDecision: manual.decision,
        disabledModeDecision: disabled.decision,
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
