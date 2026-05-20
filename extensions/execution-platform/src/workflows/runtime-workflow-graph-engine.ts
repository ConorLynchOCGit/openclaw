import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolFamily } from "../runtime-tool-call/runtime-tool-types.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import type { RuntimeWorkGraphNodeExecutor } from "./runtime-work-graph-scheduler.ts";
import {
  DEFAULT_WORKFLOW_DEFINITION_REGISTRY,
  type WorkflowDefinitionRegistry,
} from "./workflow-definition-registry.ts";
import {
  WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
  validateWorkflowDefinition,
  workflowDefinitionResolutionFor,
  type WorkflowDefinition,
} from "./workflow-definition.ts";
import {
  DEFAULT_WORKFLOW_PLUGIN_REGISTRY,
  type WorkflowPluginRegistry,
} from "./workflow-plugin-registry.ts";
import {
  validateWorkflowPlugin,
  workflowPluginResolutionFor,
  type WorkflowPlugin,
} from "./workflow-plugin.ts";

export const RUNTIME_WORKFLOW_GRAPH_ENGINE_ID = "runtime-workflow-graph-engine.v1";

export type RuntimeWorkflowGraphEngineReadiness = {
  artifactKind: "runtime_workflow_graph_engine_readiness";
  engineId: typeof RUNTIME_WORKFLOW_GRAPH_ENGINE_ID;
  workflowId: string;
  definitionId: string;
  pluginId: string | null;
  pluginReady: boolean;
  ready: boolean;
  reasonCodes: string[];
  missingExecutorKeys: string[];
  missingPluginExecutorKeys: string[];
  missingRuntimeToolFamilies: RuntimeToolFamily[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeWorkflowGraphEngineOptions = {
  registry?: WorkflowDefinitionRegistry;
  pluginRegistry?: WorkflowPluginRegistry;
  graphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
};

export class RuntimeWorkflowGraphEngine {
  private readonly registry: WorkflowDefinitionRegistry;
  private readonly pluginRegistry: WorkflowPluginRegistry;

  constructor(private readonly options: RuntimeWorkflowGraphEngineOptions) {
    this.registry = options.registry ?? DEFAULT_WORKFLOW_DEFINITION_REGISTRY;
    this.pluginRegistry = options.pluginRegistry ?? DEFAULT_WORKFLOW_PLUGIN_REGISTRY;
  }

  requireDefinition(workflowId: string): WorkflowDefinition {
    return this.registry.requireWorkflowDefinition(workflowId);
  }

  evaluateReadiness(input: {
    workflowId: string;
    executors: Record<string, RuntimeWorkGraphNodeExecutor>;
    plugin?: WorkflowPlugin | null;
    availableRuntimeToolFamilies?: RuntimeToolFamily[];
  }): RuntimeWorkflowGraphEngineReadiness {
    const definition = this.requireDefinition(input.workflowId);
    const plugin =
      input.plugin ??
      (this.pluginRegistry.hasWorkflowPlugin(input.workflowId)
        ? this.pluginRegistry.createWorkflowPlugin({
            workflowId: input.workflowId,
            definition,
            executors: input.executors,
          })
        : null);
    const validation = validateWorkflowDefinition(definition);
    const pluginValidation = plugin
      ? validateWorkflowPlugin({
          plugin,
          definition,
          availableRuntimeToolFamilies: input.availableRuntimeToolFamilies,
        })
      : null;
    const executorKeys = new Set(Object.keys(input.executors));
    const missingExecutorKeys =
      definition.productionEnabled && definition.schedulerBacked
        ? definition.nodeExecutorKeys.filter((key) => !executorKeys.has(key))
        : [];
    const reasonCodes = [
      ...validation.reasonCodes,
      ...(plugin ? ["workflow_plugin_resolved"] : ["workflow_plugin_missing"]),
      ...(pluginValidation?.reasonCodes ?? []),
      ...(definition.productionEnabled ? ["workflow_definition_production_enabled"] : []),
      ...(definition.schedulerBacked ? ["workflow_definition_scheduler_backed"] : []),
      ...(definition.compatibilityOnly ? ["workflow_definition_compatibility_only"] : []),
      ...(definition.productionEnabled && !this.options.runtimeToolKernel
        ? ["runtime_workflow_graph_engine_runtime_tool_kernel_missing"]
        : []),
      ...missingExecutorKeys.map((key) => `workflow_definition_executor_missing:${key}`),
    ];
    return {
      artifactKind: "runtime_workflow_graph_engine_readiness",
      engineId: RUNTIME_WORKFLOW_GRAPH_ENGINE_ID,
      workflowId: definition.workflowId,
      definitionId: definition.definitionId,
      pluginId: plugin?.pluginId ?? null,
      pluginReady: pluginValidation?.valid === true,
      ready:
        validation.valid &&
        pluginValidation?.valid === true &&
        definition.productionEnabled &&
        definition.schedulerBacked &&
        !definition.compatibilityOnly &&
        missingExecutorKeys.length === 0 &&
        Boolean(this.options.runtimeToolKernel),
      reasonCodes,
      missingExecutorKeys,
      missingPluginExecutorKeys: pluginValidation?.missingExecutorKeys ?? [],
      missingRuntimeToolFamilies: pluginValidation?.missingRuntimeToolFamilies ?? [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async ensureProductionReady(input: {
    runtimeJob: RuntimeJob;
    workflowId: string;
    executors: Record<string, RuntimeWorkGraphNodeExecutor>;
    plugin?: WorkflowPlugin | null;
  }): Promise<{
    definition: WorkflowDefinition;
    plugin: WorkflowPlugin | null;
    readiness: RuntimeWorkflowGraphEngineReadiness;
    resolutionMetadata: JsonValue;
    pluginResolutionMetadata: JsonValue | null;
  }> {
    const definition = this.requireDefinition(input.workflowId);
    const plugin =
      input.plugin ??
      (this.pluginRegistry.hasWorkflowPlugin(input.workflowId)
        ? this.pluginRegistry.createWorkflowPlugin({
            workflowId: input.workflowId,
            definition,
            executors: input.executors,
          })
        : null);
    const readiness = this.evaluateReadiness({
      workflowId: input.workflowId,
      executors: input.executors,
      plugin,
    });
    if (!readiness.ready) {
      throw new Error(`runtime_workflow_graph_engine_not_ready:${readiness.reasonCodes.join(",")}`);
    }
    const resolutionMetadata = workflowDefinitionResolutionFor(definition) as unknown as JsonValue;
    const pluginResolutionMetadata = plugin
      ? (workflowPluginResolutionFor({ plugin, definition }) as unknown as JsonValue)
      : null;
    return { definition, plugin, readiness, resolutionMetadata, pluginResolutionMetadata };
  }
}

export function workflowDefinitionResolutionArtifactType(): typeof WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE {
  return WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE;
}
