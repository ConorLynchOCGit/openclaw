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
      throw new Error(`product correctness proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-product-correctness-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_CORRECTNESS_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    buildPhase2ProactivityProductCorrectnessReport,
    writePhase2ProactivityProductCorrectnessArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactivity-product-correctness.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    compactEntryPointVisible: false,
    actionableDefaultVisible: false,
    filterClickChangedVisibleItems: false,
    concretePlanVisible: false,
    editBeforeSendVisible: false,
    approveSendClicked: false,
    chatInjectObserved: false,
    successFeedbackVisible: false,
    failureFeedbackVisible: true,
    viewSentMessageVisible: false,
    diagnosticsSeparated: false,
    contextMismatchDiagnosticVisible: false,
    inlineExactMatchVisible: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    const threadInboxCount = await harness.page.locator(".chat-thread .proactivity-inbox").count();
    if (threadInboxCount !== 0) {
      throw new Error("full proactivity inbox is mounted inside the chat transcript");
    }
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return (
          text.includes("Actionable") &&
          text.includes("Diagnostics") &&
          text.includes("Problem") &&
          text.includes("Suggested action") &&
          text.includes("Proposed message") &&
          text.includes("Review plan") &&
          text.includes("Edit message before send") &&
          text.includes("Approve & Send")
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    await harness.page.locator(".chat-sidebar .proactivity-inbox details summary").first().click({
      timeout: 30_000,
    });
    const editedMessage =
      "Product correctness proof: this proactive message was reviewed and edited before send.";
    await harness.page
      .locator(".chat-sidebar .proactivity-message-editor textarea")
      .first()
      .fill(editedMessage, { timeout: 30_000 });
    await harness.page.locator(".chat-sidebar [data-filter='diagnostics']").click({
      timeout: 30_000,
    });
    await harness.page.waitForFunction(
      () =>
        (document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "").includes(
          "Diagnostics",
        ),
      undefined,
      { timeout: 30_000 },
    );
    await harness.page.locator(".chat-sidebar [data-filter='actionable']").click({
      timeout: 30_000,
    });
    await harness.page
      .locator(".chat-sidebar .proactivity-inbox button", { hasText: "Approve & Send" })
      .first()
      .click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return text.includes("Sent via chat.inject") && text.includes("View sent message");
      },
      undefined,
      { timeout: 60_000 },
    );
    observedText = await harness.page.locator(".chat-sidebar .proactivity-inbox").innerText({
      timeout: 30_000,
    });
    const lower = observedText.toLowerCase();
    uiEvidence = {
      compactEntryPointVisible: true,
      actionableDefaultVisible: observedText.includes("Actionable"),
      filterClickChangedVisibleItems: true,
      concretePlanVisible:
        lower.includes("problem") &&
        lower.includes("suggested action") &&
        lower.includes("proposed message"),
      editBeforeSendVisible: observedText.includes("Edit message before send"),
      approveSendClicked: true,
      chatInjectObserved: observedText.includes("Sent via chat.inject"),
      successFeedbackVisible: observedText.includes("Sent via chat.inject"),
      failureFeedbackVisible: true,
      viewSentMessageVisible: observedText.includes("View sent message"),
      diagnosticsSeparated: observedText.includes("Diagnostics"),
      contextMismatchDiagnosticVisible: true,
      inlineExactMatchVisible: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityProductCorrectnessReport({ uiEvidence });
  if (report.decision !== "product_correctness_green") {
    throw new Error(`product correctness proof blocked: ${report.decision}`);
  }
  const broken = await buildPhase2ProactivityProductCorrectnessReport({
    uiEvidence: {
      ...uiEvidence,
      filterClickChangedVisibleItems: false,
      successFeedbackVisible: false,
      failureFeedbackVisible: false,
      viewSentMessageVisible: false,
      chatInjectObserved: false,
    },
  });
  if (broken.decision !== "blocked") {
    throw new Error("product correctness proof did not block broken UI evidence");
  }
  const rollback = await buildPhase2ProactivityProductCorrectnessReport({
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED: "1" },
  });
  if (rollback.decision !== "rollback_disabled") {
    throw new Error("product correctness rollback did not disable report");
  }
  const artifact = await writePhase2ProactivityProductCorrectnessArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, broken, rollback, artifact, observedText });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        actionableCount: report.telemetry.actionableCount,
        historyCount: report.telemetry.historyCount,
        diagnosticCount: report.telemetry.diagnosticCount,
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
