import { agentTeamCodingWorkflowContract } from "./agent-team-coding-workflow.ts";
import { architectureWorkflowContract } from "./architecture-workflow.ts";
import { docsSkillsWorkflowContract } from "./docs-skills-workflow.ts";
import { productSpecPlanningWorkflowContract } from "./product-spec-planning-workflow.ts";
import { qaTestWorkflowContract } from "./qa-test-workflow.ts";
import { skillifierRuntimeWorkflowContract } from "./skillifier-runtime-workflow.ts";
import { webResearchWorkflowContract } from "./web-research-workflow.ts";
import {
  createWorkflowContractRouterSummary,
  validateExecutionWorkflowContract,
  type ExecutionWorkflowContract,
} from "./workflow-contract.ts";

export type WorkflowRegistry = {
  artifactKind: "execution_workflow_registry";
  workflows: ExecutionWorkflowContract[];
};

export type WorkflowRegistryValidation = {
  valid: boolean;
  reasonCodes: string[];
};

export const DEFAULT_EXECUTION_WORKFLOW_REGISTRY: WorkflowRegistry = {
  artifactKind: "execution_workflow_registry",
  workflows: [
    agentTeamCodingWorkflowContract,
    webResearchWorkflowContract,
    architectureWorkflowContract,
    docsSkillsWorkflowContract,
    qaTestWorkflowContract,
    skillifierRuntimeWorkflowContract,
    productSpecPlanningWorkflowContract,
  ],
};

export function validateWorkflowRegistry(registry: WorkflowRegistry): WorkflowRegistryValidation {
  const reasonCodes: string[] = [];
  const ids = new Set<string>();
  for (const workflow of registry.workflows) {
    if (ids.has(workflow.workflowId)) {
      reasonCodes.push(`duplicate_workflow_id:${workflow.workflowId}`);
    }
    ids.add(workflow.workflowId);
    const validation = validateExecutionWorkflowContract(workflow);
    reasonCodes.push(...validation.reasonCodes.map((reason) => `${workflow.workflowId}:${reason}`));
    if (workflow.workQueueProjection.lifecycleMutationAllowed) {
      reasonCodes.push(`${workflow.workflowId}:work_queue_lifecycle_mutation_allowed`);
    }
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function getWorkflowContract(
  registry: WorkflowRegistry,
  workflowId: string | null | undefined,
): ExecutionWorkflowContract | null {
  if (!workflowId) {
    return null;
  }
  return registry.workflows.find((workflow) => workflow.workflowId === workflowId) ?? null;
}

export function requireWorkflowContract(
  registry: WorkflowRegistry,
  workflowId: string,
): ExecutionWorkflowContract {
  const workflow = getWorkflowContract(registry, workflowId);
  if (!workflow) {
    throw new Error(`workflow not registered: ${workflowId}`);
  }
  return workflow;
}

export function listWorkflowRouterSummaries(registry: WorkflowRegistry) {
  return registry.workflows.map(createWorkflowContractRouterSummary);
}

export function workflowCanRouteToLiveExecution(workflow: ExecutionWorkflowContract): boolean {
  return workflow.status === "enabled";
}
