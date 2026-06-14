import type { RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkItemLifecycleState, WorkItemQueueStatus } from "./types.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export type WorkQueueExecutionEligibilityItem = {
  workItemId: string;
  title: string;
  description: string | null;
  itemType: string;
  queueStatus: WorkItemQueueStatus;
  lifecycleState: WorkItemLifecycleState;
  queueRank: number | null;
  queuePosition: number | null;
  sourceDocRefs: string[];
  artifactRefs: string[];
  nextAction: string | null;
  runtimeJobIds: string[];
  runtimeJobStates: Array<{
    runtimeJobId: string;
    state: RuntimeJob["state"];
    staleRunning: boolean;
  }>;
  reasonCodes: string[];
};

export type WorkQueueExecutionEligibilityReadModel = {
  artifactKind: "work_queue_execution_eligibility_read_model";
  eligible: WorkQueueExecutionEligibilityItem[];
  excluded: WorkQueueExecutionEligibilityItem[];
  source: "execution_platform_work_queue_db";
  ranking: "db_queue_rank_only";
  semanticExecutorSelection: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

const DEFAULT_STALE_RUNNING_MS = 30 * 60 * 1000;
const DEFAULT_SCAN_LIMIT = 80;
const DEFAULT_RESULT_LIMIT = 20;
const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_CONTEXT_REFS = 20;
const ELIGIBLE_QUEUE_STATUSES = new Set<WorkItemQueueStatus>(["active"]);
const ELIGIBLE_LIFECYCLE_STATES = new Set<WorkItemLifecycleState>(["draft", "manual_ready"]);
const ACTIVE_RUNTIME_JOB_STATES = new Set<RuntimeJob["state"]>(["pending", "running"]);

function boundedText(value: string | null | undefined, maxChars: number): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim().slice(0, maxChars);
}

async function runtimeJobStateReadbacks(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobIds: string[];
  now: Date;
  staleRunningMs: number;
}): Promise<WorkQueueExecutionEligibilityItem["runtimeJobStates"]> {
  const states: WorkQueueExecutionEligibilityItem["runtimeJobStates"] = [];
  for (const runtimeJobId of input.runtimeJobIds) {
    const job = await input.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      continue;
    }
    const recentEvent = (await input.runtimeJobs.listRecentEvents(runtimeJobId, 1))[0] ?? null;
    const latestActivityAt =
      recentEvent?.eventTime ?? job.updatedAt ?? job.startedAt ?? job.createdAt;
    states.push({
      runtimeJobId,
      state: job.state,
      staleRunning:
        job.state === "running" &&
        input.now.getTime() - latestActivityAt.getTime() > input.staleRunningMs,
    });
  }
  return states;
}

function eligibilityReasonCodes(input: {
  queueStatus: WorkItemQueueStatus;
  lifecycleState: WorkItemLifecycleState;
  runtimeJobStates: WorkQueueExecutionEligibilityItem["runtimeJobStates"];
}): string[] {
  const reasonCodes: string[] = [];
  if (!ELIGIBLE_QUEUE_STATUSES.has(input.queueStatus)) {
    reasonCodes.push(`work_queue_item_queue_status_excluded:${input.queueStatus}`);
  }
  if (!ELIGIBLE_LIFECYCLE_STATES.has(input.lifecycleState)) {
    reasonCodes.push(`work_queue_item_lifecycle_state_excluded:${input.lifecycleState}`);
  }
  if (input.runtimeJobStates.some((job) => ACTIVE_RUNTIME_JOB_STATES.has(job.state))) {
    reasonCodes.push("work_queue_item_already_has_active_runtime_job");
  }
  if (input.runtimeJobStates.some((job) => job.staleRunning)) {
    reasonCodes.push("work_queue_item_has_stale_running_runtime_job");
  }
  if (reasonCodes.length === 0) {
    reasonCodes.push("work_queue_item_eligible_by_queue_rank");
  }
  return reasonCodes;
}

export async function buildWorkQueueExecutionEligibilityReadModel(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  scanLimit?: number;
  resultLimit?: number;
  staleRunningMs?: number;
  now?: Date;
}): Promise<WorkQueueExecutionEligibilityReadModel> {
  const now = input.now ?? new Date();
  const resultLimit = input.resultLimit ?? DEFAULT_RESULT_LIMIT;
  const list = await input.workQueue.listDbWorkQueue({
    bucket: "active",
    limit: input.scanLimit ?? DEFAULT_SCAN_LIMIT,
    reconcileTerminalProjections: true,
  });
  const eligible: WorkQueueExecutionEligibilityItem[] = [];
  const excluded: WorkQueueExecutionEligibilityItem[] = [];
  for (const item of list.items) {
    const runtimeJobStates = await runtimeJobStateReadbacks({
      runtimeJobs: input.runtimeJobs,
      runtimeJobIds: item.runtimeJobIds,
      now,
      staleRunningMs: input.staleRunningMs ?? DEFAULT_STALE_RUNNING_MS,
    });
    const reasonCodes = eligibilityReasonCodes({
      queueStatus: item.queueStatus,
      lifecycleState: item.lifecycleState,
      runtimeJobStates,
    });
    const convergenceSlice = item.convergenceSlice;
    const readbackItem: WorkQueueExecutionEligibilityItem = {
      workItemId: item.workItemId,
      title: item.title,
      description: boundedText(item.description, MAX_DESCRIPTION_CHARS),
      itemType: item.itemType,
      queueStatus: item.queueStatus,
      lifecycleState: item.lifecycleState,
      queueRank: item.queueRank,
      queuePosition: item.queuePosition,
      sourceDocRefs: (convergenceSlice?.sourceDocRefs ?? []).slice(0, MAX_CONTEXT_REFS),
      artifactRefs: (convergenceSlice?.artifactRefs ?? []).slice(0, MAX_CONTEXT_REFS),
      nextAction: boundedText(convergenceSlice?.nextAction ?? null, MAX_DESCRIPTION_CHARS),
      runtimeJobIds: item.runtimeJobIds,
      runtimeJobStates,
      reasonCodes,
    };
    if (reasonCodes.length === 1 && reasonCodes[0] === "work_queue_item_eligible_by_queue_rank") {
      eligible.push(readbackItem);
    } else {
      excluded.push(readbackItem);
    }
  }
  return {
    artifactKind: "work_queue_execution_eligibility_read_model",
    eligible: eligible.slice(0, resultLimit),
    excluded: excluded.slice(0, resultLimit),
    source: "execution_platform_work_queue_db",
    ranking: "db_queue_rank_only",
    semanticExecutorSelection: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}
