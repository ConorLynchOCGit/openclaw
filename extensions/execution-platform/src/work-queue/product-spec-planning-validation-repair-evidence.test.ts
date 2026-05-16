import { describe, expect, it } from "vitest";
import { summarizeProductSpecPlanningValidationRepairEvidence } from "./product-spec-planning-validation-repair-evidence.ts";

describe("product/spec planning validation repair evidence", () => {
  it("classifies failed validation refs plus accepted repair refs", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      validationRefs: [
        "runtime-job://native-exec/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
        "runtime-job://native-exec/runtime-work-graph/validation/repair-rerun-accepted",
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(true);
    expect(summary.hasBothFailureAndRepairRefs).toBe(true);
    expect(summary.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_failure_inferred_from_legacy_ref",
        "validation_repair_inferred_from_legacy_ref",
        "validation_failure_classified",
        "product_spec_planning_validation_repair_observed",
      ]),
    );
  });

  it("prefers explicit validation and repair metadata over misleading uri text", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://one/validation/passed-looking-uri",
          metadata: {
            status: "failed",
            commandRef: "pnpm test:file one.test.ts",
            boundedFailureSummary: "Focused validation failed before repair.",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://one/validation/no-repair-word",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            validationRefs: ["runtime-job://one/validation/rerun"],
            reasonCodes: ["same_job_repair_completed"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(true);
    expect(summary.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_failure_recorded_from_metadata",
        "validation_repair_recorded_from_metadata",
        "product_spec_planning_validation_repair_observed",
      ]),
    );
    expect(summary.reasonCodes).not.toContain("validation_repair_inferred_from_legacy_ref");
  });

  it("flags missing repair evidence after a failed validation ref", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      validationRefs: [
        "runtime-job://native-exec/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(false);
    expect(summary.reasonCodes).toContain(
      "product_spec_planning_validation_repair_missing_after_failure",
    );
  });

  it("bounds refs and emits missing-evidence reason when refs are absent", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({ validationRefs: [] });
    expect(summary.boundedValidationRefs).toEqual([]);
    expect(summary.reasonCodes).toContain("product_spec_planning_validation_refs_missing");
  });

  it("accepts corrected no-op repair when metadata marks validation evidence as adequate", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://one/validation/run",
          metadata: {
            status: "failed",
            commandRef: "pnpm test:file one.test.ts",
            boundedFailureSummary: "Validation failed.",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://one/validation/repair",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            validationRefs: [],
            reasonCodes: [
              "validation_evidence_adequate",
              "single_failed_ref_injected_for_test",
              "invalid_no_op_repair_for_failed_validation_corrected",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(true);
    expect(summary.hasBothFailureAndRepairRefs).toBe(true);
    expect(summary.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_failure_recorded_from_metadata",
        "validation_repair_recorded_from_metadata",
        "validation_failure_classified",
        "product_spec_planning_validation_repair_observed",
        "validation_evidence_adequate",
      ]),
    );
  });

  it("rejects no-op repair correction without passed validation evidence", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://one/validation/run",
          metadata: {
            status: "failed",
            commandRef: "pnpm test:file one.test.ts",
            boundedFailureSummary: "Validation failed.",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://one/validation/repair",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            validationRefs: [],
            reasonCodes: [
              "single_failed_ref_injected_for_test",
              "invalid_no_op_repair_for_failed_validation_corrected",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(false);
    expect(summary.hasBothFailureAndRepairRefs).toBe(false);
    expect(summary.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_failure_recorded_from_metadata",
        "product_spec_planning_validation_repair_missing_after_failure",
        "product_spec_planning_invalid_no_op_repair_needs_real_repair_evidence",
      ]),
    );
    expect(summary.reasonCodes).not.toContain("product_spec_planning_validation_repair_observed");
  });

  it("treats failed validation ref reason codes as failed validation evidence", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://one/validation/scoped",
          metadata: { reasonCodes: ["failed validation ref: validation://forced"] },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(false);
    expect(summary.reasonCodes).toContain("validation_failure_recorded_from_metadata");
  });
});
