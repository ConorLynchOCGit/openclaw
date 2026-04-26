import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ActionExecutionOperatorDefaultApproved,
  buildPhase2ActionExecutionOperatorDefaultReport,
  writePhase2ActionExecutionOperatorDefaultArtifact,
} from "./phase2-action-execution-operator-default.ts";
import {
  buildPhase2ControlledActionExecutionReport,
  type Phase2ControlledActionExecutionReport,
} from "./phase2-controlled-action-execution.ts";
import {
  buildPhase2ControlledActionExpansionReport,
  type Phase2ControlledActionExpansionReport,
} from "./phase2-controlled-action-expansion.ts";

const TEMP_ROOT = ".artifacts/test-phase2-action-execution-operator-default";
const now = new Date("2026-04-26T07:00:00.000Z");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function executionReport(): Promise<Phase2ControlledActionExecutionReport> {
  return buildPhase2ControlledActionExecutionReport({
    now,
    proofMarker: "PHASE2-ACTION-EXECUTION-OPERATOR-DEFAULT-TEST",
    explicitExecutionApproval: true,
  });
}

async function expansionReport(): Promise<Phase2ControlledActionExpansionReport> {
  return buildPhase2ControlledActionExpansionReport({
    now,
    proofMarker: "PHASE2-ACTION-EXECUTION-OPERATOR-DEFAULT-TEST",
    explicitExecutionApproval: true,
    actionKind: "create_operator_review_note",
  });
}

describe("phase2 action execution operator default", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves only the operator-visible execution workflow after Slice 25 and Slice 26 proofs", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.decision).toBe("approved_for_default_operator_visible_execution_workflow");
    expect(report.config.allowedActionKinds).toEqual([
      "write_bounded_proof_artifact",
      "create_operator_review_note",
    ]);
    expect(report.config.requireExplicitExecutionApproval).toBe(true);
    expect(report.config.autonomousExecutionAllowed).toBe(false);
    expect(report.config.userFacingProactiveMessagesAllowed).toBe(false);
    expect(report.telemetry.defaultVisibleOperatorWorkflowObserved).toBe(true);
    assertPhase2ActionExecutionOperatorDefaultApproved(report);
  });

  it("blocks without Slice 25 proof", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: null,
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.checks.find((check) => check.checkId === "proof:slice25_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks without Slice 26 proof", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: null,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.checks.find((check) => check.checkId === "proof:slice26_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks failed no-dark-data status", async () => {
    const failed = clone(await expansionReport());
    failed.noDarkDataStatus = "fail";
    failed.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: failed,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks when explicit execution approval is not required by proof", async () => {
    const unsafe = clone(await executionReport());
    unsafe.policy.requireExplicitExecutionApproval = false as true;
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: unsafe,
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.telemetry.reasonCodes).toContain("explicit_approval_required");
  });

  it("blocks if user-facing proactivity is enabled in proof", async () => {
    const unsafe = clone(await expansionReport());
    unsafe.policy.userFacingProactiveMessagesAllowed = true as false;
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: unsafe,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.telemetry.reasonCodes).toContain("user_facing_proactivity_must_remain_off");
  });

  it("exposes only allowed harmless action kinds", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.config.blockedActionKinds).toEqual([
      "unsafe_external_command",
      "unsafe_network_call",
      "unsafe_db_mutation",
      "unsafe_user_message",
      "unsafe_file_mutation",
    ]);
    expect(report.capabilityDecision.autonomousExecutionAllowed).toBe(false);
  });

  it("keeps create_operator_review_note approval-required", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.config.requireStagedApproval).toBe(true);
    expect(report.config.requireExplicitExecutionApproval).toBe(true);
    expect(report.capabilityDecision.allowedActionKinds).toContain("create_operator_review_note");
  });

  it("keeps write_bounded_proof_artifact approval-required", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.config.requireStagedApproval).toBe(true);
    expect(report.capabilityDecision.allowedActionKinds).toContain("write_bounded_proof_artifact");
  });

  it("rollback kill-switch disables default-visible workflow", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
      env: { MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.telemetry.defaultVisibleOperatorWorkflowObserved).toBe(false);
  });

  it("preserves audit and provenance metadata from proof reports", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.telemetry.proofHashes.length).toBeGreaterThan(0);
  });

  it("treats project docs and external text as evidence, not instructions", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    expect(report.config.externalTextHandling).toBe("evidence_not_instruction");
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });
    const artifact = await writePhase2ActionExecutionOperatorDefaultArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    expect(artifact.byteLength).toBeGreaterThan(0);
    expect(artifact.byteLength).toBeLessThan(256 * 1024);
    await expect(fs.stat(artifact.markdownPath)).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
  });

  it("rejects prohibited raw-content keys", async () => {
    const report = await buildPhase2ActionExecutionOperatorDefaultReport({
      now,
      controlledActionExecutionReport: await executionReport(),
      controlledActionExpansionReport: await expansionReport(),
    });

    await expect(
      writePhase2ActionExecutionOperatorDefaultArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
