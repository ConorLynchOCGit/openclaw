import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledProactivitySuggestionReport,
  type Phase2ControlledProactivitySuggestionReport,
} from "./phase2-controlled-proactivity-suggestions.ts";
import {
  buildPhase2PlannerDefaultPromotionReport,
  type Phase2PlannerDefaultPromotionReport,
} from "./phase2-planner-default-promotion.ts";
import {
  buildPhase2ProactivityBoundaryReport,
  type Phase2ProactivityBoundaryReport,
} from "./phase2-proactivity-action-boundary.ts";
import {
  assertPhase2StagedActionApprovalObserved,
  buildPhase2StagedActionApprovalReport,
  writePhase2StagedActionApprovalArtifact,
} from "./phase2-staged-action-approval-workflow.ts";

const TEMP_ROOT = ".artifacts/test-phase2-staged-action-approval";
const now = new Date("2026-04-26T04:30:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

async function defaultReport(): Promise<Phase2PlannerDefaultPromotionReport> {
  return buildPhase2PlannerDefaultPromotionReport({
    now,
    proofMarker: "PHASE2-STAGED-ACTION-APPROVAL-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
  });
}

async function boundaryReport(): Promise<Phase2ProactivityBoundaryReport> {
  return buildPhase2ProactivityBoundaryReport({
    now,
    plannerDefaultPromotionReport: await defaultReport(),
  });
}

async function controlledSuggestions(
  boundary: Phase2ProactivityBoundaryReport,
): Promise<Phase2ControlledProactivitySuggestionReport> {
  return buildPhase2ControlledProactivitySuggestionReport({
    now,
    boundaryReport: boundary,
    approvedScope: scope,
    requestScope: requestScope(),
  });
}

describe("phase2 staged action approval workflow", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("stages and approves approval-required proposals without executing them", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "approve",
      operatorId: scope.operatorId,
    });

    expect(report.decision).toBe("approval_workflow_observed");
    expect(report.telemetry.approvedProposalIds.length).toBe(1);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    expect(report.proposals.every((proposal) => !proposal.executed)).toBe(true);
    expect(report.auditTrail.some((entry) => entry.decision === "approve")).toBe(true);
    assertPhase2StagedActionApprovalObserved(report);
  });

  it("can reject staged proposals with deterministic reason codes", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "reject",
      operatorId: scope.operatorId,
    });

    expect(report.telemetry.rejectedProposalIds.length).toBe(1);
    expect(report.proposals.find((proposal) => proposal.rejected)?.reasonCodes).toContain(
      "operator_rejected",
    );
    expect(report.auditTrail.some((entry) => entry.decision === "reject")).toBe(true);
  });

  it("does not stage blocked actions", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "approve",
      operatorId: scope.operatorId,
    });
    const blocked = report.proposals.find((proposal) => proposal.status === "blocked");

    expect(blocked?.staged).toBe(false);
    expect(blocked?.approved).toBe(false);
    expect(blocked?.reasonCodes).toContain("blocked_action_not_staged");
    expect(report.telemetry.blockedProposalIds.length).toBe(1);
  });

  it("requires controlled suggestions and boundary proof", async () => {
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      controlledSuggestionReport: null,
      boundaryReport: null,
      operatorDecision: "approve",
      operatorId: scope.operatorId,
    });

    expect(report.decision).toBe("blocked");
    expect(report.proposals).toEqual([]);
    expect(
      report.checks.find((check) => check.checkId === "controlled_suggestions:observed")?.status,
    ).toBe("fail");
  });

  it("treats docs/tools/reports as evidence and never instructions", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "approve",
      operatorId: scope.operatorId,
    });

    expect(report.policy.externalTextHandling).toBe("evidence_not_instruction");
    expect(
      report.proposals.every(
        (proposal) => proposal.externalImperativeTextHandling === "evidence_not_instruction",
      ),
    ).toBe(true);
  });

  it("rollback disables staging and approval", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "approve",
      operatorId: scope.operatorId,
      env: { MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.proposals).toEqual([]);
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.rollbackPlan.disablesProposalStagingAndApproval).toBe(true);
  });

  it("writes bounded approval report artifacts without prohibited content", async () => {
    const boundary = await boundaryReport();
    const report = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "approve",
      operatorId: scope.operatorId,
    });
    const artifact = await writePhase2StagedActionApprovalArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
