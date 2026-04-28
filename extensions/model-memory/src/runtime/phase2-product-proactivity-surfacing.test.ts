import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import {
  buildPhase2ProductProactivitySurfacingReport,
  writePhase2ProductProactivitySurfacingArtifact,
} from "./phase2-product-proactivity-surfacing.ts";

describe("phase2 product proactivity surfacing", () => {
  it("builds a product-visible queue item from live proactivity evidence", async () => {
    const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
      sources: [
        {
          sourceId: "ordinary-turn-live-event-1",
          sourceType: "ordinary_turn_capture",
          signalKind: "active_work_state",
          projectId: "openclaw",
          sessionKey: "main",
          boundedSummary:
            "The active OpenClaw session is ready to plan the Skills path after proactivity remediation.",
          sourceRefs: ["gateway://event/ordinary-turn-live-event-1"],
          sourceProfileId: "explicit_user_turn",
          authorityTier: "user_authoritative",
          freshness: "recent",
          conflictState: "clear",
          inspectionOnly: false,
          noDarkDataStatus: "pass",
        },
      ],
    });
    const report = await buildPhase2ProductProactivitySurfacingReport({
      now: new Date("2026-04-26T16:00:00.000Z"),
      liveDetectionReport,
      eligibilityScope: {
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-conor",
      },
    });

    expect(report.decision).toBe("product_queue_enabled");
    expect(report.queue.items).toHaveLength(1);
    expect(report.queue.items[0]).toMatchObject({
      status: "pending_review",
      boundedDisplayText: "Advance current openclaw work",
      planTitle: "Advance current openclaw work",
      userFacingBrief: {
        kindLabel: "Follow-up",
        quality: { status: "pass" },
      },
      proposedMessage: expect.stringContaining("Skills path after proactivity remediation"),
      workItemKind: "planning_request",
      primaryAction: {
        actionType: "plan_this",
        requiresChatInject: false,
        executesAction: false,
      },
      layer: "actionable",
      noDarkDataStatus: "pass",
    });
    expect(report.realCandidateReport?.decision).toBe("real_candidates_generated");
    expect(report.realCandidateReport?.telemetry.candidateCount).toBe(1);
    expect(report.queue.items[0].sourceRefs.length).toBeGreaterThan(0);
    expect(report.queue.items[0].sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.queue.items[0].authorityTiers.length).toBeGreaterThan(0);
    expect(report.approvalDecisions[0]).toMatchObject({
      decision: "approved_for_send",
      explicitOperatorAction: true,
    });
    expect(report.sendDecisions[0]).toMatchObject({
      decision: "blocked",
      explicitSendApproval: true,
      actionExecution: false,
      autonomousSending: false,
    });
  });

  it("demotes static/default fallback when no live signal exists", async () => {
    const report = await buildPhase2ProductProactivitySurfacingReport({
      now: new Date("2026-04-26T16:00:00.000Z"),
      eligibilityScope: {
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-conor",
      },
    });

    expect(report.decision).toBe("product_queue_enabled");
    expect(report.queue.items[0]).toMatchObject({
      layer: "diagnostic",
      attentionRequired: false,
      workItemKind: "diagnostic",
    });
    expect(report.queue.items[0].blockedReasonCodes).toContain("no_live_opportunities_detected");
    expect(report.queue.items[0].blockedReasonCodes).toContain("safe_specific_plan_required");
    expect(report.queue.items[0].planTitle).not.toBe("Plan the next openclaw step");
  });

  it("rejects proof fixture scope and rollback disables surfacing", async () => {
    const fixtureScope = await buildPhase2ProductProactivitySurfacingReport({
      forceProofFixtureScope: true,
    });
    const rollback = await buildPhase2ProductProactivitySurfacingReport({
      env: { MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED: "1" },
    });

    expect(fixtureScope.decision).toBe("blocked");
    expect(
      fixtureScope.checks.find((check) => check.reasonCode === "proof_fixture_scope_rejected")
        ?.status,
    ).toBe("fail");
    expect(rollback.decision).toBe("rollback_disabled");
    expect(rollback.queue.items[0].status).toBe("rollback_disabled");
  });

  it("blocks missing provenance, prohibited message classes, and no-dark-data failures", async () => {
    await expect(
      buildPhase2ProductProactivitySurfacingReport({ forceMissingProvenance: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProductProactivitySurfacingReport({
        messageClass: "external_instruction_message",
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProductProactivitySurfacingReport({ forceNoDarkDataFail: true }),
    ).resolves.toMatchObject({ decision: "blocked", noDarkDataStatus: "fail" });
  });

  it("keeps autonomous sending and action execution off", async () => {
    const autonomous = await buildPhase2ProductProactivitySurfacingReport({
      forceAutonomousSending: true,
    });
    const action = await buildPhase2ProductProactivitySurfacingReport({
      forceActionExecution: true,
    });

    expect(autonomous.decision).toBe("blocked");
    expect(action.decision).toBe("blocked");
    expect(autonomous.telemetry.autonomousSendingEnabled).toBe(false);
    expect(action.telemetry.actionExecutionObserved).toBe(false);
  });

  it("writes bounded JSON and Markdown without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-product-proactivity-"));
    try {
      const report = await buildPhase2ProductProactivitySurfacingReport();
      const artifact = await writePhase2ProductProactivitySurfacingArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Product Proactivity Surfacing");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
