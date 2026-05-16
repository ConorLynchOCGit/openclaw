import { describe, expect, it } from "vitest";
import {
  PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_ARTIFACT_KIND,
  PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CANONICAL_REFS,
  PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CLOSEOUT_POLICY,
  PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_STORAGE_POLICY,
  createProductSpecPlanningRuntimeContract,
  parseProductSpecPlanningRuntimeContract,
  validateProductSpecPlanningRuntimeContract,
} from "./product-spec-planning-runtime-contract.ts";

describe("product/spec planning runtime contract facade", () => {
  it("exposes canonical bounded runtime policies", () => {
    expect(PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_ARTIFACT_KIND).toBe(
      "product_spec_planning_worker_contract",
    );
    expect(PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CANONICAL_REFS).toEqual(
      expect.arrayContaining([
        "workflow://agent_team.product_spec_planning",
        "workflow://single_agent.web_research",
      ]),
    );
    expect(PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_STORAGE_POLICY).toMatchObject({
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });
    expect(PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CLOSEOUT_POLICY).toMatchObject({
      compileBoundaryRequired: true,
      childActionsAutoExecuted: false,
      missionLedgerGateRequired: true,
    });
  });

  it("creates bounded runtime contracts for child action proposals", () => {
    const contract = createProductSpecPlanningRuntimeContract({
      planningMode: "child_action_graph_proposal",
      workflowRefs: [
        "workflow://agent_team.product_spec_planning",
        "runtime-job://native-exec/runtime-work-graph/planning/graph-1",
      ],
      childActionProposalRefs: ["runtime-work-graph://native-exec/proposal/implementation"],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposal",
      ],
      validationRefs: ["validation://product-spec/runtime-contract"],
      limitations: ["compile approval required before runtime execution"],
      eli5Progress: "We planned follow-up actions without running them.",
    });
    const parsed = parseProductSpecPlanningRuntimeContract(contract);
    expect(parsed.planningMode).toBe("child_action_graph_proposal");
    expect(parsed.contractVersion).toBe("v1");
    expect(parsed.rawPromptStored).toBe(false);
    expect(parsed.workQueueLifecycleMutationAllowed).toBe(false);
  });

  it("keeps v1 compatibility while rejecting raw storage flags", () => {
    const valid = validateProductSpecPlanningRuntimeContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "plan_only",
      planningOutputKind: "plan_only_output",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      childActionProposalRefs: [],
      humanDecisionRefs: ["owner-decision://product-spec-planning/default-plan-only"],
      validationRefs: ["validation://product-spec/runtime-contract"],
      limitations: ["none"],
      eli5Progress: "Plan only output is accepted.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });
    expect(valid.accepted).toBe(true);
    const invalid = validateProductSpecPlanningRuntimeContract({
      ...valid.contract!,
      rawPromptStored: true,
    });
    expect(invalid.accepted).toBe(false);
  });
});
