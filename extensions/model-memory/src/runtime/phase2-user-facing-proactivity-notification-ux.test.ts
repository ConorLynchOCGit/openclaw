import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase2ProactivityNotificationReport,
  writePhase2ProactivityNotificationArtifact,
} from "./phase2-user-facing-proactivity-notification-ux.ts";

describe("phase2 user-facing proactivity notification ux", () => {
  it("renders notification only for approved/send-approved items", async () => {
    const pending = await buildPhase2ProactivityNotificationReport({
      now: new Date("2026-04-26T18:00:00.000Z"),
      queueItemStatus: "pending_review",
    });
    const sent = await buildPhase2ProactivityNotificationReport({
      now: new Date("2026-04-26T18:00:00.000Z"),
      queueItemStatus: "sent",
    });

    expect(pending.decision).toBe("blocked");
    expect(pending.telemetry.visibleCount).toBe(0);
    expect(pending.telemetry.beforeApprovalVisibleCount).toBe(0);
    expect(sent.decision).toBe("notification_ux_enabled");
    expect(sent.notificationState.items[0]).toMatchObject({
      status: "visible",
      boundedDisplayText: "A recent Model Memory task has a follow-up ready for review.",
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
