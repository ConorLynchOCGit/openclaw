export type RuntimeToolAdoptionSurfaceStatus =
  | "kernel_primary"
  | "scheduler_node_execution_primary"
  | "queued_for_toolification"
  | "not_in_scope_for_kernel_item";

export type RuntimeToolAdoptionSurface = {
  surfaceId: string;
  status: RuntimeToolAdoptionSurfaceStatus;
  currentBoundary: string;
  targetBoundary: string;
  nextQueueItem: string | null;
  reasonCodes: string[];
};

export const RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP: RuntimeToolAdoptionSurface[] = [
  {
    surfaceId: "runtime-tool-call-kernel",
    status: "kernel_primary",
    currentBoundary: "RuntimeToolKernel invokes registered executors and records durable traces.",
    targetBoundary: "RuntimeToolKernel remains the canonical tool invocation primitive.",
    nextQueueItem: null,
    reasonCodes: ["runtime_tool_kernel_primary"],
  },
  {
    surfaceId: "runtime-work-graph-node-execution",
    status: "scheduler_node_execution_primary",
    currentBoundary: "RuntimeWorkGraphScheduler can wrap node execution through worker.invoke.",
    targetBoundary:
      "All scheduler node execution, progress, and evidence uses runtime tool traces.",
    nextQueueItem: "toolification-03-scheduler-toolification",
    reasonCodes: ["scheduler_node_execution_tool_trace_available"],
  },
  {
    surfaceId: "scheduler-decisions",
    status: "queued_for_toolification",
    currentBoundary: "Scheduler decisions still have model-output contracts outside the kernel.",
    targetBoundary: "Decomposition, next-node selection, and repair become explicit runtime tools.",
    nextQueueItem: "toolification-03-scheduler-toolification",
    reasonCodes: ["scheduler_decision_toolification_pending"],
  },
  {
    surfaceId: "model-task-middleware",
    status: "queued_for_toolification",
    currentBoundary:
      "Model task calls have middleware evidence but are not uniformly kernel invocations.",
    targetBoundary: "Model calls become model.call runtime tools with trace-backed budgets.",
    nextQueueItem: "toolification-07-model-task-toolification",
    reasonCodes: ["model_call_toolification_pending"],
  },
  {
    surfaceId: "script-db-middleware",
    status: "queued_for_toolification",
    currentBoundary: "Script and DB operations have middleware evidence outside the kernel.",
    targetBoundary:
      "Script and DB operations become script.execute and db_operation.execute tools.",
    nextQueueItem: "toolification-08-script-db-toolification",
    reasonCodes: ["script_db_toolification_pending"],
  },
  {
    surfaceId: "kimi-codex-worker-loops",
    status: "queued_for_toolification",
    currentBoundary:
      "Worker loops emit role and app-server evidence outside a complete tool trace stream.",
    targetBoundary:
      "Inspect, patch, validate, repair, and closeout worker loop steps are runtime tools.",
    nextQueueItem: "toolification-04-worker-loop-toolification",
    reasonCodes: ["worker_loop_toolification_pending"],
  },
  {
    surfaceId: "memory-proactivity-closeout",
    status: "queued_for_toolification",
    currentBoundary:
      "Memory, proactivity, and closeout have bounded evidence but not universal tool traces.",
    targetBoundary:
      "Retrieve, capture, seed projection, and closeout generation become runtime tools.",
    nextQueueItem: "toolification-09-memory-closeout-toolification",
    reasonCodes: ["memory_closeout_toolification_pending"],
  },
  {
    surfaceId: "work-queue-tool-event-readback",
    status: "queued_for_toolification",
    currentBoundary:
      "Work Queue can store runtime evidence but needs richer tool/event projection.",
    targetBoundary: "Owner readback surfaces active and historical runtime tool events.",
    nextQueueItem: "toolification-06-work-queue-tool-event-readback",
    reasonCodes: ["work_queue_tool_readback_pending"],
  },
];
