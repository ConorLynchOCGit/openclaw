import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ControlledActionExpansionObserved,
  buildPhase2ControlledActionExpansionReport,
  writePhase2ControlledActionExpansionArtifact,
  type Phase2ControlledActionExpansionReport,
} from "./phase2-controlled-action-expansion.ts";
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

const TEMP_ROOT = ".artifacts/test-phase2-controlled-action-expansion";
const now = new Date("2026-04-26T06:00:00.000Z");
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
    proofMarker: "PHASE2-CONTROLLED-ACTION-EXPANSION-TEST",
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

describe("phase2 controlled action expansion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("executes create_operator_review_note inside approved scope after explicit approval", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(report.policy.allowedActionKinds).toEqual([
      "write_bounded_proof_artifact",
      "create_operator_review_note",
    ]);
    expect(report.decision).toBe("executed_expanded_harmless_action");
    expect(report.result?.status).toBe("executed");
    expect(report.result?.reviewNoteId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(report.result?.operatorVisible).toBe(true);
    expect(report.telemetry.actionExecutionObserved).toBe(true);
    expect(report.telemetry.userFacingProactiveMessagesSent).toBe(false);
    assertPhase2ControlledActionExpansionObserved(report);
  });

  it("also keeps proof artifact action harmless and approval gated", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "write_bounded_proof_artifact",
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("executed_expanded_harmless_action");
    expect(report.result?.boundedArtifactOnly).toBe(true);
    expect(report.result?.reviewNoteId).toBeUndefined();
  });

  it("blocks operator review note outside approved scope", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: { ...requestScope(), operatorId: "other-operator" },
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_scope");
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks without approved proposal", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: null,
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_missing_approval");
    expect(report.result).toBeUndefined();
  });

  it("blocks without explicit execution approval", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: false,
    });

    expect(report.decision).toBe("blocked_missing_approval");
    expect(report.auditTrail[0]?.explicitExecutionApproval).toBe(false);
  });

  it("blocks no-dark-data failures", async () => {
    const failed = clone(await approvalReport());
    failed.noDarkDataStatus = "fail";
    failed.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: failed,
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
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
    proposal.sourceRefIds = [];
    proposal.sourceProfileIds = [];
    proposal.authorityTiers = [];
    proposal.contentHashes = [];
    proposal.proofHashes = [];
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: missingProvenance,
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_provenance");
    expect(report.telemetry.reasonCodes).toContain("provenance_required");
  });

  it("blocks when rollback is active", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXPANSION_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.rollbackPlan.disablesExpandedActionExecution).toBe(true);
  });

  it("blocks unsafe action kinds", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "unsafe_file_mutation",
      explicitExecutionApproval: true,
    });

    expect(report.decision).toBe("blocked_unsafe_action_kind");
    expect(report.telemetry.unsafeFileMutationExecuted).toBe(false);
  });

  it("keeps operator review note result deterministic on fixed input", async () => {
    const approved = await approvalReport();
    const first: Phase2ControlledActionExpansionReport =
      await buildPhase2ControlledActionExpansionReport({
        now,
        approvalReport: approved,
        approvedScope: scope,
        requestScope: requestScope(),
        actionKind: "create_operator_review_note",
        explicitExecutionApproval: true,
      });
    const second = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: approved,
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(second.reportId).toBe(first.reportId);
    expect(second.result?.reviewNoteId).toBe(first.result?.reviewNoteId);
    expect(second.auditTrail[0]?.auditId).toBe(first.auditTrail[0]?.auditId);
  });

  it("treats external and project text as evidence, not instructions", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });

    expect(report.policy.externalTextHandling).toBe("evidence_not_instruction");
    expect(report.result?.externalImperativeTextHandling).toBe("evidence_not_instruction");
  });

  it("writes bounded expansion report artifacts without prohibited content", async () => {
    const report = await buildPhase2ControlledActionExpansionReport({
      now,
      approvalReport: await approvalReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      actionKind: "create_operator_review_note",
      explicitExecutionApproval: true,
    });
    const artifact = await writePhase2ControlledActionExpansionArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
