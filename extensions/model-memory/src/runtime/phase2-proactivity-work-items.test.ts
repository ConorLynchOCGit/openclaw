import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2ProactivityWorkItemsEnabled,
  buildPhase2ProactivityWorkItemReport,
  type Phase2ProactivityWorkItemInput,
  writePhase2ProactivityWorkItemArtifact,
} from "./phase2-proactivity-work-items.ts";

function modelReviewedPlanningCandidate(
  overrides: Partial<NonNullable<Phase2ProactivityWorkItemInput["candidates"]>[number]> = {},
): NonNullable<Phase2ProactivityWorkItemInput["candidates"]>[number] {
  return {
    candidateId: "model-reviewed-planning-candidate",
    queueItemId: "model-reviewed-planning-queue-item",
    kind: "planning_request",
    title: "Model-reviewed planning handoff",
    whyNow: "A model-reviewed candidate identified a bounded planning handoff.",
    proposedNextStep: "Review the bounded plan request before any file edits or execution.",
    expectedUserValue: "Keeps planning work explicit while preserving approval boundaries.",
    evidenceSummary: "Evidence comes from model-reviewed candidate packet refs.",
    confidence: "high",
    sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["curated_authoritative"],
    contentHashes: ["model-reviewed-planning-content-hash"],
    proofHashes: ["model-reviewed-planning-proof-hash"],
    noDarkDataStatus: "pass",
    freshnessLabels: [],
    conflictLabels: [],
    blockedReasonCodes: [],
    ...overrides,
  };
}

describe("phase2 proactivity work items", () => {
  it("creates planning work items with bounded chat handoff and no autonomous behavior", async () => {
    const report = await buildPhase2ProactivityWorkItemReport({
      now: new Date("2026-04-27T12:00:00.000Z"),
      candidates: [modelReviewedPlanningCandidate()],
    });

    assertPhase2ProactivityWorkItemsEnabled(report);
    expect(report.workItems[0]).toMatchObject({
      kind: "planning_request",
      status: "not_started",
      primaryAction: {
        actionType: "plan_this",
        requiresChatInject: false,
        executesAction: false,
      },
      handoff: {
        actionType: "plan_this",
        externalActionExecution: false,
        autonomousSending: false,
      },
    });
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("rejects message send action for non-message candidates", async () => {
    const report = await buildPhase2ProactivityWorkItemReport({
      candidates: [modelReviewedPlanningCandidate()],
      forceSendMessageOnNonMessage: true,
    });

    expect(report.decision).toBe("blocked");
    expect(
      report.checks.find((check) => check.reasonCode === "send_message_only_for_message_candidate")
        ?.status,
    ).toBe("fail");
    expect(report.workItems[0]?.blockedReasonCodes).toContain(
      "send_message_only_for_message_candidate",
    );
  });

  it("keeps diagnostics from becoming primary actionable items", async () => {
    const report = await buildPhase2ProactivityWorkItemReport({
      candidates: [
        {
          candidateId: "diagnostic-candidate",
          kind: "diagnostic",
          title: "Diagnostic only",
          whyNow: "This is why-not-shown evidence.",
          proposedNextStep: "Review diagnostics only.",
          expectedUserValue: "Keeps debug evidence out of the primary work queue.",
          evidenceSummary: "Context mismatch diagnostic.",
          sourceRefs: ["docs/projects/model-memory/DECISIONS.md"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["curated_authoritative"],
          contentHashes: ["diagnostic-content-hash"],
          proofHashes: ["diagnostic-proof-hash"],
        },
      ],
      forceDiagnosticPrimaryAction: true,
    });

    expect(report.decision).toBe("blocked");
    expect(
      report.checks.find((check) => check.reasonCode === "diagnostics_not_primary_actionable")
        ?.status,
    ).toBe("fail");
    expect(report.workItems[0]?.primaryAction).toBeNull();
  });

  it("blocks missing provenance and no-dark-data failures", async () => {
    const missingProvenance = await buildPhase2ProactivityWorkItemReport({
      candidates: [modelReviewedPlanningCandidate()],
      forceMissingProvenance: true,
    });
    const noDarkData = await buildPhase2ProactivityWorkItemReport({
      candidates: [modelReviewedPlanningCandidate()],
      forceNoDarkDataFail: true,
    });

    expect(missingProvenance.decision).toBe("blocked");
    expect(missingProvenance.workItems[0]?.blockedReasonCodes).toContain("missing_provenance");
    expect(noDarkData.decision).toBe("blocked");
    expect(noDarkData.workItems[0]?.blockedReasonCodes).toContain("no_dark_data_failed");
  });

  it("writers emit bounded JSON and Markdown only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-work-items-"));
    try {
      const report = await buildPhase2ProactivityWorkItemReport({
        candidates: [modelReviewedPlanningCandidate()],
      });
      const artifact = await writePhase2ProactivityWorkItemArtifact({ report, artifactDir: dir });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Phase 2 Proactivity Work Items");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("does not create bundled deterministic candidates when no model-reviewed candidate exists", async () => {
    const report = await buildPhase2ProactivityWorkItemReport({
      now: new Date("2026-04-27T12:00:00.000Z"),
    });

    expect(report.decision).toBe("blocked");
    expect(report.workItems).toEqual([]);
    expect(report.telemetry.workItemCount).toBe(0);
    expect(report.checks.find((check) => check.reasonCode === "provenance_required")?.status).toBe(
      "fail",
    );
  });
});
