import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2PlannerDefaultPromotionReport,
  type Phase2PlannerDefaultPromotionReport,
} from "./phase2-planner-default-promotion.ts";
import {
  assertPhase2ProactivityBoundaryObserved,
  buildPhase2ProactivityBoundaryReport,
  writePhase2ProactivityBoundaryArtifact,
} from "./phase2-proactivity-action-boundary.ts";

const TEMP_ROOT = ".artifacts/test-phase2-proactivity-boundary";
const now = new Date("2026-04-26T02:00:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

async function defaultPromotionReport(): Promise<Phase2PlannerDefaultPromotionReport> {
  return buildPhase2PlannerDefaultPromotionReport({
    now,
    proofMarker: "PHASE2-PROACTIVITY-BOUNDARY-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
  });
}

describe("phase2 proactivity action boundary", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("classifies outputs without executing actions or sending proactive messages", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
    });

    expect(report.decision).toBe("boundary_observed");
    expect(report.telemetry.classificationCounts.report_only).toBe(1);
    expect(report.telemetry.classificationCounts.suggestion_only).toBe(1);
    expect(report.telemetry.classificationCounts.approval_required_action).toBe(1);
    expect(report.telemetry.classificationCounts.blocked_action).toBe(1);
    expect(report.telemetry.proactiveUserMessagesSent).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    expect(report.outputs.every((output) => !output.executed)).toBe(true);
    assertPhase2ProactivityBoundaryObserved(report);
  });

  it("requires default-visible planner reports before classifying suggestions", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.outputs).toEqual([]);
    expect(
      report.checks.find((check) => check.checkId === "planner_default:operator_reports_approved")
        ?.status,
    ).toBe("fail");
  });

  it("keeps approval-required actions staged and non-executed", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
    });
    const proposal = report.outputs.find(
      (output) => output.classification === "approval_required_action",
    );

    expect(proposal?.approvalRequirement.required).toBe(true);
    expect(proposal?.approvalRequirement.executionAllowedInThisSlice).toBe(false);
    expect(proposal?.staged).toBe(true);
    expect(proposal?.executed).toBe(false);
    expect(proposal?.userFacingProactiveMessage).toBe(false);
  });

  it("blocks missing provenance outputs instead of staging them", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
    });

    expect(report.blockedActions).toHaveLength(1);
    expect(report.blockedActions[0]?.classification).toBe("blocked_action");
    expect(report.blockedActions[0]?.staged).toBe(false);
    expect(report.blockedActions[0]?.reasonCodes).toContain("blocked_missing_provenance");
  });

  it("treats project docs and external text as evidence, never instructions", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
    });

    expect(report.policy.externalTextHandling).toBe("evidence_not_instruction");
    expect(
      report.outputs.every(
        (output) =>
          output.evidenceOnly &&
          output.externalImperativeTextHandling === "evidence_not_instruction",
      ),
    ).toBe(true);
  });

  it("rollback disables suggestions and approval-required proposals", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
      env: { MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED: "true" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.outputs).toEqual([]);
    expect(report.rollbackPlan.disablesSuggestionsAndProposals).toBe(true);
  });

  it("writes bounded report artifacts without prohibited content", async () => {
    const report = await buildPhase2ProactivityBoundaryReport({
      now,
      plannerDefaultPromotionReport: await defaultPromotionReport(),
    });
    const artifact = await writePhase2ProactivityBoundaryArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
