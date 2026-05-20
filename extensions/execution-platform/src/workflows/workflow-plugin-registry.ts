import type { JsonValue } from "../runtime-job-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "./agent-team-coding-plugin.ts";
import { buildArchitectureRedTeamWorkflowPlugin } from "./architecture-red-team-plugin.ts";
import { buildProductSpecPlanningWorkflowPlugin } from "./product-spec-planning-plugin.ts";
import type { RuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type { WorkflowPlugin } from "./workflow-plugin.ts";

export type WorkflowPluginFactoryInput = {
  workflowId: string;
  definition: WorkflowDefinition;
  executors: Record<string, RuntimeWorkGraphNodeExecutor>;
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  requireSchedulerToolKernel?: boolean;
};

export type WorkflowPluginFactory = (input: WorkflowPluginFactoryInput) => WorkflowPlugin;

export type WorkflowPluginRegistrySummary = {
  artifactKind: "workflow_plugin_registry_summary";
  pluginCount: number;
  workflowIds: string[];
  productionWorkflowIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export class WorkflowPluginRegistry {
  private readonly factories = new Map<string, WorkflowPluginFactory>();

  constructor(
    factories: Array<[string, WorkflowPluginFactory]> = defaultWorkflowPluginFactories(),
  ) {
    for (const [workflowId, factory] of factories) {
      this.registerWorkflowPluginFactory(workflowId, factory);
    }
  }

  registerWorkflowPluginFactory(workflowId: string, factory: WorkflowPluginFactory): void {
    if (!workflowId.trim()) {
      throw new Error("workflow_plugin_registry_workflow_id_missing");
    }
    if (this.factories.has(workflowId)) {
      throw new Error(`workflow_plugin_registry_duplicate:${workflowId}`);
    }
    this.factories.set(workflowId, factory);
  }

  hasWorkflowPlugin(workflowId: string): boolean {
    return this.factories.has(workflowId);
  }

  createWorkflowPlugin(input: WorkflowPluginFactoryInput): WorkflowPlugin {
    const factory = this.factories.get(input.workflowId);
    if (!factory) {
      throw new Error(`workflow_plugin_missing:${input.workflowId}`);
    }
    return factory(input);
  }

  summarize(): WorkflowPluginRegistrySummary {
    const workflowIds = [...this.factories.keys()].toSorted();
    const productionWorkflowIds = workflowIds.filter((workflowId) =>
      [
        "agent_team.architecture_red_team",
        "agent_team.coding",
        "agent_team.product_spec_planning",
      ].includes(workflowId),
    );
    return {
      artifactKind: "workflow_plugin_registry_summary",
      pluginCount: workflowIds.length,
      workflowIds,
      productionWorkflowIds,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
}

export function defaultWorkflowPluginFactories(): Array<[string, WorkflowPluginFactory]> {
  return [
    ["agent_team.architecture_red_team", buildArchitectureRedTeamWorkflowPlugin],
    ["agent_team.coding", buildAgentTeamCodingWorkflowPlugin],
    ["agent_team.product_spec_planning", buildProductSpecPlanningWorkflowPlugin],
  ];
}

export const DEFAULT_WORKFLOW_PLUGIN_REGISTRY = new WorkflowPluginRegistry();

export function workflowPluginRegistrySummaryMetadata(
  summary: WorkflowPluginRegistrySummary,
): JsonValue {
  return summary as unknown as JsonValue;
}
