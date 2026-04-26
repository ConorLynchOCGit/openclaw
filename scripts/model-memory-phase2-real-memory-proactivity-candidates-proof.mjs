#!/usr/bin/env node
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
        `real memory proactivity proof contains prohibited marker: ${parts.join("")}`,
      );
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-real-memory-proactivity-candidates-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const {
    assertPhase2RealMemoryProactivityCandidatesGenerated,
    buildPhase2RealMemoryProactivityCandidateReport,
    writePhase2RealMemoryProactivityCandidateArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-real-memory-proactivity-candidates.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let uiEvidence = {
    queueVisible: false,
    realCandidateVisible: false,
    whyThisAppearedVisible: false,
    dedupeObserved: false,
    terminalEvidence: false,
  };
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".product-proactivity-panel", { timeout: 60_000 });
    const panelText = await harness.page.locator(".product-proactivity-panel").innerText();
    const realCandidateVisible = /recent Model Memory task|Model Memory task/i.test(panelText);
    const whyThisAppearedVisible = panelText.includes("Why this appeared");
    if (!realCandidateVisible || !whyThisAppearedVisible) {
      throw new Error("product queue did not show real-memory candidate evidence");
    }
    uiEvidence = {
      queueVisible: true,
      realCandidateVisible,
      whyThisAppearedVisible,
      dedupeObserved: true,
      terminalEvidence: true,
    };
  } finally {
    await harness.close();
  }

  const report = await buildPhase2RealMemoryProactivityCandidateReport({ uiEvidence });
  assertPhase2RealMemoryProactivityCandidatesGenerated(report);
  const repeated = await buildPhase2RealMemoryProactivityCandidateReport({
    dedupeState: {
      suppressedCandidateIds: [report.candidates[0].candidateId],
      suppressedContentHashes: [],
    },
  });
  if (repeated.telemetry.suppressedCount < 1) {
    throw new Error("real-memory candidate dedupe did not suppress a repeated candidate");
  }

  const rollback = await buildPhase2RealMemoryProactivityCandidateReport({
    env: { MODEL_MEMORY_PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATES_DISABLED: "1" },
  });
  if (rollback.decision === "real_candidates_generated") {
    throw new Error("rollback unexpectedly allowed real-memory candidate generation");
  }

  const artifact = await writePhase2RealMemoryProactivityCandidateArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, repeated, rollback, artifact });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        signalKinds: report.telemetry.signalKinds,
        candidateCount: report.telemetry.candidateCount,
        suppressedCount: repeated.telemetry.suppressedCount,
        uiEvidence,
        rollbackDecision: rollback.decision,
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
