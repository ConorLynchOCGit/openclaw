import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import { buildPhase2ProductProactivitySurfacingReport } from "./phase2-product-proactivity-presentation.ts";
import {
  buildPhase2ProactivityNotificationReport,
  writePhase2ProactivityNotificationArtifact,
} from "./phase2-user-facing-proactivity-notification-ux.ts";

function modelBriefJsonOutput() {
  return JSON.stringify({
    schemaVersion: "model_authored_proactivity_brief_output.v1",
    decision: "surface",
    kindCode: "follow_up",
    titleWords: ["Notification", "validation", "follow-up"],
    oneLinePurposeWords: [
      "Keeps",
      "notification",
      "validation",
      "tied",
      "to",
      "reviewed",
      "proactivity",
      "evidence",
    ],
    recommendedNextStepWords: [
      "Review",
      "the",
      "notification",
      "validation",
      "card",
      "and",
      "confirm",
      "its",
      "details",
    ],
    primaryActionLabelWords: ["Plan", "this"],
    statusLabelWords: null,
    detailSummaryWords: ["Bounded", "notification", "evidence", "is", "available"],
    hiddenDiagnostics: { whyDemotedOrRepairedWords: null, limitations: [] },
    qualityReasons: [],
  });
}

class FakeModelBriefExecutor implements JsonModelExecutor {
  async execute(request: JsonModelExecutionRequest) {
    return {
      outputText: modelBriefJsonOutput(),
      resolvedModelId: request.contract.modelId,
      usage: { promptTokens: 120, outputTokens: 80 },
    };
  }
}

async function buildLiveProductSurfacingReport(now: Date) {
  const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
    now,
    sources: [
      {
        sourceId: "notification-live-source-1",
        sourceType: "session_runtime_event",
        signalKind: "active_work_state",
        projectId: "openclaw",
        sessionKey: "main",
        boundedSummary: "OpenClaw notification validation has a concrete live proactivity item.",
        sourceRefs: ["gateway://model-memory/proactivity/live-event/notification-live-source-1"],
        sourceProfileId: "manual_note",
        authorityTier: "tool_grounded",
        freshness: "recent",
        conflictState: "clear",
        noDarkDataStatus: "pass",
      },
    ],
    modelReviewedOpportunities: [
      {
        sourceId: "notification-live-source-1",
        workItemKind: "planning_request",
        title: "Notification validation follow-up",
        whyNow: "A model-reviewed candidate identified a concrete notification validation item.",
        proposedNextStep: "Review the notification validation card and confirm its details.",
        expectedUserValue: "Keeps notification validation tied to reviewed proactivity evidence.",
        evidenceSummary: "OpenClaw notification validation has a concrete live proactivity item.",
        confidence: "high",
      },
    ],
  });
  return buildPhase2ProductProactivitySurfacingReport({
    now,
    liveDetectionReport,
    modelBriefOptions: {
      enabled: true,
      executor: new FakeModelBriefExecutor(),
      modelId: "openai-codex/gpt-5.4",
    },
  });
}

describe("phase2 user-facing proactivity notification ux", () => {
  it("renders notification only for approved/send-approved items", async () => {
    const now = new Date("2026-04-26T18:00:00.000Z");
    const productSurfacingReport = await buildLiveProductSurfacingReport(now);
    const pending = await buildPhase2ProactivityNotificationReport({
      now,
      productSurfacingReport,
      queueItemStatus: "pending_review",
    });
    const sent = await buildPhase2ProactivityNotificationReport({
      now,
      productSurfacingReport,
      queueItemStatus: "sent",
    });

    expect(pending.decision).toBe("blocked");
    expect(pending.telemetry.visibleCount).toBe(0);
    expect(pending.telemetry.beforeApprovalVisibleCount).toBe(0);
    expect(sent.decision).toBe("notification_ux_enabled");
    expect(sent.notificationState.items[0]).toMatchObject({
      status: "visible",
      boundedDisplayText: "Notification validation follow-up",
    });
    expect(sent.telemetry.notificationSurfaceIsTranscriptOnly).toBe(false);
    expect(sent.telemetry.transcriptDeliveryStillAvailable).toBe(true);
  });

  it("preserves provenance details without raw/private content", async () => {
    const report = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "approved_not_sent",
    });
    const detail = report.notificationState.items[0]?.detail;

    expect(detail?.sourceRefs.length).toBeGreaterThan(0);
    expect(detail?.sourceProfileIds.length).toBeGreaterThan(0);
    expect(detail?.authorityTiers.length).toBeGreaterThan(0);
    expect(detail?.contentHashes.length + (detail?.proofHashes.length ?? 0)).toBeGreaterThan(0);
    expect(detail).toMatchObject({
      rawPromptShown: false,
      transcriptShown: false,
      rawToolLogShown: false,
      privateContentShown: false,
    });
    expect(JSON.stringify(report).toLowerCase()).not.toContain("raw-prompt-marker");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("private-phrase-marker");
  });

  it("supports dismiss, snooze, rollback, and forbidden-behavior blocking", async () => {
    const dismissed = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "dismissed",
    });
    const snoozed = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "snoozed",
    });
    const rollback = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "sent",
      env: { MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED: "1" },
    });
    const autonomous = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "sent",
      forceAutonomousSending: true,
    });
    const action = await buildPhase2ProactivityNotificationReport({
      queueItemStatus: "sent",
      forceActionExecution: true,
    });

    expect(dismissed.notificationState.items[0]?.status).toBe("dismissed");
    expect(snoozed.notificationState.items[0]?.status).toBe("snoozed");
    expect(rollback.decision).toBe("rollback_disabled");
    expect(rollback.notificationState.items[0]?.status).toBe("rollback_disabled");
    expect(autonomous.decision).toBe("blocked");
    expect(action.decision).toBe("blocked");
    expect(autonomous.telemetry.autonomousSendingEnabled).toBe(false);
    expect(action.telemetry.actionExecutionObserved).toBe(false);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-notification-"));
    try {
      const report = await buildPhase2ProactivityNotificationReport({ queueItemStatus: "sent" });
      const artifact = await writePhase2ProactivityNotificationArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("User-Facing Proactivity Notification UX");
      expect(json.toLowerCase()).not.toContain("raw-transcript-marker");
      expect(json.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
