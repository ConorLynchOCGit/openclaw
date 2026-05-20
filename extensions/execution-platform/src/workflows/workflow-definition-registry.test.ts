import { describe, expect, it } from "vitest";
import {
  WorkflowDefinitionRegistry,
  listCanonicalWorkflowDefinitions,
  summarizeCanonicalWorkflowDefinitionRegistry,
} from "./workflow-definition-registry.ts";

describe("workflow definition registry", () => {
  it("contains canonical production and migration-state workflow definitions", () => {
    const summary = summarizeCanonicalWorkflowDefinitionRegistry();

    expect(summary.definitionCount).toBeGreaterThanOrEqual(6);
    expect(summary.productionReadyCount).toBeGreaterThanOrEqual(2);
    expect(summary.migrationNeededCount).toBeGreaterThanOrEqual(5);
    expect(summary.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: "agent_team.coding",
          status: "production_ready",
          productionEnabled: true,
          schedulerBacked: true,
        }),
        expect.objectContaining({
          workflowId: "agent_team.product_spec_planning",
          status: "production_ready",
          productionEnabled: true,
          schedulerBacked: true,
        }),
        expect.objectContaining({
          workflowId: "workflow.design",
          status: "registered_needs_executor_migration",
          schedulerBacked: true,
        }),
        expect.objectContaining({
          workflowId: "workflow.marketing",
          status: "registered_needs_executor_migration",
          schedulerBacked: true,
        }),
      ]),
    );
  });

  it("carries orchestration policy fields for every registered workflow", () => {
    for (const definition of listCanonicalWorkflowDefinitions()) {
      expect(definition.orchestrationPolicy.workflowId).toBe(definition.workflowId);
      expect(definition.requiredPhases).toEqual(
        expect.arrayContaining(["mission_ledger", "commitment_packet_authoring", "closeout"]),
      );
      expect(definition.requiredRoleClasses.length).toBeGreaterThan(0);
      expect(definition.contextNeeds.length).toBeGreaterThan(0);
      expect(definition.sourcePromptPolicy.sourcePromptIndexRequired).toBe(true);
      expect(definition.capabilityPolicy.expensiveBroadWorkerMonopolyBlocked).toBe(true);
    }
  });

  it("rejects duplicate definitions instead of creating a second source of truth", () => {
    const [definition] = listCanonicalWorkflowDefinitions();
    const registry = new WorkflowDefinitionRegistry([definition]);

    expect(() => registry.registerWorkflowDefinition(definition)).toThrow(
      "workflow_definition_duplicate",
    );
  });
});
