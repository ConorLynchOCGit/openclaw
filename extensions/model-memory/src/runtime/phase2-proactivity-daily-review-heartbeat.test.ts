import { describe, expect, it } from "vitest";
import {
  assertPhase2ProactivityDailyReviewHeartbeatReport,
  buildPhase2ProactivityDailyReviewHeartbeatReport,
  writePhase2ProactivityDailyReviewHeartbeatArtifact,
} from "./phase2-proactivity-daily-review-heartbeat.ts";

describe("phase2 proactivity daily review heartbeat", () => {
  it("includes must-surface items and grouped lower-priority counts", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport();
    assertPhase2ProactivityDailyReviewHeartbeatReport(report);
    expect(report.reviewItems.length).toBeGreaterThan(0);
    expect(report.heartbeatSummary.mustSurfaceCount).toBe(report.reviewItems.length);
    expect(report.groups.some((group) => group.lane === "lower_priority_grouped")).toBe(true);
  });

  it("preserves candidate ids and direct inbox detail/send path", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport();
    expect(report.telemetry.candidateIds).toContain(report.reviewItems[0]?.candidateId);
    expect(report.reviewItems[0]?.directPath).toBe("proactivity_inbox_detail_send");
    expect(report.rankings[0]?.rank).toBe(1);
  });

  it("blocks unsafe review output and supports rollback", async () => {
    const missing = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      forceMissingProvenance: true,
    });
    expect(missing.decision).toBe("blocked");

    const rollback = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      env: { MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED: "1" },
    });
    expect(rollback.decision).toBe("rollback_disabled");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport();
    const artifact = await writePhase2ProactivityDailyReviewHeartbeatArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-proactivity-daily-review-heartbeat-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
