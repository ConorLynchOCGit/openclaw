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

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-heartbeat-proactivity-reliability-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const {
    assertPhase2HeartbeatProactivityReliable,
    buildPhase2HeartbeatProactivityReliabilityReport,
    writePhase2HeartbeatProactivityReliabilityArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-heartbeat-proactivity-reliability.ts",
    ),
    import.meta.url,
  );
  const queueItem = {
    queueItemId: "queue-heartbeat-proof",
    candidateId: "candidate-heartbeat-proof",
    workItemId: "work-heartbeat-proof",
    workItemKind: "planning_request",
    workItemStatus: "not_started",
    primaryAction: {
      actionType: "plan_this",
      label: "Plan this",
      description: "Start bounded planning handoff.",
      requiresChatInject: false,
      executesAction: false,
    },
    secondaryActions: [],
    ctaExplanation: "Starts a bounded handoff.",
    handoffStatus: "idle",
    handoffError: null,
    handoffMessageAnchor: null,
    messageClass: "operator_approved_suggestion_available",
    boundedDisplayText: "Plan heartbeat reliability",
    messagePreview: "Plan heartbeat reliability",
    suggestedAction: "Plan heartbeat reliability",
    candidateSummary: "Plan heartbeat reliability",
    expectedUserValue: "Shows top live proactivity at workflow boundaries.",
    planTitle: "Harden heartbeat proactivity",
    problem: "Heartbeat should show top live opportunities, not diagnostics only.",
    proposedMessage: "Produce the heartbeat proactivity reliability plan.",
    userBenefit: "Makes proactivity visible without opening the inbox.",
    evidenceSummary: "Bounded heartbeat proof evidence.",
    confidence: "high",
    blockedIfMissing: [],
    layer: "actionable",
    attentionRequired: true,
    sendStatus: "idle",
    sendError: null,
    sentMessageAnchor: null,
    status: "pending_review",
    eligibleScope: {
      environment: "live",
      userId: "conor",
      recipientId: "conor",
      projectId: "openclaw",
      sessionKey: "main",
      operatorId: "operator",
      allowedMessageClasses: [
        "operator_approved_suggestion_available",
        "operator_approved_follow_up_available",
      ],
      proofPrerequisiteIds: [],
      proofPrerequisiteHashes: [],
    },
    sourceRefs: ["gateway://heartbeat/reliability-proof"],
    sourceProfileIds: ["tool_result_capture"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["content-heartbeat-proof"],
    proofHashes: ["proof-heartbeat-proof"],
    noDarkDataStatus: "pass",
    staleLabels: [],
    conflictLabels: [],
    blockedReasonCodes: [],
    generatedAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
  };
  const report = await buildPhase2HeartbeatProactivityReliabilityReport({
    queueItems: [queueItem],
    inboxWorkItemIds: [queueItem.workItemId],
    activeContextWorkItemIds: [queueItem.workItemId],
  });
  assertPhase2HeartbeatProactivityReliable(report);
  const artifact = await writePhase2HeartbeatProactivityReliabilityArtifact({
    report,
    artifactDir: outputDir,
  });
  console.log(
    JSON.stringify(
      {
        reportId: report.reportId,
        decision: report.decision,
        heading: report.surface.heading,
        topItemCount: report.telemetry.topItemCount,
        sharedWorkItemId: report.surface.topItems[0]?.workItemId,
        actionExecutionObserved: report.telemetry.actionExecutionObserved,
        artifact,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
