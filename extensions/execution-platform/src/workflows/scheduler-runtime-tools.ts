import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolKernel,
  RuntimeToolKernelInvokeResult,
} from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolAuthorityClass,
  RuntimeToolExecutor,
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";

export const SCHEDULER_RUNTIME_TOOL_IDS = [
  "scheduler.decompose_mission",
  "scheduler.create_graph_node",
  "scheduler.create_graph_edge",
  "scheduler.accept_decomposition_graph",
  "scheduler.reject_decomposition_graph",
  "scheduler.select_next_node",
  "scheduler.request_human_decision",
  "scheduler.mark_needs_review",
  "scheduler.create_closeout_request",
  "worker.invoke",
  "worker.context.request_more",
  "worker.context.provide_bounded_snapshot",
  "worker.context.deny_request",
  "worker.repo.search",
  "worker.repo.read_files",
  "worker.repo.inspect_tests",
  "worker.edit.plan",
  "worker.edit.apply_patch",
  "worker.validation.explain_failure",
  "worker.evidence.claim",
  "worker.escalate",
  "worker.file_context.inspect",
  "worker.file_edit.plan",
  "worker.file_edit.propose_patch",
  "worker.file_edit.apply_patch",
  "worker.validation.run",
  "worker.validation.classify_failure",
  "worker.file_edit.repair",
  "worker.file_edit.escalate",
  "worker.evidence.handoff",
] as const;

export type SchedulerRuntimeToolId = (typeof SCHEDULER_RUNTIME_TOOL_IDS)[number];

export type SchedulerRuntimeToolInvocationSummary = {
  toolId: SchedulerRuntimeToolId;
  invocationRef: string;
  status: RuntimeToolStatus;
  outputRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const SCHEDULER_TOOL_FAMILIES: Record<
  SchedulerRuntimeToolId,
  { family: RuntimeToolFamily; authorityClass: RuntimeToolAuthorityClass; schemaRef: string }
> = {
  "scheduler.decompose_mission": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/decompose-mission/v1",
  },
  "scheduler.create_graph_node": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-graph-node/v1",
  },
  "scheduler.create_graph_edge": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-graph-edge/v1",
  },
  "scheduler.accept_decomposition_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-decomposition-graph/v1",
  },
  "scheduler.reject_decomposition_graph": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/reject-decomposition-graph/v1",
  },
  "scheduler.select_next_node": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/select-next-node/v1",
  },
  "scheduler.request_human_decision": {
    family: "human_task.request",
    authorityClass: "human_operator",
    schemaRef: "runtime-tool://scheduler/request-human-decision/v1",
  },
  "scheduler.mark_needs_review": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/mark-needs-review/v1",
  },
  "scheduler.create_closeout_request": {
    family: "closeout.generate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-closeout-request/v1",
  },
  "worker.invoke": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/invoke/v1",
  },
  "worker.context.request_more": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/request-more/v1",
  },
  "worker.context.provide_bounded_snapshot": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/provide-bounded-snapshot/v1",
  },
  "worker.context.deny_request": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/deny-request/v1",
  },
  "worker.repo.search": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/search/v1",
  },
  "worker.repo.read_files": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/read-files/v1",
  },
  "worker.repo.inspect_tests": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/inspect-tests/v1",
  },
  "worker.edit.plan": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/edit/plan/v1",
  },
  "worker.edit.apply_patch": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/edit/apply-patch/v1",
  },
  "worker.validation.explain_failure": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/explain-failure/v1",
  },
  "worker.evidence.claim": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/claim/v1",
  },
  "worker.escalate": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/escalate/v1",
  },
  "worker.file_context.inspect": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-context/inspect/v1",
  },
  "worker.file_edit.plan": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/plan/v1",
  },
  "worker.file_edit.propose_patch": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/propose-patch/v1",
  },
  "worker.file_edit.apply_patch": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/file-edit/apply-patch/v1",
  },
  "worker.validation.run": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/run/v1",
  },
  "worker.validation.classify_failure": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/classify-failure/v1",
  },
  "worker.file_edit.repair": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/repair/v1",
  },
  "worker.file_edit.escalate": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/escalate/v1",
  },
  "worker.evidence.handoff": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/handoff/v1",
  },
};

function boundedSummary(value: string): string {
  return value.trim().slice(0, 1_200);
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function defaultSchedulerToolExecutor(toolId: SchedulerRuntimeToolId): RuntimeToolExecutor {
  return {
    async execute(input) {
      const metadata = jsonObject(input.metadata);
      return {
        status: "succeeded",
        outputRef: `runtime-tool-output://${input.invocationId ?? toolId}`,
        outputHash: `scheduler-tool:${toolId}:${input.idempotencyKey}`,
        outputSummary: boundedSummary(`${toolId} recorded bounded scheduler operation evidence.`),
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        metadata: {
          ...metadata,
          schedulerRuntimeToolRecorded: true,
          rawPromptStored: false,
          rawResponseStored: false,
        } as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
    },
  };
}

export function buildSchedulerRuntimeToolDefinition(toolId: SchedulerRuntimeToolId) {
  const config = SCHEDULER_TOOL_FAMILIES[toolId];
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey:
      toolId === "worker.invoke"
        ? "runtime-work-graph.node-executor"
        : `runtime-work-graph.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: toolId === "worker.invoke" ? null : 30_000,
    enabled: true,
  });
}

export function registerSchedulerRuntimeTools(input: {
  registry: RuntimeToolRegistry;
  includeWorkerInvoke?: boolean;
}): void {
  for (const toolId of SCHEDULER_RUNTIME_TOOL_IDS) {
    if (toolId === "worker.invoke" && input.includeWorkerInvoke !== true) {
      continue;
    }
    input.registry.register(
      buildSchedulerRuntimeToolDefinition(toolId),
      defaultSchedulerToolExecutor(toolId),
    );
  }
}

export async function invokeSchedulerRuntimeTool(input: {
  kernel: RuntimeToolKernel;
  toolId: SchedulerRuntimeToolId;
  runtimeJobId?: string | null;
  graphId: string;
  nodeId?: string | null;
  roleRef?: string | null;
  modelRef?: string | null;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  metadata?: JsonValue;
}): Promise<SchedulerRuntimeToolInvocationSummary> {
  const result: RuntimeToolKernelInvokeResult = await input.kernel.invoke({
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId,
    nodeId: input.nodeId ?? null,
    roleRef: input.roleRef ?? null,
    modelRef: input.modelRef ?? null,
    idempotencyScope: `runtime-work-graph-scheduler:${input.graphId}`,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    inputHash: input.inputHash ?? null,
    inputSummary: boundedSummary(input.inputSummary),
    metadata: input.metadata ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  });
  return {
    toolId: input.toolId,
    invocationRef: result.invocationRef,
    status: result.invocation.status,
    outputRef: result.invocation.outputRef,
    reasonCodes: result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
