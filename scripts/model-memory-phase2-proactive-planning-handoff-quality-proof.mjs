#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
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
      throw new Error(`handoff quality proof contains prohibited marker: ${marker}`);
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactive-planning-handoff-quality-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const {
    assertPhase2ProactiveHandoffQualityEnabled,
    buildPhase2ProactiveHandoffQualityReport,
    writePhase2ProactiveHandoffQualityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-planning-handoff-quality.ts",
    ),
    import.meta.url,
  );
  const payload = (actionType, workItemId) => ({
    workItemId,
    candidateId: `candidate-${workItemId}`,
    actionType,
    workItemKind:
      actionType === "investigate"
        ? "investigation_request"
        : actionType === "draft_next_steps"
          ? "draft_next_steps"
          : "planning_request",
    title: `Proactive ${actionType.replace(/_/g, " ")} handoff`,
    whyNow: "A live proactive opportunity is ready for useful agent work.",
    boundedContextSummary: "Bounded context from live proactivity signal evidence.",
    evidenceSummary: "Evidence is source-ref and hash bound.",
    sourceRefs: [`gateway://handoff-quality/${workItemId}`],
    sourceProfileIds: ["tool_result_capture"],
    authorityTiers: ["tool_grounded"],
    contentHashes: [`content-${workItemId}`],
    proofHashes: [`proof-${workItemId}`],
    limitations: ["bounded_context_only"],
    safetyBoundary: "No edits, sends, or action execution without explicit approval.",
    usesChatInject: false,
    executesAction: false,
    autonomousSending: false,
  });
  const report = await buildPhase2ProactiveHandoffQualityReport({
    payloads: [
      payload("plan_this", "work-item-plan"),
      payload("investigate", "work-item-investigate"),
      payload("draft_next_steps", "work-item-draft"),
    ],
  });
  assertPhase2ProactiveHandoffQualityEnabled(report);
  const artifact = await writePhase2ProactiveHandoffQualityArtifact({
    report,
    artifactDir: outputDir,
  });
  const proof = {
    reportId: report.reportId,
    decision: report.decision,
    statuses: report.statuses,
    expectedOutputs: report.payloads.map((entry) => entry.expectedOutput),
    chatInjectObservedForNonMessage: report.telemetry.chatInjectObservedForNonMessage,
    actionExecutionObserved: report.telemetry.actionExecutionObserved,
    artifact,
  };
  assertNoProhibitedContent(proof);
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
