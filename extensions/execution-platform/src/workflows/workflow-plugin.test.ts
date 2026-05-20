import { describe, expect, it } from "vitest";
import { buildAgentTeamCodingWorkflowPlugin } from "./agent-team-coding-plugin.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import { validateWorkflowPlugin, workflowPluginResolutionFor } from "./workflow-plugin.ts";

const executor: RuntimeWorkGraphNodeExecutor = {
  execute: async () => ({
    status: "succeeded",
    outputArtifactRefs: [],
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  }),
};

function codingExecutors(): Record<string, RuntimeWorkGraphNodeExecutor> {
  return {
    "kind:context_scout": executor,
    "kind:implementation": executor,
    "kind:validation": executor,
    "kind:test_review": executor,
    "kind:repair": executor,
    "kind:reviewer": executor,
    "kind:observability_readback": executor,
    "kind:human_task": executor,
    "kind:closeout": executor,
    "role:context_scout": executor,
    "role:implementation_engineer": executor,
    "role:test_engineer": executor,
    "role:reviewer": executor,
    "role:observability_scribe": executor,
  };
}

describe("workflow plugin contract", () => {
  it("validates the production coding plugin and emits bounded resolution metadata", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const plugin = buildAgentTeamCodingWorkflowPlugin({
      definition,
      executors: codingExecutors(),
    });

    expect(validateWorkflowPlugin({ plugin, definition })).toMatchObject({
      valid: true,
      pluginId: "workflow-plugin.agent_team.coding.v1",
      missingExecutorKeys: [],
    });
    expect(workflowPluginResolutionFor({ plugin, definition })).toMatchObject({
      pluginId: "workflow-plugin.agent_team.coding.v1",
      workflowId: "agent_team.coding",
      status: "production_ready",
      productionEnabled: true,
      orchestrationPolicyRef: "workflow-orchestration-policy://agent_team.coding.orchestration.v1",
      requiredRoleClasses: expect.arrayContaining(["context", "implementation", "qa"]),
      completionReviewRequired: true,
      degradedCloseoutSuccessAllowed: false,
    });
  });

  it("rejects missing executor coverage and raw-storage claims", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const plugin = {
      ...buildAgentTeamCodingWorkflowPlugin({
        definition,
        executors: { "kind:implementation": executor },
      }),
      rawLogsStored: true as false,
    };

    const validation = validateWorkflowPlugin({ plugin, definition });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_plugin_raw_storage_rejected",
        "workflow_plugin_executor_coverage_missing",
      ]),
    );
    expect(validation.missingExecutorKeys).toEqual(
      expect.arrayContaining(["kind:context_scout", "kind:closeout", "role:reviewer"]),
    );
  });

  it("rejects plugin and definition mismatches", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const plugin = {
      ...buildAgentTeamCodingWorkflowPlugin({
        definition,
        executors: codingExecutors(),
      }),
      workflowId: "workflow.docs_skills",
      orchestrationPolicyRef:
        "workflow-orchestration-policy://workflow.docs_skills.orchestration.v1",
    };

    const validation = validateWorkflowPlugin({ plugin, definition });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_plugin_definition_workflow_mismatch",
        "workflow_plugin_orchestration_policy_mismatch",
      ]),
    );
  });
});
