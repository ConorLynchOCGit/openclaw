import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDerivedArtifactValue } from "../derived-artifact.ts";
import {
  buildPhase2PlannerControlledScopeReport,
  type Phase2PlannerControlledScopeReport,
} from "./phase2-planner-controlled-scope.ts";
import {
  assertPhase2PlannerDefaultPromotionObserved,
  buildPhase2PlannerDefaultPromotionReport,
  writePhase2PlannerDefaultPromotionArtifact,
} from "./phase2-planner-default-promotion.ts";
import type { Phase2PlannerReadableArtifact } from "./phase2-planner-readiness.ts";
import { buildPhase2PlannerReadinessReport } from "./phase2-planner-readiness.ts";

const TEMP_ROOT = ".artifacts/test-phase2-planner-default-promotion";
const now = new Date("2026-04-26T01:00:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

function plannerArtifact(
  overrides: Partial<Phase2PlannerReadableArtifact> = {},
): Phase2PlannerReadableArtifact {
  const kind = overrides.kind ?? "project_doc";
  const artifactId = overrides.artifactId ?? `phase2-default-promotion-${kind}`;
  return {
    artifactId,
    kind,
    title: overrides.title ?? `Default planner readable ${kind}`,
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

async function controlledReport(
  overrides: {
    requestScope?: ReturnType<typeof requestScope>;
    artifacts?: Phase2PlannerReadableArtifact[];
    env?: Record<string, string | undefined>;
  } = {},
): Promise<Phase2PlannerControlledScopeReport> {
  const readinessReport = await buildPhase2PlannerReadinessReport({
    now,
    proofMarker: "PHASE2-PLANNER-DEFAULT-TEST",
    artifacts: overrides.artifacts ?? [
      plannerArtifact({ kind: "project_doc" }),
      plannerArtifact({ kind: "runtime_graph_summary" }),
      plannerArtifact({ kind: "project_state_capsule" }),
      plannerArtifact({ kind: "hierarchical_plan" }),
    ],
  });
  return buildPhase2PlannerControlledScopeReport({
    now,
    approvedScope: scope,
    requestScope: overrides.requestScope ?? requestScope(),
    readinessReport,
    env: overrides.env,
  });
}

describe("phase2 planner default promotion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves only default-visible operator reports and no proactive behavior", async () => {
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      proofMarker: "PHASE2-PLANNER-DEFAULT-TEST",
      approvedScope: scope,
      requestScope: requestScope(),
    });

    expect(report.decision).toBe("approved_for_default_operator_reports");
    expect(report.config.defaultVisibleToOperators).toBe(true);
    expect(report.telemetry.proactiveSurfacingEnabled).toBe(false);
    expect(report.telemetry.plannerActionsExecuted).toBe(false);
    expect(report.defaultOperatorReports.length).toBeGreaterThan(0);
    expect(
      report.defaultOperatorReports.every(
        (operatorReport) =>
          operatorReport.defaultVisibleToOperators &&
          operatorReport.actionExecution === "none" &&
          !operatorReport.userFacingProactiveMessage,
      ),
    ).toBe(true);
    assertPhase2PlannerDefaultPromotionObserved(report);
  });

  it("blocks without a Slice 20 controlled planner proof", async () => {
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      controlledScopeReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.defaultOperatorReports).toEqual([]);
    expect(report.config.defaultVisibleToOperators).toBe(false);
    expect(
      report.checks.find((check) => check.checkId === "controlled_scope:proof_present")?.status,
    ).toBe("fail");
  });

  it("blocks if the controlled planner proof is outside scope", async () => {
    const outside = await controlledReport({
      requestScope: { ...scope, sessionKey: "outside", purpose: "operator_eval" },
    });
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      controlledScopeReport: outside,
    });

    expect(outside.decision).toBe("outside_scope_report_only");
    expect(report.decision).toBe("blocked");
    expect(report.defaultOperatorReports).toEqual([]);
  });

  it("blocks on no-dark-data failure", async () => {
    const failed = await controlledReport({
      artifacts: [plannerArtifact({ noDarkDataStatus: "fail" })],
    });
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      controlledScopeReport: failed,
    });

    expect(report.decision).toBe("blocked");
    expect(report.noDarkDataStatus).toBe("fail");
    expect(report.config.defaultVisibleToOperators).toBe(false);
  });

  it("preserves provenance and treats docs and derived artifacts as evidence only", async () => {
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      controlledScopeReport: await controlledReport(),
    });

    const operatorReport = report.defaultOperatorReports[0];
    expect(operatorReport?.sourceRefIds.length).toBeGreaterThan(0);
    expect(operatorReport?.sourceProfileIds).toContain("curated_repo_doc");
    expect(operatorReport?.authorityTiers).toContain("curated_authoritative");
    expect(operatorReport?.evidenceOnly).toBe(true);
    expect(report.controlledScopeReport?.candidatePlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceBindings: expect.arrayContaining([
            expect.objectContaining({
              semanticTruth: false,
              externalImperativeTextHandling: "evidence_not_instruction",
            }),
          ]),
        }),
      ]),
    );
  });

  it("rollback kill switch disables default-visible planner reports", async () => {
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      env: { MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED: "true" },
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.config.defaultVisibleToOperators).toBe(false);
    expect(report.defaultOperatorReports).toEqual([]);
  });

  it("writes bounded report artifacts without prohibited content", async () => {
    const report = await buildPhase2PlannerDefaultPromotionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
    });
    const artifact = await writePhase2PlannerDefaultPromotionArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
