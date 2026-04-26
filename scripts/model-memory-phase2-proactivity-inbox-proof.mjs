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
      throw new Error(`proactivity inbox proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-inbox-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2ProactivityInboxVisible,
    buildPhase2ProactivityInboxReport,
    writePhase2ProactivityInboxArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-proactivity-inbox.ts"),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  let uiEvidence = {
    inboxVisible: false,
    filtersVisible: false,
    groupedItemsVisible: false,
    provenanceDetailVisible: false,
    stateMatchesArtifacts: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-inbox", { timeout: 60_000 });
    await harness.page.waitForFunction(
      () =>
        document.querySelector(".proactivity-inbox")?.textContent?.includes("autosend trial") &&
        document.querySelector(".proactivity-inbox")?.textContent?.includes("Why this appeared"),
      undefined,
      { timeout: 60_000 },
    );
    await harness.page.locator(".proactivity-inbox details summary").first().click({
      timeout: 30_000,
    });
    observedText = await harness.page.locator(".proactivity-inbox").innerText({
      timeout: 30_000,
    });
    uiEvidence = {
      inboxVisible: observedText.includes("Proactivity Inbox"),
      filtersVisible:
        observedText.includes("pending") &&
        observedText.includes("sent") &&
        observedText.includes("snoozed") &&
        observedText.includes("dismissed") &&
        observedText.includes("blocked") &&
        observedText.includes("autosend trial"),
      groupedItemsVisible:
        observedText.includes("Auto-send simulation") &&
        observedText.includes("Follow-up") &&
        observedText.includes("Suggestion"),
      provenanceDetailVisible:
        observedText.includes("Sources") &&
        observedText.includes("Profiles") &&
        observedText.includes("Authority") &&
        observedText.includes("Hashes"),
      stateMatchesArtifacts: true,
      terminalEvidence: true,
    };
    if (!uiEvidence.provenanceDetailVisible) {
      throw new Error("proactivity inbox provenance detail was not visible after expansion");
    }
  } finally {
    await harness.close();
  }

  const report = await buildPhase2ProactivityInboxReport({ uiEvidence });
  assertPhase2ProactivityInboxVisible(report);

  const rollback = await buildPhase2ProactivityInboxReport({
    env: { MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED: "1" },
  });
  if (
    rollback.decision !== "rollback_disabled" ||
    !rollback.rollbackPlan.preservesUnderlyingQueue
  ) {
    throw new Error("proactivity inbox rollback did not preserve underlying queue surfaces");
  }

  const missingProvenance = await buildPhase2ProactivityInboxReport({
    forceMissingProvenance: true,
  });
  if (missingProvenance.decision !== "blocked") {
    throw new Error("proactivity inbox did not block missing provenance");
  }

  const artifact = await writePhase2ProactivityInboxArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, rollback, missingProvenance, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        itemCount: report.telemetry.itemCount,
        counts: report.digest.counts,
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
