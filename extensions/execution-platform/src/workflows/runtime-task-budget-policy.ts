import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolBudget } from "../runtime-tool-call/runtime-tool-types.ts";
import type { RuntimeNodeCapability } from "./runtime-node-capability-registry.ts";
import type { TeamGraphNodeKind } from "./runtime-work-graph.ts";

export const RUNTIME_TASK_BUDGET_POLICY_SCHEMA_REF =
  "execution-platform.runtime-task-budget-policy.v1";

export type RuntimeTaskBudgetClass = "tiny" | "standard" | "complex" | "long_running";

export type RuntimeTaskBudgetPolicy = {
  artifactKind: "runtime_task_budget_policy";
  schemaRef: typeof RUNTIME_TASK_BUDGET_POLICY_SCHEMA_REF;
  policyRef: string;
  budgetClass: RuntimeTaskBudgetClass;
  workflowId: string | null;
  capabilityId: string | null;
  nodeKind: TeamGraphNodeKind | string | null;
  roleId: string | null;
  runtimeJobRunTimeoutMs: number;
  leaseTimeoutMs: number;
  leaseHeartbeatMs: number;
  runtimeToolTimeoutMs: number;
  modelCallTimeoutMs: number;
  workerLoopTurnTimeoutMs: number;
  validationCommandTimeoutMs: number;
  progressEmissionIntervalMs: number;
  staleProgressAfterMs: number;
  abortGraceMs: number;
  maxOutputTokens: number | null;
  maxCostUsd: number | null;
  retryLimit: number;
  maxRepairAttempts: number;
  maxContinuationTurns: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type RuntimeTaskBudgetPolicyInput = {
  workflowId?: string | null;
  nodeKind?: TeamGraphNodeKind | string | null;
  roleId?: string | null;
  capability?: RuntimeNodeCapability | null;
  missionCommitmentCount?: number | null;
  expectedLongRunning?: boolean | null;
};

const MIN_LONG_TASK_TIMEOUT_MS = 15 * 60_000;
const PRODUCT_SPEC_TIMEOUT_MS = 45 * 60_000;
const COMPLEX_TIMEOUT_MS = 30 * 60_000;
const STANDARD_TIMEOUT_MS = 15 * 60_000;
const TINY_TIMEOUT_MS = 5 * 60_000;

function isProductSpecWorkflow(workflowId: string | null | undefined): boolean {
  return workflowId === "agent_team.product_spec_planning";
}

function budgetClassFor(input: RuntimeTaskBudgetPolicyInput): RuntimeTaskBudgetClass {
  if (input.expectedLongRunning === true || isProductSpecWorkflow(input.workflowId)) {
    return "long_running";
  }
  if (
    (input.missionCommitmentCount ?? 0) > 1 ||
    input.capability?.costClass === "premium" ||
    input.nodeKind === "implementation" ||
    input.nodeKind === "repair"
  ) {
    return "complex";
  }
  if (input.capability?.preferredTaskSize === "micro" || input.capability?.costClass === "cheap") {
    return "standard";
  }
  return "tiny";
}

function timeoutForBudgetClass(budgetClass: RuntimeTaskBudgetClass): number {
  switch (budgetClass) {
    case "long_running":
      return PRODUCT_SPEC_TIMEOUT_MS;
    case "complex":
      return COMPLEX_TIMEOUT_MS;
    case "standard":
      return STANDARD_TIMEOUT_MS;
    case "tiny":
      return TINY_TIMEOUT_MS;
  }
  return TINY_TIMEOUT_MS;
}

export function deriveRuntimeTaskBudgetPolicy(
  input: RuntimeTaskBudgetPolicyInput,
): RuntimeTaskBudgetPolicy {
  const budgetClass = budgetClassFor(input);
  const baseTimeoutMs = timeoutForBudgetClass(budgetClass);
  const capabilityTimeoutMs = input.capability?.defaultBudgetPolicy.timeoutMs ?? null;
  const runtimeToolTimeoutMs =
    budgetClass === "long_running"
      ? Math.max(baseTimeoutMs, capabilityTimeoutMs ?? 0, MIN_LONG_TASK_TIMEOUT_MS)
      : Math.max(baseTimeoutMs, capabilityTimeoutMs ?? 0);
  const leaseTimeoutMs =
    budgetClass === "long_running" ? 5 * 60_000 : budgetClass === "complex" ? 3 * 60_000 : 90_000;
  const progressEmissionIntervalMs =
    budgetClass === "long_running" ? 15_000 : budgetClass === "complex" ? 10_000 : 5_000;
  const capabilityId = input.capability?.capabilityId ?? null;
  const workflowId = input.workflowId ?? input.capability?.workflowId ?? null;
  const nodeKind = input.nodeKind ?? input.capability?.graphNodeKind ?? null;
  const roleId = input.roleId ?? input.capability?.roleId ?? null;
  const policyRef = `runtime-task-budget://${workflowId ?? "unknown-workflow"}/${capabilityId ?? "unknown-capability"}/${budgetClass}`;

  return {
    artifactKind: "runtime_task_budget_policy",
    schemaRef: RUNTIME_TASK_BUDGET_POLICY_SCHEMA_REF,
    policyRef,
    budgetClass,
    workflowId,
    capabilityId,
    nodeKind,
    roleId,
    runtimeJobRunTimeoutMs: runtimeToolTimeoutMs + 10 * 60_000,
    leaseTimeoutMs,
    leaseHeartbeatMs: Math.max(15_000, Math.floor(leaseTimeoutMs / 3)),
    runtimeToolTimeoutMs,
    modelCallTimeoutMs: runtimeToolTimeoutMs,
    workerLoopTurnTimeoutMs:
      budgetClass === "long_running" ? 20 * 60_000 : Math.max(5 * 60_000, runtimeToolTimeoutMs),
    validationCommandTimeoutMs:
      budgetClass === "long_running" ? 20 * 60_000 : Math.max(5 * 60_000, runtimeToolTimeoutMs),
    progressEmissionIntervalMs,
    staleProgressAfterMs: progressEmissionIntervalMs * 8,
    abortGraceMs: 30_000,
    maxOutputTokens:
      input.capability?.defaultBudgetPolicy.maxOutputTokens ??
      (budgetClass === "long_running" ? 32_000 : 16_000),
    maxCostUsd:
      input.capability?.defaultBudgetPolicy.maxCostUsd ??
      (budgetClass === "long_running" ? 3 : budgetClass === "complex" ? 1 : 0.25),
    retryLimit: input.capability?.defaultBudgetPolicy.retryLimit ?? 0,
    maxRepairAttempts: budgetClass === "long_running" || budgetClass === "complex" ? 2 : 1,
    maxContinuationTurns: budgetClass === "long_running" ? 8 : budgetClass === "complex" ? 4 : 2,
    reasonCodes: [
      "runtime_task_budget_policy_derived",
      `runtime_task_budget_class:${budgetClass}`,
      ...(budgetClass === "long_running" ? ["long_task_timeout_exceeds_two_minutes"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function runtimeToolBudgetFromPolicy(policy: RuntimeTaskBudgetPolicy): RuntimeToolBudget {
  return {
    budgetRef: policy.policyRef,
    timeoutMs: policy.runtimeToolTimeoutMs,
    maxOutputTokens: policy.maxOutputTokens,
    maxCostUsd: policy.maxCostUsd,
    metadata: {
      schemaRef: policy.schemaRef,
      budgetClass: policy.budgetClass,
      workflowId: policy.workflowId,
      capabilityId: policy.capabilityId,
      nodeKind: policy.nodeKind,
      roleId: policy.roleId,
      runtimeJobRunTimeoutMs: policy.runtimeJobRunTimeoutMs,
      leaseTimeoutMs: policy.leaseTimeoutMs,
      leaseHeartbeatMs: policy.leaseHeartbeatMs,
      modelCallTimeoutMs: policy.modelCallTimeoutMs,
      workerLoopTurnTimeoutMs: policy.workerLoopTurnTimeoutMs,
      validationCommandTimeoutMs: policy.validationCommandTimeoutMs,
      progressEmissionIntervalMs: policy.progressEmissionIntervalMs,
      staleProgressAfterMs: policy.staleProgressAfterMs,
      abortGraceMs: policy.abortGraceMs,
      retryLimit: policy.retryLimit,
      maxRepairAttempts: policy.maxRepairAttempts,
      maxContinuationTurns: policy.maxContinuationTurns,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
}

export function summarizeRuntimeTaskBudgetPolicy(policy: RuntimeTaskBudgetPolicy): JsonValue {
  return {
    artifactKind: policy.artifactKind,
    schemaRef: policy.schemaRef,
    policyRef: policy.policyRef,
    budgetClass: policy.budgetClass,
    workflowId: policy.workflowId,
    capabilityId: policy.capabilityId,
    nodeKind: policy.nodeKind,
    roleId: policy.roleId,
    runtimeJobRunTimeoutMs: policy.runtimeJobRunTimeoutMs,
    leaseTimeoutMs: policy.leaseTimeoutMs,
    leaseHeartbeatMs: policy.leaseHeartbeatMs,
    runtimeToolTimeoutMs: policy.runtimeToolTimeoutMs,
    modelCallTimeoutMs: policy.modelCallTimeoutMs,
    workerLoopTurnTimeoutMs: policy.workerLoopTurnTimeoutMs,
    validationCommandTimeoutMs: policy.validationCommandTimeoutMs,
    progressEmissionIntervalMs: policy.progressEmissionIntervalMs,
    staleProgressAfterMs: policy.staleProgressAfterMs,
    abortGraceMs: policy.abortGraceMs,
    maxOutputTokens: policy.maxOutputTokens,
    maxCostUsd: policy.maxCostUsd,
    retryLimit: policy.retryLimit,
    maxRepairAttempts: policy.maxRepairAttempts,
    maxContinuationTurns: policy.maxContinuationTurns,
    reasonCodes: policy.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function validateRuntimeTaskBudgetPolicy(policy: RuntimeTaskBudgetPolicy): string[] {
  const reasonCodes: string[] = [];
  if (policy.rawPromptStored || policy.rawResponseStored) {
    reasonCodes.push("runtime_task_budget_raw_prompt_or_response_flag_invalid");
  }
  if (policy.rawProviderLogStored || policy.rawToolLogStored) {
    reasonCodes.push("runtime_task_budget_raw_log_flag_invalid");
  }
  if (policy.runtimeToolTimeoutMs <= 120_000 && policy.budgetClass === "long_running") {
    reasonCodes.push("long_running_runtime_tool_timeout_too_short");
  }
  if (policy.progressEmissionIntervalMs <= 0 || policy.staleProgressAfterMs <= 0) {
    reasonCodes.push("runtime_task_budget_progress_window_invalid");
  }
  if (policy.staleProgressAfterMs < policy.progressEmissionIntervalMs * 2) {
    reasonCodes.push("runtime_task_budget_stale_window_too_short");
  }
  if (policy.leaseTimeoutMs <= policy.leaseHeartbeatMs) {
    reasonCodes.push("runtime_task_budget_lease_timeout_not_above_heartbeat");
  }
  return reasonCodes;
}
