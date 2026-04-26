import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDerivedArtifactValue } from "../derived-artifact.ts";
import {
  assertPhase2PlannerControlledScopeObserved,
  buildPhase2PlannerControlledScopeReport,
  writePhase2PlannerControlledScopeArtifact,
} from "./phase2-planner-controlled-scope.ts";
import type { Phase2PlannerReadableArtifact } from "./phase2-planner-readiness.ts";
import { buildPhase2PlannerReadinessReport } from "./phase2-planner-readiness.ts";

const TEMP_ROOT = ".artifacts/test-phase2-planner-controlled-scope";
const now = new Date("2026-04-26T00:00:00.000Z");
const approvedScope: {
  sessionKey: string;
  operatorId: string;
  projectId: string;
} = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope(overrides: Partial<typeof approvedScope> = {}) {
  return {
    ...approvedScope,
    ...overrides,
    purpose: "operator_eval" as const,
  };
}

function plannerArtifact(
  overrides: Partial<Phase2PlannerReadableArtifact> = {},
): Phase2PlannerReadableArtifact {
  const kind = overrides.kind ?? "project_doc";
  const artifactId = overrides.artifactId ?? `phase2-controlled-${kind}`;
  return {
    artifactId,
    kind,
    title: overrides.title ?? `Controlled planner readable ${kind}`,
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

describe("phase2 planner controlled scope", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("requires explicit operator/eval scope and emits no plans outside scope", async () => {
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      approvedScope,
      requestScope: requestScope({ sessionKey: "other" }),
    });

    expect(report.decision).toBe("outside_scope_report_only");
    expect(report.candidatePlans).toEqual([]);
    expect(report.telemetry.blockedCandidateIds.length).toBeGreaterThan(0);
    expect(report.telemetry.proactiveSurfacingEnabled).toBe(false);
    expect(report.telemetry.plannerActionsExecuted).toBe(false);
  });

  it("generates bounded candidate plans inside approved scope", async () => {
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      approvedScope,
      requestScope: requestScope(),
    });

    assertPhase2PlannerControlledScopeObserved(report);
    expect(report.decision).toBe("controlled_scope_observed");
    expect(report.candidatePlans.length).toBeGreaterThan(0);
    expect(report.candidatePlans.length).toBeLessThanOrEqual(report.policy.maxCandidateCount);
    expect(report.candidatePlans.every((plan) => plan.reportOnly)).toBe(true);
    expect(report.candidatePlans.every((plan) => plan.actionExecution === "none")).toBe(true);
  });

  it("preserves provenance/source refs/authority/source profile metadata", async () => {
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      approvedScope,
      requestScope: requestScope(),
    });
    const firstPlan = report.candidatePlans[0];

    expect(firstPlan?.evidenceBindings[0]).toMatchObject({
      semanticTruth: false,
      externalImperativeTextHandling: "evidence_not_instruction",
    });
    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.telemetry.contentHashes.length).toBeGreaterThan(0);
  });

  it("treats project docs and derived reports as evidence rather than instructions or truth", async () => {
    const readinessReport = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ kind: "project_doc" }),
        plannerArtifact({ kind: "runtime_graph_summary" }),
        plannerArtifact({ kind: "project_state_capsule" }),
        plannerArtifact({ kind: "retrieval_pack" }),
        plannerArtifact({ kind: "hierarchical_plan" }),
      ],
    });
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      readinessReport,
      approvedScope,
      requestScope: requestScope(),
    });

    expect(
      report.candidatePlans.every((plan) =>
        plan.evidenceBindings.every(
          (binding) =>
            !binding.semanticTruth &&
            binding.externalImperativeTextHandling === "evidence_not_instruction",
        ),
      ),
    ).toBe(true);
  });

  it("blocks missing provenance, inspection-only, stale, conflicted, no-dark-data, and budget failures", async () => {
    const readinessReport = await buildPhase2PlannerReadinessReport({
      now,
      artifacts: [
        plannerArtifact({ artifactId: "missing-provenance", sourceRefs: [] }),
        plannerArtifact({
          artifactId: "inspection-only",
          sourceProfileId: "raw_prompt",
          authorityTier: "inspection_only",
          inspectionOnly: true,
        }),
        plannerArtifact({ artifactId: "stale", freshnessStatus: "stale" }),
        plannerArtifact({ artifactId: "conflict", conflictMarkers: ["conflict-a"] }),
        plannerArtifact({ artifactId: "no-dark-data", noDarkDataStatus: "fail" }),
        plannerArtifact({ artifactId: "budget", estimatedTokens: 3_000 }),
      ],
    });
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      readinessReport,
      approvedScope,
      requestScope: requestScope(),
    });

    expect(report.decision).toBe("blocked");
    expect(report.candidatePlans).toEqual([]);
    expect(report.telemetry.blockedCandidateIds.length).toBeGreaterThan(0);
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("rollback disables controlled candidate generation", async () => {
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      approvedScope,
      requestScope: requestScope(),
      env: { MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.config.enabled).toBe(false);
    expect(report.candidatePlans).toEqual([]);
    expect(report.rollbackPlan.disablesCandidatePlans).toBe(true);
  });

  it("writes bounded artifacts without prohibited raw content", async () => {
    const report = await buildPhase2PlannerControlledScopeReport({
      now,
      approvedScope,
      requestScope: requestScope(),
    });
    const written = await writePhase2PlannerControlledScopeArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });
    const json = await fs.readFile(written.jsonPath, "utf8");
    const markdown = await fs.readFile(path.join(TEMP_ROOT, "report.md"), "utf8");

    expect(written.byteLength).toBeLessThan(512 * 1024);
    expect(json).toContain(report.reportId);
    expect(markdown).toContain("Phase 2 Planner Controlled Scope Proof");
    expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
    expect(markdown.toLowerCase()).not.toContain("private-phrase-marker");
  });
});
