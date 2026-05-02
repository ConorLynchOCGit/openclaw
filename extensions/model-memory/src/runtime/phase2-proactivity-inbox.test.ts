import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import { buildPhase2FollowUpAutoSendPreflightReport } from "./phase2-follow-up-autosend-preflight.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import {
  assertPhase2ProactivityInboxVisible,
  buildPhase2ProactivityInboxReport,
  writePhase2ProactivityInboxArtifact,
} from "./phase2-proactivity-inbox.ts";
import { buildPhase2ProductProactivitySurfacingReport } from "./phase2-product-proactivity-presentation.ts";

function modelBriefJsonOutput() {
  return JSON.stringify({
    schemaVersion: "model_authored_proactivity_brief_output.v1",
    decision: "surface",
    kindCode: "follow_up",
    titleWords: ["Inbox", "validation", "follow-up"],
    oneLinePurposeWords: [
      "Verifies",
      "the",
      "live",
      "proactivity",
      "inbox",
      "still",
      "has",
      "a",
      "reviewable",
      "item",
    ],
    recommendedNextStepWords: [
      "Review",
      "the",
      "inbox",
      "item",
      "and",
      "confirm",
      "its",
      "diagnostics",
    ],
    primaryActionLabelWords: ["Plan", "this"],
    statusLabelWords: null,
    detailSummaryWords: ["Bounded", "inbox", "evidence", "is", "available"],
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
        sourceId: "inbox-live-source-1",
        sourceType: "session_runtime_event",
        signalKind: "active_work_state",
        projectId: "openclaw",
        sessionKey: "main",
        boundedSummary:
          "OpenClaw proactivity inbox validation has a concrete live work item to review.",
        sourceRefs: ["gateway://model-memory/proactivity/live-event/inbox-live-source-1"],
        sourceProfileId: "manual_note",
        authorityTier: "tool_grounded",
        freshness: "recent",
        conflictState: "clear",
        noDarkDataStatus: "pass",
      },
    ],
    modelReviewedOpportunities: [
      {
        sourceId: "inbox-live-source-1",
        workItemKind: "planning_request",
        title: "Inbox validation follow-up",
        whyNow: "A model-reviewed candidate identified a concrete inbox validation item.",
        proposedNextStep: "Review the inbox item and confirm its diagnostics.",
        expectedUserValue: "Keeps inbox validation tied to reviewed proactivity evidence.",
        evidenceSummary:
          "OpenClaw proactivity inbox validation has a concrete live work item to review.",
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

describe("phase2 proactivity inbox", () => {
  it("keeps one canonical inbox row per queue item and separates diagnostics", async () => {
    const now = new Date("2026-04-27T03:00:00.000Z");
    const productSurfacingReport = await buildLiveProductSurfacingReport(now);
    const report = await buildPhase2ProactivityInboxReport({
      now,
      productSurfacingReport,
    });

    expect(report.decision).toBe("inbox_visible");
    expect(report.digest.counts.pending).toBeGreaterThan(0);
    expect(report.digest.counts.planned).toBe(0);
    expect(report.digest.counts.sent).toBe(0);
    expect(report.digest.counts.snoozed).toBe(0);
    expect(report.digest.counts.dismissed).toBe(0);
    expect(report.digest.counts.blocked).toBeGreaterThan(0);
    expect(report.digest.counts.autosend_trial).toBeGreaterThan(0);
    expect(report.digest.items.filter((item) => item.layer === "actionable")).toHaveLength(1);
    expect(report.digest.items.filter((item) => item.status === "sent")).toHaveLength(0);
    assertPhase2ProactivityInboxVisible(report);
  });

  it("preserves bounded provenance and excludes raw/private content", async () => {
    const report = await buildPhase2ProactivityInboxReport({
      now: new Date("2026-04-27T03:00:00.000Z"),
    });
    const serialized = JSON.stringify(report).toLowerCase();

    expect(report.telemetry.sourceRefs.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.telemetry.contentHashes.length).toBeGreaterThan(0);
    expect(report.telemetry.proofHashes.length).toBeGreaterThan(0);
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("raw-transcript-marker");
    expect(serialized).not.toContain("secret-marker");
    expect(serialized).not.toContain("private-phrase-marker");
  });

  it.each([
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["raw/private content", { forceRawPrivateContent: true }, "no_dark_data_required"],
    ["action execution", { forceActionExecution: true }, "action_execution_disabled"],
  ] as const)("blocks %s", async (_name, overrides, reasonCode) => {
    const report = await buildPhase2ProactivityInboxReport({
      now: new Date("2026-04-27T03:00:00.000Z"),
      ...overrides,
    });

    expect(report.decision).toBe("blocked");
    expect(report.checks.find((check) => check.reasonCode === reasonCode)?.status).toBe("fail");
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("is rollback-disabled without mutating underlying queue behavior", async () => {
    const report = await buildPhase2ProactivityInboxReport({
      now: new Date("2026-04-27T03:00:00.000Z"),
      env: { MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.state.rollbackDisabled).toBe(true);
    expect(report.rollbackPlan.preservesUnderlyingQueue).toBe(true);
    expect(report.digest.items).toHaveLength(0);
  });

  it("inbox state references source artifacts and matches generated report groups", async () => {
    const followUpPreflightReport = await buildPhase2FollowUpAutoSendPreflightReport({
      now: new Date("2026-04-27T03:00:00.000Z"),
      evaluateFutureCandidate: true,
      forceRepeatedFollowUp: true,
    });
    const report = await buildPhase2ProactivityInboxReport({
      now: new Date("2026-04-27T03:00:00.000Z"),
      followUpPreflightReport,
    });

    expect(report.state.sourceReportIds).toContain(followUpPreflightReport.reportId);
    expect(
      report.digest.items.some((item) => item.sourceArtifactReportId === report.reportId),
    ).toBe(false);
    expect(report.digest.items.some((item) => item.filterTags.includes("blocked"))).toBe(true);
  });

  it("writer emits bounded JSON and Markdown only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-inbox-"));
    try {
      const report = await buildPhase2ProactivityInboxReport({
        now: new Date("2026-04-27T03:00:00.000Z"),
      });
      const artifact = await writePhase2ProactivityInboxArtifact({ report, artifactDir: dir });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Phase 2 Proactivity Inbox");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
