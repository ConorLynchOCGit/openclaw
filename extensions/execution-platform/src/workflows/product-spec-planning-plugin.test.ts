import { describe, expect, it } from "vitest";
import {
  PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS,
  PRODUCT_SPEC_PLANNING_PLUGIN_RUNTIME_TOOL_FAMILIES,
  PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID,
  buildProductSpecPlanningWorkflowPlugin,
} from "./product-spec-planning-plugin.ts";
import { validateRuntimeCapabilityExecutorCoverage } from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import { RuntimeWorkflowGraphEngine } from "./runtime-workflow-graph-engine.ts";
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

function productSpecExecutors(): Record<string, RuntimeWorkGraphNodeExecutor> {
  return Object.fromEntries(
    PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor]),
  );
}

describe("agent_team.product_spec_planning workflow plugin", () => {
  it("is production scheduler-backed and resolves executable planning capabilities", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.product_spec_planning");
    const executors = productSpecExecutors();
    const plugin = buildProductSpecPlanningWorkflowPlugin({ definition, executors });
    const pluginValidation = validateWorkflowPlugin({ plugin, definition });
    const capabilityCoverage = validateRuntimeCapabilityExecutorCoverage({
      workflowId: "agent_team.product_spec_planning",
      executableExecutorKeys: PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.slice(),
    });

    expect(definition).toMatchObject({
      status: "production_ready",
      productionEnabled: true,
      schedulerBacked: true,
      compatibilityOnly: false,
    });
    expect(plugin).toMatchObject({
      pluginId: PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID,
      workflowId: "agent_team.product_spec_planning",
      status: "production_ready",
      productionEnabled: true,
    });
    expect(plugin.schedulerPolicy).toMatchObject({
      requireMissionLedgerForExecutionWorkflow: true,
      requireCostAwareCapabilityPolicy: true,
      requireEvidenceClaimsForMissionLedger: true,
      requireSchedulerToolKernel: true,
      stagedSchedulerProtocolRequired: true,
      stagedGraphAcceptanceRequired: true,
      modelAuthoredWorkPacketsRequiredForComplexMission: true,
      runtimeDerivedNodeEnvelopeRequired: true,
      runtimeDerivedExpectedEvidenceRequired: true,
      modelAuthoredStructureReviewRequired: true,
      firstNodeApprovalRequired: true,
      directImplementationFirstMovePolicy: "simple_only",
      broadImplementationFirstMoveAllowed: false,
      degradedCloseoutSuccessAllowed: false,
    });
    expect(plugin.runtimeToolFamilies).toEqual(
      expect.arrayContaining(PRODUCT_SPEC_PLANNING_PLUGIN_RUNTIME_TOOL_FAMILIES),
    );
    expect(plugin.nodeExecutorKeys).toEqual(
      expect.arrayContaining([
        "role:orchestrator",
        "kind:web_research",
        "kind:planning_capsule",
        "kind:human_task",
        "kind:action_graph_compile",
        "kind:compiler",
        "kind:closeout",
      ]),
    );
    expect(plugin.schedulerOptions.capabilityRegistrySummary).toMatchObject({
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(pluginValidation).toMatchObject({
      valid: true,
      missingExecutorKeys: [],
    });
    expect(capabilityCoverage).toMatchObject({
      valid: true,
      missingCapabilityIds: [],
      missingExecutorKeys: [],
      reasonCodes: ["runtime_capability_executor_coverage_complete"],
    });
    expect(workflowPluginResolutionFor({ plugin, definition })).toMatchObject({
      workflowId: "agent_team.product_spec_planning",
      status: "production_ready",
      productionEnabled: true,
      stagedSchedulerProtocolRequired: true,
      runtimeDerivedNodeEnvelopeRequired: true,
      firstNodeApprovalRequired: true,
      degradedCloseoutSuccessAllowed: false,
    });
  });

  it("is accepted by the runtime workflow graph engine only with executor coverage and tool kernel", () => {
    const engine = new RuntimeWorkflowGraphEngine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = engine.evaluateReadiness({
      workflowId: "agent_team.product_spec_planning",
      executors: productSpecExecutors(),
    });

    expect(readiness).toMatchObject({
      ready: true,
      workflowId: "agent_team.product_spec_planning",
      pluginId: PRODUCT_SPEC_PLANNING_WORKFLOW_PLUGIN_ID,
      pluginReady: true,
      missingExecutorKeys: [],
      missingPluginExecutorKeys: [],
    });
    expect(readiness.reasonCodes).toEqual(
      expect.arrayContaining([
        "workflow_definition_production_enabled",
        "workflow_definition_scheduler_backed",
        "workflow_plugin_resolved",
      ]),
    );
  });

  it("rejects production readiness when a planning executor key is missing", () => {
    const engine = new RuntimeWorkflowGraphEngine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = engine.evaluateReadiness({
      workflowId: "agent_team.product_spec_planning",
      executors: {
        "role:orchestrator": executor,
        "kind:web_research": executor,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.reasonCodes).toContain("workflow_plugin_executor_coverage_missing");
    expect(readiness.missingExecutorKeys).toEqual(
      expect.arrayContaining(["kind:planning_capsule", "kind:closeout"]),
    );
    expect(readiness.missingPluginExecutorKeys).toEqual(
      expect.arrayContaining(["kind:planning_capsule", "kind:closeout"]),
    );
  });
});
