import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_RED_TEAM_PLUGIN_EXECUTOR_KEYS,
  buildArchitectureRedTeamWorkflowPlugin,
} from "./architecture-red-team-plugin.ts";
import { validateRuntimeCapabilityExecutorCoverage } from "./runtime-node-capability-registry.ts";
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

function redTeamExecutors(): Record<string, RuntimeWorkGraphNodeExecutor> {
  return Object.fromEntries(
    ARCHITECTURE_RED_TEAM_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor]),
  );
}

describe("architecture red-team workflow plugin", () => {
  it("registers as a production scheduler-backed workflow with executable coverage", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.architecture_red_team");
    const plugin = buildArchitectureRedTeamWorkflowPlugin({
      definition,
      executors: redTeamExecutors(),
    });

    expect(validateWorkflowPlugin({ plugin, definition })).toMatchObject({
      valid: true,
      pluginId: "workflow-plugin.agent_team.architecture_red_team.v1",
      missingExecutorKeys: [],
    });
    expect(workflowPluginResolutionFor({ plugin, definition })).toMatchObject({
      workflowId: "agent_team.architecture_red_team",
      productionEnabled: true,
      stagedSchedulerProtocolRequired: true,
      runtimeDerivedNodeEnvelopeRequired: true,
      degradedCloseoutSuccessAllowed: false,
    });
    expect(
      validateRuntimeCapabilityExecutorCoverage({
        workflowId: "agent_team.architecture_red_team",
        executableExecutorKeys: Object.keys(plugin.executors),
      }),
    ).toMatchObject({
      valid: true,
      reasonCodes: ["runtime_capability_executor_coverage_complete"],
    });
  });

  it("rejects production plugin success without required red-team executors", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.architecture_red_team");
    const plugin = buildArchitectureRedTeamWorkflowPlugin({
      definition,
      executors: { "kind:reviewer": executor },
    });

    const validation = validateWorkflowPlugin({ plugin, definition });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("workflow_plugin_executor_coverage_missing");
    expect(validation.missingExecutorKeys).toEqual(
      expect.arrayContaining(["kind:architecture_spec", "kind:web_research", "kind:closeout"]),
    );
  });
});
