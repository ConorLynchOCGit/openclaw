import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  buildConversationRoutingContext,
  boundText,
  runtimeJobToConversationRef,
  type AuthoritySnapshotRef,
  type ConversationRoutingContext,
  type ConversationRoutingContextSourceRoute,
  type PendingApprovalRef,
  type PendingClarificationRef,
} from "./conversation-routing-context.ts";

export type ConversationStateResolverInput = {
  actorId: string;
  sessionId: string;
  sourceRoute: ConversationRoutingContextSourceRoute;
  runtimeJobs?: Pick<RuntimeJobRepository, "getJob" | "listRecentJobs"> | null;
  workQueue?: Pick<WorkQueueRepository, "readWorkItemTruth"> | null;
  selectedWorkItemId?: string | null;
  activeRuntimeJobIds?: string[];
  pendingClarifications?: PendingClarificationRef[];
  pendingApprovals?: PendingApprovalRef[];
  authoritySnapshots?: AuthoritySnapshotRef[];
  recentContextSummary?: string | null;
  workflowRegistryVersion?: string | null;
  includeRecentActiveJobs?: boolean;
};

export async function resolveConversationRoutingContext(
  input: ConversationStateResolverInput,
): Promise<ConversationRoutingContext> {
  const reasonCodes: string[] = [];
  const activeRuntimeJobs = [];
  if (input.runtimeJobs) {
    const ids = input.activeRuntimeJobIds?.filter((id) => id.trim()) ?? [];
    for (const runtimeJobId of ids) {
      const job = await input.runtimeJobs.getJob(runtimeJobId);
      if (job) {
        activeRuntimeJobs.push(runtimeJobToConversationRef(job));
      } else {
        reasonCodes.push("runtime_job_ref_not_found");
      }
    }
    if (ids.length === 0 && input.includeRecentActiveJobs === true) {
      const jobs = await input.runtimeJobs.listRecentJobs({
        states: ["pending", "running"],
        limit: 10,
      });
      activeRuntimeJobs.push(...jobs.map((job) => runtimeJobToConversationRef(job)));
    }
  } else if ((input.activeRuntimeJobIds?.length ?? 0) > 0) {
    reasonCodes.push("runtime_job_repository_unavailable");
  }

  let selectedWorkQueueItem = null;
  const selectedWorkItemId = input.selectedWorkItemId?.trim();
  if (selectedWorkItemId) {
    if (input.workQueue) {
      const truth = await input.workQueue.readWorkItemTruth(selectedWorkItemId, 5);
      if (truth) {
        selectedWorkQueueItem = {
          workItemId: truth.item.workItemId,
          itemType: truth.item.itemType,
          titleSummary: boundText(truth.item.title, 240),
          lifecycleState: truth.item.lifecycleState,
          runtimeJobIds: truth.runs
            .map((run) => run.runtimeJobId)
            .filter((runtimeJobId): runtimeJobId is string => typeof runtimeJobId === "string"),
          updatedAt: truth.item.updatedAt.toISOString(),
          freshness: "fresh" as const,
        };
      } else {
        reasonCodes.push("selected_work_queue_item_not_found");
      }
    } else {
      reasonCodes.push("work_queue_repository_unavailable");
    }
  }

  return buildConversationRoutingContext({
    actorId: input.actorId,
    sessionId: input.sessionId,
    sourceRoute: input.sourceRoute,
    activeRuntimeJobs,
    selectedWorkQueueItem,
    pendingClarifications: input.pendingClarifications,
    pendingApprovals: input.pendingApprovals,
    authoritySnapshots: input.authoritySnapshots,
    recentContextSummary: input.recentContextSummary,
    workflowRegistryVersion: input.workflowRegistryVersion,
    reasonCodes,
  });
}
