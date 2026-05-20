import { describe, expect, it } from "vitest";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import {
  validateWorkflowOrchestrationPolicy,
  workflowOrchestrationPolicySummary,
} from "./workflow-orchestration-policy.ts";

describe("workflow orchestration policy", () => {
  it("accepts the canonical coding policy as a generic workflow orchestration substrate", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const validation = validateWorkflowOrchestrationPolicy(definition.orchestrationPolicy);

    expect(validation.valid).toBe(true);
    expect(workflowOrchestrationPolicySummary(definition.orchestrationPolicy)).toMatchObject({
      workflowId: "agent_team.coding",
      complexWorkflow: true,
      requiredPhases: expect.arrayContaining([
        "mission_ledger",
        "commitment_packet_authoring",
        "work_breakdown",
        "capability_selection",
        "graph_compile",
        "node_execution",
        "closeout",
        "completion_review",
      ]),
      requiredRoleClasses: expect.arrayContaining([
        "orchestrator",
        "context",
        "implementation",
        "qa",
        "review",
        "closeout",
      ]),
    });
  });

  it("rejects complex policies that omit source prompt context or cheapest-sufficient policy", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const invalid = {
      ...definition.orchestrationPolicy,
      sourcePromptPolicy: {
        ...definition.orchestrationPolicy.sourcePromptPolicy,
        sourcePromptIndexRequired: false,
      },
      capabilityPolicy: {
        ...definition.orchestrationPolicy.capabilityPolicy,
        cheapestSufficientWorkerRequired: false,
      },
    };

    const validation = validateWorkflowOrchestrationPolicy(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_orchestration_source_prompt_index_required",
        "workflow_orchestration_cheapest_sufficient_policy_required",
      ]),
    );
  });
});
