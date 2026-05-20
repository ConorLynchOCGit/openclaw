import { describe, expect, it } from "vitest";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import {
  validateWorkflowDefinition,
  workflowDefinitionResolutionFor,
  type WorkflowDefinition,
} from "./workflow-definition.ts";

describe("workflow definitions", () => {
  it("accepts the canonical coding workflow as production scheduler-backed", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");

    expect(validateWorkflowDefinition(definition)).toMatchObject({
      valid: true,
      readinessStatus: "production_ready",
    });
    expect(workflowDefinitionResolutionFor(definition)).toMatchObject({
      workflowId: "agent_team.coding",
      productionEnabled: true,
      schedulerBacked: true,
      compatibilityOnly: false,
      orchestrationPolicyRef: "workflow-orchestration-policy://agent_team.coding.orchestration.v1",
      requiredRoleClasses: expect.arrayContaining(["implementation", "qa", "review"]),
      completionReviewRequired: true,
    });
  });

  it("accepts the canonical architecture red-team workflow as production scheduler-backed", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.architecture_red_team");

    expect(validateWorkflowDefinition(definition)).toMatchObject({
      valid: true,
      readinessStatus: "production_ready",
    });
    expect(workflowDefinitionResolutionFor(definition)).toMatchObject({
      workflowId: "agent_team.architecture_red_team",
      productionEnabled: true,
      schedulerBacked: true,
      compatibilityOnly: false,
      requiredRoleClasses: expect.arrayContaining(["architecture", "research", "review"]),
      completionReviewRequired: true,
    });
  });

  it("rejects production definitions that can succeed through compatibility or raw storage", () => {
    const base = requireCanonicalWorkflowDefinition("agent_team.coding");
    const invalid: WorkflowDefinition = {
      ...base,
      definitionId: "workflow-definition.invalid.v1",
      workflowId: "workflow.invalid",
      compatibilityOnly: true,
      rawPromptStored: true as false,
    };

    const validation = validateWorkflowDefinition(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_definition_raw_storage_rejected",
        "workflow_definition_production_cannot_be_compatibility_only",
      ]),
    );
  });

  it("requires production definitions to include scheduler, evidence, closeout, and completion review policies", () => {
    const base = requireCanonicalWorkflowDefinition("agent_team.coding");
    const invalid: WorkflowDefinition = {
      ...base,
      definitionId: "workflow-definition.missing-policy.v1",
      workflowId: "workflow.missing_policy",
      schedulerBacked: false,
      evidenceProfileId: "",
      requiredPhases: [],
      requiredRoleClasses: [],
      allowedCapabilityIds: [],
      nodeExecutorKeys: [],
      completionReviewPolicy: {
        ...base.completionReviewPolicy,
        required: false,
        deepCompletionQuestion: "",
      },
    };

    const validation = validateWorkflowDefinition(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_definition_production_requires_scheduler_backed_engine",
        "workflow_definition_evidence_profile_missing",
        "workflow_definition_required_phases_missing",
        "workflow_definition_required_role_classes_missing",
        "workflow_definition_allowed_capabilities_missing",
        "workflow_definition_node_executor_keys_missing",
        "workflow_definition_completion_review_policy_missing",
      ]),
    );
  });
});
