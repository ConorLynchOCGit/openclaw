import { describe, expect, it } from "vitest";
import {
  compilePlanningSmallVerbToolOutput,
  validatePlanningFrameworkContractModelInput,
} from "./planning-small-verb-tool-surface.ts";

describe("planning small-verb tool surface", () => {
  it("compiles Product/Spec planning verbs into bounded artifact manifests", () => {
    const output = compilePlanningSmallVerbToolOutput({
      toolId: "planning.framework_contract.record",
      volatileInput: {
        lifecyclePhaseRefs: ["lifecycle://source-grounding", "lifecycle://planning-contract"],
        resourceContractRefs: ["resource-contract://planning-domain"],
        actionGateRefs: ["action-gate://planning-framework-contract"],
        evidenceExpectationRefs: ["artifact-payload://evidence/traceable-queue"],
        implementationSliceRefs: ["repo://extensions/execution-platform/src/workflows"],
      },
      metadata: {
        runtimeOwnedFields: {
          contractId: "framework-contract-1",
          workflowId: "agent_team.product_spec_planning",
          runtimeJobId: "runtime-job-1",
          authority: "model",
          lifecycle: "accepted",
          validationState: "valid",
          targetSubjectRefs: ["artifact-payload://target/product-spec-system"],
        },
      },
    });

    expect(output.status).toBe("succeeded");
    expect(output.outputRef).toBe("planning-framework-contract://framework-contract-1");
    expect(output.reasonCodes).toContain("planning_small_verb_artifact_valid");
    expect(output.metadata).toMatchObject({
      artifactKind: "planning_small_verb_tool_output",
      planningArtifactRef: "planning-framework-contract://framework-contract-1",
      runtimeOwnedFieldsApplied: true,
      modelInputFieldNames: expect.arrayContaining([
        "lifecyclePhaseRefs",
        "resourceContractRefs",
        "actionGateRefs",
        "evidenceExpectationRefs",
        "implementationSliceRefs",
      ]),
      rawPromptStored: false,
      rawResponseStored: false,
      hiddenReasoningStored: false,
    });
    expect(JSON.stringify(output.metadata)).not.toContain("Product/Spec full prompt");
  });

  it("rejects Product/Spec framework contract model input that tries to author runtime envelope", () => {
    const validation = validatePlanningFrameworkContractModelInput({
      contractId: "model-should-not-author-this",
      workflowId: "agent_team.product_spec_planning",
      lifecycle: "validated",
      lifecyclePhaseRefs: ["lifecycle://source-grounding"],
      resourceContractRefs: ["resource-contract://planning-domain"],
      actionGateRefs: ["action-gate://planning-framework-contract"],
      implementationSliceRefs: ["repo://extensions/execution-platform/src/workflows"],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "planning_framework_contract_model_input_evidenceExpectationRefs_missing",
        "planning_framework_contract_model_input_runtime_owned_field:contractId",
        "planning_framework_contract_model_input_runtime_owned_field:workflowId",
        "planning_framework_contract_model_input_runtime_owned_field:lifecycle",
      ]),
    );

    const output = compilePlanningSmallVerbToolOutput({
      toolId: "planning.framework_contract.record",
      volatileInput: {
        workflowId: "agent_team.product_spec_planning",
        lifecyclePhaseRefs: ["lifecycle://source-grounding"],
        resourceContractRefs: ["resource-contract://planning-domain"],
        actionGateRefs: ["action-gate://planning-framework-contract"],
        evidenceExpectationRefs: ["evidence://planning-framework-contract"],
        implementationSliceRefs: ["repo://extensions/execution-platform/src/workflows"],
      },
    });

    expect(output.status).toBe("needs_review");
    expect(output.reasonCodes).toContain(
      "planning_framework_contract_model_input_runtime_owned_field:workflowId",
    );
  });

  it("rejects non-planning tools instead of acting as a shared resource compiler", () => {
    const output = compilePlanningSmallVerbToolOutput({
      toolId: "worker.edit.plan",
      volatileInput: {},
    });

    expect(output.status).toBe("needs_review");
    expect(output.reasonCodes).toEqual(["planning_small_verb_tool_id_not_supported"]);
    expect(output.metadata).toMatchObject({
      artifactKind: "planning_small_verb_tool_output",
      status: "rejected",
    });
  });
});
