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
      throw new Error(`real suggestion content proof contains prohibited: ${parts.join("")}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-real-suggestion-content-contract-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_REAL_SUGGESTION_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const {
    assertPhase2RealSuggestionContentReport,
    buildPhase2RealSuggestionContentReport,
    writePhase2RealSuggestionContentArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-real-suggestion-content-contract.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let observedText = "";
  try {
    await harness.ensureAuthenticated(sessionKey);
    await harness.page.waitForSelector(".proactivity-entrypoint__button", { timeout: 60_000 });
    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForFunction(
      () => {
        const text = document.querySelector(".chat-sidebar .proactivity-inbox")?.textContent ?? "";
        return (
          text.includes("Message preview") &&
          text.includes("Suggested action") &&
          !text.includes("An approved operator suggestion is available.")
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

  const report = await buildPhase2RealSuggestionContentReport();
  assertPhase2RealSuggestionContentReport(report);
  const generic = await buildPhase2RealSuggestionContentReport({ forceGenericPlaceholder: true });
  if (generic.decision !== "blocked") {
    throw new Error("generic placeholder-only candidate did not block");
  }
  const artifact = await writePhase2RealSuggestionContentArtifact({
    report,
    artifactDir: outputDir,
  });
  assertNoProhibitedContent({ report, generic, artifact, observedText });
  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: report.decision,
        reportId: report.reportId,
        previewCount: report.telemetry.previewCount,
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
