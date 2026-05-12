import type { JsonValue } from "../runtime-job-repository.ts";

export type BrowserPromptRuntimeLinkageAuditInput = {
  promptKind: "chat" | "plan_only" | "execution" | "negation" | "conditional" | "control" | "slash";
  runtimeJobId?: string | null;
  workflowId?: string | null;
  workerContractState?: JsonValue | null;
  closeoutCapsule?: JsonValue | null;
  workQueueProjection?: JsonValue | null;
  slashBypassedModelRouting?: boolean;
  runtimeJobCreated?: boolean;
  workQueueLifecycleMutated?: boolean;
  rawPromptStored?: boolean;
  rawResponseStored?: boolean;
  rawLogsStored?: boolean;
};

export type BrowserPromptRuntimeLinkageAuditResult = {
  artifactKind: "browser_prompt_runtime_linkage_audit_result";
  promptKind: BrowserPromptRuntimeLinkageAuditInput["promptKind"];
  passed: boolean;
  runtimeJobId: string | null;
  workflowId: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function hasObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function auditBrowserPromptRuntimeLinkage(
  input: BrowserPromptRuntimeLinkageAuditInput,
): BrowserPromptRuntimeLinkageAuditResult {
  const reasonCodes: string[] = [];
  if (input.rawPromptStored || input.rawResponseStored || input.rawLogsStored) {
    reasonCodes.push("raw_storage_flag_present");
  }
  if (input.workQueueLifecycleMutated) {
    reasonCodes.push("work_queue_lifecycle_mutated");
  }
  if (input.promptKind === "chat" || input.promptKind === "plan_only") {
    if (input.runtimeJobCreated || input.runtimeJobId) {
      reasonCodes.push("non_execution_prompt_created_runtime_job");
    }
  }
  if (input.promptKind === "slash" && input.slashBypassedModelRouting !== true) {
    reasonCodes.push("slash_prompt_did_not_bypass_model_routing");
  }
  if (input.promptKind === "execution") {
    if (!input.runtimeJobId) {
      reasonCodes.push("execution_prompt_missing_runtime_job_id");
    }
    if (!input.workflowId) {
      reasonCodes.push("execution_prompt_missing_workflow_id");
    }
    if (!hasObject(input.workerContractState)) {
      reasonCodes.push("execution_prompt_missing_worker_contract_state");
    }
    if (!hasObject(input.workQueueProjection)) {
      reasonCodes.push("execution_prompt_missing_work_queue_projection");
    }
    if (!hasObject(input.closeoutCapsule)) {
      reasonCodes.push("execution_prompt_missing_closeout_capsule");
    }
  }
  if (
    (input.promptKind === "negation" ||
      input.promptKind === "conditional" ||
      input.promptKind === "control") &&
    input.workQueueLifecycleMutated
  ) {
    reasonCodes.push(`${input.promptKind}_prompt_mutated_lifecycle`);
  }
  return {
    artifactKind: "browser_prompt_runtime_linkage_audit_result",
    promptKind: input.promptKind,
    passed: reasonCodes.length === 0,
    runtimeJobId: input.runtimeJobId ?? null,
    workflowId: input.workflowId ?? null,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["browser_runtime_linkage_passed"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
