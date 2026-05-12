import type { RuntimeJob, RuntimeJobState } from "../runtime-job-repository.ts";
import type { WorkItemLifecycleState } from "../work-queue/types.ts";
import type { ProtocolPreGateSourceRoute } from "./protocol-pre-gate.ts";

export const CONVERSATION_CONTEXT_SUMMARY_MAX_CHARS = 1_200;

export type ConversationRoutingContextSourceRoute = ProtocolPreGateSourceRoute;

export type ConversationRouteSummary = {
  routeDecisionId?: string | null;
  route: string;
  workflowId?: string | null;
  runtimeJobId?: string | null;
  reasonCodes: string[];
};

export type ConversationRuntimeJobRef = {
  runtimeJobId: string;
  jobType: string;
  queueName: string;
  state: RuntimeJobState;
  workItemId: string | null;
  workflowId: string | null;
  updatedAt: string;
  freshness: "fresh" | "stale" | "unknown";
};

export type ConversationWorkQueueSelectionRef = {
  workItemId: string;
  itemType: string;
  titleSummary: string;
  lifecycleState: WorkItemLifecycleState | "unknown";
  runtimeJobIds: string[];
  updatedAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
};

export type PendingClarificationRef = {
  clarificationId: string;
  targetRef: string;
  questionSummary: string;
  createdAt?: string | null;
  freshness: "fresh" | "stale" | "unknown";
};

export type PendingApprovalRef = {
  approvalId: string;
  authorityId: string;
  targetRef: string;
  scopeSummary: string;
  state: "pending" | "approved" | "rejected" | "expired" | "revoked" | "unknown";
  createdAt?: string | null;
  freshness: "fresh" | "stale" | "unknown";
};

export type AuthoritySnapshotRef = {
  snapshotId: string;
  version: string;
  authorityStateRefs: string[];
  createdAt?: string | null;
};

export type ConversationReferenceCandidate = {
  targetRef: string;
  targetKind: "runtime_job" | "work_item" | "clarification" | "approval";
  source:
    | "selected_work_queue_item"
    | "single_active_runtime_job"
    | "pending_clarification"
    | "pending_approval";
  freshness: "fresh" | "stale" | "unknown";
};

export type ConversationReferenceResolution = {
  outcome:
    | "resolved"
    | "ambiguous"
    | "stale"
    | "missing_target"
    | "not_reference"
    | "needs_clarification";
  targetRef: string | null;
  targetSource: ConversationReferenceCandidate["source"] | null;
  reasonCodes: string[];
  clarificationQuestion: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ConversationRoutingContext = {
  actorId: string;
  sessionId: string;
  sourceRoute: ConversationRoutingContextSourceRoute;
  activeRuntimeJobs: ConversationRuntimeJobRef[];
  selectedWorkQueueItem: ConversationWorkQueueSelectionRef | null;
  pendingClarifications: PendingClarificationRef[];
  pendingApprovals: PendingApprovalRef[];
  pendingControlTargetRef: string | null;
  lastRoute: ConversationRouteSummary | null;
  recentContextSummary: string;
  authoritySnapshots: AuthoritySnapshotRef[];
  workflowRegistryVersion: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ConversationRoutingContextInput = {
  actorId: string;
  sessionId: string;
  sourceRoute: ConversationRoutingContextSourceRoute;
  activeRuntimeJobs?: ConversationRuntimeJobRef[];
  selectedWorkQueueItem?: ConversationWorkQueueSelectionRef | null;
  pendingClarifications?: PendingClarificationRef[];
  pendingApprovals?: PendingApprovalRef[];
  pendingControlTargetRef?: string | null;
  lastRoute?: ConversationRouteSummary | null;
  recentContextSummary?: string | null;
  authoritySnapshots?: AuthoritySnapshotRef[];
  workflowRegistryVersion?: string | null;
  reasonCodes?: string[];
  rawPromptStored?: boolean;
  rawResponseStored?: boolean;
};

export function runtimeJobToConversationRef(
  job: RuntimeJob,
  options: { workflowId?: string | null; freshness?: "fresh" | "stale" | "unknown" } = {},
): ConversationRuntimeJobRef {
  return {
    runtimeJobId: job.jobId,
    jobType: job.jobType,
    queueName: job.queueName,
    state: job.state,
    workItemId: job.workItemId,
    workflowId: options.workflowId ?? readWorkflowId(job.payload),
    updatedAt: job.updatedAt.toISOString(),
    freshness: options.freshness ?? "fresh",
  };
}

export function buildConversationRoutingContext(
  input: ConversationRoutingContextInput,
): ConversationRoutingContext {
  const actorId = input.actorId.trim();
  const sessionId = input.sessionId.trim();
  if (!actorId) {
    throw new Error("actorId is required");
  }
  if (!sessionId) {
    throw new Error("sessionId is required");
  }
  if (input.rawPromptStored === true || input.rawResponseStored === true) {
    throw new Error("raw prompt/response storage is not allowed in conversation routing context");
  }
  const reasonCodes = [...(input.reasonCodes ?? [])];
  const recentContextSummary = boundText(
    input.recentContextSummary ?? "",
    CONVERSATION_CONTEXT_SUMMARY_MAX_CHARS,
  );
  if ((input.recentContextSummary ?? "").length > recentContextSummary.length) {
    reasonCodes.push("recent_context_summary_bounded");
  }
  return {
    actorId,
    sessionId,
    sourceRoute: input.sourceRoute,
    activeRuntimeJobs: [...(input.activeRuntimeJobs ?? [])],
    selectedWorkQueueItem: input.selectedWorkQueueItem ?? null,
    pendingClarifications: [...(input.pendingClarifications ?? [])],
    pendingApprovals: [...(input.pendingApprovals ?? [])],
    pendingControlTargetRef: input.pendingControlTargetRef?.trim() || null,
    lastRoute: input.lastRoute ?? null,
    recentContextSummary,
    authoritySnapshots: [...(input.authoritySnapshots ?? [])],
    workflowRegistryVersion: input.workflowRegistryVersion ?? null,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function assertJsonSerializableContext(context: ConversationRoutingContext): void {
  JSON.parse(JSON.stringify(context));
}

export function boundText(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

function readWorkflowId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const workflowId = (payload as { workflowId?: unknown }).workflowId;
  return typeof workflowId === "string" ? workflowId : null;
}
