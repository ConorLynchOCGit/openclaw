import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";

export const WORK_ITEM_LIFECYCLE_STATES = [
  "draft",
  "manual_ready",
  "blocked",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type WorkItemLifecycleState = (typeof WORK_ITEM_LIFECYCLE_STATES)[number];

export const WORK_RUN_STATES = ["pending", "running", "succeeded", "failed", "canceled"] as const;

export type WorkRunState = (typeof WORK_RUN_STATES)[number];

export const WORK_STEP_STATES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "skipped",
] as const;

export type WorkStepState = (typeof WORK_STEP_STATES)[number];

export type WorkRunExecutorKind =
  | "runtime_job"
  | "model_task"
  | "db_operation"
  | "future_executor_placeholder";

export type WorkItem = {
  workItemId: string;
  itemType: string;
  title: string;
  description: string | null;
  lifecycleState: WorkItemLifecycleState;
  currentVersionId: string | null;
  metadata: JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkItemVersion = {
  versionId: string;
  workItemId: string;
  versionNumber: number;
  versionState: "draft" | "finalized";
  title: string | null;
  body: string | null;
  artifactMetadata: JsonValue;
  createdAt: Date;
  finalizedAt: Date | null;
};

export type WorkItemArtifact = {
  artifactId: string;
  workItemId: string;
  versionId: string | null;
  artifactType: string;
  storageKind: string;
  uri: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  metadata: JsonValue;
  createdAt: Date;
};

export type WorkItemEvent = {
  eventId: string;
  workItemId: string;
  runId: string | null;
  stepId: string | null;
  eventType: string;
  lifecycleState: WorkItemLifecycleState | null;
  eventTime: Date;
  actorId: string | null;
  data: JsonValue;
};

export type WorkRun = {
  runId: string;
  workItemId: string;
  executorKind: WorkRunExecutorKind;
  runtimeJobId: string | null;
  runtimeJobType: string | null;
  runState: WorkRunState;
  metadata: JsonValue;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  runtimeJob?: RuntimeJob | null;
};

export type WorkStep = {
  stepId: string;
  runId: string;
  workItemId: string;
  stepType: string;
  stepName: string;
  stepState: WorkStepState;
  runtimeJobId: string | null;
  metadata: JsonValue;
  result: JsonValue | null;
  error: JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkItemAssignment = {
  assignmentId: string;
  workItemId: string;
  assigneeType: string;
  assigneeId: string;
  role: string;
  metadata: JsonValue;
  createdAt: Date;
};

export type WorkItemDependency = {
  dependencyId: string;
  workItemId: string;
  dependsOnWorkItemId: string;
  dependencyType: string;
  metadata: JsonValue;
  createdAt: Date;
};

export type WorkItemParentWorkflowLink = {
  linkId: string;
  workItemId: string;
  parentWorkflowId: string;
  parentWorkflowKind: string;
  metadata: JsonValue;
  createdAt: Date;
};

export const WORK_QUEUE_CONVERGENCE_SLICE_PLANNING_STATUSES = [
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "needs_review",
  "completed",
  "superseded",
] as const;

export type WorkQueueConvergenceSlicePlanningStatus =
  (typeof WORK_QUEUE_CONVERGENCE_SLICE_PLANNING_STATUSES)[number];

export type WorkQueueConvergenceSliceProjection = {
  artifactKind: "work_queue_convergence_slice_projection";
  trackerVersion: "openclaw-platform-convergence.v3" | "openclaw-platform-convergence.v4";
  trackerKind: "historical_slice" | "active_queue_item" | "unknown";
  sliceId: string;
  title: string;
  track: string;
  wave: string;
  planningStatus: WorkQueueConvergenceSlicePlanningStatus;
  priority: number;
  legacySliceId: string | null;
  previousSliceId: string | null;
  historicalSliceId: string | null;
  activeQueueId: string | null;
  activeQueuePosition: number | null;
  supersededByActiveQueueId: string | null;
  dependsOnSliceIds: string[];
  dependsOnActiveQueueIds: string[];
  dependsOnHistoricalSliceIds: string[];
  sourceDocRefs: string[];
  artifactRefs: string[];
  runtimeJobRefs: string[];
  blockerReasonCodes: string[];
  nextAction: string | null;
  ownerSystemArea: string;
  createdAt: string | null;
  updatedAt: string | null;
  planningStateSource: "work_item_metadata";
  runtimeState: {
    lifecycleState: WorkItemLifecycleState;
    runCount: number;
    runtimeJobIds: string[];
    lifecycleTruthSource: "work_queue_repository";
    planningStatusIsLifecycleState: false;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkItemTruth = {
  item: WorkItem;
  currentVersion: WorkItemVersion | null;
  versions: WorkItemVersion[];
  artifacts: WorkItemArtifact[];
  events: WorkItemEvent[];
  assignments: WorkItemAssignment[];
  dependencies: WorkItemDependency[];
  parentWorkflowLinks: WorkItemParentWorkflowLink[];
  runs: WorkRun[];
  steps: WorkStep[];
};

export type WorkQueueReadModelItem = {
  workItemId: string;
  itemType: string;
  title: string;
  lifecycleState: WorkItemLifecycleState;
  currentVersion: WorkItemVersion | null;
  assignmentCount: number;
  dependencyCount: number;
  runCount: number;
  artifactCount: number;
  latestEvent: WorkItemEvent | null;
  runtimeJobIds: string[];
  convergenceSlice: WorkQueueConvergenceSliceProjection | null;
  updatedAt: Date;
};
