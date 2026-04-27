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
  for (const parts of [
    ["raw", "-", "prompt", "-", "marker"],
    ["raw", "-", "transcript", "-", "marker"],
    ["raw", "-", "tool", "-", "log", "-", "marker"],
    ["secret", "-", "marker"],
    ["private", "-", "phrase", "-", "marker"],
  ]) {
    if (serialized.includes(parts.join(""))) {
      throw new Error(`proactivity UX remediation proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-ux-remediation-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_UX_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProactivityUxRemediationReport,
    buildPhase2ProactivityUxRemediationReport,
    writePhase2ProactivityUxRemediationArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-ux-remediation.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    entryPointVisible: false,
    inboxAbsentFromThread: false,
    drawerOpened: false,
    actionableCardVisible: false,
    ctasVisible: false,
    provenanceDetailVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    const threadInboxCount = await harness.page.locator(".chat-thread .proactivity-inbox").count();
    const railCount = await harness.page.locator(".chat-proactivity-rail").count();
    if (threadInboxCount !== 0 || railCount !== 0) {
      throw new Error("full proactivity inbox is still mounted in the chat transcript workspace");
    }
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return (
          text.includes("Suggested action") &&
          text.includes("Message preview") &&
          text.includes("Approve & Send") &&
          text.includes("Dismiss") &&
          text.includes("Snooze")
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    await harness.page.locator(".chat-sidebar .proactivity-inbox details summary").first().click({
      timeout: 30_000,
    });
    observedText = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
    const observedLower = observedText.toLowerCase();
    uiEvidence = {
      entryPointVisible: true,
      inboxAbsentFromThread: true,
      drawerOpened: true,
      actionableCardVisible:
        observedLower.includes("suggested action") &&
        observedLower.includes("message preview") &&
        observedLower.includes("why this appeared"),
      ctasVisible:
        observedText.includes("Approve & Send") &&
        observedText.includes("Dismiss") &&
        observedText.includes("Snooze"),
      provenanceDetailVisible:
        observedLower.includes("sources") &&
        observedLower.includes("profiles") &&
        observedLower.includes("authority") &&
        observedLower.includes("hashes"),
      terminalEvidence: true,
    };
    if (!uiEvidence.actionableCardVisible || !uiEvidence.ctasVisible) {
      throw new Error("proactivity drawer did not expose actionable card controls");
    }
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityUxRemediationReport();
  assertPhase2ProactivityUxRemediationReport(report);
  const rollback = await buildPhase2ProactivityUxRemediationReport({
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled") {
    throw new Error("proactivity UX remediation rollback did not disable compact entry point");
  }
  const intrusive = await buildPhase2ProactivityUxRemediationReport({
    forceInboxInThread: true,
  });
  if (intrusive.decision !== "blocked") {
    throw new Error("proactivity UX remediation did not block transcript-mounted inbox");
  }

  const artifact = await writePhase2ProactivityUxRemediationArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rollback, intrusive, artifact, uiEvidence });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        pendingCount: report.entryPoint.pendingCount,
        cardCount: report.drawer.cards.length,
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
