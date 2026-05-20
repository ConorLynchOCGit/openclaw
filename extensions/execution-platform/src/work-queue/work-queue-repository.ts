import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { SqlClient } from "../db/sql-client.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolificationGateResult } from "../runtime-tool-call/runtime-tool-adoption-boundary.ts";
import {
  projectCanonicalRuntimeQueue as buildCanonicalRuntimeQueueProjection,
  type CanonicalRuntimeQueueCloseoutReadbackUpdate,
  type CanonicalRuntimeQueueProjection,
} from "./canonical-runtime-queue.ts";
import { projectDbPrimaryWorkQueueItem } from "./db-primary-work-queue-projection.ts";
import {
  buildGeneratedWorkQueueItemLifecycle,
  isGeneratedDebugOnly,
  mergeGeneratedLifecycleMetadata,
  readGeneratedTerminalPolicy,
  readGeneratedWorkQueueItemLifecycle,
  type WorkQueueGeneratedItemLifecycle,
  type WorkQueueGeneratedItemOriginKind,
  type WorkQueueGeneratedItemRetentionPolicy,
  type WorkQueueGeneratedItemTerminalPolicy,
} from "./generated-item-lifecycle.ts";
import type {
  WorkItem,
  WorkItemArtifact,
  WorkItemAssignment,
  WorkItemDependency,
  WorkItemEvent,
  WorkItemLifecycleState,
  WorkItemQueueStatus,
  WorkItemParentWorkflowLink,
  WorkItemTruth,
  WorkItemVersion,
  WorkQueueReadModelItem,
  WorkRun,
  WorkRunExecutorKind,
  WorkRunState,
  WorkStep,
  WorkStepState,
} from "./types.ts";
import type { WorkQueueEventStore } from "./work-queue-event-store.ts";
import type { WorkQueueEventType } from "./work-queue-events.ts";

type WorkItemRow = QueryResultRow & {
  work_item_id: string;
  item_type: string;
  title: string;
  description: string | null;
  lifecycle_state: WorkItemLifecycleState;
  queue_status: WorkItemQueueStatus;
  queue_rank: number | string | null;
  closed_at: Date | string | null;
  closed_by_runtime_job_id: string | null;
  closed_by_closeout_ref: string | null;
  closeout_capsule_ref: string | null;
  validation_ref: string | null;
  graph_ref: string | null;
  owner_readback_ref: string | null;
  current_version_id: string | null;
  metadata: JsonValue;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkItemVersionRow = QueryResultRow & {
  version_id: string;
  work_item_id: string;
  version_number: number;
  version_state: "draft" | "finalized";
  title: string | null;
  body: string | null;
  artifact_metadata: JsonValue;
  created_at: Date | string;
  finalized_at: Date | string | null;
};

type WorkItemArtifactRow = QueryResultRow & {
  artifact_id: string;
  work_item_id: string;
  version_id: string | null;
  artifact_type: string;
  storage_kind: string;
  uri: string;
  content_type: string | null;
  size_bytes: number | string | null;
  sha256: string | null;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemEventRow = QueryResultRow & {
  event_id: string;
  work_item_id: string;
  run_id: string | null;
  step_id: string | null;
  event_type: string;
  lifecycle_state: WorkItemLifecycleState | null;
  event_time: Date | string;
  actor_id: string | null;
  data: JsonValue;
};

type WorkRunRow = QueryResultRow & {
  run_id: string;
  work_item_id: string;
  executor_kind: WorkRunExecutorKind;
  runtime_job_id: string | null;
  runtime_job_type: string | null;
  run_state: WorkRunState;
  metadata: JsonValue;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkStepRow = QueryResultRow & {
  step_id: string;
  run_id: string;
  work_item_id: string;
  step_type: string;
  step_name: string;
  step_state: WorkStepState;
  runtime_job_id: string | null;
  metadata: JsonValue;
  result: JsonValue | null;
  error: JsonValue | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkItemAssignmentRow = QueryResultRow & {
  assignment_id: string;
  work_item_id: string;
  assignee_type: string;
  assignee_id: string;
  role: string;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemDependencyRow = QueryResultRow & {
  dependency_id: string;
  work_item_id: string;
  depends_on_work_item_id: string;
  dependency_type: string;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemParentWorkflowLinkRow = QueryResultRow & {
  link_id: string;
  work_item_id: string;
  parent_workflow_id: string;
  parent_workflow_kind: string;
  metadata: JsonValue;
  created_at: Date | string;
};

type WorkItemPlanningSnapshotRow = QueryResultRow & {
  work_item_id: string;
  title: string;
  description: string | null;
  metadata: JsonValue;
  current_version_title: string | null;
  current_version_body: string | null;
  current_version_artifact_metadata: JsonValue | null;
};

type WorkItemDependencyKeyRow = QueryResultRow & {
  work_item_id: string;
  depends_on_work_item_id: string;
  dependency_type: string;
};

export type WorkQueueRepositoryOptions = {
  now?: () => Date;
  maxJsonBytes?: number;
  eventStore?: WorkQueueEventStore;
};

export type CreateWorkItemInput = {
  workItemId?: string;
  itemType: string;
  title: string;
  description?: string | null;
  metadata?: JsonValue;
  actorId?: string | null;
};

export type CreateGeneratedWorkItemInput = CreateWorkItemInput & {
  generatedOriginKind: WorkQueueGeneratedItemOriginKind;
  generatedTerminalPolicy: WorkQueueGeneratedItemTerminalPolicy;
  generatedRetentionPolicy?: WorkQueueGeneratedItemRetentionPolicy;
  parentWorkItemId?: string | null;
  owningRuntimeJobId?: string | null;
  owningGraphId?: string | null;
  owningNodeId?: string | null;
  ownerVisible?: boolean;
  createdBy: string;
  reasonCodes?: string[];
};

export type UpdateWorkItemPlanningMetadataInput = {
  workItemId: string;
  title: string;
  description?: string | null;
  metadata?: JsonValue;
  actorId?: string | null;
};

export type CreateWorkItemVersionInput = {
  versionId?: string;
  workItemId: string;
  title?: string | null;
  body?: string | null;
  artifactMetadata?: JsonValue;
  makeCurrent?: boolean;
};

export type AttachWorkItemArtifactInput = {
  artifactId?: string;
  workItemId: string;
  versionId?: string | null;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue;
};

export type CreateWorkRunInput = {
  runId?: string;
  workItemId: string;
  executorKind: WorkRunExecutorKind;
  runtimeJobId?: string | null;
  runState?: WorkRunState;
  metadata?: JsonValue;
};

export type CreateWorkStepInput = {
  stepId?: string;
  runId: string;
  stepType: string;
  stepName: string;
  stepState?: WorkStepState;
  runtimeJobId?: string | null;
  metadata?: JsonValue;
};

export type RecordCloseoutProjectionReadbackInput = CanonicalRuntimeQueueCloseoutReadbackUpdate & {
  artifactId?: string;
  lifecycleMutationAllowed?: boolean;
};

export type CompleteWorkQueueItemFromCloseoutInput = {
  workItemId: string;
  closeoutRef: string;
  closeoutHash?: string | null;
  runtimeJobId?: string | null;
  validationRef?: string | null;
  graphRef?: string | null;
  ownerReadbackRef?: string | null;
  artifactRefs?: string[];
  accepted?: boolean;
  validationRequired?: boolean;
  sourceEditRequired?: boolean;
  changedFileRefs?: string[];
  providerUnavailable?: boolean;
  closeoutModelTimeout?: boolean;
  reasonCodes?: string[];
  actorId?: string | null;
  rawPromptStored?: false;
  rawResponseStored?: false;
  rawTranscriptStored?: false;
  rawLogsStored?: false;
  rawDbRowsStored?: false;
  authorityGranted?: false;
  controlsApplied?: false;
  runtimeLifecycleMutated?: false;
  modelPromotionPerformed?: false;
  toolificationAdoptionGateResults?: RuntimeToolificationGateResult[];
  toolificationAdoptionGateEvidenceRefs?: string[];
};

export type CompleteToolificationWorkQueueItemFromAdoptionGateInput = Omit<
  CompleteWorkQueueItemFromCloseoutInput,
  "toolificationAdoptionGateResults" | "toolificationAdoptionGateEvidenceRefs"
> & {
  toolificationAdoptionGateResults: RuntimeToolificationGateResult[];
  toolificationAdoptionGateEvidenceRefs: string[];
};

export type CompleteWorkQueueItemFromCloseoutResult = {
  artifactKind: "work_queue_item_closeout_transition_result";
  workItemId: string;
  status: WorkItemQueueStatus;
  closed: boolean;
  idempotent: boolean;
  closeoutRef: string;
  runtimeJobId: string | null;
  validationRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  controlsApplied: false;
  runtimeLifecycleMutated: false;
  workQueueStatusMutated: boolean;
  modelPromotionPerformed: false;
};

export type SyncRuntimeGraphNodeToWorkQueueInput = {
  parentWorkItemId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  assignedWorkflow: string;
  queueStatus?: WorkItemQueueStatus;
  title?: string | null;
  runtimeJobId?: string | null;
  humanTaskId?: string | null;
  graphNodeRef?: string | null;
  evidenceRefs?: string[];
  blockerReasonCodes?: string[];
  optional?: boolean;
  actorId?: string | null;
};

export type SyncRuntimeGraphNodeToWorkQueueResult = {
  artifactKind: "runtime_graph_node_work_queue_sync_result";
  parentWorkItemId: string;
  childWorkItemId: string;
  graphId: string;
  nodeId: string;
  created: boolean;
  idempotent: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type RollupParentWorkQueueStatusResult = {
  artifactKind: "work_queue_parent_rollup_result";
  parentWorkItemId: string;
  childWorkItemIds: string[];
  requiredChildWorkItemIds: string[];
  optionalChildWorkItemIds: string[];
  queueStatus: WorkItemQueueStatus;
  changed: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  runtimeLifecycleMutated: false;
  workQueueStatusMutated: boolean;
};

export type WorkQueueListBucket = "active" | "closed" | "all";

export type DbWorkQueueListInput = {
  bucket?: WorkQueueListBucket;
  limit?: number;
  cursor?: string | null;
  searchQuery?: string | null;
  updatedSince?: Date | string | null;
  reconcileTerminalProjections?: boolean;
  includeGeneratedDebugItems?: boolean;
};

export type DbWorkQueueSummary = {
  workItemId: string;
  itemType: string;
  title: string;
  description: string | null;
  lifecycleState: WorkItemLifecycleState;
  queueStatus: WorkItemQueueStatus;
  queuePosition: number | null;
  queueRank: number | null;
  closedAt: string | null;
  updatedAt: string;
  runtimeJobIds: string[];
  graphRef: string | null;
  validationRef: string | null;
  closeoutCapsuleRef: string | null;
  ownerReadbackRef: string | null;
  convergenceSlice: WorkQueueReadModelItem["convergenceSlice"];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  generatedItemLifecycle: WorkQueueGeneratedItemLifecycle | null;
};

export type DbWorkQueueListResult = {
  artifactKind: "db_work_queue_list_result";
  source: "execution_platform_work_queue_db";
  bucket: WorkQueueListBucket;
  limit: number;
  nextCursor: string | null;
  deltaCursor: string;
  items: DbWorkQueueSummary[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
};

export type ReconcileTerminalRuntimeProjectionsResult = {
  artifactKind: "work_queue_terminal_runtime_projection_reconciliation_result";
  archivedRuntimeGraphChildWorkItemIds: string[];
  archivedTerminalExecutionWorkItemIds: string[];
  archivedGeneratedDebugWorkItemIds: string[];
  canceledRootRuntimeJobIds: string[];
  updatedGraphIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  runtimeLifecycleMutated: false;
};

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;
const EVIDENCE_REQUIRED_ITEM_STATES = new Set<WorkItemLifecycleState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const EVIDENCE_REQUIRED_RUN_STATES = new Set<WorkRunState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const EVIDENCE_REQUIRED_STEP_STATES = new Set<WorkStepState>([
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const MAX_CLOSEOUT_PRIORITY_NOTE_LENGTH = 160;
const ACTIVE_QUEUE_STATUSES = ["active", "blocked", "needs_review"] as const;
const CLOSED_QUEUE_STATUSES = ["closed", "superseded", "archived"] as const;
const MAX_WORK_QUEUE_PAGE_SIZE = 100;
const TOOLIFICATION_WORK_ITEM_ID_FRAGMENT = ".toolification-";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function encodeJson(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? {});
}

function clampWorkQueueLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 50;
  }
  return Math.max(1, Math.min(Math.trunc(value!), MAX_WORK_QUEUE_PAGE_SIZE));
}

function decodeOffsetCursor(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const normalized = value.startsWith("offset:") ? value.slice("offset:".length) : value;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function encodeOffsetCursor(offset: number, returnedCount: number, limit: number): string | null {
  return returnedCount === limit ? `offset:${offset + returnedCount}` : null;
}

function sqlDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function assertJsonByteLength(value: JsonValue | undefined, maxBytes: number, name: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function decodeItem(row: WorkItemRow): WorkItem {
  return {
    workItemId: row.work_item_id,
    itemType: row.item_type,
    title: row.title,
    description: row.description,
    lifecycleState: row.lifecycle_state,
    queueStatus: row.queue_status,
    queueRank: row.queue_rank === null ? null : Number(row.queue_rank),
    closedAt: nullableDate(row.closed_at),
    closedByRuntimeJobId: row.closed_by_runtime_job_id,
    closedByCloseoutRef: row.closed_by_closeout_ref,
    closeoutCapsuleRef: row.closeout_capsule_ref,
    validationRef: row.validation_ref,
    graphRef: row.graph_ref,
    ownerReadbackRef: row.owner_readback_ref,
    currentVersionId: row.current_version_id,
    metadata: row.metadata,
    generatedItemLifecycle: readGeneratedWorkQueueItemLifecycle(row.metadata),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeVersion(row: WorkItemVersionRow): WorkItemVersion {
  return {
    versionId: row.version_id,
    workItemId: row.work_item_id,
    versionNumber: row.version_number,
    versionState: row.version_state,
    title: row.title,
    body: row.body,
    artifactMetadata: row.artifact_metadata,
    createdAt: toDate(row.created_at),
    finalizedAt: nullableDate(row.finalized_at),
  };
}

function decodeArtifact(row: WorkItemArtifactRow): WorkItemArtifact {
  return {
    artifactId: row.artifact_id,
    workItemId: row.work_item_id,
    versionId: row.version_id,
    artifactType: row.artifact_type,
    storageKind: row.storage_kind,
    uri: row.uri,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeEvent(row: WorkItemEventRow): WorkItemEvent {
  return {
    eventId: row.event_id,
    workItemId: row.work_item_id,
    runId: row.run_id,
    stepId: row.step_id,
    eventType: row.event_type,
    lifecycleState: row.lifecycle_state,
    eventTime: toDate(row.event_time),
    actorId: row.actor_id,
    data: row.data,
  };
}

function decodeRun(row: WorkRunRow): WorkRun {
  return {
    runId: row.run_id,
    workItemId: row.work_item_id,
    executorKind: row.executor_kind,
    runtimeJobId: row.runtime_job_id,
    runtimeJobType: row.runtime_job_type,
    runState: row.run_state,
    metadata: row.metadata,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeStep(row: WorkStepRow): WorkStep {
  return {
    stepId: row.step_id,
    runId: row.run_id,
    workItemId: row.work_item_id,
    stepType: row.step_type,
    stepName: row.step_name,
    stepState: row.step_state,
    runtimeJobId: row.runtime_job_id,
    metadata: row.metadata,
    result: row.result,
    error: row.error,
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function decodeAssignment(row: WorkItemAssignmentRow): WorkItemAssignment {
  return {
    assignmentId: row.assignment_id,
    workItemId: row.work_item_id,
    assigneeType: row.assignee_type,
    assigneeId: row.assignee_id,
    role: row.role,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeDependency(row: WorkItemDependencyRow): WorkItemDependency {
  return {
    dependencyId: row.dependency_id,
    workItemId: row.work_item_id,
    dependsOnWorkItemId: row.depends_on_work_item_id,
    dependencyType: row.dependency_type,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function decodeParentWorkflowLink(row: WorkItemParentWorkflowLinkRow): WorkItemParentWorkflowLink {
  return {
    linkId: row.link_id,
    workItemId: row.work_item_id,
    parentWorkflowId: row.parent_workflow_id,
    parentWorkflowKind: row.parent_workflow_kind,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

function readRecord(value: JsonValue | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArrayFromRecord(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isToolificationWorkItemId(workItemId: string): boolean {
  return workItemId.includes(TOOLIFICATION_WORK_ITEM_ID_FRAGMENT);
}

function acceptedToolificationAdoptionGateResults(
  results: RuntimeToolificationGateResult[] | undefined,
): RuntimeToolificationGateResult[] {
  return (results ?? []).filter((result) => result.accepted);
}

function toolificationAdoptionGateCanClose(input: {
  workItemId: string;
  results?: RuntimeToolificationGateResult[];
  evidenceRefs?: string[];
}): boolean {
  if (!isToolificationWorkItemId(input.workItemId)) {
    return true;
  }
  const acceptedResults = acceptedToolificationAdoptionGateResults(input.results);
  return (
    acceptedResults.length > 0 &&
    acceptedResults.length === (input.results?.length ?? 0) &&
    (input.evidenceRefs?.filter((ref) => ref.trim().length > 0).length ?? 0) > 0
  );
}

function mapLifecycleEventToWorkQueueEvent(input: {
  eventType: string;
  data?: JsonValue;
  lifecycleState?: WorkItemLifecycleState | null;
}): WorkQueueEventType | null {
  const data = readRecord(input.data);
  const queueStatus = typeof data.queueStatus === "string" ? data.queueStatus : null;
  switch (input.eventType) {
    case "work_item.created":
      return "work_queue.item_created";
    case "work_item.runtime_graph_child_created":
      return "work_queue.child_created";
    case "work_item.runtime_graph_child_updated":
      return "work_queue.child_updated";
    case "work_item.parent_rollup_status_updated":
      return "work_queue.parent_rollup_updated";
    case "work_item.queue_status_closed_from_closeout":
      return "work_queue.closeout_accepted";
    case "work_item.queue_status_needs_review_from_closeout":
      return "work_queue.closeout_needs_review";
    case "work_item.lifecycle_updated":
      return input.lifecycleState === "succeeded"
        ? "work_queue.item_closed"
        : "work_queue.item_updated";
    default:
      if (queueStatus === "blocked") {
        return "work_queue.item_blocked";
      }
      if (queueStatus === "active" && input.eventType.includes("unblocked")) {
        return "work_queue.item_unblocked";
      }
      if (queueStatus === "closed" || queueStatus === "superseded" || queueStatus === "archived") {
        return "work_queue.item_closed";
      }
      return "work_queue.item_updated";
  }
}

function deriveRuntimeGraphEventTypes(input: {
  created: boolean;
  nodeKind: string;
  queueStatus: WorkItemQueueStatus;
}): WorkQueueEventType[] {
  const eventTypes: WorkQueueEventType[] = [
    input.created ? "work_queue.child_created" : "work_queue.child_updated",
  ];
  if (input.queueStatus === "closed" || input.queueStatus === "superseded") {
    eventTypes.push("work_queue.graph_node_completed");
  } else if (input.queueStatus === "needs_review") {
    eventTypes.push("work_queue.graph_node_needs_review");
  } else if (input.queueStatus === "blocked") {
    eventTypes.push("work_queue.graph_node_failed");
  } else if (input.queueStatus === "active") {
    eventTypes.push("work_queue.graph_node_started");
  }
  if (input.queueStatus === "active") {
    eventTypes.push("work_queue.active_worker_changed", "work_queue.role_invocation_started");
  } else if (input.queueStatus === "closed" || input.queueStatus === "superseded") {
    eventTypes.push("work_queue.role_invocation_completed");
  } else if (input.queueStatus === "needs_review") {
    eventTypes.push("work_queue.role_invocation_needs_review");
  } else if (input.queueStatus === "blocked") {
    eventTypes.push("work_queue.role_invocation_failed");
  }
  if (input.nodeKind === "human_task") {
    eventTypes.push(
      input.queueStatus === "closed"
        ? "work_queue.human_task_resumed"
        : input.queueStatus === "blocked"
          ? "work_queue.human_task_blocked"
          : input.queueStatus === "needs_review"
            ? "work_queue.human_task_expired"
            : "work_queue.human_task_waiting",
    );
  }
  if (input.nodeKind.includes("validation") || input.nodeKind.includes("test")) {
    if (input.queueStatus === "active") {
      eventTypes.push("work_queue.validation_started");
    } else if (input.queueStatus === "needs_review" || input.queueStatus === "blocked") {
      eventTypes.push("work_queue.validation_failed");
    } else if (input.queueStatus === "closed") {
      eventTypes.push("work_queue.validation_repaired", "work_queue.validation_passed");
    }
  }
  if (input.nodeKind.includes("repair")) {
    if (input.queueStatus === "active") {
      eventTypes.push("work_queue.repair_started");
    } else if (input.queueStatus === "closed") {
      eventTypes.push("work_queue.repair_completed");
    } else if (input.queueStatus === "needs_review" || input.queueStatus === "blocked") {
      eventTypes.push("work_queue.repair_exhausted");
    }
  }
  if (input.nodeKind.includes("closeout")) {
    if (input.queueStatus === "active") {
      eventTypes.push("work_queue.closeout_started");
    } else if (input.queueStatus === "closed") {
      eventTypes.push("work_queue.closeout_accepted");
    } else if (input.queueStatus === "needs_review") {
      eventTypes.push("work_queue.closeout_needs_review");
    } else if (input.queueStatus === "blocked") {
      eventTypes.push("work_queue.closeout_rejected");
    }
  }
  return [...new Set(eventTypes)];
}

export class WorkQueueRepository {
  private readonly now: () => Date;
  private readonly maxJsonBytes: number;
  private readonly eventStore: WorkQueueEventStore | null;

  constructor(
    private readonly sql: SqlClient,
    private readonly runtimeJobs: RuntimeJobRepository,
    options: WorkQueueRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxJsonBytes = options.maxJsonBytes ?? DEFAULT_MAX_JSON_BYTES;
    this.eventStore = options.eventStore ?? null;
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item metadata");
    const now = this.now();
    const workItemId = input.workItemId ?? randomUUID();
    const item = await this.sql.withTransaction(async (tx) => {
      const rankResult = await tx.query<{ next_rank: number | string }>(
        `
          SELECT COALESCE(MAX(queue_rank), 0) + 1 AS next_rank
          FROM execution_platform.work_items
          WHERE queue_status IN ('active', 'blocked', 'needs_review')
        `,
      );
      const queueRank = Number(rankResult.rows[0]?.next_rank ?? 1);
      const result = await tx.query<WorkItemRow>(
        `
          INSERT INTO execution_platform.work_items (
            work_item_id,
            item_type,
            title,
            description,
            queue_status,
            queue_rank,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
          RETURNING *
        `,
        [
          workItemId,
          input.itemType,
          input.title,
          input.description ?? null,
          queueRank,
          encodeJson(input.metadata),
          now,
        ],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId,
        eventType: "work_item.created",
        lifecycleState: "draft",
        actorId: input.actorId ?? null,
        data: { itemType: input.itemType, title: input.title },
        eventTime: now,
      });
      return decodeItem(result.rows[0]!);
    });
    return item;
  }

  async createGeneratedWorkItem(input: CreateGeneratedWorkItemInput): Promise<WorkItem> {
    const lifecycle = buildGeneratedWorkQueueItemLifecycle({
      originKind: input.generatedOriginKind,
      terminalPolicy: input.generatedTerminalPolicy,
      retentionPolicy: input.generatedRetentionPolicy,
      parentWorkItemId: input.parentWorkItemId ?? null,
      owningRuntimeJobId: input.owningRuntimeJobId ?? null,
      owningGraphId: input.owningGraphId ?? null,
      owningNodeId: input.owningNodeId ?? null,
      ownerVisible: input.ownerVisible,
      createdBy: input.createdBy,
      reasonCodes: input.reasonCodes,
    });
    const item = await this.createWorkItem({
      workItemId: input.workItemId,
      itemType: input.itemType,
      title: input.title,
      description: input.description,
      metadata: mergeGeneratedLifecycleMetadata(input.metadata, lifecycle),
      actorId: input.actorId ?? input.createdBy,
    });
    if (input.parentWorkItemId) {
      await this.linkParentWorkflow({
        workItemId: item.workItemId,
        parentWorkflowId: input.parentWorkItemId,
        parentWorkflowKind:
          input.generatedOriginKind === "runtime_graph_child"
            ? "runtime_work_graph"
            : "work_queue_generated_item",
        metadata: {
          generatedItemLifecycle: lifecycle,
          generatedOriginKind: lifecycle.originKind,
          terminalPolicy: lifecycle.terminalPolicy,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        },
      });
    }
    await this.recordLifecycleEvent({
      workItemId: item.workItemId,
      eventType: "work_item.generated_lifecycle_registered",
      actorId: input.actorId ?? input.createdBy,
      data: {
        generatedItemLifecycle: lifecycle,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      },
    });
    return {
      ...item,
      metadata: mergeGeneratedLifecycleMetadata(input.metadata, lifecycle),
      generatedItemLifecycle: lifecycle,
    };
  }

  async updateWorkItemPlanningMetadata(
    input: UpdateWorkItemPlanningMetadataInput,
  ): Promise<WorkItem> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item metadata");
    const now = this.now();
    const result = await this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkItemRow>(
        `
          UPDATE execution_platform.work_items
          SET title = $2,
              description = $3,
              metadata = $4::jsonb,
              updated_at = $5::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
        [input.workItemId, input.title, input.description ?? null, encodeJson(input.metadata), now],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`work_item_not_found:${input.workItemId}`);
      }
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.planning_metadata_updated",
        actorId: input.actorId ?? null,
        data: { title: input.title },
        eventTime: now,
      });
      return decodeItem(row);
    });
    return result;
  }

  async readWorkItemPlanningSnapshots(workItemIds: string[]): Promise<
    Map<
      string,
      {
        title: string;
        description: string | null;
        metadata: JsonValue;
        currentVersionTitle: string | null;
        currentVersionBody: string | null;
        currentVersionArtifactMetadata: JsonValue;
        dependencyKeys: string[];
      }
    >
  > {
    const boundedIds = [...new Set(workItemIds.filter((item) => item.trim().length > 0))].slice(
      0,
      500,
    );
    const snapshots = new Map<
      string,
      {
        title: string;
        description: string | null;
        metadata: JsonValue;
        currentVersionTitle: string | null;
        currentVersionBody: string | null;
        currentVersionArtifactMetadata: JsonValue;
        dependencyKeys: string[];
      }
    >();
    if (boundedIds.length === 0) {
      return snapshots;
    }
    const placeholders = boundedIds.map((_, index) => `$${index + 1}`).join(", ");
    const itemRows = await this.sql.query<WorkItemPlanningSnapshotRow>(
      `
        SELECT
          item.work_item_id,
          item.title,
          item.description,
          item.metadata,
          version.title AS current_version_title,
          version.body AS current_version_body,
          version.artifact_metadata AS current_version_artifact_metadata
        FROM execution_platform.work_items item
        LEFT JOIN execution_platform.work_item_versions version
          ON version.version_id = item.current_version_id
        WHERE item.work_item_id IN (${placeholders})
      `,
      boundedIds,
    );
    for (const row of itemRows.rows) {
      snapshots.set(row.work_item_id, {
        title: row.title,
        description: row.description,
        metadata: row.metadata,
        currentVersionTitle: row.current_version_title,
        currentVersionBody: row.current_version_body,
        currentVersionArtifactMetadata: row.current_version_artifact_metadata ?? {},
        dependencyKeys: [],
      });
    }
    const dependencyRows = await this.sql.query<WorkItemDependencyKeyRow>(
      `
        SELECT work_item_id, depends_on_work_item_id, dependency_type
        FROM execution_platform.work_item_dependencies
        WHERE work_item_id IN (${placeholders})
      `,
      boundedIds,
    );
    for (const row of dependencyRows.rows) {
      const snapshot = snapshots.get(row.work_item_id);
      if (!snapshot) {
        continue;
      }
      snapshot.dependencyKeys.push(
        `${row.work_item_id}\u0000${row.depends_on_work_item_id}\u0000${row.dependency_type}`,
      );
    }
    return snapshots;
  }

  async createWorkItemVersion(input: CreateWorkItemVersionInput): Promise<WorkItemVersion> {
    assertJsonByteLength(input.artifactMetadata, this.maxJsonBytes, "work item version metadata");
    const now = this.now();
    const result = await this.sql.withTransaction(async (tx) => {
      const versionNumberResult = await tx.query<{ next_version_number: number | string }>(
        `
          SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
          FROM execution_platform.work_item_versions
          WHERE work_item_id = $1
        `,
        [input.workItemId],
      );
      const versionNumber = Number(versionNumberResult.rows[0]?.next_version_number ?? 1);
      const versionId = input.versionId ?? randomUUID();
      const inserted = await tx.query<WorkItemVersionRow>(
        `
          INSERT INTO execution_platform.work_item_versions (
            version_id,
            work_item_id,
            version_number,
            title,
            body,
            artifact_metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
          RETURNING *
        `,
        [
          versionId,
          input.workItemId,
          versionNumber,
          input.title ?? null,
          input.body ?? null,
          encodeJson(input.artifactMetadata),
          now,
        ],
      );
      if (input.makeCurrent ?? true) {
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET current_version_id = $2, updated_at = $3::timestamptz
            WHERE work_item_id = $1
          `,
          [input.workItemId, versionId, now],
        );
      }
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.version_created",
        data: { versionId, versionNumber, makeCurrent: input.makeCurrent ?? true },
        eventTime: now,
      });
      return decodeVersion(inserted.rows[0]!);
    });
    return result;
  }

  async finalizeWorkItemVersion(input: {
    workItemId: string;
    versionId: string;
    actorId?: string | null;
  }): Promise<WorkItem> {
    const now = this.now();
    const result = await this.sql.withTransaction(async (tx) => {
      await tx.query(
        `
          UPDATE execution_platform.work_item_versions
          SET version_state = 'finalized', finalized_at = $3::timestamptz
          WHERE work_item_id = $1 AND version_id = $2
        `,
        [input.workItemId, input.versionId, now],
      );
      const updated = await tx.query<WorkItemRow>(
        `
          UPDATE execution_platform.work_items
          SET lifecycle_state = 'manual_ready',
              current_version_id = $2,
              updated_at = $3::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
        [input.workItemId, input.versionId, now],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.finalized_manual_ready",
        lifecycleState: "manual_ready",
        actorId: input.actorId ?? null,
        data: {
          versionId: input.versionId,
          executionCreated: false,
          meaning: "manual_ready",
        },
        eventTime: now,
      });
      return decodeItem(updated.rows[0]!);
    });
    return result;
  }

  async attachArtifactReference(input: AttachWorkItemArtifactInput): Promise<WorkItemArtifact> {
    if (input.uri.length > 2048) {
      throw new Error("work item artifact uri exceeds 2048 characters");
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item artifact metadata");
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkItemArtifactRow>(
        `
          INSERT INTO execution_platform.work_item_artifacts (
            artifact_id,
            work_item_id,
            version_id,
            artifact_type,
            storage_kind,
            uri,
            content_type,
            size_bytes,
            sha256,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
          RETURNING *
        `,
        [
          input.artifactId ?? randomUUID(),
          input.workItemId,
          input.versionId ?? null,
          input.artifactType,
          input.storageKind,
          input.uri,
          input.contentType ?? null,
          input.sizeBytes ?? null,
          input.sha256 ?? null,
          encodeJson(input.metadata),
          now,
        ],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        eventType: "work_item.artifact_attached",
        data: {
          artifactId: result.rows[0]!.artifact_id,
          artifactType: input.artifactType,
          versionId: input.versionId ?? null,
        },
        eventTime: now,
      });
      return decodeArtifact(result.rows[0]!);
    });
  }

  async recordLifecycleEvent(input: {
    workItemId: string;
    eventType: string;
    lifecycleState?: WorkItemLifecycleState | null;
    runId?: string | null;
    stepId?: string | null;
    actorId?: string | null;
    data?: JsonValue;
  }): Promise<WorkItemEvent> {
    assertJsonByteLength(input.data, this.maxJsonBytes, "work item event data");
    return this.recordLifecycleEventInTx(this.sql, {
      ...input,
      lifecycleState: input.lifecycleState ?? null,
      eventTime: this.now(),
    });
  }

  async updateWorkItemLifecycleState(input: {
    workItemId: string;
    lifecycleState: WorkItemLifecycleState;
    runId?: string | null;
    runtimeJobId?: string | null;
    actorId?: string | null;
    reason?: string;
  }): Promise<WorkItem> {
    if (EVIDENCE_REQUIRED_ITEM_STATES.has(input.lifecycleState)) {
      await this.assertExecutionEvidence({
        runId: input.runId ?? null,
        runtimeJobId: input.runtimeJobId ?? null,
      });
    }
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const updated = await tx.query<WorkItemRow>(
        `
          UPDATE execution_platform.work_items
          SET lifecycle_state = $2, updated_at = $3::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
        [input.workItemId, input.lifecycleState, now],
      );
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        runId: input.runId ?? null,
        eventType: "work_item.lifecycle_updated",
        lifecycleState: input.lifecycleState,
        actorId: input.actorId ?? null,
        data: {
          reason: input.reason ?? null,
          runtimeJobId: input.runtimeJobId ?? null,
        },
        eventTime: now,
      });
      return decodeItem(updated.rows[0]!);
    });
  }

  async assignWorkItem(input: {
    assignmentId?: string;
    workItemId: string;
    assigneeType: string;
    assigneeId: string;
    role?: string;
    metadata?: JsonValue;
  }): Promise<WorkItemAssignment> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item assignment metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemAssignmentRow>(
      `
        INSERT INTO execution_platform.work_item_assignments (
          assignment_id,
          work_item_id,
          assignee_type,
          assignee_id,
          role,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
        RETURNING *
      `,
      [
        input.assignmentId ?? randomUUID(),
        input.workItemId,
        input.assigneeType,
        input.assigneeId,
        input.role ?? "owner",
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.assigned",
      data: { assigneeType: input.assigneeType, assigneeId: input.assigneeId },
    });
    return decodeAssignment(result.rows[0]!);
  }

  async addDependency(input: {
    dependencyId?: string;
    workItemId: string;
    dependsOnWorkItemId: string;
    dependencyType?: string;
    metadata?: JsonValue;
  }): Promise<WorkItemDependency> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item dependency metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemDependencyRow>(
      `
        INSERT INTO execution_platform.work_item_dependencies (
          dependency_id,
          work_item_id,
          depends_on_work_item_id,
          dependency_type,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (work_item_id, depends_on_work_item_id, dependency_type) DO UPDATE
        SET metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.dependencyId ?? randomUUID(),
        input.workItemId,
        input.dependsOnWorkItemId,
        input.dependencyType ?? "blocks",
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.dependency_added",
      data: {
        dependsOnWorkItemId: input.dependsOnWorkItemId,
        dependencyType: input.dependencyType ?? "blocks",
      },
    });
    return decodeDependency(result.rows[0]!);
  }

  async linkParentWorkflow(input: {
    linkId?: string;
    workItemId: string;
    parentWorkflowId: string;
    parentWorkflowKind: string;
    metadata?: JsonValue;
  }): Promise<WorkItemParentWorkflowLink> {
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work item workflow link metadata");
    const now = this.now();
    const result = await this.sql.query<WorkItemParentWorkflowLinkRow>(
      `
        INSERT INTO execution_platform.work_item_parent_workflow_links (
          link_id,
          work_item_id,
          parent_workflow_id,
          parent_workflow_kind,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
        ON CONFLICT (work_item_id, parent_workflow_id, parent_workflow_kind) DO UPDATE
        SET metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.linkId ?? randomUUID(),
        input.workItemId,
        input.parentWorkflowId,
        input.parentWorkflowKind,
        encodeJson(input.metadata),
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: input.workItemId,
      eventType: "work_item.parent_workflow_linked",
      data: {
        parentWorkflowId: input.parentWorkflowId,
        parentWorkflowKind: input.parentWorkflowKind,
      },
    });
    return decodeParentWorkflowLink(result.rows[0]!);
  }

  async createWorkRun(input: CreateWorkRunInput): Promise<WorkRun> {
    const runState = input.runState ?? "pending";
    const runtimeJob = input.runtimeJobId ? await this.requireRuntimeJob(input.runtimeJobId) : null;
    if (EVIDENCE_REQUIRED_RUN_STATES.has(runState) && !runtimeJob) {
      throw new Error("work run state requires runtime job evidence");
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work run metadata");
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const result = await tx.query<WorkRunRow>(
        `
          INSERT INTO execution_platform.work_runs (
            run_id,
            work_item_id,
            executor_kind,
            runtime_job_id,
            runtime_job_type,
            run_state,
            metadata,
            started_at,
            completed_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz, $10::timestamptz, $10::timestamptz)
          RETURNING *
        `,
        [
          input.runId ?? randomUUID(),
          input.workItemId,
          input.executorKind,
          input.runtimeJobId ?? null,
          runtimeJob?.jobType ?? null,
          runState,
          encodeJson(input.metadata),
          runState === "running" ? now : null,
          ["succeeded", "failed", "canceled"].includes(runState) ? now : null,
          now,
        ],
      );
      const run = decodeRun(result.rows[0]!);
      await this.recordLifecycleEventInTx(tx, {
        workItemId: input.workItemId,
        runId: run.runId,
        eventType: "work_run.created",
        lifecycleState: runState === "running" ? "running" : null,
        data: {
          executorKind: input.executorKind,
          runtimeJobId: input.runtimeJobId ?? null,
          runState,
        },
        eventTime: now,
      });
      if (runState === "running") {
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET lifecycle_state = 'running', updated_at = $2::timestamptz
            WHERE work_item_id = $1
          `,
          [input.workItemId, now],
        );
      }
      return { ...run, runtimeJob };
    });
  }

  async createWorkStep(input: CreateWorkStepInput): Promise<WorkStep> {
    const stepState = input.stepState ?? "pending";
    if (EVIDENCE_REQUIRED_STEP_STATES.has(stepState) && !input.runtimeJobId) {
      throw new Error("work step state requires runtime job evidence");
    }
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
    }
    assertJsonByteLength(input.metadata, this.maxJsonBytes, "work step metadata");
    const run = await this.requireRun(input.runId);
    const now = this.now();
    const result = await this.sql.query<WorkStepRow>(
      `
        INSERT INTO execution_platform.work_steps (
          step_id,
          run_id,
          work_item_id,
          step_type,
          step_name,
          step_state,
          runtime_job_id,
          metadata,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz, $11::timestamptz, $11::timestamptz)
        RETURNING *
      `,
      [
        input.stepId ?? randomUUID(),
        input.runId,
        run.workItemId,
        input.stepType,
        input.stepName,
        stepState,
        input.runtimeJobId ?? null,
        encodeJson(input.metadata),
        stepState === "running" ? now : null,
        ["succeeded", "failed", "canceled", "skipped"].includes(stepState) ? now : null,
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: run.workItemId,
      runId: input.runId,
      stepId: result.rows[0]!.step_id,
      eventType: "work_step.created",
      data: { stepType: input.stepType, stepName: input.stepName, stepState },
    });
    return decodeStep(result.rows[0]!);
  }

  async updateWorkStep(input: {
    stepId: string;
    stepState: WorkStepState;
    result?: JsonValue | null;
    error?: JsonValue | null;
    runtimeJobId?: string | null;
  }): Promise<WorkStep> {
    if (EVIDENCE_REQUIRED_STEP_STATES.has(input.stepState) && !input.runtimeJobId) {
      throw new Error("work step state requires runtime job evidence");
    }
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
    }
    const existing = await this.requireStep(input.stepId);
    const now = this.now();
    const updated = await this.sql.query<WorkStepRow>(
      `
        UPDATE execution_platform.work_steps
        SET step_state = $2,
            result = $3::jsonb,
            error = $4::jsonb,
            runtime_job_id = COALESCE($5, runtime_job_id),
            started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, $6::timestamptz) ELSE started_at END,
            completed_at = CASE WHEN $2 IN ('succeeded', 'failed', 'canceled', 'skipped') THEN $6::timestamptz ELSE completed_at END,
            updated_at = $6::timestamptz
        WHERE step_id = $1
        RETURNING *
      `,
      [
        input.stepId,
        input.stepState,
        encodeJson(input.result ?? null),
        encodeJson(input.error ?? null),
        input.runtimeJobId ?? null,
        now,
      ],
    );
    await this.recordLifecycleEvent({
      workItemId: existing.workItemId,
      runId: existing.runId,
      stepId: input.stepId,
      eventType: "work_step.updated",
      data: { stepState: input.stepState },
    });
    return decodeStep(updated.rows[0]!);
  }

  async readWorkItemTruth(workItemId: string, eventLimit = 20): Promise<WorkItemTruth | null> {
    const itemResult = await this.sql.query<WorkItemRow>(
      "SELECT * FROM execution_platform.work_items WHERE work_item_id = $1",
      [workItemId],
    );
    const itemRow = itemResult.rows[0];
    if (!itemRow) {
      return null;
    }
    const item = decodeItem(itemRow);
    const [
      versionRows,
      artifactRows,
      eventRows,
      assignmentRows,
      dependencyRows,
      workflowRows,
      runRows,
      stepRows,
    ] = await Promise.all([
      this.sql.query<WorkItemVersionRow>(
        `
          SELECT * FROM execution_platform.work_item_versions
          WHERE work_item_id = $1
          ORDER BY version_number DESC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemArtifactRow>(
        `
          SELECT * FROM execution_platform.work_item_artifacts
          WHERE work_item_id = $1
          ORDER BY created_at ASC, artifact_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemEventRow>(
        `
          SELECT * FROM execution_platform.work_item_events
          WHERE work_item_id = $1
          ORDER BY event_time DESC, event_id DESC
          LIMIT $2
        `,
        [workItemId, eventLimit],
      ),
      this.sql.query<WorkItemAssignmentRow>(
        `
          SELECT * FROM execution_platform.work_item_assignments
          WHERE work_item_id = $1
          ORDER BY created_at ASC, assignment_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemDependencyRow>(
        `
          SELECT * FROM execution_platform.work_item_dependencies
          WHERE work_item_id = $1
          ORDER BY created_at ASC, dependency_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkItemParentWorkflowLinkRow>(
        `
          SELECT * FROM execution_platform.work_item_parent_workflow_links
          WHERE work_item_id = $1
          ORDER BY created_at ASC, link_id ASC
        `,
        [workItemId],
      ),
      this.sql.query<WorkRunRow>(
        `
          SELECT * FROM execution_platform.work_runs
          WHERE work_item_id = $1
          ORDER BY created_at DESC, run_id DESC
          LIMIT 50
        `,
        [workItemId],
      ),
      this.sql.query<WorkStepRow>(
        `
          SELECT * FROM execution_platform.work_steps
          WHERE work_item_id = $1
          ORDER BY created_at DESC, step_id DESC
          LIMIT 100
        `,
        [workItemId],
      ),
    ]);
    const versions = versionRows.rows.map(decodeVersion);
    const runs = await Promise.all(
      runRows.rows.toReversed().map(async (row) => {
        const run = decodeRun(row);
        return {
          ...run,
          runtimeJob: run.runtimeJobId ? await this.runtimeJobs.getJob(run.runtimeJobId) : null,
        };
      }),
    );
    const steps = stepRows.rows.toReversed().map(decodeStep);
    return {
      item,
      currentVersion:
        versions.find((version) => version.versionId === item.currentVersionId) ?? null,
      versions,
      artifacts: artifactRows.rows.map(decodeArtifact),
      events: eventRows.rows.map(decodeEvent),
      assignments: assignmentRows.rows.map(decodeAssignment),
      dependencies: dependencyRows.rows.map(decodeDependency),
      parentWorkflowLinks: workflowRows.rows.map(decodeParentWorkflowLink),
      runs,
      steps,
    };
  }

  private async readWorkItemTruthsForRows(
    rows: WorkItemRow[],
    eventLimit = 20,
  ): Promise<WorkItemTruth[]> {
    if (rows.length === 0) {
      return [];
    }
    const workItemIds = rows.map((row) => row.work_item_id);
    const workItemIdPlaceholders = workItemIds.map((_, index) => `$${index + 1}`).join(", ");
    const [
      versionRows,
      artifactRows,
      eventRows,
      assignmentRows,
      dependencyRows,
      workflowRows,
      runRows,
      stepRows,
    ] = await Promise.all([
      this.sql.query<WorkItemVersionRow>(
        `
          SELECT *
          FROM execution_platform.work_item_versions
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, version_number DESC
        `,
        workItemIds,
      ),
      this.sql.query<WorkItemArtifactRow>(
        `
          SELECT *
          FROM execution_platform.work_item_artifacts
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at ASC, artifact_id ASC
        `,
        workItemIds,
      ),
      this.sql.query<WorkItemEventRow>(
        `
          SELECT *
          FROM execution_platform.work_item_events
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, event_time DESC, event_id DESC
        `,
        workItemIds,
      ),
      this.sql.query<WorkItemAssignmentRow>(
        `
          SELECT *
          FROM execution_platform.work_item_assignments
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at ASC, assignment_id ASC
        `,
        workItemIds,
      ),
      this.sql.query<WorkItemDependencyRow>(
        `
          SELECT *
          FROM execution_platform.work_item_dependencies
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at ASC, dependency_id ASC
        `,
        workItemIds,
      ),
      this.sql.query<WorkItemParentWorkflowLinkRow>(
        `
          SELECT *
          FROM execution_platform.work_item_parent_workflow_links
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at ASC, link_id ASC
        `,
        workItemIds,
      ),
      this.sql.query<WorkRunRow>(
        `
          SELECT *
          FROM execution_platform.work_runs
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at DESC, run_id DESC
        `,
        workItemIds,
      ),
      this.sql.query<WorkStepRow>(
        `
          SELECT *
          FROM execution_platform.work_steps
          WHERE work_item_id IN (${workItemIdPlaceholders})
          ORDER BY work_item_id ASC, created_at DESC, step_id DESC
        `,
        workItemIds,
      ),
    ]);

    const groupByWorkItemId = <T extends { work_item_id: string }>(
      groupRows: T[],
    ): Map<string, T[]> => {
      const map = new Map<string, T[]>();
      for (const row of groupRows) {
        const group = map.get(row.work_item_id);
        if (group) {
          group.push(row);
        } else {
          map.set(row.work_item_id, [row]);
        }
      }
      return map;
    };
    const versionsByWorkItemId = groupByWorkItemId(versionRows.rows);
    const artifactsByWorkItemId = groupByWorkItemId(artifactRows.rows);
    const eventsByWorkItemId = groupByWorkItemId(eventRows.rows);
    const assignmentsByWorkItemId = groupByWorkItemId(assignmentRows.rows);
    const dependenciesByWorkItemId = groupByWorkItemId(dependencyRows.rows);
    const workflowLinksByWorkItemId = groupByWorkItemId(workflowRows.rows);
    const runsByWorkItemId = groupByWorkItemId(runRows.rows);
    const stepsByWorkItemId = groupByWorkItemId(stepRows.rows);

    return rows.map((row) => {
      const item = decodeItem(row);
      const versions = (versionsByWorkItemId.get(item.workItemId) ?? []).map(decodeVersion);
      return {
        item,
        currentVersion:
          versions.find((version) => version.versionId === item.currentVersionId) ?? null,
        versions,
        artifacts: (artifactsByWorkItemId.get(item.workItemId) ?? []).map(decodeArtifact),
        events: (eventsByWorkItemId.get(item.workItemId) ?? [])
          .slice(0, eventLimit)
          .map(decodeEvent),
        assignments: (assignmentsByWorkItemId.get(item.workItemId) ?? []).map(decodeAssignment),
        dependencies: (dependenciesByWorkItemId.get(item.workItemId) ?? []).map(decodeDependency),
        parentWorkflowLinks: (workflowLinksByWorkItemId.get(item.workItemId) ?? []).map(
          decodeParentWorkflowLink,
        ),
        runs: (runsByWorkItemId.get(item.workItemId) ?? [])
          .slice(0, 50)
          .toReversed()
          .map((runRow) => ({
            ...decodeRun(runRow),
            runtimeJob: null,
          })),
        steps: (stepsByWorkItemId.get(item.workItemId) ?? [])
          .slice(0, 100)
          .toReversed()
          .map(decodeStep),
      };
    });
  }

  async readRuntimeGraphChildTruths(
    parentWorkItemId: string,
    eventLimit = 20,
  ): Promise<WorkItemTruth[]> {
    const childRows = await this.sql.query<{ work_item_id: string }>(
      `
        SELECT child.work_item_id
        FROM execution_platform.work_item_parent_workflow_links links
        JOIN execution_platform.work_items child ON child.work_item_id = links.work_item_id
        WHERE links.parent_workflow_id = $1
          AND links.parent_workflow_kind IN ('runtime_work_graph', 'work_queue_parent_child_action_graph')
        ORDER BY child.created_at ASC, child.work_item_id ASC
      `,
      [parentWorkItemId],
    );
    const children: WorkItemTruth[] = [];
    for (const row of childRows.rows.slice(0, 200)) {
      const truth = await this.readWorkItemTruth(row.work_item_id, eventLimit);
      if (truth) {
        children.push(truth);
      }
    }
    return children;
  }

  async readWorkQueue(limit = 50): Promise<WorkQueueReadModelItem[]> {
    const result = await this.sql.query<WorkItemRow>(
      `
        SELECT * FROM execution_platform.work_items
        WHERE COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', '') <> 'debug_only'
        ORDER BY
          CASE
            WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN 0
            WHEN queue_status IN ('closed', 'superseded', 'archived') THEN 1
            ELSE 2
          END ASC,
          CASE WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN COALESCE(queue_rank, 2147483647) END ASC,
          CASE WHEN queue_status IN ('closed', 'superseded', 'archived') THEN closed_at END DESC NULLS LAST,
          updated_at DESC,
          work_item_id ASC
        LIMIT $1
      `,
      [limit],
    );
    const items: WorkQueueReadModelItem[] = [];
    let activePosition = 0;
    let closedPosition = 0;
    const truths = await this.readWorkItemTruthsForRows(result.rows, 1);
    for (const truth of truths) {
      const queueStatus = truth.item.queueStatus ?? "active";
      const isClosed = ["closed", "superseded", "archived"].includes(queueStatus);
      const position = isClosed ? ++closedPosition : ++activePosition;
      items.push({
        workItemId: truth.item.workItemId,
        itemType: truth.item.itemType,
        title: truth.item.title,
        lifecycleState: truth.item.lifecycleState,
        currentVersion: truth.currentVersion,
        assignmentCount: truth.assignments.length,
        dependencyCount: truth.dependencies.length,
        runCount: truth.runs.length,
        artifactCount: truth.artifacts.length,
        latestEvent: truth.events[0] ?? null,
        runtimeJobIds: truth.runs
          .map((run) => run.runtimeJobId)
          .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
        convergenceSlice: projectDbPrimaryWorkQueueItem({
          truth,
          activePosition: isClosed ? null : position,
          closedPosition: isClosed ? position : null,
        }),
        queueStatus,
        queuePosition: position,
        updatedAt: truth.item.updatedAt,
      });
    }
    return items;
  }

  async listDbWorkQueue(input: DbWorkQueueListInput = {}): Promise<DbWorkQueueListResult> {
    if (input.reconcileTerminalProjections !== false) {
      await this.reconcileTerminalRuntimeProjections();
    }
    const limit = clampWorkQueueLimit(input.limit);
    const offset = decodeOffsetCursor(input.cursor);
    const bucket = input.bucket ?? "active";
    const statuses =
      bucket === "active"
        ? [...ACTIVE_QUEUE_STATUSES]
        : bucket === "closed"
          ? [...CLOSED_QUEUE_STATUSES]
          : [...ACTIVE_QUEUE_STATUSES, ...CLOSED_QUEUE_STATUSES];
    const search = input.searchQuery?.trim() ?? "";
    const updatedSince = sqlDate(input.updatedSince);
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (statuses.length > 0) {
      params.push(statuses);
      conditions.push(`queue_status = ANY($${params.length}::text[])`);
    }
    if (search.length > 0) {
      params.push(`%${search.replace(/[%_]/gu, "\\$&")}%`);
      conditions.push(
        `(title ILIKE $${params.length} ESCAPE '\\' OR COALESCE(description, '') ILIKE $${params.length} ESCAPE '\\')`,
      );
    }
    if (updatedSince) {
      params.push(updatedSince);
      conditions.push(`updated_at > $${params.length}::timestamptz`);
    }
    if (input.includeGeneratedDebugItems !== true) {
      conditions.push(
        `COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', '') <> 'debug_only'`,
      );
    }
    params.push(limit, offset);
    const filteredWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.sql.query<WorkItemRow>(
      `
        SELECT * FROM execution_platform.work_items
        ${filteredWhere}
        ORDER BY
          CASE
            WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN 0
            WHEN queue_status IN ('closed', 'superseded', 'archived') THEN 1
            ELSE 2
          END ASC,
          CASE WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN COALESCE(queue_rank, 2147483647) END ASC,
          CASE WHEN queue_status IN ('closed', 'superseded', 'archived') THEN closed_at END DESC NULLS LAST,
          updated_at DESC,
          work_item_id ASC
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `,
      params,
    );
    const items: DbWorkQueueSummary[] = [];
    const truths = await this.readWorkItemTruthsForRows(result.rows, 1);
    for (const [index, truth] of truths.entries()) {
      const queueStatus = truth.item.queueStatus ?? "active";
      const isClosed = CLOSED_QUEUE_STATUSES.includes(queueStatus as never);
      const position = offset + index + 1;
      items.push({
        workItemId: truth.item.workItemId,
        itemType: truth.item.itemType,
        title: truth.item.title,
        description: truth.item.description,
        lifecycleState: truth.item.lifecycleState,
        queueStatus,
        queuePosition: position,
        queueRank: truth.item.queueRank ?? null,
        closedAt: truth.item.closedAt?.toISOString() ?? null,
        updatedAt: truth.item.updatedAt.toISOString(),
        runtimeJobIds: truth.runs
          .map((run) => run.runtimeJobId)
          .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId))
          .slice(0, 20),
        graphRef: truth.item.graphRef ?? null,
        validationRef: truth.item.validationRef ?? null,
        closeoutCapsuleRef: truth.item.closeoutCapsuleRef ?? null,
        ownerReadbackRef: truth.item.ownerReadbackRef ?? null,
        convergenceSlice: projectDbPrimaryWorkQueueItem({
          truth,
          activePosition: isClosed ? null : position,
          closedPosition: isClosed ? position : null,
        }),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        generatedItemLifecycle: truth.item.generatedItemLifecycle ?? null,
      });
    }
    const latestUpdatedAt =
      items
        .map((item) => item.updatedAt)
        .toSorted()
        .at(-1) ?? new Date(0).toISOString();
    return {
      artifactKind: "db_work_queue_list_result",
      source: "execution_platform_work_queue_db",
      bucket,
      limit,
      nextCursor: encodeOffsetCursor(offset, result.rows.length, limit),
      deltaCursor: latestUpdatedAt,
      items,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    };
  }

  async recordCloseoutProjectionReadback(
    input: RecordCloseoutProjectionReadbackInput,
  ): Promise<WorkItemArtifact> {
    if (input.accepted === false) {
      throw new Error("closeout_projection_requires_accepted_capsule");
    }
    if (!input.workItemId.trim() || !input.closeoutRef.trim()) {
      throw new Error("closeout_projection_missing_required_refs");
    }
    if (input.lifecycleMutationAllowed === true) {
      throw new Error("closeout_projection_lifecycle_mutation_rejected");
    }
    if ((input.graphRefs?.length ?? 0) > 20) {
      throw new Error("closeout_projection_graph_refs_exceeds_limit");
    }
    if ((input.validationRefs?.length ?? 0) > 20) {
      throw new Error("closeout_projection_validation_refs_exceeds_limit");
    }
    if ((input.humanDecisionRefs?.length ?? 0) > 20) {
      throw new Error("closeout_projection_human_decision_refs_exceeds_limit");
    }
    if ((input.followUpChildWorkItemIds?.length ?? 0) > 50) {
      throw new Error("closeout_projection_follow_up_child_refs_exceeds_limit_50");
    }
    if (
      input.priorityNote &&
      input.priorityNote.trim().length > MAX_CLOSEOUT_PRIORITY_NOTE_LENGTH
    ) {
      throw new Error("closeout_projection_priority_note_exceeds_limit_160");
    }

    return this.attachArtifactReference({
      artifactId: input.artifactId,
      workItemId: input.workItemId,
      artifactType: "execution_platform.closeout_projection_readback",
      storageKind: "metadata",
      uri: input.closeoutRef,
      metadata: {
        accepted: true,
        workItemId: input.workItemId,
        closeoutRef: input.closeoutRef,
        graphRefs: input.graphRefs?.slice(0, 20) ?? [],
        validationRefs: input.validationRefs?.slice(0, 20) ?? [],
        humanDecisionRefs: input.humanDecisionRefs?.slice(0, 20) ?? [],
        followUpChildWorkItemIds: input.followUpChildWorkItemIds?.slice(0, 50) ?? [],
        blockerReasonCodes: input.blockerReasonCodes?.slice(0, 10) ?? [],
        limitations: input.limitations?.slice(0, 10) ?? [],
        priorityNote: input.priorityNote
          ? input.priorityNote.trim().slice(0, MAX_CLOSEOUT_PRIORITY_NOTE_LENGTH)
          : null,
        eli5Progress: input.eli5Progress ?? null,
        nextStep: input.nextStep ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
        lifecycleMutationAllowed: input.lifecycleMutationAllowed ?? false,
      },
    });
  }

  async completeToolificationWorkQueueItemFromAdoptionGate(
    input: CompleteToolificationWorkQueueItemFromAdoptionGateInput,
  ): Promise<CompleteWorkQueueItemFromCloseoutResult> {
    if (!isToolificationWorkItemId(input.workItemId)) {
      throw new Error(
        `work_queue_toolification_closeout_not_toolification_item:${input.workItemId}`,
      );
    }
    const acceptedResults = acceptedToolificationAdoptionGateResults(
      input.toolificationAdoptionGateResults,
    );
    const accepted =
      input.accepted !== false &&
      input.toolificationAdoptionGateResults.length > 0 &&
      acceptedResults.length === input.toolificationAdoptionGateResults.length &&
      input.toolificationAdoptionGateEvidenceRefs.some((ref) => ref.trim().length > 0);
    return this.completeWorkQueueItemFromCloseout({
      ...input,
      accepted,
      toolificationAdoptionGateResults: input.toolificationAdoptionGateResults,
      toolificationAdoptionGateEvidenceRefs: input.toolificationAdoptionGateEvidenceRefs,
      artifactRefs: [
        ...(input.artifactRefs ?? []),
        ...input.toolificationAdoptionGateEvidenceRefs,
      ].slice(0, 20),
      reasonCodes: [
        ...(input.reasonCodes ?? []),
        ...(accepted
          ? ["toolification_closeout_adoption_gate_passed"]
          : ["toolification_closeout_adoption_gate_rejected"]),
      ],
    });
  }

  async completeWorkQueueItemFromCloseout(
    input: CompleteWorkQueueItemFromCloseoutInput,
  ): Promise<CompleteWorkQueueItemFromCloseoutResult> {
    if (!input.workItemId.trim() || !input.closeoutRef.trim()) {
      throw new Error("work_queue_closeout_transition_missing_required_refs");
    }
    const rawInput = input as Record<string, unknown>;
    if (
      rawInput.rawPromptStored === true ||
      rawInput.rawResponseStored === true ||
      rawInput.rawTranscriptStored === true ||
      rawInput.rawLogsStored === true ||
      rawInput.rawDbRowsStored === true
    ) {
      throw new Error("work_queue_closeout_transition_raw_storage_rejected");
    }
    if (
      rawInput.authorityGranted === true ||
      rawInput.controlsApplied === true ||
      rawInput.runtimeLifecycleMutated === true ||
      rawInput.modelPromotionPerformed === true
    ) {
      throw new Error("work_queue_closeout_transition_side_effect_rejected");
    }
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
    }

    const accepted = input.accepted !== false;
    const validationMissing = input.validationRequired === true && !input.validationRef?.trim();
    const changedFilesMissing =
      input.sourceEditRequired === true && (input.changedFileRefs?.length ?? 0) === 0;
    const providerUnavailable = input.providerUnavailable === true;
    const closeoutModelTimeout = input.closeoutModelTimeout === true;
    const toolificationAdoptionGateMissing = !toolificationAdoptionGateCanClose({
      workItemId: input.workItemId,
      results: input.toolificationAdoptionGateResults,
      evidenceRefs: input.toolificationAdoptionGateEvidenceRefs,
    });
    const mayClose =
      accepted &&
      !validationMissing &&
      !changedFilesMissing &&
      !providerUnavailable &&
      !closeoutModelTimeout &&
      !toolificationAdoptionGateMissing;
    const status: WorkItemQueueStatus = mayClose ? "closed" : "needs_review";
    const reasonCodes = [
      ...(input.reasonCodes ?? []),
      ...(accepted ? ["accepted_closeout_evidence"] : ["closeout_not_accepted"]),
      ...(validationMissing ? ["required_validation_ref_missing"] : []),
      ...(changedFilesMissing ? ["required_changed_file_evidence_missing"] : []),
      ...(providerUnavailable ? ["provider_unavailable_needs_review"] : []),
      ...(closeoutModelTimeout ? ["closeout_model_timeout_needs_review"] : []),
      ...(toolificationAdoptionGateMissing
        ? ["toolification_adoption_gate_evidence_required"]
        : isToolificationWorkItemId(input.workItemId)
          ? ["toolification_adoption_gate_evidence_accepted"]
          : []),
      ...(mayClose ? ["work_queue_item_closed_from_closeout"] : ["work_queue_item_needs_review"]),
    ]
      .filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index)
      .slice(0, 30);
    const now = this.now();

    const result: CompleteWorkQueueItemFromCloseoutResult = await this.sql.withTransaction(
      async (tx) => {
        const current = await tx.query<WorkItemRow>(
          `SELECT * FROM execution_platform.work_items WHERE work_item_id = $1`,
          [input.workItemId],
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new Error(`work_item_not_found:${input.workItemId}`);
        }
        const idempotent =
          currentRow.queue_status === status &&
          (currentRow.closed_by_closeout_ref === input.closeoutRef ||
            currentRow.closeout_capsule_ref === input.closeoutRef) &&
          (input.validationRef === undefined || currentRow.validation_ref === input.validationRef);
        const currentMetadata =
          currentRow.metadata &&
          typeof currentRow.metadata === "object" &&
          !Array.isArray(currentRow.metadata)
            ? currentRow.metadata
            : {};
        const transitionMetadata = {
          ...currentMetadata,
          dbPrimaryQueueStatus: status,
          closeoutTransitionReasonCodes: reasonCodes,
          closeoutHash: input.closeoutHash ?? null,
          closeoutRef: input.closeoutRef,
          closeoutArtifactRefs: input.artifactRefs?.slice(0, 20) ?? [],
          toolificationAdoptionGateEvidenceRefs:
            input.toolificationAdoptionGateEvidenceRefs?.slice(0, 20) ?? [],
          toolificationAdoptionGateResultRefs:
            input.toolificationAdoptionGateResults
              ?.flatMap((result) => result.evidenceRefs)
              .slice(0, 20) ?? [],
          workQueueStatusSource: "runtime_closeout_transition_api",
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        };
        const updated = await tx.query<WorkItemRow>(
          `
          UPDATE execution_platform.work_items
          SET queue_status = $2,
              closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, $3::timestamptz) ELSE closed_at END,
              closed_by_runtime_job_id = CASE WHEN $2 = 'closed' THEN $4 ELSE closed_by_runtime_job_id END,
              closed_by_closeout_ref = CASE WHEN $2 = 'closed' THEN $5 ELSE closed_by_closeout_ref END,
              closeout_capsule_ref = $5,
              validation_ref = COALESCE($6, validation_ref),
              graph_ref = COALESCE($7, graph_ref),
              owner_readback_ref = COALESCE($8, owner_readback_ref),
              metadata = $9::jsonb,
              updated_at = $3::timestamptz
          WHERE work_item_id = $1
          RETURNING *
        `,
          [
            input.workItemId,
            status,
            now,
            input.runtimeJobId ?? null,
            input.closeoutRef,
            input.validationRef ?? null,
            input.graphRef ?? null,
            input.ownerReadbackRef ?? null,
            encodeJson(transitionMetadata),
          ],
        );
        await this.recordLifecycleEventInTx(tx, {
          workItemId: input.workItemId,
          eventType: mayClose
            ? "work_item.queue_status_closed_from_closeout"
            : "work_item.queue_status_needs_review_from_closeout",
          actorId: input.actorId ?? "system:work-queue-closeout-transition",
          data: {
            queueStatus: status,
            closeoutRef: input.closeoutRef,
            runtimeJobId: input.runtimeJobId ?? null,
            validationRef: input.validationRef ?? null,
            reasonCodes,
            runtimeLifecycleMutated: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawTranscriptStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          eventTime: now,
        });
        return {
          artifactKind: "work_queue_item_closeout_transition_result",
          workItemId: input.workItemId,
          status: updated.rows[0]!.queue_status,
          closed: updated.rows[0]!.queue_status === "closed",
          idempotent,
          closeoutRef: input.closeoutRef,
          runtimeJobId: input.runtimeJobId ?? null,
          validationRef: input.validationRef ?? null,
          reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
          authorityGranted: false,
          controlsApplied: false,
          runtimeLifecycleMutated: false,
          workQueueStatusMutated: true,
          modelPromotionPerformed: false,
        };
      },
    );
    if (result.closed) {
      await this.reconcileTerminalRuntimeProjections({
        actorId: input.actorId ?? "system:work-queue-closeout-transition",
      });
    }
    return result;
  }

  async syncRuntimeGraphNodeToWorkQueue(
    input: SyncRuntimeGraphNodeToWorkQueueInput,
  ): Promise<SyncRuntimeGraphNodeToWorkQueueResult> {
    if (!input.parentWorkItemId.trim() || !input.graphId.trim() || !input.nodeId.trim()) {
      throw new Error("runtime_graph_work_queue_sync_missing_required_refs");
    }
    const evidenceRefs = (input.evidenceRefs ?? []).slice(0, 20);
    const blockerReasonCodes = (input.blockerReasonCodes ?? []).slice(0, 10);
    const now = this.now();
    const childWorkItemId = `runtime-graph:${input.graphId}:${input.nodeId}`.slice(0, 240);
    const title =
      input.title?.trim() ||
      `${input.nodeKind.replace(/_/gu, " ")} - ${input.assignedRole}`.slice(0, 180);
    const graphNodeRef =
      input.graphNodeRef ?? `runtime-work-graph://${input.graphId}/node/${input.nodeId}`;
    const queueStatus: WorkItemQueueStatus = input.queueStatus ?? "active";
    const generatedItemLifecycle = buildGeneratedWorkQueueItemLifecycle({
      originKind: "runtime_graph_child",
      terminalPolicy: input.optional === true ? "close_with_parent" : "archive_with_parent",
      parentWorkItemId: input.parentWorkItemId,
      owningRuntimeJobId: input.runtimeJobId ?? null,
      owningGraphId: input.graphId,
      owningNodeId: input.nodeId,
      createdBy: input.actorId ?? "system:runtime-work-graph-sync",
      reasonCodes: ["runtime_graph_node_materialized_to_work_queue_child"],
    });
    const metadata = {
      generatedItemLifecycle,
      generatedOriginKind: generatedItemLifecycle.originKind,
      generatedTerminalPolicy: generatedItemLifecycle.terminalPolicy,
      generatedRetentionPolicy: generatedItemLifecycle.retentionPolicy,
      generatedDebugOnly: generatedItemLifecycle.debugOnly,
      generatedOwnerVisible: generatedItemLifecycle.ownerVisible,
      actionGraph: {
        parentWorkItemId: input.parentWorkItemId,
        graphId: input.graphId,
        nodeId: input.nodeId,
        nodeKind: input.nodeKind,
        actionKind: input.nodeKind,
        assignedRole: input.assignedRole,
        assignedWorkflow: input.assignedWorkflow,
        runtimeJobId: input.runtimeJobId ?? null,
        humanTaskId: input.humanTaskId ?? null,
        graphNodeRef,
        evidenceRefs,
        blockerReasonCodes,
        queueStatus,
        optional: input.optional === true,
        planningStatusIsLifecycleState: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    } satisfies JsonValue;
    assertJsonByteLength(metadata, this.maxJsonBytes, "runtime graph work item metadata");
    return this.sql.withTransaction(async (tx) => {
      const parent = await tx.query<WorkItemRow>(
        `SELECT * FROM execution_platform.work_items WHERE work_item_id = $1 FOR UPDATE`,
        [input.parentWorkItemId],
      );
      if (!parent.rows[0]) {
        throw new Error(`parent_work_item_not_found:${input.parentWorkItemId}`);
      }
      const existing = await tx.query<WorkItemRow>(
        `SELECT * FROM execution_platform.work_items WHERE work_item_id = $1 FOR UPDATE`,
        [childWorkItemId],
      );
      const created = existing.rows.length === 0;
      const rankResult = created
        ? await tx.query<{ next_rank: number | string }>(
            `
              SELECT COALESCE(MAX(queue_rank), 0) + 1 AS next_rank
              FROM execution_platform.work_items
              WHERE queue_status IN ('active', 'blocked', 'needs_review')
            `,
          )
        : null;
      const queueRank = Number(rankResult?.rows[0]?.next_rank ?? existing.rows[0]?.queue_rank ?? 1);
      await tx.query<WorkItemRow>(
        `
          INSERT INTO execution_platform.work_items (
            work_item_id,
            item_type,
            title,
            description,
            queue_status,
            queue_rank,
            graph_ref,
            metadata,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $9, $5, $6, $7::jsonb, $8::timestamptz, $8::timestamptz)
          ON CONFLICT (work_item_id) DO UPDATE
          SET title = EXCLUDED.title,
              description = EXCLUDED.description,
              queue_status = $9,
              closed_at = CASE WHEN $9 IN ('closed', 'superseded', 'archived') THEN COALESCE(execution_platform.work_items.closed_at, $8::timestamptz) ELSE NULL END,
              graph_ref = EXCLUDED.graph_ref,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
          RETURNING *
        `,
        [
          childWorkItemId,
          `runtime_work_graph_node.${input.nodeKind}`.slice(0, 120),
          title,
          `${input.nodeKind}: ${input.assignedWorkflow}`.slice(0, 600),
          queueRank,
          graphNodeRef,
          encodeJson(metadata),
          now,
          queueStatus,
        ],
      );
      await tx.query(
        `
          INSERT INTO execution_platform.work_item_parent_workflow_links (
            link_id,
            work_item_id,
            parent_workflow_id,
            parent_workflow_kind,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, 'runtime_work_graph', $4::jsonb, $5::timestamptz)
          ON CONFLICT (work_item_id, parent_workflow_id, parent_workflow_kind) DO UPDATE
          SET metadata = EXCLUDED.metadata
        `,
        [
          randomUUID(),
          childWorkItemId,
          input.parentWorkItemId,
          encodeJson({
            graphId: input.graphId,
            nodeId: input.nodeId,
            graphNodeRef,
            planningStatusIsLifecycleState: false,
          } satisfies JsonValue),
          now,
        ],
      );
      const assignment = await tx.query(
        `
          SELECT assignment_id
          FROM execution_platform.work_item_assignments
          WHERE work_item_id = $1
            AND assignee_type = $2
            AND assignee_id = $3
            AND role = $4
          LIMIT 1
        `,
        [
          childWorkItemId,
          input.nodeKind === "human_task" ? "human" : "workflow",
          input.assignedWorkflow,
          input.assignedRole,
        ],
      );
      if (assignment.rows.length === 0) {
        await tx.query(
          `
            INSERT INTO execution_platform.work_item_assignments (
              assignment_id,
              work_item_id,
              assignee_type,
              assignee_id,
              role,
              metadata,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
          `,
          [
            randomUUID(),
            childWorkItemId,
            input.nodeKind === "human_task" ? "human" : "workflow",
            input.assignedWorkflow,
            input.assignedRole,
            encodeJson({ graphId: input.graphId, nodeId: input.nodeId } satisfies JsonValue),
            now,
          ],
        );
      }
      await this.recordLifecycleEventInTx(tx, {
        workItemId: childWorkItemId,
        eventType: created
          ? "work_item.runtime_graph_child_created"
          : "work_item.runtime_graph_child_updated",
        actorId: input.actorId ?? "system:runtime-work-graph-sync",
        data: {
          parentWorkItemId: input.parentWorkItemId,
          graphId: input.graphId,
          nodeId: input.nodeId,
          graphNodeRef,
          optional: input.optional === true,
          evidenceRefs,
          blockerReasonCodes,
          queueStatus,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
        eventTime: now,
      });
      if (this.eventStore) {
        const runtimeGraphEventTypes = deriveRuntimeGraphEventTypes({
          created,
          nodeKind: input.nodeKind,
          queueStatus,
        }).filter((eventType) =>
          created
            ? eventType !== "work_queue.child_created"
            : eventType !== "work_queue.child_updated",
        );
        for (const eventType of runtimeGraphEventTypes) {
          await this.eventStore.appendEvent(
            {
              eventType,
              workItemId: childWorkItemId,
              parentWorkItemId: input.parentWorkItemId,
              graphId: input.graphId,
              nodeId: input.nodeId,
              runtimeJobId: input.runtimeJobId ?? null,
              humanTaskId: input.humanTaskId ?? null,
              queueStatus,
              reasonCodes: blockerReasonCodes,
              evidenceRefs,
              payload: {
                nodeKind: input.nodeKind,
                assignedRole: input.assignedRole,
                assignedWorkflow: input.assignedWorkflow,
                graphNodeRef,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
              },
              idempotencyKey: `runtime-graph:${eventType}:${input.graphId}:${input.nodeId}:${queueStatus}`,
              createdAt: now,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
              rawDbRowsStored: false,
              workQueueLifecycleMutated: false,
            },
            tx,
          );
        }
      }
      return {
        artifactKind: "runtime_graph_node_work_queue_sync_result",
        parentWorkItemId: input.parentWorkItemId,
        childWorkItemId,
        graphId: input.graphId,
        nodeId: input.nodeId,
        created,
        idempotent: !created,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: false,
      };
    });
  }

  async rollupParentWorkQueueStatus(input: {
    parentWorkItemId: string;
    finalCloseoutRef?: string | null;
    actorId?: string | null;
  }): Promise<RollupParentWorkQueueStatusResult> {
    const now = this.now();
    return this.sql.withTransaction(async (tx) => {
      const parent = await tx.query<WorkItemRow>(
        `SELECT * FROM execution_platform.work_items WHERE work_item_id = $1 FOR UPDATE`,
        [input.parentWorkItemId],
      );
      if (!parent.rows[0]) {
        throw new Error(`parent_work_item_not_found:${input.parentWorkItemId}`);
      }
      const childRows = await tx.query<WorkItemRow>(
        `
          SELECT child.*
          FROM execution_platform.work_item_parent_workflow_links links
          JOIN execution_platform.work_items child ON child.work_item_id = links.work_item_id
          WHERE links.parent_workflow_id = $1
            AND links.parent_workflow_kind IN ('runtime_work_graph', 'work_queue_parent_child_action_graph')
          ORDER BY child.created_at, child.work_item_id
        `,
        [input.parentWorkItemId],
      );
      const optionalChildWorkItemIds: string[] = [];
      const requiredChildren: WorkItemRow[] = [];
      for (const child of childRows.rows) {
        const metadata =
          child.metadata && typeof child.metadata === "object" && !Array.isArray(child.metadata)
            ? (child.metadata as Record<string, unknown>)
            : {};
        const actionGraph =
          metadata.actionGraph &&
          typeof metadata.actionGraph === "object" &&
          !Array.isArray(metadata.actionGraph)
            ? (metadata.actionGraph as Record<string, unknown>)
            : {};
        if (actionGraph.optional === true) {
          optionalChildWorkItemIds.push(child.work_item_id);
        } else {
          requiredChildren.push(child);
        }
      }
      const requiredStatuses = new Set(requiredChildren.map((child) => child.queue_status));
      const nextStatus: WorkItemQueueStatus =
        requiredChildren.length === 0
          ? parent.rows[0].queue_status
          : [...requiredStatuses].some(
                (status) => status === "needs_review" || status === "blocked",
              )
            ? "needs_review"
            : requiredChildren.every((child) =>
                  CLOSED_QUEUE_STATUSES.includes(
                    child.queue_status as (typeof CLOSED_QUEUE_STATUSES)[number],
                  ),
                )
              ? "closed"
              : "active";
      const changed = parent.rows[0].queue_status !== nextStatus;
      const reasonCodes = [
        "parent_rollup_evaluated",
        ...(requiredChildren.length === 0 ? ["parent_rollup_no_required_children"] : []),
        ...(nextStatus === "closed" ? ["parent_rollup_required_children_closed"] : []),
        ...(nextStatus === "needs_review" ? ["parent_rollup_required_child_needs_review"] : []),
        ...(nextStatus === "active" ? ["parent_rollup_required_children_active"] : []),
      ].slice(0, 20);
      if (changed) {
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET queue_status = $2,
                closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, $3::timestamptz) ELSE NULL END,
                closed_by_closeout_ref = CASE WHEN $2 = 'closed' THEN COALESCE($4, closed_by_closeout_ref) ELSE closed_by_closeout_ref END,
                closeout_capsule_ref = COALESCE($4, closeout_capsule_ref),
                updated_at = $3::timestamptz
            WHERE work_item_id = $1
          `,
          [input.parentWorkItemId, nextStatus, now, input.finalCloseoutRef ?? null],
        );
        await this.recordLifecycleEventInTx(tx, {
          workItemId: input.parentWorkItemId,
          eventType: "work_item.parent_rollup_status_updated",
          actorId: input.actorId ?? "system:work-queue-parent-rollup",
          data: {
            queueStatus: nextStatus,
            requiredChildWorkItemIds: requiredChildren.map((child) => child.work_item_id),
            optionalChildWorkItemIds,
            reasonCodes,
            runtimeLifecycleMutated: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
          },
          eventTime: now,
        });
      }
      return {
        artifactKind: "work_queue_parent_rollup_result",
        parentWorkItemId: input.parentWorkItemId,
        childWorkItemIds: childRows.rows.map((child) => child.work_item_id),
        requiredChildWorkItemIds: requiredChildren.map((child) => child.work_item_id),
        optionalChildWorkItemIds,
        queueStatus: nextStatus,
        changed,
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        runtimeLifecycleMutated: false,
        workQueueStatusMutated: changed,
      };
    });
  }

  async reconcileTerminalRuntimeProjections(
    input: {
      actorId?: string | null;
    } = {},
  ): Promise<ReconcileTerminalRuntimeProjectionsResult> {
    const actorId = input.actorId ?? "system:work-queue-terminal-projection-reconcile";
    const now = this.now();
    const staleChildren = await this.sql.query<
      WorkItemRow & {
        parent_work_item_id: string;
        parent_queue_status: WorkItemQueueStatus;
        parent_closeout_ref: string | null;
        parent_runtime_job_id: string | null;
      }
    >(
      `
        SELECT child.*,
               parent.work_item_id AS parent_work_item_id,
               parent.queue_status AS parent_queue_status,
               parent.closed_by_closeout_ref AS parent_closeout_ref,
               parent.closed_by_runtime_job_id AS parent_runtime_job_id
        FROM execution_platform.work_items child
        JOIN execution_platform.work_item_parent_workflow_links links
          ON links.work_item_id = child.work_item_id
        JOIN execution_platform.work_items parent
          ON parent.work_item_id = links.parent_workflow_id
        WHERE child.queue_status IN ('active', 'blocked', 'needs_review')
          AND child.work_item_id LIKE 'runtime-graph:%'
          AND parent.queue_status IN ('closed', 'superseded', 'archived')
        ORDER BY child.queue_rank ASC NULLS LAST, child.updated_at DESC
      `,
    );
    const terminalExecutionItems = await this.sql.query<
      WorkItemRow & {
        run_id: string;
        runtime_job_id: string;
        runtime_job_state: "failed" | "canceled" | "timed_out";
        cancellation_reason: string | null;
      }
    >(
      `
        SELECT wi.*,
               wr.run_id,
               wr.runtime_job_id,
               rj.state AS runtime_job_state,
               rj.cancellation_reason
        FROM execution_platform.work_items wi
        JOIN execution_platform.work_runs wr ON wr.work_item_id = wi.work_item_id
        JOIN execution_platform.runtime_jobs rj ON rj.job_id = wr.runtime_job_id
        WHERE wi.queue_status IN ('active', 'blocked', 'needs_review')
          AND wi.item_type = 'execution_workflow'
          AND rj.state IN ('failed', 'canceled', 'timed_out')
        ORDER BY wi.queue_rank ASC NULLS LAST, wi.updated_at DESC
      `,
    );
    const generatedDebugItems = await this.sql.query<WorkItemRow>(
      `
        SELECT *
        FROM execution_platform.work_items
        WHERE queue_status IN ('active', 'blocked', 'needs_review')
          AND COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', metadata->>'terminalPolicy', '') = 'debug_only'
        ORDER BY queue_rank ASC NULLS LAST, updated_at DESC
      `,
    );
    const graphIds = [
      ...new Set(
        staleChildren.rows
          .map((row) => {
            const metadata = readRecord(row.metadata);
            const actionGraph = readRecord((metadata.actionGraph ?? null) as JsonValue);
            return typeof actionGraph.graphId === "string" ? actionGraph.graphId : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const graphTerminalStatusById = new Map<string, "succeeded" | "canceled">();
    for (const row of staleChildren.rows) {
      const metadata = readRecord(row.metadata);
      const actionGraph = readRecord((metadata.actionGraph ?? null) as JsonValue);
      const graphId = typeof actionGraph.graphId === "string" ? actionGraph.graphId : null;
      if (!graphId) {
        continue;
      }
      const terminalStatus = row.parent_queue_status === "closed" ? "succeeded" : "canceled";
      const current = graphTerminalStatusById.get(graphId);
      graphTerminalStatusById.set(
        graphId,
        current === "canceled" || terminalStatus === "canceled" ? "canceled" : terminalStatus,
      );
    }
    const rootJobs =
      graphIds.length === 0
        ? []
        : (
            await this.sql.query<{ graph_id: string; root_runtime_job_id: string }>(
              `
                SELECT graph_id, root_runtime_job_id
                FROM execution_platform.runtime_work_graphs
                WHERE graph_id = ANY($1::text[])
                  AND root_runtime_job_id IS NOT NULL
              `,
              [graphIds],
            )
          ).rows;
    const canceledRootRuntimeJobIds: string[] = [];
    for (const row of rootJobs) {
      const canceled = await this.runtimeJobs.cancelJob(
        row.root_runtime_job_id,
        "work_queue_terminal_projection_reconcile_parent_terminal",
      );
      if (canceled) {
        canceledRootRuntimeJobIds.push(row.root_runtime_job_id);
      }
    }
    const archivedRuntimeGraphChildWorkItemIds: string[] = [];
    const archivedTerminalExecutionWorkItemIds: string[] = [];
    const archivedGeneratedDebugWorkItemIds: string[] = [];
    const archivedIds = new Set<string>();
    await this.sql.withTransaction(async (tx) => {
      for (const row of staleChildren.rows) {
        const currentMetadata = readRecord(row.metadata);
        const parentIsClosed = row.parent_queue_status === "closed";
        const metadata = {
          ...currentMetadata,
          terminalProjectionReconciliation: {
            reason: "generated runtime child projection outlived terminal parent",
            parentWorkItemId: row.parent_work_item_id,
            parentQueueStatus: row.parent_queue_status,
            parentCloseoutRef: row.parent_closeout_ref,
            parentRuntimeJobId: row.parent_runtime_job_id,
            previousQueueStatus: row.queue_status,
            reconciledAt: now.toISOString(),
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        } satisfies JsonValue;
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET queue_status = 'archived',
                lifecycle_state = CASE WHEN lifecycle_state = 'running' THEN 'canceled' ELSE lifecycle_state END,
                closed_at = COALESCE(closed_at, $2::timestamptz),
                closed_by_closeout_ref = COALESCE(closed_by_closeout_ref, $3),
                metadata = $4::jsonb,
                updated_at = $2::timestamptz
            WHERE work_item_id = $1
          `,
          [
            row.work_item_id,
            now,
            parentIsClosed ? row.parent_closeout_ref : null,
            encodeJson(metadata),
          ],
        );
        await this.recordLifecycleEventInTx(tx, {
          workItemId: row.work_item_id,
          eventType: "work_item.terminal_runtime_child_projection_archived",
          actorId,
          data: {
            parentWorkItemId: row.parent_work_item_id,
            parentQueueStatus: row.parent_queue_status,
            parentCloseoutRef: row.parent_closeout_ref,
            reasonCodes: [
              "parent_work_item_terminal",
              "generated_child_projection_stale",
              "removed_from_active_queue",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          eventTime: now,
        });
        archivedRuntimeGraphChildWorkItemIds.push(row.work_item_id);
        archivedIds.add(row.work_item_id);
      }
      if (graphIds.length > 0) {
        const graphMetadata = {
          terminalProjectionReconciliation: {
            reason: "terminal parent work item reconciled generated child projections",
            reconciledAt: now.toISOString(),
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
        } satisfies JsonValue;
        for (const graphId of graphIds) {
          const graphRow = await tx.query<{ metadata: JsonValue }>(
            "SELECT metadata FROM execution_platform.runtime_work_graphs WHERE graph_id = $1",
            [graphId],
          );
          const mergedGraphMetadata = {
            ...readRecord(graphRow.rows[0]?.metadata),
            ...graphMetadata,
          } satisfies JsonValue;
          await tx.query(
            `
              UPDATE execution_platform.runtime_work_graphs
              SET graph_status = CASE WHEN graph_status = 'running' THEN $2 ELSE graph_status END,
                  metadata = $3::jsonb,
                  updated_at = $4::timestamptz
              WHERE graph_id = $1
            `,
            [
              graphId,
              graphTerminalStatusById.get(graphId) ?? "canceled",
              encodeJson(mergedGraphMetadata),
              now,
            ],
          );
        }
        for (const graphId of graphIds) {
          const nodeRows = await tx.query<{ node_id: string; metadata: JsonValue }>(
            `
              SELECT node_id, metadata
              FROM execution_platform.runtime_work_graph_nodes
              WHERE graph_id = $1
                AND node_status IN ('planned', 'running', 'needs_review')
            `,
            [graphId],
          );
          for (const nodeRow of nodeRows.rows) {
            const mergedNodeMetadata = {
              ...readRecord(nodeRow.metadata),
              ...graphMetadata,
            } satisfies JsonValue;
            await tx.query(
              `
                UPDATE execution_platform.runtime_work_graph_nodes
                SET node_status = 'skipped',
                    metadata = $2::jsonb,
                    completed_at = COALESCE(completed_at, $3::timestamptz),
                    updated_at = $3::timestamptz
                WHERE node_id = $1
              `,
              [nodeRow.node_id, encodeJson(mergedNodeMetadata), now],
            );
          }
        }
      }
      for (const row of terminalExecutionItems.rows) {
        if (archivedIds.has(row.work_item_id)) {
          continue;
        }
        const currentMetadata = readRecord(row.metadata);
        const terminalPolicy = readGeneratedTerminalPolicy(row.metadata);
        const debugOnly = terminalPolicy === "debug_only" || isGeneratedDebugOnly(row.metadata);
        const queueStatus: WorkItemQueueStatus =
          debugOnly || row.runtime_job_state === "canceled" ? "archived" : "needs_review";
        const lifecycleState: WorkItemLifecycleState =
          row.runtime_job_state === "canceled" ? "canceled" : "failed";
        const metadata = {
          ...currentMetadata,
          terminalProjectionReconciliation: {
            reason: "generated execution projection outlived terminal runtime job",
            runtimeJobId: row.runtime_job_id,
            runtimeJobState: row.runtime_job_state,
            cancellationReason: row.cancellation_reason,
            previousQueueStatus: row.queue_status,
            reconciledAt: now.toISOString(),
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        } satisfies JsonValue;
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET queue_status = $2,
                lifecycle_state = $3,
                closed_at = CASE WHEN $2 = 'archived' THEN COALESCE(closed_at, $4::timestamptz) ELSE closed_at END,
                closed_by_runtime_job_id = COALESCE(closed_by_runtime_job_id, $5),
                metadata = $6::jsonb,
                updated_at = $4::timestamptz
            WHERE work_item_id = $1
          `,
          [
            row.work_item_id,
            queueStatus,
            lifecycleState,
            now,
            row.runtime_job_id,
            encodeJson(metadata),
          ],
        );
        await tx.query(
          `
            UPDATE execution_platform.work_runs
            SET run_state = $2,
                completed_at = COALESCE(completed_at, $3::timestamptz),
                updated_at = $3::timestamptz
            WHERE run_id = $1
          `,
          [row.run_id, row.runtime_job_state === "canceled" ? "canceled" : "failed", now],
        );
        await this.recordLifecycleEventInTx(tx, {
          workItemId: row.work_item_id,
          runId: row.run_id,
          eventType: "work_item.terminal_execution_projection_reconciled",
          lifecycleState,
          actorId,
          data: {
            runtimeJobId: row.runtime_job_id,
            runtimeJobState: row.runtime_job_state,
            queueStatus,
            reasonCodes: [
              "runtime_job_terminal",
              "generated_execution_projection_stale",
              queueStatus === "archived"
                ? "removed_from_active_queue"
                : "kept_needs_review_for_failed_execution",
              ...(debugOnly ? ["generated_debug_item_archived"] : []),
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          eventTime: now,
        });
        archivedTerminalExecutionWorkItemIds.push(row.work_item_id);
        if (queueStatus === "archived") {
          archivedIds.add(row.work_item_id);
        }
      }
      for (const row of generatedDebugItems.rows) {
        if (archivedIds.has(row.work_item_id)) {
          continue;
        }
        const currentMetadata = readRecord(row.metadata);
        const metadata = {
          ...currentMetadata,
          terminalProjectionReconciliation: {
            reason: "generated debug item is not owner roadmap work",
            previousQueueStatus: row.queue_status,
            reconciledAt: now.toISOString(),
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
        } satisfies JsonValue;
        await tx.query(
          `
            UPDATE execution_platform.work_items
            SET queue_status = 'archived',
                lifecycle_state = CASE WHEN lifecycle_state = 'running' THEN 'canceled' ELSE lifecycle_state END,
                closed_at = COALESCE(closed_at, $2::timestamptz),
                metadata = $3::jsonb,
                updated_at = $2::timestamptz
            WHERE work_item_id = $1
          `,
          [row.work_item_id, now, encodeJson(metadata)],
        );
        await this.recordLifecycleEventInTx(tx, {
          workItemId: row.work_item_id,
          eventType: "work_item.generated_debug_projection_archived",
          actorId,
          data: {
            previousQueueStatus: row.queue_status,
            reasonCodes: [
              "generated_debug_only_item",
              "not_owner_roadmap_work",
              "removed_from_active_queue",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          eventTime: now,
        });
        archivedGeneratedDebugWorkItemIds.push(row.work_item_id);
        archivedIds.add(row.work_item_id);
      }
    });
    return {
      artifactKind: "work_queue_terminal_runtime_projection_reconciliation_result",
      archivedRuntimeGraphChildWorkItemIds,
      archivedTerminalExecutionWorkItemIds,
      archivedGeneratedDebugWorkItemIds,
      canceledRootRuntimeJobIds,
      updatedGraphIds: graphIds,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      runtimeLifecycleMutated: false,
    };
  }

  async projectCanonicalRuntimeQueue(limit = 200): Promise<CanonicalRuntimeQueueProjection> {
    await this.reconcileTerminalRuntimeProjections();
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const items = await this.sql.query<WorkItemRow>(
      `
        SELECT * FROM execution_platform.work_items
        WHERE COALESCE(metadata->'generatedItemLifecycle'->>'terminalPolicy', '') <> 'debug_only'
        ORDER BY
          CASE
            WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN 0
            WHEN queue_status IN ('closed', 'superseded', 'archived') THEN 1
            ELSE 2
          END ASC,
          CASE WHEN queue_status IN ('active', 'blocked', 'needs_review') THEN COALESCE(queue_rank, 2147483647) END ASC,
          CASE WHEN queue_status IN ('closed', 'superseded', 'archived') THEN closed_at END DESC NULLS LAST,
          updated_at DESC,
          work_item_id ASC
        LIMIT $1
      `,
      [boundedLimit],
    );
    const truths = await this.readWorkItemTruthsForRows(items.rows, 50);
    return buildCanonicalRuntimeQueueProjection(truths);
  }

  private async requireRuntimeJob(runtimeJobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      throw new Error(`runtime job evidence not found: ${runtimeJobId}`);
    }
    return job;
  }

  private async assertExecutionEvidence(input: {
    runId: string | null;
    runtimeJobId: string | null;
  }): Promise<void> {
    if (input.runtimeJobId) {
      await this.requireRuntimeJob(input.runtimeJobId);
      return;
    }
    if (input.runId) {
      const run = await this.requireRun(input.runId);
      if (run.runtimeJobId) {
        await this.requireRuntimeJob(run.runtimeJobId);
        return;
      }
    }
    throw new Error("work item lifecycle state requires durable run or runtime job evidence");
  }

  private async requireRun(runId: string): Promise<WorkRun> {
    const result = await this.sql.query<WorkRunRow>(
      "SELECT * FROM execution_platform.work_runs WHERE run_id = $1",
      [runId],
    );
    if (!result.rows[0]) {
      throw new Error(`work run not found: ${runId}`);
    }
    return decodeRun(result.rows[0]);
  }

  private async requireStep(stepId: string): Promise<WorkStep> {
    const result = await this.sql.query<WorkStepRow>(
      "SELECT * FROM execution_platform.work_steps WHERE step_id = $1",
      [stepId],
    );
    if (!result.rows[0]) {
      throw new Error(`work step not found: ${stepId}`);
    }
    return decodeStep(result.rows[0]);
  }

  private async recordLifecycleEventInTx(
    tx: SqlClient,
    input: {
      workItemId: string;
      eventType: string;
      lifecycleState?: WorkItemLifecycleState | null;
      runId?: string | null;
      stepId?: string | null;
      actorId?: string | null;
      data?: JsonValue;
      eventTime: Date;
    },
  ): Promise<WorkItemEvent> {
    assertJsonByteLength(input.data, this.maxJsonBytes, "work item event data");
    const result = await tx.query<WorkItemEventRow>(
      `
        INSERT INTO execution_platform.work_item_events (
          event_id,
          work_item_id,
          run_id,
          step_id,
          event_type,
          lifecycle_state,
          event_time,
          actor_id,
          data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9::jsonb)
        RETURNING *
      `,
      [
        randomUUID(),
        input.workItemId,
        input.runId ?? null,
        input.stepId ?? null,
        input.eventType,
        input.lifecycleState ?? null,
        input.eventTime,
        input.actorId ?? null,
        encodeJson(input.data),
      ],
    );
    const event = decodeEvent(result.rows[0]!);
    const workQueueEventType = mapLifecycleEventToWorkQueueEvent(input);
    if (workQueueEventType && this.eventStore) {
      const data = readRecord(input.data);
      await this.eventStore.appendEvent(
        {
          eventType: workQueueEventType,
          workItemId: input.workItemId,
          parentWorkItemId:
            typeof data.parentWorkItemId === "string" ? data.parentWorkItemId : null,
          graphId: typeof data.graphId === "string" ? data.graphId : null,
          nodeId: typeof data.nodeId === "string" ? data.nodeId : null,
          runtimeJobId: typeof data.runtimeJobId === "string" ? data.runtimeJobId : null,
          humanTaskId: typeof data.humanTaskId === "string" ? data.humanTaskId : null,
          queueStatus:
            typeof data.queueStatus === "string" ? (data.queueStatus as WorkItemQueueStatus) : null,
          reasonCodes: readStringArrayFromRecord(data, "reasonCodes"),
          evidenceRefs: readStringArrayFromRecord(data, "evidenceRefs"),
          payload: {
            lifecycleEventId: event.eventId,
            lifecycleEventType: input.eventType,
            lifecycleState: input.lifecycleState ?? null,
            actorId: input.actorId ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            rawDbRowsStored: false,
          },
          idempotencyKey: `lifecycle:${event.eventId}`,
          createdAt: input.eventTime,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          workQueueLifecycleMutated: false,
        },
        tx,
      );
    }
    return event;
  }
}
