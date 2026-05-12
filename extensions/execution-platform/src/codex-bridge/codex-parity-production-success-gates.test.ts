import { describe, expect, it } from "vitest";
import { decideCodexParityProductionSuccess } from "./codex-parity-production-success-gates.ts";

function validInput() {
  return {
    runtimeJobState: "succeeded",
    runtimeGraphPresent: true,
    dynamicGraphUsed: true,
    processCompleted: true,
    sourceEditsRequired: true,
    changedFileRefs: ["ui/src/ui/views/work-queue.ts"],
    validationRecords: [
      { commandRef: "pnpm test:file ui/src/ui/views/work-queue.test.ts", status: "passed" },
    ],
    testIntegrityAccepted: true,
    roleEvidenceCount: 5,
    repeatedRoleInvocationPresent: true,
    validationRepairLoopPassed: true,
    closeoutPresent: true,
    closeoutModelAuthored: true,
    closeoutTaskSatisfied: true,
  };
}

describe("Codex parity production success gate", () => {
  it("accepts only completed-work evidence, not process completion alone", () => {
    expect(decideCodexParityProductionSuccess(validInput())).toMatchObject({
      status: "accepted",
      reasonCodes: ["codex_parity_production_success_gate_accepted"],
    });

    expect(
      decideCodexParityProductionSuccess({
        ...validInput(),
        changedFileRefs: [],
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: expect.arrayContaining(["required_source_edit_missing"]),
    });
  });

  it("blocks skipped/weakened validation and missing dynamic role evidence", () => {
    const decision = decideCodexParityProductionSuccess({
      ...validInput(),
      validationRecords: [
        { commandRef: "pnpm test:file ui/src/ui/views/work-queue.test.ts", status: "skipped" },
      ],
      testIntegrityAccepted: false,
      repeatedRoleInvocationPresent: false,
    });

    expect(decision.status).toBe("blocked");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_not_all_passed",
        "test_integrity_not_accepted",
        "repeated_role_invocation_missing",
      ]),
    );
  });
});
