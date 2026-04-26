import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ControlledActionExecutionObserved,
  buildPhase2ControlledActionExecutionReport,
  writePhase2ControlledActionExecutionArtifact,
  type Phase2ControlledActionExecutionReport,
} from "./phase2-controlled-action-execution.ts";
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
  buildPhase2StagedActionApprovalReport,
  type Phase2StagedActionApprovalReport,
} from "./phase2-staged-action-approval-workflow.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-action-execution";
const now = new Date("2026-04-26T05:00:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function defaultReport(): Promise<Phase2PlannerDefaultPromotionReport> {
  return buildPhase2PlannerDefaultPromotionReport({
    now,
    proofMarker: "PHASE2-CONTROLLED-ACTION-EXECUTION-TEST",
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

async function approvalReport(): Promise<Phase2StagedActionApprovalReport> {
  const boundary = await boundaryReport();
  return buildPhase2StagedActionApprovalReport({
    now,
    boundaryReport: boundary,
    controlledSuggestionReport: await controlledSuggestions(boundary),
    operatorDecision: "approve",
    operatorId: scope.operatorId,
  });
}

describe("phase2 controlled action execution", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("executes only the harmless proof artifact action inside approved scope", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("executed_controlled_harmless_action");
    expect(report.result?.status).toBe("executed");
    expect(report.result?.boundedArtifactOnly).toBe(true);
    expect(report.telemetry.actionExecutionObserved).toBe(true);
    expect(report.telemetry.externalCommandExecuted).toBe(false);
    expect(report.telemetry.networkCallExecuted).toBe(false);
    expect(report.telemetry.databaseMutationExecuted).toBe(false);
    expect(report.telemetry.userFacingProactiveMessagesSent).toBe(false);
    assertPhase2ControlledActionExecutionObserved(report);
  });

  it("blocks execution outside approved scope", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: { ...requestScope(), sessionKey: "other-session" },
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_scope");
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks without an approved proposal", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: null,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_missing_approval");
    expect(report.result).toBeUndefined();
  });

  it("blocks rejected proposals", async () => {
    const boundary = await boundaryReport();
    const rejectedApproval = await buildPhase2StagedActionApprovalReport({
      now,
      boundaryReport: boundary,
      controlledSuggestionReport: await controlledSuggestions(boundary),
      operatorDecision: "reject",
      operatorId: scope.operatorId,
    });
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: rejectedApproval,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_missing_approval");
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks without explicit execution approval", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: false,
    });

    expect(report.decision).toBe("blocked_missing_approval");
    expect(report.auditTrail[0]?.explicitExecutionApproval).toBe(false);
  });

  it("blocks no-dark-data failures", async () => {
    const failed = clone(await approvalReport());
    failed.noDarkDataStatus = "fail";
    failed.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: failed,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_no_dark_data");
  });

  it("blocks missing provenance", async () => {
    const missingProvenance = clone(await approvalReport());
    const proposal = missingProvenance.proposals.find((candidate) => candidate.approved);
    if (!proposal) {
      throw new Error("test fixture missing approved proposal");
    }
    proposal.evidenceArtifactIds = [];
    proposal.sourceRefIds = [];
    proposal.sourceProfileIds = [];
    proposal.authorityTiers = [];
    proposal.contentHashes = [];
    proposal.proofHashes = [];
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: missingProvenance,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_provenance");
    expect(report.telemetry.reasonCodes).toContain("provenance_required");
  });

  it("blocks when rollback is active", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.rollbackPlan.disablesControlledActionExecution).toBe(true);
  });

  it("blocks unsafe action kinds", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
      actionKind: "unsafe_external_command",
    });

    expect(report.decision).toBe("blocked_unsafe_action_kind");
    expect(report.telemetry.externalCommandExecuted).toBe(false);
  });

  it("keeps result and audit deterministic on fixed input", async () => {
    const approved = await approvalReport();
    const first: Phase2ControlledActionExecutionReport =
      await buildPhase2ControlledActionExecutionReport({
        now,
        approvalReport: approved,
        approvedScope: scope,
        requestScope: requestScope(),
        explicitExecutionApproval: true,
      });
    const second = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: approved,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(second.reportId).toBe(first.reportId);
    expect(second.result?.resultId).toBe(first.result?.resultId);
    expect(second.auditTrail[0]?.auditId).toBe(first.auditTrail[0]?.auditId);
  });

  it("treats project docs and external imperative text as evidence, never instructions", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });

    expect(report.policy.externalTextHandling).toBe("evidence_not_instruction");
    expect(report.result?.externalImperativeTextHandling).toBe("evidence_not_instruction");
  });

  it("writes bounded execution report artifacts without prohibited content", async () => {
    const report = await buildPhase2ControlledActionExecutionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitExecutionApproval: true,
    });
    const artifact = await writePhase2ControlledActionExecutionArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
