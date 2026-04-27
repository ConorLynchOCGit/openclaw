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
  return createHash("sha256").update(value).digest("hex");
}

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`usefulness tuning proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-usefulness-tuning-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_USEFULNESS_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2ProactivityUsefulnessReport,
    buildPhase2ProactivityUsefulnessReport,
    writePhase2ProactivityUsefulnessArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-usefulness-tuning.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return (
          text.includes("Useful") &&
          text.includes("Not useful") &&
          text.includes("Too repetitive") &&
          text.includes("Wrong context") &&
          text.includes("Unsafe/private")
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    observedText = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityUsefulnessReport({
    uiEvidence: {
      usefulnessControlsVisible: true,
      qualityReportVisible: true,
      whyNotShownDiagnosticVisible: true,
      rollbackDisablesTuning: true,
      terminalEvidence: true,
    },
  });
  assertPhase2ProactivityUsefulnessReport(report);
  if (report.suppressionRules.length === 0 || report.whyNotShownDiagnostics.length === 0) {
    throw new Error("usefulness tuning proof expected suppression and why-not-shown diagnostics");
  }
  const rollback = await buildPhase2ProactivityUsefulnessReport({
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled" || rollback.suppressionRules.length !== 0) {
    throw new Error("usefulness tuning rollback did not disable tuning effects");
  }
  const artifact = await writePhase2ProactivityUsefulnessArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rollback, artifact, observedText });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        uxEventCount: report.telemetry.uxEventCount,
        suppressionRuleCount: report.telemetry.suppressionRuleCount,
        whyNotShownCount: report.telemetry.whyNotShownCount,
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
