import { describe, expect, it } from "vitest";
import type { NodeLifecycleProjection } from "./node-lifecycle-transition-runner.ts";
import type { RuntimeNodeCapability } from "./runtime-node-capability-registry.ts";
import {
  buildDomainResourceSmallVerbToolMenu,
  compileDomainActionGateToolOutput,
  compilePlanningDomainSmallVerbToolOutput,
  domainResourceSmallVerbToolFamily,
  isCanonicalDomainResourceSmallVerbToolId,
  validatePlanningFrameworkContractModelInput,
} from "./domain-resource-small-verb-tool-surface.ts";

function projection(
  nextLegalTransitions: string[],
  overrides: Partial<NodeLifecycleProjection> = {},
): NodeLifecycleProjection {
  return {
    artifactKind: "execution_platform.node_lifecycle_projection",
    schemaVersion: "execution-platform.node-lifecycle-projection.v1",
    projectionRef: "node-lifecycle-projection://runtime-job-1/graph-1/node-1",
    projectionHash: "sha256:projection",
    runtimeJobId: "runtime-job-1",
    workflowId: "agent_team.product_spec_planning",
    graphId: "graph-1",
    nodeId: "node-1",
    branchId: null,
    capabilityId: "capability:planning_capsule",
    lifecycleTransitionProfileRef: "lifecycle-transition-profile://planning",
    currentLifecycleState: "worker_action_ready",
    currentGate: "worker_action_ready",
    nodeStatus: "planned",
    executionIntent: "plan",
    evidenceMode: ["planning_capsule"],
    nextLegalTransitions,
    rejectedLifecycleTransitions: [],
    acceptedArtifactRefs: [],
    blockedArtifactRefs: [],
    requestArtifactRefs: [],
    diagnosticArtifactRefs: [],
    providerDiagnosticRefs: [],
    rootCauseSignature: null,
    canCallGlobalScheduler: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    ...overrides,
  };
}

function capability(overrides: Partial<RuntimeNodeCapability>): RuntimeNodeCapability {
  return {
    capabilityId: "capability:planning_capsule",
    domainProfileId: "product_spec_planning",
    domainWorkerActionToolIds: [
      "planning.intent.record",
      "planning.framework_contract.record",
      "planning.capsule.draft",
      "planning.action_graph.propose",
      "resource.ledger.report_relevant_resource",
      "resource.ledger.report_planning_action_point",
      "resource.ledger.recommend_domain_validation",
    ],
    ...overrides,
  } as RuntimeNodeCapability;
}

describe("domain resource small-verb tool surface", () => {
  it("projects Product/Spec planning tools without exposing coding or retired dialects", () => {
    const menu = buildDomainResourceSmallVerbToolMenu({
      projection: projection([
        "planning.capsule.draft",
        "planning.framework_contract.record",
        "planning.action_graph.propose",
        "resource.selection.propose",
        "resource.ledger.report_planning_action_point",
        "resource.ledger.recommend_domain_validation",
        "worker.edit.plan",
        "resource_selection.submit_selection",
      ]),
      domainProfileId: "product_spec_planning",
      capability: capability({}),
    });

    expect(menu.tools.map((tool) => tool.toolId)).toEqual([
      "planning.capsule.draft",
      "planning.framework_contract.record",
      "planning.action_graph.propose",
      "resource.selection.propose",
      "resource.ledger.report_planning_action_point",
      "resource.ledger.recommend_domain_validation",
    ]);
    expect(menu.tools.every((tool) => tool.inputContractKind === "flat_small_verb")).toBe(true);
    expect(menu.tools.every((tool) => tool.payloadPolicy.metadataManifestOnly)).toBe(true);
    expect(menu.tools.every((tool) => tool.payloadPolicy.rawPromptStored === false)).toBe(true);
    expect(menu.rejectedToolIds).toEqual(["worker.edit.plan", "resource_selection.submit_selection"]);
    expect(menu.rejectedToolReasonCodes).toEqual([
      "product_spec_planning_coding_tool_rejected",
      "domain_resource_tool_not_canonical",
    ]);
    expect(menu.byteCount).toBeLessThan(16_000);
    expect(menu.semanticQualityJudgedByDeterministicCode).toBe(false);
    expect(menu.rawPromptStored).toBe(false);
    expect(menu.hiddenReasoningStored).toBe(false);
  });

  it("projects coding tools without exposing planning action verbs", () => {
    const menu = buildDomainResourceSmallVerbToolMenu({
      projection: projection(
        [
          "worker.edit.plan",
          "worker.patch.force_author_from_plan",
          "planning.capsule.draft",
          "resource.selection.propose",
        ],
        { workflowId: "agent_team.coding", capabilityId: "capability:coding_source_edit" },
      ),
      domainProfileId: "coding",
      capability: capability({
        domainProfileId: "coding",
        domainWorkerActionToolIds: [
          "worker.edit.plan",
          "worker.validation.run_structural_default",
          "worker.evidence.claim_from_validation",
        ],
      }),
    });

    expect(menu.tools.map((tool) => tool.toolId)).toEqual([
      "worker.edit.plan",
      "resource.selection.propose",
    ]);
    expect(menu.rejectedToolIds).toEqual([
      "worker.patch.force_author_from_plan",
      "planning.capsule.draft",
    ]);
    expect(menu.rejectedToolReasonCodes).toEqual([
      "domain_resource_tool_not_canonical",
      "coding_planning_tool_rejected",
    ]);
  });

  it("compiles Product/Spec planning verbs into bounded artifact manifests", () => {
    const output = compilePlanningDomainSmallVerbToolOutput({
      toolId: "planning.framework_contract.record",
      volatileInput: {
        lifecyclePhaseRefs: ["lifecycle://resource-focus", "lifecycle://domain-action-gate"],
        resourceContractRefs: ["resource-contract://planning-domain"],
        actionGateRefs: ["domain-action-gate://planning-framework-contract"],
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
    expect(output.reasonCodes).toContain("planning_domain_small_verb_artifact_valid");
    expect(output.metadata).toMatchObject({
      artifactKind: "planning_domain_small_verb_tool_output",
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
      lifecyclePhaseRefs: ["lifecycle://resource-focus"],
      resourceContractRefs: ["resource-contract://planning-domain"],
      actionGateRefs: ["domain-action-gate://planning-framework-contract"],
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

    const output = compilePlanningDomainSmallVerbToolOutput({
      toolId: "planning.framework_contract.record",
      volatileInput: {
        workflowId: "agent_team.product_spec_planning",
        lifecyclePhaseRefs: ["lifecycle://resource-focus"],
        resourceContractRefs: ["resource-contract://planning-domain"],
        actionGateRefs: ["domain-action-gate://planning-framework-contract"],
        evidenceExpectationRefs: ["evidence://planning-framework-contract"],
        implementationSliceRefs: ["repo://extensions/execution-platform/src/workflows"],
      },
    });

    expect(output.status).toBe("needs_review");
    expect(output.reasonCodes).toContain(
      "planning_framework_contract_model_input_runtime_owned_field:workflowId",
    );
  });

  it("keeps domain action gate verbs on the shared domain family", () => {
    expect(isCanonicalDomainResourceSmallVerbToolId("domain.action_gate.evaluate")).toBe(true);
    expect(domainResourceSmallVerbToolFamily("domain.action_gate.evaluate")).toBe(
      "domain.action_gate",
    );

    const output = compileDomainActionGateToolOutput({
      toolId: "domain.action_gate.block",
      metadata: {
        domainActionGateRef: "domain-action-gate://node-1/blocked",
        reasonCodes: ["target_snapshot_missing"],
      },
    });
    expect(output.status).toBe("needs_review");
    expect(output.outputRef).toBe("domain-action-gate://node-1/blocked");
    expect(output.reasonCodes).toEqual([
      "domain_action_gate_block_recorded",
      "target_snapshot_missing",
    ]);
  });
});
