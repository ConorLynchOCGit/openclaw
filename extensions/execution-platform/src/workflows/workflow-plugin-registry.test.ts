import { describe, expect, it } from "vitest";
import { ARCHITECTURE_RED_TEAM_WORKFLOW_PLUGIN_ID } from "./architecture-red-team-plugin.ts";
import { PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID } from "./product-spec-planning-plugin.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
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
      pluginCount: 3,
      workflowIds: [
        "agent_team.architecture_red_team",
        "agent_team.coding",
        "agent_team.product_spec_planning",
      ],
      productionWorkflowIds: [
        "agent_team.architecture_red_team",
        "agent_team.coding",
        "agent_team.product_spec_planning",
      ],
    });
  });

  it("creates the canonical Product/Spec Planning workflow plugin", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.product_spec_planning");
    const plugin = DEFAULT_WORKFLOW_PLUGIN_REGISTRY.createWorkflowPlugin({
      workflowId: "agent_team.product_spec_planning",
      definition,
      executors: {
        "role:orchestrator": executor,
        "role:planning_orchestrator": executor,
        "kind:orchestrator_plan": executor,
        "kind:web_research": executor,
        "kind:planning_capsule": executor,
        "kind:human_task": executor,
        "kind:action_graph_compile": executor,
        "kind:compiler": executor,
        "kind:closeout": executor,
      },
    });

    expect(plugin.pluginId).toBe(PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID);
    expect(plugin.workflowId).toBe("agent_team.product_spec_planning");
    expect(plugin.productionEnabled).toBe(true);
    expect(plugin.schedulerPolicy.degradedCloseoutSuccessAllowed).toBe(false);
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
