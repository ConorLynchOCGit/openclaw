import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDerivedArtifactValue } from "../derived-artifact.ts";
import type { Phase2PlannerReadableArtifact } from "./phase2-planner-readiness.ts";
import {
  assertPhase2PlannerReadinessReportOnly,
  buildPhase2PlannerReadinessReport,
  writePhase2PlannerReadinessArtifact,
} from "./phase2-planner-readiness.ts";

const TEMP_ROOT = ".artifacts/test-phase2-planner-readiness";
const now = new Date("2026-04-26T00:00:00.000Z");

function plannerArtifact(
  overrides: Partial<Phase2PlannerReadableArtifact> = {},
): Phase2PlannerReadableArtifact {
  const kind = overrides.kind ?? "project_doc";
  const artifactId = overrides.artifactId ?? `phase2-planner-${kind}`;
  return {
    artifactId,
    kind,
    title: overrides.title ?? `Planner readable ${kind}`,
    sourceRefs: overrides.sourceRefs ?? [
      {
        sourceId: `${artifactId}-source`,
        segmentId: `${artifactId}-segment`,
        contentHash: hashDerivedArtifactValue({ artifactId }),
      },
    ],
    sourceProfileId: overrides.sourceProfileId ?? "curated_repo_doc",
    authorityTier: overrides.authorityTier ?? "curated_authoritative",
    contentHash: overrides.contentHash ?? hashDerivedArtifactValue({ artifactId, kind }),
    proofHash: overrides.proofHash,
    freshnessStatus: overrides.freshnessStatus ?? "fresh",
    conflictMarkers: overrides.conflictMarkers ?? [],
    inspectionOnly: overrides.inspectionOnly ?? false,
    noDarkDataStatus: overrides.noDarkDataStatus ?? "pass",
    estimatedTokens: overrides.estimatedTokens ?? 320,
    maxTokens: overrides.maxTokens ?? 2_000,
    semanticTruth: false,
    externalImperativeTextHandling: "evidence_not_instruction",
    derivedFrom: overrides.derivedFrom,
  };
}

describe("phase2 planner readiness", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("accepts durable memories and project docs with provenance as report-only candidates", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({
          kind: "durable_memory",
          sourceProfileId: "explicit_user_turn",
          authorityTier: "user_authoritative",
        }),
        plannerArtifact({
          kind: "project_doc",
          sourceProfileId: "curated_repo_doc",
          authorityTier: "curated_authoritative",
        }),
      ],
    });

    assertPhase2PlannerReadinessReportOnly(report);
    expect(report.status).toBe("ready_report_only");
    expect(report.candidates).toHaveLength(2);
    expect(report.candidates.every((candidate) => candidate.reportOnly)).toBe(true);
    expect(report.telemetry.proactiveSurfacingEnabled).toBe(false);
    expect(report.telemetry.plannerActionsExecuted).toBe(false);
  });

  it("treats graph, capsule, retrieval, and hierarchical reports as evidence only", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ kind: "runtime_graph_summary" }),
        plannerArtifact({ kind: "project_state_capsule" }),
        plannerArtifact({ kind: "retrieval_pack" }),
        plannerArtifact({ kind: "hierarchical_plan" }),
      ],
    });

    expect(report.readableArtifacts.every((artifact) => !artifact.semanticTruth)).toBe(true);
    expect(report.candidates.map((candidate) => candidate.decision)).toEqual([
      "evidence_only",
      "evidence_only",
      "evidence_only",
      "evidence_only",
    ]);
  });

  it("blocks missing provenance and inspection-only material", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ artifactId: "missing-provenance", sourceRefs: [] }),
        plannerArtifact({
          artifactId: "inspection-only",
          sourceProfileId: "raw_prompt",
          authorityTier: "inspection_only",
          inspectionOnly: true,
        }),
      ],
    });

    expect(report.status).toBe("partial");
    expect(report.telemetry.blockedArtifactIds).toEqual(["inspection-only", "missing-provenance"]);
    expect(report.checks.map((check) => check.reasonCode)).toContain("blocked_missing_provenance");
    expect(report.checks.map((check) => check.reasonCode)).toContain("blocked_inspection_only");
  });

  it("keeps project docs and external imperative text as evidence, never instructions", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ kind: "project_doc" }),
        plannerArtifact({ kind: "curated_doc" }),
      ],
    });

    expect(
      report.readableArtifacts.every(
        (artifact) => artifact.externalImperativeTextHandling === "evidence_not_instruction",
      ),
    ).toBe(true);
    expect(report.checks).toContainEqual({
      checkId: "planner:project_docs_are_evidence",
      status: "pass",
      reasonCode: "external_imperative_text_is_evidence",
    });
  });

  it("keeps lower-authority sources lower authority and report-only", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({
          kind: "researcher_report_artifact",
          sourceProfileId: "researcher_report_artifact",
          authorityTier: "cited_soft",
        }),
      ],
    });

    expect(report.telemetry.authorityTiers).toEqual(["cited_soft"]);
    expect(report.candidates[0]?.decision).toBe("report_only");
    expect(report.candidates[0]?.reasonCodes).toContain("lower_authority_report_only");
  });

  it("blocks stale, conflicted, no-dark-data, and budget-unsafe inputs", async () => {
    const report = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ artifactId: "stale", freshnessStatus: "stale" }),
        plannerArtifact({ artifactId: "conflict", conflictMarkers: ["conflict-a"] }),
        plannerArtifact({ artifactId: "no-dark-data-fail", noDarkDataStatus: "fail" }),
        plannerArtifact({ artifactId: "budget", estimatedTokens: 3_000 }),
      ],
    });

    expect(report.status).toBe("blocked");
    expect(report.telemetry.blockedArtifactIds).toEqual([
      "budget",
      "conflict",
      "no-dark-data-fail",
      "stale",
    ]);
    expect(report.noDarkDataStatus).toBe("fail");
    expect(report.telemetry.reasonCodes).toContain("blocked_budget");
    expect(report.telemetry.reasonCodes).toContain("blocked_conflict");
    expect(report.telemetry.reasonCodes).toContain("blocked_no_dark_data");
    expect(report.telemetry.reasonCodes).toContain("blocked_stale");
  });

  it("writes bounded report artifacts without prohibited raw content", async () => {
    const report = await buildPhase2PlannerReadinessReport({ now });
    const written = await writePhase2PlannerReadinessArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });
    const json = await fs.readFile(written.jsonPath, "utf8");
    const markdown = await fs.readFile(path.join(TEMP_ROOT, "report.md"), "utf8");

    expect(written.byteLength).toBeLessThan(512 * 1024);
    expect(json).toContain(report.reportId);
    expect(markdown).toContain("Phase 2 Planner Readiness Proof");
    expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
    expect(markdown.toLowerCase()).not.toContain("private-phrase-marker");
  });
});
