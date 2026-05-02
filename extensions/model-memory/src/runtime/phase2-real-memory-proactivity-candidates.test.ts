import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import {
  buildPhase2RealMemoryProactivityCandidateReport,
  writePhase2RealMemoryProactivityCandidateArtifact,
  type Phase2RealMemorySignal,
} from "./phase2-real-memory-proactivity-candidates.ts";

function signal(kind: Phase2RealMemorySignal["kind"]): Phase2RealMemorySignal {
  return {
    signalId: `signal-${kind}`,
    kind,
    boundedSummary: `${kind} bounded summary`,
    sourceRefs: [`source://${kind}`],
    sourceProfileId: kind === "recent_task" ? "explicit_user_turn" : "curated_repo_doc",
    authorityTier: kind === "recent_task" ? "user_authoritative" : "curated_authoritative",
    contentHash: `content-${kind}`,
    proofHash: `proof-${kind}`,
    freshness: kind === "stale_decision" ? "stale" : "recent",
    conflictState: "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
  };
}

describe("phase2 real memory proactivity candidates", () => {
  it("generates primary candidates from live opportunities", async () => {
    const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
      sources: [
        {
          sourceId: "live-session-event-1",
          sourceType: "session_runtime_event",
          signalKind: "recent_failure",
          projectId: "openclaw",
          sessionKey: "main",
          boundedSummary:
            "The live session observed repeated gateway rebuild confusion that needs investigation.",
          sourceRefs: ["gateway://event/live-session-event-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          freshness: "recent",
          conflictState: "clear",
          inspectionOnly: false,
          noDarkDataStatus: "pass",
        },
      ],
      modelReviewedOpportunities: [
        {
          sourceId: "live-session-event-1",
          workItemKind: "investigation_request",
          title: "Investigate gateway rebuild confusion",
          whyNow:
            "A model-reviewed candidate identified repeated gateway rebuild confusion as worth investigation.",
          proposedNextStep:
            "Review the gateway rebuild confusion evidence before changing the runtime.",
          expectedUserValue: "Clarifies the next safe investigation target.",
          evidenceSummary:
            "The live session observed repeated gateway rebuild confusion that needs investigation.",
          confidence: "high",
        },
      ],
    });
    const report = await buildPhase2RealMemoryProactivityCandidateReport({
      liveDetectionReport,
      primarySourceMode: "live_only",
    });

    expect(report.decision).toBe("real_candidates_generated");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      sourceMode: "live_signal",
      liveSignalKind: "recent_failure",
      workItemKind: "investigation_request",
      title: "Investigate gateway rebuild confusion",
      proposedNextStep: expect.stringContaining("gateway rebuild confusion evidence"),
    });
  });

  it("does not promote static fallback in live-only mode", async () => {
    const report = await buildPhase2RealMemoryProactivityCandidateReport({
      primarySourceMode: "live_only",
    });

    expect(report.decision).toBe("real_candidates_generated");
    expect(report.candidates).toHaveLength(0);
    expect(report.telemetry.candidateCount).toBe(0);
  });

  it("generates candidates from all required real-memory signal kinds", async () => {
    const report = await buildPhase2RealMemoryProactivityCandidateReport({
      now: new Date("2026-04-26T17:00:00.000Z"),
      maxCandidates: 7,
      signals: [
        signal("recent_task"),
        signal("unresolved_follow_up"),
        signal("stale_decision"),
        signal("maintenance_candidate"),
        signal("docs_change"),
        signal("project_state_capsule"),
        signal("retrieval_or_graph_observation"),
      ],
    });

    expect(report.decision).toBe("real_candidates_generated");
    expect(report.telemetry.signalKinds).toEqual([
      "docs_change",
      "maintenance_candidate",
      "project_state_capsule",
      "recent_task",
      "retrieval_or_graph_observation",
      "stale_decision",
      "unresolved_follow_up",
    ]);
    expect(report.candidates).toHaveLength(7);
    expect(report.candidates[0].sourceRefs).toEqual(["source://recent_task"]);
    expect(report.candidates[0].authorityTiers).toEqual(["user_authoritative"]);
    expect(report.telemetry.semanticSimilarityTruthAllowed).toBe(false);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
  });

  it("blocks missing provenance, inspection-only, and no-dark-data failures", async () => {
    await expect(
      buildPhase2RealMemoryProactivityCandidateReport({
        signals: [signal("recent_task")],
        forceMissingProvenance: true,
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2RealMemoryProactivityCandidateReport({
        signals: [signal("recent_task")],
        forceInspectionOnly: true,
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2RealMemoryProactivityCandidateReport({
        signals: [signal("recent_task")],
        forceNoDarkDataFail: true,
      }),
    ).resolves.toMatchObject({ decision: "blocked", noDarkDataStatus: "fail" });
  });

  it("labels stale evidence and deterministically suppresses repeated candidates", async () => {
    const first = await buildPhase2RealMemoryProactivityCandidateReport({
      signals: [signal("stale_decision")],
    });
    const repeated = await buildPhase2RealMemoryProactivityCandidateReport({
      signals: [signal("stale_decision")],
      dedupeState: {
        suppressedCandidateIds: [first.candidates[0].candidateId],
        suppressedContentHashes: [],
      },
    });

    expect(first.candidates[0].staleLabels).toEqual(["stale_evidence_labeled"]);
    expect(repeated.telemetry.suppressedCount).toBe(1);
    expect(repeated.candidates).toHaveLength(0);
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-real-memory-candidates-"));
    try {
      const report = await buildPhase2RealMemoryProactivityCandidateReport({
        signals: [signal("recent_task")],
      });
      const artifact = await writePhase2RealMemoryProactivityCandidateArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Real Memory Proactivity Candidates");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
