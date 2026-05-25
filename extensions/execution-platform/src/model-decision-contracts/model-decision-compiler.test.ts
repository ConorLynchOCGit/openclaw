import { describe, expect, it } from "vitest";
import {
  buildModelContractBoundaryRegistry,
  compileModelContractBoundary,
  firstStructuralString,
  firstStructuralStringArray,
  flattenModelDecisionFields,
  missingField,
  repairRequestForMissingFields,
  runtimeOwnedFieldReasonCodesForRecords,
} from "./model-decision-compiler.ts";

describe("model decision compiler helpers", () => {
  it("accepts structural aliases without semantic prompt-specific judgment", () => {
    const record = {
      taskDetails: {
        objective: "Identify target files.",
        commitmentIds: ["commitment-context"],
      },
    };

    const flattened = flattenModelDecisionFields(record);

    expect(firstStructuralString(flattened, ["exactObjective", "objective"]).value).toBe(
      "Identify target files.",
    );
    expect(
      firstStructuralStringArray(flattened, ["commitmentIdsAdvanced", "commitmentIds"]).value,
    ).toEqual(["commitment-context"]);
    expect(flattened).toMatchObject({
      objective: "Identify target files.",
      commitmentIds: ["commitment-context"],
    });
  });

  it("builds field-specific repair requests with bounded paths and preserve fields", () => {
    const request = repairRequestForMissingFields({
      failedDecisionId: "decision-failed",
      missingFields: [
        missingField(
          "newNodes[0].expectedHumanReadableOutput",
          "string",
          "Node output must be inspectable by downstream workers.",
          "Bounded context handoff.",
        ),
      ],
      preserveFields: ["decisionId", "newNodes[0].capabilityId"],
      acceptedFields: ["capabilityId"],
      rejectedReasonCodes: ["node_expected_output_missing:context-1"],
    });

    expect(request).toMatchObject({
      failedDecisionId: "decision-failed",
      missingFields: [
        expect.objectContaining({
          path: "newNodes[0].expectedHumanReadableOutput",
          expectedType: "string",
        }),
      ],
      preserveFields: ["decisionId", "newNodes[0].capabilityId"],
      acceptedFields: ["capabilityId"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("registers every major production model contract boundary", () => {
    const registry = buildModelContractBoundaryRegistry();

    expect(registry.map((entry) => entry.boundaryKind)).toEqual(
      expect.arrayContaining([
        "router_front_door",
        "mission_ledger",
        "commitment_work_packet",
        "context_scout",
        "context_repair",
        "scheduler_staged_protocol",
        "capability_selection",
        "resource_materialization",
        "worker_file_edit_loop",
        "validation_qa",
        "review_readback",
        "closeout_finalization",
      ]),
    );
    expect(registry.every((entry) => !entry.rawPromptStored)).toBe(true);
    expect(registry.every((entry) => !entry.rawResponseStored)).toBe(true);
  });

  it("rejects nested runtime-owned fields without semantic prompt-specific judgment", () => {
    const compiled = compileModelContractBoundary({
      boundaryKind: "scheduler_staged_protocol",
      failedDecisionId: "decision-runtime-owned",
      value: {
        workUnitId: "wu-1",
        objective: "Add workflow registration.",
        metadata: {
          executorKey: "codex_impl",
          graphNodeKind: "implementation",
        },
      },
      preserveFields: ["workUnitId", "objective"],
    });

    expect(compiled.accepted).toBe(false);
    expect(compiled.reasonCodes).toContain(
      "model_contract_runtime_owned_field_rejected:scheduler_staged_protocol.metadata.executorKey",
    );
    expect(compiled.repairRequest.missingFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "scheduler_staged_protocol.metadata.executorKey",
          expectedType: "omit runtime-owned field",
          validAlternatives: expect.arrayContaining(["selectedCapabilityId", "objective"]),
        }),
      ]),
    );
    expect(compiled.repairRequest.preserveFields).toEqual(["workUnitId", "objective"]);
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects raw-storage flags recursively", () => {
    const compiled = compileModelContractBoundary({
      boundaryKind: "commitment_work_packet",
      value: {
        workerHandoff: "Implement the bounded work packet.",
        diagnostics: { rawResponseStored: true },
      },
    });

    expect(compiled.accepted).toBe(false);
    expect(compiled.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "commitment_work_packet.diagnostics.rawResponseStored",
          code: "model_contract_raw_storage_flag_rejected",
          expectedType: "false",
        }),
      ]),
    );
  });

  it("requires semantic content but does not infer evidence kind from artifact refs", () => {
    const missing = compileModelContractBoundary({
      boundaryKind: "closeout_finalization",
      value: {
        evidenceRefs: ["artifact://execution-platform/validation-result.json"],
      },
    });
    const accepted = compileModelContractBoundary({
      boundaryKind: "closeout_finalization",
      value: {
        summary: "Validation and readback evidence were accepted by the closeout reviewer.",
      },
    });

    expect(missing.accepted).toBe(false);
    expect(missing.reasonCodes).toContain(
      "model_contract_required_semantic_field_missing:closeoutSummary",
    );
    expect(missing.reasonCodes.some((code) => code.includes("validation-result"))).toBe(false);
    expect(accepted.accepted).toBe(true);
  });

  it("exposes compiler-backed staged scheduler runtime-owned reason codes", () => {
    const reasonCodes = runtimeOwnedFieldReasonCodesForRecords({
      records: [
        {
          objective: "Find source files.",
          nodeContract: { workerRef: "codex" },
        },
      ],
      pathPrefix: "stagedScheduler.workUnits",
      boundaryKind: "scheduler_staged_protocol",
      codePrefix: "staged_scheduler_runtime_owned_field_rejected",
    });

    expect(reasonCodes).toEqual([
      "staged_scheduler_runtime_owned_field_rejected:stagedScheduler.workUnits[0].nodeContract.workerRef",
    ]);
  });

  it("does not change compiler result for Product/Spec wording", () => {
    const base = compileModelContractBoundary({
      boundaryKind: "scheduler_staged_protocol",
      value: {
        objective: "Implement the workflow.",
        roleRationale: "This is the next scoped unit.",
      },
    });
    const productSpec = compileModelContractBoundary({
      boundaryKind: "scheduler_staged_protocol",
      value: {
        objective: "Implement the Product/Spec Planning workflow.",
        roleRationale: "This is the next scoped unit.",
      },
    });

    expect(productSpec.accepted).toBe(base.accepted);
    expect(productSpec.diagnostics.map((issue) => issue.code)).toEqual(
      base.diagnostics.map((issue) => issue.code),
    );
  });
});
