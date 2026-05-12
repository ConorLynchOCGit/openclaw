import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";

export const WORKFLOW_WORKER_CONTRACT_STATES = [
  "live",
  "shadow",
  "plan_only",
  "blocked_no_worker",
  "disabled",
] as const;

export type WorkflowWorkerContractState = (typeof WORKFLOW_WORKER_CONTRACT_STATES)[number];

export const WORKFLOW_WORKER_EXECUTOR_KINDS = [
  "acp_codex",
  "provider_research",
  "workflow_worker",
  "human_review",
  "none",
] as const;

export type WorkflowWorkerExecutorKind = (typeof WORKFLOW_WORKER_EXECUTOR_KINDS)[number];

export const workflowWorkerAdapterContractSchema = z
  .object({
    workflowId: z.string().min(3).max(120),
    workerAdapterId: z.string().min(3).max(160).nullable(),
    contractState: z.enum(WORKFLOW_WORKER_CONTRACT_STATES),
    executorKind: z.enum(WORKFLOW_WORKER_EXECUTOR_KINDS),
    supportedJobTypes: z.array(z.string().min(3).max(120)).max(20),
    requiredAuthorityProfileRefs: z.array(z.string().min(1).max(160)).max(20),
    modelRefs: z.array(z.string().min(1).max(160)).max(30),
    providerRefs: z.array(z.string().min(1).max(160)).max(30),
    ownerSystemArea: z.string().min(1).max(160),
    reasonCodes: z.array(z.string().min(1).max(160)).max(30),
    artifactRefs: z.array(z.string().min(1).max(300)).max(30),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
  })
  .strict();

export type WorkflowWorkerAdapterContract = z.infer<typeof workflowWorkerAdapterContractSchema>;

export const workflowWorkerAdapterRegistrySchema = z
  .object({
    artifactKind: z.literal("workflow_worker_adapter_registry"),
    registryVersion: z.string().min(1).max(120),
    generatedAt: z.string().datetime(),
    contracts: z.array(workflowWorkerAdapterContractSchema).min(1).max(100),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type WorkflowWorkerAdapterRegistry = z.infer<typeof workflowWorkerAdapterRegistrySchema>;

export type WorkflowWorkerAdapterRegistryValidation = {
  valid: boolean;
  reasonCodes: string[];
};

export type WorkflowWorkerExecutionReadiness = {
  accepted: boolean;
  contract: WorkflowWorkerAdapterContract | null;
  workflowId: string;
  jobType: string | null;
  contractState: WorkflowWorkerContractState | "missing";
  workerAdapterId: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export function validateWorkflowWorkerAdapterRegistry(
  registry: WorkflowWorkerAdapterRegistry,
  workflowRegistry: WorkflowRegistry = DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
): WorkflowWorkerAdapterRegistryValidation {
  const parsed = workflowWorkerAdapterRegistrySchema.safeParse(registry);
  if (!parsed.success) {
    return {
      valid: false,
      reasonCodes: parsed.error.issues.map((issue) => `registry_schema:${issue.path.join(".")}`),
    };
  }

  const reasonCodes: string[] = [];
  const knownWorkflowIds = new Set(
    workflowRegistry.workflows.map((workflow) => workflow.workflowId),
  );
  const seenWorkflowIds = new Set<string>();
  for (const contract of registry.contracts) {
    if (seenWorkflowIds.has(contract.workflowId)) {
      reasonCodes.push(`duplicate_worker_contract:${contract.workflowId}`);
    }
    seenWorkflowIds.add(contract.workflowId);
    if (!knownWorkflowIds.has(contract.workflowId)) {
      reasonCodes.push(`worker_contract_unknown_workflow:${contract.workflowId}`);
    }
    if (
      (contract.contractState === "live" || contract.contractState === "shadow") &&
      !contract.workerAdapterId
    ) {
      reasonCodes.push(`worker_contract_missing_adapter:${contract.workflowId}`);
    }
    if (
      (contract.contractState === "live" || contract.contractState === "shadow") &&
      contract.supportedJobTypes.length === 0
    ) {
      reasonCodes.push(`worker_contract_missing_job_types:${contract.workflowId}`);
    }
    if (contract.contractState === "live" && contract.executorKind === "none") {
      reasonCodes.push(`live_worker_contract_executor_none:${contract.workflowId}`);
    }
    if (contract.rawPromptStored || contract.rawResponseStored || contract.rawLogsStored) {
      reasonCodes.push(`worker_contract_raw_storage:${contract.workflowId}`);
    }
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function buildDefaultWorkflowWorkerAdapterRegistry(
  input: {
    registry?: WorkflowRegistry;
    generatedAt?: string;
    contractStateByWorkflowId?: Record<string, WorkflowWorkerContractState>;
    adapterIdByWorkflowId?: Record<string, string>;
  } = {},
): WorkflowWorkerAdapterRegistry {
  const registry = input.registry ?? DEFAULT_EXECUTION_WORKFLOW_REGISTRY;
  return {
    artifactKind: "workflow_worker_adapter_registry",
    registryVersion: "workflow-worker-adapters.v1",
    generatedAt: input.generatedAt ?? new Date("2026-05-08T00:00:00.000Z").toISOString(),
    contracts: registry.workflows.map((workflow) => {
      const state = input.contractStateByWorkflowId?.[workflow.workflowId] ?? "blocked_no_worker";
      const adapterId = input.adapterIdByWorkflowId?.[workflow.workflowId] ?? null;
      return {
        workflowId: workflow.workflowId,
        workerAdapterId: adapterId,
        contractState: state,
        executorKind:
          state === "blocked_no_worker" || state === "disabled" || state === "plan_only"
            ? "none"
            : workflow.executorKind === "single_agent"
              ? "provider_research"
              : workflow.executorKind === "team_agent"
                ? "acp_codex"
                : "workflow_worker",
        supportedJobTypes:
          state === "blocked_no_worker" || state === "disabled" ? [] : [workflow.jobType],
        requiredAuthorityProfileRefs: [`authority://${workflow.defaultAuthorityProfile}`],
        modelRefs: workflow.roles.flatMap((role) =>
          role.modelPolicyRef ? [`model-policy://${role.modelPolicyRef}`] : [],
        ),
        providerRefs: workflow.transports.map(
          (transport) => `transport://${transport.transportId}`,
        ),
        ownerSystemArea: "execution-platform",
        reasonCodes:
          state === "blocked_no_worker"
            ? ["worker_adapter_contract_not_yet_live", "runtime_worker_boundary_required"]
            : [`worker_contract_state_${state}`],
        artifactRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      };
    }),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function resolveWorkflowWorkerAdapterContract(
  registry: WorkflowWorkerAdapterRegistry,
  workflowId: string | null | undefined,
): WorkflowWorkerAdapterContract | null {
  if (!workflowId) {
    return null;
  }
  return registry.contracts.find((contract) => contract.workflowId === workflowId) ?? null;
}

export function evaluateWorkflowWorkerExecutionReadiness(input: {
  registry: WorkflowWorkerAdapterRegistry;
  workflowId: string;
  jobType?: string | null;
  allowShadow?: boolean;
}): WorkflowWorkerExecutionReadiness {
  const contract = resolveWorkflowWorkerAdapterContract(input.registry, input.workflowId);
  const common = {
    contract,
    workflowId: input.workflowId,
    jobType: input.jobType ?? null,
    workerAdapterId: contract?.workerAdapterId ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  } as const;
  if (!contract) {
    return {
      ...common,
      accepted: false,
      contractState: "missing",
      reasonCodes: ["worker_adapter_contract_missing"],
    };
  }
  if (contract.contractState === "live") {
    if (input.jobType && !contract.supportedJobTypes.includes(input.jobType)) {
      return {
        ...common,
        accepted: false,
        contractState: contract.contractState,
        reasonCodes: ["worker_adapter_job_type_not_supported", ...contract.reasonCodes].slice(
          0,
          30,
        ),
      };
    }
    return {
      ...common,
      accepted: true,
      contractState: "live",
      reasonCodes: ["worker_contract_state_live", ...contract.reasonCodes].slice(0, 30),
    };
  }
  if (contract.contractState === "shadow" && input.allowShadow !== false) {
    if (input.jobType && !contract.supportedJobTypes.includes(input.jobType)) {
      return {
        ...common,
        accepted: false,
        contractState: contract.contractState,
        reasonCodes: ["worker_adapter_job_type_not_supported", ...contract.reasonCodes].slice(
          0,
          30,
        ),
      };
    }
    return {
      ...common,
      accepted: true,
      contractState: "shadow",
      reasonCodes: ["worker_contract_state_shadow", ...contract.reasonCodes].slice(0, 30),
    };
  }
  return {
    ...common,
    accepted: false,
    contractState: contract.contractState,
    reasonCodes: [
      `worker_contract_state_${contract.contractState}_blocks_enqueue`,
      ...contract.reasonCodes,
    ].slice(0, 30),
  };
}

export function summarizeWorkflowWorkerExecutionReadiness(
  readiness: WorkflowWorkerExecutionReadiness,
): JsonValue {
  return {
    artifactKind: "workflow_worker_execution_readiness_summary",
    accepted: readiness.accepted,
    workflowId: readiness.workflowId,
    jobType: readiness.jobType,
    contractState: readiness.contractState,
    workerAdapterId: readiness.workerAdapterId,
    reasonCodes: readiness.reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
