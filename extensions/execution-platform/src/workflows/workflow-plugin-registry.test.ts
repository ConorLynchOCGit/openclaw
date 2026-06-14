import { describe, expect, it } from "vitest";
import { ARCHITECTURE_RED_TEAM_WORKFLOW_PLUGIN_ID } from "./architecture-red-team-plugin.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./workflow-node-execution-contracts.ts";
import {
  DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
  WorkflowPluginRegistry,
} from "./workflow-plugin-registry.ts";

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

describe("workflow plugin registry", () => {
  it("creates the canonical coding workflow plugin", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const plugin = DEFAULT_WORKFLOW_PLUGIN_REGISTRY.createWorkflowPlugin({
      workflowId: "agent_team.coding",
      definition,
      executors: {
        "kind:implementation": executor,
      },
    });

    expect(plugin.pluginId).toBe("workflow-plugin.agent_team.coding.v1");
    expect(DEFAULT_WORKFLOW_PLUGIN_REGISTRY.summarize()).toMatchObject({
      pluginCount: 2,
      workflowIds: ["agent_team.architecture_red_team", "agent_team.coding"],
      productionWorkflowIds: ["agent_team.architecture_red_team", "agent_team.coding"],
    });
  });

  it("creates the canonical architecture red-team workflow plugin", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.architecture_red_team");
    const plugin = DEFAULT_WORKFLOW_PLUGIN_REGISTRY.createWorkflowPlugin({
      workflowId: "agent_team.architecture_red_team",
      definition,
      executors: {
        "kind:architecture_spec": executor,
        "kind:reviewer": executor,
        "kind:planning_capsule": executor,
        "kind:web_research": executor,
        "kind:observability_readback": executor,
        "kind:action_graph_compile": executor,
        "kind:closeout": executor,
      },
    });

    expect(plugin.pluginId).toBe(ARCHITECTURE_RED_TEAM_WORKFLOW_PLUGIN_ID);
    expect(plugin.workflowId).toBe("agent_team.architecture_red_team");
    expect(plugin.productionEnabled).toBe(true);
    expect(plugin.schedulerPolicy.directImplementationFirstMovePolicy).toBe("never");
  });

  it("rejects duplicate plugin factories", () => {
    const registry = new WorkflowPluginRegistry();

    expect(() =>
      registry.registerWorkflowPluginFactory("agent_team.coding", () => {
        throw new Error("unused");
      }),
    ).toThrow("workflow_plugin_registry_duplicate:agent_team.coding");
  });
});
