#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

function assistantText(turn) {
  const transcriptText = turn?.completionEvidence?.transcript?.assistantText;
  if (typeof transcriptText === "string" && transcriptText.trim().length > 0) {
    return transcriptText;
  }
  return turn?.summary?.lastAssistantText ?? "";
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-ui-runtime-proof-coverage",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-UI-RUNTIME-PROOF-COVERAGE-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_UI_RUNTIME_PROOF_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const harness = await new OperatorBrowserHarness({ headless: true }).start();
  let turn;
  try {
    turn = await harness.sendPrompt(
      [
        "Operator proof trigger for Model Memory Phase 2 UI runtime proof coverage.",
        `Proof marker: ${marker}.`,
        "Acknowledge that the operator UI path is reachable for this proof run.",
      ].join("\n"),
      {
        sessionKey,
        waitFor: "terminal",
        timeoutMs: 180_000,
      },
    );
  } finally {
    await harness.close();
  }

  const text = assistantText(turn);
  const uiEvidence = {
    sessionKey,
    promptMarker: marker,
    runId: turn?.runId ?? null,
    terminalEvidence: text.trim().length > 0,
    assistantTextSha256: sha256(text),
  };
  if (!uiEvidence.terminalEvidence) {
    throw new Error("operator UI proof did not produce terminal assistant evidence");
  }

  const {
    assertPhase2UiRuntimeProofCoveragePassed,
    buildPhase2UiRuntimeProofCoverage,
    writePhase2UiRuntimeProofCoverageArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/proof/phase2-ui-runtime-proof-coverage.ts"),
    import.meta.url,
  );
  const report = buildPhase2UiRuntimeProofCoverage({
    mode: "explicit_operator_proof",
    projectId: "phase2-ui-runtime-proof-project",
    now: new Date(),
    uiEvidence,
  });
  assertPhase2UiRuntimeProofCoveragePassed(report);

  const written = await writePhase2UiRuntimeProofCoverageArtifact({
    report,
    artifactDir: outputDir,
  });
  const markdownPath = path.join(outputDir, "report.md");
  const failures = report.checks.filter((check) => check.status !== "pass");
  await writeFile(
    markdownPath,
    [
      "# Phase 2 UI Runtime Proof Coverage",
      "",
      `- report_id: ${report.reportId}`,
      `- proof_marker: ${marker}`,
      `- session_key: ${sessionKey}`,
      `- ui_terminal_evidence: ${uiEvidence.terminalEvidence}`,
      `- checks: ${report.checks.length}`,
      `- failures: ${failures.length ? failures.map((failure) => failure.checkId).join(", ") : "none"}`,
      `- json_report: ${written.path}`,
      `- json_content_hash: ${written.contentHash}`,
      "",
      "## Coverage",
      "",
      `- maintenance_loop: ${report.coverage.maintenanceLoop.eventCandidateIds.length} event candidate(s)`,
      `- runtime_graph: ${report.coverage.runtimeGraph.nodeIds.length} node(s), ${report.coverage.runtimeGraph.edgeIds.length} edge(s)`,
      `- project_state_capsule: ${report.coverage.projectStateCapsule.capsuleId}`,
      `- capsule_retrieval_shadow: ${report.coverage.capsuleRetrievalShadow.wouldSelectCapsuleIds.length} would-select capsule(s)`,
      `- gated_capsule_context: injected=${report.coverage.gatedCapsuleContext.explicitInjected}`,
      `- hierarchical_retrieval_shadow: ${report.coverage.hierarchicalRetrievalShadow.subqueryCount} subquery(s)`,
      `- slice8_integration_proof: ${report.coverage.slice8IntegrationProof.reportId}`,
      `- slice9_eval_proof: ${report.coverage.slice9EvalProof.reportId}`,
      `- non_user_prompt_ingestion: tool_grounded=${report.coverage.nonUserPromptIngestion.toolGrounded.admittedCount}, daily_continuity=${report.coverage.nonUserPromptIngestion.dailyContinuity.represented}`,
    ].join("\n"),
    "utf8",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: failures.length === 0,
        reportId: report.reportId,
        jsonPath: written.path,
        markdownPath,
      },
      null,
      2,
    )}\n`,
  );
  if (failures.length > 0) {
    process.exit(1);
  }
}

await main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
